// src/app/dashboard/[projectId]/anomalies/page.tsx
import React from 'react';
import Link from 'next/link';
import { getRecentAnomalies } from '@/actions/anomalies';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface PageProps {
  params: Promise<{ projectId: string }> | { projectId: string };
}

export default async function AnomaliesPage({ params }: PageProps) {
  const resolvedParams = await params;
  const { projectId } = resolvedParams;
  const anomalies = await getRecentAnomalies(projectId);

  const criticalCount = anomalies.filter((a: any) => a.severity === 'critical').length;
  const warningCount = anomalies.filter((a: any) => a.severity === 'warning').length;

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-zinc-100 font-mono">Agent Anomalies</h1>
        <p className="text-xs text-zinc-500 mt-1.5 leading-relaxed max-w-2xl">
          Real-time execution security and cost tracking. LLMWatch scans parent traces automatically 
          for infinite loops, retry storms, runaway API cost consumption, and extreme latency outliers.
        </p>
      </div>

      {/* Stats Counter */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[#0e0e11] border border-zinc-850 p-4 rounded-xl flex items-center justify-between">
          <div>
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold block font-mono">Total Issues</span>
            <span className="text-2xl font-bold text-zinc-100 block font-mono mt-1">{anomalies.length}</span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 font-mono">
            ⚠️
          </div>
        </div>

        <div className="bg-[#0e0e11] border border-zinc-850 p-4 rounded-xl flex items-center justify-between">
          <div>
            <span className="text-[10px] text-red-500 uppercase tracking-wider font-bold block font-mono">Critical Failures</span>
            <span className="text-2xl font-bold text-red-400 block font-mono mt-1">{criticalCount}</span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-red-950/20 border border-red-900/30 flex items-center justify-center text-red-400 font-mono animate-pulse">
            🚨
          </div>
        </div>

        <div className="bg-[#0e0e11] border border-zinc-850 p-4 rounded-xl flex items-center justify-between">
          <div>
            <span className="text-[10px] text-amber-500 uppercase tracking-wider font-bold block font-mono">Warning Alerts</span>
            <span className="text-2xl font-bold text-amber-400 block font-mono mt-1">{warningCount}</span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-amber-950/20 border border-amber-900/30 flex items-center justify-center text-amber-400 font-mono">
            ⚡
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-[#0a0a0c] border border-zinc-850 rounded-xl overflow-hidden shadow-2xl">
        {anomalies.length === 0 ? (
          <div className="p-16 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-950/20 border border-emerald-800/20 flex items-center justify-center mx-auto text-emerald-400 text-2xl">
              ✓
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-zinc-200">No anomalies detected</h3>
              <p className="text-xs text-zinc-550 max-w-sm mx-auto">
                Your autonomous agents are executing efficiently within safety margins.
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-850/80 bg-[#0e0e11]/50 text-[10px] text-zinc-500 uppercase font-mono tracking-wider">
                  <th className="py-3 px-5">Severity</th>
                  <th className="py-3 px-4">Anomaly Type</th>
                  <th className="py-3 px-4">Description</th>
                  <th className="py-3 px-4">Context Trace</th>
                  <th className="py-3 px-4">Detected At</th>
                  <th className="py-3 px-5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-850/50 text-xs">
                {anomalies.map((anomaly: any) => {
                  const severityStyles = anomaly.severity === 'critical'
                    ? 'bg-red-950/40 border-red-800/40 text-red-400'
                    : 'bg-amber-950/40 border-amber-900/40 text-amber-400';

                  const typeLabels: Record<string, string> = {
                    recursive_loop: 'Recursive Loop',
                    cost_explosion: 'Cost Explosion',
                    retry_storm: 'Retry Storm',
                    latency_outlier: 'Latency Outlier'
                  };

                  return (
                    <tr key={anomaly.id} className="hover:bg-zinc-900/20 transition-colors group">
                      <td className="py-4 px-5">
                        <span className={`inline-block border px-2 py-0.5 rounded text-[9px] font-bold font-mono uppercase tracking-wide ${severityStyles}`}>
                          {anomaly.severity}
                        </span>
                      </td>
                      <td className="py-4 px-4 font-semibold text-zinc-300 font-mono text-[11px]">
                        {typeLabels[anomaly.anomaly_type] || anomaly.anomaly_type}
                      </td>
                      <td className="py-4 px-4 text-zinc-450 leading-relaxed max-w-sm font-mono text-[10.5px]">
                        {anomaly.description}
                      </td>
                      <td className="py-4 px-4 font-mono text-[10.5px] text-zinc-500">
                        <div className="font-semibold text-zinc-350">{anomaly.root_span_name || 'Autonomous Agent'}</div>
                        <div className="text-[9.5px] text-zinc-550 mt-0.5 truncate max-w-[150px]">{anomaly.trace_id}</div>
                      </td>
                      <td className="py-4 px-4 text-zinc-550 font-mono text-[10px]">
                        {new Date(anomaly.detected_at).toLocaleString()}
                      </td>
                      <td className="py-4 px-5 text-right">
                        <Link
                          href={`/dashboard/${projectId}/traces?search=${anomaly.trace_id}`}
                          className="inline-flex items-center gap-1 text-[10px] uppercase font-bold text-zinc-400 hover:text-zinc-200 transition-colors font-mono cursor-pointer border border-zinc-800 hover:border-zinc-700 bg-zinc-900/60 hover:bg-zinc-800/80 px-2.5 py-1 rounded"
                        >
                          Inspect Trace →
                        </Link>
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
  );
}
