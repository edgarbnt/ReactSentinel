# Gemini CLI adaptation

Use the **generic MCP profile** as the transport baseline.

## What carries over

- the same stdio launch command for React-Sentinel;
- the `debug-react`, `reproduce-bug`, and `validate-fix` routines;
- the same heuristics for deciding between Replay, Attach, and Sandbox.

## What stays manual in Sprint 14

- command alias registration;
- persistent prompt memory wiring;
- any Gemini-specific packaging conventions beyond standard MCP launch data.
