"""AccessControl 单元测试（纯白名单模型）"""
import pytest


class TestDefaultPermissions:
    """默认无权限"""

    def test_knowledge_read_default_deny(self, acl):
        assert acl.can_read("char_a", "knowledge", "knowledge") is False

    def test_knowledge_write_default_deny(self, acl):
        assert acl.can_write("char_a", "knowledge", "knowledge") is False

    def test_diary_read_default_deny(self, acl):
        assert acl.can_read("char_a", "diary", "agent_knowledge") is False

    def test_unknown_resource_default_deny(self, acl):
        assert acl.can_read("char_a", "unknown", "xxx") is False


class TestGrant:
    """授予权限"""

    def test_grant_knowledge_read(self, acl):
        acl.grant("char_a", "knowledge", "knowledge", "", "read")
        assert acl.can_read("char_a", "knowledge", "knowledge") is True

    def test_grant_diary_read(self, acl):
        acl.grant("char_a", "diary", "agent_knowledge", "", "read")
        assert acl.can_read("char_a", "diary", "agent_knowledge") is True

    def test_grant_write(self, acl):
        acl.grant("char_a", "knowledge", "knowledge", "/notes", "write")
        assert acl.can_write("char_a", "knowledge", "knowledge", "/notes") is True
        # read 不受影响
        assert acl.can_read("char_a", "knowledge", "knowledge", "/notes") is False


class TestPrefixInheritance:
    """前缀继承"""

    def test_child_inherits_parent(self, acl):
        acl.grant("char_a", "knowledge", "knowledge", "/地理", "read")
        assert acl.can_read("char_a", "knowledge", "knowledge", "/地理") is True
        assert acl.can_read("char_a", "knowledge", "knowledge", "/地理/亚洲") is True

    def test_grandchild_inherits(self, acl):
        acl.grant("char_a", "knowledge", "knowledge", "/地理", "read")
        assert acl.can_read("char_a", "knowledge", "knowledge", "/地理/亚洲/中国") is True

    def test_sibling_not_affected(self, acl):
        acl.grant("char_a", "knowledge", "knowledge", "/地理", "read")
        assert acl.can_read("char_a", "knowledge", "knowledge", "/天文") is False

    def test_longest_path_wins(self, acl):
        acl.grant("char_a", "knowledge", "knowledge", "/机密", "read")
        # /机密 被显式授予
        assert acl.can_read("char_a", "knowledge", "knowledge", "/机密") is True
        assert acl.can_read("char_a", "knowledge", "knowledge", "/机密/公开部分") is True


class TestRevoke:
    """撤销权限"""

    def test_revoke_single(self, acl):
        acl.grant("char_a", "knowledge", "knowledge", "/机密", "read")
        assert acl.can_read("char_a", "knowledge", "knowledge", "/机密") is True

        acl.revoke("char_a", "knowledge", "knowledge", "/机密", "read")
        assert acl.can_read("char_a", "knowledge", "knowledge", "/机密") is False

    def test_revoke_cascades_children(self, acl):
        acl.grant("char_a", "knowledge", "knowledge", "/机密", "read")
        acl.grant("char_a", "knowledge", "knowledge", "/机密/公开部分", "read")

        acl.revoke("char_a", "knowledge", "knowledge", "/机密", "read")
        assert acl.can_read("char_a", "knowledge", "knowledge", "/机密") is False
        assert acl.can_read("char_a", "knowledge", "knowledge", "/机密/公开部分") is False


class TestCharacterIsolation:
    """角色间隔离"""

    def test_different_characters(self, acl):
        acl.grant("char_a", "knowledge", "knowledge", "/机密", "read")
        assert acl.can_read("char_a", "knowledge", "knowledge", "/机密") is True
        assert acl.can_read("char_b", "knowledge", "knowledge", "/机密") is False


class TestManagement:
    """权限 CRUD"""

    def test_get_permissions(self, acl):
        acl.grant("char_a", "knowledge", "knowledge", "/地理", "read")
        acl.grant("char_a", "knowledge", "knowledge", "/天文", "read")

        perms = acl.get_permissions("char_a", "knowledge", "knowledge")
        assert len(perms) == 2
        paths = {p["folder_path"] for p in perms}
        assert paths == {"/地理", "/天文"}

    def test_batch_set(self, acl):
        acl.batch_set("char_a", "knowledge", "knowledge", [
            {"folder_path": "/地理", "action": "read"},
            {"folder_path": "/天文", "action": "read"},
        ])
        assert acl.can_read("char_a", "knowledge", "knowledge", "/地理") is True
        assert acl.can_read("char_a", "knowledge", "knowledge", "/天文") is True
        assert acl.can_read("char_a", "knowledge", "knowledge", "/机密") is False

    def test_batch_set_overwrites(self, acl):
        acl.grant("char_a", "knowledge", "knowledge", "/旧", "read")
        acl.batch_set("char_a", "knowledge", "knowledge", [
            {"folder_path": "/新", "action": "read"},
        ])
        assert acl.can_read("char_a", "knowledge", "knowledge", "/旧") is False
        assert acl.can_read("char_a", "knowledge", "knowledge", "/新") is True

    def test_get_characters_with_access(self, acl):
        acl.grant("char_a", "knowledge", "knowledge", "/地理", "read")
        acl.grant("char_b", "knowledge", "knowledge", "/地理", "read")

        chars = acl.get_characters_with_access("knowledge", "knowledge", "/地理", "read")
        assert set(chars) == {"char_a", "char_b"}

    def test_batch_check(self, acl):
        acl.grant("char_a", "knowledge", "knowledge", "/地理", "read")

        result = acl.batch_check("knowledge", "knowledge", "/地理", "read", ["char_a", "char_b"])
        assert result["char_a"] is True
        assert result["char_b"] is False


class TestRename:
    """文件夹重命名"""

    def test_rename_path(self, acl):
        acl.grant("char_a", "knowledge", "knowledge", "/旧名", "read")
        acl.grant("char_a", "knowledge", "knowledge", "/旧名/子目录", "read")

        acl.rename_path("knowledge", "knowledge", "/旧名", "/新名")

        assert acl.can_read("char_a", "knowledge", "knowledge", "/新名") is True
        assert acl.can_read("char_a", "knowledge", "knowledge", "/新名/子目录") is True
        assert acl.can_read("char_a", "knowledge", "knowledge", "/旧名") is False

    def test_cache_invalidation(self, acl):
        assert acl.can_read("char_a", "knowledge", "knowledge", "/机密") is False
        acl.grant("char_a", "knowledge", "knowledge", "/机密", "read")
        assert acl.can_read("char_a", "knowledge", "knowledge", "/机密") is True
