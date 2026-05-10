# React-Sentinel Product Workflows

This guide documents the main MVP workflows for a human developer or a guided agent.

| Workflow | Best when | Core tools |
|---|---|---|
| **Attach** | You want to inspect the real Chrome tab you are already using | `get_attach_status`, `get_attach_tabs`, `select_attach_tab`, runtime tools |
| **Replay** | You want deterministic reproduction in an isolated browser | `browser_ping`, `navigate_replay`, `replay_interactions`, `validate_*` |
| **Sandbox / hot patch** | You want to test a runtime-only hypothesis without editing repository files | `apply_runtime_patch`, `apply_patch_then_replay`, `reset_runtime_patches` |
| **Minimal MCP integration** | You want to expose React-Sentinel to a local MCP client | `node dist/index.js start --headed` |

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

### Typical uses

- patch a network call to simulate a backend fix;
- inject a temporary guard around unstable runtime behavior;
- verify whether a hypothesis fixes the failing scenario before touching source files.

## 4. Minimal MCP integration

The MVP local integration is intentionally simple: expose the compiled React-Sentinel CLI to any MCP client that supports stdio transport.

### Stable local command

```bash
npm run build
node dist/index.js start --headed
```

### Minimal client configuration

```json
{
  "mcpServers": {
    "react-sentinel": {
      "command": "node",
      "args": ["/absolute/path/to/ReactSentinel/dist/index.js", "start", "--headed"]
    }
  }
}
```

### Development variant

For source-based development you can still point your client at `src/index.ts` through `tsx`, but the local MVP workflow is now centered on the built CLI entrypoint.

### Scope note

This document covers the **manual local MVP**. The zero-config agent automation layers are intentionally deferred to later sprints.
