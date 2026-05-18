/**
 * DashboardMode — 大堂（Level 0）
 *
 * Gallery-style landing page: novel cards + base entry.
 * Bypasses ModeContainer entirely — no ActivityBar/SidePanel.
 */
import { useEffect, useCallback, useState, useRef } from "react";
import { useModeStore } from "../stores/useModeStore";
import { useWritingStore } from "../stores/useWritingStore";
import { titleToGradient } from "../utils/color";

export default function DashboardMode() {
  const switchMode = useModeStore((s) => s.switchMode);
  const projects = useWritingStore((s) => s.projects);
  const isLoaded = useWritingStore((s) => s.isLoaded);
  const loadProjects = useWritingStore((s) => s.loadProjects);
  const setActiveProject = useWritingStore((s) => s.setActiveProject);
  const createProject = useWritingStore((s) => s.createProject);
  const updateProject = useWritingStore((s) => s.updateProject);
  const [creating, setCreating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingForId, setUploadingForId] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded) loadProjects();
  }, [isLoaded, loadProjects]);

  const handleOpenNovel = useCallback(
    async (projectId: string) => {
      await setActiveProject(projectId);
      switchMode("writing");
    },
    [setActiveProject, switchMode]
  );

  const handleCreateNovel = useCallback(async () => {
    if (creating) return;
    setCreating(true);
    try {
      const project = await createProject("新小说");
      await setActiveProject(project.id);
      const act = await useWritingStore.getState().createAct("卷一");
      const chapter = await useWritingStore.getState().createChapter(act.id, "第一章");
      await useWritingStore.getState().createScene(chapter.id);
      switchMode("writing");
    } finally {
      setCreating(false);
    }
  }, [creating, createProject, setActiveProject, switchMode]);

  const handleUploadCover = useCallback(
    (projectId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setUploadingForId(projectId);
      fileInputRef.current?.click();
    },
    []
  );

  const handleFileSelected = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      const projectId = uploadingForId;
      if (!file || !projectId) return;

      try {
        const dataUrl = await readFileAsDataUrl(file);
        await updateProject(projectId, {
          metadata: {
            ...(projects.find((p) => p.id === projectId)?.metadata ?? {}),
            cover_image: dataUrl,
          },
        });
      } catch (err) {
        console.error("Cover upload failed:", err);
      } finally {
        setUploadingForId(null);
        e.target.value = "";
      }
    },
    [projects, updateProject, uploadingForId]
  );

  const handleOpenBase = useCallback(() => {
    switchMode("base");
  }, [switchMode]);

  const handleOpenSettings = useCallback(() => {
    window.dispatchEvent(new CustomEvent("lumen:open-settings"));
  }, []);

  return (
    <div className="h-screen flex flex-col bg-slate-950">
      {/* Hidden file input for cover upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleFileSelected}
      />
      {/* Minimal top bar */}
      <div className="flex items-center justify-between px-6 h-14 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_rgba(204,124,94,0.6)]" />
          <span className="text-sm font-light tracking-widest text-text-secondary uppercase font-display">
            Lumen
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleOpenSettings}
            className="p-2 rounded-md text-text-muted hover:text-text-secondary hover:bg-slate-800/40 transition-colors duration-150"
            title="设置"
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1200px] mx-auto px-6 py-8">
          {/* Section: Novels */}
          <h2 className="text-xs font-semibold tracking-widest text-text-dim uppercase mb-4">
            作品
          </h2>

          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-5 mb-8">
            {projects.map((project) => {
              const coverImage = (project.metadata as Record<string, unknown>)?.cover_image as string | undefined;
              return (
                <div
                  key={project.id}
                  onClick={() => handleOpenNovel(project.id)}
                  className="group relative rounded-xl overflow-hidden border border-border-default hover:border-primary/50 transition-all duration-200 cursor-pointer text-left aspect-[3/4] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {/* Cover */}
                  <div
                    className="absolute inset-0"
                    style={{
                      background: coverImage
                        ? `url(${coverImage}) center/cover no-repeat`
                        : titleToGradient(project.name),
                    }}
                  />
                  {/* Overlay gradient for title readability */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

                  {/* Cover upload button (visible on hover) */}
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                    <button
                      onClick={(e) => handleUploadCover(project.id, e)}
                      className="p-1.5 rounded-md bg-black/50 text-white/70 hover:text-white hover:bg-black/70 transition-colors duration-150"
                      title="上传封面"
                    >
                      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
                      </svg>
                    </button>
                  </div>

                  {/* Title */}
                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    <h3 className="text-white text-lg font-semibold leading-tight truncate drop-shadow-lg">
                      {project.name}
                    </h3>
                  </div>
                </div>
              );
            })}

            {/* Create novel card */}
            <button
              onClick={handleCreateNovel}
              disabled={creating}
              className="rounded-xl border-2 border-dashed border-border-default hover:border-primary/50 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all duration-200 aspect-[3/4] text-text-dim hover:text-text-muted disabled:opacity-50"
            >
              <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              <span className="text-sm">新建小说</span>
            </button>
          </div>

          {/* Section: Base */}
          <h2 className="text-xs font-semibold tracking-widest text-text-dim uppercase mb-4">
            基地
          </h2>
          <button
            onClick={handleOpenBase}
            className="w-full rounded-xl border border-border-default hover:border-primary/50 p-5 flex items-center gap-4 cursor-pointer transition-all duration-200 text-left group"
          >
            <div className="w-12 h-12 rounded-lg bg-slate-800 flex items-center justify-center text-xl shrink-0">
              🌑
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-text-primary text-base font-semibold truncate group-hover:text-primary transition-colors duration-150">
                暗影之城
              </h3>
              <p className="text-text-dim text-sm mt-0.5">
                多 Agent 交互世界
              </p>
            </div>
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" className="text-text-dim shrink-0">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
