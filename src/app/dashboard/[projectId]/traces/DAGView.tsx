// src/app/dashboard/[projectId]/traces/DAGView.tsx
'use client';

import React, { useMemo } from 'react';

interface Trace {
  id: string;
  created_at: string;
  provider: string;
  model: string;
  latency_ms: number | null;
  cost_usd: number | null;
  error_message: string | null;
  is_cached: boolean;
  prompt_tokens: number;
  completion_tokens: number;
  request_payload: any;
  response_payload: any;
  trace_id?: string | null;
  parent_span_id?: string | null;
  span_type?: 'llm' | 'tool' | 'chain' | 'agent' | null;
  span_name?: string | null;
}

interface DAGViewProps {
  spans: Trace[];
  activeSpanId: string | null;
  onSelectSpan: (id: string) => void;
}

interface GridNode {
  span: Trace;
  depth: number;
  rowPosition: number; // Index in the row
  leftPercent: number; // Computed center %
  topPx: number;
}

export default function DAGView({ spans, activeSpanId, onSelectSpan }: DAGViewProps) {
  const { nodes, connections, containerHeight } = useMemo(() => {
    if (spans.length === 0) {
      return { nodes: [], connections: [], containerHeight: 200 };
    }

    // 1. Build parent-child relationships and depths
    const parentMap = new Map<string, string[]>();
    const nodeById = new Map<string, Trace>();
    
    spans.forEach(s => {
      nodeById.set(s.id, s);
      if (s.parent_span_id) {
        const children = parentMap.get(s.parent_span_id) || [];
        children.push(s.id);
        parentMap.set(s.parent_span_id, children);
      }
    });

    // Determine depths starting from roots
    const depthMap = new Map<string, number>();
    const roots = spans.filter(s => !s.parent_span_id || !nodeById.has(s.parent_span_id));
    
    const assignDepth = (id: string, depth: number) => {
      depthMap.set(id, depth);
      const children = parentMap.get(id) || [];
      children.forEach(cid => assignDepth(cid, depth + 1));
    };

    roots.forEach(r => assignDepth(r.id, 0));

    // Fill in any fallback depths for safety
    spans.forEach(s => {
      if (!depthMap.has(s.id)) {
        depthMap.set(s.id, 0);
      }
    });

    // 2. Group nodes by depth
    const depthGroups: Record<number, string[]> = {};
    spans.forEach(s => {
      const d = depthMap.get(s.id)!;
      if (!depthGroups[d]) depthGroups[d] = [];
      depthGroups[d].push(s.id);
    });

    const maxDepth = Math.max(...Object.keys(depthGroups).map(Number));

    // 3. Compute coordinates for each node
    const gridNodes: GridNode[] = [];
    const nodeCoords = new Map<string, { x: number; y: number }>();
    const cardHeight = 52;
    const verticalGap = 96;

    Object.entries(depthGroups).forEach(([depthStr, ids]) => {
      const depth = Number(depthStr);
      const rowCount = ids.length;
      
      ids.forEach((id, index) => {
        const span = nodeById.get(id)!;
        // Compute percentage center: distribute rowCount evenly
        const leftPercent = ((index + 0.5) / rowCount) * 100;
        const topPx = depth * verticalGap + 20;

        gridNodes.push({
          span,
          depth,
          rowPosition: index,
          leftPercent,
          topPx
        });

        nodeCoords.set(id, { x: leftPercent, y: topPx });
      });
    });

    // 4. Compute connections
    const computedConns: Array<{
      id: string;
      startX: number;
      startY: number;
      endX: number;
      endY: number;
      color: string;
    }> = [];

    spans.forEach(span => {
      if (span.parent_span_id && nodeCoords.has(span.parent_span_id) && nodeCoords.has(span.id)) {
        const parentCoord = nodeCoords.get(span.parent_span_id)!;
        const childCoord = nodeCoords.get(span.id)!;
        
        computedConns.push({
          id: `${span.parent_span_id}-${span.id}`,
          startX: parentCoord.x,
          startY: parentCoord.y + cardHeight,
          endX: childCoord.x,
          endY: childCoord.y,
          color: span.error_message ? '#ef4444' : '#52525b'
        });
      }
    });

    const totalHeight = (maxDepth + 1) * verticalGap + 40;

    return {
      nodes: gridNodes,
      connections: computedConns,
      containerHeight: Math.max(250, totalHeight)
    };
  }, [spans]);

  const getBadgeColor = (type?: string | null) => {
    if (type === 'agent') return 'border-blue-900/40 text-blue-400 bg-blue-950/20';
    if (type === 'chain') return 'border-purple-900/40 text-purple-400 bg-purple-950/20';
    if (type === 'tool') return 'border-amber-900/40 text-amber-400 bg-amber-950/20';
    return 'border-zinc-800 text-zinc-400 bg-zinc-900/40';
  };

  return (
    <div className="space-y-4">
      {/* Visual Instruction Badge */}
      <div className="flex items-center justify-between text-[10px] text-zinc-500 uppercase tracking-wider font-mono">
        <div className="flex items-center gap-2">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94-3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
          </svg>
          <span>Execution DAG (Click to inspect)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-0.5 bg-zinc-555 inline-block" />
          <span>Dependency Flow</span>
        </div>
      </div>

      <div 
        className="w-full bg-[#0a0a0c] border border-zinc-855 rounded-lg overflow-x-auto relative"
        style={{ height: `${containerHeight}px` }}
      >
        {/* Connection overlay (SVG) */}
        <svg 
          className="absolute inset-0 w-full h-full pointer-events-none z-0"
          style={{ minWidth: '380px' }}
        >
          <defs>
            <linearGradient id="dash-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#71717a" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#fafafa" stopOpacity="0.8" />
            </linearGradient>
            <style>
              {`
                @keyframes dag-dash {
                  to {
                    stroke-dashoffset: -20;
                  }
                }
                .dag-flow-line {
                  stroke-dasharray: 6, 6;
                  animation: dag-dash 1.2s linear infinite;
                }
              `}
            </style>
          </defs>

          {connections.map((conn) => {
            // Cubic bezier curve path calculation
            const midY = (conn.startY + conn.endY) / 2;
            const pathData = `M ${conn.startX}%,${conn.startY} C ${conn.startX}%,${midY} ${conn.endX}%,${midY} ${conn.endX}%,${conn.endY}`;

            return (
              <g key={conn.id}>
                {/* Static background path */}
                <path
                  d={pathData}
                  fill="none"
                  stroke={conn.color}
                  strokeWidth="1.5"
                  className="opacity-40"
                />
                {/* Pulsing overlay path */}
                {!conn.color.includes('red') && (
                  <path
                    d={pathData}
                    fill="none"
                    stroke="url(#dash-grad)"
                    strokeWidth="1.5"
                    className="dag-flow-line opacity-80"
                  />
                )}
              </g>
            );
          })}
        </svg>

        {/* Nodes layer */}
        <div className="absolute inset-0 z-10" style={{ minWidth: '380px' }}>
          {nodes.map(node => {
            const { span, topPx, leftPercent } = node;
            const isActive = activeSpanId === span.id;
            const isError = !!span.error_message;

            const cardWidth = 152;
            const cardHeight = 52;

            let cardBorder = "border-zinc-800 hover:border-zinc-700 bg-zinc-955/70";
            if (isError) cardBorder = "border-red-900 bg-red-950/10 hover:border-red-800";
            else if (isActive) cardBorder = "border-zinc-400 bg-zinc-900 shadow-[0_0_12px_rgba(250,250,250,0.1)]";

            return (
              <div
                key={span.id}
                onClick={() => onSelectSpan(span.id)}
                className={`absolute rounded-lg p-2 border cursor-pointer flex flex-col justify-between transition-all select-none ${cardBorder}`}
                style={{
                  top: `${topPx}px`,
                  left: `${leftPercent}%`,
                  width: `${cardWidth}px`,
                  height: `${cardHeight}px`,
                  transform: 'translateX(-50%)'
                }}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-bold text-[9px] truncate text-zinc-200 w-full">
                    {span.span_name || span.model || 'span'}
                  </span>
                  {isError && (
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                  )}
                </div>
                
                <div className="flex items-center justify-between mt-1">
                  <span className={`px-1 rounded text-[7.5px] font-mono border ${getBadgeColor(span.span_type)}`}>
                    {span.span_type || 'llm'}
                  </span>
                  <span className="font-mono text-[8px] text-zinc-500 font-medium">
                    {span.latency_ms ? `${span.latency_ms}ms` : '—'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
