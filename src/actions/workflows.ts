// src/actions/workflows.ts
'use server';

import { db } from '@/lib/db';
import { withProjectAccess } from '@/lib/auth';

export async function getWorkflowTraces(projectId: string, workflowId: string) {
  return await withProjectAccess(projectId, 'viewer', async () => {
    if (!workflowId) return [];
    return await db.query(
      `SELECT 
         id, trace_id, span_name, model, latency_ms, cost_usd, error_message, created_at, agent_id, workflow_id
       FROM events
       WHERE project_id = $1 AND workflow_id = $2 AND parent_span_id IS NULL
       ORDER BY created_at ASC`,
      [projectId, workflowId]
    );
  });
}

interface Node {
  id: string; // trace_id
  label: string; // span_name or agent_id
  agentId: string;
  model: string;
  error: boolean;
  latency: number;
}

interface Edge {
  from: string; // trace_id
  to: string; // trace_id
}

export async function getWorkflowGraph(projectId: string, workflowId: string) {
  return await withProjectAccess(projectId, 'viewer', async () => {
    if (!workflowId) return { nodes: [], edges: [], deadlock: false, deadlockPath: [] };

    try {
      // 1. Fetch all events in this workflow
      const events = await db.query(
        `SELECT id, trace_id, parent_span_id, span_name, span_type, agent_id, model, error_message, latency_ms
         FROM events
         WHERE project_id = $1 AND workflow_id = $2
         ORDER BY created_at ASC`,
        [projectId, workflowId]
      );

      if (events.length === 0) {
        return { nodes: [], edges: [], deadlock: false, deadlockPath: [] };
      }

      // 2. Identify unique traces (nodes)
      const traceMap: Record<string, Node> = {};
      const spanToTraceMap: Record<string, string> = {}; // maps event id -> trace_id

      // First, map all span ids to their trace ids
      for (const e of events) {
        if (e.id && e.trace_id) {
          spanToTraceMap[e.id] = e.trace_id;
        }
      }

      // Identify root spans for each trace to extract labels
      for (const e of events) {
        if (!e.trace_id) continue;
        
        const isRootOfTrace = !e.parent_span_id || !spanToTraceMap[e.parent_span_id] || spanToTraceMap[e.parent_span_id] !== e.trace_id;

        if (isRootOfTrace) {
          traceMap[e.trace_id] = {
            id: e.trace_id,
            label: e.span_name || e.agent_id || 'Agent Trace',
            agentId: e.agent_id || 'unknown-agent',
            model: e.model || 'unknown',
            error: !!e.error_message,
            latency: Number(e.latency_ms || 0)
          };
        }
      }

      // Fill in any trace nodes that didn't have an identified root
      for (const e of events) {
        if (e.trace_id && !traceMap[e.trace_id]) {
          traceMap[e.trace_id] = {
            id: e.trace_id,
            label: e.span_name || e.agent_id || 'Sub Agent',
            agentId: e.agent_id || 'unknown-agent',
            model: e.model || 'unknown',
            error: !!e.error_message,
            latency: Number(e.latency_ms || 0)
          };
        }
      }

      // 3. Resolve directed dependency edges (cross-agent parent_span_id links)
      const edges: Edge[] = [];
      const edgeSet = new Set<string>();

      for (const e of events) {
        if (e.parent_span_id && e.trace_id) {
          const parentTraceId = spanToTraceMap[e.parent_span_id];
          // If parent span belongs to a DIFFERENT trace_id, we found a cross-agent call edge!
          if (parentTraceId && parentTraceId !== e.trace_id) {
            const edgeKey = `${parentTraceId}->${e.trace_id}`;
            if (!edgeSet.has(edgeKey)) {
              edgeSet.add(edgeKey);
              edges.push({ from: parentTraceId, to: e.trace_id });
            }
          }
        }
      }

      // Fallback: If no edges were resolved via parent_span_id but we have multiple traces,
      // order them sequentially in time to show execution flow
      if (edges.length === 0 && Object.keys(traceMap).length > 1) {
        const traceIds = Object.keys(traceMap);
        // Link them sequentially A -> B -> C
        for (let i = 0; i < traceIds.length - 1; i++) {
          edges.push({ from: traceIds[i], to: traceIds[i+1] });
        }
      }

      // 4. Circular Deadlock Detection (DFS Cycle finding)
      const adjList: Record<string, string[]> = {};
      for (const node of Object.keys(traceMap)) {
        adjList[node] = [];
      }
      for (const edge of edges) {
        if (adjList[edge.from]) {
          adjList[edge.from].push(edge.to);
        }
      }

      const visited: Record<string, 'white' | 'gray' | 'black'> = {};
      for (const node of Object.keys(traceMap)) {
        visited[node] = 'white';
      }

      let hasCycle = false;
      let cyclePath: string[] = [];
      const parentMap: Record<string, string> = {};

      function dfs(u: string): boolean {
        visited[u] = 'gray';

        for (const v of adjList[u] || []) {
          if (visited[v] === 'gray') {
            // Cycle detected! Reconstruct the cycle path u -> v
            hasCycle = true;
            const path = [v, u];
            let curr = u;
            while (curr !== v && parentMap[curr]) {
              curr = parentMap[curr];
              path.push(curr);
            }
            cyclePath = path.reverse();
            return true;
          } else if (visited[v] === 'white') {
            parentMap[v] = u;
            if (dfs(v)) return true;
          }
        }

        visited[u] = 'black';
        return false;
      }

      for (const node of Object.keys(traceMap)) {
        if (visited[node] === 'white') {
          if (dfs(node)) break;
        }
      }

      // Map cyclePath node IDs (trace IDs) to their corresponding human-readable labels
      const deadlockPathLabels = cyclePath.map(traceId => traceMap[traceId]?.label || traceId);

      return {
        nodes: Object.values(traceMap),
        edges,
        deadlock: hasCycle,
        deadlockPath: deadlockPathLabels
      };
    } catch (err) {
      console.error('Error generating workflow graph:', err);
      return { nodes: [], edges: [], deadlock: false, deadlockPath: [] };
    }
  });
}
