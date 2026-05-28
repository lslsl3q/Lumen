"""PlotComponent — 5级 Plot 系统剧情结构注入

在 AI 续写/规划时注入当前场景关联的剧情上下文。
priority=22，放在 Lore(20) 之后、WritingContext(25) 之前。

当前写作模式走 direct_writing_stream（模板路径），不触发 Component 管道。
本组件为未来 Agent 管道预留，注册时 add_component(PlotComponent()) 即可。
"""

import asyncio
import logging

from lumen.components.base import ContextComponent, PromptZone
from lumen.prompt.template_engine import build_context, render, TemplateError

logger = logging.getLogger(__name__)


class PlotComponent(ContextComponent):
    """剧情结构注入组件：将 Plot 层级信息注入 prompt"""

    name = "plot"
    priority = 22
    zone = PromptZone.DYNAMIC

    async def pre_act(self, context: dict) -> str:
        book_id = context.get("book_id", "")
        if not book_id:
            return ""

        # 优先从 context 读取预加载数据（避免重复查库）
        plot_outline = context.get("preloaded_plot_outline")
        plot_for_scene = context.get("preloaded_plot_for_scene")

        from lumen.services.storage.writing import (
            get_plot_outline_for_project, get_plot_for_scene, list_scenes,
        )

        if not plot_outline:
            plot_outline = await asyncio.to_thread(get_plot_outline_for_project, book_id)
        if not plot_outline:
            return ""

        if not plot_for_scene:
            scene_id: str = context.get("scene_id", "")
            chapter_id: str = context.get("chapter_id", "")
            if not scene_id and chapter_id:
                scenes = await asyncio.to_thread(list_scenes, chapter_id)
                if scenes:
                    scene_id = scenes[-1]["id"]
            if scene_id:
                plot_for_scene = await asyncio.to_thread(get_plot_for_scene, scene_id)

        template_context = build_context(
            plot_outline=plot_outline,
            plot_for_scene=plot_for_scene,
        )

        try:
            return render("components/plot.md.j2", template_context)
        except TemplateError:
            logger.debug("PlotComponent 模板渲染跳过")
            return ""
