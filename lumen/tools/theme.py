"""工具：Design Token 主题控制

AI 可通过此工具查看、切换、微调、保存视觉主题。
"""

from lumen.tool import success_result, error_result, ErrorCode
from lumen.services.storage import theme as theme_storage
from lumen.services import theme as theme_service


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

        return success_result(
            "theme",
            f"共 {len(themes)} 个主题，当前: {current_id}",
            {"themes": themes}
        )
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
                ErrorCode.NOT_FOUND,
                f"主题不存在: {theme_id}",
                {"theme_id": theme_id}
            )

        return success_result(
            "theme",
            f"主题 {theme_id} 的完整 token 值",
            {"theme_id": theme_id, "tokens": full_theme}
        )
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
            result_msg = f"已切换到主题: {theme_id}"

            # 模式 3：切换后再微调
            if tokens:
                override_result = theme_service.apply_token_overrides(tokens)
                if override_result["errors"]:
                    result_msg += f"，部分 token 微调失败"
                else:
                    result_msg += f"，已应用 {len(override_result['applied'])} 个 token 微调"

                return success_result(
                    "theme",
                    result_msg,
                    {
                        "theme_id": theme_id,
                        "tokens": full_theme,
                        "overrides_applied": override_result["applied"],
                        "errors": override_result["errors"],
                    }
                )

            return success_result(
                "theme",
                result_msg,
                {"theme_id": theme_id, "tokens": full_theme}
            )

        # 模式 2：仅微调
        elif tokens:
            override_result = theme_service.apply_token_overrides(tokens)
            current_id = theme_storage.get_current_theme_id()

            if override_result["errors"]:
                msg = f"部分 token 微调失败: {len(override_result['errors'])} 个"
            else:
                msg = f"已应用 {len(override_result['applied'])} 个 token 微调"

            return success_result(
                "theme",
                msg,
                {
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
        return success_result(
            "theme",
            f"已保存为新主题: {new_theme['id']}",
            {"theme": new_theme}
        )
    except Exception as e:
        return error_result(
            "theme",
            ErrorCode.EXEC_FAILED,
            f"保存主题失败: {e}",
            params
        )
