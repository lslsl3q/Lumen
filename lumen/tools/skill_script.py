"""
Lumen - Skill 脚本安全执行器

在子进程中执行 skill 附带的脚本，返回 stdout。
安全措施：超时、输出截断、路径限制。
"""
import os
import asyncio
import hashlib
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# 脚本执行约束
SCRIPT_TIMEOUT = 30       # 秒
MAX_OUTPUT_CHARS = 2000    # 字符
MAX_FILE_SIZE = 1024 * 1024  # 1MB

# 已信任的脚本（skill_id + 脚本相对路径 → 哈希）
_trusted_scripts: dict[str, str] = {}


def _script_hash(script_path: str) -> str:
    """计算脚本文件的 SHA256 哈希"""
    h = hashlib.sha256()
    with open(script_path, "rb") as f:
        h.update(f.read())
    return h.hexdigest()


def is_script_trusted(skill_id: str, script_rel_path: str, script_path: str) -> bool:
    """检查脚本是否已被信任"""
    key = f"{skill_id}/{script_rel_path}"
    trusted_hash = _trusted_scripts.get(key)
    if trusted_hash is None:
        return False
    return _script_hash(script_path) == trusted_hash


def trust_script(skill_id: str, script_rel_path: str, script_path: str):
    """将脚本加入信任白名单"""
    key = f"{skill_id}/{script_rel_path}"
    _trusted_scripts[key] = _script_hash(script_path)
    logger.info(f"脚本已信任: {key}")


def validate_script_path(skill_dir: str, script_rel_path: str) -> str:
    """验证脚本路径安全性（防路径穿越）

    Returns:
        脚本绝对路径

    Raises:
        ValueError: 路径不合法
    """
    if not script_rel_path:
        raise ValueError("脚本路径为空")
    if any(part == ".." for part in script_rel_path.replace("\\", "/").split("/")):
        raise ValueError("脚本路径不能包含 ..")
    if script_rel_path.startswith("/") or script_rel_path.startswith("\\"):
        raise ValueError("脚本路径必须是相对路径")

    abs_path = os.path.normpath(os.path.join(skill_dir, script_rel_path))
    if not abs_path.startswith(os.path.normpath(skill_dir)):
        raise ValueError(f"脚本路径超出 skill 目录: {script_rel_path}")
    if not os.path.isfile(abs_path):
        raise ValueError(f"脚本文件不存在: {script_rel_path}")
    if os.path.getsize(abs_path) > MAX_FILE_SIZE:
        raise ValueError(f"脚本文件过大（超过 1MB）: {script_rel_path}")

    return abs_path


async def run_skill_script(
    script_path: str,
    args: str = "",
    skill_dir: str = "",
    timeout: int = SCRIPT_TIMEOUT,
) -> str:
    """在子进程中执行 skill 脚本

    Args:
        script_path: 脚本绝对路径
        args: 用户传入的参数
        skill_dir: skill 目录路径（设置工作目录）
        timeout: 超时秒数

    Returns:
        脚本 stdout 输出（截断后）
    """
    env = os.environ.copy()
    # 传递 Lumen 工具 API 路径，让脚本能 import
    lumen_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    env["LUMEN_ROOT"] = lumen_root
    env["LUMEN_SKILL_DIR"] = skill_dir or os.path.dirname(script_path)
    env["LUMEN_SKILL_ARGS"] = args

    # 判断脚本类型
    if script_path.endswith(".py"):
        cmd = ["python", script_path]
    elif script_path.endswith(".sh"):
        cmd = ["bash", script_path]
    else:
        cmd = [script_path]

    if args:
        cmd.append(args)

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=skill_dir or None,
            env=env,
        )

        try:
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(), timeout=timeout
            )
        except asyncio.TimeoutError:
            proc.kill()
            try:
                await asyncio.wait_for(proc.wait(), timeout=5)
            except asyncio.TimeoutError:
                logger.warning(f"进程 kill 后仍未退出: {script_path}")
            logger.warning(f"脚本超时 ({timeout}s): {script_path}")
            return f"[脚本执行超时 ({timeout}s)]"

        output = stdout.decode("utf-8", errors="replace").strip()

        if proc.returncode != 0:
            err = stderr.decode("utf-8", errors="replace").strip()
            logger.warning(f"脚本退出码 {proc.returncode}: {err[:200]}")
            return f"[脚本执行失败 (exit {proc.returncode})]\n{err[:500]}"

        # 截断输出
        if len(output) > MAX_OUTPUT_CHARS:
            output = output[:MAX_OUTPUT_CHARS] + "\n...（输出已截断）"

        return output

    except FileNotFoundError:
        logger.error(f"脚本解释器不存在: {script_path}")
        return "[脚本执行失败：找不到解释器]"
    except Exception as e:
        logger.error(f"脚本执行异常: {e}")
        return f"[脚本执行异常: {e}]"
