// src/sdk/llmwatch.ts

export interface LLMWatchConfig {
  apiKey: string;
  endpoint?: string;
  flushIntervalMs?: number;
  maxBatchSize?: number;
}

export interface TrackEvent {
  idempotency_key: string;
  request_id?: string;
  prompt_hash?: string;
  customer_identifier?: string;
  provider: string;
  model: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  cost_usd?: number;
  latency_ms?: number;
  error_message?: string;
  is_cached?: boolean;
  request_payload?: any;
  response_payload?: any;
  trace_id?: string;
  parent_span_id?: string;
  span_type?: 'llm' | 'tool' | 'chain' | 'agent';
  span_name?: string;
  execution_order?: number;
  state_snapshot?: any;
  reasoning_text?: string;
  duration_breakdown?: {
    queue_ms?: number;
    model_ms?: number;
    tool_ms?: number;
    overhead_ms?: number;
    [key: string]: any;
  };
  [key: string]: any;
}

// Global-friendly UUID generator fallback
function generateUUID(): string {
  let cryptoObj = typeof globalThis !== 'undefined' ? (globalThis as any).crypto : null;
  if (!cryptoObj && typeof window !== 'undefined') {
    cryptoObj = window.crypto;
  }
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }
  // Fallback UUID v4 generator
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Simple prompt hashing to generate prompt_hash if not provided
function simpleHash(text: string): string {
  if (!text) return '';
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16);
}

export class Span {
  public id: string;
  public traceId: string;
  public parentSpanId: string | null;
  public name: string;
  public type: 'llm' | 'tool' | 'chain' | 'agent';
  private sdk: LLMWatch;
  private startTime: number;
  private executionCounter: { count: number };
  public executionOrder: number;
  private stateSnapshot?: any;
  private reasoningText?: string;
  private durationBreakdownVal?: any;

  constructor(
    sdk: LLMWatch,
    name: string,
    type: 'llm' | 'tool' | 'chain' | 'agent' = 'llm',
    traceId?: string,
    parentSpanId: string | null = null,
    executionCounter?: { count: number }
  ) {
    this.sdk = sdk;
    this.name = name;
    this.type = type;
    this.id = generateUUID();
    this.traceId = traceId || generateUUID();
    this.parentSpanId = parentSpanId;
    this.startTime = Date.now();
    this.executionCounter = executionCounter || { count: 0 };
    this.executionOrder = this.executionCounter.count++;
  }

  public span(name: string, options?: { spanType?: 'llm' | 'tool' | 'chain' | 'agent' }): Span {
    return new Span(this.sdk, name, options?.spanType || 'llm', this.traceId, this.id, this.executionCounter);
  }

  public captureState(state: any): Span {
    this.stateSnapshot = state;
    return this;
  }

  public reasoning(text: string): Span {
    this.reasoningText = text;
    return this;
  }

  public durationBreakdown(breakdown: any): Span {
    this.durationBreakdownVal = breakdown;
    return this;
  }

  public track(data: Partial<TrackEvent>) {
    const event: TrackEvent = {
      idempotency_key: this.id,
      trace_id: this.traceId,
      parent_span_id: this.parentSpanId || undefined,
      span_type: this.type,
      span_name: this.name,
      provider: data.provider || 'unknown',
      model: data.model || 'unknown',
      execution_order: this.executionOrder,
      state_snapshot: this.stateSnapshot,
      reasoning_text: this.reasoningText,
      duration_breakdown: this.durationBreakdownVal,
      ...data
    };
    this.sdk.track(event);
  }

  public end(data?: Partial<TrackEvent>) {
    const latency_ms = Date.now() - this.startTime;
    this.track({ latency_ms, ...data });
  }
}

export class LLMWatch {
  private apiKey: string;
  private endpoint: string;
  private buffer: TrackEvent[] = [];
  private flushIntervalMs: number;
  private maxBatchSize: number;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(config: LLMWatchConfig) {
    this.apiKey = config.apiKey;
    this.endpoint = config.endpoint || 'http://localhost:3000/api/public/v1/events';
    this.flushIntervalMs = config.flushIntervalMs || 5000;
    this.maxBatchSize = config.maxBatchSize || 100;

    // Start timer for flush intervals
    this.timer = setInterval(() => this.flush(), this.flushIntervalMs);
    
    // Graceful draining on process exit (Node environment)
    if (typeof process !== 'undefined' && typeof process.on === 'function') {
      process.on('SIGINT', () => this.close());
      process.on('SIGTERM', () => this.close());
    }
  }

  public trace(name: string, options?: { spanType?: 'llm' | 'tool' | 'chain' | 'agent'; traceId?: string }): Span {
    return new Span(this, name, options?.spanType || 'agent', options?.traceId || generateUUID(), null);
  }

  public track(event: TrackEvent) {
    // Fill in default uuid if missing
    if (!event.idempotency_key) {
      event.idempotency_key = generateUUID();
    }
    this.buffer.push(event);
    
    if (this.buffer.length >= this.maxBatchSize) {
      this.flush();
    }
  }

