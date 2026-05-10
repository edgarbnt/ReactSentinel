# Examples

Sample React applications demonstrating React-Sentinel's capabilities.

Each example is a self-contained app designed to trigger a specific class of bug
that React-Sentinel can detect and help fix.

## Available fixtures

| Directory or URL | Bug demonstrated |
|---|---|
| `test-app` | Multi-scenario React demo app used by the smoke runner |
| `test-app/hydration-nextjs.html` | Next.js-style server/client hydration divergence |

## Planned examples

| Directory | Bug demonstrated |
|---|---|
| `infinite-loop/` | `useEffect` with an unstable dependency causing an infinite render loop |
| `race-condition/` | Multiple concurrent API calls creating inconsistent UI state |
| `hydration-mismatch/` | Next.js server/client rendering divergence |
| `stale-closure/` | Event handler capturing a stale value from a previous render |

## Running an example

```bash
cd examples/<example-name>
pnpm install
pnpm dev
```

Then point React-Sentinel at `http://localhost:3000` and use the MCP tools
to inspect and debug the running application.
