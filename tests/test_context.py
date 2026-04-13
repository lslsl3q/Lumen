"""
测试 context.py — 上下文管理
验证 trim_messages 是否正确截断聊天历史
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from context import trim_messages


def make_messages(count):
    """造 count 条假消息，方便测试"""
    msgs = [{"role": "system", "content": "系统提示词"}]
    for i in range(count):
        role = "user" if i % 2 == 0 else "assistant"
        msgs.append({"role": role, "content": f"消息{i}"})
    return msgs


# 测试1：消息没超限，不应该截断
def test_no_trim_when_short():
    messages = make_messages(10)
    result = trim_messages(messages, max_messages=50)
    assert result == messages, "消息没超限，不应该被截断"


# 测试2：消息超限了，应该截断
def test_trim_when_long():
    messages = make_messages(100)  # 1条系统 + 100条消息
    result = trim_messages(messages, max_messages=10)
    # 应该只剩：1条系统提示词 + 10条最近的
    assert len(result) == 11, f"应该剩11条，实际剩了{len(result)}条"
    assert result[0]["content"] == "系统提示词", "系统提示词必须保留"
    assert result[-1]["content"] == "消息99", "最后一条应该是最新的消息"


# 测试3：刚好等于限制，不应该截断
def test_trim_at_boundary():
    messages = make_messages(50)
    result = trim_messages(messages, max_messages=50)
    assert result == messages, "刚好等于限制，不应该截断"


# 测试4：只有系统提示词，不应该截断
def test_trim_only_system():
    messages = [{"role": "system", "content": "系统提示词"}]
    result = trim_messages(messages, max_messages=50)
    assert result == messages, "只有系统提示词，不应该截断"


print("运行测试...")
test_no_trim_when_short()
print("✅ 测试1通过：消息没超限，不截断")

test_trim_when_long()
print("✅ 测试2通过：消息超限，正确截断")

test_trim_at_boundary()
print("✅ 测试3通过：边界情况，不截断")

test_trim_only_system()
print("✅ 测试4通过：只有系统提示词，不截断")

print("\n全部通过！")
