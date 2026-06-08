"""
SubAgentRunner — 轻量子代理执行器

创建临时 LLM 调用，不带工具/记忆/身份。
第一版只做 SINGLE 模式（纯文本输入输出）。

后续可扩展：
- 带工具的子代理（可调 web_search 等）
- CHAIN 模式（多个子代理串行）
- PARALLEL 模式（多个子代理并行）
"""

import logging

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = (
    "你是子代理，负责完成主代理分配的子任务。"
    "直接给出结果，不要解释过程。"
    "如果任务不明确，给出你认为最合理的答案。"
)


class SubAgentRunner:
    """轻量子代理 — 单次 LLM 调用，用完即弃"""

    async def run(self, task: str, context: str = "") -> str:
        """执行子任务，返回结果文本

        Args:
            task: 子任务描述
            context: 可选的额外上下文

        Returns:
            子代理的回复文本
        """
        from lumen.services.llm import chat
        from lumen.config import get_model

        user_content = f"上下文：{context}\n\n任务：{task}" if context else task

        messages = [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ]

        response = await chat(messages=messages, model=get_model(), stream=False)
        if response and response.choices:
            return response.choices[0].message.content or ""
        return ""
