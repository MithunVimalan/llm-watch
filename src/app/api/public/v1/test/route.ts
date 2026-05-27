// src/app/api/public/v1/test/route.ts
import { NextResponse } from 'next/server';
import { LLMWatch } from '@/sdk/llmwatch';

export async function GET(req: Request) {
  const testReports: string[] = [];
  let testPassed = true;

  // Resolve active server host dynamically
  const host = req.headers.get('host') || 'localhost:3000';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const baseUrl = `${protocol}://${host}`;

  try {
    testReports.push(`Initializing LLMWatch SDK targeting server: ${baseUrl}`);
    
    // Instantiate SDK pointing to our resolved endpoint
    const sdk = new LLMWatch({
      apiKey: 'lw_live_demosupersecretkey',
      endpoint: `${baseUrl}/api/public/v1/events`,
      flushIntervalMs: 1000,
      maxBatchSize: 2
    });

    // 1. Verify manual event tracking
    testReports.push('Testing manual track event ingestion...');
    sdk.track({
      idempotency_key: `manual_test_${Date.now()}`,
      provider: 'openai',
      model: 'gpt-4o',
      prompt_tokens: 30,
      completion_tokens: 15,
      latency_ms: 120,
      request_payload: { input: 'hello manual' },
      response_payload: { output: 'world manual' }
    });

    // 2. Setup mock OpenAI client
    const mockOpenAIClient = {
      chat: {
        completions: {
          create: async (params: any) => {
            // Simulate model generation time of 300ms
            await new Promise(r => setTimeout(r, 300));
            return {
              id: 'chatcmpl-mock-test-id',
              model: params.model,
              usage: {
                prompt_tokens: 40,
                completion_tokens: 20
              },
              choices: [
                {
                  message: {
                    role: 'assistant',
                    content: 'Standard simulated response payload.'
                  }
                }
              ]
            };
          }
        }
      }
    };

    // 3. Wrap mock OpenAI client with cache tracking
    testReports.push('Wrapping mock OpenAI client with SDK wrapOpenAI (cache enabled)...');
    const wrappedOpenAI = sdk.wrapOpenAI(mockOpenAIClient, { 
      enableCache: true, 
      cacheTtl: 60 
    });

    const promptParams = {
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Testing semantic cache pipeline' }],
      temperature: 0.7
    };

    // Call 1: Expect Cache Miss (should take >= 300ms)
    testReports.push('Executing Chat Completion 1 (Expecting Cache Miss)...');
    const start1 = Date.now();
    const res1 = await wrappedOpenAI.chat.completions.create(promptParams);
    const latency1 = Date.now() - start1;
    testReports.push(`Chat Completion 1 completed in ${latency1}ms. Result choices: "${res1.choices[0].message.content}"`);

    if (latency1 < 300) {
      testReports.push('Warning: Call 1 completed faster than mock execution time.');
    }

    // Wait slightly to ensure async cache write-back completes
    await new Promise(r => setTimeout(r, 100));

    // Call 2: Expect Cache Hit (should take < 50ms)
    testReports.push('Executing Chat Completion 2 (Expecting Cache Hit)...');
    const start2 = Date.now();
    const res2 = await wrappedOpenAI.chat.completions.create(promptParams);
    const latency2 = Date.now() - start2;
    testReports.push(`Chat Completion 2 completed in ${latency2}ms. Result choices: "${res2.choices[0].message.content}"`);

    if (latency2 > 80) {
      testPassed = false;
      testReports.push('Error: Call 2 took too long. Cache hit was not intercepted successfully.');
    } else {
      testReports.push(`Success: Call 2 intercepted! Cache lookup saved ${latency1 - latency2}ms latency.`);
    }

    // 4. Force drain buffers
    testReports.push('Flushing SDK buffered telemetry events...');
    await sdk.close();
    testReports.push('SDK buffer drained.');

    return NextResponse.json({
      status: testPassed ? 'PASSED' : 'FAILED',
      latencyReport: {
        cacheMissMs: latency1,
        cacheHitMs: latency2
      },
      executionLog: testReports
    });

  } catch (err: any) {
    testReports.push(`Fatal Error during SDK test: ${err.message}`);
    return NextResponse.json({
      status: 'FAILED',
      error: err.message,
      executionLog: testReports
    }, { status: 500 });
  }
}
