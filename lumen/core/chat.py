"""
Lumen - 对话核心模块
所有对话逻辑都在这，不管是终端还是网页都调用这里
"""

import logging

from lumen.core.session import ChatSession
from lumen.prompt.character import load_character
from lumen.prompt.builder import build_system_prompt
from lumen.core.context import trim_messages
from lumen.services import history
from lumen.services import memory
from lumen.tools.base import execute_tool, execute_tools_parallel, get_tool_prompt
from lumen.tools.parse import parse_tool_call
from lumen.config import get_model
from lumen.services.llm import chat
from lumen.tools.registry import get_registry
from lumen.prompt.template import render_messages, collect_variables

logger = logging.getLogger(__name__)


def _prepare_messages(messages, character_id: str = "default"):
    """预处理消息：裁剪上下文 + 模板变量替换

    所有发给 LLM 的消息都必须经过这个函数

    Args:
        messages: 原始消息列表
        character_id: 当前角色ID，用于加载对应的记忆
    """
    trimmed = trim_messages(messages)
    variables = collect_variables(character_id)
    return render_messages(trimmed, variables)


def validate_tool_call(tool_name: str, tool_params: dict) -> str:
    """
    验证 AI 的工具调用是否正确

    Args:
        tool_name: 工具名称
        tool_params: 参数字典

    Returns:
        None 如果验证通过，错误消息字符串如果验证失败
    """
    registry = get_registry()

    # 1. 检查工具是否存在
    if not registry.exists(tool_name):
        available = registry.list_tools()
        return f"工具 '{tool_name}' 不存在，可用工具: {', '.join(available)}"

    # 2. 获取工具定义
    tool_def = registry.get_tool(tool_name)
    params_def = tool_def.get("parameters", {})
    required_params = params_def.get("required", [])
    properties = params_def.get("properties", {})

    # 3. 检查必需参数是否都提供了
    missing_params = [p for p in required_params if p not in tool_params]
    if missing_params:
        return f"缺少必需参数: {', '.join(missing_params)}"

    # 4. 检查参数类型是否正确
    for param_name, param_value in tool_params.items():
        if param_name in properties:
            param_type = properties[param_name].get("type")
            if param_type == "string" and not isinstance(param_value, str):
                return f"参数 '{param_name}' 应该是字符串，得到: {type(param_value).__name__}"
            elif param_type in ["number", "integer"] and not isinstance(param_value, (int, float)):
                return f"参数 '{param_name}' 应该是数字，得到: {type(param_value).__name__}"
            elif param_type == "boolean" and not isinstance(param_value, bool):
                return f"参数 '{param_name}' 应该是布尔值，得到: {type(param_value).__name__}"
            elif param_type == "array" and not isinstance(param_value, list):
                return f"参数 '{param_name}' 应该是数组，得到: {type(param_value).__name__}"
            elif param_type == "object" and not isinstance(param_value, dict):
                return f"参数 '{param_name}' 应该是对象，得到: {type(param_value).__name__}"

    # 验证通过
    return None


def chat_non_stream(user_input: str, session: ChatSession) -> str:
    """非流式：等AI想完了再一次性返回

    Args:
        user_input: 用户输入
        session: ChatSession 实例

    Returns:
        AI 的完整回复
    """
    session.messages.append({"role": "user", "content": user_input})
    history.save_message(session.session_id, "user", user_input)

    trimmed = _prepare_messages(session.messages, session.character_id)
    model = get_model()

    response = chat(trimmed, model, stream=False)

    reply = response.choices[0].message.content
    session.messages.append({"role": "assistant", "content": reply})
    history.save_message(session.session_id, "assistant", reply)
    return reply


