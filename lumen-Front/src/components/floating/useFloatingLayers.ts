/**
 * 浮动层状态管理 hook
 *
 * 统一管理 ContextPanel / SettingsOverlay / FloatingWindow 三级浮动层的开关状态。
 * 不使用 Context Provider — 在 ChatInterface 中实例化，通过 props 向下传递。
 */
import { useCallback, useState } from 'react';

export type ContextPanelKind = 'character' | 'persona' | 'worldbook' | 'authornote';

export interface FloatingLayersState {
  contextPanel: {
    open: boolean;
    kind: ContextPanelKind | null;
  };
  settingsOverlay: {
    open: boolean;
    initialSection?: string;
  };
  floatingWindow: {
    open: boolean;
    title: string;
    contentKey: string;
    contentProps?: Record<string, unknown>;
  };
}

export interface UseFloatingLayersReturn {
  state: FloatingLayersState;

  openContextPanel: (kind: ContextPanelKind) => void;
  closeContextPanel: () => void;
  toggleContextPanel: (kind: ContextPanelKind) => void;

  openSettings: (section?: string) => void;
  closeSettings: () => void;

  openFloatingWindow: (title: string, contentKey: string, contentProps?: Record<string, unknown>) => void;
  closeFloatingWindow: () => void;

  closeTopLayer: () => void;
  closeAll: () => void;
}

export function useFloatingLayers(): UseFloatingLayersReturn {
  const [state, setState] = useState<FloatingLayersState>({
    contextPanel: { open: false, kind: null },
    settingsOverlay: { open: false },
    floatingWindow: { open: false, title: '', contentKey: '' },
  });

  const openContextPanel = useCallback((kind: ContextPanelKind) => {
    setState(prev => ({
      ...prev,
      contextPanel: { open: true, kind },
    }));
  }, []);

  const closeContextPanel = useCallback(() => {
    setState(prev => ({
      ...prev,
      contextPanel: { open: false, kind: null },
    }));
  }, []);

  const toggleContextPanel = useCallback((kind: ContextPanelKind) => {
    setState(prev => {
      if (prev.contextPanel.open && prev.contextPanel.kind === kind) {
        return { ...prev, contextPanel: { open: false, kind: null } };
      }
      return { ...prev, contextPanel: { open: true, kind } };
    });
  }, []);

  const openSettings = useCallback((section?: string) => {
    setState(prev => ({
      ...prev,
      contextPanel: { open: false, kind: null },
      settingsOverlay: { open: true, initialSection: section },
    }));
  }, []);

  const closeSettings = useCallback(() => {
    setState(prev => ({
      ...prev,
      settingsOverlay: { open: false },
    }));
  }, []);

  const openFloatingWindow = useCallback((title: string, contentKey: string, contentProps?: Record<string, unknown>) => {
    setState(prev => ({
      ...prev,
      floatingWindow: { open: true, title, contentKey, contentProps },
    }));
  }, []);

  const closeFloatingWindow = useCallback(() => {
    setState(prev => ({
      ...prev,
      floatingWindow: { open: false, title: '', contentKey: '' },
    }));
  }, []);

  const closeTopLayer = useCallback(() => {
    setState(prev => {
      if (prev.floatingWindow.open) {
        return { ...prev, floatingWindow: { open: false, title: '', contentKey: '' } };
      }
      if (prev.settingsOverlay.open) {
        return { ...prev, settingsOverlay: { open: false } };
      }
      if (prev.contextPanel.open) {
        return { ...prev, contextPanel: { open: false, kind: null } };
      }
      return prev;
    });
  }, []);

  const closeAll = useCallback(() => {
    setState({
      contextPanel: { open: false, kind: null },
      settingsOverlay: { open: false },
      floatingWindow: { open: false, title: '', contentKey: '' },
    });
  }, []);

  return {
    state,
    openContextPanel,
    closeContextPanel,
    toggleContextPanel,
    openSettings,
    closeSettings,
    openFloatingWindow,
    closeFloatingWindow,
    closeTopLayer,
    closeAll,
  };
}
