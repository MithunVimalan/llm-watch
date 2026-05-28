// src/app/dashboard/[projectId]/traces/TokenFlow.tsx
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
  execution_order?: number | null;
  token_breakdown?: {
    system_prompt?: number;
    user_input?: number;
    rag_context?: number;
    memory?: number;
    function_defs?: number;
    other?: number;
    [key: string]: any;
  } | null;
  context_window_used?: number | null;
  context_window_max?: number | null;
}

interface TokenFlowProps {
  spans: Trace[];
}

export default function TokenFlow({ spans }: TokenFlowProps) {
  // Sort spans by execution order
  const sortedSpans = useMemo(() => {
    return [...spans].sort((a, b) => (a.execution_order || 0) - (b.execution_order || 0));
  }, [spans]);

  // 1. Calculate Aggregate Token Counts
  const aggregates = useMemo(() => {
    let totalPrompt = 0;
    let totalCompletion = 0;
    let systemPrompt = 0;
    let userInput = 0;
    let ragContext = 0;
    let memory = 0;
    let functionDefs = 0;
    let other = 0;

    sortedSpans.forEach(s => {
      totalPrompt += s.prompt_tokens || 0;
      totalCompletion += s.completion_tokens || 0;

      const breakdown = s.token_breakdown;
      if (breakdown) {
        systemPrompt += breakdown.system_prompt || 0;
        userInput += breakdown.user_input || 0;
        ragContext += breakdown.rag_context || 0;
        memory += breakdown.memory || 0;
        functionDefs += breakdown.function_defs || 0;
        other += breakdown.other || 0;
      } else if (s.prompt_tokens) {
        // Fallback heuristic estimation if no explicit breakdown was tracked
        // Estimate 15% system prompt, 15% user input, 70% RAG context/other
        systemPrompt += Math.round(s.prompt_tokens * 0.15);
        userInput += Math.round(s.prompt_tokens * 0.15);
        if (s.span_type === 'llm' && s.prompt_tokens > 1000) {
          ragContext += Math.round(s.prompt_tokens * 0.7);
        } else {
          other += Math.round(s.prompt_tokens * 0.7);
        }
      }
    });

    const grandTotal = totalPrompt + totalCompletion;

    return {
      totalPrompt,
      totalCompletion,
      grandTotal,
      systemPrompt,
      userInput,
      ragContext,
      memory,
      functionDefs,
      other
    };
  }, [sortedSpans]);

  // 2. Identify Efficiency Warnings (Waste Detection)
  const anomalies = useMemo(() => {
    const alerts: Array<{
      spanId: string;
      spanName: string;
      promptTokens: number;
      completionTokens: number;
      ragTokens: number;
      description: string;
    }> = [];

    sortedSpans.forEach(s => {
      const prompt = s.prompt_tokens || 0;
      const completion = s.completion_tokens || 0;
      const rag = s.token_breakdown?.rag_context || 0;

      // Waste Alert Condition: Prompt tokens > 1500, RAG is > 50% of prompt, completion is tiny (< 100 tokens)
      if (prompt > 1500 && (rag > prompt * 0.5 || prompt > 2000) && completion > 0 && completion < 100) {
        alerts.push({
          spanId: s.id,
          spanName: s.span_name || s.model || 'LLM call',
          promptTokens: prompt,
          completionTokens: completion,
          ragTokens: rag || Math.round(prompt * 0.7),
          description: `Loaded a massive prompt/context payload (${prompt} tokens) but generated only ${completion} completion tokens.`
        });
      }
    });

    return alerts;
  }, [sortedSpans]);

  // 3. Compute Context Window Growth Line Chart Coordinates
  const chartData = useMemo(() => {
    let cumulative = 0;
    const points = sortedSpans.map((s, idx) => {
      cumulative += (s.prompt_tokens || 0) + (s.completion_tokens || 0);
      return {
        x: idx,
        y: cumulative,
        name: s.span_name || s.model || `step-${idx}`
      };
    });

    if (points.length === 0) return { points: [], dPath: '', width: 100, height: 100 };

    const width = 340;
    const height = 120;
    const maxY = Math.max(100, ...points.map(p => p.y));
    const padding = 15;

    const coords = points.map(p => {
      const cx = points.length > 1 
        ? padding + (p.x / (points.length - 1)) * (width - padding * 2) 
        : width / 2;
      const cy = height - padding - (p.y / maxY) * (height - padding * 2);
      return { ...p, cx, cy };
    });

    // Build SVG path
    let dPath = '';
    if (coords.length > 0) {
      dPath = `M ${coords[0].cx} ${coords[0].cy}`;
      for (let i = 1; i < coords.length; i++) {
        dPath += ` L ${coords[i].cx} ${coords[i].cy}`;
      }
    }

    return {
      points: coords,
      dPath,
      width,
      height,
      maxY
    };
  }, [sortedSpans]);

  // Helper percentage calculations for Sankey block sizes
  const getPercent = (value: number) => {
    if (aggregates.grandTotal === 0) return 0;
    return (value / aggregates.grandTotal) * 100;
  };

  return (
    <div className="space-y-6">
      
      {/* 1. Interactive Token Breakdown Flows (Visual Flow representation) */}
      <div className="space-y-2">
        <span className="text-[10px] text-zinc-550 uppercase tracking-wider font-bold font-mono">
          Token Distribution Flow
        </span>
        <div className="bg-[#0a0a0c] border border-zinc-850 rounded-xl p-5 space-y-4">
          {aggregates.grandTotal === 0 ? (
            <div className="text-center py-6 text-zinc-550 italic text-[11px]">
              No token tracking statistics recorded for this trace.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
              
              {/* Left Side: Breakdown Stack */}
              <div className="space-y-3.5">
                <span className="text-[10px] text-zinc-400 font-semibold block border-b border-zinc-850 pb-1.5">
                  Sources of Consumed Tokens
                </span>
                
                {/* System Prompt Bar */}
                {aggregates.systemPrompt > 0 && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] font-mono">
                      <span className="text-zinc-400 font-medium">System Prompt</span>
                      <span className="text-zinc-500">{aggregates.systemPrompt} tokens ({getPercent(aggregates.systemPrompt).toFixed(1)}%)</span>
                    </div>
                    <div className="h-1.5 bg-zinc-900 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500/80 rounded-full" style={{ width: `${getPercent(aggregates.systemPrompt)}%` }} />
                    </div>
                  </div>
                )}

                {/* RAG Context Bar */}
                {aggregates.ragContext > 0 && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] font-mono">
                      <span className="text-amber-400 font-medium">RAG Context (Knowledge Base)</span>
                      <span className="text-zinc-550 font-bold">{aggregates.ragContext} tokens ({getPercent(aggregates.ragContext).toFixed(1)}%)</span>
                    </div>
                    <div className="h-1.5 bg-zinc-900 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-500/80 rounded-full" style={{ width: `${getPercent(aggregates.ragContext)}%` }} />
                    </div>
                  </div>
                )}

                {/* Memory/Conversation History Bar */}
                {aggregates.memory > 0 && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] font-mono">
                      <span className="text-purple-400 font-medium">Conversation Memory</span>
                      <span className="text-zinc-500">{aggregates.memory} tokens ({getPercent(aggregates.memory).toFixed(1)}%)</span>
                    </div>
                    <div className="h-1.5 bg-zinc-900 rounded-full overflow-hidden">
                      <div className="h-full bg-purple-500/80 rounded-full" style={{ width: `${getPercent(aggregates.memory)}%` }} />
                    </div>
                  </div>
                )}

                {/* User Input Bar */}
                {aggregates.userInput > 0 && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] font-mono">
                      <span className="text-emerald-400 font-medium">User Message / Input</span>
                      <span className="text-zinc-500">{aggregates.userInput} tokens ({getPercent(aggregates.userInput).toFixed(1)}%)</span>
                    </div>
                    <div className="h-1.5 bg-zinc-900 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500/80 rounded-full" style={{ width: `${getPercent(aggregates.userInput)}%` }} />
                    </div>
                  </div>
                )}

                {/* Function Definitions Bar */}
                {aggregates.functionDefs > 0 && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] font-mono">
                      <span className="text-pink-400 font-medium">Tool Call Signatures</span>
                      <span className="text-zinc-500">{aggregates.functionDefs} tokens ({getPercent(aggregates.functionDefs).toFixed(1)}%)</span>
                    </div>
                    <div className="h-1.5 bg-zinc-900 rounded-full overflow-hidden">
                      <div className="h-full bg-pink-500/80 rounded-full" style={{ width: `${getPercent(aggregates.functionDefs)}%` }} />
                    </div>
                  </div>
                )}

                {/* Other/Unassigned Bar */}
                {aggregates.other > 0 && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] font-mono">
                      <span className="text-zinc-500">Other (Templates / Formatting)</span>
                      <span className="text-zinc-600">{aggregates.other} tokens ({getPercent(aggregates.other).toFixed(1)}%)</span>
                    </div>
                    <div className="h-1.5 bg-zinc-900 rounded-full overflow-hidden">
                      <div className="h-full bg-zinc-700/80 rounded-full" style={{ width: `${getPercent(aggregates.other)}%` }} />
                    </div>
                  </div>
                )}
              </div>

              {/* Right Side: Total Consumption Sankey Block */}
              <div className="bg-[#09090b] border border-zinc-850 p-4 rounded-xl flex flex-col justify-center space-y-4">
                <span className="text-[10px] text-zinc-400 font-semibold block border-b border-zinc-850 pb-1.5">
                  Output Channel Usage
                </span>
                
                <div className="space-y-3">
                  <div className="flex justify-between text-[10.5px]">
                    <span className="text-zinc-350">Prompt Ingest (Inputs)</span>
                    <span className="font-mono text-zinc-200 font-bold">{aggregates.totalPrompt} tokens</span>
                  </div>
                  <div className="flex justify-between text-[10.5px]">
                    <span className="text-zinc-350">Completions (Outputs)</span>
                    <span className="font-mono text-emerald-450 font-bold">{aggregates.totalCompletion} tokens</span>
                  </div>
                  
                  <div className="h-4 bg-zinc-900 rounded-md overflow-hidden flex font-mono text-[9px] text-center text-zinc-950 font-bold">
                    <div className="bg-zinc-400 h-full flex items-center justify-center" style={{ width: `${(aggregates.totalPrompt / aggregates.grandTotal) * 100}%` }}>
                      {((aggregates.totalPrompt / aggregates.grandTotal) * 100) > 15 ? "Prompt" : ""}
                    </div>
                    <div className="bg-emerald-500 h-full flex items-center justify-center text-[#09090b]" style={{ width: `${(aggregates.totalCompletion / aggregates.grandTotal) * 100}%` }}>
                      {((aggregates.totalCompletion / aggregates.grandTotal) * 100) > 15 ? "Output" : ""}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-zinc-500 pt-2 border-t border-zinc-900 font-mono">
                    <span>Grand Total:</span>
                    <span className="font-bold text-zinc-300">{aggregates.grandTotal} tokens</span>
                  </div>
                </div>
              </div>

            </div>
          )}
        </div>
      </div>

      {/* 2. Context Growth Chart */}
      <div className="space-y-2">
        <span className="text-[10px] text-zinc-550 uppercase tracking-wider font-bold font-mono">
          Cumulative Token Growth Timeline
        </span>
        <div className="bg-[#0a0a0c] border border-zinc-850 rounded-xl p-5">
          {chartData.points.length === 0 ? (
            <div className="text-center py-4 text-zinc-550 italic text-[11px]">
              No timeline statistics.
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <svg 
                viewBox={`0 0 ${chartData.width} ${chartData.height}`} 
                className="w-full max-h-[140px]"
              >
                {/* SVG Grid lines */}
                <line x1="15" y1="15" x2="325" y2="15" stroke="#1f1f23" strokeWidth="1" strokeDasharray="3,3" />
                <line x1="15" y1="60" x2="325" y2="60" stroke="#1f1f23" strokeWidth="1" strokeDasharray="3,3" />
                <line x1="15" y1="105" x2="325" y2="105" stroke="#1f1f23" strokeWidth="1" strokeDasharray="3,3" />

                {/* Path line */}
                <path
                  d={chartData.dPath}
                  fill="none"
                  stroke="#fafafa"
                  strokeWidth="2"
                  className="drop-shadow-[0_2px_4px_rgba(255,255,255,0.15)]"
                />

                {/* Data Points */}
                {chartData.points.map((p, idx) => (
                  <g key={idx}>
                    <circle
                      cx={p.cx}
                      cy={p.cy}
                      r="4.5"
                      fill="#0e0e11"
                      stroke="#10b981"
                      strokeWidth="2.5"
                      className="cursor-pointer hover:r-6 hover:fill-emerald-400 transition-all"
                    />
                    {/* Tooltip on hover */}
                    <title>{`${p.name}: ${p.y} total tokens`}</title>
                  </g>
                ))}
              </svg>
              <div className="flex justify-between w-full font-mono text-[9px] text-zinc-600 mt-2 px-4 border-t border-zinc-900 pt-2">
                <span>Start</span>
                <span>Y-Max: {chartData.maxY} tokens</span>
                <span>Step #{chartData.points.length - 1}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3. Waste Detection Alert banner */}
      {anomalies.length > 0 && (
        <div className="space-y-2">
          <span className="text-[10px] text-zinc-550 uppercase tracking-wider font-bold font-mono">
            RAG Context Optimization Alerts
          </span>
          <div className="space-y-3">
            {anomalies.map((alert, idx) => (
              <div key={idx} className="bg-amber-950/10 border border-amber-900/30 p-4 rounded-xl space-y-2 text-xs leading-relaxed shadow-lg">
                <div className="flex items-center gap-2 text-amber-400 font-bold font-mono text-[10px] uppercase">
                  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>Context Waste Warning • Span: {alert.spanName}</span>
                </div>
                <p className="text-amber-200/90 font-mono text-[10.5px]">
                  {alert.description}
                </p>
                <div className="pt-2.5 border-t border-amber-900/20 grid grid-cols-2 gap-4 font-mono text-[9.5px] text-amber-500/80">
                  <div>
                    <span>Prompt Payload: </span>
                    <span className="text-amber-400 font-bold">{alert.promptTokens} t</span>
                  </div>
                  <div>
                    <span>Completion: </span>
                    <span className="text-amber-450 font-bold">{alert.completionTokens} t</span>
                  </div>
                  <div>
                    <span>RAG Document size: </span>
                    <span className="text-amber-400 font-bold">{alert.ragTokens} t</span>
                  </div>
                  <div>
                    <span>RAG Ratio: </span>
                    <span className="text-amber-400 font-bold">{((alert.ragTokens / alert.promptTokens) * 100).toFixed(0)}%</span>
                  </div>
                </div>
                <div className="text-[9.5px] text-zinc-500 italic font-mono pt-1">
                  💡 recommendation: Consider pruning retrieval limit, using LLM document rankers (re-ranking), or utilizing summarization templates before posting prompts to save costs.
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
