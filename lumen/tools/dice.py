"""
工具：dice — RPG 掷骰

支持标准骰子表达式（如 2d6+3、1d20、3d8-1）。
纯计算，不依赖外部服务。
"""

import re
import random
import logging

from lumen.tool import success_result, error_result, ErrorCode

logger = logging.getLogger(__name__)

_DICE_PATTERN = re.compile(
    r"^(\d+)?d(\d+)([+-]\d+)?$",
    re.IGNORECASE,
)


def _roll(count: int, sides: int, modifier: int) -> dict:
    rolls = [random.randint(1, sides) for _ in range(count)]
    total = sum(rolls) + modifier
    return {
        "expression": f"{count}d{sides}{'+' if modifier >= 0 else ''}{modifier if modifier else ''}",
        "rolls": rolls,
        "modifier": modifier,
        "total": total,
    }


def execute(params: dict, command: str = "") -> dict:
    """掷骰子"""
    expression = params.get("expression", "1d20").strip().lower()

    match = _DICE_PATTERN.match(expression)
    if not match:
        return error_result(
            "dice",
            ErrorCode.PARAM_INVALID,
            f"无效的骰子表达式: {expression}",
            {"help": "格式: NdS[+M]，如 2d6+3, 1d20, 3d8-1"},
        )

    count = int(match.group(1)) if match.group(1) else 1
    sides = int(match.group(2))
    modifier = int(match.group(3)) if match.group(3) else 0

    if count < 1 or count > 100:
        return error_result("dice", ErrorCode.PARAM_INVALID, "骰子数量须在 1-100 之间")
    if sides < 2 or sides > 1000:
        return error_result("dice", ErrorCode.PARAM_INVALID, "骰子面数须在 2-1000 之间")

    result = _roll(count, sides, modifier)
    result["message"] = f"掷骰 {result['expression']}: {result['rolls']} = {result['total']}"
    logger.info(f"掷骰 {result['expression']}: {result['rolls']} = {result['total']}")

    return success_result(
        "dice",
        result,
    )
