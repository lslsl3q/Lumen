"""
Chrome Bridge HTTP API

让外部工具（Claude Code）能复用 Lumen 的 Chrome Bridge 连接。
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from lumen.services.chrome_bridge import get_chrome_bridge

router = APIRouter()


class BridgeCommand(BaseModel):
    command: str
    url: str = ""
    target: str = ""
    text: str = ""
    selector: str = ""
    timeout: float = 30.0


@router.get("/chrome-bridge/status")
async def bridge_status():
    """查询 Chrome Bridge 连接状态"""
    bridge = get_chrome_bridge()
    return {"connected": bridge.connected, "client_id": bridge._client_id}


@router.post("/chrome-bridge/execute")
async def bridge_execute(cmd: BridgeCommand):
    """执行 Chrome Bridge 命令（直接返回结果）"""
    bridge = get_chrome_bridge()
    if not bridge.connected:
        raise HTTPException(status_code=503, detail="Chrome Bridge 未连接")

    try:
        result = await bridge.execute(
            command=cmd.command,
            url=cmd.url,
            target=cmd.target,
            text=cmd.text,
            selector=cmd.selector,
            timeout=cmd.timeout,
        )
        return {"ok": True, "data": result}
    except TimeoutError as e:
        raise HTTPException(status_code=504, detail=str(e))
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
