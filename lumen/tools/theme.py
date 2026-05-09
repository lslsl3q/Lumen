"""工具：Design Token 主题控制

AI 可通过此工具查看、切换、微调、保存视觉主题。
"""

import asyncio
import logging

from lumen.tool import success_result, error_result, ErrorCode
from lumen.services.storage import theme as theme_storage
from lumen.services import theme as theme_service

logger = logging.getLogger(__name__)


async def _push_theme_update(tokens: dict, theme_id: str = ""):
    """通过 WebSocket 推送主题更新到前端"""
    try:
        from lumen.services.ws_manager import get_ws_manager
        wsm = get_ws_manager()
        await wsm.push({
            "type": "theme_update",
            "theme_id": theme_id,
            "tokens": tokens,
        })
    except Exception as e:
        logger.warning(f"Failed to push theme update: {e}")


def _schedule_push(tokens: dict, theme_id: str = ""):
    """调度异步推送（从同步上下文调用）"""
    try:
        asyncio.get_running_loop()
        asyncio.ensure_future(_push_theme_update(tokens, theme_id))
    except RuntimeError:
        pass


def execute(params: dict, command: str = "") -> dict:
    """主题系统工具入口，路由到具体命令"""

    if command == "list":
        return _theme_list(params)
    elif command == "get":
        return _theme_get(params)
    elif command == "apply":
        return _theme_apply(params)
    elif command == "save":
        return _theme_save(params)
    else:
        return error_result(
            "theme",
            ErrorCode.PARAM_INVALID,
            f"未知命令: {command}，可用命令: list, get, apply, save",
            {"provided_command": command}
        )


def _theme_list(params: dict) -> dict:
    """列出所有可用主题"""
    try:
        themes = theme_storage.list_themes()
        current_id = theme_storage.get_current_theme_id()

        # 标记当前主题
        for theme in themes:
            theme["is_current"] = theme["id"] == current_id

        return success_result("theme", {"themes": themes, "current_id": current_id})
    except Exception as e:
        return error_result(
            "theme",
            ErrorCode.EXEC_FAILED,
            f"列出主题失败: {e}",
            {}
        )


def _theme_get(params: dict) -> dict:
    """获取主题的完整 token 值"""
    theme_id = params.get("theme_id", "")

    try:
        # 默认获取当前主题
        if not theme_id:
            theme_id = theme_storage.get_current_theme_id()

        full_theme = theme_service.get_full_theme(theme_id)

        if not full_theme:
            return error_result(
                "theme",
                ErrorCode.EXEC_FAILED,
                f"主题不存在: {theme_id}",
                {"theme_id": theme_id}
            )

        return success_result("theme", {"theme_id": theme_id, "tokens": full_theme})
    except Exception as e:
        return error_result(
            "theme",
            ErrorCode.EXEC_FAILED,
            f"获取主题失败: {e}",
            {"theme_id": theme_id}
        )


def _theme_apply(params: dict) -> dict:
    """应用主题（切换/微调/生成）

    三种模式：
    1. 仅 switch：提供 theme_id，切换主题
    2. 仅 override：提供 tokens，微调当前主题
    3. 同时提供：切换主题后再微调
    """
    theme_id = params.get("theme_id", "")
    tokens = params.get("tokens", {})

    try:
        # 模式 1 & 3：切换主题
        if theme_id:
            full_theme = theme_service.apply_theme_switch(theme_id)

            # 模式 3：切换后再微调
            if tokens:
                override_result = theme_service.apply_token_overrides(tokens)
                _schedule_push(override_result["applied"], theme_id)
                return success_result(
                    "theme",
                    {
                        "action": "switch_and_override",
                        "theme_id": theme_id,
                        "tokens": full_theme,
                        "overrides_applied": override_result["applied"],
                        "errors": override_result["errors"],
                    }
                )

            _schedule_push(full_theme, theme_id)
            return success_result(
                "theme",
                {"action": "switch", "theme_id": theme_id, "tokens": full_theme}
            )

        # 模式 2：仅微调
        elif tokens:
            override_result = theme_service.apply_token_overrides(tokens)
            current_id = theme_storage.get_current_theme_id()
            _schedule_push(override_result["applied"], current_id)

            return success_result(
                "theme",
                {
                    "action": "override",
                    "theme_id": current_id,
                    "overrides_applied": override_result["applied"],
                    "errors": override_result["errors"],
                }
            )

        else:
            return error_result(
                "theme",
                ErrorCode.PARAM_EMPTY,
                "请提供 theme_id（切换主题）或 tokens（微调）",
                {"provided_params": params}
            )

    except ValueError as e:
        return error_result(
            "theme",
            ErrorCode.PARAM_INVALID,
            str(e),
            params
        )
    except Exception as e:
        return error_result(
            "theme",
            ErrorCode.EXEC_FAILED,
            f"应用主题失败: {e}",
            params
        )


def _theme_save(params: dict) -> dict:
    """保存当前主题为新主题"""
    name = params.get("name", "")
    description = params.get("description", "")

    if not name:
        return error_result(
            "theme",
            ErrorCode.PARAM_EMPTY,
            "请提供新主题名称（name 参数）",
            params
        )

    try:
        new_theme = theme_service.save_as_new_theme(name, description)
        _schedule_push(new_theme.get("tokens", {}), new_theme.get("id", ""))
        return success_result("theme", {"action": "save", "theme": new_theme})
    except Exception as e:
        return error_result(
            "theme",
            ErrorCode.EXEC_FAILED,
            f"保存主题失败: {e}",
            params
        )
