# React-Sentinel Product Workflows

This guide documents the main MVP workflows for a human developer or a guided agent.

| Workflow | Best when | Core tools |
|---|---|---|
| **Attach** | You want to inspect the real Chrome tab you are already using | `get_attach_status`, `get_attach_tabs`, `select_attach_tab`, runtime tools |
| **Replay** | You want deterministic reproduction in an isolated browser | `browser_ping`, `navigate_replay`, `replay_interactions`, `validate_*` |
| **Sandbox / hot patch** | You want to test a runtime-only hypothesis without editing repository files | `apply_runtime_patch`, `apply_patch_then_replay`, `reset_runtime_patches` |
| **Minimal MCP integration** | You want to expose React-Sentinel to a local MCP client | `node dist/index.js start --headed` |

## Capability status semantics

Use `get_server_info` when an agent needs to understand what React-Sentinel can do **before** choosing a workflow.

- **available** means the capability is backed by at least one usable MCP tool today.
- **partial** means the capability is real but intentionally bounded; for example, `runtime_inspection` focuses on readable React snapshots, and `shadow_sandbox` is limited to script-on-page runtime patches.
- **planned** is reserved for future capability names that are not wired to a usable MCP tool yet.

`get_server_info` now returns both `capabilityDetails` and `capabilitiesByMode`, so an agent can see:

1. which MCP tools back a capability,
2. whether that capability belongs to attach, replay, or sandbox mode,
3. and whether the capability is fully available or only partial.

## Agent-first React debug flow

Use this order when an agent receives a vague React bug report and needs to reduce guesswork quickly.

1. Call `get_server_info` and `get_session_status` first to confirm which capabilities and modes are usable in the current session.
2. Choose **Attach** only if the bug depends on a real user session; otherwise start in **Replay** for safer, reproducible investigation.
3. Use `get_console_events` and `get_network_events` early to separate UI rendering bugs from failed requests, noisy console errors, or missing backend data.
4. Call `get_runtime_status` to confirm that React was detected and to see whether the runtime bridge is healthy.
5. Use `inspect_component` or `get_react_tree` to locate the component subtree that owns the failing UI.
6. Use `get_component_state` to inspect the runtime values behind the bug, and use `inspect_component` or `get_react_tree` again if you need more component context.
7. Once the failure is reproducible, turn the observation into `validate_after_action` or `validate_scenario` assertions before proposing a code change.

### Why this order works

- Status and mode checks prevent an agent from choosing tools that are unavailable in the current session.
- Console and network signals often explain React symptoms faster than starting with DOM selectors alone.
- Tree inspection narrows the search to the component that actually owns the broken state.
- Structured validation gives the agent a reproducible proof point before and after a fix.

## Mode selection matrix

Use this matrix when an agent must choose between **Attach**, **Replay**, and **Shadow Sandbox**.

| Mode | Real user state | Isolation | Safety | Reproducibility | Best when |
|---|---|---|---|---|---|
| **Attach** | Reuses the current live tab, cookies, and local storage | Low | Lowest, because actions hit the real tab | Medium | The bug depends on authenticated state, browser extensions, or a page that cannot be rebuilt easily |
| **Replay** | Starts from a clean browser session | High | High | High | The agent needs a deterministic reproduction, scenario assertions, or a clean debugging baseline |
| **Shadow Sandbox** | Builds on top of replay only | High | High, because repository files stay untouched | High for script-on-page hypotheses | The agent wants to test a runtime-only fix before editing source files |

### Selection rules

1. Prefer **Replay** by default.
2. Escalate to **Attach** only when the failure depends on real user state that replay cannot reconstruct cheaply.
3. Use **Shadow Sandbox** only after a replay scenario already demonstrates the bug.
4. Treat `shadow_sandbox = partial` as a reminder that the sandbox is narrower than full code rewriting: it validates runtime hypotheses, not permanent source edits.

## 1. Attach workflow

Use **Attach** when the important state already lives in your real browser session: authenticated cookies, local storage, browser extensions, or a page you do not want to rebuild from scratch.

### Prerequisites

Start Chrome with remote debugging enabled:

```bash
google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/react-sentinel-cdp
```

### Happy path

1. Call `get_attach_status` to confirm that Chrome exposes a reachable CDP endpoint.
2. Call `get_attach_tabs` to list the available page tabs.
3. Call `select_attach_tab` once to preview the candidate tab.
4. Call `select_attach_tab` again with `confirm: true` to explicitly allow React-Sentinel to drive that live tab.
5. Use runtime inspection, network, console, or interaction tools against the selected tab.

### What changes after confirmation

- React-Sentinel switches the active session mode to **attach**.
- Runtime and interaction tools reuse the selected live tab instead of opening the isolated replay browser.
- If the live tab closes, React-Sentinel clears the selection and asks you to choose a tab again.

### Common failure

If Chrome CDP is unavailable, React-Sentinel now returns:

- the failing endpoint,
- a launch command for Chrome remote debugging,
- and a reminder that you can keep working in replay mode until live attach is ready.

See the [local diagnostics checklist](local-diagnostics-checklist.md) for recovery steps.

## 2. Replay workflow

