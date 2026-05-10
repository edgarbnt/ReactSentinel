# Local ports and endpoints

These local URLs and ports are legitimate examples used by React-Sentinel for development, smoke tests, and attach-mode guidance.

## Default values

| Port / URL | Purpose | Source |
|---|---|---|
| `http://127.0.0.1:5173` | Main demo app dev server | `examples/test-app/package.json`, `scripts/mcp-e2e-utils.ts` |
| `http://localhost:5173` | Equivalent localhost form used in examples and tool descriptions | `examples/README.md`, `src/tools/diagnostics.ts`, `src/tools/browser.ts` |
| `http://127.0.0.1:5173/hydration-nextjs.html` | Hydration mismatch fixture | `docs/scenarios/hydration-mismatch.md`, `scripts/e2e-smoke.ts` |
| `http://localhost:5176/` | Validation-loop scenario example | `docs/scenarios/validation-loop.md` |
| `http://127.0.0.1:3000` | Common fallback suggestion for Next.js-style local apps | `src/index.ts`, `src/project-detection.ts` |
| `http://127.0.0.1:9222` | Default Chrome CDP endpoint for attach mode | `src/browser/index.ts` |
| `http://127.0.0.1:9333` | Alternate CDP endpoint example | `docs/release-mvp.md` |

## Why these values stay in the repo

- They are **local development examples**, not production endpoints.
- They make the attach and replay workflows reproducible for new users.
- They are used by docs, project detection hints, and the smoke tooling.

## Guidance

- Prefer `127.0.0.1` in deterministic examples when you want to avoid localhost-resolution ambiguity.
- Keep `localhost` examples where they are more familiar to end users.
- If you change one of these defaults, update this file, the relevant docs, and the example app scripts together.
