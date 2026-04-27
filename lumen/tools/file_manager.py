"""
Lumen - 文件管理工具（合并 file_read + file_write）
14 个 command: read / list / glob / grep / info / write / edit / append / copy / move / rename / delete / mkdir / download

综合 Claude Code（SEARCH/REPLACE、精确编辑、Grep）和 VCP FileOperator
（文件管理、回收站删除、自动改名）的优点。

入口: execute(params, command)
- command 参数优先（由上层 tool.py 传入）
- fallback 到 params["action"]（向后兼容旧会话）
"""

import os
import re
import base64
import shutil
import logging
from pathlib import Path
from datetime import datetime
from typing import Dict, Any

import httpx

from lumen.tool import success_result, error_result, ErrorCode
from lumen.tools.file_security import validate_path, get_max_file_size_mb, is_readonly_mode

logger = logging.getLogger(__name__)


# ========================================
# 文件类型常量
# ========================================

# 可读取的文本文件后缀
_TEXT_EXTENSIONS = {
    ".txt", ".md", ".py", ".js", ".ts", ".tsx", ".jsx", ".json", ".csv",
    ".xml", ".html", ".htm", ".css", ".scss", ".less", ".yaml", ".yml",
    ".toml", ".ini", ".cfg", ".conf", ".log", ".sql", ".sh", ".bat",
    ".ps1", ".rs", ".go", ".java", ".c", ".cpp", ".h", ".hpp",
    ".rb", ".php", ".swift", ".kt", ".lua", ".r", ".m", ".tex",
    ".gitignore", ".env", ".dockerignore", ".editorconfig",
    ".properties", ".gradle", ".cmake", ".makefile",
}

# 图片文件后缀 -> MIME 类型
_IMAGE_EXTENSIONS = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".bmp": "image/bmp",
    ".ico": "image/x-icon",
}

# PDF 文件后缀
_PDF_EXTENSIONS = {".pdf"}


# ========================================
# Command 分发
# ========================================

def execute(params: dict, command: str = "") -> dict:
    """执行文件管理工具

    Args:
        params: 工具参数字典
        command: 命令名（由上层 tool.py 传入，优先使用）
                 如果为空，则 fallback 到 params["action"]（向后兼容）
    """
    # command 优先，fallback 到 params.action
    cmd = command or params.get("action", "")
    path = params.get("path", "")

    if not cmd:
        return error_result("file_manager", ErrorCode.PARAM_EMPTY, "缺少 command 参数")

    if not path:
        return error_result("file_manager", ErrorCode.PARAM_EMPTY, "缺少 path 参数")

    # 只读模式检查（download 不受只读限制，因为是下载到工作区）
    if cmd != "download" and cmd not in ("read", "list", "glob", "grep", "info") and is_readonly_mode():
        return error_result("file_manager", ErrorCode.EXEC_DENIED, "当前为只读模式，禁止写入操作")

    dispatch = {
        # 来自 file_read 的命令
        "read": _cmd_read,
        "list": _cmd_list,
        "glob": _cmd_glob,
        "grep": _cmd_grep,
        "info": _cmd_info,
        # 来自 file_write 的命令
        "write": _cmd_write,
        "edit": _cmd_edit,
        "append": _cmd_append,
        "copy": _cmd_copy,
        "move": _cmd_move,
        "rename": _cmd_rename,
        "delete": _cmd_delete,
        "mkdir": _cmd_mkdir,
        "download": _cmd_download,
    }

    handler = dispatch.get(cmd)
    if not handler:
        valid = ", ".join(dispatch.keys())
        return error_result(
            "file_manager", ErrorCode.PARAM_INVALID,
            f"未知 command: '{cmd}'，有效值: {valid}",
        )

    return handler(params)


# ========================================
# 通用辅助函数
# ========================================

