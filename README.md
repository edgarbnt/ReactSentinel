# React-Sentinel

> An MCP server that gives AI agents eyes inside the browser — turning guesswork into observation.

## What it does

React-Sentinel bridges AI terminals (Claude, Copilot CLI…) to a live browser runtime via the [Model Context Protocol](https://modelcontextprotocol.io). Instead of reading static source files, the AI can **observe and validate** its actions in real time.

| Capability | Description |
|---|---|
| **Runtime Inspection** | Explore the React Fiber tree, inspect component props, extract simple hook values (`useState`, `useRef`, `useMemo`), surface React context values, and audit network or console signals live |
| **Replay Sandbox** | Launch an isolated Playwright browser, navigate to a target app, and replay deterministic interaction sequences without touching the developer's live browser |
| **Interaction Simulation** | Drive either the attached live tab or the replay browser (click, fill, press, navigate) to reproduce bugs before attempting to fix them |

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

Playwright is already declared in the workspace dependencies. If Chromium is missing on a fresh machine, install it once with:

```bash
npx playwright install chromium
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

## Replay sandbox tools

- `get_server_info` advertises `replay_sandbox` as available today and keeps `shadow_sandbox` as planned for the later shadow-patching milestone.
- `get_session_status` reports whether React-Sentinel is currently using the live attached tab or the isolated replay browser, and exposes the replay headless/headed configuration.
- `navigate_replay` opens the isolated replay browser, navigates to a URL, waits for `load`, `domcontentloaded`, or `networkidle`, and returns readable navigation errors when the target app is unavailable.
- `replay_interactions` replays ordered `click`, `fill`, `wait`, and `press` steps in that replay browser and logs the result of each step.

`navigate_replay` and `replay_interactions` accept `headless` so the same sandbox can run invisibly in automated flows or visibly in a local debugging session.

## Runtime inspection limits

The hook/state inspector is intentionally bounded so responses stay readable for AI clients:

- **Supported hook cells:** `useState`, `useRef`, and `useMemo` are extracted reliably.
- **Traversal cap:** hook traversal stops after **25 cells** per component.
- **Custom / unrecognized hooks:** React-Sentinel does not infer custom hook names. It walks the underlying Fiber hook cells; cells that do not match a known shape and are not serializable primitives are omitted, while primitive unknowns are exposed as `unknown`.
- **Truncation rules:** long strings, arrays, object keys, `Map`, `Set`, React elements, DOM elements, and cyclic values are shortened or replaced with explicit placeholders such as `[Circular]`, `[MaxDepthReached]`, `[MaxNodesReached]`, `[Function:...]`, `[ReactElement:...]`, and `[HTMLElement:...]`.

These limits are by design: they keep the output stable and compact enough to be useful in the middle of a debugging session.

## Attach vs replay limits

React-Sentinel now exposes two browser session modes:

- **Attach mode** reuses a developer-selected Chrome tab through CDP. It preserves the real browser state, cookies, and extensions, but it requires explicit consent and depends on the tab staying open.
- **Replay mode** uses an isolated Playwright Chromium session. It is safer for deterministic reproduction and scripted replays, but it does not inherit the user's current browsing state unless the scenario rebuilds it step by step.

Most runtime and interaction tools keep the same behavior in both modes because they resolve through the same runtime bridge. The main difference is which page is being driven: a real user tab in attach mode, or the isolated replay browser in replay mode.

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

✅ **Sprint 7** — runtime inspection now covers live-tab attach mode plus an isolated replay sandbox with explicit session status, configurable headless/headed navigation, and deterministic replay sequences.
