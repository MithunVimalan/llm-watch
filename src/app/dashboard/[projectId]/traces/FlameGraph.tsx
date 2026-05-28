// src/app/dashboard/[projectId]/traces/FlameGraph.tsx
'use client';

import React from 'react';

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

interface FlameGraphProps {
  spans: Trace[];
  activeSpanId: string | null;
  onSelectSpan: (id: string) => void;
}

interface RenderNode {
  span: Trace;
  depth: number;
  left: number;
  width: number;
  children: RenderNode[];
}

export default function FlameGraph({ spans, activeSpanId, onSelectSpan }: FlameGraphProps) {
  if (spans.length === 0) return null;

  // 1. Calculate absolute times and total duration
  const timestamps = spans.map(s => new Date(s.created_at).getTime());
  const traceStart = Math.min(...timestamps);
  
  // Calculate end time of trace
  const spansWithEnds = spans.map(s => {
    const start = new Date(s.created_at).getTime();
    const duration = s.latency_ms || 10; // Fallback to 10ms if missing
    return {
      span: s,
      start,
      end: start + duration
    };
  });

  const traceEnd = Math.max(...spansWithEnds.map(s => s.end));
  const totalDuration = Math.max(1, traceEnd - traceStart);

  // 2. Build tree structure to calculate depths & relative layout positions
  const nodeMap = new Map<string, RenderNode>();
  const roots: RenderNode[] = [];

  spansWithEnds.forEach(item => {
    nodeMap.set(item.span.id, {
      span: item.span,
      depth: 0,
      left: ((item.start - traceStart) / totalDuration) * 100,
      width: Math.max(1.5, (Math.max(10, item.span.latency_ms || 10) / totalDuration) * 100),
      children: []
    });
  });

  spansWithEnds.forEach(item => {
    const node = nodeMap.get(item.span.id)!;
    if (item.span.parent_span_id && nodeMap.has(item.span.parent_span_id)) {
      const parent = nodeMap.get(item.span.parent_span_id)!;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  });

  // 3. Assign depths recursively
  const maxDepthRef = { value: 0 };
  const assignDepth = (node: RenderNode, currentDepth: number) => {
    node.depth = currentDepth;
    if (currentDepth > maxDepthRef.value) {
      maxDepthRef.value = currentDepth;
    }
    node.children.forEach(c => assignDepth(c, currentDepth + 1));
  };
  roots.forEach(r => assignDepth(r, 0));

  // Flatten the tree into an array of renderable blocks ordered by depth
  const flatNodes: RenderNode[] = [];
  const flatten = (node: RenderNode) => {
    flatNodes.push(node);
    node.children.forEach(flatten);
  };
  roots.forEach(flatten);

  // Sort by depth then left position
  flatNodes.sort((a, b) => a.depth - b.depth || a.left - b.left);

  const maxDepth = maxDepthRef.value;
  const rowHeight = 36;
  const containerHeight = (maxDepth + 1) * (rowHeight + 4) + 20;

  return (
    <div className="space-y-4">
      {/* Visual Instruction Badge */}
      <div className="flex items-center gap-2 text-[10px] text-zinc-500 uppercase tracking-wider font-mono">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
        </svg>
        <span>Latency Flamegraph (Click to inspect)</span>
      </div>

      <div 
        className="w-full bg-[#0a0a0c] border border-zinc-850 rounded-lg p-4 overflow-x-auto relative"
        style={{ minHeight: `${containerHeight}px` }}
      >
        {/* Render horizontal depth rows */}
        {Array.from({ length: maxDepth + 1 }).map((_, d) => (
          <div 
            key={d} 
            className="absolute left-4 right-4 border-b border-zinc-900/40 pointer-events-none"
            style={{ 
              top: `${d * (rowHeight + 4) + 16}px`, 
              height: `${rowHeight}px` 
            }}
          />
        ))}

        {/* Render Flame Bars */}
        <div className="relative w-full h-full" style={{ height: `${containerHeight - 40}px` }}>
          {flatNodes.map(node => {
            const { span, depth, left, width } = node;
            const isActive = activeSpanId === span.id;
            const isError = !!span.error_message;
            const latency = span.latency_ms || 0;

            // Proportional latency contribution ratio
            const ratio = latency / totalDuration;

            // Base theme formatting depending on latency ratio or error
            let colorClass = "bg-emerald-950/40 text-emerald-400 border border-emerald-900/30 hover:bg-emerald-900/20";
            if (isError) {
              colorClass = "bg-red-950/40 text-red-400 border border-red-900/30 hover:bg-red-900/20";
            } else if (ratio >= 0.5) {
              colorClass = "bg-red-900/25 text-red-400 border border-red-800/40 hover:bg-red-800/20";
            } else if (ratio >= 0.2) {
              colorClass = "bg-amber-950/40 text-amber-400 border border-amber-900/30 hover:bg-amber-900/20";
            }

            if (isActive) {
              colorClass = "bg-zinc-800 text-zinc-100 border border-zinc-400 shadow-[0_0_10px_rgba(250,250,250,0.15)] z-10";
            }

            return (
              <div
                key={span.id}
                onClick={() => onSelectSpan(span.id)}
                className={`absolute rounded py-1 px-2 cursor-pointer transition-all duration-150 flex flex-col justify-center select-none ${colorClass}`}
                style={{
                  left: `${left}%`,
                  width: `${width}%`,
                  top: `${depth * (rowHeight + 4)}px`,
                  height: `${rowHeight}px`,
                }}
                title={`${span.span_name || span.model} (${latency}ms - ${(ratio * 100).toFixed(1)}% of trace)`}
              >
                <span className="font-semibold text-[9.5px] truncate block w-full leading-tight">
                  {span.span_name || span.model || 'span'}
                </span>
                <span className="font-mono text-[8px] opacity-70 block truncate w-full mt-0.5">
                  {latency}ms ({span.span_type || 'llm'})
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
