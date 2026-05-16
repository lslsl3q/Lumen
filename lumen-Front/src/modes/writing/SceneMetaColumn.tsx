/**
 * SceneMetaColumn — 场景节拍元数据列（固定在编辑器右侧）
 *
 * 显示光标当前所在 Scene Beat 的元数据。
 * 默认半透明（opacity-40），悬停/聚焦时完全不透明。
 */
import { cn } from "../../lib/utils";

export interface SceneMeta {
  id: string;
  beatType: string;
  title: string;
  wordCount: number;
  maxWords: number;
  status: string;
  modelId: string;
  contextIds: string[];
  collapsed: boolean;
}

interface SceneMetaColumnProps {
  scene: SceneMeta | null;
}

export function SceneMetaColumn({ scene }: SceneMetaColumnProps) {
  if (!scene) {
    return (
      <div className="w-64 flex-none shrink-0 border-l border-gray-800 p-3 opacity-30">
        <span className="text-xs text-stone-500">将光标移到场景节拍内以查看元数据</span>
      </div>
    );
  }

  const typeLabel = scene.beatType === "beat" ? "SCENE BEAT" : "CONTINUE WRITING";
  const statusLabel = {
    idle: "空闲",
    generating: "生成中",
    done: "已完成",
  }[scene.status] || scene.status;

  return (
    <div
      className={cn(
        "w-64 flex-none shrink-0 border-l border-gray-800",
        "flex flex-col gap-2 p-3",
        "opacity-40 hover:opacity-100 focus-within:opacity-100",
        "transition-opacity duration-75"
      )}
    >
      {/* 场景类型 + 状态 */}
      <div className="text-sm font-medium text-stone-300">
        {typeLabel}
        <span className="ml-2 text-xs text-stone-500">– {scene.wordCount} 字</span>
      </div>

      {/* 状态标签 */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-stone-500">状态:</span>
        <span className={cn(
          "text-xs px-1.5 py-0.5 rounded",
          scene.status === "idle" && "bg-gray-800 text-stone-400",
          scene.status === "generating" && "bg-yellow-900/30 text-yellow-500",
          scene.status === "done" && "bg-green-900/30 text-green-500"
        )}>
          {statusLabel}
        </span>
      </div>

      {/* 字数限制 */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-stone-500">字数限制:</span>
        <span className="text-xs text-stone-400">{scene.maxWords} 字</span>
      </div>

      {/* 模型 */}
      {scene.modelId && (
        <div className="flex items-center gap-1">
          <span className="text-xs text-stone-500">模型:</span>
          <span className="text-xs text-stone-400">{scene.modelId}</span>
        </div>
      )}

      {/* 上下文引用 */}
      {scene.contextIds && scene.contextIds.length > 0 && (
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-stone-500 font-medium">
            上下文 ({scene.contextIds.length})
          </span>
          {scene.contextIds.slice(0, 5).map((id) => (
            <span key={id} className="text-xs text-stone-400 hover:text-stone-300 cursor-pointer truncate">
              {id}
            </span>
          ))}
          {scene.contextIds.length > 5 && (
            <span className="text-xs text-stone-600">
              +{scene.contextIds.length - 5} 更多
            </span>
          )}
        </div>
      )}

      {/* 折叠状态 */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-stone-500">折叠:</span>
        <span className="text-xs text-stone-400">{scene.collapsed ? "是" : "否"}</span>
      </div>
    </div>
  );
}
