// test-free-groq.js
// Test LLMWatch with your own custom prompts for free using Groq!
// Requires: npm install openai

const { OpenAI } = require('openai');
const crypto = require('crypto');
const readline = require('readline');

// 1. LLMWatch JS SDK implementation
class LLMWatch {
  constructor(config) {
    this.apiKey = config.apiKey;
    this.endpoint = config.endpoint || 'http://localhost:3000/api/public/v1/events';
    this.flushIntervalMs = config.flushIntervalMs || 5000;
    this.maxBatchSize = config.maxBatchSize || 100;
    this.buffer = [];
    this.timer = setInterval(() => this.flush(), this.flushIntervalMs);
  }

  track(event) {
    if (!event.idempotency_key) {
      event.idempotency_key = crypto.randomUUID();
    }
    this.buffer.push(event);
    if (this.buffer.length >= this.maxBatchSize) {
      this.flush();
    }
  }

  async flush() {
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
        if (res.ok || (res.status >= 400 && res.status < 500)) break;
      } catch (err) {
        // retry
      }
      attempts++;
      if (attempts < 3) {
        await new Promise(r => setTimeout(r, Math.min(1000 * Math.pow(2, attempts - 1), 8000)));
      }
    }
  }

  async close() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.flush();
  }

  async generateCacheKey(params) {
    const sortedParams = Object.keys(params).sort().reduce((acc, key) => {
      acc[key] = params[key];
      return acc;
    }, {});
    const payloadStr = JSON.stringify(sortedParams);
    return crypto.createHash('sha256').update(payloadStr).digest('hex');
  }

  wrapOpenAI(openaiClient, options = {}) {
    const originalCreate = openaiClient.chat.completions.create.bind(openaiClient.chat.completions);
    const cacheEndpoint = this.endpoint.replace('/events', '/cache');
    
    openaiClient.chat.completions.create = async (params, reqOptions) => {
      const start = Date.now();
      const idempotency_key = crypto.randomUUID();
      const prompt_hash = crypto.createHash('sha256').update(JSON.stringify(params.messages)).digest('hex');
      
      let cacheKey = '';
      if (options.enableCache && !params.stream) {
        cacheKey = await this.generateCacheKey(params);
        try {
          const cacheRes = await fetch(`${cacheEndpoint}?key=${cacheKey}`, {
            headers: { 'Authorization': `Bearer ${this.apiKey}` }
          });
          if (cacheRes.ok) {
            const cacheData = await cacheRes.json();
            if (cacheData.hit) {
              this.track({
                idempotency_key,
                provider: 'groq',
                model: params.model,
                prompt_hash,
                latency_ms: Date.now() - start,
                is_cached: true,
                cost_usd: 0,
                request_payload: params,
                response_payload: cacheData.data
              });
              return cacheData.data;
            }
          }
        } catch (e) {
          console.warn('[LLMWatch] Caching lookup bypassed due to error:', e.message);
        }
      }
      
      try {
        const response = await originalCreate(params, reqOptions);
        if (!params.stream) {
          this.track({
            idempotency_key,
            provider: 'groq',
            model: response.model || params.model,
            prompt_hash,
            prompt_tokens: response.usage?.prompt_tokens,
            completion_tokens: response.usage?.completion_tokens,
            latency_ms: Date.now() - start,
            is_cached: false,
            request_payload: params,
            response_payload: response
          });

          if (options.enableCache && cacheKey) {
            fetch(cacheEndpoint, {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json', 
                'Authorization': `Bearer ${this.apiKey}` 
              },
              body: JSON.stringify({
                cacheKey,
                provider: 'groq',
                model: params.model,
                payload: response,
                ttlSeconds: options.cacheTtl || 86400
              })
            }).catch(() => {});
          }
        }
        return response;
      } catch (error) {
        this.track({
          idempotency_key,
          provider: 'groq',
          model: params.model,
          prompt_hash,
          latency_ms: Date.now() - start,
          error_message: error.message || 'API Error',
          request_payload: params
        });
        throw error;
      }
    };
    return openaiClient;
  }
}

// Readline setup for interactive prompt input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const GROQ_API_KEY = process.env.GROQ_API_KEY || 'YOUR_GROQ_API_KEY';

if (GROQ_API_KEY === 'YOUR_GROQ_API_KEY') {
  console.error('ERROR: Please replace YOUR_GROQ_API_KEY with your actual Groq API Key first!');
  process.exit(1);
}

// 2. Initialize Clients
const openai = new OpenAI({
  apiKey: GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1' // Directs OpenAI SDK calls to Groq's gateway
});

const sdk = new LLMWatch({
  apiKey: 'lw_live_demosupersecretkey',
  endpoint: 'https://llmwatch-eight.vercel.app/api/public/v1/events'
});

// Wrap the client to enable LLMWatch tracking and caching
const monitoredOpenAI = sdk.wrapOpenAI(openai, { 
  enableCache: true, 
  cacheTtl: 300 
});

rl.question('💬 Type your custom prompt to send to the AI: ', async (userInput) => {
  if (!userInput.trim()) {
    console.log('Empty prompt. Exiting.');
    rl.close();
    process.exit(0);
  }

  const completionParams = {
    model: 'llama-3.1-8b-instant', // Uses Groq's high-speed Llama 3.1 model
    messages: [
      { role: 'user', content: userInput }
    ]
  };

  try {
    console.log('\n--------------------------------------------------');
    console.log('🚀 Call 1 (Cache Miss - Querying Groq Cloud)');
    console.log('--------------------------------------------------');
    const start1 = Date.now();
    const response1 = await monitoredOpenAI.chat.completions.create(completionParams);
    const latency1 = Date.now() - start1;
    
    console.log(`AI Response: "${response1.choices[0].message.content}"`);
    console.log(`Latency: ${latency1}ms`);
    console.log(`Tokens Used: ${response1.usage.total_tokens} tokens`);

    console.log('\nWaiting 2 seconds to write cache...\n');
    await new Promise(r => setTimeout(r, 2000));

    console.log('--------------------------------------------------');
    console.log('⚡ Call 2 (Cache Hit - Intercepted locally by LLMWatch)');
    console.log('--------------------------------------------------');
    const start2 = Date.now();
    const response2 = await monitoredOpenAI.chat.completions.create(completionParams);
    const latency2 = Date.now() - start2;

    console.log(`AI Response: "${response2.choices[0].message.content}"`);
    console.log(`Latency: ${latency2}ms (Resolved locally!)`);
    console.log(`Saved Latency: ${latency1 - latency2}ms`);
    console.log('Cost: $0.00 (Free cache hit!)');
    console.log('--------------------------------------------------');

    await sdk.close();
    console.log('\nTest complete! Go to your cloud dashboard to inspect your trace log!');
    console.log('👉 https://llmwatch-eight.vercel.app/dashboard/d3b07384-d113-41e9-9c8e-2f77e2ffb288/traces');
  } catch (err) {
    console.error('Error during execution:', err);
  } finally {
    rl.close();
  }
});
