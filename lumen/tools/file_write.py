"""
Lumen - 文件写入工具
9 个 action: write / edit / append / copy / move / rename / delete / mkdir / download

安全设计：
- 写入前必须通过安全层验证（工作区白名单 + 黑名单）
- write 自动备份已有文件（.bak）
- edit 使用 SEARCH/REPLACE 精确替换（Claude Code 方式）
- delete 使用 send2trash 移到回收站（VCP 方式）
- readonly_mode 时禁止所有写操作
"""

import os
import re
import json
import shutil
import logging
from pathlib import Path
from typing import Dict, Any

import httpx

from lumen.tools.base import success_result, error_result, ErrorCode
from lumen.tools.file_security import validate_path, is_readonly_mode

logger = logging.getLogger(__name__)


# ========================================
# Action 分发
# ========================================

def execute(params: dict) -> dict:
    """执行文件写入工具"""
    action = params.get("action", "")
    path = params.get("path", "")

    if not action:
        return error_result("file_write", ErrorCode.PARAM_EMPTY, "缺少 action 参数")

    if not path:
        return error_result("file_write", ErrorCode.PARAM_EMPTY, "缺少 path 参数")

    # 只读模式检查（download 不受只读限制，因为是下载到工作区）
    if action != "download" and is_readonly_mode():
        return error_result("file_write", ErrorCode.EXEC_DENIED, "当前为只读模式，禁止写入操作")

    dispatch = {
        "write": _action_write,
        "edit": _action_edit,
        "append": _action_append,
        "copy": _action_copy,
        "move": _action_move,
        "rename": _action_rename,
        "delete": _action_delete,
        "mkdir": _action_mkdir,
        "download": _action_download,
    }

    handler = dispatch.get(action)
    if not handler:
        valid = ", ".join(dispatch.keys())
        return error_result(
            "file_write", ErrorCode.PARAM_INVALID,
            f"未知 action: '{action}'，有效值: {valid}",
        )

    return handler(params)


# ========================================
# 通用辅助函数
# ========================================

def _validate_write(path: str, must_exist: bool = False) -> Dict[str, Any]:
    """验证写入路径的合法性

    Args:
        path: 目标路径
        must_exist: 是否要求文件必须已存在

    Returns:
        成功时返回 {"ok": True, "real_path": str}
        失败时返回 error_result 字典
    """
    check = validate_path(path, require_write=True)
    if not check["allowed"]:
        return error_result("file_write", ErrorCode.EXEC_DENIED, check["reason"])

    real_path = check["real_path"]

    if must_exist and not os.path.exists(real_path):
        return error_result("file_write", ErrorCode.PARAM_INVALID,
                            f"文件不存在: {real_path}")

    return {"ok": True, "real_path": real_path}


def _auto_rename_if_exists(path: str) -> str:
    """如果文件已存在，自动加 (1) 后缀"""
    if not os.path.exists(path):
        return path

    base, ext = os.path.splitext(path)
    counter = 1
    while True:
        new_path = f"{base} ({counter}){ext}"
        if not os.path.exists(new_path):
            return new_path
        counter += 1


# ========================================
# write — 创建/覆盖文件
# ========================================

def _action_write(params: dict) -> dict:
    """创建或覆盖文件（自动创建父目录，已有文件自动备份 .bak）"""
    path = params.get("path", "")
    content = params.get("content", "")
    encoding = params.get("encoding", "utf-8")

    if content is None:
        return error_result("file_write", ErrorCode.PARAM_EMPTY,
                            "write 操作需要 content 参数")

    result = _validate_write(path)
    if not result.get("ok"):
        return result

    real_path = result["real_path"]

    try:
        # 自动创建父目录
        parent = os.path.dirname(real_path)
        if parent:
            os.makedirs(parent, exist_ok=True)

        # 已有文件 → 备份为 .bak
        if os.path.exists(real_path):
            bak_path = real_path + ".bak"
            shutil.copy2(real_path, bak_path)

        # 写入
        with open(real_path, "w", encoding=encoding) as f:
            f.write(content)

        size = _format_size(len(content.encode(encoding)))
        msg = f"文件已写入: {real_path} ({size})"

        if os.path.exists(real_path + ".bak"):
            msg += f"\n原文件已备份: {real_path}.bak"

        return success_result("file_write", msg)

    except Exception as e:
        return error_result("file_write", ErrorCode.EXEC_FAILED, f"写入文件失败: {e}")


