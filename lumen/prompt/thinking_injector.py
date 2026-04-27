"""
Lumen - 思维簇注入文本格式化
把 PipelineResult 中的检索模块格式化为可注入提示词的文本
"""

from collections import OrderedDict

from lumen.types.thinking_clusters import RetrievedModule


def format_modules(modules: list[RetrievedModule]) -> str:
    """格式化检索到的思维模块为注入文本

    按簇分组，每组内按相似度排序。
    输出被 <thinking_modules> 标签包裹，与 <relevant_history>、<knowledge_base> 风格一致。
    """
    if not modules:
        return ""

    # 按簇分组（保持簇在链中的出现顺序）
    groups: OrderedDict[str, list[RetrievedModule]] = OrderedDict()
    for mod in modules:
        cluster = mod["cluster"]
        if cluster not in groups:
            groups[cluster] = []
        groups[cluster].append(mod)

    parts = ["<thinking_modules>"]
    parts.append("以下是与当前对话相关的思维参考模块，请在生成回复时参考这些框架和方法论。")
    parts.append("")

    for cluster_name, cluster_modules in groups.items():
        # 组内按相似度排序
        sorted_modules = sorted(cluster_modules, key=lambda x: x["score"], reverse=True)
        parts.append(f"[思维簇: {cluster_name}]")
        for mod in sorted_modules:
            # 只显示文件名（不含簇目录前缀）
            display_name = mod["filename"].split("/")[-1] if "/" in mod["filename"] else mod["filename"]
            parts.append(f"--- {display_name} (相关度: {mod['score']:.2f}) ---")
            parts.append(mod["content"])
            parts.append("")
        parts.append("")

    parts.append("</thinking_modules>")
    return "\n".join(parts)
