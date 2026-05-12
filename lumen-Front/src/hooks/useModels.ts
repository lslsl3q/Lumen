/**
 * 模型列表状态管理 Hook
 *
 * 职责：加载可用模型列表，支持手动刷新
 * 遵循单向依赖：hook → api/models.ts
 */
import { useState, useEffect, useCallback } from 'react';
import { listModels } from '../api/models';
import type { ModelInfo } from '../api/models';

let _cached: ModelInfo[] | null = null;

export function useModels() {
  const [models, setModels] = useState<ModelInfo[]>(_cached ?? []);
  const [isLoading, setIsLoading] = useState(_cached === null);
  const [error, setError] = useState(false);

  const fetchModels = useCallback(() => {
    setIsLoading(true);
    setError(false);
    listModels()
      .then(data => {
        _cached = data.models;
        setModels(data.models);
        setIsLoading(false);
      })
      .catch(() => {
        setError(true);
        setIsLoading(false);
      });
  }, []);

  useEffect(() => {
    if (_cached !== null) return;
    fetchModels();
  }, [fetchModels]);

  const refresh = useCallback(() => {
    _cached = null;
    fetchModels();
  }, [fetchModels]);

  return { models, isLoading, error, refresh };
}