def _format_size(size_bytes: int) -> str:
    """格式化文件大小"""
    if size_bytes < 1024:
        return f"{size_bytes}B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f}KB"
    else:
        return f"{size_bytes / 1024 / 1024:.1f}MB"


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
        return error_result("file_manager", ErrorCode.EXEC_DENIED, check["reason"])

    real_path = check["real_path"]

    if must_exist and not os.path.exists(real_path):
        return error_result("file_manager", ErrorCode.PARAM_INVALID,
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
# read -- 读文件
# ========================================

def _cmd_read(params: dict) -> dict:
    """读文件内容（支持文本、图片 base64、PDF）"""
    path = params.get("path", "")
    encoding = params.get("encoding", "utf-8")
    offset = max(1, int(params.get("offset", 1)))
    limit = int(params.get("limit", 2000))

    # 安全校验
    check = validate_path(path, require_write=False)
    if not check["allowed"]:
        return error_result("file_manager", ErrorCode.EXEC_DENIED, check["reason"])

    real_path = check["real_path"]

    # 检查文件存在
    if not os.path.exists(real_path):
        return error_result("file_manager", ErrorCode.PARAM_INVALID, f"文件不存在: {real_path}")

    if os.path.isdir(real_path):
        return error_result("file_manager", ErrorCode.PARAM_INVALID,
                            f"路径是目录，不是文件。如需列出目录请使用 list 操作: {real_path}")

    # 检查文件大小
    file_size = os.path.getsize(real_path)
    max_size = get_max_file_size_mb() * 1024 * 1024
    if file_size > max_size:
        return error_result(
            "file_manager", ErrorCode.PARAM_INVALID,
            f"文件过大: {file_size / 1024 / 1024:.1f}MB，限制: {get_max_file_size_mb()}MB",
        )

    # 根据文件类型选择读取方式
    ext = Path(real_path).suffix.lower()

    if ext in _IMAGE_EXTENSIONS:
        return _read_image(real_path, ext)
    elif ext in _PDF_EXTENSIONS:
        return _read_pdf(real_path, encoding)
    else:
        return _read_text(real_path, encoding, offset, limit)


def _read_text(path: str, encoding: str, offset: int, limit: int) -> dict:
    """读取文本文件"""
    try:
        with open(path, "r", encoding=encoding, errors="replace") as f:
            lines = f.readlines()

        total_lines = len(lines)

        # 行号切片（offset 从 1 开始）
        start = offset - 1
        end = min(start + limit, total_lines)
        selected = lines[start:end]

        # 带行号输出（类似 cat -n）
        numbered = []
        for i, line in enumerate(selected, start=offset):
            numbered.append(f"{i:6}\t{line.rstrip()}")

        content = "\n".join(numbered)

        # 截断提示
        if end < total_lines:
            content += f"\n\n[文件过长，已截断... 共 {total_lines} 行，显示第 {offset}-{end} 行]"

        return success_result("file_manager", content)

    except UnicodeDecodeError:
        return error_result("file_manager", ErrorCode.EXEC_FAILED,
                            f"文件编码错误，尝试的编码: {encoding}")
    except Exception as e:
        return error_result("file_manager", ErrorCode.EXEC_FAILED, f"读取文件失败: {e}")


def _read_image(path: str, ext: str) -> dict:
    """读取图片文件（返回 base64）"""
    try:
        with open(path, "rb") as f:
            data = f.read()

        mime = _IMAGE_EXTENSIONS.get(ext, "application/octet-stream")
        b64 = base64.b64encode(data).decode("ascii")
        size_kb = len(data) / 1024

        result = (
            f"[图片文件: {os.path.basename(path)}]\n"
            f"格式: {mime}，大小: {size_kb:.1f}KB\n"
            f"base64 数据（可直接用于多模态输入）:\n"
            f"data:{mime};base64,{b64[:100]}...\n"
            f"[base64 总长度: {len(b64)} 字符]"
        )

        return success_result("file_manager", result)

    except Exception as e:
        return error_result("file_manager", ErrorCode.EXEC_FAILED, f"读取图片失败: {e}")


def _read_pdf(path: str, encoding: str) -> dict:
    """读取 PDF 文件（提取文本）"""
    try:
        from PyPDF2 import PdfReader

        reader = PdfReader(path)
        total_pages = len(reader.pages)

        # 限制最多读 20 页
        pages_to_read = min(total_pages, 20)

        text_parts = []
        for i in range(pages_to_read):
            page_text = reader.pages[i].extract_text()
            if page_text:
                text_parts.append(f"--- 第 {i + 1} 页 ---\n{page_text}")

        content = "\n\n".join(text_parts)

        if pages_to_read < total_pages:
            content += f"\n\n[PDF 共 {total_pages} 页，已提取前 {pages_to_read} 页]"

        if not content.strip():
            content = "[PDF 文件无法提取文本内容（可能是扫描件或纯图片 PDF）]"

        return success_result("file_manager", content)

    except ImportError:
        return error_result("file_manager", ErrorCode.EXEC_FAILED,
                            "PDF 读取需要 PyPDF2 库，请运行: uv pip install PyPDF2")
    except Exception as e:
        return error_result("file_manager", ErrorCode.EXEC_FAILED, f"读取 PDF 失败: {e}")


# ========================================
# list -- 列目录
# ========================================

def _cmd_list(params: dict) -> dict:
    """列出目录内容"""
    path = params.get("path", "")

    check = validate_path(path, require_write=False)
    if not check["allowed"]:
        return error_result("file_manager", ErrorCode.EXEC_DENIED, check["reason"])

    real_path = check["real_path"]

    if not os.path.exists(real_path):
        return error_result("file_manager", ErrorCode.PARAM_INVALID, f"目录不存在: {real_path}")

    if not os.path.isdir(real_path):
        return error_result("file_manager", ErrorCode.PARAM_INVALID,
                            f"路径是文件，不是目录: {real_path}")

    try:
        entries = list(os.scandir(real_path))
    except PermissionError:
        return error_result("file_manager", ErrorCode.EXEC_DENIED, f"无权限访问目录: {real_path}")

    # 限制条目数
    max_items = 500
    total = len(entries)
    entries = entries[:max_items]

    # 格式化为表格
    lines = [f"| 名称 | 类型 | 大小 | 修改时间 |",
             f"|------|------|------|----------|"]

    for entry in sorted(entries, key=lambda e: (not e.is_dir(), e.name.lower())):
        try:
            name = entry.name
            is_dir = entry.is_dir()
            entry_type = "📁 目录" if is_dir else "📄 文件"

            if is_dir:
                size_str = "-"
            else:
                stat = entry.stat()
                size_bytes = stat.st_size
                size_str = _format_size(size_bytes)

            # 修改时间
            mtime = datetime.fromtimestamp(entry.stat().st_mtime)
            time_str = mtime.strftime("%Y-%m-%d %H:%M")

            lines.append(f"| {name} | {entry_type} | {size_str} | {time_str} |")
        except (OSError, PermissionError):
            continue

    if total > max_items:
        lines.append(f"\n[目录共 {total} 项，已显示前 {max_items} 项]")

    return success_result("file_manager", "\n".join(lines))


# ========================================
# glob -- 按文件名模式搜索
# ========================================

def _cmd_glob(params: dict) -> dict:
    """按 glob 模式搜索文件"""
    path = params.get("path", "")
    pattern = params.get("pattern", "")

    if not pattern:
        return error_result("file_manager", ErrorCode.PARAM_EMPTY,
                            "glob 操作需要 pattern 参数，例如 '**/*.py'")

    check = validate_path(path, require_write=False)
    if not check["allowed"]:
        return error_result("file_manager", ErrorCode.EXEC_DENIED, check["reason"])

    real_path = check["real_path"]

    if not os.path.isdir(real_path):
        return error_result("file_manager", ErrorCode.PARAM_INVALID,
                            f"搜索路径不是目录: {real_path}")

    try:
        base = Path(real_path)
        matches = list(base.rglob(pattern))

        # 限制结果数
        max_results = 100
        total = len(matches)
        matches = matches[:max_results]

        # 格式化输出
        if not matches:
            return success_result("file_manager",
                                  f"在 {path} 中按 '{pattern}' 搜索，未找到匹配文件")

        lines = [f"在 {path} 中按 '{pattern}' 搜索，找到 {total} 个匹配：\n"]

        for match in matches:
            rel = match.relative_to(base)
            if match.is_dir():
                lines.append(f"  📁 {rel}/")
            else:
                size = _format_size(match.stat().st_size)
                lines.append(f"  📄 {rel} ({size})")

        if total > max_results:
            lines.append(f"\n[共 {total} 个匹配，已显示前 {max_results} 个]")

        return success_result("file_manager", "\n".join(lines))

    except Exception as e:
        return error_result("file_manager", ErrorCode.EXEC_FAILED, f"搜索失败: {e}")


# ========================================
# grep -- 按文件内容搜索
# ========================================

def _cmd_grep(params: dict) -> dict:
    """按正则搜索文件内容"""
    path = params.get("path", "")
    pattern = params.get("pattern", "")
    case_sensitive = params.get("case_sensitive", False)

    if not pattern:
        return error_result("file_manager", ErrorCode.PARAM_EMPTY,
                            "grep 操作需要 pattern 参数（正则表达式）")

    check = validate_path(path, require_write=False)
    if not check["allowed"]:
        return error_result("file_manager", ErrorCode.EXEC_DENIED, check["reason"])

    real_path = check["real_path"]

    # 编译正则
    try:
        flags = 0 if case_sensitive else re.IGNORECASE
        regex = re.compile(pattern, flags)
    except re.error as e:
        return error_result("file_manager", ErrorCode.PARAM_INVALID,
                            f"正则表达式错误: {e}")

    # 搜索
    max_files = 100
    max_matches = 50
    results = []

    try:
        search_root = Path(real_path)

        if search_root.is_file():
            # 搜索单个文件
            file_matches = _grep_in_file(search_root, regex)
            if file_matches:
                results.append((str(search_root), file_matches))
        else:
            # 搜索目录下的所有文本文件
            file_count = 0
            for fp in search_root.rglob("*"):
                if not fp.is_file():
                    continue
                if fp.suffix.lower() not in _TEXT_EXTENSIONS:
                    continue

                file_matches = _grep_in_file(fp, regex)
                if file_matches:
                    results.append((str(fp.relative_to(search_root)), file_matches))
                    file_count += 1
                    if file_count >= max_files:
                        break

        if not results:
            return success_result("file_manager",
                                  f"在 {path} 中搜索 '{pattern}'，未找到匹配")

        # 格式化输出
        total_matches = sum(len(m) for _, m in results)
        lines = [f"在 {path} 中搜索 '{pattern}'，找到 {total_matches} 处匹配：\n"]

        for file_path, matches in results[:max_matches]:
            lines.append(f"📄 {file_path}:")
            for line_no, line_text in matches[:10]:  # 每个文件最多 10 条
                # 截断过长的行
                display = line_text.strip()[:200]
                lines.append(f"  L{line_no}: {display}")
            if len(matches) > 10:
                lines.append(f"  ... 还有 {len(matches) - 10} 处匹配")

        if total_matches > max_matches:
            lines.append(f"\n[共 {total_matches} 处匹配，已显示前 {max_matches} 处]")

        return success_result("file_manager", "\n".join(lines))

    except Exception as e:
        return error_result("file_manager", ErrorCode.EXEC_FAILED, f"搜索失败: {e}")


def _grep_in_file(filepath: Path, regex: re.Pattern) -> list:
    """在单个文件中搜索正则匹配

    Returns:
        [(line_number, line_text), ...]
    """
    matches = []
    try:
        with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
            for line_no, line in enumerate(f, 1):
                if regex.search(line):
                    matches.append((line_no, line))
    except (OSError, PermissionError):
        pass
    return matches


# ========================================
# info -- 文件元信息
# ========================================

def _cmd_info(params: dict) -> dict:
    """获取文件或目录的元信息"""
    path = params.get("path", "")

    check = validate_path(path, require_write=False)
    if not check["allowed"]:
        return error_result("file_manager", ErrorCode.EXEC_DENIED, check["reason"])

    real_path = check["real_path"]

    if not os.path.exists(real_path):
        return error_result("file_manager", ErrorCode.PARAM_INVALID, f"路径不存在: {real_path}")

    try:
        stat = os.stat(real_path)
        p = Path(real_path)
        is_dir = p.is_dir()

        lines = [
            f"路径: {real_path}",
            f"类型: {'目录' if is_dir else '文件'}",
            f"大小: {_format_size(stat.st_size)}" if not is_dir else f"大小: -（目录）",
            f"创建时间: {datetime.fromtimestamp(stat.st_ctime).strftime('%Y-%m-%d %H:%M:%S')}",
            f"修改时间: {datetime.fromtimestamp(stat.st_mtime).strftime('%Y-%m-%d %H:%M:%S')}",
        ]

        if not is_dir:
            lines.append(f"后缀: {p.suffix or '无'}")
            lines.append(f"文件名: {p.name}")

            # 文件类型判断
            ext = p.suffix.lower()
            if ext in _TEXT_EXTENSIONS:
                lines.append("文件类型: 文本文件")
            elif ext in _IMAGE_EXTENSIONS:
                lines.append(f"文件类型: 图片 ({_IMAGE_EXTENSIONS[ext]})")
            elif ext in _PDF_EXTENSIONS:
                lines.append("文件类型: PDF 文档")
            else:
                lines.append("文件类型: 其他")
        else:
            # 目录：统计文件数
            try:
                items = list(os.scandir(real_path))
                files = sum(1 for i in items if i.is_file())
                dirs = sum(1 for i in items if i.is_dir())
                lines.append(f"内容: {files} 个文件, {dirs} 个子目录")
            except (PermissionError, OSError):
                lines.append("内容: 无权限读取")

        return success_result("file_manager", "\n".join(lines))

    except Exception as e:
        return error_result("file_manager", ErrorCode.EXEC_FAILED, f"获取文件信息失败: {e}")


# ========================================
# write -- 创建/覆盖文件
# ========================================

def _cmd_write(params: dict) -> dict:
    """创建或覆盖文件（自动创建父目录，已有文件自动备份 .bak）"""
    path = params.get("path", "")
    content = params.get("content", "")
    encoding = params.get("encoding", "utf-8")

    if content is None:
        return error_result("file_manager", ErrorCode.PARAM_EMPTY,
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

        # 已有文件 -> 备份为 .bak
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

        return success_result("file_manager", msg)

    except Exception as e:
        return error_result("file_manager", ErrorCode.EXEC_FAILED, f"写入文件失败: {e}")


# ========================================
# edit -- SEARCH/REPLACE 精确替换（Claude Code 方式）
# ========================================

def _cmd_edit(params: dict) -> dict:
    """精确替换文件中的文本（SEARCH/REPLACE）

    必须提供 old_string 和 new_string。
    old_string 必须在文件中唯一出现（否则报错要求提供更多上下文）。
    """
    path = params.get("path", "")
    old_string = params.get("old_string")
    new_string = params.get("new_string", "")
    encoding = params.get("encoding", "utf-8")

    if old_string is None:
        return error_result("file_manager", ErrorCode.PARAM_EMPTY,
                            "edit 操作需要 old_string 参数（要替换的原始文本）")
    if new_string is None:
        return error_result("file_manager", ErrorCode.PARAM_EMPTY,
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
            return error_result("file_manager", ErrorCode.PARAM_INVALID,
                                f"未在文件中找到要替换的文本。请确认 old_string 是否完全匹配（包括空格和换行）。")

        if count > 1:
            return error_result(
                "file_manager", ErrorCode.PARAM_INVALID,
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

        return success_result("file_manager", msg)

    except Exception as e:
        return error_result("file_manager", ErrorCode.EXEC_FAILED, f"编辑文件失败: {e}")


# ========================================
# append -- 追加内容
# ========================================

def _cmd_append(params: dict) -> dict:
    """追加内容到文件末尾（文件不存在则创建）"""
    path = params.get("path", "")
    content = params.get("content", "")
    encoding = params.get("encoding", "utf-8")

    if content is None:
        return error_result("file_manager", ErrorCode.PARAM_EMPTY,
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
        return success_result("file_manager", f"已{action_word}文件: {real_path}")

    except Exception as e:
        return error_result("file_manager", ErrorCode.EXEC_FAILED, f"追加内容失败: {e}")


# ========================================
# copy -- 复制文件
# ========================================

def _cmd_copy(params: dict) -> dict:
    """复制文件（目标已存在则自动改名）"""
    path = params.get("path", "")
    destination = params.get("destination", "")

    if not destination:
        return error_result("file_manager", ErrorCode.PARAM_EMPTY,
                            "copy 操作需要 destination 参数")

    # 验证源文件
    src_check = validate_path(path, require_write=False)
    if not src_check["allowed"]:
        return error_result("file_manager", ErrorCode.EXEC_DENIED, src_check["reason"])

    src_real = src_check["real_path"]

    if not os.path.exists(src_real):
        return error_result("file_manager", ErrorCode.PARAM_INVALID, f"源文件不存在: {src_real}")

    if os.path.isdir(src_real):
        return error_result("file_manager", ErrorCode.PARAM_INVALID,
                            "copy 操作不支持复制目录，请使用文件路径")

    # 验证目标路径
    dst_check = validate_path(destination, require_write=True)
    if not dst_check["allowed"]:
        return error_result("file_manager", ErrorCode.EXEC_DENIED, dst_check["reason"])

    dst_real = dst_check["real_path"]

    try:
        # 自动创建目标目录
        dst_parent = os.path.dirname(dst_real)
        if dst_parent:
            os.makedirs(dst_parent, exist_ok=True)

        # 目标已存在 -> 自动改名
        actual_dst = _auto_rename_if_exists(dst_real)

        shutil.copy2(src_real, actual_dst)

        dst_name = os.path.basename(actual_dst)
        return success_result("file_manager",
                              f"文件已复制: {os.path.basename(src_real)} → {dst_name}")

    except Exception as e:
        return error_result("file_manager", ErrorCode.EXEC_FAILED, f"复制文件失败: {e}")


# ========================================
# move -- 移动文件
# ========================================

def _cmd_move(params: dict) -> dict:
    """移动文件（目标已存在则自动改名）"""
    path = params.get("path", "")
    destination = params.get("destination", "")

    if not destination:
        return error_result("file_manager", ErrorCode.PARAM_EMPTY,
                            "move 操作需要 destination 参数")

    # 验证源路径
    src_check = validate_path(path, require_write=True)
    if not src_check["allowed"]:
        return error_result("file_manager", ErrorCode.EXEC_DENIED, src_check["reason"])

    src_real = src_check["real_path"]

    if not os.path.exists(src_real):
        return error_result("file_manager", ErrorCode.PARAM_INVALID, f"源文件不存在: {src_real}")

    # 验证目标路径
    dst_check = validate_path(destination, require_write=True)
    if not dst_check["allowed"]:
        return error_result("file_manager", ErrorCode.EXEC_DENIED, dst_check["reason"])

    dst_real = dst_check["real_path"]

    try:
        dst_parent = os.path.dirname(dst_real)
        if dst_parent:
            os.makedirs(dst_parent, exist_ok=True)

        # 目标已存在 -> 自动改名
        actual_dst = _auto_rename_if_exists(dst_real)

        shutil.move(src_real, actual_dst)

        return success_result("file_manager",
                              f"文件已移动: {os.path.basename(src_real)} → {os.path.basename(actual_dst)}")

    except Exception as e:
        return error_result("file_manager", ErrorCode.EXEC_FAILED, f"移动文件失败: {e}")


# ========================================
# rename -- 重命名
# ========================================

def _cmd_rename(params: dict) -> dict:
    """重命名文件（目标已存在则拒绝，防止意外覆盖）"""
    path = params.get("path", "")
    destination = params.get("destination", "")

    if not destination:
        return error_result("file_manager", ErrorCode.PARAM_EMPTY,
                            "rename 操作需要 destination 参数（新文件名或新路径）")

    src_check = validate_path(path, require_write=True)
    if not src_check["allowed"]:
        return error_result("file_manager", ErrorCode.EXEC_DENIED, src_check["reason"])

    src_real = src_check["real_path"]

    if not os.path.exists(src_real):
        return error_result("file_manager", ErrorCode.PARAM_INVALID, f"文件不存在: {src_real}")

    # 验证目标路径安全性
    dst_check = validate_path(destination, require_write=True)
    if not dst_check["allowed"]:
        return error_result("file_manager", ErrorCode.EXEC_DENIED, dst_check["reason"])

    dst_real = dst_check["real_path"]

    if os.path.exists(dst_real):
        return error_result("file_manager", ErrorCode.PARAM_INVALID,
                            f"目标已存在，拒绝覆盖: {dst_real}")

    try:
        os.rename(src_real, dst_real)

        return success_result("file_manager",
                              f"文件已重命名: {os.path.basename(src_real)} → {os.path.basename(dst_real)}")

    except Exception as e:
        return error_result("file_manager", ErrorCode.EXEC_FAILED, f"重命名失败: {e}")


# ========================================
# delete -- 删除到回收站
# ========================================

def _cmd_delete(params: dict) -> dict:
    """删除文件到回收站（使用 send2trash）"""
    path = params.get("path", "")

    result = _validate_write(path, must_exist=True)
    if not result.get("ok"):
        return result

    real_path = result["real_path"]

    # 安全检查：不允许删除目录（防止误删整个文件夹）
    if os.path.isdir(real_path):
        return error_result("file_manager", ErrorCode.PARAM_INVALID,
                            "安全限制：不允许删除目录，只能删除文件")

    try:
        from send2trash import send2trash
        send2trash(real_path)

        return success_result("file_manager",
                              f"文件已移到回收站: {os.path.basename(real_path)}")

    except ImportError:
        # 没有 send2trash，回退到普通删除
        try:
            os.remove(real_path)
            return success_result("file_manager",
                                  f"文件已删除: {os.path.basename(real_path)}\n"
                                  f"（未安装 send2trash，已永久删除而非移到回收站）")
        except Exception as e:
            return error_result("file_manager", ErrorCode.EXEC_FAILED, f"删除失败: {e}")

    except Exception as e:
        return error_result("file_manager", ErrorCode.EXEC_FAILED, f"删除失败: {e}")


# ========================================
# mkdir -- 创建目录
# ========================================

def _cmd_mkdir(params: dict) -> dict:
    """创建目录（递归创建，类似 mkdir -p）"""
    path = params.get("path", "")

    result = _validate_write(path)
    if not result.get("ok"):
        return result

    real_path = result["real_path"]

    try:
        os.makedirs(real_path, exist_ok=True)
        return success_result("file_manager", f"目录已就绪: {real_path}")

    except Exception as e:
        return error_result("file_manager", ErrorCode.EXEC_FAILED, f"创建目录失败: {e}")


# ========================================
# download -- 从 URL 下载文件
# ========================================

def _cmd_download(params: dict) -> dict:
    """从 URL 下载文件"""
    path = params.get("path", "")
    url = params.get("url", "")

    if not url:
        return error_result("file_manager", ErrorCode.PARAM_EMPTY,
                            "download 操作需要 url 参数")

    if not url.startswith(("http://", "https://")):
        return error_result("file_manager", ErrorCode.PARAM_INVALID,
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
        return success_result("file_manager",
                              f"文件已下载: {os.path.basename(real_path)} ({size})\n来源: {url}")

    except httpx.HTTPStatusError as e:
        return error_result("file_manager", ErrorCode.EXEC_FAILED,
                            f"下载失败，HTTP {e.response.status_code}: {url}")
    except Exception as e:
        return error_result("file_manager", ErrorCode.EXEC_FAILED, f"下载失败: {e}")
