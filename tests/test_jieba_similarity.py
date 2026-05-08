"""对比 jieba 分词 Jaccard vs 向量余弦 在中文实体名称去重上的效果

用法：.venv/Scripts/python.exe tests/test_jieba_similarity.py
"""
import numpy as np

TEST_PAIRS = [
    # (名称A, 名称B, 是否应该是同一个实体)
    # ── 正样本 ──
    ("北京大学", "北大", True),
    ("陈明", "陈明", True),
    # ── 负样本 ──
    ("陈明", "李四", False),
    ("张三", "李四", False),
    ("幸福客栈", "伤心旅店", False),
    ("张教授", "李教授", False),
    ("外卖员陈明", "快递员王强", False),
    ("小明", "小红", False),
    ("北京", "上海", False),
    # ── 边界样本 ──
    ("外卖员陈明", "陈明", None),
    ("张三", "张三丰", None),
    ("北大", "北大荒", None),
    ("陈明", "陈明远", None),
    ("幸福客栈", "幸福旅店", None),
    ("王老板", "王经理", None),
    ("北门", "北京大学北门", None),
    ("学校", "北京大学", None),
]


def jieba_jaccard(a: str, b: str, mode: str = "search") -> float:
    """用 jieba 分词计算词级 Jaccard"""
    import jieba
    if mode == "search":
        words_a = set(jieba.cut_for_search(a))
        words_b = set(jieba.cut_for_search(b))
    else:
        words_a = set(jieba.cut(a))
        words_b = set(jieba.cut(b))
    # 去掉单字（太常见，会制造假阳性）
    words_a = {w for w in words_a if len(w) >= 2}
    words_b = {w for w in words_b if len(w) >= 2}
    if not words_a and not words_b:
        return 1.0
    if not words_a or not words_b:
        return 0.0
    return len(words_a & words_b) / len(words_a | words_b)


def char_jaccard(a: str, b: str) -> float:
    """字符级 Jaccard（k=1 unigram）"""
    sa = set(a)
    sb = set(b)
    if not sa and not sb:
        return 1.0
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)


# 向量相似度（从上一次测试结果）
VECTOR_SCORES = {
    ("北京大学", "北大"): 0.8469,
    ("陈明", "陈明"): 1.0000,
    ("陈明", "李四"): 0.4914,
    ("张三", "李四"): 0.8204,
    ("幸福客栈", "伤心旅店"): 0.6570,
    ("张教授", "李教授"): 0.8483,
    ("外卖员陈明", "快递员王强"): 0.5717,
    ("小明", "小红"): 0.6483,
    ("北京", "上海"): 0.5859,
    ("外卖员陈明", "陈明"): 0.6691,
    ("张三", "张三丰"): 0.6378,
    ("北大", "北大荒"): 0.6872,
    ("陈明", "陈明远"): 0.8053,
    ("幸福客栈", "幸福旅店"): 0.8565,
    ("王老板", "王经理"): 0.7240,
    ("北门", "北京大学北门"): 0.7511,
    ("学校", "北京大学"): 0.5355,
}


def main():
    print(f"{'名称A':<14} {'名称B':<14} {'jieba词':>8} {'字符级':>8} {'向量':>8} {'预期':>6}")
    print("─" * 68)

    for a, b, expected in TEST_PAIRS:
        jj = jieba_jaccard(a, b)
        cj = char_jaccard(a, b)
        vec = VECTOR_SCORES.get((a, b), VECTOR_SCORES.get((b, a), 0.0))
        label = "✓同" if expected is True else "✗异" if expected is False else "?边界"
        print(f"{a:<14} {b:<14} {jj:>8.4f} {cj:>8.4f} {vec:>8.4f} {label:>6}")

    # 统计分析
    print(f"\n{'='*68}")
    print("方法对比：哪个最能区分正负样本？")
    print(f"{'='*68}")

    methods = {"jieba词": [], "字符级": [], "向量": []}
    labels = {"positive": [], "negative": [], "boundary": []}

    for a, b, expected in TEST_PAIRS:
        jj = jieba_jaccard(a, b)
        cj = char_jaccard(a, b)
        vec = VECTOR_SCORES.get((a, b), VECTOR_SCORES.get((b, a), 0.0))
        key = "positive" if expected is True else "negative" if expected is False else "boundary"
        labels[key].append(jj)
        methods["jieba词"].append((jj, expected))
        methods["字符级"].append((cj, expected))
        methods["向量"].append((vec, expected))

    for method_name, scores in methods.items():
        pos = [s for s, e in scores if e is True]
        neg = [s for s, e in scores if e is False]
        bnd = [s for s, e in scores if e is None]

        print(f"\n── {method_name} ──")
        if pos:
            print(f"  正样本: min={min(pos):.4f}, max={max(pos):.4f}, avg={np.mean(pos):.4f}")
        if neg:
            print(f"  负样本: min={min(neg):.4f}, max={max(neg):.4f}, avg={np.mean(neg):.4f}")
        if bnd:
            print(f"  边界:   min={min(bnd):.4f}, max={max(bnd):.4f}, avg={np.mean(bnd):.4f}")

        if pos and neg:
            gap = min(pos) - max(neg)
            if gap > 0:
                print(f"  ✅ 完美分隔！安全阈值区间: ({max(neg):.4f}, {min(pos):.4f})")
            else:
                print(f"  ❌ 重叠 {abs(gap):.4f}，需要 LLM 兜底")

    # jieba 分词结果展示
    print(f"\n{'='*68}")
    print("jieba 分词详情（cut_for_search 模式，≥2字过滤）")
    print(f"{'='*68}")
    import jieba
    all_names = sorted(set([a for a, b, _ in TEST_PAIRS] + [b for a, b, _ in TEST_PAIRS]))
    for name in all_names:
        raw = list(jieba.cut_for_search(name))
        filtered = [w for w in raw if len(w) >= 2]
        print(f"  {name:<14} → {raw} → 过滤后: {filtered}")


if __name__ == "__main__":
    main()
