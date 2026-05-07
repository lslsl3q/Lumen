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
