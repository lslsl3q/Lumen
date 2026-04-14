"""
Lumen API 服务
用 FastAPI 把核心逻辑包装成 HTTP 接口，供前端调用
"""

import sys
from pathlib import Path

# 添加项目根目录到 Python 路径
# 这样可以导入 lumen、api 等模块
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import uvicorn

# 创建 FastAPI 应用
app = FastAPI(
    title="Lumen AI API",
    description="Lumen AI 的后端接口服务",
    version="1.0.0"
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
from api.routes import chat, session, character

# 注册路由
app.include_router(chat.router, prefix="/chat", tags=["聊天"])
app.include_router(session.router, prefix="/sessions", tags=["会话"])
app.include_router(character.router, prefix="/characters", tags=["角色"])


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
