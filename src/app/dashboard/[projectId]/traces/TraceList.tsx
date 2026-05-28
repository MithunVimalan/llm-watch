// src/app/dashboard/[projectId]/traces/TraceList.tsx
'use client';

import React, { useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { getTraceTree } from '@/actions/traces';
import ReplayViewer from './ReplayViewer';
import FlameGraph from './FlameGraph';
import DAGView from './DAGView';
import TokenFlow from './TokenFlow';
import StateDiff from './StateDiff';

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
  execution_order?: number | null;
  state_snapshot?: any;
  reasoning_text?: string | null;
  duration_breakdown?: any;
}

interface TraceListProps {
  traces: Trace[];
  projectId: string;
  initialSearch: string;
}

interface TreeNode {
  span: Trace;
  children: TreeNode[];
}

function buildTree(spans: Trace[]): TreeNode[] {
  const nodeMap = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  // Create tree nodes for all spans
  spans.forEach(s => {
    nodeMap.set(s.id, { span: s, children: [] });
  });

  // Link children to parents
  spans.forEach(s => {
    const node = nodeMap.get(s.id)!;
    if (s.parent_span_id && nodeMap.has(s.parent_span_id)) {
      const parent = nodeMap.get(s.parent_span_id)!;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  });

  // Sort children by created_at
  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => new Date(a.span.created_at).getTime() - new Date(b.span.created_at).getTime());
    nodes.forEach(n => sortNodes(n.children));
  };
  sortNodes(roots);

  return roots;
}

