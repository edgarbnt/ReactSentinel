# Agent runtime UX

React-Sentinel is most useful when the agent knows **when** to call it and **which mode** to choose.

## Trigger signals

Call React-Sentinel when the task involves one or more of these signals:

- the bug is visible in the browser but the root cause is unclear from source code;
- a React state, prop, context, or render loop likely explains the failure;
- a console error or network request may be the fastest path to diagnosis;
- the agent needs proof that a fix works in the browser before editing files;
- the issue depends on real browser state, cookies, or an authenticated session.

## Non-triggers

Do **not** start with React-Sentinel when:

- the task is pure refactoring with no runtime symptom;
- the bug is already explained by a compile or type error;
- the target project cannot run in a browser session yet;
- a static source edit is obviously enough and no runtime confirmation is needed.

## Default mode choice

| Mode | Default? | Use when | Avoid when |
|---|---|---|---|
| Replay | Yes | You want deterministic reproduction in an isolated browser | The bug depends on real user state that replay cannot rebuild cheaply |
| Attach | No, escalate | You need the real tab, cookies, extensions, or authenticated session | A clean replay scenario is enough |
| Shadow sandbox | After replay | You want to test a runtime-only fix hypothesis before editing source files | The issue is not already reproducible in replay mode |

## Recommended sequence

1. **Check capability and session status** with `get_server_info` and `get_session_status`.
2. **Choose replay first** unless the bug clearly depends on a live authenticated tab.
3. **Inspect fast signals early** with console and network events.
4. **Locate the React owner** with `inspect_component` or `get_react_tree`.
5. **Read runtime state** with `get_component_state`.
6. **Turn the failure into an assertion** with `validate_after_action` or `validate_scenario`.
7. **Only then test a patch hypothesis** with `apply_patch_then_replay` or `apply_runtime_patch`.

## Capability-to-problem map

| Problem | First tools |
|---|---|
| Button disabled unexpectedly | `navigate_replay`, `inspect_component`, `get_component_state` |
| Error toast after API call | `navigate_replay`, `get_network_events`, `get_console_events`, `validate_after_action` |
| Infinite re-render / unstable hook | `get_render_hotspots`, `get_hook_changes`, `inspect_component` |
| Bug only in real logged-in session | `get_attach_status`, `get_attach_tabs`, `select_attach_tab`, runtime tools |
| Unsure whether a fix idea works | `apply_patch_then_replay`, `validate_scenario` |

## Example prompts

### Claude / Cursor / Copilot

> Reproduce the checkout failure in replay mode, inspect the React tree around the disabled submit button, and tell me which prop or state value is blocking the action.

### Claude Desktop

> Attach to my current Chrome tab, confirm React is detected, inspect the component that owns the visible error banner, and capture the console or network signal that explains it.

### Gemini CLI

> Use replay mode first. Reproduce the bug, validate the failure with an assertion, then try a sandbox patch and report whether the assertion passes.

### Generic MCP client

> Before changing code, get the session status, reproduce the bug, inspect the runtime state that owns it, and convert the bug into a validation scenario.

## Practical heuristics

- Prefer **Replay** over **Attach**.
- Prefer **Assertions** over informal visual guesses.
- Prefer **Sandbox validation** over speculative source edits.
- If React is not detected, switch from component-level assumptions to DOM, console, and network diagnostics.
