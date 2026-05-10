# React-Sentinel Debug Skill

Use React-Sentinel only when the task benefits from **observing a live browser runtime** instead of only reading repository files.

## Trigger signals

- visible React UI bug;
- console error or warning tied to runtime behavior;
- failed or suspicious network request;
- render loop, hydration mismatch, or async race;
- state or prop mismatch that needs live confirmation.

## Do not call React-Sentinel when

- the task is a pure refactor with no runtime symptom;
- the question is answered by documentation or static code alone;
- no runnable app or target URL exists yet;
- the user only asked for packaging, typing, or API design with no browser debugging need.

## Preferred order

1. `get_server_info`
2. `get_session_status`
3. `debug-react`
4. `reproduce-bug`
5. `validate-fix`

## Mode rules

- Prefer **Replay** by default.
- Escalate to **Attach** only for real user state.
- Use **Shadow Sandbox** only after replay already proves the bug.
- Turn the bug into `validate_after_action` or `validate_scenario` assertions before proposing a source change.
- Prefer `apply_patch_then_replay` over speculative source edits when testing one runtime hypothesis.
