"""
会话管理器 - 替代全局状态
每个会话是一个独立实例，支持多会话并发
"""

from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field


@dataclass
class ChatSession:
    """聊天会话

    封装单个会话的所有状态：
    - character_id: 当前角色ID
    - session_id: 数据库中的会话ID
    - messages: 消息历史
    """
    character_id: str = "default"
    session_id: Optional[str] = None
    messages: List[Dict[str, Any]] = field(default_factory=list)

    def __post_init__(self):
        """初始化后自动加载角色"""
        if not self.session_id:
            self._initialize_new()
        else:
            self._initialize_existing()

    def _initialize_new(self):
        """初始化新会话"""
        from lumen.prompt.character import load_character
        from lumen.prompt.builder import build_system_prompt
        from lumen.services import memory, history
        character = load_character(self.character_id)

        # 构建系统提示词
        memory_text = memory.get_memory_context(self.character_id)

        dynamic_context = []
        if memory_text:
            dynamic_context.append({"content": memory_text, "injection_point": "system"})

        system_prompt = build_system_prompt(character, dynamic_context or None)

        # 创建数据库会话
        self.session_id = history.new_session(self.character_id)

        # 初始化消息
        self.messages = [{"role": "system", "content": system_prompt}]
        history.save_message(self.session_id, "system", system_prompt)

    def _initialize_existing(self):
        """加载已有会话"""
        from lumen.prompt.character import load_character
        from lumen.prompt.builder import build_system_prompt
        from lumen.services import memory, history
        character = load_character(self.character_id)

        # 构建系统提示词（包含记忆）
        memory_text = memory.get_memory_context(self.character_id)

        dynamic_context = []
        if memory_text:
            dynamic_context.append({"content": memory_text, "injection_point": "system"})

        system_prompt = build_system_prompt(character, dynamic_context or None)

        # 加载历史消息
        old_messages = history.load_session(self.session_id)
        self.messages = [{"role": "system", "content": system_prompt}] + old_messages

    async def switch_character(self, new_character_id: str):
        """切换角色（创建新会话）"""
        from lumen.services import memory

        # 给当前会话生成摘要
        if self.session_id:
            chat_msgs = [m for m in self.messages if m["role"] != "system"]
            if len(chat_msgs) > 1:
                await memory.summarize_session(self.session_id, self.character_id, self.messages)

        # 重置为新角色
        self.character_id = new_character_id
        self.session_id = None
        self.messages = []
        self._initialize_new()

    def reset(self):
        """清空历史，用当前角色创建新会话"""
        current_char = self.character_id
        self.session_id = None
        self.messages = []
        self.character_id = current_char
        self._initialize_new()

    def reload_system_prompt(self):
        """重载系统提示词（Persona 切换后调用）

        只替换 messages[0]（system 消息），不丢失聊天历史
        """
        from lumen.prompt.character import load_character
        from lumen.prompt.builder import build_system_prompt
        from lumen.services import memory

        character = load_character(self.character_id)
        memory_text = memory.get_memory_context(self.character_id)

        dynamic_context = []
        if memory_text:
            dynamic_context.append({"content": memory_text, "injection_point": "system"})

        system_prompt = build_system_prompt(character, dynamic_context or None)
        self.messages[0] = {"role": "system", "content": system_prompt}


class SessionManager:
    """全局会话管理器（单例，带最大容量限制）"""

    _instance: Optional["SessionManager"] = None
    _sessions: Dict[str, ChatSession] = {}
    MAX_SESSIONS = 50

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def _evict_if_needed(self):
        """超过最大容量时淘汰最早的会话"""
        while len(self._sessions) > self.MAX_SESSIONS:
            oldest_key = next(iter(self._sessions))
            del self._sessions[oldest_key]

    def get_or_create(self, session_id: str = "default") -> ChatSession:
        """获取或创建会话

        优先从内存获取，若不在内存则查数据库：
        - 数据库存在 → 加载已有会话（带历史消息）
        - 数据库不存在 → 创建新会话
        """
        if session_id not in self._sessions:
            from lumen.services import history as history_service
            info = history_service.get_session_info(session_id)
            if info:
                self._sessions[session_id] = ChatSession(
                    character_id=info["character_id"],
                    session_id=session_id,
                )
            else:
                self._sessions[session_id] = ChatSession(character_id="default")
            self._evict_if_needed()
        return self._sessions[session_id]

    def create_new(self, character_id: str = "default") -> ChatSession:
        """创建新会话（生成新 ID）"""
        session = ChatSession(character_id=character_id)
        self._sessions[session.session_id] = session
        self._evict_if_needed()
        return session

    def get(self, session_id: str) -> Optional[ChatSession]:
        """获取会话（不存在返回 None）

        Args:
            session_id: 会话ID

        Returns:
            ChatSession 实例或 None
        """
        return self._sessions.get(session_id)

    def remove(self, session_id: str):
        """移除会话

        Args:
            session_id: 要移除的会话ID
        """
        if session_id in self._sessions:
            del self._sessions[session_id]


# 全局单例
_manager = SessionManager()


def get_session_manager() -> SessionManager:
    """获取会话管理器单例

    Returns:
        SessionManager 实例
    """
    return _manager
