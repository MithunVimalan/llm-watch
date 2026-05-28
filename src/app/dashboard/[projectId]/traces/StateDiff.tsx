// src/app/dashboard/[projectId]/traces/StateDiff.tsx
'use client';

import React, { useState, useMemo } from 'react';

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
}

interface StateDiffProps {
  spans: Trace[];
}

export default function StateDiff({ spans }: StateDiffProps) {
  // Sort spans by execution order
  const sortedSpans = useMemo(() => {
    return [...spans].sort((a, b) => (a.execution_order || 0) - (b.execution_order || 0));
  }, [spans]);

  // Filter spans that actually have state snapshots (or fallback to empty object if none)
  const spansWithState = useMemo(() => {
    return sortedSpans.map((s, idx) => ({
      ...s,
      displayName: s.span_name || s.model || `Step #${s.execution_order ?? idx}`,
      hasState: s.state_snapshot && Object.keys(s.state_snapshot).length > 0
    }));
  }, [sortedSpans]);

  // Dropdown states for selected Span A and Span B
  const [spanAId, setSpanAId] = useState<string>(() => {
    const firstWithState = spansWithState.find(s => s.hasState);
    return firstWithState ? firstWithState.id : spansWithState[0]?.id || '';
  });

  const [spanBId, setSpanBId] = useState<string>(() => {
    const states = spansWithState.filter(s => s.hasState);
    if (states.length > 1) {
      return states[states.length - 1].id;
    }
    return spansWithState[spansWithState.length - 1]?.id || '';
  });

  // Modals for Forking state
  const [showForkModal, setShowForkModal] = useState(false);
  const [forkTargetSpan, setForkTargetSpan] = useState<typeof spansWithState[0] | null>(null);
  const [forkStateInput, setForkStateInput] = useState('');
  const [forkSuccess, setForkSuccess] = useState(false);

  const spanA = useMemo(() => spansWithState.find(s => s.id === spanAId), [spansWithState, spanAId]);
  const spanB = useMemo(() => spansWithState.find(s => s.id === spanBId), [spansWithState, spanBId]);

  const stateA = spanA?.state_snapshot || {};
  const stateB = spanB?.state_snapshot || {};

  const allKeys = useMemo(() => {
    return Array.from(new Set([...Object.keys(stateA), ...Object.keys(stateB)])).sort();
  }, [stateA, stateB]);

  const openForkModal = (target: typeof spansWithState[0]) => {
    setForkTargetSpan(target);
    setForkStateInput(JSON.stringify(target.state_snapshot || {}, null, 2));
    setForkSuccess(false);
    setShowForkModal(true);
  };

  const handleSimulateFork = () => {
    try {
      JSON.parse(forkStateInput); // test if valid JSON
      setForkSuccess(true);
      setTimeout(() => {
        setForkSuccess(false);
        setShowForkModal(false);
      }, 2000);
    } catch (e) {
      alert("Invalid JSON format. Please verify syntax.");
    }
  };

  return (
    <div className="space-y-6">
      
      {/* 1. State Evolution Timeline */}
      <div className="space-y-2">
        <span className="text-[10px] text-zinc-550 uppercase tracking-wider font-bold font-mono">
          State Mutations Timeline
        </span>
        <div className="bg-[#0a0a0c] border border-zinc-850 rounded-xl p-5">
          <div className="relative flex items-center justify-between py-2 overflow-x-auto min-h-[60px] gap-4">
            {/* Horizontal connection line */}
            <div className="absolute left-0 right-0 h-0.5 bg-zinc-900 z-0" />
            
            {spansWithState.map((span, idx) => {
              const isSelectedA = span.id === spanAId;
              const isSelectedB = span.id === spanBId;
              
              let nodeColor = "bg-zinc-800 border-zinc-700";
              if (span.hasState) nodeColor = "bg-zinc-900 border-zinc-500 cursor-pointer";
              if (isSelectedA) nodeColor = "bg-blue-600 border-blue-400 cursor-pointer scale-110 shadow-[0_0_10px_rgba(59,130,246,0.5)]";
              if (isSelectedB) nodeColor = "bg-emerald-600 border-emerald-400 cursor-pointer scale-110 shadow-[0_0_10px_rgba(16,185,129,0.5)]";

              return (
                <div 
                  key={span.id}
                  onClick={() => {
                    if (span.hasState || true) {
                      // Click alternates setting A and B comparison targets
                      if (spanAId === span.id) return;
                      if (!isSelectedA && !isSelectedB) {
                        setSpanBId(span.id);
                      } else if (isSelectedB) {
                        setSpanAId(span.id);
                      }
                    }
                  }}
                  className="flex flex-col items-center z-10 shrink-0 select-none group"
                >
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center font-mono text-[9px] text-zinc-200 transition-all ${nodeColor}`}>
                    {span.execution_order ?? idx}
                  </div>
                  <span className="text-[8px] font-mono text-zinc-550 mt-1.5 max-w-[65px] truncate text-center block group-hover:text-zinc-300">
                    {span.span_name || span.model || 'span'}
                  </span>
                  {span.hasState && (
                    <span className="text-[7px] text-zinc-500 font-bold uppercase tracking-wider scale-90 mt-0.5">
                      💾 State
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex justify-between w-full font-mono text-[9px] text-zinc-650 mt-2 border-t border-zinc-900 pt-2">
            <span>ℹ️ Click timeline nodes to update comparison targets.</span>
            <div className="flex gap-4">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-blue-600 rounded-full" /> Span A</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-emerald-600 rounded-full" /> Span B</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Selectors Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Selector A */}
        <div className="bg-[#0a0a0c] border border-zinc-850 rounded-xl p-4 space-y-2">
          <label className="text-[9.5px] font-bold text-zinc-500 uppercase tracking-wider font-mono block">
            State Snapshot A (Base Step)
          </label>
          <div className="flex items-center gap-2">
            <select
              value={spanAId}
              onChange={(e) => setSpanAId(e.target.value)}
              className="flex-1 bg-[#121215] border border-zinc-800 text-zinc-300 font-mono text-[11px] rounded-lg px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-zinc-700"
            >
              {spansWithState.map((span, idx) => (
                <option key={span.id} value={span.id}>
                  #{span.execution_order ?? idx}: {span.displayName} {span.hasState ? '(State Captured)' : '(No State)'}
                </option>
              ))}
            </select>
            {spanA?.hasState && (
              <button
                onClick={() => openForkModal(spanA)}
                className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-350 hover:text-zinc-150 text-[10px] font-bold uppercase tracking-wider px-3 py-2.5 rounded-lg font-mono transition-all cursor-pointer"
              >
                🍴 Fork
              </button>
            )}
          </div>
        </div>

        {/* Selector B */}
        <div className="bg-[#0a0a0c] border border-zinc-850 rounded-xl p-4 space-y-2">
          <label className="text-[9.5px] font-bold text-zinc-500 uppercase tracking-wider font-mono block">
            State Snapshot B (Compare Step)
          </label>
          <div className="flex items-center gap-2">
            <select
              value={spanBId}
              onChange={(e) => setSpanBId(e.target.value)}
              className="flex-1 bg-[#121215] border border-zinc-800 text-zinc-300 font-mono text-[11px] rounded-lg px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-zinc-700"
            >
              {spansWithState.map((span, idx) => (
                <option key={span.id} value={span.id}>
                  #{span.execution_order ?? idx}: {span.displayName} {span.hasState ? '(State Captured)' : '(No State)'}
                </option>
              ))}
            </select>
            {spanB?.hasState && (
              <button
                onClick={() => openForkModal(spanB)}
                className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-350 hover:text-zinc-150 text-[10px] font-bold uppercase tracking-wider px-3 py-2.5 rounded-lg font-mono transition-all cursor-pointer"
              >
                🍴 Fork
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 3. Split-Pane Side-by-Side Comparison Diff */}
      <div className="bg-[#0a0a0c] border border-zinc-850 rounded-xl overflow-hidden shadow-2xl">
        <div className="bg-[#0d0d10] px-5 py-3 border-b border-zinc-850 flex items-center justify-between font-mono text-[10.5px]">
          <span className="font-semibold text-zinc-400">Interactive Snapshot Inspector</span>
          <div className="flex gap-4 text-[9px] uppercase tracking-wider font-bold">
            <span className="text-emerald-450">+ Added in B</span>
            <span className="text-red-400">- Removed in B</span>
            <span className="text-yellow-400">~ Mutated</span>
          </div>
        </div>

        <div className="bg-[#070709] p-5 divide-y divide-zinc-900/50 space-y-4">
          {allKeys.length === 0 ? (
            <div className="text-center py-12 text-zinc-600 italic text-xs leading-relaxed font-mono">
              No active state snapshot data captured at either comparison checkpoint.<br />
              <span className="text-[10px] text-zinc-750 block mt-2">
                💡 Tip: Use sdk.capture_state(dict) in Python or TypeScript before span completion to record agent memories.
              </span>
            </div>
          ) : (
            allKeys.map(key => {
              const inA = key in stateA;
              const inB = key in stateB;
              const valA = stateA[key];
              const valB = stateB[key];
              const strA = JSON.stringify(valA, null, 2);
              const strB = JSON.stringify(valB, null, 2);
              const isChanged = strA !== strB;

              let rowClass = "border-transparent";
              let titleColor = "text-zinc-300";

              if (inB && !inA) {
                rowClass = "border-emerald-950 bg-emerald-950/5 pl-3 border-l-2 py-2";
                titleColor = "text-emerald-400";
              } else if (!inB && inA) {
                rowClass = "border-red-950 bg-red-950/5 pl-3 border-l-2 py-2 line-through";
                titleColor = "text-red-400";
              } else if (isChanged) {
                rowClass = "border-yellow-950 bg-yellow-950/5 pl-3 border-l-2 py-2";
                titleColor = "text-yellow-400 font-semibold";
              }

              return (
                <div key={key} className={`space-y-2 pt-3 transition-colors ${rowClass}`}>
                  <div className="flex items-center justify-between">
                    <span className={`font-mono text-[11px] font-bold ${titleColor}`}>
                      key: {key}
                    </span>
                    <span className="font-mono text-[9px] text-zinc-650">
                      {(!inA) ? "added" : (!inB) ? "removed" : isChanged ? "mutated" : "unchanged"}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Left side (A) */}
                    <div>
                      <span className="text-[8.5px] font-bold text-zinc-600 uppercase font-mono tracking-wider block mb-1">State A</span>
                      {inA ? (
                        <pre className="bg-[#0a0a0c] border border-zinc-850/80 p-3 rounded-lg text-[10px] font-mono text-zinc-400 overflow-x-auto max-h-[180px] leading-normal selection:bg-zinc-800">
                          {strA}
                        </pre>
                      ) : (
                        <div className="bg-[#08080a] border border-zinc-900 border-dashed p-3 rounded-lg text-[10px] font-mono text-zinc-700 italic select-none">
                          (Key undefined at step A)
                        </div>
                      )}
                    </div>

                    {/* Right side (B) */}
                    <div>
                      <span className="text-[8.5px] font-bold text-zinc-600 uppercase font-mono tracking-wider block mb-1">State B</span>
                      {inB ? (
                        <pre className={`bg-[#0a0a0c] border border-zinc-850/80 p-3 rounded-lg text-[10px] font-mono overflow-x-auto max-h-[180px] leading-normal selection:bg-zinc-800 ${isChanged && inA ? "text-emerald-350 border-emerald-950/30" : "text-zinc-400"}`}>
                          {strB}
                        </pre>
                      ) : (
                        <div className="bg-[#08080a] border border-zinc-900 border-dashed p-3 rounded-lg text-[10px] font-mono text-zinc-700 italic select-none">
                          (Key undefined at step B)
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 4. Fork Checkpoint Dialog Modal */}
      {showForkModal && forkTargetSpan && (
        <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center p-4">
          {/* Backdrop */}
          <div 
            onClick={() => setShowForkModal(false)}
            className="absolute inset-0 bg-black/80 backdrop-blur-xs transition-opacity"
          />
          
          {/* Content container */}
          <div className="relative w-full max-w-2xl bg-[#0e0e11] border border-zinc-850 rounded-2xl overflow-hidden shadow-2xl flex flex-col justify-between z-10 font-sans">
            <div className="px-6 py-4 border-b border-zinc-850 bg-[#09090b]">
              <h3 className="font-bold text-zinc-100 text-sm font-mono flex items-center gap-2">
                🍴 Fork Execution Checkpoint
              </h3>
              <p className="text-[9.5px] text-zinc-550 font-mono mt-1">
                Trigger execution replay on the agent framework from Step #{forkTargetSpan.execution_order}.
              </p>
            </div>

            <div className="p-6 space-y-4 max-h-[450px] overflow-y-auto">
              <div className="space-y-1.5">
                <label className="text-[10px] text-zinc-400 font-semibold block font-mono">
                  Modify State Snapshot (Payload JSON)
                </label>
                <textarea
                  value={forkStateInput}
                  onChange={(e) => setForkStateInput(e.target.value)}
                  rows={6}
                  className="w-full bg-[#121215] border border-zinc-800 rounded-lg p-3 text-[10.5px] font-mono text-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-650"
                />
              </div>

              {/* API Integration Snippet */}
              <div className="space-y-1.5">
                <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block font-mono">
                  cURL Replay API Request
                </span>
                <pre className="bg-[#09090b] border border-zinc-850/80 p-4 rounded-lg text-[9.5px] font-mono text-zinc-400 overflow-x-auto leading-normal whitespace-pre-wrap select-all">
{`curl -X POST https://llmwatch-eight.vercel.app/api/public/v1/fork \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "trace_id": "${spanA?.trace_id}",
    "fork_from_span_id": "${forkTargetSpan.id}",
    "modified_state": ${forkStateInput.replace(/\n/g, '\n    ')}
  }'`}
                </pre>
              </div>

              <div className="space-y-1.5">
                <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block font-mono">
                  Python SDK Checkpoint Fork
                </span>
                <pre className="bg-[#09090b] border border-zinc-850/80 p-4 rounded-lg text-[9.5px] font-mono text-zinc-400 overflow-x-auto leading-normal whitespace-pre-wrap select-all">
{`from sdk.llmwatch import LLMWatch

sdk = LLMWatch(api_key="YOUR_API_KEY")
# Restore state and re-trigger target span context block
state = sdk.fork_state(
    trace_id="${spanA?.trace_id}", 
    span_id="${forkTargetSpan.id}"
)
print("Restored memory:", state.memory)`}
                </pre>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-zinc-850 bg-[#09090b] flex items-center justify-between">
              {forkSuccess ? (
                <span className="text-emerald-450 font-mono font-bold text-[10.5px] animate-pulse">
                  ✓ Replay simulation triggered successfully!
                </span>
              ) : (
                <span className="text-zinc-600 text-[10px] italic">
                  * Note: Replay simulation logs a new branch linked to this trace.
                </span>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => setShowForkModal(false)}
                  className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold rounded-lg transition-colors border border-zinc-700/60"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSimulateFork}
                  className="px-4 py-1.5 bg-[#fafafa] hover:bg-zinc-200 text-[#09090b] text-xs font-bold rounded-lg transition-all"
                >
                  Trigger Fork
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