  public async flush() {
    if (this.buffer.length === 0) return;
    
    const batch = this.buffer.splice(0, this.maxBatchSize);
    let attempts = 0;
    
    while (attempts < 3) {
      try {
        const res = await fetch(this.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
          },
          body: JSON.stringify(batch)
        });
        
        // Don't retry client-side errors (400-499)
        if (res.ok || (res.status >= 400 && res.status < 500)) {
          break;
        }
        
      } catch (err) {
        // Network error - continue to retry
      }
      
      attempts++;
      if (attempts < 3) {
        // Exponential backoff retry: 1s, 2s, capped at 8s
        const delay = Math.min(1000 * Math.pow(2, attempts - 1), 8000);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  public async close() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.flush();
  }

  // Deterministic hashing for prompt parameters
  private async generateCacheKey(params: any): Promise<string> {
    // Sort keys recursively/shallowly so {"model":"x", "temp":1} hashes the same as {"temp":1, "model":"x"}
    const sortedParams = Object.keys(params).sort().reduce((acc: any, key) => {
      acc[key] = params[key];
      return acc;
    }, {});
    
    const payloadStr = JSON.stringify(sortedParams);
    const msgUint8 = new TextEncoder().encode(payloadStr);
    
    let cryptoObj = typeof globalThis !== 'undefined' ? (globalThis as any).crypto : null;
    if (!cryptoObj && typeof window !== 'undefined') {
      cryptoObj = window.crypto;
    }
    
    if (cryptoObj && cryptoObj.subtle) {
      const hashBuffer = await cryptoObj.subtle.digest('SHA-256', msgUint8);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } else {
      // Fallback for older Node.js runtimes
      try {
        const nodeCrypto = require('crypto');
        return nodeCrypto.createHash('sha256').update(payloadStr).digest('hex');
      } catch (err) {
        // Simple fallback hash if node crypto is not available
        return simpleHash(payloadStr);
      }
    }
  }

  // Auto-instrumentation wrapper for OpenAI
  public wrapOpenAI(openaiClient: any, options?: { enableCache?: boolean; cacheTtl?: number }) {
    const originalCreate = openaiClient.chat.completions.create.bind(openaiClient.chat.completions);
    const cacheEndpoint = this.endpoint.replace('/events', '/cache');
    
    openaiClient.chat.completions.create = async (params: any, reqOptions?: any) => {
      const start = Date.now();
      const idempotency_key = generateUUID();
      
      // Extract prompt text for prompt hash
      let promptText = '';
      if (params.messages && Array.isArray(params.messages)) {
        promptText = JSON.stringify(params.messages);
      } else {
        promptText = JSON.stringify(params);
      }
      const prompt_hash = simpleHash(promptText);
      
      // 1. Check Cache if enabled (and not streaming)
      let cacheKey = '';
      if (options?.enableCache && !params.stream) {
        cacheKey = await this.generateCacheKey(params);
        try {
          const cacheRes = await fetch(`${cacheEndpoint}?key=${cacheKey}`, {
            headers: { 'Authorization': `Bearer ${this.apiKey}` }
          });
          
          if (cacheRes.ok) {
            const cacheData = await cacheRes.json();
            if (cacheData.hit) {
              // Track as a 0-cost, 50ms latency cached hit!
              this.track({
                idempotency_key,
                provider: 'openai',
                model: params.model,
                prompt_hash,
                latency_ms: Date.now() - start,
                is_cached: true,
                cost_usd: 0, // Cache hits are free
                request_payload: params,
                response_payload: cacheData.data
              });
              
              return cacheData.data; // Return identical cached payload
            }
          }
        } catch (e) {
          console.warn('[LLMWatch] Cache fetch failed, falling back to network', e);
        }
      }
      
      // 2. Call OpenAI on Cache Miss
      try {
        const response = await originalCreate(params, reqOptions);
        
        // Track non-stream completions
        if (!params.stream) {
          this.track({
            idempotency_key,
            provider: 'openai',
            model: response.model || params.model,
            prompt_hash,
            prompt_tokens: response.usage?.prompt_tokens,
            completion_tokens: response.usage?.completion_tokens,
            latency_ms: Date.now() - start,
            is_cached: false,
            request_payload: params,
            response_payload: response
          });

          // 3. Asynchronously write back to cache
          if (options?.enableCache && cacheKey) {
            fetch(cacheEndpoint, {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json', 
                'Authorization': `Bearer ${this.apiKey}` 
              },
              body: JSON.stringify({
                cacheKey,
                provider: 'openai',
                model: params.model,
                payload: response,
                ttlSeconds: options.cacheTtl || 86400
              })
            }).catch((err) => {
              console.warn('[LLMWatch] Async cache write-back failed', err);
            });
          }
        }
        return response;
      } catch (error: any) {
        // Track API execution failures
        this.track({
          idempotency_key,
          provider: 'openai',
          model: params.model,
          prompt_hash,
          latency_ms: Date.now() - start,
          error_message: error.message || 'OpenAI API execution error',
          request_payload: params
        });
        throw error;
      }
    };
    
    return openaiClient;
  }
}
