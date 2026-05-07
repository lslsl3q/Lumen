"""权限 REST API 集成测试"""
import pytest
from httpx import AsyncClient, ASGITransport


@pytest.fixture
def app(tmp_db):
    """创建测试用 FastAPI app"""
    from api.main import app
    return app


@pytest.fixture
def transport(app):
    return ASGITransport(app=app)


@pytest.mark.asyncio
async def test_get_character_permissions_empty(transport, tmp_db):
    """获取角色的空权限列表"""
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/permissions/character/char_a", params={
            "resource_type": "knowledge",
            "resource_id": "knowledge",
        })
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_set_and_get_permissions(transport, tmp_db):
    """设置权限后可以获取"""
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.put("/permissions/character/char_a", json={
            "resource_type": "knowledge",
            "resource_id": "knowledge",
            "entries": [
                {"folder_path": "/地理", "action": "read", "access": "allow"},
                {"folder_path": "/机密", "action": "read", "access": "deny"},
            ],
        })
        assert resp.status_code == 200

        resp = await client.get("/permissions/character/char_a", params={
            "resource_type": "knowledge",
            "resource_id": "knowledge",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2


@pytest.mark.asyncio
async def test_get_resource_permissions(transport, tmp_db):
    """按资源反查角色权限"""
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.put("/permissions/character/char_a", json={
            "resource_type": "knowledge",
            "resource_id": "knowledge",
            "entries": [{"folder_path": "/地理", "action": "read", "access": "allow"}],
        })
        await client.put("/permissions/character/char_b", json={
            "resource_type": "knowledge",
            "resource_id": "knowledge",
            "entries": [{"folder_path": "/地理", "action": "read", "access": "allow"}],
        })

        resp = await client.get("/permissions/resource/knowledge/knowledge", params={
            "folder_path": "/地理",
            "action": "read",
        })
        assert resp.status_code == 200
        characters = resp.json()
        assert set(characters) == {"char_a", "char_b"}
