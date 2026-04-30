"""一次性迁移：data/knowledge/ → data/知识库/
运行后 data/knowledge/ 不再使用，所有引用指向 data/知识库/
"""
import os
import shutil
import json

OLD_DIR = "lumen/data/knowledge"
NEW_DIR = "lumen/data/知识库"


def migrate():
    # 1. 创建新目录结构
    os.makedirs(os.path.join(NEW_DIR, "knowledge"), exist_ok=True)
    os.makedirs(os.path.join(NEW_DIR, "agent_knowledge"), exist_ok=True)

    # 2. 迁移公共知识（imports/, lumen_docs/ 等）→ knowledge/
    for sub in ["imports", "lumen_docs"]:
        src = os.path.join(OLD_DIR, sub)
        dst = os.path.join(NEW_DIR, "knowledge", sub)
        if os.path.exists(src):
            if os.path.exists(dst):
                shutil.rmtree(dst)
            shutil.copytree(src, dst)

    # 3. 迁移日记/Agent 知识 → agent_knowledge/
    for sub in ["daily_note", "agents"]:
        src = os.path.join(OLD_DIR, sub)
        dst = os.path.join(NEW_DIR, "agent_knowledge", sub)
        if os.path.exists(src):
            if os.path.exists(dst):
                shutil.rmtree(dst)
            shutil.copytree(src, dst)

    # 4. 迁移 registry → knowledge/_registry.json
    old_reg = os.path.join(OLD_DIR, "_registry.json")
    if os.path.exists(old_reg):
        shutil.copy2(old_reg, os.path.join(NEW_DIR, "knowledge", "_registry.json"))

    # 5. 生成 _manifest.json
    from lumen.services.manifest import ensure_manifest_for_existing_kb
    ensure_manifest_for_existing_kb("knowledge")
    ensure_manifest_for_existing_kb("agent_knowledge")

    print("迁移完成：")
    print(f"  公共知识 → {NEW_DIR}/knowledge/")
    print(f"  Agent 知识 → {NEW_DIR}/agent_knowledge/")
    print("  _manifest.json 已生成")


if __name__ == "__main__":
    migrate()
