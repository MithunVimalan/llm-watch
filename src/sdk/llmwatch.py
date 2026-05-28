# src/sdk/llmwatch.py
import json
import time
import uuid
import hashlib
import threading
import queue
import atexit
import urllib.request
import urllib.error

class Span:
    def __init__(self, sdk, name, span_type="llm", trace_id=None, parent_span_id=None, execution_counter=None):
        self.sdk = sdk
        self.name = name
        self.type = span_type
        self.id = str(uuid.uuid4())
        self.trace_id = trace_id or str(uuid.uuid4())
        self.parent_span_id = parent_span_id
        self.start_time = time.time()
        self.ended = False
        self._state_snapshot = None
        self._reasoning_text = None
        self._duration_breakdown = None
        self._token_breakdown = None
        self._context_window_used = None
        self._context_window_max = None

        if execution_counter is None:
            self.execution_counter = [0]
        else:
            self.execution_counter = execution_counter
        
        self.execution_order = self.execution_counter[0]
        self.execution_counter[0] += 1

    def span(self, name, span_type="llm"):
        return Span(self.sdk, name, span_type=span_type, trace_id=self.trace_id, parent_span_id=self.id, execution_counter=self.execution_counter)

    def capture_state(self, state_dict):
        self._state_snapshot = state_dict
        return self

    def reasoning(self, text):
        self._reasoning_text = text
        return self

    def duration_breakdown(self, breakdown):
        self._duration_breakdown = breakdown
        return self

    def token_breakdown(self, breakdown):
        self._token_breakdown = breakdown
        return self

    def context_window(self, used, max_tokens=None):
        self._context_window_used = used
        self._context_window_max = max_tokens
        return self

    def track(self, **data):
        event = {
            "idempotency_key": self.id,
            "trace_id": self.trace_id,
            "parent_span_id": self.parent_span_id,
            "span_type": self.type,
            "span_name": self.name,
            "provider": data.get("provider", "unknown"),
            "model": data.get("model", "unknown"),
            "execution_order": self.execution_order,
        }
        if self._state_snapshot is not None:
            event["state_snapshot"] = self._state_snapshot
        if self._reasoning_text is not None:
            event["reasoning_text"] = self._reasoning_text
        if self._duration_breakdown is not None:
            event["duration_breakdown"] = self._duration_breakdown
        if self._token_breakdown is not None:
            event["token_breakdown"] = self._token_breakdown
        if self._context_window_used is not None:
            event["context_window_used"] = self._context_window_used
        if self._context_window_max is not None:
            event["context_window_max"] = self._context_window_max

        event.update(data)
        self.sdk.track(event)

    def end(self, **data):
        if not self.ended:
            self.ended = True
            latency_ms = int((time.time() - self.start_time) * 1000)
            data["latency_ms"] = latency_ms
            self.track(**data)

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        error_message = None
        if exc_type is not None:
            error_message = f"{exc_type.__name__}: {str(exc_val)}"
        
        if error_message:
            self.end(error_message=error_message)
        else:
            self.end()
        return False

