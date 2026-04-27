/**
 * GraphEditor — 图谱编辑器组件
 *
 * 基于 @antv/g6 v5 力导向图
 * 三栏布局：实体列表（左）| G6 画布（中）| 详情面板（右）
 * 支持拖拽建边、缩放平移、节点选中编辑
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Graph } from '@antv/g6';
import * as graphApi from '../api/graph';
import type { GraphEntity, GraphEdge } from '../api/graph';
import { toast } from '../utils/toast';

/* ── 颜色映射（暖灰色调，适配暗色背景）── */

const TYPE_COLORS: Record<string, string> = {
  person: '#CC7C5E',
  character: '#CC7C5E',
  org: '#6A9FB5',
  location: '#7BAF7E',
  place: '#7BAF7E',
  event: '#9B8EC4',
  entity: '#ABA499',
};

function getNodeColor(type: string): string {
  return TYPE_COLORS[type] || TYPE_COLORS.entity;
}

/* ── 数据转换：API → G6 格式 ── */

function toG6Node(entity: GraphEntity) {
  return {
    id: String(entity.id),
    data: {
      name: (entity.payload?.name as string) || `#${entity.id}`,
      type: (entity.payload?.type as string) || 'entity',
    },
  };
}

function toG6Edge(edge: GraphEdge) {
  return {
    id: `edge-${edge.src}-${edge.dst}`,
    source: String(edge.src),
    target: String(edge.dst),
    data: {},
  };
}

/* ══════════════════════════════════════════
   主组件
   ══════════════════════════════════════════ */

interface GraphEditorProps {
  tdb: string;
}

