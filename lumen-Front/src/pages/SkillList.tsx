/**
 * Skill 列表页
 */
import { useNavigate } from 'react-router-dom';
import { useSkills } from '../hooks/useSkills';

function SkillList() {
  const navigate = useNavigate();
  const { skills, isLoading, create, remove } = useSkills();

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`确定删除 Skill「${name}」吗？`)) return;
    try {
      await remove(id);
    } catch (err) {
      alert(err instanceof Error ? err.message : '删除失败');
    }
  };

  const handleCreate = async () => {
    const name = prompt('请输入 Skill 名称：');
    if (!name) return;

    try {
      const result = await create({ name, content: '', enabled: true });
      navigate(`/settings/skills/${result.id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : '创建失败');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      {/* 顶栏 */}
      <div className="flex items-center justify-between mb-8 px-6 py-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/')}
            className="text-slate-400 hover:text-slate-200 transition-colors"
          >
            ← 返回聊天
          </button>
          <h1 className="text-2xl font-bold">Skills 管理</h1>
        </div>
        <button
          onClick={handleCreate}
          className="px-4 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 transition-all"
        >
          + 新建 Skill
        </button>
      </div>

      {/* 说明 */}
      <div className="max-w-6xl mx-auto px-6 mb-6">
        <p className="text-sm text-slate-500">
          Skills 定义 AI 的工作方式。角色卡决定"AI 是谁"，世界书决定"AI 知道什么"，工具决定"AI 能做什么"，Skills 决定"AI 怎么干活"。
        </p>
      </div>

      {/* 内容区 */}
      <div className="max-w-6xl mx-auto px-6">
        {isLoading ? (
          <div className="text-center py-16 text-slate-600">加载中...</div>
        ) : skills.length === 0 ? (
          <div className="text-center py-16 text-slate-600">
            <p className="mb-4">还没有 Skill</p>
            <button onClick={handleCreate} className="text-amber-400 hover:underline">
              创建第一个 Skill
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {skills.map((skill) => (
              <div
                key={skill.id}
                onClick={() => navigate(`/settings/skills/${skill.id}`)}
                className="group relative p-5 rounded-xl cursor-pointer bg-slate-900/60 border border-slate-800/40 hover:border-amber-500/30 hover:bg-slate-900/80 transition-all"
              >
                {/* 删除按钮 */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(skill.id, skill.name);
                  }}
                  className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-all"
                >
                  ×
                </button>

                {/* 内容 */}
                <div className="flex items-center gap-2 mb-2 pr-6">
                  <span className={`w-2 h-2 rounded-full ${skill.enabled ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                  <h3 className="text-lg font-medium text-slate-200">{skill.name}</h3>
                </div>
                {skill.description && (
                  <p className="text-sm text-slate-500 line-clamp-2">{skill.description}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default SkillList;
