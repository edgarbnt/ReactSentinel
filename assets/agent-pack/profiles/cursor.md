# Cursor adaptation

Use the **generic MCP profile** as the transport baseline and point Cursor at the same stdio launch command.

## What carries over

- the same `mcp` launch command for React-Sentinel;
- the same runtime-debugging heuristics and command routines;
- project-local setup through `.cursor/mcp.json` when you want repository-scoped wiring.

## What stays manual

- Cursor-specific prompt recipes or chat habits;
- any non-MCP project instructions you want Cursor to load automatically.
