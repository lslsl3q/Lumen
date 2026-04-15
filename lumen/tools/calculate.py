"""
工具：数学计算器
"""

from lumen.tools.base import success_result, error_result, ErrorCode


def execute(params: dict) -> dict:
    """计算数学表达式"""
    expression = params.get("expression", "")

    if not expression:
        return error_result(
            "calculate",
            ErrorCode.PARAM_EMPTY,
            "没有提供数学表达式",
            {"provided_params": params}
        )

    try:
        from asteval import Interpreter
        evaluator = Interpreter()
        result = evaluator(expression)
        data = f"{expression} = {result}"

        return success_result("calculate", data)
    except Exception as e:
        return error_result(
            "calculate",
            ErrorCode.EXEC_FAILED,
            f"计算错误: {e}",
            {"expression": expression, "error_type": type(e).__name__}
        )
