# Claude Code profile

## Role

Claude Code is the primary Sprint 14 target.

## Integration shape

- project-local MCP config in `.mcp.json`;
- React-Sentinel server entry added under `mcpServers`;
- local command, skill, and heuristic files stored under `.react-sentinel/agent-pack/`.

## Why this profile is first

- project-scoped MCP config fits React-Sentinel's local workflow;
- commands and skills can live next to the repository;
- install, update, and uninstall can stay deterministic.
