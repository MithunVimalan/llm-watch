# LLMWatch: State-of-the-Art LLM Observability & Multi-Agent Tracing

Standard tracing platforms are great for flat API calls, but they fall apart when you're building complex, stateful, multi-agent systems. When agents start calling other agents, spawning tools, fork-executing prompt runs, or getting stuck in recursive deadlock loops, you need more than just a list of request logs. 

We built **LLMWatch** to give developers complete, step-by-step visibility into agentic runs. It’s a production-grade LLM observability platform featuring step-by-step trace replay, execution DAG flow diagrams, context waste alerts, state mutation diffs, and circular wait deadlock detection.

---

## 🛠️ The 10 Phases of LLMWatch

We built LLMWatch iteratively, layer-by-layer, to ensure reliability at scale. Here’s a map of how the platform evolved:

### 1. Phase 1: Core Tracing & Profiling Setup
The foundation. We designed the nested trace structure (`spans`), calculated relative latencies, and wrote cost-estimation models to parse prompt and completion weights across different providers.

### 2. Phase 2: Multi-Project & Secure Key Auth
Built project-isolation layers. We implemented API key management, hashing incoming keys using secure SHA-256 signatures, and isolating trace event streams between multiple teams and environments.

### 3. Phase 3: Bulk Event Ingestion Route
Constructed a high-throughput, bulk-event POST API route. We implemented DB schema migrations and a fallback Dead Letter Queue (DLQ) to isolate and inspect malformed telemetry payloads without interrupting ingestion.

### 4. Phase 4: Basic Tracing Dashboard
Created our responsive dark-mode Next.js UI. Features include an interactive nested tree inspector, full-text search indexing across raw request/response JSON payloads, and aggregate cost charts.

### 5. Phase 6: Interactive Execution DAG & Latency Flamegraphs
Replaced static logs with visual execution maps. We drew SVG graphs with animated, pulsing data flow lines and timeline offset heatmaps to highlight long-running tasks. *(Wait, why is Phase 6 here? It naturally pairs with the UI visualization layer!)*

### 6. Phase 5: Trace Replay Engine
Built a step-by-step trace player. Developers can pause, play, or drag a timeline slider to reconstruct execution sequences exactly as they happened in production.

### 7. Phase 7: Token Flow & RAG Optimization
Added Cumulative Token Growth charts and HSL source-distribution bars. It alerts you when massive prompts result in tiny outputs (Context Waste) so you can optimize RAG retrievals.

### 8. Phase 8: Real-Time Anomaly Scanners
Automated quality guardrails. Using Next.js `after()` workers, the backend scans ingested traces for anomalies: Cost Explosions (> $0.10), Infinite Loops (> 5 duplicate calls), Retry Storms, and Latency Outliers.

### 9. Phase 9: State Snapshot Timeline & Diff Inspector
Added split-pane JSON diffing to trace how agent memory mutated over time. Includes a "Fork Checkpoint" modal containing cURL commands and Python SDK snippets to instantly test and simulate code changes at any specific run step.

### 10. Phase 10: Multi-Agent Correlation & Deadlock Detection
Links coordinating traces across agent boundaries using a single `workflow_id`. Draws an SVG agent dependency graph and detects circular wait loops (Deadlocks), highlighting the cycle in a glowing, animated red path.

---

## 🚀 How to Run LLMWatch Locally

Setting up LLMWatch is straightforward. You'll need:
*   **Node.js** (v18+)
*   **PostgreSQL Database** (We highly recommend [Neon Serverless Postgres](https://neon.tech/))
*   **Python** (v3.8+) for running verification test scripts

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/MithunVimalan/llm-watch.git
cd llm-watch
npm install
```

### 2. Configure Environment
Create a `.env.local` file in the project root:
```env
DATABASE_URL="postgresql://user:pass@ep-host.pooler.region.neon.tech/dbname?sslmode=require"
MOCK_AUTH="true"
CRON_SECRET="your-cron-auth-secret-key"
```

### 3. Run Database Migrations
Run our schema migrator to build tables, columns, indexes, and seeded project profiles:
```bash
node migrate-local.js
```

### 4. Start LLMWatch Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser. You can immediately access the dashboard without login setup (thanks to `MOCK_AUTH=true`).

---

## 🧪 Seeding & Verification Scripts

We've written Python scripts to seed the database and simulate production environments. Run these in separate terminals to populate your dashboard with data:

*   **Trace Replays & Timelines**:
    ```bash
    python test-replay.py
    ```
*   **Token Flow & Waste Profiles**:
    ```bash
    python test-token-flow.py
    ```
*   **Anomalies & Recursive Loops**:
    ```bash
    python test-anomalies.py
    ```
*   **Coordinated Agents & Deadlock Cycles**:
    ```bash
    python test-multi-agent.py
    ```

---

## 🌍 Production Deployment Guide

Deploying LLMWatch to production takes under five minutes.

### What You'll Need
1.  A Vercel account.
2.  A production PostgreSQL instance (Neon is perfect because of its serverless scale).
3.  Vercel CLI installed on your machine (`npm install -g vercel`).

### Deployment Steps (CMD / Terminal)

1.  **Log in to Vercel**:
    ```bash
    vercel login
    ```
2.  **Link your project**:
    ```bash
    vercel link
    ```
    Select your scope and choose "Yes" to link to the existing project.
3.  **Add environment variables on Vercel**:
    ```bash
    vercel env add DATABASE_URL
    vercel env add CRON_SECRET
    ```
    *Ensure you input your production PostgreSQL string for `DATABASE_URL`.*
4.  **Run production migration**:
    To initialize your production DB, edit your connection string locally to target production temporarily and run:
    ```bash
    node migrate-local.js
    ```
5.  **Build and Deploy**:
    Deploy directly to Vercel production:
    ```bash
    vercel --prod
    ```

Vercel will output a live URL (e.g., `https://llmwatch.vercel.app`). Update your SDK endpoints to point to `https://your-domain.vercel.app/api/public/v1/events` and you're good to go!
