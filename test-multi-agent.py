# test-multi-agent.py
import time
import os
import sys
import uuid

# Add src/sdk to sys.path so we can import llmwatch module
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), 'src')))

from sdk.llmwatch import LLMWatch

def main():
    print("Initializing LLMWatch Python SDK for Multi-Agent Correlation Testing...")
    sdk = LLMWatch(
        api_key="lw_live_demosupersecretkey",
        endpoint="http://localhost:3000/api/public/v1/events",
        flush_interval_ms=100,
        max_batch_size=1
    )

    # ==========================================
    # 1. TRIGGER NORMAL CASCADE MULTI-AGENT WORKFLOW
    # ==========================================
    print("\n--- Generating Normal Cascade Multi-Agent Workflow ---")
    wf_normal_id = f"wf_cascade_{uuid.uuid4().hex[:8]}"
    print(f"Workflow ID: {wf_normal_id}")

    # Trace 1: Router Agent (Root of cascade)
    print("Executing Router Agent...")
    router_trace_id = str(uuid.uuid4())
    router_span_id = str(uuid.uuid4())
    billing_dispatch_span_id = str(uuid.uuid4())
    inventory_dispatch_span_id = str(uuid.uuid4())

    sdk.track({
        "idempotency_key": router_span_id,
        "trace_id": router_trace_id,
        "span_type": "agent",
        "span_name": "Router Agent",
        "agent_id": "router-agent",
        "workflow_id": wf_normal_id,
        "provider": "openai",
        "model": "gpt-4o-mini",
        "latency_ms": 150,
        "request_payload": {"input": "Order item ID 4492 with Express Shipping"},
        "response_payload": {"actions": ["dispatch_billing", "dispatch_inventory"]}
    })

    # Sub-span inside Router Agent representing dispatch to Billing
    sdk.track({
        "idempotency_key": billing_dispatch_span_id,
        "trace_id": router_trace_id,
        "parent_span_id": router_span_id,
        "span_type": "chain",
        "span_name": "Call Billing Service",
        "workflow_id": wf_normal_id,
        "provider": "internal",
        "model": "http-post",
        "latency_ms": 45,
        "request_payload": {"target": "billing_agent", "data": {"amount": 99.99}},
        "response_payload": {"status": "dispatched"}
    })

    # Sub-span inside Router Agent representing dispatch to Inventory
    sdk.track({
        "idempotency_key": inventory_dispatch_span_id,
        "trace_id": router_trace_id,
        "parent_span_id": router_span_id,
        "span_type": "chain",
        "span_name": "Call Inventory Service",
        "workflow_id": wf_normal_id,
        "provider": "internal",
        "model": "http-post",
        "latency_ms": 30,
        "request_payload": {"target": "inventory_agent", "data": {"item_id": 4492}},
        "response_payload": {"status": "dispatched"}
    })

    # Trace 2: Billing Agent (Triggered by Router Agent's sub-span)
    print("Executing Billing Agent...")
    billing_trace_id = str(uuid.uuid4())
    billing_span_id = str(uuid.uuid4())
    
    sdk.track({
        "idempotency_key": billing_span_id,
        "trace_id": billing_trace_id,
        "parent_span_id": billing_dispatch_span_id, # Link back to Router Agent's dispatch span
        "span_type": "agent",
        "span_name": "Billing Agent",
        "agent_id": "billing-agent",
        "workflow_id": wf_normal_id,
        "provider": "stripe",
        "model": "payment-gateway",
        "latency_ms": 420,
        "request_payload": {"amount": 99.99, "currency": "USD"},
        "response_payload": {"charge_id": "ch_3M4o92", "status": "succeeded"}
    })

    # Trace 3: Inventory Agent (Triggered by Router Agent's sub-span)
    print("Executing Inventory Agent...")
    inventory_trace_id = str(uuid.uuid4())
    inventory_span_id = str(uuid.uuid4())
    
    sdk.track({
        "idempotency_key": inventory_span_id,
        "trace_id": inventory_trace_id,
        "parent_span_id": inventory_dispatch_span_id, # Link back to Router Agent's dispatch span
        "span_type": "agent",
        "span_name": "Inventory Agent",
        "agent_id": "inventory-agent",
        "workflow_id": wf_normal_id,
        "provider": "internal-db",
        "model": "postgres-inventory",
        "latency_ms": 85,
        "request_payload": {"item_id": 4492, "reserve": True},
        "response_payload": {"available": True, "location": "Warehouse-B4"}
    })

    # ==========================================
    # 2. TRIGGER DEADLOCKED MULTI-AGENT WORKFLOW
    # ==========================================
    print("\n--- Generating Deadlocked Multi-Agent Workflow ---")
    wf_deadlock_id = f"wf_deadlock_{uuid.uuid4().hex[:8]}"
    print(f"Workflow ID: {wf_deadlock_id}")

    # We want to construct a circular dependency deadlock loop:
    # Agent X (Trace A) -> Agent Y (Trace B) -> Agent X (Trace C)
    # Wait, let's make it direct Agent X (Trace A) -> Agent Y (Trace B) -> Agent X (Trace A) 
    # to form a direct cycle of Traces, or a path of coordinating agents where X -> Y -> X.
    
    trace_x_id = str(uuid.uuid4())
    span_x_id = str(uuid.uuid4())
    call_y_span_id = str(uuid.uuid4())

    trace_y_id = str(uuid.uuid4())
    span_y_id = str(uuid.uuid4())
    call_x_span_id = str(uuid.uuid4())

    # Trace A: Agent X
    print("Executing Agent X (waiting for Agent Y)...")
    sdk.track({
        "idempotency_key": span_x_id,
        "trace_id": trace_x_id,
        "parent_span_id": call_x_span_id, # Link back to Agent Y's call span (forming the circle!)
        "span_type": "agent",
        "span_name": "Agent X",
        "agent_id": "agent-x",
        "workflow_id": wf_deadlock_id,
        "provider": "openai",
        "model": "gpt-4o",
        "latency_ms": 5000, # Large latency representing hanging wait
        "error_message": "Deadlock Timeout: Circular wait identified. Blocked on agent-y.",
        "request_payload": {"msg": "Query state of resource Y"},
        "response_payload": {}
    })

    # Sub-span inside Agent X representing call to Agent Y
    sdk.track({
        "idempotency_key": call_y_span_id,
        "trace_id": trace_x_id,
        "parent_span_id": span_x_id,
        "span_type": "chain",
        "span_name": "Call Agent Y",
        "workflow_id": wf_deadlock_id,
        "provider": "internal",
        "model": "grpc-call",
        "latency_ms": 5000,
        "request_payload": {"request": "acquire_lock_y"},
        "response_payload": {}
    })

    # Trace B: Agent Y
    print("Executing Agent Y (waiting for Agent X)...")
    sdk.track({
        "idempotency_key": span_y_id,
        "trace_id": trace_y_id,
        "parent_span_id": call_y_span_id, # Link back to Agent X's call span
        "span_type": "agent",
        "span_name": "Agent Y",
        "agent_id": "agent-y",
        "workflow_id": wf_deadlock_id,
        "provider": "anthropic",
        "model": "claude-3-5-sonnet",
        "latency_ms": 5000,
        "error_message": "Deadlock Timeout: Circular wait identified. Blocked on agent-x.",
        "request_payload": {"msg": "Query state of resource X"},
        "response_payload": {}
    })

    # Sub-span inside Agent Y representing call to Agent X
    sdk.track({
        "idempotency_key": call_x_span_id,
        "trace_id": trace_y_id,
        "parent_span_id": span_y_id,
        "span_type": "chain",
        "span_name": "Call Agent X",
        "workflow_id": wf_deadlock_id,
        "provider": "internal",
        "model": "grpc-call",
        "latency_ms": 5000,
        "request_payload": {"request": "acquire_lock_x"},
        "response_payload": {}
    })

    print("\nTelemetry events submitted. Flushing...")
    time.sleep(2.0)
    sdk.close()
    print("Verification Script Done!")

if __name__ == "__main__":
    main()
