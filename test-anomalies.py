# test-anomalies.py
import time
import os
import sys

# Add src/sdk to sys.path so we can import llmwatch module
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), 'src')))

from sdk.llmwatch import LLMWatch

def main():
    print("Initializing LLMWatch Python SDK for Anomaly Testing...")
    sdk = LLMWatch(
        api_key="lw_live_demosupersecretkey",
        endpoint="http://localhost:3000/api/public/v1/events",
        flush_interval_ms=500,
        max_batch_size=1
    )

    # 1. Trigger Cost Explosion Anomaly (Cost > $0.10)
    print("\nExecuting Trace 1: Triggering Cost Explosion...")
    with sdk.trace("Expensive Report Generation", span_type="chain") as trace:
        with trace.span("GPT-4 Turbo Synthesis", span_type="llm") as llm_span:
            time.sleep(0.05)
            # Cost formula: (12000 * 0.010 / 1000) + (4000 * 0.030 / 1000) = 0.12 + 0.12 = 0.24 USD (> $0.10)
            llm_span.track(
                provider="openai",
                model="gpt-4-turbo",
                prompt_tokens=12000,
                completion_tokens=4000,
                request_payload={"messages": [{"role": "user", "content": "Write complete system docs."}]},
                response_payload={"choices": [{"message": {"role": "assistant", "content": "..."}}]}
            )

    # 2. Trigger Recursive Loop Anomaly (> 5 span occurrences)
    print("\nExecuting Trace 2: Triggering Recursive Loop...")
    with sdk.trace("Haywire Loop Agent", span_type="agent") as trace:
        for i in range(6):
            with trace.span("Process Task Step", span_type="chain") as loop_span:
                time.sleep(0.01)
                loop_span.track(
                    provider="openai",
                    model="gpt-4o-mini",
                    prompt_tokens=100,
                    completion_tokens=20,
                    request_payload={"step": i},
                    response_payload={"status": "continue"}
                )

    # 3. Trigger Retry Storm Anomaly (> 3 tool calls)
    print("\nExecuting Trace 3: Triggering Retry Storm...")
    with sdk.trace("Retry Agent Flow", span_type="agent") as trace:
        for i in range(4):
            with trace.span("Fetch Remote DB Status", span_type="tool") as tool_span:
                time.sleep(0.02)
                tool_span.track(
                    provider="neon-postgres",
                    model="pg-vector",
                    prompt_tokens=50,
                    completion_tokens=0,
                    error_message="Connection timed out. Retrying in 1s..." if i < 3 else None,
                    request_payload={"query": "status"},
                    response_payload={"status": "error" if i < 3 else "ok"}
                )

    # 4. Trigger Latency Outlier Anomaly (LLM span > 3x average and > 2000ms)
    print("\nExecuting Trace 4: Triggering Latency Outlier...")
    with sdk.trace("Latency Outlier Tracer", span_type="chain") as trace:
        with trace.span("Outlier Model Call", span_type="llm") as llm_span:
            # typical seed gpt-4o-mini has average latency around 210-340ms.
            # 4500ms is > 3x the average and > 2000ms.
            llm_span.track(
                provider="openai",
                model="gpt-4o-mini",
                prompt_tokens=150,
                completion_tokens=50,
                latency_ms=4500,
                request_payload={"messages": [{"role": "user", "content": "Explain relativity."}]},
                response_payload={"choices": [{"message": {"role": "assistant", "content": "Relativity is..."}}]}
            )

    print("\nTrace executions submitted. Flushing events...")
    time.sleep(1.5)
    sdk.close()
    print("Done!")

if __name__ == "__main__":
    main()
