"""Lumen 测试共享 fixtures"""
import pytest


@pytest.fixture
def tmp_db(tmp_path):
    """创建临时 permissions.db 并 patch 模块级路径"""
    db_path = str(tmp_path / "permissions.db")

    import lumen.services.access_control as ac
    original_db_path = ac.DB_PATH

    ac.DB_PATH = db_path
    if hasattr(ac._local, "conn") and ac._local.conn is not None:
        ac._local.conn.close()
        ac._local.conn = None

    ac._instance = None

    yield db_path

    ac.DB_PATH = original_db_path
    if hasattr(ac._local, "conn") and ac._local.conn is not None:
        ac._local.conn.close()
        ac._local.conn = None
    ac._instance = None


@pytest.fixture
def acl(tmp_db):
    """返回已初始化的 AccessControl 实例"""
    from lumen.services.access_control import get_instance
    return get_instance()
