import { useState } from "react";
import type { WritingAct } from "../../api/writing";
import { useWritingStore } from "../../stores/useWritingStore";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "../../components/ui/dropdown-menu";
import { ToggleSwitch } from "../../components/ui/toggle-switch";
import { Trash2 } from "lucide-react";
import { ActionsMenu } from "./ActionsMenu";

export function ActHeader({ act }: { act: WritingAct }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(act.title || "");

  const numerate = !!(act.numerate ?? 1);
  const actNumber = (act.sort_order ?? 0) + 1;

  const handleUpdateNumerate = async (val: boolean) => {
    await useWritingStore.getState().updateActAction(act.id, { numerate: val ? 1 : 0 });
  };

  const handleDelete = async () => {
    await useWritingStore.getState().deleteActAction(act.id);
  };

  const handleTitleBlur = async () => {
    setEditing(false);
    if (title !== (act.title || "")) {
      await useWritingStore.getState().updateActAction(act.id, { title });
    }
  };

  return (
    <div className="act-row-header">
      <div className="manuscript-inner flex flex-col lg:flex-row lg:gap-[var(--gap)] items-center">
        <div className="manuscript-content text-center">
          {numerate && (
            <span className="font-medium text-sm opacity-60 text-[var(--color-text-muted)] select-none block">
              Act {actNumber}
            </span>
          )}
          <input
            readOnly={!editing}
            className="w-full bg-transparent text-base font-semibold outline-none cursor-text transition-colors text-center"
            style={{ color: editing ? 'var(--color-text-secondary)' : 'var(--color-text-muted)', padding: 0, border: 'none' }}
            placeholder={numerate ? `Act ${actNumber}` : "Act"}
            value={title}
            onFocus={() => setEditing(true)}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            onBlur={handleTitleBlur}
          />
        </div>

        <div className="manuscript-side hidden lg:block">
          <ActionsMenu>
            <div className="relative flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm text-[var(--color-text-secondary)] outline-hidden select-none">
              自动编号
              <ToggleSwitch className="ml-auto" checked={numerate} onChange={() => handleUpdateNumerate(!numerate)} />
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={handleDelete}>
              <Trash2 className="w-3.5 h-3.5" />
              删除幕
            </DropdownMenuItem>
          </ActionsMenu>
        </div>
      </div>
    </div>
  );
}