# ========================================
# edit — SEARCH/REPLACE 精确替换（Claude Code 方式）
# ========================================

def _action_edit(params: dict) -> dict:
    """精确替换文件中的文本（SEARCH/REPLACE）

    必须提供 old_string 和 new_string。
    old_string 必须在文件中唯一出现（否则报错要求提供更多上下文）。
    """
    path = params.get("path", "")
    old_string = params.get("old_string")
    new_string = params.get("new_string", "")
    encoding = params.get("encoding", "utf-8")

    if old_string is None:
        return error_result("file_write", ErrorCode.PARAM_EMPTY,
                            "edit 操作需要 old_string 参数（要替换的原始文本）")
    if new_string is None:
        return error_result("file_write", ErrorCode.PARAM_EMPTY,
                            "edit 操作需要 new_string 参数（替换后的新文本）")

    result = _validate_write(path, must_exist=True)
    if not result.get("ok"):
        return result

    real_path = result["real_path"]

    try:
        with open(real_path, "r", encoding=encoding) as f:
            content = f.read()

        # 检查 old_string 是否存在
        count = content.count(old_string)
        if count == 0:
            return error_result("file_write", ErrorCode.PARAM_INVALID,
                                f"未在文件中找到要替换的文本。请确认 old_string 是否完全匹配（包括空格和换行）。")

        if count > 1:
            return error_result(
                "file_write", ErrorCode.PARAM_INVALID,
                f"要替换的文本在文件中出现了 {count} 次，无法确定替换哪一处。"
                f"请在 old_string 中提供更多上下文使其唯一匹配。"
            )

        # 执行替换
        new_content = content.replace(old_string, new_string, 1)

        # 备份
        shutil.copy2(real_path, real_path + ".bak")

        # 写回
        with open(real_path, "w", encoding=encoding) as f:
            f.write(new_content)

        # 显示变更摘要
        old_lines = old_string.strip().split("\n")
        new_lines = new_string.strip().split("\n")

        msg = f"文件已编辑: {real_path}"
        msg += f"\n替换: {old_lines[0][:80]}{'...' if len(old_lines[0]) > 80 else ''}"
        msg += f"\n变为: {new_lines[0][:80]}{'...' if len(new_lines[0]) > 80 else ''}"

        return success_result("file_write", msg)

    except Exception as e:
        return error_result("file_write", ErrorCode.EXEC_FAILED, f"编辑文件失败: {e}")


# ========================================
# append — 追加内容
# ========================================

def _action_append(params: dict) -> dict:
    """追加内容到文件末尾（文件不存在则创建）"""
    path = params.get("path", "")
    content = params.get("content", "")
    encoding = params.get("encoding", "utf-8")

    if content is None:
        return error_result("file_write", ErrorCode.PARAM_EMPTY,
                            "append 操作需要 content 参数")

    result = _validate_write(path)
    if not result.get("ok"):
        return result

    real_path = result["real_path"]

    try:
        # 自动创建父目录
        parent = os.path.dirname(real_path)
        if parent:
            os.makedirs(parent, exist_ok=True)

        # 追加（文件不存在会自动创建）
        with open(real_path, "a", encoding=encoding) as f:
            f.write(content)

        action_word = "追加内容到" if os.path.getsize(real_path) > len(content.encode(encoding)) else "创建"
        return success_result("file_write", f"已{action_word}文件: {real_path}")

    except Exception as e:
        return error_result("file_write", ErrorCode.EXEC_FAILED, f"追加内容失败: {e}")


# ========================================
# copy — 复制文件
# ========================================

