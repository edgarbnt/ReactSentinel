---
description: Reproduce a React or browser bug with React-Sentinel before proposing a fix.
---

# reproduce-bug

Use this command when you need a deterministic reproduction before changing code.

## Recommended flow

1. Start with `get_server_info` and `get_session_status`.
2. Choose **Replay** unless the issue requires an existing logged-in tab or real browser state.
3. Navigate to the failing page and replay the minimal steps that trigger the bug.
4. Capture the useful signals early: console events, network events, render hotspots, hydration issues, or async timeline data.
5. Write down the exact trigger, observed result, and expected result.
6. End with a runtime assertion that can be reused by `validate-fix`.

## Expected outcome

- a stable reproduction path exists;
- the failure is backed by observable runtime evidence;
- and follow-up validation can reuse the same scenario.
