# test-replay.py
import time
import os
import sys

# Add src/sdk to sys.path so we can import llmwatch module
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), 'src')))

from sdk.llmwatch import LLMWatch

def main():
    print("Initializing LLMWatch Python SDK for Replay Testing...")
    sdk = LLMWatch(
        api_key="lw_live_demosupersecretkey",
        endpoint="http://localhost:3000/api/public/v1/events",
        flush_interval_ms=500,
        max_batch_size=1
    )

    print("Starting replay trace execution...")
    # Test state capture, reasoning, duration breakdown, and execution sequence order
    with sdk.trace("Replayable Agent Main", span_type="agent") as trace:
        print(f"  -> Root trace: execution_order={trace.execution_order}")
        trace.capture_state({"step": "init", "user_authenticated": True, "messages_count": 0})
        trace.reasoning("Initializing the agent session and parsing configuration.")
        time.sleep(0.05)
        
        with trace.span("Retrieve Knowledge Context", span_type="tool") as tool_span:
            print(f"     -> Sub-span Retrieve Knowledge: execution_order={tool_span.execution_order}")
            tool_span.capture_state({"step": "knowledge_retrieved", "query": "database security", "results_found": 3})
            tool_span.reasoning("Searching database for matching documents to build context window.")
            time.sleep(0.04)
            tool_span.track(
                provider="neon-postgres", 
                model="pg-vector", 
                request_payload={"query": "database security", "limit": 3}, 
                response_payload={"results": [{"doc_id": 1, "score": 0.92}, {"doc_id": 2, "score": 0.88}]}
            )

        with trace.span("AI Insights Generator", span_type="chain") as chain_span:
            print(f"     -> Sub-span AI Insights: execution_order={chain_span.execution_order}")
            chain_span.capture_state({"step": "generating_insights", "rag_context_length": 1500})
            chain_span.reasoning("Formulating reasoning prompt incorporating database context.")
            time.sleep(0.03)
            
            with chain_span.span("OpenAI Model Call", span_type="llm") as llm_span:
                print(f"        -> Sub-span Model Call: execution_order={llm_span.execution_order}")
                llm_span.capture_state({"step": "model_called"})
                llm_span.reasoning("Calling GPT-4o-mini to synthesize final reply.")
                llm_span.duration_breakdown({"queue_ms": 5, "model_ms": 250, "overhead_ms": 10})
                time.sleep(0.1)
                llm_span.track(
                    provider="openai", 
                    model="gpt-4o-mini", 
                    prompt_tokens=500, 
                    completion_tokens=200, 
                    request_payload={"messages": [{"role": "user", "content": "Explain security rules."}]}, 
                    response_payload={"choices": [{"message": {"role": "assistant", "content": "The security rules are..."}}]}
                )

    print("Execution complete. Waiting for batch flush...")
    time.sleep(1.0)
    sdk.close()
    print("Done!")

if __name__ == "__main__":
    main()
