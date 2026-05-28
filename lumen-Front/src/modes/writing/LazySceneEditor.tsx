import { useEffect, useRef, useState } from "react";
import { SceneEditor } from "./SceneEditor";
import type { WritingScene } from "../../api/writing";

function extractPreview(doc: string, maxLen = 150): string {
  try {
    const parsed = JSON.parse(doc);
    if (!parsed || parsed.type !== "doc") return "";
    const texts: string[] = [];
    const walk = (n: any) => {
      if (n.text) texts.push(n.text);
      if (n.content) n.content.forEach(walk);
    };
    (parsed as any).content?.forEach(walk);
    return texts.join(" ").slice(0, maxLen);
  } catch {
    return "";
  }
}

const ROOT_MARGIN = "400px 0px 400px 0px";

export function LazySceneEditor({ scene }: { scene: WritingScene }) {
  const [isNear, setIsNear] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsNear(true);
        }
      },
      { rootMargin: ROOT_MARGIN }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [scene.id]);

  return (
    <div ref={ref} data-scene-id={scene.id}>
      {isNear ? (
        <SceneEditor scene={scene} />
      ) : (
        <div className="scene-section">
          <div className="manuscript-inner flex flex-col lg:flex-row lg:gap-[var(--gap)]">
            <div className="manuscript-content">
              <div className="rich-text-editor-prosemirror outline-none text-[var(--color-text-dim)] opacity-50 text-sm leading-relaxed select-none py-2">
                {extractPreview(scene.content) || <span className="italic">Sc{scene.scene_number || ""}（未加载）</span>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
