# MCP Tool Selection Guide

Use React-Sentinel when the answer depends on **runtime evidence in the browser**, not just source code structure.

| If you need to... | Start with | Why this beats grep/read | Good follow-up |
| --- | --- | --- | --- |
| Triage a vague runtime bug fast | `diagnose_runtime_bug` | It correlates console, hydration, async, and render signals into one verdict-first answer. | `attribute_render`, `get_runtime_timeline` |
| Explain why a component rerendered | `diagnose_excess_renders`, `attribute_render` | It inspects live render churn, hooks, props, and context instead of guessing from component code. | `find_memo_breaks`, `inspect_component` |
| Reproduce a bug in a deterministic browser | `navigate_replay` or `start_debug_replay` | It creates a clean replay session that can be rerun exactly. | `replay_interactions`, `validate_scenario` |
| Validate a user flow or invariant | `validate_scenario` or `validate_user_flow` | It executes real browser actions and returns pass/fail assertions with traces. | `find_race_conditions` |
| Catch intermittent timing bugs | `find_race_conditions` | It perturbs action timing across multiple iterations and shrinks failing flows. | `verify_hypothesis`, `verify_fix` |
| Test a runtime hypothesis before editing code | `verify_hypothesis` or `test_runtime_hypothesis` | It proves or refutes the idea against browser behavior instead of relying on intuition. | `attribute_render` |
| Try a fix without touching repository files | `apply_patch_then_replay`, `patch_and_validate`, `verify_fix`, or `verify_runtime_fix` | It validates an ephemeral runtime patch in the sandbox before a source change exists. | `reset_runtime_patches` |
| Reuse a real logged-in browser tab | `get_attach_status`, `get_attach_tabs`, `select_attach_tab` | It lets React-Sentinel inspect the exact user-prepared session that static analysis cannot recreate. | `get_runtime_status` |

## Quick heuristics

- If the bug depends on **current props, state, context, network, console, or timing**, prefer React-Sentinel.
- If you only need to understand **static source structure**, grep/read is still cheaper.
- Prefer **verdict-first tools** (`diagnose_*`, `attribute_render`, `verify_*`) before low-level atomic tools unless you already know the exact signal you need.
