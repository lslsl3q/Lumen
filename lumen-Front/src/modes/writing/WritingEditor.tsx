/**
 * WritingEditor — 写作编辑区域 (ManuscriptView 版本)
 *
 * 工具栏已合并到 WritingMode 顶部，此处只包含 ManuscriptView。
 */

import { ManuscriptView } from "./ManuscriptView";

export function WritingEditor({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex flex-col h-full flex-1 min-w-0 bg-surface-deep">
      <ManuscriptView />
      {children}
    </div>
  );
}
