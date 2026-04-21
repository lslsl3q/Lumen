"""
Lumen - 文件读取工具
5 个 action: read / list / glob / grep / info

综合 Claude Code（SEARCH/REPLACE、精确编辑、Grep）和 VCP FileOperator
（文件管理、回收站删除、自动改名）的优点。
"""

import os
import re
import base64
import logging
from pathlib import Path
from datetime import datetime
from typing import Dict, Any

from lumen.tool import success_result, error_result, ErrorCode
from lumen.tools.file_security import validate_path, get_max_file_size_mb

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

# 图片文件后缀 → MIME 类型
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
# Action 分发
# ========================================

def execute(params: dict) -> dict:
    """执行文件读取工具"""
    action = params.get("action", "")
    path = params.get("path", "")

    if not action:
        return error_result("file_read", ErrorCode.PARAM_EMPTY, "缺少 action 参数")

    if not path:
        return error_result("file_read", ErrorCode.PARAM_EMPTY, "缺少 path 参数")

    dispatch = {
        "read": _action_read,
        "list": _action_list,
        "glob": _action_glob,
        "grep": _action_grep,
        "info": _action_info,
    }

    handler = dispatch.get(action)
    if not handler:
        valid = ", ".join(dispatch.keys())
        return error_result(
            "file_read", ErrorCode.PARAM_INVALID,
            f"未知 action: '{action}'，有效值: {valid}",
        )

    return handler(params)


# ========================================
# read — 读文件
# ========================================

def _action_read(params: dict) -> dict:
    """读文件内容（支持文本、图片 base64、PDF）"""
    path = params.get("path", "")
    encoding = params.get("encoding", "utf-8")
    offset = max(1, int(params.get("offset", 1)))
    limit = int(params.get("limit", 2000))

    # 安全校验
    check = validate_path(path, require_write=False)
    if not check["allowed"]:
        return error_result("file_read", ErrorCode.EXEC_DENIED, check["reason"])

    real_path = check["real_path"]

    # 检查文件存在
    if not os.path.exists(real_path):
        return error_result("file_read", ErrorCode.PARAM_INVALID, f"文件不存在: {real_path}")

    if os.path.isdir(real_path):
        return error_result("file_read", ErrorCode.PARAM_INVALID,
                            f"路径是目录，不是文件。如需列出目录请使用 list 操作: {real_path}")

    # 检查文件大小
    file_size = os.path.getsize(real_path)
    max_size = get_max_file_size_mb() * 1024 * 1024
    if file_size > max_size:
        return error_result(
            "file_read", ErrorCode.PARAM_INVALID,
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

        return success_result("file_read", content)

    except UnicodeDecodeError:
        return error_result("file_read", ErrorCode.EXEC_FAILED,
                            f"文件编码错误，尝试的编码: {encoding}")
    except Exception as e:
        return error_result("file_read", ErrorCode.EXEC_FAILED, f"读取文件失败: {e}")


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

        return success_result("file_read", result)

    except Exception as e:
        return error_result("file_read", ErrorCode.EXEC_FAILED, f"读取图片失败: {e}")


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

        return success_result("file_read", content)

    except ImportError:
        return error_result("file_read", ErrorCode.EXEC_FAILED,
                            "PDF 读取需要 PyPDF2 库，请运行: uv pip install PyPDF2")
    except Exception as e:
        return error_result("file_read", ErrorCode.EXEC_FAILED, f"读取 PDF 失败: {e}")


# ========================================
# list — 列目录
# ========================================

def _action_list(params: dict) -> dict:
    """列出目录内容"""
    path = params.get("path", "")

    check = validate_path(path, require_write=False)
    if not check["allowed"]:
        return error_result("file_read", ErrorCode.EXEC_DENIED, check["reason"])

    real_path = check["real_path"]

    if not os.path.exists(real_path):
        return error_result("file_read", ErrorCode.PARAM_INVALID, f"目录不存在: {real_path}")

    if not os.path.isdir(real_path):
        return error_result("file_read", ErrorCode.PARAM_INVALID,
                            f"路径是文件，不是目录: {real_path}")

    try:
        entries = list(os.scandir(real_path))
    except PermissionError:
        return error_result("file_read", ErrorCode.EXEC_DENIED, f"无权限访问目录: {real_path}")

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

    return success_result("file_read", "\n".join(lines))


def _format_size(size_bytes: int) -> str:
    """格式化文件大小"""
    if size_bytes < 1024:
        return f"{size_bytes}B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f}KB"
    else:
        return f"{size_bytes / 1024 / 1024:.1f}MB"


# ========================================
# glob — 按文件名模式搜索
# ========================================

def _action_glob(params: dict) -> dict:
    """按 glob 模式搜索文件"""
    path = params.get("path", "")
    pattern = params.get("pattern", "")

    if not pattern:
        return error_result("file_read", ErrorCode.PARAM_EMPTY,
                            "glob 操作需要 pattern 参数，例如 '**/*.py'")

    check = validate_path(path, require_write=False)
    if not check["allowed"]:
        return error_result("file_read", ErrorCode.EXEC_DENIED, check["reason"])

    real_path = check["real_path"]

    if not os.path.isdir(real_path):
        return error_result("file_read", ErrorCode.PARAM_INVALID,
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
            return success_result("file_read",
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

        return success_result("file_read", "\n".join(lines))

    except Exception as e:
        return error_result("file_read", ErrorCode.EXEC_FAILED, f"搜索失败: {e}")


# ========================================
# grep — 按文件内容搜索
# ========================================

def _action_grep(params: dict) -> dict:
    """按正则搜索文件内容"""
    path = params.get("path", "")
    pattern = params.get("pattern", "")
    case_sensitive = params.get("case_sensitive", False)

    if not pattern:
        return error_result("file_read", ErrorCode.PARAM_EMPTY,
                            "grep 操作需要 pattern 参数（正则表达式）")

    check = validate_path(path, require_write=False)
    if not check["allowed"]:
        return error_result("file_read", ErrorCode.EXEC_DENIED, check["reason"])

    real_path = check["real_path"]

    # 编译正则
    try:
        flags = 0 if case_sensitive else re.IGNORECASE
        regex = re.compile(pattern, flags)
    except re.error as e:
        return error_result("file_read", ErrorCode.PARAM_INVALID,
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
            return success_result("file_read",
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

        return success_result("file_read", "\n".join(lines))

    except Exception as e:
        return error_result("file_read", ErrorCode.EXEC_FAILED, f"搜索失败: {e}")


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
# info — 文件元信息
# ========================================

def _action_info(params: dict) -> dict:
    """获取文件或目录的元信息"""
    path = params.get("path", "")

    check = validate_path(path, require_write=False)
    if not check["allowed"]:
        return error_result("file_read", ErrorCode.EXEC_DENIED, check["reason"])

    real_path = check["real_path"]

    if not os.path.exists(real_path):
        return error_result("file_read", ErrorCode.PARAM_INVALID, f"路径不存在: {real_path}")

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

        return success_result("file_read", "\n".join(lines))

    except Exception as e:
        return error_result("file_read", ErrorCode.EXEC_FAILED, f"获取文件信息失败: {e}")
