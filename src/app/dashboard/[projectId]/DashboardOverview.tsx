// src/app/dashboard/[projectId]/DashboardOverview.tsx
'use client';

import React, { useState } from 'react';

interface MetricCardProps {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
}

function MetricCard({ title, value, subtitle, icon }: MetricCardProps) {
  return (
    <div className="p-6 rounded-lg border border-zinc-800 bg-[#18181b] hover:border-zinc-700 transition-all duration-200 shadow-2xl flex items-start gap-4">
      <div className="p-2 bg-zinc-800 border border-zinc-750 text-zinc-300 rounded shrink-0">
        {icon}
      </div>
      <div>
        <h3 className="text-zinc-500 text-[10px] font-bold uppercase tracking-wider">{title}</h3>
        <p className="text-xl font-bold text-zinc-100 mt-1 leading-none">{value}</p>
        <span className="text-[10px] text-zinc-550 mt-1.5 block">{subtitle}</span>
      </div>
    </div>
  );
}

interface DashboardOverviewProps {
  projectId: string;
  stats: {
    total_requests: number;
    total_cost: number;
    cache_hit_rate: number;
  };
  regressions: any[];
  modelsCatalog: any[];
  dlq: any[];
  checklist: {
    hasKey: boolean;
    hasEvents: boolean;
    hasCache: boolean;
    hasDlq: boolean;
    activePrefix: string;
  };
}

