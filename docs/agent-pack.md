# React-Sentinel Agent Pack

## Objective

The agent pack installs a **Claude Code-ready local bundle** so the repository gets usable commands, skills, agents, and MCP wiring in one pass.

## Target layout

The managed Claude Code bundle is rooted at:

```text
.claude/
```

## Managed files

| Path | Purpose |
|---|---|
| `.claude/.react-sentinel-manifest.json` | Ownership record for generated files, install mode, server name, and conflict detection |
| `.claude/README.md` | Local summary of what the installed pack contains |
| `.claude/commands/debug-react.md` | Runtime debugging slash command |
| `.claude/commands/reproduce-bug.md` | Reproduction-first slash command |
| `.claude/commands/validate-fix.md` | Validation slash command |
| `.claude/skills/react-sentinel-debug/SKILL.md` | Reusable runtime-debugging skill |
| `.claude/agents/react-sentinel-runtime-debugger.md` | Specialized Claude Code agent |
| `.claude/docs/heuristics.md` | Trigger and non-trigger guidance |
| `.claude/docs/compatibility.md` | Compatibility notes for Claude Code and other MCP clients |
| `.mcp.json` | Claude Code MCP config entry written or updated by install/update flows |

## Install model

The install flow:

- writes Claude Code-native markdown files into `.claude/`,
- writes or updates the `react-sentinel` entry in `.mcp.json`,
- tracks managed content hashes in a manifest,
- and refuses destructive overwrites unless the caller explicitly forces them.

## Compatibility boundaries

- **Claude Code** is the primary target and is ready to use immediately after installation.
- **Other MCP clients** reuse the same stdio transport and guidance, but their command or prompt surfaces stay manual.

## Conflict model

The pack must never silently overwrite user customizations.

- **Install** fails if managed files already exist outside the manifest, or if the target MCP entry already exists with a conflicting shape.
- **Update** compares current file hashes with the manifest and warns before overwriting modified managed files.
- **Uninstall** removes only React-Sentinel-owned files and only removes the MCP entry that the pack previously managed.
