/**
 * AvatarUpload — 头像上传组件（共享）
 *
 * 显示头像 + 点击上传，无头像时显示首字母
 */
import { useCallback } from 'react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

interface AvatarUploadProps {
  preview: string | null;
  fallback: string;
  onChange: (file: File) => void;
  size?: 'sm' | 'default' | 'lg';
}

export function AvatarUpload({ preview, fallback, onChange, size = 'default' }: AvatarUploadProps) {
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onChange(file);
  }, [onChange]);

  return (
    <label className="cursor-pointer group">
      <Avatar size={size} className="border border-dashed border-border-default group-hover:border-primary/40 transition-colors">
        {preview ? (
          <AvatarImage src={preview} alt="" />
        ) : (
          <AvatarFallback className="bg-surface-elevated text-[10px] text-text-muted group-hover:text-text-secondary">
            {fallback[0] || '?'}
          </AvatarFallback>
        )}
      </Avatar>
      <input type="file" accept="image/*" onChange={handleChange} className="hidden" />
    </label>
  );
}
