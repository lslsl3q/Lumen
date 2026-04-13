"""
Lumen - 网页界面
只管显示，不管逻辑，所有对话都调用 chat.py
"""

import gradio as gr
from chat import chat_stream, reset, load
from prompt import list_characters
import history


def get_character_choices():
    """获取角色列表"""
    chars = list_characters()
    return [(name, char_id) for char_id, name in chars]


def get_session_choices():
    """获取历史会话列表"""
    sessions = history.list_sessions(limit=20)
    # 格式：(显示名, 会话ID)
    return [(f"{s[0]} ({s[2][:16]})", s[0]) for s in sessions]


def respond(message, chatbot_history):
    """收到用户消息，流式返回AI回复"""
    user_msg = {"role": "user", "content": message}
    for partial_reply in chat_stream(message):
        yield chatbot_history + [user_msg, {"role": "assistant", "content": partial_reply}]


def switch_character(char_name):
    """切换角色，创建新会话"""
    character = load(char_name)
    greeting = character.get("greeting", "你好！")
    return [], greeting, gr.Dropdown(choices=get_session_choices())


def clear_chat():
    """清空聊天，创建新会话"""
    reset()
    return "", [], gr.Dropdown(choices=get_session_choices())


def load_old_session(session_id):
    """加载历史会话"""
    if not session_id:
        return [], ""
    # 从数据库加载，用默认角色
    character = load("default", session_id=session_id)
    # 把消息转成 Gradio 格式
    from chat import messages
    chatbot_msgs = []
    for msg in messages:
        if msg["role"] in ("user", "assistant"):
            chatbot_msgs.append({"role": msg["role"], "content": msg["content"]})
    return chatbot_msgs, ""


def delete_selected_session(session_id):
    """删除选中的会话"""
    if not session_id:
        return gr.Dropdown(choices=get_session_choices())
    history.delete_session(session_id)
    return gr.Dropdown(choices=get_session_choices())


# 构建下拉框选项
character_choices = get_character_choices()
default_char_id = character_choices[0][1] if character_choices else "default"
session_choices = get_session_choices()


with gr.Blocks(title="Lumen") as demo:
    gr.Markdown("# Lumen\n你的AI助手")

    with gr.Row():
        char_dropdown = gr.Dropdown(
            choices=character_choices,
            value=default_char_id,
            label="选择角色",
            scale=3,
        )
        switch_btn = gr.Button("切换", scale=1)
        clear_btn = gr.Button("新会话", scale=1)

    # 历史会话下拉框
    session_dropdown = gr.Dropdown(
        choices=session_choices,
        label="历史会话",
        scale=4,
    )
    load_btn = gr.Button("加载", scale=1)
    delete_btn = gr.Button("删除", scale=1)

    chatbot = gr.Chatbot()
    msg = gr.Textbox(
        placeholder="输入消息...",
        show_label=False,
    )
    send_btn = gr.Button("发送")

    # 发送消息
    msg.submit(respond, [msg, chatbot], [chatbot])
    send_btn.click(respond, [msg, chatbot], [chatbot])

    # 发送后清空输入框
    msg.submit(lambda: "", None, [msg])
    send_btn.click(lambda: "", None, [msg])

    # 切换角色
    switch_btn.click(switch_character, [char_dropdown], [chatbot, msg, session_dropdown])

    # 新会话
    clear_btn.click(clear_chat, None, [msg, chatbot, session_dropdown])

    # 加载历史会话
    load_btn.click(load_old_session, [session_dropdown], [chatbot, msg])

    # 删除历史会话
    delete_btn.click(delete_selected_session, [session_dropdown], [session_dropdown])


demo.queue()
demo.launch()