def chat_stream(user_input: str, session: ChatSession):
    """流式：AI想到一个字就给你一个字（支持工具调用）

    Args:
        user_input: 用户输入
        session: ChatSession 实例

    Yields:
        AI 的回复内容（增量）
    """
    session.messages.append({"role": "user", "content": user_input})
    history.save_message(session.session_id, "user", user_input)

    trimmed = _prepare_messages(session.messages, session.character_id)
    model = get_model()

    # 第一次调用：先收集完整回复，检查是否要调用工具
    response = chat(trimmed, model, stream=True)

    reply = ""
    for chunk in response:
        content = chunk.choices[0].delta.content
        if content:
            reply += content

    # 检查 AI 是不是想调用工具
    tool_call = parse_tool_call(reply)

    if tool_call:
        mode = tool_call.get("mode", "single")

        # ========== 单个工具 ==========
        if mode == "single":
            tool_name = tool_call.get("tool", "")
            tool_params = tool_call.get("params", {})

            # 验证工具调用是否正确
            validation_error = validate_tool_call(tool_name, tool_params)
            if validation_error:
                # 验证失败 → 反馈给 AI，让它重新思考
                logger.warning(f"工具验证失败: {validation_error}")
                error_feedback = f"[系统提示] 你的工具调用有误：{validation_error}。请重新分析用户需求，选择正确的工具和参数。"

                session.messages.append({"role": "assistant", "content": reply})
                session.messages.append({"role": "user", "content": error_feedback})

                # 让 AI 重新思考（不流式输出，因为这是内部重试）
                trimmed = _prepare_messages(session.messages, session.character_id)
                response = chat(trimmed, model, stream=False)
                retry_reply = response.choices[0].message.content

                # 递归处理重新思考的结果
                session.messages.append({"role": "assistant", "content": retry_reply})
                yield retry_reply
                history.save_message(session.session_id, "assistant", retry_reply)
                return

            # 验证通过 → 执行工具
            tool_result = execute_tool(tool_name, tool_params)
            logger.info(f"工具调用: {tool_name}({tool_params}) → {'✅' if tool_result['success'] else '❌'}")
            if tool_result["success"]:
                logger.debug(f"  数据: {tool_result['data']}")
                logger.debug(f"  耗时: {tool_result.get('execution_time', 'N/A')}ms")
            else:
                logger.warning(f"  错误: {tool_result['error_code']} - {tool_result['error_message']}")

            # 发送完整结果给 AI（用于判断成功/失败，调试问题）
            import json
            session.messages.append({"role": "assistant", "content": reply})
            session.messages.append({
                "role": "user",
                "content": json.dumps(tool_result, ensure_ascii=False),
                "metadata": {
                    "type": "tool_result",
                    "tool_name": tool_name,
                    "folded": False
                }
            })

        # ========== 多个工具并行 ==========
        elif mode == "parallel":
            calls = tool_call.get("calls", [])

            # 验证所有工具调用
            all_errors = []
            for call in calls:
                tool_name = call.get("tool", "")
                tool_params = call.get("params", {})
                error = validate_tool_call(tool_name, tool_params)
                if error:
                    all_errors.append(f"- {tool_name}: {error}")

            if all_errors:
                # 有验证失败 → 反馈给 AI
                logger.warning(f"并行工具验证失败:\n" + "\n".join(all_errors))
                error_feedback = f"[系统提示] 你的并行工具调用有误：\n" + "\n".join(all_errors) + "\n请重新分析用户需求，选择正确的工具和参数。"

                session.messages.append({"role": "assistant", "content": reply})
                session.messages.append({"role": "user", "content": error_feedback})

                # 让 AI 重新思考
                trimmed = _prepare_messages(session.messages, session.character_id)
                response = chat(trimmed, model, stream=False)
                retry_reply = response.choices[0].message.content

                session.messages.append({"role": "assistant", "content": retry_reply})
                yield retry_reply
                history.save_message(session.session_id, "assistant", retry_reply)
                return

            # 验证通过 → 并发执行所有工具
            logger.info(f"并行执行 {len(calls)} 个工具...")
            results = execute_tools_parallel(calls)

            # 打印结果
            for r in results:
                status = "✅" if r["success"] else "❌"
                logger.info(f"  - {r['tool']}: {status}")
                if r["success"]:
                    logger.debug(f"    数据: {r['data']}")
                    logger.debug(f"    耗时: {r.get('execution_time', 'N/A')}ms")
                else:
                    logger.warning(f"    错误: {r['error_code']} - {r['error_message']}")

            # 发送完整结果给 AI（JSON 数组格式）
            import json
            session.messages.append({"role": "assistant", "content": reply})
            session.messages.append({
                "role": "user",
                "content": json.dumps(results, ensure_ascii=False),
                "metadata": {
                    "type": "tool_result_parallel",
                    "tool_count": len(results),
                    "folded": False
                }
            })

        # 第二次调用：让 AI 根据工具结果回答用户（这次流式输出）
        trimmed = _prepare_messages(session.messages, session.character_id)
        response = chat(trimmed, model, stream=True)

        final_reply = ""
        for chunk in response:
            content = chunk.choices[0].delta.content
            if content:
                final_reply += content
                yield final_reply

        # 保存最终回复（工具调用过程不存，只存最终回答）
        session.messages.append({"role": "assistant", "content": final_reply})
        history.save_message(session.session_id, "assistant", final_reply)
    else:
        # 普通对话，直接返回
        session.messages.append({"role": "assistant", "content": reply})
        history.save_message(session.session_id, "assistant", reply)
        yield reply
