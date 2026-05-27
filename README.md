# LLMWatch Observability Platform

LLMWatch is a production-grade LLM observability platform designed for tracking, monitoring, and debugging LLM application chains, agents, and prompts. It supports parent-child nested tracing (spans), latency profiling, token usage/cost estimation, and caching analysis.

## Features

- **Hierarchical Tracing & Spans**: Visualize complex agentic runs and nested tool calls in a clean, interactive tree structure.
- **Latency & Performance Profiling**: Drill down into exact runtimes and pinpoint bottlenecks.
- **Token & Cost Tracking**: Estimate prompt, completion, and total costs across different models.
- **Developer-Friendly SDKs**: Support for both Python (context managers) and TypeScript (builder pattern).
- **Beautiful Dashboard**: Built with Next.js, featuring dark-mode styling, rich charts, and responsive layouts.

## Getting Started

### Prerequisites

- Node.js v18+
- PostgreSQL database (e.g. Neon Serverless Postgres)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/MithunVimalan/llm-watch.git
   cd llm-watch
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables in `.env.local`:
   ```env
   DATABASE_URL="your-postgresql-connection-string"
   MOCK_AUTH="true"
   CRON_SECRET="your-secret-cron-key"
   ```

4. Run the database migration:
   ```bash
   node migrate-local.js
   ```

5. Start the development server:
   ```bash
   npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000) to view the dashboard.

## SDK Usage

### Python SDK
```python
from sdk.llmwatch import LLMWatch

sdk = LLMWatch(api_key="your-api-key", project_id="your-project-id")

with sdk.trace("Agent Main Run") as trace:
    with trace.span("Database Query", span_type="tool") as db_span:
        # Perform DB operation...
        db_span.track(response_payload={"rows": 4})
```

### TypeScript SDK
```typescript
import { LLMWatch } from "@/sdk/llmwatch";

const sdk = new LLMWatch({ apiKey: "your-api-key", projectId: "your-project-id" });

const trace = sdk.trace("Agent Main Run");
const dbSpan = trace.span("Database Query", { spanType: "tool" });

// Perform DB operation...
dbSpan.end({ responsePayload: { rows: 4 } });
trace.end();
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
