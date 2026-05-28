// src/app/dashboard/[projectId]/traces/WorkflowGraph.tsx
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { getWorkflowGraph } from '@/actions/workflows';

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

interface WorkflowGraphProps {
  projectId: string;
  workflowId: string;
}

export default function WorkflowGraph({ projectId, workflowId }: WorkflowGraphProps) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [deadlock, setDeadlock] = useState(false);
  const [deadlockPath, setDeadlockPath] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!workflowId) return;
    setLoading(true);
    getWorkflowGraph(projectId, workflowId)
      .then((res) => {
        setNodes(res.nodes || []);
        setEdges(res.edges || []);
        setDeadlock(res.deadlock || false);
        setDeadlockPath(res.deadlockPath || []);
      })
      .catch((err) => console.error("Error loading workflow graph:", err))
      .finally(() => setLoading(false));
  }, [projectId, workflowId]);

  // Layout node coordinates math
  const nodeCoords = useMemo(() => {
    const coords: Record<string, { x: number; y: number }> = {};
    if (nodes.length === 0) return coords;

    const width = 640;
    const height = 180;
    const paddingX = 80;

    nodes.forEach((node, idx) => {
      // Layer nodes horizontally
      const x = nodes.length > 1
        ? paddingX + (idx / (nodes.length - 1)) * (width - paddingX * 2)
        : width / 2;
      
      // Alternate height levels to give depth and prevent edge overlapping
      const y = height / 2 + (idx % 2 === 0 ? -30 : 30);
      coords[node.id] = { x, y };
    });

    return coords;
  }, [nodes]);

  // Check if an edge is part of the deadlock cycle
  const isEdgeInDeadlock = (fromId: string, toId: string) => {
    if (!deadlock || deadlockPath.length < 2) return false;
    
    // Find the labels of the trace nodes
    const fromLabel = nodes.find(n => n.id === fromId)?.label || '';
    const toLabel = nodes.find(n => n.id === toId)?.label || '';

    if (!fromLabel || !toLabel) return false;

    // Check if they appear consecutively in the cycle path list
    for (let i = 0; i < deadlockPath.length - 1; i++) {
      if (deadlockPath[i] === fromLabel && deadlockPath[i + 1] === toLabel) {
        return true;
      }
    }
    // Handle the closing link of the loop (end -> start)
    if (deadlockPath[deadlockPath.length - 1] === fromLabel && deadlockPath[0] === toLabel) {
      return true;
    }
    return false;
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-3 bg-[#0a0a0c] border border-zinc-850 rounded-xl">
        <svg className="animate-spin h-5 w-5 text-zinc-400" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <span className="text-[10px] font-mono text-zinc-550">Resolving multi-agent link mappings...</span>
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="text-center py-8 text-zinc-500 italic text-xs font-mono bg-[#0a0a0c] border border-zinc-850 rounded-xl">
        No coordinated agent workflow links recorded for this trace.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      
      {/* Deadlock Alerts Banner */}
      {deadlock && (
        <div className="bg-red-950/20 border border-red-900/40 p-4 rounded-xl space-y-2 text-xs leading-relaxed shadow-lg animate-pulse">
          <div className="flex items-center gap-2 text-red-400 font-bold font-mono text-[10.5px] uppercase">
            <span>🚨 Agent Deadlock Identified</span>
          </div>
          <p className="text-red-200/90 font-mono text-[10.5px]">
            Circular dependency detected between coordinate agents: <br />
            <span className="font-bold text-red-300">{deadlockPath.join(' ➔ ')}</span>
          </p>
          <div className="text-[9px] text-zinc-500 italic font-mono pt-1">
            ⚠️ Circular waits block agent threads indefinitely, leading to request timeouts and cost spikes. Refactor agent message channels or add maximum loop retry parameters.
          </div>
        </div>
      )}

      {/* SVG Canvas Map */}
      <div className="bg-[#0a0a0c] border border-zinc-850 rounded-xl p-5 relative overflow-hidden">
        
        {/* Interactive canvas grid overlay */}
        <div className="absolute inset-0 bg-[radial-gradient(#1f1f23_1px,transparent_1px)] [background-size:16px_16px] opacity-30 select-none pointer-events-none" />

        <svg 
          viewBox="0 0 640 180" 
          className="w-full max-h-[220px] relative z-10"
        >
          {/* Arrow markers definitions */}
          <defs>
            <marker id="arrow-grey" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#3f3f46" />
            </marker>
            <marker id="arrow-red" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#f87171" />
            </marker>
          </defs>

          {/* Edges */}
          {edges.map((edge, idx) => {
            const start = nodeCoords[edge.from];
            const end = nodeCoords[edge.to];

            if (!start || !end) return null;

            const isDeadlocked = isEdgeInDeadlock(edge.from, edge.to);

            // Draw curved bezier path connections
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const dr = Math.sqrt(dx * dx + dy * dy) * 1.2; // Curve radius
            const dPath = `M ${start.x} ${start.y} A ${dr} ${dr} 0 0 1 ${end.x} ${end.y}`;

            return (
              <path
                key={idx}
                d={dPath}
                fill="none"
                stroke={isDeadlocked ? "#f87171" : "#27272a"}
                strokeWidth={isDeadlocked ? "2" : "1.5"}
                strokeDasharray={isDeadlocked ? "4,4" : undefined}
                markerEnd={isDeadlocked ? "url(#arrow-red)" : "url(#arrow-grey)"}
                className={isDeadlocked ? "animate-[dash_2s_linear_infinite]" : ""}
                style={isDeadlocked ? { strokeDashoffset: 10 } : {}}
              />
            );
          })}

          {/* Nodes */}
          {nodes.map((node) => {
            const coord = nodeCoords[node.id];
            if (!coord) return null;

            const isInCycle = deadlock && deadlockPath.includes(node.label);
            const cardBorder = node.error 
              ? "stroke-red-500/80 fill-[#1c0e0e]" 
              : isInCycle 
                ? "stroke-red-500/60 fill-[#0e0e11]" 
                : "stroke-zinc-800 fill-[#0f0f12]";

            return (
              <g key={node.id}>
                {/* Node Box */}
                <rect
                  x={coord.x - 70}
                  y={coord.y - 25}
                  width="140"
                  height="50"
                  rx="8"
                  className={`${cardBorder} stroke-[1.5] filter drop-shadow-md`}
                />
                
                {/* Node Labels */}
                <text
                  x={coord.x}
                  y={coord.y - 8}
                  textAnchor="middle"
                  fill={node.error || isInCycle ? "#f87171" : "#fafafa"}
                  className="font-mono text-[9px] font-bold"
                >
                  {node.label.length > 20 ? node.label.substring(0, 17) + "..." : node.label}
                </text>

                <text
                  x={coord.x}
                  y={coord.y + 4}
                  textAnchor="middle"
                  fill="#71717a"
                  className="font-mono text-[8px]"
                >
                  Agent ID: {node.agentId}
                </text>

                <text
                  x={coord.x}
                  y={coord.y + 15}
                  textAnchor="middle"
                  fill="#52525b"
                  className="font-mono text-[7px] font-bold uppercase tracking-wider"
                >
                  {node.model} • {node.latency}ms
                </text>

                {/* Hover highlights */}
                <title>{`Trace: ${node.id}\nAgent: ${node.agentId}\nModel: ${node.model}\nLatency: ${node.latency}ms`}</title>
              </g>
            );
          })}
        </svg>

        <div className="flex justify-between w-full font-mono text-[9.5px] text-zinc-600 mt-2 border-t border-zinc-900 pt-2">
          <span>Workflow ID: {workflowId}</span>
          <span>Nodes: {nodes.length} agents</span>
        </div>

      </div>

    </div>
  );
}
