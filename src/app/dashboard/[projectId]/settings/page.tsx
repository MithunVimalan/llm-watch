// src/app/dashboard/[projectId]/settings/page.tsx
import { getApiKeys } from '@/actions/keys';
import SettingsClient from './SettingsClient';
import React from 'react';
import { db } from '@/lib/db';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ projectId: string }> | { projectId: string };
}

export default async function SettingsPage({ params }: PageProps) {
  // Resolve params for Next.js 15 compliance
  const resolvedParams = await params;
  const { projectId } = resolvedParams;

  // Retrieve keys list (authenticated via withProjectAccess in getApiKeys)
  const rawKeys = await getApiKeys(projectId);

  // Map database entries to match SettingsClient expectation
  const keys = rawKeys.map((key: any) => ({
    id: key.id,
    name: key.name || 'API Key',
    prefix: key.prefix,
    created_at: key.created_at,
    expires_at: key.expires_at,
    revoked_at: key.revoked_at
  }));

  // Retrieve project usage and subscription details
  const project = await db.query(`
    SELECT name, monthly_events_limit, monthly_events_count, subscription_tier, subscription_status 
    FROM projects 
    WHERE id = $1
  `, [projectId]).then(res => res[0]);

  if (!project) {
    redirect('/');
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-extrabold text-slate-100 tracking-tight">Project Settings</h1>
        <p className="text-slate-400 mt-1">
          Manage API keys, inspect usage limits, and manage your billing subscriptions.
        </p>
      </div>

      <SettingsClient 
        initialKeys={keys} 
        projectId={projectId} 
        project={{
          name: project.name,
          limit: Number(project.monthly_events_limit || 50000),
          count: Number(project.monthly_events_count || 0),
          tier: project.subscription_tier || 'free',
          status: project.subscription_status || 'active'
        }}
      />
    </div>
  );
}
