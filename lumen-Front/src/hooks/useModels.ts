/**
 * 模型列表状态管理 Hook
 *
 * 职责：加载可用模型列表
 * 遵循单向依赖：hook → api/models.ts
 */
import { useState, useEffect } from 'react';
import { listModels } from '../api/models';
import type { ModelInfo } from '../api/models';

let _cached: ModelInfo[] | null = null;

export function useModels() {
  const [models, setModels] = useState<ModelInfo[]>(_cached ?? []);
  const [isLoading, setIsLoading] = useState(_cached === null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (_cached !== null) return;
    let cancelled = false;
    listModels()
      .then(data => {
        if (!cancelled) {
          _cached = data.models;
          setModels(data.models);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
          setIsLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, []);

  return { models, isLoading, error };
}