def _action_copy(params: dict) -> dict:
    """复制文件（目标已存在则自动改名）"""
    path = params.get("path", "")
    destination = params.get("destination", "")

    if not destination:
        return error_result("file_write", ErrorCode.PARAM_EMPTY,
                            "copy 操作需要 destination 参数")

    # 验证源文件
    src_check = validate_path(path, require_write=False)
    if not src_check["allowed"]:
        return error_result("file_write", ErrorCode.EXEC_DENIED, src_check["reason"])

    src_real = src_check["real_path"]

    if not os.path.exists(src_real):
        return error_result("file_write", ErrorCode.PARAM_INVALID, f"源文件不存在: {src_real}")

    if os.path.isdir(src_real):
        return error_result("file_write", ErrorCode.PARAM_INVALID,
                            "copy 操作不支持复制目录，请使用文件路径")

    # 验证目标路径
    dst_check = validate_path(destination, require_write=True)
    if not dst_check["allowed"]:
        return error_result("file_write", ErrorCode.EXEC_DENIED, dst_check["reason"])

    dst_real = dst_check["real_path"]

    try:
        # 自动创建目标目录
        dst_parent = os.path.dirname(dst_real)
        if dst_parent:
            os.makedirs(dst_parent, exist_ok=True)

        # 目标已存在 → 自动改名
        actual_dst = _auto_rename_if_exists(dst_real)

        shutil.copy2(src_real, actual_dst)

        dst_name = os.path.basename(actual_dst)
        return success_result("file_write",
                              f"文件已复制: {os.path.basename(src_real)} → {dst_name}")

    except Exception as e:
        return error_result("file_write", ErrorCode.EXEC_FAILED, f"复制文件失败: {e}")


# ========================================
# move — 移动文件
# ========================================

def _action_move(params: dict) -> dict:
    """移动文件（目标已存在则自动改名）"""
    path = params.get("path", "")
    destination = params.get("destination", "")

    if not destination:
        return error_result("file_write", ErrorCode.PARAM_EMPTY,
                            "move 操作需要 destination 参数")

    # 验证源路径
    src_check = validate_path(path, require_write=True)
    if not src_check["allowed"]:
        return error_result("file_write", ErrorCode.EXEC_DENIED, src_check["reason"])

    src_real = src_check["real_path"]

    if not os.path.exists(src_real):
        return error_result("file_write", ErrorCode.PARAM_INVALID, f"源文件不存在: {src_real}")

    # 验证目标路径
    dst_check = validate_path(destination, require_write=True)
    if not dst_check["allowed"]:
        return error_result("file_write", ErrorCode.EXEC_DENIED, dst_check["reason"])

    dst_real = dst_check["real_path"]

    try:
        dst_parent = os.path.dirname(dst_real)
        if dst_parent:
            os.makedirs(dst_parent, exist_ok=True)

        # 目标已存在 → 自动改名
        actual_dst = _auto_rename_if_exists(dst_real)

        shutil.move(src_real, actual_dst)

        return success_result("file_write",
                              f"文件已移动: {os.path.basename(src_real)} → {os.path.basename(actual_dst)}")

    except Exception as e:
        return error_result("file_write", ErrorCode.EXEC_FAILED, f"移动文件失败: {e}")


# ========================================
# rename — 重命名
# ========================================

def _action_rename(params: dict) -> dict:
    """重命名文件（目标已存在则拒绝，防止意外覆盖）"""
    path = params.get("path", "")
    destination = params.get("destination", "")

    if not destination:
        return error_result("file_write", ErrorCode.PARAM_EMPTY,
                            "rename 操作需要 destination 参数（新文件名或新路径）")

    src_check = validate_path(path, require_write=True)
    if not src_check["allowed"]:
        return error_result("file_write", ErrorCode.EXEC_DENIED, src_check["reason"])

    src_real = src_check["real_path"]

    if not os.path.exists(src_real):
        return error_result("file_write", ErrorCode.PARAM_INVALID, f"文件不存在: {src_real}")

    # 目标路径：如果在同一目录，就只改文件名
    dst_real = os.path.realpath(destination)

    # 验证目标路径安全性
    dst_check = validate_path(destination, require_write=True)
    if not dst_check["allowed"]:
        return error_result("file_write", ErrorCode.EXEC_DENIED, dst_check["reason"])

    dst_real = dst_check["real_path"]

    if os.path.exists(dst_real):
        return error_result("file_write", ErrorCode.PARAM_INVALID,
                            f"目标已存在，拒绝覆盖: {dst_real}")

    try:
        os.rename(src_real, dst_real)

        return success_result("file_write",
                              f"文件已重命名: {os.path.basename(src_real)} → {os.path.basename(dst_real)}")

    except Exception as e:
        return error_result("file_write", ErrorCode.EXEC_FAILED, f"重命名失败: {e}")


