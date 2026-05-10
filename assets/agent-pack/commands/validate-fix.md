# validate-fix

Use this command after the bug is reproducible and the agent has a concrete fix hypothesis.

## Validation sequence

1. Re-run the failing scenario with `validate_after_action` or `validate_scenario`.
2. If the fix is still hypothetical, use `apply_patch_then_replay` or `apply_runtime_patch` in replay mode first.
3. Prefer structured assertions over visual guesswork.
4. Confirm the fix against the same console, network, DOM, and React-state signals that proved the bug.
5. Clean up any sandbox patches after the verdict.

## Expected outcome

The agent should end with one of these states:

- the scenario is now validated;
- the runtime patch proves the hypothesis but source code still needs to change;
- or the attempted fix is disproved and the investigation must continue.
