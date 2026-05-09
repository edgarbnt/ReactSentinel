# React-Sentinel

> An MCP server that gives AI agents eyes inside the browser — turning guesswork into observation.

## What it does

React-Sentinel bridges AI terminals (Claude, Copilot CLI…) to a live browser runtime via the [Model Context Protocol](https://modelcontextprotocol.io). Instead of reading static source files, the AI can **observe and validate** its actions in real time.

| Capability | Description |
|---|---|
| **Runtime Inspection** | Explore the React Fiber tree, inspect component props, extract simple hook values (`useState`, `useRef`, `useMemo`), surface React context values, and audit network or console signals live |
| **Shadow Sandbox** | Inject ephemeral code patches into an isolated browser instance — no local files touched — then assert the fix worked |
| **Interaction Simulation** | Drive the browser (click, fill, navigate) to reproduce bugs before attempting to fix them |

## Stack

- **Runtime:** Node.js 20 LTS
- **Language:** TypeScript (strict)
- **Package manager:** pnpm
- **MCP SDK:** `@modelcontextprotocol/sdk`
- **Browser automation:** Playwright

## Prerequisites

- **Node.js ≥ 20** — check with `node --version`
- **pnpm** — install with `npm install -g pnpm` if needed
- An MCP-compatible client: [Claude Desktop](https://claude.ai/download) or any terminal that supports MCP stdio transport

## Local setup

### 1. Install dependencies

```bash
# From the project root
pnpm install
```

### 2. Start the MCP server (development mode)

```bash
pnpm dev
```

The server starts on **stdio transport** — it waits for MCP messages from a connected client.  
You should see in stderr: `[react-sentinel] MCP server started (stdio transport) ✅`

### 3. Start the test app

Open a second terminal:

```bash
cd examples/test-app
pnpm install      # first time only
pnpm dev          # starts Vite on http://localhost:5173
```

The test app is a minimal React 18 page used as a live inspection fixture.

### 4. Connect your MCP client

**Claude Desktop** — add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "react-sentinel": {
      "command": "node",
      "args": ["--import", "tsx/esm", "/absolute/path/to/ReactSentinel/src/index.ts"]
    }
  }
}
```

> Restart Claude Desktop after saving the config. The `react-sentinel` tools will appear in the tool list.

### 5. Optional: attach to a live Chrome session

To inspect the browser you are already using, start Chrome with remote debugging enabled:

```bash
google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/react-sentinel-cdp
```

Then call `get_attach_status` to check whether the CDP endpoint is reachable. If it is not, the tool returns a clear error plus the launch command above.

Once the endpoint is ready, use `get_attach_tabs` to list the available page tabs and `select_attach_tab` to pick one by index, URL, or title. The first `select_attach_tab` response is a consent preview: it explains that React-Sentinel will inspect the selected tab's runtime signals and may run interaction tools in that same tab. Re-run `select_attach_tab` with `confirm: true` to enable live browser mode for that tab. After consent is recorded, the runtime inspection and interaction tools reuse only that live tab instead of opening the isolated sandbox browser. If the tab closes, React-Sentinel clears the selection and asks you to choose a tab again.

## Available scripts

| Script | Description |
|---|---|
| `pnpm dev` | Start MCP server with hot-reload (`tsx watch`) |
| `pnpm build` | Compile TypeScript to `dist/` |
| `pnpm start` | Run compiled server (requires `pnpm build` first) |
| `pnpm typecheck` | Type-check without emitting |
| `pnpm check` | Type-check and print a ✅ confirmation |

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

## Testing

See [docs/test-scenario-sprint1.md](docs/test-scenario-sprint1.md) for the full end-to-end test scenario
(start MCP server → open React app → invoke `get_runtime_status` → verify response).

The integrated test app also contains dedicated Sprint 6 fixtures for:
- hook state inspection (`get_component_state`)
- component/context inspection (`inspect_component`)
- compact inspection payload validation

## Status

✅ **Sprint 6** — runtime inspection now covers React tree lookup, component inspection, hook extraction, context surfacing, network timeline diagnostics, live-tab attach mode, and browser interaction validation.
