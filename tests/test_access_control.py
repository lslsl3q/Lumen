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
