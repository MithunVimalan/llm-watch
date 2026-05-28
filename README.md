# GuiltTrip: The Multi-Agent Observability Engine Born Out of Founder Holiday Guilt

## Why Does This Exist? (The Founder's Confession)

This project is the direct result of holiday guilt. As a full-time semiconductor founder, taking a day off felt like a crime. The anxiety of "if you stop running, you fail" kicked in, leading to a state of holiday-induced depression. 

To break the loop and spike some dopamine before starting the work week, this project was built. It’s called **GuiltTrip** (abbreviated as `gt`). Because taking a trip is what caused the guilt, and tracing the execution "trips" of chaotic, recursive agentic loops is what solved it.

---

## Conceptual Overview

GuiltTrip is an observability and tracing engine built specifically for hierarchical, stateful, and multi-agent LLM architectures. 

When building agentic applications, AI agents act as independent entities that communicate, delegate tasks, execute tool calls, and access external databases. Because these chains run asynchronously and recursively, developers often struggle to understand the exact sequence of events, token usage, and latencies. 

GuiltTrip provides complete visibility into these runs. It acts as an inspection layer, tracking the flow of data between coordinating agents, profiling run times and costs, and automatically alerting you if agents enter recursive waiting loops.

---

## Detailed System Architecture

The GuiltTrip platform is engineered using a decoupled, five-tier architecture designed to support high-throughput telemetry ingestion, low-overhead tracing, and visual execution mapping.

```
+-------------------------------------------------------------+
|                     Telemetry SDK Layer                     |
|           (Python context / TypeScript builders)            |
+------------------------------+------------------------------+
                               |
                   HTTP POST   | (Asynchronous Queue Buffer)
                               v
+-------------------------------------------------------------+
|                    Edge Ingestion Gateway                   |
|         (API Auth / Payload Validation / Edge API)          |
+------------------------------+------------------------------+
                               |
            Next.js after()    | (Decoupled Background Task)
                               v
+-------------------------------------------------------------+
|                    Database & Storage Layer                 |
|             (Neon Serverless Postgres / Indexing)           |
+------------------------------+------------------------------+
            |                  |                  |
            |                  |                  |
            v                  v                  v
+---------------+      +---------------+      +---------------+
|    Traces &   |      |   Anomalies   |      |  Dead Letter  |
|  Spans Tables |      |  Alerts Table |      |  Queue (DLQ)  |
+---------------+      +---------------+      +---------------+
            ^                  ^                  ^
            |                  |                  |
            +------------------+------------------+
                               |
                               | (Server Actions / Direct Queries)
                               v
+-------------------------------------------------------------+
|                 Web Inspection UI & Dashboard               |
|       (Visual SVG DAGs / Flamegraphs / State diff panels)    |
+-------------------------------------------------------------+
```

### 1. Telemetry SDK Layer (Python & TypeScript)
The SDKs provide lightweight instrumentation APIs to wrap agent execution paths.
*   **Hierarchical Span Telemetry**: Spans are initialized using context managers in Python (`with sdk.trace()`) or builders in TypeScript. Each span is assigned a unique UUID v4. Spans carry context propagation variables (`trace_id`, `parent_span_id`) which are automatically inherited by sub-spans to form execution trees.
*   **Non-Blocking Daemon Queue**: Telemetry events are buffered in an in-memory queue and processed by a daemon worker thread. This ensures that network calls to the ingestion API do not block the main application thread.
*   **Exponential Backoff Retries**: If network requests fail, the SDK retry mechanism attempts redelivery up to 3 times, scaling delays exponentially (1s, 2s, capped at 8s) to tolerate transient network issues.
*   **Input Key Hashing**: Request payloads are recursively hashed to create deterministic cache keys. The SDK queries the remote cache to identify cache hits, which are logged as zero-cost, low-latency telemetry events.

### 2. Edge Ingestion Gateway
The edge API endpoint (`/api/public/v1/events`) acts as the entry point for telemetry data.
*   **Cryptographic Key Verification**: Inbound bearer tokens are processed using a secure SHA-256 hashing function (`hashIncomingKey`). The hash is compared against the database to authenticate the request, check tenant isolation bounds, and enforce monthly project quota limits.
*   **Payload Validation**: Batch payloads are validated against the event schema. Batches containing structural errors are immediately isolated and sent to the database Dead Letter Queue (DLQ) to prevent database exceptions.
*   **Asynchronous Processing Context**: The gateway responds to the SDK immediately with an HTTP 202 Accepted status. Database insertions, pricing catalog matching, and anomaly checks are executed asynchronously inside Next.js `after()` handlers.

### 3. Relational Storage Layer
The database layer is hosted on Neon Serverless PostgreSQL and is optimized for tree-query traversals and search performance.
*   **Schema Constraints**: Spans are stored in the `events` table, which supports indexing across `trace_id` and `parent_span_id` columns. Foreign key constraints enforce referential integrity with cascading updates and deletions.
*   **GIN Full-Text Indexes**: Raw request and response payloads are indexed via a PostgreSQL GIN index. This index supports rapid full-text search queries across JSON properties using `websearch_to_tsquery`.
*   **Dead Letter Queue (DLQ)**: The `ingestion_dead_letter` table isolates malformed payloads, keeping the main telemetry database clean.

