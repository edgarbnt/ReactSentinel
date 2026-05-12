---
description: Validate a proposed React fix with React-Sentinel assertions or replay checks.
---

# validate-fix

Use this command after the bug is reproduced and you have a concrete fix hypothesis.

## Recommended flow

1. Reuse the reproduction scenario instead of inventing a new one.
2. Express success as `validate_after_action` or `validate_scenario` assertions.
3. Prefer Replay for deterministic validation.
4. Use Shadow Sandbox or runtime patch validation before editing source when one runtime hypothesis needs proof.
5. Re-run the assertions after the change and capture pass/fail evidence.

## Expected outcome

- the fix is validated against the original bug;
- the final answer cites observed runtime evidence;
- and regressions are less likely because the success condition is explicit.
