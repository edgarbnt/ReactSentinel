---
description: Inspect a live React runtime with React-Sentinel before editing source code.
---

# debug-react

Use this command when the task looks like a real browser or React runtime bug instead of a pure source-code question.

## Recommended flow

1. Call `get_server_info` and `get_session_status`.
2. Prefer **Replay** first unless the bug depends on real user state.
3. Call `get_console_events` and `get_network_events` early.
4. Confirm runtime health with `get_runtime_status`.
5. Inspect the React tree with `inspect_component` or `get_react_tree`.
6. Read runtime values with `get_component_state`, `get_async_timeline`, `get_render_hotspots`, or related diagnostics.
7. Convert the observed failure into `validate_after_action` or `validate_scenario`.

## Expected outcome

- the failing runtime path is observed, not guessed;
- the owning component or network failure is identified;
- and the investigation ends with a validation-ready scenario.
