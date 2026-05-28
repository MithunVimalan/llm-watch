# test-token-flow.py
import time
import os
import sys

# Add src/sdk to sys.path so we can import llmwatch module
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), 'src')))

from sdk.llmwatch import LLMWatch

def main():
    print("Initializing LLMWatch Python SDK for Token Flow Testing...")
    sdk = LLMWatch(
        api_key="lw_live_demosupersecretkey",
        endpoint="http://localhost:3000/api/public/v1/events",
        flush_interval_ms=500,
        max_batch_size=1
    )

    print("Starting token flow trace execution...")
    # Test token breakdown and context window tracking
    with sdk.trace("Token-Heavy Agent Search", span_type="agent") as trace:
        trace.context_window(used=12000, max_tokens=128000)
        trace.token_breakdown({
            "system_prompt": 1000,
            "user_input": 500,
            "rag_context": 8000,
            "memory": 2000,
            "function_defs": 500
        })
        time.sleep(0.05)
        
        with trace.span("Retrieve Legal Context Documents", span_type="tool") as tool_span:
            time.sleep(0.04)
            tool_span.track(
                provider="neon-postgres", 
                model="pg-vector", 
                prompt_tokens=1500,
                completion_tokens=0,
                request_payload={"query": "privacy policy changes 2026", "limit": 5}, 
                response_payload={"results": [{"doc_id": 1, "text": "..."}]}
            )

        with trace.span("GPT-4o Context Analyzer", span_type="llm") as llm_span:
            # High RAG context prompt size vs tiny output to trigger Waste Alert Condition:
            # Prompt tokens > 1500, RAG is > 50% of prompt, completion is tiny (< 100 tokens)
            llm_span.context_window(used=12000, max_tokens=128000)
            llm_span.token_breakdown({
                "system_prompt": 500,
                "user_input": 200,
                "rag_context": 9000,
                "memory": 1000,
                "function_defs": 300,
                "other": 1000
            })
            time.sleep(0.1)
            llm_span.track(
                provider="openai", 
                model="gpt-4o", 
                prompt_tokens=12000, 
                completion_tokens=45, 
                request_payload={"messages": [{"role": "user", "content": "Analyze document."}]}, 
                response_payload={"choices": [{"message": {"role": "assistant", "content": "This document outlines changes."}}]}
            )

    print("Execution complete. Waiting for batch flush...")
    time.sleep(1.0)
    sdk.close()
    print("Done!")

if __name__ == "__main__":
    main()
