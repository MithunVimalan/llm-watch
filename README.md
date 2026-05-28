# LLMWatch: State-of-the-Art LLM Observability & Multi-Agent Tracing

Traditional application performance monitoring (APM) tools are built around linear, flat request-response cycles. These models fail when applied to complex, stateful, multi-agent LLM systems. When agents recursively invoke other agents, spawn intermediate tool calls, fork execution paths, or get stuck in circular wait deadlock loops, flat log viewers cannot provide the necessary context.

LLMWatch is a production-grade LLM observability platform engineered specifically for tracking, debugging, and profiling agentic runs. It provides developers with step-by-step trace replay capabilities, interactive execution DAG flow diagrams, context waste profiling, split-pane state mutation diffs, and distributed deadlock detection across agent execution boundaries.

---

## System Architecture

The LLMWatch platform is composed of five core architectural layers, designed for low latency, secure tenant isolation, and high availability.

### 1. Telemetry & SDK Layer
The Python and TypeScript SDKs intercept model execution pipelines. They wrap API calls (such as OpenAI completions), profiling duration, cost, and tokens.
*   **Span Hierarchy**: The SDK dynamically creates Span contexts using UUID v4. Spans carry parent-child mapping variables (`trace_id`, `parent_span_id`) which are automatically inherited by nested blocks (e.g. chains calling tools).
*   **Asynchronous Buffered Queue**: Telemetry events are queued locally and flushed in batches using thread-safe daemon worker threads. This prevents network latency overhead in the main application loop. It features exponential backoff retries (1s, 2s, capped at 8s) to handle network interruptions.
*   **Local Caching**: Deterministic hashing of prompt input keys is used to query remote caches, enabling zero-cost cache hit telemetry tracking.

### 2. Ingestion Backend
Built on Next.js Edge Routes, the ingestion API endpoint (/api/public/v1/events) accepts batched event arrays.
*   **Secure API Key Authentication**: Projects authenticate via incoming API keys, which are hashed using SHA-256 and matched against db keys to enforce tenant isolation and monthly usage quotas.
*   **Decoupled Processing**: Next.js `after()` execution context executes database writes, token pricing lookups, and anomaly detection checks asynchronously after the HTTP 202 Accepted response has been sent to the SDK.
*   **Dead Letter Queue (DLQ)**: Telemetry batches containing invalid structures or SQL insertion failures are captured and logged to the `ingestion_dead_letter` table for post-mortem debugging.

### 3. Data Storage Layer
Uses Neon Serverless PostgreSQL to store traces, spans, anomalies, projects, and api keys.
*   **Schema Design**: The database schema uses relational constraints, cascades, and composite indexes to query complex nested hierarchies.
*   **Full-Text Search Indexing**: Request and response payloads are indexed via a PostgreSQL GIN index, enabling full-text searches across raw JSON telemetry fields using `websearch_to_tsquery`.

### 4. Background Anomaly Scanner
A background post-ingestion scanner analyzes incoming traces in real-time. It flags traces matching specific anomaly signatures:
*   **Cost Explosions**: Total trace cost exceeding 0.10 USD.
*   **Recursive Loops**: Duplicate tool or chain spans appearing more than 5 times in a single trace, indicating loop failures.
*   **Retry Storms**: Repeated failed calls to external APIs or databases.
*   **Latency Outliers**: Active LLM execution spans exceeding 2000ms and 3x the project average.

### 5. Web Inspection Interface
Built with Next.js Server Components, Client Components, and Server Actions.
*   **Direct Server Actions**: Actions handle database queries with user authentication and workspace authorization checks.
*   **SVG Rendering Canvas**: Custom SVG coordinates math dynamically positions nodes horizontally in execution DAGs and workflow dependency maps, drawing animated data flow lines and curved edges.
*   **Recursive Diff trees**: Client-side tree algorithms compare nested JSON configurations, highlighting added, removed, or changed values.

---

## Development Phases

LLMWatch was developed in ten sequential phases to ensure structural stability:

*   **Phase 1: Basic Tracing & Cost Profiling Core**: Nested span telemetry schema, Cost-per-1k-tokens mapping across different LLM providers (OpenAI, Anthropic, etc.), and duration tracking.
*   **Phase 2: Project Management & API Authentication**: Multi-project database isolation, secure key validation using SHA-256 key hashing, and tenant usage quota enforcement.
*   **Phase 3: Real-Time Ingestion Backend**: Bulk event handler API routes, database schema migrations, and local/production environment setups.
*   **Phase 4: Inspection Dashboard & Tree Inspector**: Next.js dashboard layout, interactive tree viewer showing span execution hierarchy, and full-text JSON payload search.
*   **Phase 5: Step-Through Replay Engine**: Sequence order indexing on spans, timeline playback slider controls, and intermediate agent reasoning extraction.
*   **Phase 6: Interactive Execution DAG & Latency Flamegraphs**: Relative timeline flamegraph offsets, canvas grid coordinates logic, and animated SVG flow paths.
*   **Phase 7: Context Flow & RAG Optimization**: HSL-mapped token source charts, cumulative growth line charts, and context-waste optimization thresholds.
*   **Phase 8: Anomaly Scanners & Alerts**: Real-time scanners run post-ingestion inside `after()` hooks, flagging infinite loops, cost outliers, and retry storms.
*   **Phase 9: State Snapshot Timeline & Compare Diff Inspector**: Split-pane JSON recursive diff trees, state mutations timeline, and fork checkpoint simulation command builders.
*   **Phase 10: Multi-Agent Correlation & Deadlock Detection**: Distributed workflow correlation using a `workflow_id` context, SVG agent dependency graphs, and server-side DFS cycle-detection path builders to isolate deadlocks.

---

## System Requirements & Local Setup

### Prerequisites
*   Node.js (v18 or higher)
*   PostgreSQL Database (Neon Serverless Postgres recommended)
*   Python (v3.8 or higher) for verification script execution

### Local Installation

1. Clone the repository and install npm packages:
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

3. Run database migrations to build tables, columns, indexes, and seed records:
   ```bash
   node migrate-local.js
   ```

4. Start the local Next.js development server:
   ```bash
   npm run dev
   ```
   Open http://localhost:3000 to access the dashboard.

---

## Verification & Seeding

We have provided several Python scripts in the root directory to generate trace data and test specific features. Run them to seed your database:

*   **State Snapshots & Replays**:
    ```bash
    python test-replay.py
    ```
*   **Token Flow & Waste Profiles**:
    ```bash
    python test-token-flow.py
    ```
*   **Loop & Cost Anomalies**:
    ```bash
    python test-anomalies.py
    ```
*   **Coordinated Agents & Deadlocks**:
    ```bash
    python test-multi-agent.py
    ```

---

## Production Deployment Guide

Deploy LLMWatch to a production server in under five minutes using the Vercel CLI.

### Prerequisites
1.  A Vercel account.
2.  A production PostgreSQL instance.
3.  Vercel CLI installed globally (`npm install -g vercel`).

### Deployment Steps

1.  Log in to Vercel and link your repository:
    ```bash
    vercel login
    vercel link
    ```
2.  Add production environment variables:
    ```bash
    vercel env add DATABASE_URL
    vercel env add CRON_SECRET
    ```
3.  Run migrations on your production database. Edit your local `DATABASE_URL` temporarily to point to the production database and run:
    ```bash
    node migrate-local.js
    ```
4.  Compile and deploy your production build:
    ```bash
    vercel --prod
    ```
    This command outputs your live dashboard URL (e.g. `https://llmwatch.vercel.app`). Update your SDK endpoints to target `https://your-domain.vercel.app/api/public/v1/events`.