Use **Replay** when you want a deterministic, isolated reproduction that does not touch the developer's live browser.

### Happy path

1. Start from `browser_ping` or `navigate_replay` with the target URL.
2. Use `replay_interactions` to reproduce the bug in a controlled sequence.
3. Inspect runtime state with tools such as `get_runtime_status`, `inspect_component`, `get_component_state`, `get_network_events`, or `get_console_events`.
4. Turn the reproduction into assertions with `validate_after_action` or `validate_scenario`.

### Why replay is the default MVP path

- It is safer than driving a real user tab.
- It is reproducible in local validation and smoke tests.
- It gives React-Sentinel a clean environment for runtime patches and scenario assertions.

### Typical uses

- reproduce a failing flow in the demo app;
- validate that a selector, network event, or visible message changed as expected;
- inspect React component state without depending on a pre-existing browser session.

### Agent escalation from replay to sandbox

Use this sequence when the agent needs both diagnosis and fix validation:

1. Reproduce the bug with `navigate_replay` and `replay_interactions`.
2. Capture the failure with `validate_after_action` or `validate_scenario`.
3. Read `get_server_info` before attempting a hot patch:
   - if `shadow_sandbox` is `partial` or `available`, the agent may try a runtime-only patch;
   - if `shadow_sandbox` is absent or only planned, stop at diagnosis and propose a source change instead.
4. Prefer `apply_patch_then_replay` when the goal is to test one hypothesis against a known failing sequence.
5. Use `apply_runtime_patch` directly only when the agent needs to stage multiple patch attempts in the same replay session.

## 3. Sandbox / hot patch workflow

Use the **Sandbox / hot patch** flow when you want to test a runtime-only fix hypothesis before changing repository files.

### Happy path

1. Open or reuse a replay session with `navigate_replay`.
2. Apply a script patch with `apply_runtime_patch`, or use `apply_patch_then_replay` to patch, replay steps, and validate in one run.
3. Read the explicit patch verdict (`patch_validated` or `patch_failed`) plus the replay report.
4. Clean up with `reset_runtime_patches`.

### Guardrails

- Patches are **replay only** and never touch repository files.
- Patches are **session scoped** and disappear when the replay session resets.
- The MVP accepts script patches only, executed in the replay page.
- If `shadow_sandbox` is reported as **partial**, treat that as a hard boundary: stay within script-on-page patches and do not assume broader file or bundle rewriting support.

### Typical uses

- patch a network call to simulate a backend fix;
- inject a temporary guard around unstable runtime behavior;
- verify whether a hypothesis fixes the failing scenario before touching source files.

## 4. Minimal MCP integration

The zero-config path is now centered on `init-mcp`: generate or write a client snippet that points to the explicit `mcp` stdio command.

See [universal-install.md](universal-install.md) for the public npm package contract and [integration-guides.md](integration-guides.md) for environment-specific wiring.

### Generate the client snippet

```bash
npm run build
node dist/index.js init-mcp --client auto --mode local
```

### Write the config automatically

```bash
node dist/index.js init-mcp --client claude-desktop --mode local --write
node dist/index.js init-mcp --client claude-code --mode npx --write
```

### Launch variants

| Variant | When to use | Generated command |
|---|---|---|
| **local** | You are inside this checkout or another local package install | `node /absolute/path/to/dist/index.js mcp --headless` |
| **global** | `react-sentinel` is installed globally | `react-sentinel mcp --headless` |
| **npx** | You want the MCP client to fetch React-Sentinel on demand | `npx -y @edgarbrunet/react-sentinel mcp --headless` |

### Verify an existing config

```bash
node dist/index.js doctor --config-path ~/.config/Claude/claude_desktop_config.json
```

### Notes

- Claude Desktop keeps the classic `mcpServers` JSON shape and needs a restart after config changes.
- Claude Code can use the same snippet format in a project-local `.mcp.json` file; override the file path with `--config-path` if you want a different location.
- Cursor uses `.cursor/mcp.json`, GitHub Copilot / VS Code uses `.vscode/mcp.json`, and Gemini CLI uses `.gemini/settings.json`.
- For source-based development you can still point a client at `src/index.ts` through `tsx`, but the default workflow now prefers the compiled CLI entrypoint and the dedicated `mcp` command.

### Scope note

This document covers the **manual local MVP plus zero-config client wiring**. Higher-level agent automation still depends on the caller choosing the right attach/replay workflow for the debugging task.

## Agent prompt examples

Use prompts like these when you want an agent to drive React-Sentinel directly instead of improvising its own order of operations.

### UI bug

> Reproduce the checkout button bug in replay mode, inspect the React tree around the disabled button, and tell me which prop or state value keeps it disabled.

### Network error

> Run the failing profile flow in replay mode, capture console and network events, and identify whether the visible error starts from a failed request or from client-side rendering.

### Render loop

> Attach to my live tab, confirm React is detected, inspect the component that keeps re-rendering, and check hook or context values that change every render.

### Sandbox patch

> Reproduce the bug in replay mode, turn it into a validation scenario, then try a sandbox patch that guards the failing runtime path and report whether the patch validates the scenario.
