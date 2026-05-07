"""AccessControl 单元测试"""
import pytest


class TestDefaultPermissions:
    def test_knowledge_read_default_allow(self, acl):
        assert acl.can_read("char_a", "knowledge", "knowledge") is True

    def test_knowledge_write_default_deny(self, acl):
        assert acl.can_write("char_a", "knowledge", "knowledge") is False

    def test_diary_read_default_deny(self, acl):
        assert acl.can_read("char_a", "diary", "agent_knowledge") is False

    def test_diary_write_default_deny(self, acl):
        assert acl.can_write("char_a", "diary", "agent_knowledge") is False

    def test_unknown_resource_type_default_deny(self, acl):
        assert acl.can_read("char_a", "unknown", "xxx") is False


class TestACLRules:
    """ACL 规则覆盖默认值"""

    def test_deny_knowledge_read(self, acl):
        """deny 规则覆盖 knowledge 默认的公开读"""
        acl.set_permission("char_a", "knowledge", "knowledge", "/机密", "read", "deny")
        assert acl.can_read("char_a", "knowledge", "knowledge", "/机密") is False

    def test_allow_diary_read(self, acl):
        """allow 规则覆盖 diary 默认的私有"""
        acl.set_permission("char_a", "diary", "agent_knowledge", "", "read", "allow")
        assert acl.can_read("char_a", "diary", "agent_knowledge") is True

    def test_subfolder_inherits_deny(self, acl):
        """子路径继承父路径的 deny"""
        acl.set_permission("char_a", "knowledge", "knowledge", "/机密", "read", "deny")
        assert acl.can_read("char_a", "knowledge", "knowledge", "/机密/财务") is False

    def test_subfolder_inherits_allow(self, acl):
        """子路径继承父路径的 allow"""
        acl.set_permission("char_a", "knowledge", "knowledge", "/地理", "read", "allow")
        assert acl.can_read("char_a", "knowledge", "knowledge", "/地理/亚洲") is True

    def test_longest_path_wins(self, acl):
        """最长路径匹配优先"""
        acl.set_permission("char_a", "knowledge", "knowledge", "/机密", "read", "deny")
        acl.set_permission("char_a", "knowledge", "knowledge", "/机密/公开部分", "read", "allow")

        assert acl.can_read("char_a", "knowledge", "knowledge", "/机密/公开部分") is True
        assert acl.can_read("char_a", "knowledge", "knowledge", "/机密/其他") is False
        assert acl.can_read("char_a", "knowledge", "knowledge", "/机密") is False

    def test_different_characters_isolated(self, acl):
        """不同角色的 ACL 互不影响"""
        acl.set_permission("char_a", "knowledge", "knowledge", "/机密", "read", "deny")
        assert acl.can_read("char_b", "knowledge", "knowledge", "/机密") is True

    def test_different_actions_isolated(self, acl):
        """read 和 write 互不影响"""
        acl.set_permission("char_a", "knowledge", "knowledge", "", "read", "allow")
        assert acl.can_read("char_a", "knowledge", "knowledge") is True
        assert acl.can_write("char_a", "knowledge", "knowledge") is False


class TestPermissionManagement:
    """权限 CRUD 操作"""

    def test_remove_permission(self, acl):
        """删除 ACL 规则后回退到默认值"""
        acl.set_permission("char_a", "knowledge", "knowledge", "/机密", "read", "deny")
        assert acl.can_read("char_a", "knowledge", "knowledge", "/机密") is False

        acl.remove_permission("char_a", "knowledge", "knowledge", "/机密", "read")
        assert acl.can_read("char_a", "knowledge", "knowledge", "/机密") is True

    def test_remove_cascades_children(self, acl):
        """删除父路径规则时，递归删除子路径规则"""
        acl.set_permission("char_a", "knowledge", "knowledge", "/机密", "read", "deny")
        acl.set_permission("char_a", "knowledge", "knowledge", "/机密/公开部分", "read", "allow")

        acl.remove_permission("char_a", "knowledge", "knowledge", "/机密", "read")

        assert acl.can_read("char_a", "knowledge", "knowledge", "/机密") is True
        assert acl.can_read("char_a", "knowledge", "knowledge", "/机密/公开部分") is True

    def test_get_permissions(self, acl):
        """获取角色的所有权限路径"""
        acl.set_permission("char_a", "knowledge", "knowledge", "/地理", "read", "allow")
        acl.set_permission("char_a", "knowledge", "knowledge", "/天文", "read", "allow")
        acl.set_permission("char_a", "knowledge", "knowledge", "/机密", "read", "deny")

        perms = acl.get_permissions("char_a", "knowledge", "knowledge")
        assert len(perms) == 3
        paths = {p["folder_path"] for p in perms}
        assert paths == {"/地理", "/天文", "/机密"}

    def test_batch_set_permissions(self, acl):
        """批量设置权限"""
        entries = [
            {"folder_path": "/地理", "action": "read", "access": "allow"},
            {"folder_path": "/天文", "action": "read", "access": "allow"},
            {"folder_path": "/机密", "action": "read", "access": "deny"},
        ]
        acl.batch_set_permissions("char_a", "knowledge", "knowledge", entries)

        assert acl.can_read("char_a", "knowledge", "knowledge", "/地理") is True
        assert acl.can_read("char_a", "knowledge", "knowledge", "/天文") is True
        assert acl.can_read("char_a", "knowledge", "knowledge", "/机密") is False

    def test_get_characters_with_access(self, acl):
        """反查：获取有权限的角色列表"""
        acl.set_permission("char_a", "knowledge", "knowledge", "/地理", "read", "allow")
        acl.set_permission("char_b", "knowledge", "knowledge", "/地理", "read", "allow")

        chars = acl.get_characters_with_access("knowledge", "knowledge", "/地理", "read")
        assert set(chars) == {"char_a", "char_b"}
