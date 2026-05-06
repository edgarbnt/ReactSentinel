# React-Sentinel

> An MCP server that gives AI agents eyes inside the browser — turning guesswork into observation.

## What it does

React-Sentinel bridges AI terminals (Claude, Copilot CLI…) to a live browser runtime via the [Model Context Protocol](https://modelcontextprotocol.io). Instead of reading static source files, the AI can **observe and validate** its actions in real time.

| Capability | Description |
|---|---|
| **Runtime Inspection** | Explore the React Fiber tree, read hook values (`useState`, `useMemo`), audit network errors and console warnings live |
| **Shadow Sandbox** | Inject ephemeral code patches into an isolated browser instance — no local files touched — then assert the fix worked |
| **Interaction Simulation** | Drive the browser (click, fill, navigate) to reproduce bugs before attempting to fix them |

## Stack

- **Runtime:** Node.js 20 LTS
- **Language:** TypeScript (strict)
- **Package manager:** pnpm
- **MCP SDK:** `@modelcontextprotocol/sdk`
- **Browser automation:** Playwright

## Getting started

```bash
pnpm install
pnpm dev        # run with hot-reload (tsx watch)
```

## Available scripts

| Script | Description |
|---|---|
| `pnpm dev` | Start server with hot-reload |
| `pnpm build` | Compile TypeScript to `dist/` |
| `pnpm start` | Run compiled server |
| `pnpm typecheck` | Type-check without emitting |

## Project structure

```
src/
├── index.ts           # MCP server entry point
├── tools/             # MCP tool definitions (one file per tool group)
├── browser/           # Playwright / CDP session manager
└── diagnostics/       # Runtime signal collectors (console, network, fiber)
examples/
└── README.md          # Self-contained demo apps (one per bug class)
```

## Status

🚧 **Sprint 1** — bootstrapping. Core MCP server is running; runtime inspection, shadow sandbox, and interaction simulation are planned.