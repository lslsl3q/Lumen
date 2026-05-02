"""
Lumen API 服务
用 FastAPI 把核心逻辑包装成 HTTP 接口，供前端调用
"""

import sys
import asyncio
import logging
from pathlib import Path
from contextlib import asynccontextmanager

# 添加项目根目录到 Python 路径
# 这样可以导入 lumen、api 等模块
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

# 初始化日志系统（控制台 + 文件双输出，按大小轮转）
from lumen.config import setup_logging
setup_logging()

logger = logging.getLogger("lumen.startup")


@asynccontextmanager
async def lifespan(app):
    """应用生命周期：启动时后台预加载重资源，退出时清理"""
    import threading

    def _preload():
        """后台预加载 jieba + embedding 模型（不阻塞事件循环）"""
        # 1. 预加载 jieba（首次 import 要加载词典，~2-3秒）
        try:
            import jieba
            jieba.initialize()
            logger.info("jieba 分词器预加载完成")
        except Exception as e:
            logger.warning(f"jieba 预加载失败: {e}")

        # 2. 预加载嵌入模型（~5-10秒，后续聊天时不再等待）
        try:
            from lumen.services import embedding
            loop = asyncio.new_event_loop()
            try:
                loop.run_until_complete(embedding.ensure_loaded())
            finally:
                loop.close()
            logger.info("嵌入模型预加载完成")
        except Exception as e:
            logger.warning(f"嵌入模型预加载失败: {e}")

    t = threading.Thread(target=_preload, daemon=True, name="preload")
    t.start()

    # 预加载完成后，异步触发知识库自动重建（如果 TDB 为空）+ registry 孤儿清理
    async def _auto_rebuild():
        # 等预加载线程完成（最多等 30 秒）
        t.join(timeout=30)
        try:
            from lumen.services.knowledge import rebuild_if_empty, cleanup_orphan_registry
            await rebuild_if_empty()
            orphans = cleanup_orphan_registry()
            if orphans:
                logger.info(f"Registry 孤儿清理: {orphans} 条")
        except Exception as e:
            logger.warning(f"知识库启动检查失败: {e}")

    import asyncio
    asyncio.ensure_future(_auto_rebuild())

    # T22: 启动反思管道后台消费者
    try:
        from lumen.core.reflection import init_reflection_queue
        init_reflection_queue()
    except Exception as e:
        logger.warning(f"反思管道启动失败: {e}")

    # T22 Step 4: 启动深梦境调度器
    try:
        from lumen.core.dream import init_dream_scheduler
        init_dream_scheduler()
    except Exception as e:
        logger.warning(f"深梦境调度器启动失败: {e}")

    yield  # 应用运行中...

    # T22: 优雅停止反思管道
    try:
        from lumen.core.reflection import shutdown_reflection_queue
        await shutdown_reflection_queue()
    except Exception as e:
        logger.warning(f"反思管道停止失败: {e}")

    # T22 Step 4: 优雅停止深梦境调度器
    try:
        from lumen.core.dream import shutdown_dream_scheduler
        await shutdown_dream_scheduler()
    except Exception as e:
        logger.warning(f"深梦境调度器停止失败: {e}")

    # 退出清理
    from lumen.services import history, vector_store, knowledge
    history.close_conn()
    vector_store.close()
    knowledge.close()


from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
import uvicorn

# 创建 FastAPI 应用
app = FastAPI(
    title="Lumen AI API",
    description="Lumen AI 的后端接口服务",
    version="1.0.0",
    lifespan=lifespan,
)

# 配置 CORS（允许前端跨域访问）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 开发阶段允许所有来源
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 导入路由
from api.routes import chat, session, character, config, ws, persona, authors_note, models, worldbook, avatar, skills, knowledge, memories, thinking_clusters, graph, tdb, system

# 注册路由
app.include_router(chat.router, prefix="/chat", tags=["聊天"])
app.include_router(session.router, prefix="/sessions", tags=["会话"])
app.include_router(character.router, prefix="/characters", tags=["角色"])
app.include_router(config.router, prefix="/config", tags=["配置"])
app.include_router(ws.router, prefix="/ws", tags=["WebSocket推送"])
app.include_router(persona.router, prefix="/personas", tags=["Persona"])
app.include_router(authors_note.router, prefix="/authors-note", tags=["Author's Note"])
app.include_router(models.router, prefix="/models", tags=["模型"])
app.include_router(worldbook.router, prefix="/worldbooks", tags=["世界书"])
app.include_router(avatar.router, prefix="/avatars", tags=["头像管理"])
app.include_router(skills.router, prefix="/skills", tags=["Skills"])
app.include_router(knowledge.router, prefix="/knowledge", tags=["知识库"])
app.include_router(memories.router, prefix="/memories", tags=["日记"])
app.include_router(thinking_clusters.router, prefix="/thinking-clusters", tags=["思维簇"])
app.include_router(graph.router, prefix="/graph", tags=["图谱"])
app.include_router(tdb.router, prefix="/tdb", tags=["TDB浏览"])
app.include_router(system.router, prefix="/api/system", tags=["系统管理"])

# 挂载头像静态文件目录
avatars_dir = Path(__file__).parent.parent / "lumen" / "characters" / "avatars"
avatars_dir.mkdir(parents=True, exist_ok=True)
app.mount("/avatars", StaticFiles(directory=str(avatars_dir)), name="avatars")


# 根路径健康检查
@app.get("/")
async def root():
    return {
        "message": "Lumen AI API 服务正在运行",
        "version": "1.0.0",
        "docs": "/docs"
    }


# 启动服务
if __name__ == "__main__":
    print("""
╔══════════════════════════════════════╗
║   🚀 Lumen AI API 服务启动中...      ║
╚══════════════════════════════════════╝

📍 API 地址：http://localhost:8888
📚 API 文档：http://localhost:8888/docs
💡 按 Ctrl+C 停止服务
    """)
    # Windows 不支持 reload，设置为 False
    uvicorn.run(app, host="127.0.0.1", port=8888, reload=False)
