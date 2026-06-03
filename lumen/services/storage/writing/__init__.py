"""
writing 存储层 facade

Re-export 所有子模块的公共符号，保持调用方零改动。
新代码应直接从子模块导入（如 ``from .manuscript import create_project``）。
"""

from ._base import get_conn, close_conn, write_lock, DB_PATH

from .manuscript import *  # noqa: F401,F403
from .manuscript import __all__ as _manuscript_all

from .codex import *  # noqa: F401,F403
from .codex import __all__ as _codex_all

from .plot import *  # noqa: F401,F403
from .plot import __all__ as _plot_all

from .snippet import *  # noqa: F401,F403
from .snippet import __all__ as _snippet_all

from .chat import *  # noqa: F401,F403
from .chat import __all__ as _chat_all

from .progression import *  # noqa: F401,F403
from .progression import __all__ as _progression_all

__all__ = [
    # _base
    "get_conn", "close_conn", "write_lock", "DB_PATH",
    # manuscript
    *_manuscript_all,
    # codex
    *_codex_all,
    # plot
    *_plot_all,
    # snippet
    *_snippet_all,
    # chat
    *_chat_all,
    # progression
    *_progression_all,
]
