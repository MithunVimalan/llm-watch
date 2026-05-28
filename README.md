# GuiltTrip: The Multi-Agent Observability Engine Born Out of Founder Holiday Guilt

## Why Does This Exist? (The Founder's Confession)

This project is the direct result of holiday guilt. As a full-time semiconductor founder, taking a day off felt like a crime. The anxiety of "if you stop running, you fail" kicked in, leading to a state of holiday-induced depression. 

To break the loop and spike some dopamine before starting the work week, this project was built. It’s called **GuiltTrip** (abbreviated as `gt`). Because taking a trip is what caused the guilt, and tracing the execution "trips" of chaotic, recursive agentic loops is what solved it.

---

## What is GuiltTrip?

GuiltTrip is an observability and tracing engine built specifically for hierarchical, stateful, and multi-agent LLM architectures. 

### For the Noob (The 10-Second Pitch)
Imagine your AI agents are a group of hyperactive interns working on a project. They talk to each other, hand off tasks, write notes in shared folders, and sometimes get stuck waiting on each other forever. 
GuiltTrip is the security camera and manager. It lets you watch exactly who said what, when they said it, how much it cost you, and rings an alarm if two interns get stuck in a loop waiting on each other.

### For the 30-Year Veteran (The Architecture Breakdown)
Traditional APMs assume flat request-response workflows. GuiltTrip is designed for nested, stateful call graphs:
*   **Context Propagation**: It enforces parent-child span boundaries across distributed traces using a unified `workflow_id` and unique `Span` coordinates.
*   **Asynchronous Edge Ingestion**: Telemetry payloads are ingested via Edge Routes, authenticated via SHA-256 key matches, and written asynchronously using Next.js `after()` workers. Malformed payloads are routed to a Dead Letter Queue (DLQ).
*   **DFS Deadlock Detection**: A server-side depth-first search (DFS) algorithm traces cross-agent edges to identify circular waits (cycles) in real-time.
*   **State Snapshot Diffing**: Mutated variables are versioned, letting you view side-by-side recursive JSON diffs and dry-run fork replays.

---

## How It Works: The 10 Phases of GuiltTrip

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
