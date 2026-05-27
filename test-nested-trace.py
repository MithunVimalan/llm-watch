# test-nested-trace.py
import time
import os
import sys

# Add src/sdk to sys.path so we can import llmwatch module
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), 'src')))

from sdk.llmwatch import LLMWatch

def main():
    print("Initializing LLMWatch Python SDK...")
    # Using demo API key that is pre-seeded in the database
    sdk = LLMWatch(
        api_key="lw_live_demosupersecretkey",
        endpoint="http://localhost:3000/api/public/v1/events",
        flush_interval_ms=1000,
        max_batch_size=1
    )

    print("Starting nested trace execution...")
    # Test context manager nesting:
    with sdk.trace("Agent Coordinator Loop", span_type="agent") as trace:
        print("  -> Running Agent Coordinator Loop")
        time.sleep(0.05)
        
        with trace.span("Fetch User Records", span_type="tool") as tool_span:
            print("     -> Fetching user data via PostgreSQL")
            time.sleep(0.04)
            tool_span.track(
                provider="postgresql", 
                model="neon-db", 
                request_payload={"user_id": 109, "fields": ["email", "subscription"]}, 
                response_payload={"email": "corporate-client@domain.com", "subscription": "enterprise"}
            )

        with trace.span("Generate Enterprise Insights", span_type="chain") as chain_span:
            print("     -> Entering chain context: Generate Insights")
            time.sleep(0.03)
            
            with chain_span.span("OpenAI Model Recommendation", span_type="llm") as llm_span_1:
                print("        -> Invoking OpenAI Completion 1")
                time.sleep(0.12)
                llm_span_1.track(
                    provider="openai", 
                    model="gpt-4o-mini", 
                    prompt_tokens=420, 
                    completion_tokens=180, 
                    request_payload={"messages": [{"role": "user", "content": "Analyze user records."}]}, 
                    response_payload={"choices": [{"message": {"role": "assistant", "content": "Analysis complete."}}]}
                )

            with chain_span.span("Model Refinement Completion", span_type="llm") as llm_span_2:
                print("        -> Invoking OpenAI Completion 2 (failing branch)")
                time.sleep(0.08)
                
                # Test error mapping in context managers
                try:
                    raise RuntimeError("API Connection refused by provider (503 Service Unavailable)")
                except Exception as e:
                    # Let context manager capture exception details
                    # In python context manager, returning False lets it propagate or we handle it.
                    # We print error and exit the block.
                    print("           [Caught expected simulated error]")
                    # Propagate exception to let __exit__ capture it
                    raise e
                finally:
                    pass

if __name__ == "__main__":
    try:
        main()
    except RuntimeError as e:
        print(f"Propagated exception caught at top level: {e}")
        print("Telemetry sent successfully. Check your local dashboard logs!")
