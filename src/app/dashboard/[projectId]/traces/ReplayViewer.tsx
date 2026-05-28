// src/app/dashboard/[projectId]/traces/ReplayViewer.tsx
'use client';

import React, { useState, useEffect, useRef } from 'react';

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

interface ReplayViewerProps {
  projectId: string;
  traceId: string;
  spans: Trace[];
  onClose: () => void;
}

// Visual JSON Diff component for state snapshots
function StateDiffViewer({ prev, current }: { prev: any; current: any }) {
  if (!current && !prev) {
    return (
      <div className="text-zinc-550 italic text-[11px] py-4 text-center">
        No state snapshot captured for this step.
      </div>
    );
  }

  const prevObj = prev && typeof prev === 'object' ? prev : {};
  const currObj = current && typeof current === 'object' ? current : {};

  const allKeys = Array.from(new Set([...Object.keys(prevObj), ...Object.keys(currObj)])).sort();

  return (
    <div className="border border-zinc-850 rounded-lg overflow-hidden font-mono text-[11px]">
      <div className="bg-[#09090b] px-4 py-2 border-b border-zinc-850 flex items-center justify-between">
        <span className="font-semibold text-zinc-400">State Snapshot Diff</span>
        <div className="flex gap-3 text-[9px] uppercase tracking-wider font-semibold">
          <span className="text-emerald-400">+ Added</span>
          <span className="text-red-400">- Removed</span>
          <span className="text-yellow-400">~ Changed</span>
        </div>
      </div>
      <div className="bg-[#0c0c0e] p-4 divide-y divide-zinc-900/60 max-h-[350px] overflow-y-auto space-y-1">
        {allKeys.length === 0 ? (
          <div className="text-zinc-650 italic text-center py-2">Empty state object</div>
        ) : (
          allKeys.map(key => {
            const hasPrev = key in prevObj;
            const hasCurr = key in currObj;
            const valPrev = prevObj[key];
            const valCurr = currObj[key];
            const stringifiedPrev = JSON.stringify(valPrev, null, 2);
            const stringifiedCurr = JSON.stringify(valCurr, null, 2);
            const isChanged = stringifiedPrev !== stringifiedCurr;

            let rowClass = "text-zinc-400";
            let indicator = " ";
            let displayValue = stringifiedCurr;

            if (hasCurr && !hasPrev) {
              rowClass = "text-emerald-400 bg-emerald-950/10 border-l-2 border-emerald-500 pl-2 py-1";
              indicator = "+";
            } else if (!hasCurr && hasPrev) {
              rowClass = "text-red-400 bg-red-950/10 border-l-2 border-red-500 pl-2 py-1 line-through";
              indicator = "-";
              displayValue = stringifiedPrev;
            } else if (isChanged) {
              rowClass = "text-yellow-400 bg-yellow-950/10 border-l-2 border-yellow-500 pl-2 py-1";
              indicator = "~";
            }

            return (
              <div key={key} className={`py-1.5 transition-colors font-mono whitespace-pre-wrap leading-relaxed ${rowClass}`}>
                <div className="flex items-start gap-1">
                  <span className="select-none font-bold opacity-60 text-[9px] w-3">{indicator}</span>
                  <span className="font-semibold text-zinc-350">{key}:</span>
                  {isChanged && hasPrev && hasCurr ? (
                    <div className="flex flex-col gap-1 w-full ml-1">
                      <div className="text-red-400/70 text-[10px] line-through">
                        {stringifiedPrev}
                      </div>
                      <div className="text-emerald-400 font-semibold">
                        {stringifiedCurr}
                      </div>
                    </div>
                  ) : (
                    <span className="ml-1">{displayValue}</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default function ReplayViewer({ projectId, traceId, spans, onClose }: ReplayViewerProps) {
  // Sort spans by execution order if they aren't already
  const sortedSpans = [...spans].sort((a, b) => (a.execution_order || 0) - (b.execution_order || 0));
  
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(2000); // ms per step
  const [activeTab, setActiveTab] = useState<'inspect' | 'state' | 'raw'>('inspect');
  
  const playTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Playback timer effect
  useEffect(() => {
    if (isPlaying) {
      playTimerRef.current = setInterval(() => {
        setCurrentIndex((prev) => {
          if (prev >= sortedSpans.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, speed);
    } else {
      if (playTimerRef.current) {
        clearInterval(playTimerRef.current);
      }
    }

    return () => {
      if (playTimerRef.current) {
        clearInterval(playTimerRef.current);
      }
    };
  }, [isPlaying, speed, sortedSpans.length]);

  const currentSpan = sortedSpans[currentIndex];
  const prevSpan = currentIndex > 0 ? sortedSpans[currentIndex - 1] : null;

  const handleStepBack = () => {
    setIsPlaying(false);
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleStepForward = () => {
    setIsPlaying(false);
    if (currentIndex < sortedSpans.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handleRestart = () => {
    setIsPlaying(false);
    setCurrentIndex(0);
  };

  // Helper icons
  const playIcon = (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M8 5v14l11-7z" />
    </svg>
  );

  const pauseIcon = (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
    </svg>
  );

  const backIcon = (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
    </svg>
  );

  const forwardIcon = (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  );

  const restartIcon = (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
    </svg>
  );

  // Type styling
  let badgeClass = "bg-zinc-800 text-zinc-400";
  if (currentSpan?.span_type === 'agent') badgeClass = "bg-blue-950/40 text-blue-400 border border-blue-900/30";
  if (currentSpan?.span_type === 'chain') badgeClass = "bg-purple-950/40 text-purple-400 border border-purple-900/30";
  if (currentSpan?.span_type === 'tool') badgeClass = "bg-amber-950/40 text-amber-400 border border-amber-900/30";

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
      {/* Backdrop */}
      <div 
        onClick={onClose}
        className="absolute inset-0 bg-black/75 backdrop-blur-xs transition-opacity"
      />

      {/* Replay Console Container */}
      <div className="relative w-full max-w-6xl bg-[#0e0e11] border-l border-zinc-850 h-full shadow-2xl flex flex-col justify-between z-10 font-sans">
        
        {/* Header */}
        <div className="h-16 px-6 border-b border-zinc-850 flex items-center justify-between bg-[#09090b]/80 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <div>
              <h3 className="font-bold text-zinc-100 text-sm tracking-tight flex items-center gap-2">
                Execution Replay Engine
                <span className="text-[10px] bg-zinc-800 text-zinc-400 font-mono px-2 py-0.5 rounded font-normal">
                  Phase 5
                </span>
              </h3>
              <p className="text-[9px] text-zinc-500 font-mono mt-0.5">
                Trace ID: {traceId} • Sequence Length: {sortedSpans.length} steps
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-zinc-500 hover:text-zinc-200 transition-colors rounded-md hover:bg-zinc-800/40"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Main Interface Workspace */}
        <div className="flex-1 overflow-hidden flex flex-row">
          
          {/* Left Panel: Execution Track Timeline */}
          <div className="w-80 border-r border-zinc-850/80 p-5 overflow-y-auto flex flex-col space-y-4 bg-[#0a0a0c]">
            <div className="flex items-center justify-between border-b border-zinc-800/60 pb-2">
              <h4 className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">Sequence Logs</h4>
              <span className="text-[9px] bg-zinc-900 px-2 py-0.5 rounded font-mono text-zinc-400">
                Step {currentIndex + 1} of {sortedSpans.length}
              </span>
            </div>

            <div className="space-y-1.5 flex-1">
              {sortedSpans.map((span, index) => {
                const isActive = index === currentIndex;
                const isPassed = index < currentIndex;
                const isErr = !!span.error_message;

                let rowStyle = "text-zinc-500 hover:bg-zinc-900/30";
                if (isActive) rowStyle = "bg-zinc-800/60 text-zinc-100 border-l-2 border-zinc-400 font-semibold shadow-sm";
                else if (isPassed) rowStyle = "text-zinc-400 opacity-60";

                return (
                  <div
                    key={span.id}
                    onClick={() => {
                      setIsPlaying(false);
                      setCurrentIndex(index);
                    }}
                    className={`flex items-center gap-2.5 p-2 rounded-md cursor-pointer transition-all ${rowStyle}`}
                  >
                    <div className={`font-mono text-[9px] font-bold w-5 text-right ${isActive ? "text-zinc-200" : "text-zinc-600"}`}>
                      #{span.execution_order ?? index}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[11px] truncate block">
                          {span.span_name || span.model || 'execute-span'}
                        </span>
                        {isErr && (
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-[8.5px] uppercase font-mono text-zinc-550 mt-0.5">
                        <span>{span.span_type || 'llm'}</span>
                        {span.latency_ms && (
                          <span>• {span.latency_ms}ms</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Panel: Replay Details Workspace */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-[#0e0e11]">
            
            {/* Playback Controls Console */}
            <div className="bg-[#09090b] border border-zinc-850 p-4 rounded-xl shadow-lg flex flex-col gap-4">
              
              {/* Controls bar */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleRestart}
                    title="Restart Playback"
                    className="p-2 bg-zinc-900 border border-zinc-800 hover:bg-zinc-805 text-zinc-350 hover:text-zinc-100 rounded-lg transition-all"
                  >
                    {restartIcon}
                  </button>
                  <button
                    onClick={handleStepBack}
                    disabled={currentIndex === 0}
                    title="Step Back"
                    className="p-2 bg-zinc-900 border border-zinc-800 hover:bg-zinc-805 text-zinc-350 hover:text-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-all"
                  >
                    {backIcon}
                  </button>
                  <button
                    onClick={() => setIsPlaying(!isPlaying)}
                    title={isPlaying ? "Pause" : "Play Replay"}
                    className="p-3 bg-[#fafafa] hover:bg-zinc-200 text-[#09090b] rounded-lg shadow-md transition-all flex items-center justify-center font-bold"
                  >
                    {isPlaying ? pauseIcon : playIcon}
                  </button>
                  <button
                    onClick={handleStepForward}
                    disabled={currentIndex === sortedSpans.length - 1}
                    title="Step Forward"
                    className="p-2 bg-zinc-900 border border-zinc-800 hover:bg-zinc-805 text-zinc-350 hover:text-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-all"
                  >
                    {forwardIcon}
                  </button>
                </div>

                {/* Status indicator & speed */}
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider font-semibold">
                    Speed:
                  </span>
                  <select
                    value={speed}
                    onChange={(e) => setSpeed(Number(e.target.value))}
                    className="bg-[#18181b] border border-zinc-800 text-zinc-300 font-mono text-[10px] rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-zinc-600 focus:border-zinc-600"
                  >
                    <option value={1000}>1.0s / step</option>
                    <option value={2000}>2.0s / step</option>
                    <option value={3000}>3.0s / step</option>
                    <option value={5000}>5.0s / step</option>
                  </select>
                </div>
              </div>

              {/* Progress slider timeline */}
              <div className="space-y-1">
                <input
                  type="range"
                  min="0"
                  max={sortedSpans.length - 1}
                  value={currentIndex}
                  onChange={(e) => {
                    setIsPlaying(false);
                    setCurrentIndex(Number(e.target.value));
                  }}
                  className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-[#fafafa]"
                />
                <div className="flex justify-between font-mono text-[9px] text-zinc-600 mt-1">
                  <span>Start (Step #0)</span>
                  <span className="text-zinc-400 font-semibold bg-zinc-900 px-2 py-0.5 rounded border border-zinc-850">
                    Active Step: #{currentSpan?.execution_order ?? currentIndex}
                  </span>
                  <span>End (Step #{sortedSpans.length - 1})</span>
                </div>
              </div>
            </div>

            {/* Current Step Overview */}
            {currentSpan && (
              <>
                {/* Step Metadata Header */}
                <div className="flex items-start justify-between border-b border-zinc-850 pb-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[9.5px] font-bold uppercase ${badgeClass}`}>
                        {currentSpan.span_type || 'llm'}
                      </span>
                      <h4 className="font-bold text-sm text-zinc-200">
                        {currentSpan.span_name || currentSpan.model}
                      </h4>
                    </div>
                    <p className="text-[10px] font-mono text-zinc-500">
                      Span ID: {currentSpan.id} • Started: {new Date(currentSpan.created_at).toLocaleTimeString()}
                    </p>
                  </div>

                  <div className="flex gap-2 font-mono text-[10px] text-zinc-400 bg-zinc-900/50 px-3 py-1.5 rounded-lg border border-zinc-850">
                    <span>{currentSpan.latency_ms}ms</span>
                    <span className="text-zinc-650">•</span>
                    <span>{currentSpan.prompt_tokens + currentSpan.completion_tokens} tokens</span>
                    <span className="text-zinc-650">•</span>
                    <span className="text-zinc-300 font-semibold">${(currentSpan.cost_usd || 0).toFixed(6)}</span>
                  </div>
                </div>

                {/* Phase 5 Special: Intermediate Reasoning/Chain-of-Thought */}
                {currentSpan.reasoning_text && (
                  <div className="bg-[#101622]/40 border border-blue-900/20 p-5 rounded-xl space-y-2">
                    <div className="flex items-center gap-2 text-blue-400">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                      <span className="text-[10px] uppercase font-bold tracking-wider font-mono">
                        Intermediate reasoning / Chain of Thought
                      </span>
                    </div>
                    <p className="text-zinc-300 text-xs font-mono whitespace-pre-wrap leading-relaxed">
                      {currentSpan.reasoning_text}
                    </p>
                  </div>
                )}

                {/* Tabs Selector */}
                <div className="flex border-b border-zinc-850 gap-2">
                  <button
                    onClick={() => setActiveTab('inspect')}
                    className={`px-4 py-2 text-xs font-semibold border-b-2 transition-all ${
                      activeTab === 'inspect'
                        ? 'border-zinc-400 text-zinc-100'
                        : 'border-transparent text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    Input / Output
                  </button>
                  <button
                    onClick={() => setActiveTab('state')}
                    className={`px-4 py-2 text-xs font-semibold border-b-2 transition-all ${
                      activeTab === 'state'
                        ? 'border-zinc-400 text-zinc-100'
                        : 'border-transparent text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    State Snapshots
                  </button>
                  <button
                    onClick={() => setActiveTab('raw')}
                    className={`px-4 py-2 text-xs font-semibold border-b-2 transition-all ${
                      activeTab === 'raw'
                        ? 'border-zinc-400 text-zinc-100'
                        : 'border-transparent text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    Raw Event JSON
                  </button>
                </div>

                {/* Tab Workspace Panels */}
                <div className="space-y-4 mt-2">
                  {activeTab === 'inspect' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Request Payload */}
                      <div className="space-y-2">
                        <span className="font-semibold text-zinc-450 text-[11px] block">Request Payload (Input)</span>
                        <pre className="bg-[#09090b] border border-zinc-850 p-4 rounded-lg text-[10.5px] font-mono text-zinc-300 overflow-x-auto max-h-[350px] selection:bg-zinc-800 leading-normal">
                          {JSON.stringify(currentSpan.request_payload, null, 2) || '{}'}
                        </pre>
                      </div>

                      {/* Response Payload */}
                      <div className="space-y-2">
                        <span className="font-semibold text-zinc-450 text-[11px] block">Response Payload (Output)</span>
                        {currentSpan.error_message ? (
                          <div className="bg-red-950/10 border border-red-900/30 p-4 rounded-lg text-xs font-mono space-y-1">
                            <span className="text-[10px] font-bold text-red-400 block uppercase">Error Message</span>
                            <p className="text-red-300 leading-relaxed">{currentSpan.error_message}</p>
                          </div>
                        ) : (
                          <pre className="bg-[#09090b] border border-zinc-850 p-4 rounded-lg text-[10.5px] font-mono text-zinc-300 overflow-x-auto max-h-[350px] selection:bg-zinc-800 leading-normal">
                            {JSON.stringify(currentSpan.response_payload, null, 2) || '{}'}
                          </pre>
                        )}
                      </div>
                    </div>
                  )}

                  {activeTab === 'state' && (
                    <div className="space-y-4">
                      {/* State Diff Viewer */}
                      <StateDiffViewer 
                        prev={prevSpan?.state_snapshot} 
                        current={currentSpan.state_snapshot} 
                      />

                      {/* Full Current State Dump */}
                      {currentSpan.state_snapshot && (
                        <div className="space-y-2">
                          <span className="font-semibold text-zinc-550 text-[10px] uppercase font-mono tracking-wider block">Full Current State Snapshot</span>
                          <pre className="bg-[#09090b] border border-zinc-850 p-4 rounded-lg text-[10.5px] font-mono text-zinc-300 overflow-x-auto selection:bg-zinc-800 leading-normal">
                            {JSON.stringify(currentSpan.state_snapshot, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === 'raw' && (
                    <div className="space-y-2">
                      <span className="font-semibold text-zinc-450 text-[11px] block">Raw Telemetry Event</span>
                      <pre className="bg-[#09090b] border border-zinc-850 p-4 rounded-lg text-[10.5px] font-mono text-zinc-300 overflow-x-auto selection:bg-zinc-800 leading-normal">
                        {JSON.stringify(currentSpan, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="h-14 px-6 border-t border-zinc-850 bg-[#09090b]/80 backdrop-blur-md flex items-center justify-end">
          <button 
            onClick={onClose}
            className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold rounded-lg transition-colors border border-zinc-700/60"
          >
            Close Replay console
          </button>
        </div>
      </div>
    </div>
  );
}
