// src/app/dashboard/[projectId]/layout.tsx
import React from 'react';
import Link from 'next/link';
import { getAnomalyCount } from '@/actions/anomalies';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface DashboardLayoutProps {
  children: React.ReactNode;
  params: Promise<{ projectId: string }> | { projectId: string };
}

export default async function DashboardLayout({ children, params }: DashboardLayoutProps) {
  const resolvedParams = await params;
  const { projectId } = resolvedParams;
  const anomalyCount = await getAnomalyCount(projectId);

  return (
    <div className="min-h-screen bg-[#09090b] text-[#fafafa] flex font-sans antialiased selection:bg-zinc-800 selection:text-white">
      {/* Sidebar - Ash Grey Zinc-900 */}
      <aside className="w-64 bg-[#18181b] border-r border-zinc-800/80 flex flex-col justify-between shrink-0">
        <div>
          {/* Brand header */}
          <div className="h-16 px-6 border-b border-zinc-800/80 flex items-center gap-3">
            <div className="w-7 h-7 rounded bg-[#fafafa] flex items-center justify-center font-bold text-sm text-[#09090b]">
              W
            </div>
            <div>
              <span className="font-semibold text-zinc-100 block tracking-tight text-sm">LLMWatch</span>
              <span className="text-[10px] text-zinc-500 block font-mono">WORKSPACE MVP</span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-4 space-y-1">
            <Link
              href={`/dashboard/${projectId}`}
              className="flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-all group"
            >
              <svg className="w-4 h-4 text-zinc-400 group-hover:text-zinc-200 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4zM14 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2v-4z" />
              </svg>
              Overview
            </Link>

            <Link
              href={`/dashboard/${projectId}/traces`}
              className="flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-all group"
            >
              <svg className="w-4 h-4 text-zinc-400 group-hover:text-zinc-200 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Search Traces
            </Link>

            <Link
              href={`/dashboard/${projectId}/anomalies`}
              className="flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-all group"
            >
              <div className="flex items-center gap-3">
                <svg className="w-4 h-4 text-zinc-400 group-hover:text-zinc-200 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Anomalies
              </div>
              {anomalyCount > 0 && (
                <span className="bg-red-950/80 border border-red-800/60 text-red-400 text-[9px] font-bold px-1.5 py-0.5 rounded-full font-mono animate-pulse">
                  {anomalyCount}
                </span>
              )}
            </Link>

            <Link
              href={`/dashboard/${projectId}/settings`}
              className="flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-all group"
            >
              <svg className="w-4 h-4 text-zinc-400 group-hover:text-zinc-200 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
              API Keys
            </Link>
          </nav>
        </div>

        {/* User Card */}
        <div className="p-4 border-t border-zinc-800 bg-[#18181b]/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-zinc-800 border border-zinc-700 flex items-center justify-center font-semibold text-zinc-300 text-xs">
              DEV
            </div>
            <div className="overflow-hidden">
              <span className="text-xs font-medium text-zinc-300 block truncate">Demo Developer</span>
              <span className="text-[10px] text-zinc-500 block truncate font-mono">demo@llmwatch.com</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="h-16 px-8 border-b border-zinc-800/80 flex items-center justify-between bg-[#09090b]/80 backdrop-blur-md sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-medium bg-zinc-900 border border-zinc-800 text-zinc-400 px-2 py-0.5 rounded font-mono">
              PROJECT ID: {projectId}
            </span>
          </div>
          
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-xs text-zinc-400 hover:text-zinc-200 hover:underline flex items-center gap-1 transition-colors"
            >
              ← Back to Project Selector
            </Link>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-8 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
