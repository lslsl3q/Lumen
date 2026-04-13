"""
Lumen - 对话核心模块
所有对话逻辑都在这，不管是终端还是网页都调用这里
"""

from .prompt import load_character, build_system_prompt, list_characters
from .context import trim_messages
from . import history
from . import memory
from . import tools
from .config import get_model
from .llm import chat
from tool_lib.registry import get_registry

# 2. 当前状态
current_character_id = "default"
current_session_id = None  # 当前会话ID
messages = []


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


def load(character_id: str = "default", session_id: str = None):
    """加载角色，初始化聊天历史

    character_id: 角色ID
    session_id: 如果传了，就从数据库加载旧会话；不传就创建新会话
    """
    global current_character_id, current_session_id, messages

    # 切会话前，给当前会话生成摘要（有实际对话内容才摘要）
    if current_session_id:
        chat_msgs = [m for m in messages if m["role"] != "system"]
        if len(chat_msgs) > 1:
            memory.summarize_session(current_session_id, current_character_id, messages)

    current_character_id = character_id
    character = load_character(character_id)

    # 读取记忆，注入到 system prompt
    memory_text = memory.get_memory_context(character_id)
    tool_text = tools.get_tool_prompt()

    dynamic_context = []
    if memory_text:
        dynamic_context.append({"content": memory_text, "injection_point": "system"})
    if tool_text:
        dynamic_context.append({"content": tool_text, "injection_point": "system"})

    system_prompt = build_system_prompt(
        character,
        dynamic_context if dynamic_context else None
    )

    if session_id:
        # 加载旧会话
        current_session_id = session_id
        old_messages = history.load_session(session_id)
        messages = [{"role": "system", "content": system_prompt}] + old_messages
    else:
        # 创建新会话
        current_session_id = history.new_session(character_id)
        # 把系统提示词也存一份
        messages = [{"role": "system", "content": system_prompt}]
        history.save_message(current_session_id, "system", system_prompt)

    return character


def chat_non_stream(user_input: str) -> str:
    """非流式：等AI想完了再一次性返回"""
    messages.append({"role": "user", "content": user_input})
    history.save_message(current_session_id, "user", user_input)

    trimmed = trim_messages(messages)
    model = get_model()

    response = chat(trimmed, model, stream=False)

    reply = response.choices[0].message.content
    messages.append({"role": "assistant", "content": reply})
    history.save_message(current_session_id, "assistant", reply)
    return reply


def chat_stream(user_input: str):
    """流式：AI想到一个字就给你一个字（支持工具调用）"""
    messages.append({"role": "user", "content": user_input})
    history.save_message(current_session_id, "user", user_input)

    trimmed = trim_messages(messages)
    model = get_model()

    # 第一次调用：先收集完整回复，检查是否要调用工具
    response = chat(trimmed, model, stream=True)

    reply = ""
    for chunk in response:
        content = chunk.choices[0].delta.content
        if content:
            reply += content

    # 检查 AI 是不是想调用工具
    tool_call = tools.parse_tool_call(reply)

    if tool_call:
        # AI 想调用工具 → 先验证 → 再执行
        tool_name = tool_call.get("tool", "")
        tool_params = tool_call.get("params", {})

        # 验证工具调用是否正确
        validation_error = validate_tool_call(tool_name, tool_params)
        if validation_error:
            # 验证失败 → 反馈给 AI，让它重新思考
            print(f"[工具验证] ❌ {validation_error}")
            error_feedback = f"[系统提示] 你的工具调用有误：{validation_error}。请重新分析用户需求，选择正确的工具和参数。"

            messages.append({"role": "assistant", "content": reply})
            messages.append({"role": "user", "content": error_feedback})

            # 让 AI 重新思考（不流式输出，因为这是内部重试）
            trimmed = trim_messages(messages)
            response = chat(trimmed, model, stream=False)
            retry_reply = response.choices[0].message.content

            # 递归处理重新思考的结果
            messages.append({"role": "assistant", "content": retry_reply})
            yield retry_reply
            history.save_message(current_session_id, "assistant", retry_reply)
            return

        # 验证通过 → 执行工具
        tool_result = tools.execute_tool(tool_name, tool_params)
        print(f"[工具调用] {tool_name}({tool_params}) → {tool_result}")

        # 把工具调用的过程加入消息历史
        messages.append({"role": "assistant", "content": reply})
        messages.append({"role": "user", "content": f"[工具执行结果] {tool_result}"})

        # 第二次调用：让 AI 根据工具结果回答用户（这次流式输出）
        trimmed = trim_messages(messages)
        response = chat(trimmed, model, stream=True)

        final_reply = ""
        for chunk in response:
            content = chunk.choices[0].delta.content
            if content:
                final_reply += content
                yield final_reply

        # 保存最终回复（工具调用过程不存，只存最终回答）
        messages.append({"role": "assistant", "content": final_reply})
        history.save_message(current_session_id, "assistant", final_reply)
    else:
        # 普通对话，直接返回
        messages.append({"role": "assistant", "content": reply})
        history.save_message(current_session_id, "assistant", reply)
        yield reply


def reset():
    """清空聊天历史，用当前角色创建新会话"""
    return load(current_character_id)


# 启动时加载默认角色（创建新会话）
load("default")