function RenderTreeNode({ 
  node, 
  depth = 0, 
  activeSpanId, 
  onSelectSpan 
}: { 
  node: TreeNode; 
  depth: number; 
  activeSpanId: string | null; 
  onSelectSpan: (span: Trace) => void;
}) {
  const { span, children } = node;
  const isActive = activeSpanId === span.id;
  const isError = !!span.error_message;

  // Icon depending on span type
  let typeIcon = (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
  );

  if (span.span_type === 'agent') {
    typeIcon = (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
      </svg>
    );
  } else if (span.span_type === 'chain') {
    typeIcon = (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
      </svg>
    );
  } else if (span.span_type === 'tool') {
    typeIcon = (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    );
  }

  // Type badge styling
  let badgeClass = "bg-zinc-800 text-zinc-400";
  if (span.span_type === 'agent') badgeClass = "bg-blue-950/40 text-blue-400 border border-blue-900/30";
  if (span.span_type === 'chain') badgeClass = "bg-purple-950/40 text-purple-400 border border-purple-900/30";
  if (span.span_type === 'tool') badgeClass = "bg-amber-950/40 text-amber-400 border border-amber-900/30";

  return (
    <div className="flex flex-col">
      <div 
        onClick={() => onSelectSpan(span)}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        className={`group flex items-center py-2 pr-4 rounded-md cursor-pointer transition-all relative ${
          isActive 
            ? 'bg-zinc-800/80 text-zinc-100 border-l-2 border-zinc-400 shadow-sm' 
            : 'hover:bg-zinc-800/30 text-zinc-400 hover:text-zinc-200'
        }`}
      >
        {/* Hierarchy guide lines */}
        {depth > 0 && (
          <div 
            className="absolute border-l border-zinc-800" 
            style={{ 
              left: `${(depth - 1) * 16 + 14}px`, 
              top: '-8px', 
              bottom: '16px',
              width: '1px' 
            }} 
          />
        )}
        {depth > 0 && (
          <div 
            className="absolute border-b border-zinc-800" 
            style={{ 
              left: `${(depth - 1) * 16 + 14}px`, 
              top: '16px', 
              width: '10px' 
            }} 
          />
        )}

        <div className={`p-1.5 rounded mr-2 flex items-center justify-center shrink-0 ${badgeClass}`}>
          {typeIcon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-semibold text-xs truncate">
              {span.span_name || span.model || 'execution-span'}
            </span>
            <span className="font-mono text-[9px] text-zinc-500 shrink-0">
              {span.latency_ms ? `${span.latency_ms}ms` : '—'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[8px] uppercase tracking-wider font-mono text-zinc-600">
              {span.span_type || 'llm'}
            </span>
            {isError && (
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0 animate-pulse" />
            )}
            {span.cost_usd !== null && span.cost_usd > 0 && (
              <span className="text-[8.5px] font-mono text-zinc-650">
                • ${span.cost_usd.toFixed(5)}
              </span>
            )}
          </div>
        </div>
      </div>
      
      {children.map((child) => (
        <RenderTreeNode 
          key={child.span.id} 
          node={child} 
          depth={depth + 1} 
          activeSpanId={activeSpanId} 
          onSelectSpan={onSelectSpan} 
        />
      ))}
    </div>
  );
}

export default function TraceList({ traces, projectId, initialSearch }: TraceListProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  
  const [search, setSearch] = useState(initialSearch);
  const [selectedTrace, setSelectedTrace] = useState<Trace | null>(null);
  const [traceSpans, setTraceSpans] = useState<Trace[]>([]);
  const [loadingSpans, setLoadingSpans] = useState(false);
  const [activeSpanId, setActiveSpanId] = useState<string | null>(null);

  const [replayTraceSpans, setReplayTraceSpans] = useState<Trace[] | null>(null);
  const [replayTraceId, setReplayTraceId] = useState<string | null>(null);
  const [showReplay, setShowReplay] = useState(false);
  const [loadingReplay, setLoadingReplay] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'tree' | 'dag' | 'flame' | 'tokens' | 'state'>('tree');

  const handleOpenReplay = (trace: Trace) => {
    if (!trace.trace_id) return;
    setLoadingReplay(trace.id);
    getTraceTree(projectId, trace.trace_id)
      .then((res: any[]) => {
        if (res && res.length > 0) {
          const mapped = res.map((row: any) => ({
            id: row.id,
            created_at: typeof row.created_at === 'string' ? row.created_at : row.created_at.toISOString ? row.created_at.toISOString() : new Date(row.created_at).toISOString(),
            provider: row.provider,
            model: row.model,
            latency_ms: row.latency_ms,
            cost_usd: row.cost_usd ? Number(row.cost_usd) : null,
            error_message: row.error_message,
            is_cached: row.is_cached,
            prompt_tokens: row.prompt_tokens || 0,
            completion_tokens: row.completion_tokens || 0,
            request_payload: row.request_payload,
            response_payload: row.response_payload,
            trace_id: row.trace_id,
            parent_span_id: row.parent_span_id,
            span_type: row.span_type,
            span_name: row.span_name,
            execution_order: row.execution_order,
            state_snapshot: row.state_snapshot,
            reasoning_text: row.reasoning_text,
            duration_breakdown: row.duration_breakdown
          }));
          setReplayTraceSpans(mapped);
          setReplayTraceId(trace.trace_id!);
          setShowReplay(true);
        }
      })
      .catch((err) => {
        console.error("Error loading trace replay", err);
      })
      .finally(() => {
        setLoadingReplay(null);
      });
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    if (search.trim()) {
      params.set('q', search.trim());
    } else {
      params.delete('q');
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleSelectTrace = (trace: Trace) => {
    setSelectedTrace(trace);
    setTraceSpans([trace]);
    setActiveSpanId(trace.id);
    
    if (trace.trace_id) {
      setLoadingSpans(true);
      getTraceTree(projectId, trace.trace_id)
        .then((res: any[]) => {
          if (res && res.length > 0) {
            const mapped = res.map((row: any) => ({
              id: row.id,
              created_at: typeof row.created_at === 'string' ? row.created_at : row.created_at.toISOString ? row.created_at.toISOString() : new Date(row.created_at).toISOString(),
              provider: row.provider,
              model: row.model,
              latency_ms: row.latency_ms,
              cost_usd: row.cost_usd ? Number(row.cost_usd) : null,
              error_message: row.error_message,
              is_cached: row.is_cached,
              prompt_tokens: row.prompt_tokens || 0,
              completion_tokens: row.completion_tokens || 0,
              request_payload: row.request_payload,
              response_payload: row.response_payload,
              trace_id: row.trace_id,
              parent_span_id: row.parent_span_id,
              span_type: row.span_type,
              span_name: row.span_name,
              execution_order: row.execution_order,
              state_snapshot: row.state_snapshot,
              reasoning_text: row.reasoning_text,
              duration_breakdown: row.duration_breakdown
            }));
            setTraceSpans(mapped);
            // Focus on root or first node
            const root = mapped.find((s: any) => !s.parent_span_id) || mapped[0];
            if (root) {
              setActiveSpanId(root.id);
            }
          }
        })
        .catch((err) => {
          console.error("Error loading trace tree", err);
        })
        .finally(() => {
          setLoadingSpans(false);
        });
    }
  };

  const activeSpan = traceSpans.find(s => s.id === activeSpanId) || selectedTrace;

  return (
    <div className="space-y-6">
      {/* Search Filter Header */}
      <form onSubmit={handleSearchSubmit} className="flex gap-3">
        <div className="relative flex-1">
          <svg className="w-4 h-4 text-zinc-500 absolute left-4 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search payload payloads text (e.g. 'timeout', 'sorting', metadata)..."
            className="w-full bg-[#18181b] border border-zinc-800 text-zinc-100 rounded-md pl-11 pr-4 py-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-400 focus:border-zinc-400 transition-all font-mono placeholder:text-zinc-600"
          />
        </div>
        <button
          type="submit"
          className="px-6 py-2.5 bg-[#fafafa] hover:bg-zinc-200 text-[#09090b] rounded-md text-xs font-semibold shadow-lg transition-all"
        >
          Search
        </button>
      </form>

      {/* Traces List Table */}
      <div className="bg-[#18181b] border border-zinc-800 rounded-lg overflow-hidden shadow-2xl">
        {traces.length === 0 ? (
          <div className="p-16 text-center text-zinc-500 space-y-3">
            <div className="w-10 h-10 rounded bg-zinc-850 flex items-center justify-center mx-auto text-zinc-500">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <div>
              <p className="text-xs text-zinc-400 font-semibold">No traces match query</p>
              <p className="text-[10px] text-zinc-650 mt-1">Try clearing search parameters to pull recent events.</p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto text-xs">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#09090b] border-b border-zinc-800 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                  <th className="p-4 pl-6">Timestamp</th>
                  <th className="p-4">Name / Model</th>
                  <th className="p-4">Latency</th>
                  <th className="p-4">Cost</th>
                  <th className="p-4">Type</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 pr-6 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80">
                {traces.map((trace) => {
                  const dateStr = new Date(trace.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                  const dateDay = new Date(trace.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' });
                  const isError = !!trace.error_message;
                  const isCached = trace.is_cached;
                  
                  return (
                    <tr 
                      key={trace.id} 
                      onClick={() => handleSelectTrace(trace)}
                      className="hover:bg-zinc-800/20 transition-colors text-zinc-300 cursor-pointer"
                    >
                      <td className="p-4 pl-6">
                        <span className="font-semibold text-zinc-200 block">{dateStr}</span>
                        <span className="text-[9px] text-zinc-500 block font-mono mt-0.5">{dateDay}</span>
                      </td>
                      <td className="p-4">
                        <span className="font-semibold text-zinc-200 block truncate max-w-[180px]">
                          {trace.span_name || trace.model}
                        </span>
                        <span className="text-[9px] text-zinc-550 block uppercase font-mono mt-0.5">
                          {trace.span_name ? `${trace.model} (${trace.provider})` : trace.provider}
                        </span>
                      </td>
                      <td className="p-4 font-mono text-zinc-300">
                        {trace.latency_ms ? `${trace.latency_ms}ms` : '—'}
                      </td>
                      <td className="p-4 font-mono text-zinc-400">
                        {trace.cost_usd && trace.cost_usd > 0 ? `$${trace.cost_usd.toFixed(5)}` : 'Free'}
                      </td>
                      <td className="p-4">
                        <span className="px-2 py-0.5 rounded text-[9px] font-mono font-semibold uppercase bg-zinc-800 text-zinc-400">
                          {trace.span_type || 'llm'}
                        </span>
                      </td>
                      <td className="p-4">
                        {isError ? (
                          <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-red-950/20 border border-red-900/30 text-red-400">
                            Error
                          </span>
                        ) : isCached ? (
                          <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-zinc-800 border border-zinc-700 text-zinc-300">
                            Cached
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-zinc-800/40 border border-zinc-800 text-zinc-400">
                            Success
                          </span>
                        )}
                      </td>
                      <td className="p-4 pr-6 text-right">
                        <div className="flex items-center justify-end gap-3.5">
                          {loadingReplay === trace.id ? (
                            <span className="text-[10px] font-mono text-zinc-550 animate-pulse">
                              Loading...
                            </span>
                          ) : trace.trace_id ? (
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenReplay(trace);
                              }}
                              className="text-[11.5px] text-emerald-500 hover:text-emerald-400 font-semibold transition-colors flex items-center gap-1"
                            >
                              <span>▶</span> Replay
                            </button>
                          ) : null}
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectTrace(trace);
                            }}
                            className="text-[11px] text-zinc-400 hover:text-zinc-100 font-semibold transition-colors"
                          >
                            View details →
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Side-Drawer Details View */}
      {selectedTrace && (
        <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
          {/* Backdrop */}
          <div 
            onClick={() => setSelectedTrace(null)}
            className="absolute inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
          />

          {/* Drawer Panel */}
          <div className="relative w-full max-w-5xl bg-[#18181b] border-l border-zinc-800 h-full shadow-2xl flex flex-col justify-between z-10 animate-slide-in">
            {/* Header */}
            <div className="h-16 px-6 border-b border-zinc-800 flex items-center justify-between bg-[#09090b]/40">
              <div>
                <h3 className="font-bold text-zinc-100 text-sm tracking-tight">Trace Tree Inspector</h3>
                <p className="text-[9px] text-zinc-550 font-mono mt-0.5">
                  Trace ID: {selectedTrace.trace_id || 'Legacy Flat Trace'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {selectedTrace.trace_id && (
                  <button
                    onClick={() => {
                      setReplayTraceSpans(traceSpans);
                      setReplayTraceId(selectedTrace.trace_id!);
                      setShowReplay(true);
                    }}
                    className="px-3 py-1 bg-zinc-850 hover:bg-zinc-800 text-zinc-200 text-xs font-semibold rounded-md border border-zinc-700/60 flex items-center gap-1.5 transition-colors"
                  >
                    <span>▶</span> Run Replay
                  </button>
                )}
                <button 
                  onClick={() => setSelectedTrace(null)}
                  className="p-1.5 text-zinc-500 hover:text-zinc-200 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Split Content Area */}
            <div className="flex-1 overflow-hidden flex flex-row">
              {/* Left Panel: Trace Spans Tree Hierarchy */}
              <div className="w-2/5 border-r border-zinc-800/80 p-5 overflow-y-auto flex flex-col space-y-4">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                  <div className="flex bg-[#09090b]/80 p-0.5 rounded-md border border-zinc-800/60">
                    <button
                      onClick={() => setViewMode('tree')}
                      className={`px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                        viewMode === 'tree' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-350'
                      }`}
                    >
                      Tree
                    </button>
                    <button
                      onClick={() => setViewMode('dag')}
                      className={`px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                        viewMode === 'dag' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-350'
                      }`}
                    >
                      DAG
                    </button>
                    <button
                      onClick={() => setViewMode('flame')}
                      className={`px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                        viewMode === 'flame' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-350'
                      }`}
                    >
                      Flame
                    </button>
                    <button
                      onClick={() => setViewMode('tokens')}
                      className={`px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                        viewMode === 'tokens' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-350'
                      }`}
                    >
                      Tokens
                    </button>
                    <button
                      onClick={() => setViewMode('state')}
                      className={`px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                        viewMode === 'state' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-350'
                      }`}
                    >
                      State
                    </button>
                  </div>
                  <span className="text-[9.5px] font-mono text-zinc-500 bg-zinc-900/60 border border-zinc-850 px-2 py-0.5 rounded">
                    {traceSpans.length} {traceSpans.length === 1 ? 'span' : 'spans'}
                  </span>
                </div>
                
                {loadingSpans ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 py-12 space-y-2">
                    <svg className="animate-spin h-5 w-5 text-zinc-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span className="text-[10px] font-mono">Querying spans from Neon DB...</span>
                  </div>
                ) : viewMode === 'dag' ? (
                  <DAGView
                    spans={traceSpans}
                    activeSpanId={activeSpanId}
                    onSelectSpan={(id) => setActiveSpanId(id)}
                  />
                ) : viewMode === 'flame' ? (
                  <FlameGraph
                    spans={traceSpans}
                    activeSpanId={activeSpanId}
                    onSelectSpan={(id) => setActiveSpanId(id)}
                  />
                ) : viewMode === 'tokens' ? (
                  <TokenFlow spans={traceSpans} />
                ) : viewMode === 'state' ? (
                  <StateDiff spans={traceSpans} />
                ) : (
                  <div className="space-y-1.5 flex-1">
                    {buildTree(traceSpans).map(rootNode => (
                      <RenderTreeNode
                        key={rootNode.span.id}
                        node={rootNode}
                        depth={0}
                        activeSpanId={activeSpanId}
                        onSelectSpan={(span) => setActiveSpanId(span.id)}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Right Panel: Selected Span Details Inspector */}
              <div className="w-3/5 p-6 overflow-y-auto space-y-6 text-xs">
                {activeSpan ? (
                  <>
                    {/* Active Span Header */}
                    <div className="border-b border-zinc-800 pb-3">
                      <h4 className="font-bold text-sm text-zinc-200">
                        {activeSpan.span_name || activeSpan.model}
                      </h4>
                      <p className="text-[9px] font-mono text-zinc-550 mt-1">
                        Span ID: {activeSpan.id}
                      </p>
                    </div>

                    {/* Quick Stats Grid */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-[#09090b] border border-zinc-800/80 p-3 rounded">
                        <span className="text-[9px] text-zinc-550 font-bold uppercase">Duration</span>
                        <span className="text-xs font-bold text-zinc-200 mt-1 block font-mono">
                          {activeSpan.latency_ms ? `${activeSpan.latency_ms}ms` : '—'}
                        </span>
                      </div>
                      <div className="bg-[#09090b] border border-zinc-800/80 p-3 rounded">
                        <span className="text-[9px] text-zinc-550 font-bold uppercase">Span Cost</span>
                        <span className="text-xs font-bold text-zinc-300 mt-1 block font-mono">
                          {activeSpan.cost_usd && activeSpan.cost_usd > 0 ? `$${activeSpan.cost_usd.toFixed(6)}` : '$0.00'}
                        </span>
                      </div>
                      <div className="bg-[#09090b] border border-zinc-800/80 p-3 rounded">
                        <span className="text-[9px] text-zinc-550 font-bold uppercase">Tokens</span>
                        <span className="text-xs font-bold text-zinc-200 mt-1 block font-mono">
                          {activeSpan.prompt_tokens + activeSpan.completion_tokens} 
                          <span className="text-[9px] text-zinc-500 font-normal ml-1">
                            ({activeSpan.prompt_tokens}p / {activeSpan.completion_tokens}c)
                          </span>
                        </span>
                      </div>
                    </div>

                    {/* Metadata Card */}
                    <div className="bg-[#09090b]/40 border border-zinc-850 p-4 rounded space-y-2.5 font-mono text-[10px] text-zinc-400">
                      <div className="flex justify-between">
                        <span className="text-zinc-600">Span Type</span>
                        <span className="text-zinc-300 uppercase font-semibold">{activeSpan.span_type || 'llm'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-600">Model Name</span>
                        <span className="text-zinc-300">{activeSpan.model || '—'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-600">Provider</span>
                        <span className="text-zinc-300 uppercase">{activeSpan.provider || '—'}</span>
                      </div>
                      {activeSpan.is_cached && (
                        <div className="flex justify-between">
                          <span className="text-zinc-600">Cache Cache</span>
                          <span className="text-green-400 font-semibold uppercase text-[9px]">Hit</span>
                        </div>
                      )}
                    </div>

                    {/* Error Alerts */}
                    {activeSpan.error_message && (
                      <div className="bg-red-950/10 border border-red-900/30 p-4 rounded text-xs font-mono">
                        <span className="text-[10px] font-bold text-red-400 block mb-1">Execution Failure Exception</span>
                        <p className="text-red-300 leading-relaxed">{activeSpan.error_message}</p>
                      </div>
                    )}

                    {/* Request Payload */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-zinc-300">Request Input</span>
                      </div>
                      <pre className="bg-[#09090b] border border-zinc-850 p-4 rounded text-[11px] font-mono text-zinc-300 overflow-x-auto max-h-[220px] selection:bg-zinc-800">
                        {JSON.stringify(activeSpan.request_payload, null, 2) || '{}'}
                      </pre>
                    </div>

                    {/* Response Payload */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-zinc-300">Response Output</span>
                      </div>
                      <pre className="bg-[#09090b] border border-zinc-850 p-4 rounded text-[11px] font-mono text-zinc-300 overflow-x-auto max-h-[240px] selection:bg-zinc-800">
                        {JSON.stringify(activeSpan.response_payload, null, 2) || '{}'}
                      </pre>
                    </div>
                  </>
                ) : (
                  <div className="h-full flex items-center justify-center text-zinc-500 font-semibold font-mono">
                    Select a span node in the execution flow to view details.
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="h-14 px-6 border-t border-zinc-800 bg-[#09090b]/40 flex items-center justify-end">
              <button 
                onClick={() => setSelectedTrace(null)}
                className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold rounded"
              >
                Close Trace
              </button>
            </div>
          </div>
        </div>
      )}

      {showReplay && replayTraceSpans && replayTraceId && (
        <ReplayViewer
          projectId={projectId}
          traceId={replayTraceId}
          spans={replayTraceSpans}
          onClose={() => {
            setShowReplay(false);
            setReplayTraceSpans(null);
            setReplayTraceId(null);
          }}
        />
      )}
    </div>
  );
}
