// src/app/page.tsx
import { db } from '@/lib/db';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import React from 'react';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Server Action for creating projects inside Server Components
async function createProjectAction(formData: FormData) {
  'use server';
  
  const name = formData.get('projectName') as string;
  if (!name || !name.trim()) return;

  const result = await db.query(`
    INSERT INTO projects (name) 
    VALUES ($1) 
    RETURNING id;
  `, [name.trim()]);
  
  const newProjId = result[0]?.id;
  if (newProjId) {
    // Seed default demo user and api key for the new project
    const userId = '11111111-1111-1111-1111-111111111111'; // Demo user UUID
    const nodeCrypto = require('crypto');
    
    // Generate new key
    const secret = nodeCrypto.randomBytes(32).toString('base64url');
    const rawKey = `lw_live_${secret}`;
    const displayPrefix = `lw_live_${secret.slice(0, 4)}...`;
    const keyHash = nodeCrypto.createHash('sha256').update(rawKey).digest('hex');

    await db.query(`
      INSERT INTO project_members (project_id, user_id, role)
      VALUES ($1, $2, 'owner')
      ON CONFLICT DO NOTHING
    `, [newProjId, userId]);

    await db.query(`
      INSERT INTO api_keys (project_id, name, prefix, key_hash)
      VALUES ($1, 'Default Key', $2, $3)
    `, [newProjId, displayPrefix, keyHash]);
  }
  
  redirect('/');
}

export default async function HomePage() {
  // 1. Fetch existing projects
  let projects = await db.query('SELECT id, name, created_at, last_used_at FROM projects ORDER BY created_at DESC');
  
  // 2. Auto-seed standard sandbox workspace on empty DB
  if (projects.length === 0) {
    const defaultProjId = 'd3b07384-d113-41e9-9c8e-2f77e2ffb288';
    const demoUserId = '11111111-1111-1111-1111-111111111111';

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      
      // Create Project
      await client.query(`
        INSERT INTO projects (id, name)
        VALUES ($1, 'Default Project')
        ON CONFLICT (id) DO NOTHING
      `, [defaultProjId]);
      
      // Create User
      await client.query(`
        INSERT INTO users (id, email)
        VALUES ($1, 'demo@llmwatch.com')
        ON CONFLICT (id) DO NOTHING
      `, [demoUserId]);
      
      // Assign RBAC
      await client.query(`
        INSERT INTO project_members (project_id, user_id, role)
        VALUES ($1, $2, 'owner')
        ON CONFLICT (project_id, user_id) DO NOTHING
      `, [defaultProjId, demoUserId]);
      
      // Seed predictable key for local automated testing
      const keyCount = await client.query('SELECT COUNT(*)::int AS count FROM api_keys WHERE project_id = $1', [defaultProjId]).then(res => res.rows[0].count);
      if (keyCount === 0) {
        const defaultSecret = 'demosupersecretkey';
        const rawKey = 'lw_live_' + defaultSecret; // lw_live_demosupersecretkey
        const displayPrefix = 'lw_live_demo...';
        const nodeCrypto = require('crypto');
        const keyHash = nodeCrypto.createHash('sha256').update(rawKey).digest('hex');
        
        await client.query(`
          INSERT INTO api_keys (project_id, name, prefix, key_hash)
          VALUES ($1, 'Default Sandbox Key', $2, $3)
        `, [defaultProjId, displayPrefix, keyHash]);
      }
      
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      console.error('Failed to seed sandbox database:', e);
    } finally {
      client.release();
    }
    
    // Refetch seeded project
    projects = await db.query('SELECT id, name, created_at, last_used_at FROM projects ORDER BY created_at DESC');
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-[#fafafa] flex flex-col items-center justify-center p-6 font-sans">
      <div className="w-full max-w-xl space-y-8">
        
        {/* Header Branding */}
        <div className="text-center space-y-3">
          <div className="w-12 h-12 rounded bg-[#fafafa] flex items-center justify-center font-bold text-xl text-[#09090b] mx-auto shadow-2xl">
            W
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
              LLMWatch Workspace
            </h1>
            <p className="text-zinc-400 text-xs max-w-sm mx-auto leading-relaxed">
              MVP Developer Observability Hub. Select a project workspace or launch a new tracking environment.
            </p>
          </div>
        </div>

        {/* Create Project Card */}
        <div className="bg-[#18181b] border border-zinc-800 rounded-lg p-6 shadow-2xl text-xs">
          <h2 className="font-bold text-zinc-300 mb-3">Create a New Observability Workspace</h2>
          <form action={createProjectAction} className="flex gap-3">
            <input
              type="text"
              name="projectName"
              required
              placeholder="e.g. Chatbot Assistant Prod"
              className="flex-1 bg-[#09090b] border border-zinc-800 text-slate-100 rounded px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-400 focus:border-zinc-400 transition-all placeholder:text-zinc-650"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-[#fafafa] hover:bg-zinc-200 text-[#09090b] text-xs font-bold rounded shadow-lg transition-all cursor-pointer"
            >
              Create Project
            </button>
          </form>
        </div>

        {/* Projects List Card */}
        <div className="bg-[#18181b] border border-zinc-800 rounded-lg shadow-2xl overflow-hidden text-xs">
          <div className="p-4 pl-6 border-b border-zinc-800 bg-[#18181b]/50 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Available Workspaces</span>
            <span className="text-[9px] bg-zinc-800 text-zinc-350 px-2 py-0.5 rounded font-mono border border-zinc-700">
              {projects.length} Workspace{projects.length !== 1 && 's'}
            </span>
          </div>

          <div className="divide-y divide-zinc-800/80">
            {projects.map((proj: any) => {
              const activeStr = proj.last_used_at 
                ? `Active ${new Date(proj.last_used_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}` 
                : 'No telemetry yet';
                
              return (
                <Link 
                  key={proj.id} 
                  href={`/dashboard/${proj.id}`}
                  className="flex items-center justify-between p-5 hover:bg-zinc-800/20 transition-all group"
                >
                  <div className="space-y-1">
                    <span className="font-bold text-zinc-200 group-hover:text-zinc-100 transition-colors block">
                      {proj.name}
                    </span>
                    <span className="text-[10px] font-mono text-zinc-500 block">
                      ID: {proj.id}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <span className="text-[10px] text-zinc-550 text-right">
                      {activeStr}
                    </span>
                    <div className="w-8 h-8 rounded bg-zinc-800 border border-zinc-750 flex items-center justify-center text-zinc-400 group-hover:text-zinc-100 group-hover:border-zinc-700 transition-all">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}
