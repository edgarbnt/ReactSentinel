# reproduce-bug

Use this command when the agent needs a stable reproduction before proposing a fix.

## Checklist

1. Capture the target URL, important preconditions, and the exact user-visible failure.
2. Decide between:
   - **Replay** for deterministic, isolated reproduction;
   - **Attach** only if the issue depends on authenticated or extension-backed browser state.
3. Rebuild the bug with `navigate_replay`, `replay_interactions`, or attach-mode interaction tools.
4. Record the first verdict from console, network, runtime status, and visible UI state.
5. Keep the reproduction steps compact enough to replay after a code change.

## Guardrail

If the bug can be explained by static code inspection alone, do not force a runtime reproduction.
