# Auto-use heuristics

## Trigger React-Sentinel when

- the report mentions a broken UI state that depends on browser behavior;
- console, network, render, hydration, or async timing signals matter;
- the agent needs to confirm real runtime values before changing code;
- or a fix must be validated against the running app.

## Avoid React-Sentinel when

- repository reading is enough to answer the question;
- there is no app to run or no usable target URL;
- the issue is purely editorial, static, or build-time only;
- using Attach would be intrusive and Replay is unnecessary.

## Decision tree

1. Is there a runtime/browser symptom? If no, stay in normal code analysis.
2. Can Replay reproduce the issue safely? If yes, start there.
3. Does the issue depend on real browser state? If yes, consider Attach.
4. Is the bug already reproduced and the goal is hypothesis testing? If yes, consider Shadow Sandbox.
