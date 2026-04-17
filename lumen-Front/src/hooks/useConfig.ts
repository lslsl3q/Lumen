/**
 * 配置管理 Hook
 *
 * 职责：管理配置列表、当前配置内容的加载/保存
 * 遵循单向依赖：hook → api/config.ts
 */
import { useState, useCallback } from 'react';
import {
  listConfigs as apiListConfigs,
  getConfig as apiGetConfig,
  updateConfig as apiUpdateConfig,
} from '../api/config';
import { ConfigItem, ConfigDetail } from '../types/config';

export function useConfig() {
  const [configList, setConfigList] = useState<ConfigItem[]>([]);
  const [currentConfig, setCurrentConfig] = useState<ConfigDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** 加载配置列表 */
  const loadConfigList = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const list = await apiListConfigs();
      setConfigList(list);
      return list;
    } catch (err) {
      const msg = err instanceof Error ? err.message : '加载配置列表失败';
      setError(msg);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  /** 加载单个配置详情 */
  const loadConfig = useCallback(async (resource: string) => {
    try {
      setIsLoading(true);
      setError(null);
      const detail = await apiGetConfig(resource);
      setCurrentConfig(detail);
      return detail;
    } catch (err) {
      const msg = err instanceof Error ? err.message : '加载配置失败';
      setError(msg);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /** 保存配置 */
  const saveConfig = useCallback(async (resource: string, content: string) => {
    try {
      setIsSaving(true);
      setError(null);
      await apiUpdateConfig(resource, { content });
      // 保存成功后刷新当前配置
      const detail = await apiGetConfig(resource);
      setCurrentConfig(detail);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : '保存配置失败';
      setError(msg);
      return false;
    } finally {
      setIsSaving(false);
    }
  }, []);

  return {
    configList,
    currentConfig,
    isLoading,
    isSaving,
    error,
    loadConfigList,
    loadConfig,
    saveConfig,
  };
}
