/**
 * FloatingLayerHost — 浮动层 Portal 渲染器
 *
 * 条件渲染 SettingsOverlay 和 FloatingWindow。
 * 这两个组件各自通过 createPortal 挂载到 #overlay-root。
 */
import type { UseFloatingLayersReturn } from './useFloatingLayers';
import SettingsOverlay from './SettingsOverlay';
import FloatingWindow from './FloatingWindow';

interface FloatingLayerHostProps {
  floating: UseFloatingLayersReturn;
}

export default function FloatingLayerHost({ floating }: FloatingLayerHostProps) {
  const { state } = floating;

  return (
    <>
      <SettingsOverlay
        open={state.settingsOverlay.open}
        onClose={floating.closeSettings}
        initialSection={state.settingsOverlay.initialSection}
      />
      <FloatingWindow
        open={state.floatingWindow.open}
        title={state.floatingWindow.title}
        onClose={floating.closeFloatingWindow}
      >
        {/* Phase B: FloatingWindow 内容通过 contentKey 预留 */}
        {state.floatingWindow.contentKey === 'placeholder' && (
          <div className="text-sm text-slate-500">预留内容区域</div>
        )}
      </FloatingWindow>
    </>
  );
}