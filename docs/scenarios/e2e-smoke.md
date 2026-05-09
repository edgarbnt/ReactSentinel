# Scenario: MCP End-to-End Smoke Test

This scenario verifies React-Sentinel through the **real MCP surface** instead of direct internal calls.

## Command

```bash
npm run e2e:smoke
```

## What the runner does

1. Reuses or starts the demo app on `http://127.0.0.1:5173`.
2. Starts the React-Sentinel MCP server over stdio.
3. Connects with the official MCP SDK client.
4. Calls the published tools and asserts the expected result for each step.

## Covered tools

- Core: `ping`, `get_server_info`, `echo`
- Replay session: `get_session_status`, `browser_ping`, `navigate_replay`
- Live-CDP smoke checks: `get_attach_status`, `get_attach_tabs`, `select_attach_tab`
- Diagnostics: `get_runtime_status`, `get_react_tree`, `inspect_component`, `get_component_state`, `get_console_events`, `get_runtime_timeline`, `get_network_events`
- Interaction + validation: `simulate_interaction`, `validate_after_action`, `replay_interactions`, `validate_scenario`
- Shadow sandbox: `apply_runtime_patch`, `reset_runtime_patches`, `apply_patch_then_replay`

## Concept proof

The scenario demonstrates the full concept:

- the MCP server can drive the replay browser end to end;
- React runtime data can be inspected through MCP;
- deterministic interactions and assertions work against the demo app;
- a temporary browser-only patch can fix the `/api/mock/error` flow in the sandbox;
- cleanup removes that patch so later runs return to the original `500` behavior.

## Known environment-dependent point

The live-CDP tools are included in the smoke test, but their exact outcome depends on whether Chrome is already exposed on port `9222`:

- if a remote-debug Chrome is available, the tools should return live-session metadata;
- otherwise, they should fail **cleanly** with a structured guidance message.