# ========================================
# delete — 删除到回收站
# ========================================

def _action_delete(params: dict) -> dict:
    """删除文件到回收站（使用 send2trash）"""
    path = params.get("path", "")

    result = _validate_write(path, must_exist=True)
    if not result.get("ok"):
        return result

    real_path = result["real_path"]

    # 安全检查：不允许删除目录（防止误删整个文件夹）
    if os.path.isdir(real_path):
        return error_result("file_write", ErrorCode.PARAM_INVALID,
                            "安全限制：不允许删除目录，只能删除文件")

    try:
        from send2trash import send2trash
        send2trash(real_path)

        return success_result("file_write",
                              f"文件已移到回收站: {os.path.basename(real_path)}")

    except ImportError:
        # 没有 send2trash，回退到普通删除
        try:
            os.remove(real_path)
            return success_result("file_write",
                                  f"文件已删除: {os.path.basename(real_path)}\n"
                                  f"（未安装 send2trash，已永久删除而非移到回收站）")
        except Exception as e:
            return error_result("file_write", ErrorCode.EXEC_FAILED, f"删除失败: {e}")

    except Exception as e:
        return error_result("file_write", ErrorCode.EXEC_FAILED, f"删除失败: {e}")


# ========================================
# mkdir — 创建目录
# ========================================

def _action_mkdir(params: dict) -> dict:
    """创建目录（递归创建，类似 mkdir -p）"""
    path = params.get("path", "")

    result = _validate_write(path)
    if not result.get("ok"):
        return result

    real_path = result["real_path"]

    try:
        os.makedirs(real_path, exist_ok=True)
        return success_result("file_write", f"目录已就绪: {real_path}")

    except Exception as e:
        return error_result("file_write", ErrorCode.EXEC_FAILED, f"创建目录失败: {e}")


# ========================================
# download — 从 URL 下载文件
# ========================================

def _action_download(params: dict) -> dict:
    """从 URL 下载文件"""
    path = params.get("path", "")
    url = params.get("url", "")

    if not url:
        return error_result("file_write", ErrorCode.PARAM_EMPTY,
                            "download 操作需要 url 参数")

    if not url.startswith(("http://", "https://")):
        return error_result("file_write", ErrorCode.PARAM_INVALID,
                            f"URL 必须以 http:// 或 https:// 开头")

    # 验证保存路径
    result = _validate_write(path)
    if not result.get("ok"):
        return result

    real_path = result["real_path"]

    try:
        # 自动创建父目录
        parent = os.path.dirname(real_path)
        if parent:
            os.makedirs(parent, exist_ok=True)

        # 下载（同步 httpx）
        with httpx.Client(follow_redirects=True, timeout=60) as client:
            response = client.get(url)
            response.raise_for_status()

            with open(real_path, "wb") as f:
                f.write(response.content)

        size = _format_size(len(response.content))
        return success_result("file_write",
                              f"文件已下载: {os.path.basename(real_path)} ({size})\n来源: {url}")

    except httpx.HTTPStatusError as e:
        return error_result("file_write", ErrorCode.EXEC_FAILED,
                            f"下载失败，HTTP {e.response.status_code}: {url}")
    except Exception as e:
        return error_result("file_write", ErrorCode.EXEC_FAILED, f"下载失败: {e}")


# ========================================
# 辅助函数
# ========================================

def _format_size(size_bytes: int) -> str:
    """格式化文件大小"""
    if size_bytes < 1024:
        return f"{size_bytes}B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f}KB"
    else:
        return f"{size_bytes / 1024 / 1024:.1f}MB"
