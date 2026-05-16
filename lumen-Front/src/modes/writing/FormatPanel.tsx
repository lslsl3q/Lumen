import { type Editor } from "@tiptap/react";
import { Popover, PopoverTrigger, PopoverContent } from "../../components/ui/popover";
import {
  Superscript, Subscript, Minus, Table, AlignLeft, AlignCenter,
  AlignRight, AlignJustify, ImagePlus, Palette, Link as LinkIcon, Search, Type,
} from "lucide-react";
import { cn } from "../../lib/utils";

interface FormatPanelProps {
  editor: Editor | null;
  onToggleFindReplace: () => void;
}

export function FormatPanel({ editor, onToggleFindReplace }: FormatPanelProps) {
  if (!editor) return null;

  return (
    <Popover>
      <PopoverTrigger
        className="flex items-center gap-1.5 px-2 py-1.5 rounded text-xs font-semibold text-stone-400 hover:text-stone-300 hover:bg-gray-800 transition-colors"
        type="button"
      >
        <Type className="w-4 h-4" />
        <span className="hidden sm:inline">Format</span>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-auto p-1 bg-gray-900 border-gray-800 rounded-lg shadow-xl"
      >
        <div className="flex flex-wrap gap-0.5 max-w-[280px]">
          <FormatButton icon={Superscript} label="上标" active={editor.isActive("superscript")} onClick={() => editor.chain().focus().toggleSuperscript().run()} />
          <FormatButton icon={Subscript} label="下标" active={editor.isActive("subscript")} onClick={() => editor.chain().focus().toggleSubscript().run()} />
          <FormatButton icon={Minus} label="分隔线" onClick={() => editor.chain().focus().setHorizontalRule().run()} />
          <FormatButton icon={Table} label="表格" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} />
          <FormatButton icon={AlignLeft} label="左对齐" active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()} />
          <FormatButton icon={AlignCenter} label="居中" active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()} />
          <FormatButton icon={AlignRight} label="右对齐" active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()} />
          <FormatButton icon={AlignJustify} label="两端对齐" active={editor.isActive({ textAlign: "justify" })} onClick={() => editor.chain().focus().setTextAlign("justify").run()} />
          <FormatButton icon={ImagePlus} label="图片" onClick={() => {/* TODO: 图片插入 */}} />
          <FormatButton icon={Palette} label="颜色" onClick={() => {/* TODO: 颜色选择 */}} />
          <FormatButton icon={LinkIcon} label="链接" active={editor.isActive("link")} onClick={() => {/* TODO: 链接插入 */}} />
          <FormatButton icon={Search} label="查找替换" onClick={onToggleFindReplace} />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function FormatButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-8 h-8 flex items-center justify-center rounded transition-colors",
        "hover:bg-gray-800 text-stone-400 hover:text-stone-200",
        active && "bg-gray-700 text-stone-200"
      )}
      title={label}
      type="button"
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}