export default function DashboardOverview({
  projectId,
  stats,
  regressions,
  modelsCatalog,
  dlq,
  checklist
}: DashboardOverviewProps) {
  const [activeTab, setActiveTab] = useState<'analytics' | 'integration' | 'models' | 'dlq'>('analytics');
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(id);
    setTimeout(() => setCopiedText(null), 2000);
  };

  // Checklist completion calculation
  const checklistItems = [
    { title: 'Database schema deployed', completed: true },
    { title: 'API Key generated', completed: checklist.hasKey, link: `/dashboard/${projectId}/settings` },
    { title: 'First telemetry event logged', completed: checklist.hasEvents },
    { title: 'First response cache hit logged', completed: checklist.hasCache }
  ];
  
  const completedCount = checklistItems.filter(item => item.completed).length;
  const progressPercent = Math.round((completedCount / checklistItems.length) * 100);

  // Get current active key to inject
  const displayApiKey = checklist.activePrefix ? `${checklist.activePrefix}YOUR_SECRET_KEY` : 'lw_live_YOUR_SECRET_KEY';

  return (
    <div className="space-y-8 max-w-7xl mx-auto text-xs">
      
      {/* Top Welcome & Onboarding Progress */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 bg-[#18181b] border border-zinc-800 rounded-lg p-6 shadow-2xl">
        <div className="lg:col-span-2 space-y-2">
          <h1 className="text-xl font-bold text-zinc-100">LLMWatch Workspace Controls</h1>
          <p className="text-zinc-400 leading-relaxed text-xs">
            Observability stats, caching logs, and SDK code generators customized for your active workspace.
          </p>
          <div className="pt-2 flex items-center gap-3">
            <span className="px-2 py-0.5 text-[9px] font-mono rounded bg-zinc-800 border border-zinc-700 text-zinc-400">
              API STATUS: ONLINE
            </span>
            <span className="text-[10px] text-zinc-550">
              Project UUID: <span className="font-mono text-zinc-400 select-all">{projectId}</span>
            </span>
          </div>
        </div>

        {/* Dynamic Interactive Checklist */}
        <div className="border-t lg:border-t-0 lg:border-l border-zinc-800/80 pt-4 lg:pt-0 lg:pl-6 space-y-3">
          <div className="flex justify-between items-center text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
            <span>Setup Progress</span>
            <span>{progressPercent}% Complete</span>
          </div>
          {/* Progress bar */}
          <div className="h-1.5 w-full bg-zinc-950 rounded-full overflow-hidden border border-zinc-800">
            <div 
              className="h-full bg-white transition-all duration-500 rounded-full" 
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          
          <ul className="space-y-1.5 text-[11px]">
            {checklistItems.map((item, idx) => (
              <li key={idx} className="flex items-center gap-2 text-zinc-400">
                {item.completed ? (
                  <svg className="w-3.5 h-3.5 text-zinc-200 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <div className="w-3.5 h-3.5 rounded-full border border-zinc-700 shrink-0" />
                )}
                <span className={item.completed ? 'line-through text-zinc-500' : ''}>
                  {item.title}
                </span>
                {item.link && !item.completed && (
                  <a href={item.link} className="text-zinc-200 hover:underline text-[9px] font-bold uppercase ml-auto">
                    Resolve
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Tabs Switcher */}
      <div className="border-b border-zinc-850 flex items-center gap-1">
        <button
          onClick={() => setActiveTab('analytics')}
          className={`px-4 py-2 border-b-2 font-semibold text-xs transition-all ${
            activeTab === 'analytics' 
              ? 'border-white text-zinc-100' 
              : 'border-transparent text-zinc-500 hover:text-zinc-300'
          }`}
        >
          Analytics & Regressions
        </button>
        <button
          onClick={() => setActiveTab('integration')}
          className={`px-4 py-2 border-b-2 font-semibold text-xs transition-all ${
            activeTab === 'integration' 
              ? 'border-white text-zinc-100' 
              : 'border-transparent text-zinc-500 hover:text-zinc-300'
          }`}
        >
          Integration Guides
        </button>
        <button
          onClick={() => setActiveTab('models')}
          className={`px-4 py-2 border-b-2 font-semibold text-xs transition-all ${
            activeTab === 'models' 
              ? 'border-white text-zinc-100' 
              : 'border-transparent text-zinc-500 hover:text-zinc-300'
          }`}
        >
          Model Pricing Catalog
        </button>
        <button
          onClick={() => setActiveTab('dlq')}
          className={`px-4 py-2 border-b-2 font-semibold text-xs transition-all relative ${
            activeTab === 'dlq' 
              ? 'border-white text-zinc-100' 
              : 'border-transparent text-zinc-500 hover:text-zinc-300'
          }`}
        >
          Dead-Letter Queue
          {checklist.hasDlq && (
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-600 border-2 border-[#09090b] rounded-full" />
          )}
        </button>
      </div>

      {/* TAB CONTENT: ANALYTICS */}
      {activeTab === 'analytics' && (
        <div className="space-y-8 animate-fade-in">
          {/* Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <MetricCard 
              title="Total Requests" 
              value={stats.total_requests.toLocaleString()} 
              subtitle="Requests analyzed (24h)"
              icon={
                <svg className="w-4 h-4 text-zinc-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              }
            />
            <MetricCard 
              title="Telemetry Compute Cost" 
              value={`$${stats.total_cost.toFixed(5)}`} 
              subtitle="Estimated catalog cost (24h)"
              icon={
                <svg className="w-4 h-4 text-zinc-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
            />
            <MetricCard 
              title="Response Cache Hit Rate" 
              value={`${(stats.cache_hit_rate * 100).toFixed(1)}%`} 
              subtitle="Token savings triggered (24h)"
              icon={
                <svg className="w-4 h-4 text-zinc-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                </svg>
              }
            />
          </div>

          {/* Regressions Section */}
          <div className="bg-[#18181b] border border-zinc-800 rounded-lg overflow-hidden shadow-2xl">
            <div className="p-5 border-b border-zinc-800 bg-[#18181b]/50 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-zinc-200">Active Prompt Regressions</h2>
                <p className="text-[11px] text-zinc-550 mt-0.5">Identifies degradations in response latency, token count, or API error rates.</p>
              </div>
              <span className="px-2 py-0.5 text-[9px] font-mono rounded bg-zinc-800 border border-zinc-700 text-zinc-400">
                AUTO-EVALUATING
              </span>
            </div>

            {regressions.length === 0 ? (
              <div className="p-12 text-center">
                <div className="w-8 h-8 rounded bg-zinc-850 flex items-center justify-center mx-auto mb-3 text-zinc-500">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-xs text-zinc-400 font-semibold">Workspace Prompts Healthy</p>
                <p className="text-[10px] text-zinc-550 mt-1">No latency spikes, token bloat, or error rate shifts detected across rolling windows.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#09090b] border-b border-zinc-800 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                      <th className="p-4 pl-6">Prompt Hash</th>
                      <th className="p-4">Volume (24h)</th>
                      <th className="p-4">Latency Shift (p95)</th>
                      <th className="p-4">Error Rate Delta</th>
                      <th className="p-4">Avg Tokens</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/80">
                    {regressions.map((reg: any) => {
                      const hasLatencyIncrease = reg.latency_increase_pct > 20;
                      const hasErrorIncrease = reg.error_rate_delta > 0.05;
                      
                      return (
                        <tr key={reg.prompt_hash} className="hover:bg-zinc-800/20 transition-colors text-zinc-300">
                          <td className="p-4 pl-6 font-mono text-zinc-200">
                            {reg.prompt_hash.slice(0, 12)}...
                          </td>
                          <td className="p-4 font-medium text-zinc-400">{reg.current_requests} calls</td>
                          <td className="p-4">
                            {hasLatencyIncrease ? (
                              <span className="text-zinc-100 font-semibold flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-orange-500 inline-block animate-pulse"></span>
                                +{reg.latency_increase_pct.toFixed(0)}% ({Math.round(reg.baseline_p95_ms)}ms → {Math.round(reg.current_p95_ms)}ms)
                              </span>
                            ) : (
                              <span className="text-zinc-500">
                                Stable ({Math.round(reg.current_p95_ms)}ms)
                              </span>
                            )}
                          </td>
                          <td className="p-4">
                            {hasErrorIncrease ? (
                              <span className="text-zinc-100 font-semibold flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block animate-pulse"></span>
                                +{ (reg.error_rate_delta * 100).toFixed(0) }%
                              </span>
                            ) : (
                              <span className="text-zinc-500">
                                Stable ({ (reg.current_error_rate * 100).toFixed(0) }%)
                              </span>
                            )}
                          </td>
                          <td className="p-4">
                            <span className="text-zinc-300 font-medium">
                              {Math.round(reg.avg_prompt_tokens)} tokens
                            </span>
                            {reg.avg_prompt_tokens > reg.baseline_avg_tokens * 1.15 && (
                              <span className="text-[9px] bg-zinc-800 border border-zinc-700 text-zinc-400 px-1.5 py-0.5 rounded ml-2 font-mono">
                                BLOAT (+{ (((reg.avg_prompt_tokens - reg.baseline_avg_tokens) / reg.baseline_avg_tokens) * 100).toFixed(0) }%)
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB CONTENT: INTEGRATION GUIDE */}
      {activeTab === 'integration' && (
        <div className="space-y-6 bg-[#18181b] border border-zinc-800 rounded-lg p-6 shadow-2xl animate-fade-in">
          <div>
            <h2 className="text-sm font-bold text-zinc-200">Developer Integration Codeblocks</h2>
            <p className="text-[11px] text-zinc-500 mt-0.5">Integrate the LLMWatch SDK wrapper into your chat services. The variables contain your active key.</p>
          </div>

          <div className="space-y-4">
            {/* cURL Endpoint Code */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-300">Raw API cURL Ingestion</span>
                <button
                  onClick={() => copyToClipboard(`curl -X POST https://llmwatch-eight.vercel.app/api/public/v1/events \\\n  -H "Authorization: Bearer ${displayApiKey}" \\\n  -H "Content-Type: application/json" \\\n  -d '[\n    {\n      "idempotency_key": "${crypto.randomUUID()}",\n      "provider": "openai",\n      "model": "gpt-4o-mini",\n      "prompt_tokens": 100,\n      "completion_tokens": 50,\n      "latency_ms": 500,\n      "request_payload": { "messages": [{"role": "user", "content": "Hello"}] },\n      "response_payload": { "choices": [{"message": {"role": "assistant", "content": "Hi"}}] }\n    }\n  ]'`, 'curl')}
                  className="text-zinc-500 hover:text-zinc-200 text-[10px] font-bold uppercase transition-colors"
                >
                  {copiedText === 'curl' ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <pre className="bg-[#09090b] border border-zinc-850 p-4 rounded text-[11px] text-zinc-400 font-mono overflow-x-auto max-h-[160px]">
{`curl -X POST https://llmwatch-eight.vercel.app/api/public/v1/events \\
  -H "Authorization: Bearer ${displayApiKey}" \\
  -H "Content-Type: application/json" \\
  -d '[
    {
      "idempotency_key": "${crypto.randomUUID()}",
      "provider": "openai",
      "model": "gpt-4o-mini",
      "prompt_tokens": 100,
      "completion_tokens": 50,
      "latency_ms": 500,
      "request_payload": { "messages": [{"role": "user", "content": "Hello"}] },
      "response_payload": { "choices": [{"message": {"role": "assistant", "content": "Hi"}}] }
    }
  ]'`}
              </pre>
            </div>

            {/* TypeScript WrapOpenAI Code */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-300">TypeScript wrapOpenAI Caching Integration</span>
                <button
                  onClick={() => copyToClipboard(`import { OpenAI } from 'openai';\nimport { LLMWatch } from './sdk/llmwatch';\n\nconst openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });\n\nconst sdk = new LLMWatch({\n  apiKey: '${displayApiKey}',\n  endpoint: 'https://llmwatch-eight.vercel.app/api/public/v1/events'\n});\n\n// Wrap client to enable transparent response caching and latency logs\nconst wrappedOpenAI = sdk.wrapOpenAI(openai, {\n  enableCache: true,\n  cacheTtl: 3600 // 1 hour\n});\n\nasync function main() {\n  const response = await wrappedOpenAI.chat.completions.create({\n    model: 'gpt-4o-mini',\n    messages: [{ role: 'user', content: 'Explain quantum computing in one sentence.' }]\n  });\n  console.log(response.choices[0].message.content);\n}`, 'ts')}
                  className="text-zinc-500 hover:text-zinc-200 text-[10px] font-bold uppercase transition-colors"
                >
                  {copiedText === 'ts' ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <pre className="bg-[#09090b] border border-zinc-850 p-4 rounded text-[11px] text-zinc-400 font-mono overflow-x-auto max-h-[180px]">
{`import { OpenAI } from 'openai';
import { LLMWatch } from './sdk/llmwatch';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const sdk = new LLMWatch({
  apiKey: '${displayApiKey}',
  endpoint: 'https://llmwatch-eight.vercel.app/api/public/v1/events'
});

// Wrap client to enable transparent response caching and latency logs
const wrappedOpenAI = sdk.wrapOpenAI(openai, {
  enableCache: true,
  cacheTtl: 3600 // 1 hour
});

async function main() {
  const response = await wrappedOpenAI.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: 'Explain quantum computing.' }]
  });
  console.log(response.choices[0].message.content);
}`}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: MODELS CATALOG */}
      {activeTab === 'models' && (
        <div className="bg-[#18181b] border border-zinc-800 rounded-lg overflow-hidden shadow-2xl animate-fade-in">
          <div className="p-5 border-b border-zinc-800 bg-[#18181b]/50">
            <h2 className="text-sm font-semibold text-zinc-200">Ingestion Price Catalog</h2>
            <p className="text-[11px] text-zinc-550 mt-0.5">Price rates per 1,000 tokens inside the models_catalog table used to compute costs automatically.</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#09090b] border-b border-zinc-800 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                  <th className="p-4 pl-6">Provider</th>
                  <th className="p-4">Model Pattern Name</th>
                  <th className="p-4">Input cost per 1k</th>
                  <th className="p-4 pr-6 text-right">Output cost per 1k</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80">
                {modelsCatalog.map((model, idx) => (
                  <tr key={idx} className="hover:bg-zinc-800/20 transition-colors text-zinc-300">
                    <td className="p-4 pl-6 font-semibold uppercase tracking-wider font-mono text-[10px] text-zinc-400">
                      {model.provider}
                    </td>
                    <td className="p-4 font-mono font-medium text-zinc-200">{model.model_name}</td>
                    <td className="p-4 font-mono">${Number(model.cost_per_1k_prompt_tokens).toFixed(6)}</td>
                    <td className="p-4 pr-6 text-right font-mono">${Number(model.cost_per_1k_completion_tokens).toFixed(6)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB CONTENT: DEAD LETTER QUEUE */}
      {activeTab === 'dlq' && (
        <div className="bg-[#18181b] border border-zinc-800 rounded-lg overflow-hidden shadow-2xl animate-fade-in">
          <div className="p-5 border-b border-zinc-800 bg-[#18181b]/50">
            <h2 className="text-sm font-semibold text-zinc-200">Dead-Letter Queue Ingestion Failures (DLQ)</h2>
            <p className="text-[11px] text-zinc-550 mt-0.5">Captures telemetry payloads that failed parsing validation checks or hit database database constraints.</p>
          </div>

          {dlq.length === 0 ? (
            <div className="p-16 text-center text-zinc-500 space-y-3">
              <div className="w-10 h-10 rounded bg-zinc-850 flex items-center justify-center mx-auto text-zinc-500">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-xs text-zinc-400 font-semibold">Dead Letter Queue Empty</p>
                <p className="text-[10px] text-zinc-550 mt-1">Ingestion pipelines are operating cleanly. Zero payload drop failures logged.</p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#09090b] border-b border-zinc-800 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                    <th className="p-4 pl-6">Timestamp</th>
                    <th className="p-4">Source IP</th>
                    <th className="p-4">Error Reason</th>
                    <th className="p-4 pr-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/80">
                  {dlq.map((err) => {
                    const timeStr = new Date(err.created_at).toLocaleString();
                    return (
                      <tr key={err.id} className="hover:bg-zinc-800/20 transition-colors text-zinc-300 text-[11px]">
                        <td className="p-4 pl-6 font-mono text-zinc-400">{timeStr}</td>
                        <td className="p-4 font-mono">{err.source_ip}</td>
                        <td className="p-4 font-semibold text-red-400 truncate max-w-[280px]" title={err.error_reason}>
                          {err.error_reason}
                        </td>
                        <td className="p-4 pr-6 text-right">
                          <button
                            onClick={() => alert(`RAW PAYLOAD:\n${JSON.stringify(err.raw_payload, null, 2)}`)}
                            className="text-zinc-400 hover:text-zinc-200 font-semibold"
                          >
                            Inspect Payload →
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