function GraphEditor({ tdb }: GraphEditorProps) {
  const [entities, setEntities] = useState<GraphEntity[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [, setIsLoading] = useState(true);

  // 选中状态（G6 用 string ID）
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeKey, setSelectedEdgeKey] = useState<string | null>(null);

  // 新建实体
  const [newEntityName, setNewEntityName] = useState('');
  const [newEntityType, setNewEntityType] = useState('entity');
  const [isCreating, setIsCreating] = useState(false);

  // 编辑实体
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState('');

  // G6 实例
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<Graph | null>(null);

  // 布局切换
  const [layoutType, setLayoutType] = useState<string>('d3-force');

  const LAYOUTS: Record<string, { label: string; config: Record<string, unknown> }> = {
    'd3-force': {
      label: '力导向',
      config: { type: 'd3-force', link: { distance: 120 }, collide: { radius: 40 }, manyBody: { strength: -200 } },
    },
    'antv-dagre': {
      label: '层级',
      config: { type: 'antv-dagre', ranksep: 60, nodesep: 30 },
    },
    'circular': {
      label: '环形',
      config: { type: 'circular', radius: 200 },
    },
    'radial': {
      label: '放射',
      config: { type: 'radial', nodeSize: 24, unitRadius: 100 },
    },
    'grid': {
      label: '网格',
      config: { type: 'grid' },
    },
  };

  /* ── 加载数据 ── */
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [entData, edgeData] = await Promise.all([
        graphApi.listEntities(tdb),
        graphApi.listEdges(tdb),
      ]);
      setEntities(entData.entities);
      setEdges(edgeData.edges);

      if (graphRef.current) {
        graphRef.current.setData({
          nodes: entData.entities.map(toG6Node),
          edges: edgeData.edges.map(toG6Edge),
        });
        graphRef.current.render();
      }
    } catch (err) {
      console.error('加载图谱数据失败:', err);
    } finally {
      setIsLoading(false);
    }
  }, [tdb]);

  /* ── G6 初始化 ── */
  useEffect(() => {
    if (!containerRef.current) return;

    const graph = new Graph({
      container: containerRef.current,
      autoFit: 'view',
      node: {
        type: 'circle',
        style: {
          size: 20,
          fill: (d: any) => getNodeColor(d.data?.type || 'entity'),
          stroke: '#1a1a18',
          lineWidth: 1.5,
          labelText: (d: any) => d.data?.name || d.id,
          labelFill: '#94a3b8',
          labelFontSize: 10,
          labelPlacement: 'bottom',
          labelOffsetY: 4,
          cursor: 'pointer',
        },
        state: {
          selected: {
            stroke: '#CC7C5E',
            lineWidth: 2.5,
            halo: true,
            haloStroke: '#CC7C5E',
            haloLineWidth: 8,
            haloStrokeOpacity: 0.2,
            labelFill: '#e2e8f0',
            labelFontSize: 11,
          },
          active: {
            halo: true,
            haloStroke: '#94a3b8',
            haloLineWidth: 6,
            haloStrokeOpacity: 0.15,
          },
        },
        animation: {
          update: 'translate',
          appear: 'fade',
          disappear: 'fade',
        },
      },
      edge: {
        type: 'line',
        style: {
          stroke: '#3a3936',
          lineWidth: 1.2,
          endArrow: true,
          endArrowSize: 4,
          endArrowFill: '#3a3936',
          cursor: 'pointer',
        },
        state: {
          selected: {
            stroke: '#CC7C5E',
            lineWidth: 2,
          },
          active: {
            stroke: '#5a5854',
            lineWidth: 1.5,
          },
        },
        animation: {
          update: 'translate',
          appear: 'fade',
        },
      },
      layout: {
        type: 'd3-force',
        link: { distance: 120 },
        collide: { radius: 40 },
        manyBody: { strength: -200 },
      },
      behaviors: [
        'zoom-canvas',
        'drag-canvas',
        {
          type: 'drag-element-force',
          fixed: false,
        },
        'hover-element',
        'click-select',
        {
          type: 'create-edge',
          trigger: 'drag',
          style: {
            stroke: '#CC7C5E',
            lineWidth: 1.5,
            lineDash: [4, 4],
          },
        },
      ],
      animation: true,
      background: '#141413',
    });

    // 节点点击 → 选中
    graph.on('node:click', (evt: any) => {
      const nodeId = evt.target?.id;
      if (nodeId) {
        setSelectedNodeId(String(nodeId));
        setSelectedEdgeKey(null);
      }
    });

    // 边点击 → 选中
    graph.on('edge:click', (evt: any) => {
      const edgeId = evt.target?.id;
      if (edgeId) {
        setSelectedEdgeKey(String(edgeId));
        setSelectedNodeId(null);
      }
    });

    // 画布点击 → 取消选中
    graph.on('canvas:click', () => {
      setSelectedNodeId(null);
      setSelectedEdgeKey(null);
    });

    // 拖拽建边完成 → 调用 API
    graph.on('edge:create', async (evt: any) => {
      const edge = evt?.edge;
      if (!edge) return;
      const src = parseInt(edge.source);
      const dst = parseInt(edge.target);
      if (src && dst && src !== dst) {
        try {
          await graphApi.createEdge(tdb, src, dst);
          toast('关系已创建', 'success');
          loadData();
        } catch (err) {
          console.error('创建边失败:', err);
          toast('创建关系失败', 'error');
          loadData();
        }
      }
    });

    graphRef.current = graph;

    return () => {
      graph.destroy();
      graphRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── 布局切换 ── */
  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const layoutConfig = LAYOUTS[layoutType]?.config || LAYOUTS['d3-force'].config;
    graph.setLayout(layoutConfig as any);
    graph.layout();
  }, [layoutType]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── ResizeObserver ── */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      graphRef.current?.resize();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  /* ── 数据加载（tdb 变化时） ── */
  useEffect(() => {
    setSelectedNodeId(null);
    setSelectedEdgeKey(null);
    loadData();
  }, [loadData]);

  /* ── CRUD 操作 ── */

  const handleCreateEntity = useCallback(async () => {
    if (!newEntityName.trim()) return;
    try {
      await graphApi.createEntity(tdb, newEntityName.trim(), newEntityType);
      setNewEntityName('');
      setIsCreating(false);
      loadData();
      toast('实体已创建', 'success');
    } catch (err) {
      console.error('创建实体失败:', err);
      toast('创建失败', 'error');
    }
  }, [tdb, newEntityName, newEntityType, loadData]);

  const handleDeleteEntity = useCallback(async (id: number) => {
    try {
      await graphApi.deleteEntity(tdb, id);
      if (selectedNodeId === String(id)) setSelectedNodeId(null);
      loadData();
      toast('已删除', 'success');
    } catch (err) {
      console.error('删除失败:', err);
      toast('删除失败', 'error');
    }
  }, [tdb, selectedNodeId, loadData]);

  const handleUpdateEntity = useCallback(async () => {
    if (!selectedNodeId) return;
    try {
      await graphApi.updateEntity(tdb, parseInt(selectedNodeId), {
        name: editName,
        type: editType,
      });
      loadData();
      toast('已更新', 'success');
    } catch (err) {
      console.error('更新失败:', err);
      toast('更新失败', 'error');
    }
  }, [tdb, selectedNodeId, editName, editType, loadData]);

  const handleDeleteEdge = useCallback(async (src: number, dst: number) => {
    try {
      await graphApi.deleteEdge(tdb, src, dst);
      setSelectedEdgeKey(null);
      loadData();
      toast('关系已删除', 'success');
    } catch (err) {
      console.error('删除边失败:', err);
      toast('删除关系失败', 'error');
    }
  }, [tdb, loadData]);

  /* ── 按 type 分组实体 ── */
  const entitiesByType = entities.reduce<Record<string, GraphEntity[]>>((acc, e) => {
    const t = (e.payload?.type as string) || 'entity';
    if (!acc[t]) acc[t] = [];
    acc[t].push(e);
    return acc;
  }, {});

  const selectedEntity = selectedNodeId
    ? entities.find(e => String(e.id) === selectedNodeId)
    : null;

  const selectedEdge = selectedEdgeKey
    ? edges.find(e => `edge-${e.src}-${e.dst}` === selectedEdgeKey)
    : null;

  // 选中实体时同步编辑字段
  useEffect(() => {
    if (selectedEntity) {
      setEditName((selectedEntity.payload?.name as string) || '');
      setEditType((selectedEntity.payload?.type as string) || 'entity');
    }
  }, [selectedEntity]);

  /* ── 选中实体的关联边 ── */
  const connectedEdges = selectedEntity
    ? edges.filter(e => e.src === selectedEntity.id || e.dst === selectedEntity.id)
    : [];

  return (
    <div className="flex h-full w-full">
      {/* ── 左栏：实体列表 ── */}
      <div className="w-48 flex-shrink-0 border-r border-[#2a2926] bg-[#171715] flex flex-col">
        <div className="px-3 py-2 border-b border-[#2a2926] flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-widest text-slate-600">
            实体 ({entities.length})
          </span>
          <button
            onClick={() => setIsCreating(true)}
            className="w-4 h-4 flex items-center justify-center rounded
              text-slate-700 hover:text-slate-400 hover:bg-slate-700/40
              transition-all duration-150 cursor-pointer"
            title="新建实体"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </button>
        </div>

        {/* 布局切换 */}
        <div className="px-3 py-1.5 border-b border-[#2a2926]">
          <select
            value={layoutType}
            onChange={e => setLayoutType(e.target.value)}
            className="w-full text-[10px] bg-[#141413] border border-[#2a2926] rounded
              px-2 py-1 text-slate-500 outline-none cursor-pointer
              hover:border-[#CC7C5E]/20 focus:border-[#CC7C5E]/30"
          >
            {Object.entries(LAYOUTS).map(([key, { label }]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-lumen">
          {Object.entries(entitiesByType).map(([type, items]) => (
            <div key={type}>
              <div className="px-3 py-1.5 text-[10px] uppercase tracking-widest text-slate-600 font-medium flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: getNodeColor(type) }} />
                {type} ({items.length})
              </div>
              {items.map(entity => (
                <button
                  key={entity.id}
                  onClick={() => {
                    setSelectedNodeId(String(entity.id));
                    setSelectedEdgeKey(null);
                    // 同步 G6 选中状态
                    if (graphRef.current) {
                      graphRef.current.setElementState(String(entity.id), 'selected');
                    }
                  }}
                  className={`w-full text-left px-3 pl-5 py-1 text-xs cursor-pointer transition-colors duration-100
                    ${String(entity.id) === selectedNodeId
                      ? 'bg-[#CC7C5E]/08 text-slate-200'
                      : 'text-slate-500 hover:text-slate-300 hover:bg-[#1f1f1c]'
                    }`}
                >
                  {(entity.payload?.name as string) || `#${entity.id}`}
                </button>
              ))}
            </div>
          ))}

          {entities.length === 0 && (
            <div className="text-center py-8">
              <p className="text-xs text-slate-700">暂无实体</p>
              <p className="text-[10px] text-slate-800 mt-1">点击 + 新建实体</p>
            </div>
          )}
        </div>

        {/* 新建实体内联输入 */}
        {isCreating && (
          <div className="px-3 py-2 border-t border-[#2a2926] space-y-1.5">
            <input
              value={newEntityName}
              onChange={e => setNewEntityName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreateEntity(); if (e.key === 'Escape') setIsCreating(false); }}
              placeholder="实体名称"
              className="w-full text-xs bg-[#141413] border border-[#2a2926] rounded
                px-2 py-1 text-slate-300 placeholder:text-slate-700
                outline-none focus:border-[#CC7C5E]/30"
              autoFocus
            />
            <select
              value={newEntityType}
              onChange={e => setNewEntityType(e.target.value)}
              className="w-full text-xs bg-[#141413] border border-[#2a2926] rounded
                px-2 py-1 text-slate-400 outline-none cursor-pointer"
            >
              {['entity', 'person', 'character', 'location', 'event', 'org'].map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <div className="flex gap-1">
              <button onClick={handleCreateEntity} className="flex-1 text-[10px] text-amber-400 hover:text-amber-300 cursor-pointer">创建</button>
              <button onClick={() => setIsCreating(false)} className="flex-1 text-[10px] text-slate-600 hover:text-slate-400 cursor-pointer">取消</button>
            </div>
          </div>
        )}
      </div>

      {/* ── 中栏：G6 画布 ── */}
      <div className="flex-1 relative" ref={containerRef} />

      {/* ── 右栏：详情面板 ── */}
      <div className="w-56 flex-shrink-0 border-l border-[#2a2926] bg-[#171715] flex flex-col">
        {selectedEntity && (
          <>
            {/* 实体详情 */}
            <div className="px-3 py-2 border-b border-[#2a2926]">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: getNodeColor(editType || 'entity') }} />
                <span className="text-sm text-slate-200 font-medium truncate">
                  {(selectedEntity.payload?.name as string) || `#${selectedEntity.id}`}
                </span>
              </div>
              <div className="mt-1 text-[10px] text-slate-600">
                ID: {selectedEntity.id} · 类型: {editType}
              </div>
            </div>

            {/* 编辑表单 */}
            <div className="px-3 py-2 space-y-1.5 border-b border-[#2a2926]">
              <input
                value={editName}
                onChange={e => setEditName(e.target.value)}
                className="w-full text-xs bg-[#141413] border border-[#2a2926] rounded
                  px-2 py-1 text-slate-300 outline-none focus:border-[#CC7C5E]/30"
                placeholder="名称"
              />
              <select
                value={editType}
                onChange={e => setEditType(e.target.value)}
                className="w-full text-xs bg-[#141413] border border-[#2a2926] rounded
                  px-2 py-1 text-slate-400 outline-none cursor-pointer"
              >
                {['entity', 'person', 'character', 'location', 'event', 'org'].map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <button
                onClick={handleUpdateEntity}
                className="w-full py-1 rounded text-[10px] cursor-pointer
                  text-amber-400 hover:text-amber-300 hover:bg-amber-400/5 transition-colors"
              >
                保存修改
              </button>
            </div>

            {/* 关联关系 */}
            <div className="px-3 py-2 border-b border-[#2a2926]">
              <div className="text-[10px] uppercase tracking-widest text-slate-600 mb-1.5">
                关联 ({connectedEdges.length})
              </div>
              <div className="space-y-1 max-h-32 overflow-y-auto scrollbar-lumen">
                {connectedEdges.map((edge, i) => {
                  const isSource = edge.src === selectedEntity.id;
                  const otherName = isSource ? edge.dst_name : edge.src_name;
                  const otherId = isSource ? edge.dst : edge.src;
                  return (
                    <div key={i} className="flex items-center gap-1.5 group">
                      <span className="text-[10px] text-slate-500">
                        {isSource ? '→' : '←'}
                      </span>
                      <span className="text-[10px] text-slate-400 truncate">{otherName || `#${otherId}`}</span>
                      <button
                        onClick={() => handleDeleteEdge(edge.src, edge.dst)}
                        className="ml-auto text-slate-700 hover:text-red-400 opacity-0 group-hover:opacity-100
                          transition-all duration-150 cursor-pointer text-[10px]"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
                {connectedEdges.length === 0 && (
                  <p className="text-[10px] text-slate-700">无关联关系</p>
                )}
              </div>
            </div>

            {/* 删除按钮 */}
            <div className="px-3 py-2 mt-auto">
              <button
                onClick={() => handleDeleteEntity(selectedEntity.id)}
                className="w-full py-1.5 rounded text-[10px] cursor-pointer
                  text-slate-600 hover:text-red-400 hover:bg-red-400/10 transition-colors"
              >
                删除实体
              </button>
            </div>
          </>
        )}

        {selectedEdge && (
          <>
            {/* 边详情 */}
            <div className="px-3 py-2 border-b border-[#2a2926]">
              <div className="text-[10px] uppercase tracking-widest text-slate-600 mb-2">关系</div>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="truncate">{selectedEdge.src_name || `#${selectedEdge.src}`}</span>
                <svg className="w-3 h-3 text-slate-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
                <span className="truncate">{selectedEdge.dst_name || `#${selectedEdge.dst}`}</span>
              </div>
            </div>
            <div className="px-3 py-2 mt-auto">
              <button
                onClick={() => handleDeleteEdge(selectedEdge.src, selectedEdge.dst)}
                className="w-full py-1.5 rounded text-[10px] cursor-pointer
                  text-slate-600 hover:text-red-400 hover:bg-red-400/10 transition-colors"
              >
                删除关系
              </button>
            </div>
          </>
        )}

        {!selectedEntity && !selectedEdge && (
          <div className="flex-1 flex items-center justify-center px-4">
            <div className="text-center">
              <p className="text-xs text-slate-700">点击节点或边查看详情</p>
              <p className="text-[10px] text-slate-800 mt-1">从一个节点拖到另一个节点可创建关系</p>
              <p className="text-[10px] text-slate-800 mt-0.5">滚轮缩放 · 拖拽平移</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default GraphEditor;