class LLMWatch:
    def __init__(self, api_key, endpoint=None, flush_interval_ms=5000, max_batch_size=100):
        self.api_key = api_key
        self.endpoint = endpoint or "http://localhost:3000/api/public/v1/events"
        self.flush_interval_seconds = flush_interval_ms / 1000.0
        self.max_batch_size = max_batch_size
        
        self.queue = queue.Queue()
        self.running = True
        
        # Background worker thread for non-blocking flushes
        self.worker_thread = threading.Thread(target=self._worker, daemon=True)
        self.worker_thread.start()
        
        # Ensure queue drains cleanly on process shutdown
        atexit.register(self.close)

    def trace(self, name, span_type="agent", trace_id=None):
        """Create a root tracking trace (returns a Span)."""
        return Span(self, name, span_type=span_type, trace_id=trace_id, parent_span_id=None)

    def track(self, event):
        """Track custom telemetry events."""
        if not isinstance(event, dict):
            return
            
        if "idempotency_key" not in event:
            event["idempotency_key"] = str(uuid.uuid4())
            
        self.queue.put(event)
        
        if self.queue.qsize() >= self.max_batch_size:
            # Trigger quick background flush (non-blocking thread notification)
            pass

    def _worker(self):
        last_flush_time = time.time()
        while self.running:
            try:
                # Wait for items or flush timeout
                time_elapsed = time.time() - last_flush_time
                wait_timeout = max(0.1, self.flush_interval_seconds - time_elapsed)
                
                try:
                    event = self.queue.get(timeout=wait_timeout)
                    self.queue.task_done()
                except queue.Empty:
                    event = None

                # Flush if max batch size reached, or interval timer expired
                if self.queue.qsize() >= self.max_batch_size or (time.time() - last_flush_time >= self.flush_interval_seconds):
                    self.flush()
                    last_flush_time = time.time()
            except Exception as e:
                print(f"[LLMWatch] Internal worker exception: {e}")

    def flush(self):
        """Drains the buffer and posts events in batches with exponential backoff retries."""
        batch = []
        while not self.queue.empty() and len(batch) < self.max_batch_size:
            try:
                batch.append(self.queue.get_nowait())
                self.queue.task_done()
            except queue.Empty:
                break

        if not batch:
            return

        attempts = 0
        while attempts < 3:
            try:
                req = urllib.request.Request(
                    self.endpoint,
                    data=json.dumps(batch).encode("utf-8"),
                    headers={
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer {self.api_key}"
                    },
                    method="POST"
                )
                
                with urllib.request.urlopen(req, timeout=8) as response:
                    if response.status == 202 or (400 <= response.status < 500):
                        break # Success or client-side failure (don't retry 4xx errors)
            except urllib.error.HTTPError as e:
                if 400 <= e.code < 500:
                    break # Client error - do not retry
            except Exception:
                pass # Network error - retry
                
            attempts += 1
            if attempts < 3:
                delay = min(1.0 * (2 ** (attempts - 1)), 8.0)
                time.sleep(delay)

    def close(self):
        """Flushes remaining items and stops the background thread gracefully."""
        if self.running:
            self.running = False
            # Drain whatever is left
            limit = 100
            while not self.queue.empty() and limit > 0:
                self.flush()
                limit -= 1

    def _generate_cache_key(self, params):
        # Sort prompt dictionary keys recursively for deterministic hash signature
        payload_str = json.dumps(params, sort_keys=True)
        return hashlib.sha256(payload_str.encode("utf-8")).hexdigest()

    def wrap_openai(self, openai_client, enable_cache=False, cache_ttl=86400):
        """Monkeypatches the OpenAI client completions call to intercept cache and track telemetry."""
        original_create = openai_client.chat.completions.create
        cache_endpoint = self.endpoint.replace("/events", "/cache")

        def wrapped_create(*args, **kwargs):
            start_time = time.time()
            idempotency_key = str(uuid.uuid4())
            
            # Extract prompt messages
            messages = kwargs.get("messages", [])
            prompt_hash = hashlib.sha256(json.dumps(messages).encode("utf-8")).hexdigest()
            model = kwargs.get("model", "unknown")
            is_stream = kwargs.get("stream", False)
            
            cache_key = ""
            if enable_cache and not is_stream:
                cache_key = self._generate_cache_key(kwargs)
                try:
                    # Query cache hit
                    req_url = f"{cache_endpoint}?key={cache_key}"
                    req = urllib.request.Request(
                        req_url,
                        headers={"Authorization": f"Bearer {self.api_key}"},
                        method="GET"
                    )
                    with urllib.request.urlopen(req, timeout=3) as res:
                        cache_data = json.loads(res.read().decode("utf-8"))
                        if cache_data.get("hit"):
                            # Log zero-cost cache hit telemetry
                            latency_ms = int((time.time() - start_time) * 1000)
                            self.track({
                                "idempotency_key": idempotency_key,
                                "provider": "openai",
                                "model": model,
                                "prompt_hash": prompt_hash,
                                "latency_ms": latency_ms,
                                "is_cached": True,
                                "cost_usd": 0.0,
                                "request_payload": kwargs,
                                "response_payload": cache_data["data"]
                            })
                            
                            # Reconstruct mock class mimicking OpenAI response
                            return _mock_openai_response(cache_data["data"])
                except Exception as e:
                    print(f"[LLMWatch] Caching lookup bypassed due to error: {e}")

            # Execute real OpenAI call on cache miss
            try:
                response = original_create(*args, **kwargs)
                
                if not is_stream:
                    latency_ms = int((time.time() - start_time) * 1000)
                    # Convert response to dictionary representation
                    res_dict = _openai_response_to_dict(response)
                    
                    self.track({
                        "idempotency_key": idempotency_key,
                        "provider": "openai",
                        "model": res_dict.get("model", model),
                        "prompt_hash": prompt_hash,
                        "prompt_tokens": res_dict.get("usage", {}).get("prompt_tokens", 0),
                        "completion_tokens": res_dict.get("usage", {}).get("completion_tokens", 0),
                        "latency_ms": latency_ms,
                        "is_cached": False,
                        "request_payload": kwargs,
                        "response_payload": res_dict
                    })

                    # Write response back to cache asynchronously
                    if enable_cache and cache_key:
                        def async_write():
                            try:
                                post_req = urllib.request.Request(
                                    cache_endpoint,
                                    data=json.dumps({
                                        "cacheKey": cache_key,
                                        "provider": "openai",
                                        "model": model,
                                        "payload": res_dict,
                                        "ttlSeconds": cache_ttl
                                    }).encode("utf-8"),
                                    headers={
                                        "Content-Type": "application/json",
                                        "Authorization": f"Bearer {self.api_key}"
                                    },
                                    method="POST"
                                )
                                with urllib.request.urlopen(post_req, timeout=3) as write_res:
                                    pass
                            except Exception:
                                pass # Silently ignore cache write failures
                                
                        threading.Thread(target=async_write, daemon=True).start()

                return response
            except Exception as error:
                latency_ms = int((time.time() - start_time) * 1000)
                self.track({
                    "idempotency_key": idempotency_key,
                    "provider": "openai",
                    "model": model,
                    "prompt_hash": prompt_hash,
                    "latency_ms": latency_ms,
                    "error_message": getattr(error, "message", str(error)),
                    "request_payload": kwargs
                })
                raise error

        openai_client.chat.completions.create = wrapped_create
        return openai_client

# Helper functions to convert between dictionary models and OpenAI class definitions
def _openai_response_to_dict(response):
    if hasattr(response, "model_dump"):
        return response.model_dump()
    elif hasattr(response, "__dict__"):
        # Fallback for dict structures
        return json.loads(json.dumps(response, default=lambda o: o.__dict__))
    return response

def _mock_openai_response(data):
    # Simple recursive object wrapper matching dot-notation expectations of OpenAI SDK client response
    class OpenAIObject:
        def __init__(self, d):
            for k, v in d.items():
                if isinstance(v, dict):
                    setattr(self, k, OpenAIObject(v))
                elif isinstance(v, list):
                    setattr(self, k, [OpenAIObject(i) if isinstance(i, dict) else i for i in v])
                else:
                    setattr(self, k, v)
        
        def model_dump(self):
            return data
            
    return OpenAIObject(data)
