# Examples

Sample React applications demonstrating React-Sentinel's capabilities.

Each example is a self-contained app designed to trigger a specific class of bug
that React-Sentinel can detect and help fix.

## Available fixtures

| Directory or URL | What it demonstrates |
|---|---|
| `test-app` | Main MVP demo app used by the smoke runner |
| `test-app` - Simple React Example | Parent/child props, local state, and visible interactions |
| `test-app` - Console Error Example | Deterministic `console.error` + thrown exception from a user action |
| `test-app` - API Mock Scenario | Deterministic 200 and 500 network responses |
| `test-app` - Diagnosis Benchmark | A generic UI error hiding a backend failure |
| `test-app` - Race Condition Benchmark | A stale slower response overwriting a newer intent |
| `test-app` - Render Loop Benchmark | A controlled infinite-render style effect loop |
| `test-app/hydration-nextjs.html` | Next.js-style server/client hydration divergence |

## Running an example

```bash
cd examples/test-app
pnpm install
pnpm dev
```

Then point React-Sentinel at `http://localhost:5173` and use the MCP tools to inspect and debug the running application.

For hydration-specific diagnostics, open `http://localhost:5173/hydration-nextjs.html`.

See [../docs/local-ports.md](../docs/local-ports.md) for the full list of documented local ports and endpoints used by the repo.
