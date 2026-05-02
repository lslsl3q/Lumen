/**
 * 浮动层状态管理 hook
 *
 * 统一管理 SettingsOverlay / FloatingWindow 两级浮动层的开关状态。
 * 不使用 Context Provider — 在 ChatInterface 中实例化，通过 props 向下传递。
 */
import { useCallback, useState } from 'react';

export interface FloatingLayersState {
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

  openSettings: (section?: string) => void;
  closeSettings: () => void;

  openFloatingWindow: (title: string, contentKey: string, contentProps?: Record<string, unknown>) => void;
  closeFloatingWindow: () => void;

  closeTopLayer: () => void;
  closeAll: () => void;
}

export function useFloatingLayers(): UseFloatingLayersReturn {
  const [state, setState] = useState<FloatingLayersState>({
    settingsOverlay: { open: false },
    floatingWindow: { open: false, title: '', contentKey: '' },
  });

  const openSettings = useCallback((section?: string) => {
    setState(prev => ({
      ...prev,
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
      return prev;
    });
  }, []);

  const closeAll = useCallback(() => {
    setState({
      settingsOverlay: { open: false },
      floatingWindow: { open: false, title: '', contentKey: '' },
    });
  }, []);

  return {
    state,
    openSettings,
    closeSettings,
    openFloatingWindow,
    closeFloatingWindow,
    closeTopLayer,
    closeAll,
  };
}
