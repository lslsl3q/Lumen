import { ManuscriptView } from "./ManuscriptView";
import { useWritingStore } from "../../stores/useWritingStore";

export function WritingEditor({ children }: { children?: React.ReactNode }) {
  const manuscriptFilter = useWritingStore((s) => s.manuscriptFilter);
  return (
    <div className="flex flex-row h-full flex-1 min-w-0 bg-surface-deep">
      <ManuscriptView filter={manuscriptFilter} />
      {children}
    </div>
  );
}
