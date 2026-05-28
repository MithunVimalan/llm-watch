// src/lib/anomalies-scanner.ts
import { db } from './db';

export async function scanTracesForAnomalies(projectId: string, traceIds: string[]) {
  if (!traceIds || traceIds.length === 0) return;

  try {
    // 1. Fetch all events for the specified traceIds
    const events = await db.query(
      `SELECT id, span_name, span_type, cost_usd, latency_ms, prompt_tokens, model, provider, trace_id, parent_span_id
       FROM events 
       WHERE project_id = $1 AND trace_id = ANY($2::varchar[])`,
      [projectId, traceIds]
    );

    if (events.length === 0) return;

    // 2. Fetch rolling average latencies for models in this project (last 7 days)
    const modelLatencies = await db.query(
      `SELECT model, AVG(latency_ms)::numeric as avg_latency 
       FROM events 
       WHERE project_id = $1 AND latency_ms IS NOT NULL AND created_at > NOW() - INTERVAL '7 days'
       GROUP BY model`,
      [projectId]
    );

    const modelAvgMap: Record<string, number> = {};
    for (const row of modelLatencies) {
      if (row.model) {
        modelAvgMap[row.model] = Number(row.avg_latency);
      }
    }

    // 3. Group events by traceId
    const tracesMap: Record<string, any[]> = {};
    for (const event of events) {
      if (event.trace_id) {
        if (!tracesMap[event.trace_id]) {
          tracesMap[event.trace_id] = [];
        }
        tracesMap[event.trace_id].push(event);
      }
    }

    // 4. Scan each trace for anomalies
    for (const [traceId, traceEvents] of Object.entries(tracesMap)) {
      let totalCost = 0;
      const spanNameCounts: Record<string, number> = {};
      const toolCounts: Record<string, number> = {};

      for (const event of traceEvents) {
        // Cost accumulation
        totalCost += Number(event.cost_usd || 0);

        // Loop & Retry counts
        const name = event.span_name || event.model || 'unnamed-span';
        spanNameCounts[name] = (spanNameCounts[name] || 0) + 1;

        if (event.span_type === 'tool') {
          toolCounts[name] = (toolCounts[name] || 0) + 1;
        }

        // Latency outlier check (LLM spans)
        if (event.span_type === 'llm' && event.latency_ms && event.model) {
          const avgLat = modelAvgMap[event.model];
          // We define a latency outlier if it is > 3x average AND > 2000ms (to avoid flagging tiny prompt variance)
          if (avgLat && event.latency_ms > 3 * avgLat && event.latency_ms > 2000) {
            const ratio = (event.latency_ms / avgLat).toFixed(1);
            await insertAnomaly({
              projectId,
              traceId,
              anomalyType: 'latency_outlier',
              severity: 'warning',
              description: `Latency outlier: LLM span '${name}' took ${event.latency_ms}ms, which is ${ratio}x the model average (${avgLat.toFixed(0)}ms).`,
              metadata: {
                span_id: event.id,
                model: event.model,
                latency_ms: event.latency_ms,
                avg_latency_ms: Math.round(avgLat)
              }
            });
          }
        }
      }

      // 5. Evaluate loop detection
      for (const [name, count] of Object.entries(spanNameCounts)) {
        if (count > 5) {
          await insertAnomaly({
            projectId,
            traceId,
            anomalyType: 'recursive_loop',
            severity: 'critical',
            description: `Recursive loop: span '${name}' executed ${count} times in the trace flow.`,
            metadata: {
              span_name: name,
              iterations: count
            }
          });
        }
      }

      // 6. Evaluate retry storm detection
      for (const [name, count] of Object.entries(toolCounts)) {
        if (count > 3) {
          await insertAnomaly({
            projectId,
            traceId,
            anomalyType: 'retry_storm',
            severity: 'warning',
            description: `Retry storm: tool '${name}' was repeatedly called ${count} times.`,
            metadata: {
              tool_name: name,
              invocations: count
            }
          });
        }
      }

      // 7. Evaluate cost explosion detection
      if (totalCost > 0.10) {
        await insertAnomaly({
          projectId,
          traceId,
          anomalyType: 'cost_explosion',
          severity: 'critical',
          description: `Runaway cost: trace accumulated $${totalCost.toFixed(4)}, exceeding the $0.10 safety limit.`,
          metadata: {
            total_cost_usd: totalCost
          }
        });
      }
    }
  } catch (scanError) {
    console.error('Error running scanTracesForAnomalies:', scanError);
  }
}

interface AnomalyData {
  projectId: string;
  traceId: string;
  anomalyType: string;
  severity: string;
  description: string;
  metadata: any;
}

async function insertAnomaly(data: AnomalyData) {
  try {
    await db.query(
      `INSERT INTO anomalies (project_id, trace_id, anomaly_type, severity, description, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (trace_id, anomaly_type) 
       DO UPDATE SET 
         severity = EXCLUDED.severity, 
         description = EXCLUDED.description, 
         metadata = EXCLUDED.metadata, 
         detected_at = NOW()`,
      [
        data.projectId,
        data.traceId,
        data.anomalyType,
        data.severity,
        data.description,
        JSON.stringify(data.metadata)
      ]
    );
  } catch (err) {
    console.error('Failed to insert anomaly record:', err);
  }
}
