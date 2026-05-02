/**
 * CockpitModelSelect — 驾驶舱紧凑模型选择器
 *
 * 显示当前模型名，点击弹出 Command 列表切换。
 * 使用 Shadcn Popover + Command 组件，紧凑布局适合驾驶舱底栏。
 */
import { useState, useEffect } from 'react';
import { listModels, ModelInfo } from '../api/models';
import { CheckIcon, ChevronsUpDownIcon } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';

interface CockpitModelSelectProps {
  value: string;
  onChange: (value: string) => void;
}

/** 从完整 model id 提取显示名（取最后一段） */
function displayName(id: string): string {
  return id.split('/').pop() || id;
}

function CockpitModelSelect({ value, onChange }: CockpitModelSelectProps) {
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<ModelInfo[]>([]);

  useEffect(() => {
    let cancelled = false;
    listModels()
      .then(data => { if (!cancelled) setModels(data.models); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="inline-flex h-5 items-center gap-0.5 rounded px-1 text-[10px] font-mono
          text-slate-500 hover:text-slate-300 transition-colors cursor-pointer outline-none
          data-[state=open]:text-slate-300"
      >
        {value ? displayName(value) : '模型'}
        <ChevronsUpDownIcon className="size-2.5 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-52 p-0" align="start" sideOffset={4}>
        <Command>
          <CommandInput placeholder="搜索模型..." className="h-7 text-xs" />
          <CommandList>
            <CommandEmpty className="text-xs">无匹配</CommandEmpty>
            <CommandGroup>
              {models.map(model => (
                <CommandItem
                  key={model.id}
                  value={model.id}
                  onSelect={(current) => {
                    onChange(current === value ? '' : current);
                    setOpen(false);
                  }}
                  className="text-xs gap-1.5"
                >
                  <CheckIcon
                    className={cn(
                      'size-3 shrink-0',
                      value === model.id ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <span className="font-mono truncate">{displayName(model.id)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default CockpitModelSelect;
