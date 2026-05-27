// src/app/dashboard/[projectId]/settings/SettingsClient.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { createApiKey, revokeApiKey, rollApiKey, getApiKeys } from '@/actions/keys';
import { useSearchParams, useRouter } from 'next/navigation';

interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  created_at: Date;
  expires_at: Date | null;
  revoked_at: Date | null;
}

interface SettingsClientProps {
  initialKeys: ApiKeyRow[];
  projectId: string;
  project: {
    name: string;
    limit: number;
    count: number;
    tier: string;
    status: string;
  };
}

export default function SettingsClient({ initialKeys, projectId, project }: SettingsClientProps) {
  const [keys, setKeys] = useState<ApiKeyRow[]>(initialKeys);
  const [newKeyName, setNewKeyName] = useState('');
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [activeTab, setActiveTab] = useState<'keys' | 'billing'>('keys');
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingBanner, setBillingBanner] = useState<string | null>(null);

  const searchParams = useSearchParams();
  const router = useRouter();

  // Detect billing status query param
  useEffect(() => {
    const status = searchParams.get('billing');
    if (status === 'success') {
      setBillingBanner('success');
      setActiveTab('billing');
      // Clean query params
      router.replace(`/dashboard/${projectId}/settings`);
    } else if (status === 'downgraded') {
      setBillingBanner('downgraded');
      setActiveTab('billing');
      router.replace(`/dashboard/${projectId}/settings`);
    } else if (status === 'cancel') {
      setError('Billing upgrade checkout cancelled.');
      setActiveTab('billing');
      router.replace(`/dashboard/${projectId}/settings`);
    }
  }, [searchParams, projectId, router]);

  const refreshKeys = async () => {
    try {
      const refreshed = await getApiKeys(projectId);
      setKeys(refreshed);
    } catch (err: any) {
      setError('Failed to refresh keys: ' + err.message);
    }
  };

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    
    setLoading(true);
    setError(null);
    setRevealedKey(null);

    try {
      const result = await createApiKey(projectId, newKeyName.trim());
      if (result.success && result.plainTextKey) {
        setRevealedKey(result.plainTextKey);
        setNewKeyName('');
        await refreshKeys();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create key');
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeKey = async (keyId: string) => {
    if (!confirm('Are you sure you want to revoke this API key? Telemetry pipelines using this key will immediately fail.')) return;
    
    setLoading(true);
    setError(null);
    try {
      const result = await revokeApiKey(projectId, keyId);
      if (result.success) {
        await refreshKeys();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to revoke key');
    } finally {
      setLoading(false);
    }
  };

  const handleRollKey = async (keyId: string) => {
    if (!confirm('Rolling this key will create a new key and set the old key to expire in 24 hours. This allows zero-downtime migration. Proceed?')) return;
    
    setLoading(true);
    setError(null);
    setRevealedKey(null);
    try {
      const result = await rollApiKey(projectId, keyId);
      if (result.success && result.plainTextKey) {
        setRevealedKey(result.plainTextKey);
        await refreshKeys();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to roll key');
    } finally {
      setLoading(false);
    }
  };

  const handleUpgrade = async (targetTier: 'pro' | 'enterprise') => {
    setBillingLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, tier: targetTier })
      });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || 'Failed to initiate upgrade');
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setBillingLoading(false);
    }
  };

  const handleManageBilling = async () => {
    setBillingLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId })
      });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || 'Failed to open billing portal');
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setBillingLoading(false);
    }
  };

  // Usage progress calculations
  const usagePercent = Math.min(100, Math.round((project.count / project.limit) * 100));

  return (
    <div className="space-y-6 max-w-4xl text-xs">
      
      {/* Success Billing Banner */}
      {billingBanner === 'success' && (
        <div className="bg-emerald-950/15 border border-emerald-900/35 text-emerald-400 p-4 rounded-lg flex items-center gap-3 animate-fade-in">
          <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="font-bold">Subscription Updated successfully!</p>
            <p className="text-[11px] text-zinc-400 mt-0.5">Your quota has been upgraded immediately. Thank you for using LLMWatch!</p>
          </div>
        </div>
      )}

      {/* Downgraded Billing Banner */}
      {billingBanner === 'downgraded' && (
        <div className="bg-zinc-800/40 border border-zinc-700 text-zinc-300 p-4 rounded-lg flex items-center gap-3 animate-fade-in">
          <svg className="w-5 h-5 shrink-0 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="font-bold">Plan Downgraded to Free Tier</p>
            <p className="text-[11px] text-zinc-500 mt-0.5">Your monthly quota has been reset back to 50,000 events.</p>
          </div>
        </div>
      )}

      {/* Error Feedback */}
      {error && (
        <div className="bg-red-950/10 border border-red-900/30 text-red-400 p-4 rounded-lg font-medium">
          {error}
        </div>
      )}

      {/* TAB SELECTOR */}
      <div className="flex border-b border-zinc-800 space-x-6 mb-8 text-[11px] font-bold">
        <button
          onClick={() => setActiveTab('keys')}
          className={`pb-3 border-b-2 transition-all ${
            activeTab === 'keys' 
              ? 'border-[#fafafa] text-zinc-100' 
              : 'border-transparent text-zinc-500 hover:text-zinc-300'
          }`}
        >
          API KEYS
        </button>
        <button
          onClick={() => setActiveTab('billing')}
          className={`pb-3 border-b-2 transition-all ${
            activeTab === 'billing' 
              ? 'border-[#fafafa] text-zinc-100' 
              : 'border-transparent text-zinc-500 hover:text-zinc-300'
          }`}
        >
          BILLING & USAGE
        </button>
      </div>

      {/* TAB CONTENT: API KEYS */}
      {activeTab === 'keys' && (
        <div className="space-y-8 animate-fade-in">
          {/* Key reveal display box */}
          {revealedKey && (
            <div className="bg-amber-950/15 border border-amber-900/35 rounded-lg p-5 shadow-2xl flex items-start gap-4">
              <div className="p-2 rounded bg-amber-500/10 text-amber-400 shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="space-y-3 w-full">
                <h3 className="text-xs font-semibold text-amber-400">Save Your Secret API Key</h3>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Copy this API key now. For security reasons, we cannot show this secret token again. If you lose it, you must generate a new key or trigger a rotation.
                </p>
                <div className="flex gap-2 w-full max-w-md">
                  <input
                    type="text"
                    readOnly
                    value={revealedKey}
                    className="flex-1 bg-[#09090b] border border-zinc-800 text-zinc-300 font-mono text-[11px] px-3 py-2 rounded focus:outline-none"
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(revealedKey);
                      alert('Copied to clipboard!');
                    }}
                    className="px-4 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 rounded font-semibold transition-colors"
                  >
                    Copy
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Create key card */}
          <div className="bg-[#18181b] border border-zinc-800 rounded-lg p-6 shadow-2xl">
            <h2 className="text-sm font-bold text-zinc-200 mb-1">Create a New API Key</h2>
            <p className="text-[11px] text-zinc-500 mb-4">Generates a secret token for your external application models to write telemetry events.</p>
            
            <form onSubmit={handleCreateKey} className="flex gap-3 max-w-md">
              <input
                type="text"
                required
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="e.g. Chatbot Client Ingestion"
                disabled={loading}
                className="flex-1 bg-[#09090b] border border-zinc-800 text-zinc-100 rounded px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-400 focus:border-zinc-400 transition-all placeholder:text-zinc-650"
              />
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-[#fafafa] hover:bg-zinc-200 disabled:opacity-50 text-[#09090b] text-xs font-bold rounded shadow-lg transition-all shrink-0"
              >
                {loading ? 'Creating...' : 'Create Key'}
              </button>
            </form>
          </div>

          {/* Key List card */}
          <div className="bg-[#18181b] border border-zinc-800 rounded-lg overflow-hidden shadow-2xl">
            <div className="p-5 border-b border-zinc-800 bg-[#18181b]/50">
              <h2 className="text-sm font-bold text-zinc-200">Active API Keys</h2>
              <p className="text-[11px] text-zinc-500 mt-0.5">Manage existing keys and inspect prefixes.</p>
            </div>

            {keys.length === 0 ? (
              <div className="p-10 text-center text-zinc-500">
                No active API keys found for this project.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#09090b] border-b border-zinc-800 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                      <th className="p-4 pl-6">Key Name</th>
                      <th className="p-4">Prefix</th>
                      <th className="p-4">Created At</th>
                      <th className="p-4">Status / Expiry</th>
                      <th className="p-4 pr-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/80">
                    {keys.map((key) => {
                      const createdStr = new Date(key.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
                      
                      const isRevoked = !!key.revoked_at;
                      const isExpired = key.expires_at ? new Date(key.expires_at).getTime() < Date.now() : false;
                      const isExpiring = key.expires_at && !isExpired;
                      
                      let statusBadge = (
                        <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-zinc-800 border border-zinc-700 text-zinc-300">
                          Active
                        </span>
                      );
                      if (isRevoked) {
                        statusBadge = (
                          <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-zinc-950 border border-zinc-900 text-zinc-600">
                            Revoked
                          </span>
                        );
                      } else if (isExpired) {
                        statusBadge = (
                          <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-red-950/20 border border-red-900/30 text-red-500">
                            Expired
                          </span>
                        );
                      } else if (isExpiring && key.expires_at) {
                        const hrsLeft = Math.ceil((new Date(key.expires_at).getTime() - Date.now()) / (3600 * 1000));
                        statusBadge = (
                          <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-zinc-800/60 border border-zinc-800 text-zinc-400" title={`Expires at ${new Date(key.expires_at).toLocaleString()}`}>
                            Expires in {hrsLeft}h
                          </span>
                        );
                      }

                      return (
                        <tr key={key.id} className="hover:bg-zinc-800/20 transition-colors text-zinc-300">
                          <td className="p-4 pl-6 font-semibold text-zinc-200">{key.name}</td>
                          <td className="p-4 font-mono text-zinc-300">{key.prefix}</td>
                          <td className="p-4 text-zinc-550">{createdStr}</td>
                          <td className="p-4">{statusBadge}</td>
                          <td className="p-4 pr-6 text-right space-x-3">
                            {!isRevoked && !isExpired && (
                              <>
                                <button
                                  onClick={() => handleRollKey(key.id)}
                                  disabled={loading}
                                  className="text-[11px] text-zinc-400 hover:text-zinc-100 font-semibold transition-colors"
                                >
                                  Roll
                                </button>
                                <button
                                  onClick={() => handleRevokeKey(key.id)}
                                  disabled={loading}
                                  className="text-[11px] text-red-400 hover:text-red-300 font-semibold transition-colors"
                                >
                                  Revoke
                                </button>
                              </>
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

      {/* TAB CONTENT: BILLING & USAGE */}
      {activeTab === 'billing' && (
        <div className="space-y-8 animate-fade-in">
          {/* Active Subscription Summary */}
          <div className="bg-[#18181b] border border-zinc-800 rounded-lg p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-zinc-200">Ingestion Usage Plan</h2>
                <p className="text-[11px] text-zinc-500 mt-0.5">Your monthly cycle usage resets 30 days from project creation.</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-zinc-400 font-medium">Current Plan:</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase border ${
                  project.tier === 'enterprise'
                    ? 'bg-amber-950/20 border-amber-800/40 text-amber-400'
                    : project.tier === 'pro'
                    ? 'bg-indigo-950/20 border-indigo-800/40 text-indigo-400'
                    : 'bg-zinc-800 border-zinc-700 text-zinc-300'
                }`}>
                  {project.tier} {project.status !== 'active' ? `(${project.status})` : ''}
                </span>
              </div>
            </div>

            {/* Progress bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-[11px] font-bold">
                <span className="text-zinc-300">{project.count.toLocaleString()} / {project.limit.toLocaleString()} events</span>
                <span className="text-zinc-550">{usagePercent}% used</span>
              </div>
              <div className="w-full h-2.5 bg-[#09090b] border border-zinc-800 rounded overflow-hidden">
                <div 
                  className={`h-full transition-all duration-550 ${
                    usagePercent > 90 
                      ? 'bg-red-500' 
                      : usagePercent > 70 
                      ? 'bg-amber-500' 
                      : 'bg-[#fafafa]'
                  }`} 
                  style={{ width: `${usagePercent}%` }}
                />
              </div>
            </div>

            {/* Manage Subscription Action */}
            {project.tier !== 'free' && (
              <div className="pt-2 border-t border-zinc-850">
                <button
                  onClick={handleManageBilling}
                  disabled={billingLoading}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 text-[11px] font-bold rounded shadow transition-all"
                >
                  {billingLoading ? 'Loading Portal...' : 'Manage Subscription & Invoices'}
                </button>
              </div>
            )}
          </div>

          {/* Pricing Comparison Cards */}
          <div>
            <h3 className="text-xs font-bold text-zinc-300 mb-4 uppercase tracking-wider">Available Subscription Tiers</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              
              {/* Free Plan */}
              <div className={`bg-[#18181b] border rounded-lg p-5 shadow-2xl flex flex-col justify-between h-56 transition-all ${
                project.tier === 'free' ? 'border-zinc-500' : 'border-zinc-850'
              }`}>
                <div>
                  <div className="flex justify-between items-start">
                    <h4 className="text-xs font-bold text-zinc-200 uppercase">Free Developer</h4>
                    {project.tier === 'free' && <span className="text-[9px] text-zinc-400 font-semibold bg-zinc-800 px-2 py-0.5 rounded">Active</span>}
                  </div>
                  <div className="mt-3 flex items-baseline">
                    <span className="text-xl font-extrabold text-zinc-100">$0</span>
                    <span className="text-[10px] text-zinc-500 ml-1">/ month</span>
                  </div>
                  <p className="text-[11px] text-zinc-500 mt-3 leading-relaxed">
                    Perfect for prototyping AI models integrations and setting up initial observability metrics.
                  </p>
                </div>
                <div className="text-[11px] font-bold text-zinc-400 flex items-center gap-1.5">
                  <svg className="w-4 h-4 text-zinc-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  50,000 monthly events limit
                </div>
              </div>

              {/* Pro Plan */}
              <div className={`bg-[#18181b] border rounded-lg p-5 shadow-2xl flex flex-col justify-between h-56 transition-all ${
                project.tier === 'pro' ? 'border-zinc-500' : 'border-zinc-850 hover:border-zinc-800'
              }`}>
                <div>
                  <div className="flex justify-between items-start">
                    <h4 className="text-xs font-bold text-zinc-200 uppercase">Growth Pro</h4>
                    {project.tier === 'pro' && <span className="text-[9px] text-zinc-400 font-semibold bg-zinc-800 px-2 py-0.5 rounded">Active</span>}
                  </div>
                  <div className="mt-3 flex items-baseline">
                    <span className="text-xl font-extrabold text-zinc-100">$15</span>
                    <span className="text-[10px] text-zinc-500 ml-1">/ month</span>
                  </div>
                  <p className="text-[11px] text-zinc-550 mt-3 leading-relaxed">
                    Ideal for production chatbots, API agents, and scaling developer applications.
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="text-[11px] font-bold text-zinc-400 flex items-center gap-1.5">
                    <svg className="w-4 h-4 text-zinc-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    1,000,000 monthly events
                  </div>
                  {project.tier === 'free' ? (
                    <button
                      onClick={() => handleUpgrade('pro')}
                      disabled={billingLoading}
                      className="w-full py-2 bg-[#fafafa] hover:bg-zinc-200 disabled:opacity-50 text-[#09090b] text-[10px] font-bold rounded shadow transition-all"
                    >
                      {billingLoading ? 'Processing...' : 'Upgrade to Pro'}
                    </button>
                  ) : (
                    <div className="h-8" />
                  )}
                </div>
              </div>

              {/* Enterprise Plan */}
              <div className={`bg-[#18181b] border rounded-lg p-5 shadow-2xl flex flex-col justify-between h-56 transition-all ${
                project.tier === 'enterprise' ? 'border-zinc-500' : 'border-zinc-850 hover:border-zinc-800'
              }`}>
                <div>
                  <div className="flex justify-between items-start">
                    <h4 className="text-xs font-bold text-zinc-200 uppercase">Scale Enterprise</h4>
                    {project.tier === 'enterprise' && <span className="text-[9px] text-zinc-400 font-semibold bg-zinc-800 px-2 py-0.5 rounded">Active</span>}
                  </div>
                  <div className="mt-3 flex items-baseline">
                    <span className="text-xl font-extrabold text-zinc-100">$79</span>
                    <span className="text-[10px] text-zinc-500 ml-1">/ month</span>
                  </div>
                  <p className="text-[11px] text-zinc-550 mt-3 leading-relaxed">
                    Designed for heavy LLM operations, large telemetry loads, and high-concurrency systems.
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="text-[11px] font-bold text-zinc-400 flex items-center gap-1.5">
                    <svg className="w-4 h-4 text-zinc-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    10,000,000 monthly events
                  </div>
                  {['free', 'pro'].includes(project.tier) ? (
                    <button
                      onClick={() => handleUpgrade('enterprise')}
                      disabled={billingLoading}
                      className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 text-[10px] font-bold rounded shadow transition-all border border-zinc-700"
                    >
                      {billingLoading ? 'Processing...' : 'Upgrade to Enterprise'}
                    </button>
                  ) : (
                    <div className="h-8" />
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}

