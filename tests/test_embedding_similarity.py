"""测试嵌入模型在中文实体名称上的余弦相似度分布

目的：为图谱去重的向量阈值提供实证数据
用法：.venv/Scripts/python.exe tests/test_embedding_similarity.py
"""
import asyncio
import sys
import os
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


# 测试对：(名称A, 名称B, 是否应该是同一个实体)
TEST_PAIRS = [
    # ── 正样本（应该合并）──
    ("北京大学", "北大", True),
    ("北大", "北京大学", True),
    ("陈明", "陈明", True),
    ("张三丰", "张三丰", True),

    # ── 负样本（不应该合并）──
    ("陈明", "李四", False),
    ("张三", "李四", False),
    ("幸福客栈", "伤心旅店", False),
    ("张教授", "李教授", False),
    ("外卖员陈明", "快递员王强", False),
    ("小明", "小红", False),
    ("北京", "上海", False),

    # ── 边界样本（难以判断）──
    ("外卖员陈明", "陈明", None),       # alias 关系，精确匹配应覆盖
    ("张三", "张三丰", None),           # 名字相似但可能是不同人
    ("北大", "北大荒", None),           # 缩写歧义
    ("陈明", "陈明远", None),           # 名字包含关系
    ("幸福客栈", "幸福旅店", None),     # 可能是同一家不同叫法
    ("王老板", "王经理", None),         # 同姓不同人
    ("北门", "北京大学北门", None),     # 部分匹配
    ("学校", "北京大学", None),         # 上下位关系
]


async def main():
    from lumen.services.embedding import get_service

    backend = await get_service("knowledge")
    if not backend:
        print("ERROR: 嵌入服务不可用，请检查配置")
        return

    # 收集所有唯一名称
    all_names = list(set(
        [a for a, b, _ in TEST_PAIRS] + [b for a, b, _ in TEST_PAIRS]
    ))

    print(f"编码 {len(all_names)} 个名称...")
    vectors = await backend.encode_batch(all_names)
    if not vectors or len(vectors) != len(all_names):
        print(f"ERROR: 编码失败 (got {len(vectors) if vectors else 0} vectors for {len(all_names)} names)")
        return

    name_to_vec = dict(zip(all_names, [np.array(v) for v in vectors]))

    # 计算余弦相似度
    print(f"\n{'名称A':<14} {'名称B':<14} {'相似度':>8} {'预期':>6}")
    print("─" * 50)

    positive_scores = []
    negative_scores = []
    boundary_scores = []

    for a, b, expected in TEST_PAIRS:
        va = name_to_vec[a]
        vb = name_to_vec[b]
        norm_a = np.linalg.norm(va)
        norm_b = np.linalg.norm(vb)
        if norm_a == 0 or norm_b == 0:
            sim = 0.0
        else:
            sim = float(np.dot(va, vb) / (norm_a * norm_b))

        label = "✓同" if expected is True else "✗异" if expected is False else "?边界"
        print(f"{a:<14} {b:<14} {sim:>8.4f} {label:>6}")

        if expected is True:
            positive_scores.append(sim)
        elif expected is False:
            negative_scores.append(sim)
        else:
            boundary_scores.append(sim)

    # 统计
    print(f"\n{'='*50}")
    print(f"统计摘要（共 {len(TEST_PAIRS)} 对）：")
    print(f"{'='*50}")

    if positive_scores:
        print(f"\n正样本（应合并，{len(positive_scores)} 对）：")
        print(f"  平均: {np.mean(positive_scores):.4f}")
        print(f"  最小: {np.min(positive_scores):.4f}")
        print(f"  最大: {np.max(positive_scores):.4f}")

    if negative_scores:
        print(f"\n负样本（不应合并，{len(negative_scores)} 对）：")
        print(f"  平均: {np.mean(negative_scores):.4f}")
        print(f"  最小: {np.min(negative_scores):.4f}")
        print(f"  最大: {np.max(negative_scores):.4f}")

    if boundary_scores:
        print(f"\n边界样本（难以判断，{len(boundary_scores)} 对）：")
        print(f"  平均: {np.mean(boundary_scores):.4f}")
        print(f"  最小: {np.min(boundary_scores):.4f}")
        print(f"  最大: {np.max(boundary_scores):.4f}")

    # 找最佳分界线
    if positive_scores and negative_scores:
        pos_min = min(positive_scores)
        neg_max = max(negative_scores)
        print(f"\n── 阈值分析 ──")
        print(f"  正样本最低分: {pos_min:.4f}")
        print(f"  负样本最高分: {neg_max:.4f}")
        if neg_max < pos_min:
            threshold = (neg_max + pos_min) / 2
            print(f"  ✅ 存在完美分隔区间！建议阈值: {threshold:.4f}")
        else:
            overlap = pos_min - neg_max
            print(f"  ❌ 有重叠区间（重叠宽度: {abs(overlap):.4f}）")
            print(f"  → 向量阈值方案有误判风险，建议所有向量命中都过 LLM")


if __name__ == "__main__":
    asyncio.run(main())