### 4. Background Anomaly Scanner
As soon as a batch of events is ingested, the background scanner analyzes trace timelines and hierarchies.
*   **Recursive Loop Detection**: The scanner traverses trace nodes and flags instances where duplicate chains or tool calls exceed 5 occurrences, indicating infinite loops.
*   **Cost & Latency Outliers**: Spans are compared against project averages. Spans exceeding 2000ms and 3x the average latency, or total trace costs exceeding 0.10 USD, trigger alert logging to the `anomalies` table.
*   **Live Layout Synchronization**: Real-time anomalies update database state, synchronizing the active anomalies count badges across user dashboards.

### 5. Web Inspection UI & Dashboard
The dashboard interface is built using Next.js Server Components and interactive client-side React panels.
*   **Direct Server Actions**: Queries are handled by authenticated Server Actions, which check user credentials and workspace authorization before executing database queries.
*   **Dynamic SVG Layout Coordinate Algorithms**: The system maps span execution order and dependency relationships to coordinate grids. It draws SVG charts, visual timeline heatmaps (flamegraphs), and curved edge pathways with animated flow markers.
*   **Split-Pane Diff Viewer**: State snapshot checkpoints are rendered side-by-side. A recursive tree comparison algorithm compares nested JSON values, styling added keys green, removed keys red, and mutated keys yellow.

---

## The 10 Phases of GuiltTrip

The platform was built in ten iterative phases:

*   **Phase 1: Spans & Latency Profiling**: Designed the hierarchical database schema and cost parsing algorithms across AI providers.
*   **Phase 2: Tenant Isolation**: Secure API key authentication using SHA-256 signatures and monthly usage quota limits.
*   **Phase 3: Event Ingestion & DLQ**: A bulk-event Edge handler route with a database Dead Letter Queue (DLQ) for malformed payloads.
*   **Phase 4: Inspection Dashboard**: Responsive dark-mode interface with a nested tree viewer and GIN-indexed full-text JSON search.
*   **Phase 5: Playback Replay Engine**: Sequence order tracking with interactive slider controls to step through execution logs.
*   **Phase 6: SVG DAG & Latency Flamegraphs**: Visualizing execution paths using dynamic SVGs and heatmaps.
*   **Phase 7: Token Flow & RAG Profiling**: Token distribution flow charts and context-waste highlights (e.g. huge prompts yielding 2-word outputs).
*   **Phase 8: Post-Ingestion Anomaly Scanners**: Background scanners check for loops (> 5 duplicate runs), cost outliers, and retry storms.
*   **Phase 9: State Diff Timeline**: Side-by-side JSON diffs comparing trace check-points, with fork replay simulators.
*   **Phase 10: Multi-Agent Correlation & Deadlock Finder**: Grouping cross-trace agents, plotting agent dependency graphs, and highlighting circular loops in glowing red.

---

## Local Setup

### Prerequisites
*   Node.js (v18 or higher)
*   PostgreSQL (Neon Serverless Postgres recommended)
*   Python (v3.8 or higher) for verification seeding

### Installation & Run

1. Clone and install packages:
   ```bash
   git clone https://github.com/MithunVimalan/llm-watch.git
   cd llm-watch
   npm install
   ```

2. Create a `.env.local` file in the project root:
   ```env
   DATABASE_URL="postgresql://user:pass@ep-host.pooler.region.neon.tech/dbname?sslmode=require"
   MOCK_AUTH="true"
   CRON_SECRET="your-cron-auth-secret-key"
   ```

3. Run database migrations:
   ```bash
   node migrate-local.js
   ```

4. Start the Next.js development server:
   ```bash
   npm run dev
   ```
   Open http://localhost:3000 to access the dashboard.

---

## Verification & Seeding

Run the Python scripts in the root directory to populate your database with workflow and deadlock data:

*   **State Replays**: `python test-replay.py`
*   **Token Flow**: `python test-token-flow.py`
*   **Anomalies**: `python test-anomalies.py`
*   **Multi-Agent Deadlocks**: `python test-multi-agent.py`

---

## Production Deployment

### Prerequisites
*   Vercel CLI installed globally (`npm install -g vercel`).
*   A remote PostgreSQL database.

### Deployment Commands

1. Link your repository to Vercel:
   ```bash
   vercel login
   vercel link
   ```
2. Configure remote environment variables:
   ```bash
   vercel env add DATABASE_URL
   vercel env add CRON_SECRET
   ```
3. Run migrations on your production database (temporarily configure your local env `DATABASE_URL` to point to production and run `node migrate-local.js`).
4. Build and deploy to production:
   ```bash
   vercel --prod
   ```
   Update your SDK endpoints to target `https://your-domain.vercel.app/api/public/v1/events`.
