# React-Sentinel Agent Pack

This pack installs **Claude Code-ready project files** for React runtime debugging.

## Installed layout

- `.claude/commands/` - ready-to-use slash commands
- `.claude/skills/react-sentinel-debug/SKILL.md` - reusable runtime-debugging skill
- `.claude/agents/` - optional specialized agent instructions
- `.claude/docs/` - supporting heuristics and compatibility notes
- `.claude/.react-sentinel-manifest.json` - ownership record for update and uninstall
- `.mcp.json` - React-Sentinel MCP server entry for Claude Code

## Core commands

1. `debug-react` - inspect runtime state, console, network, and React component data.
2. `reproduce-bug` - reproduce a browser issue in Replay or Attach before editing code.
3. `validate-fix` - convert the bug into checks and validate the fix before finishing.

## Compatibility

Claude Code is the primary target because the installed files follow Claude Code's native command, skill, and agent layout directly. Other MCP clients can still reuse the transport config and the markdown guidance manually.
