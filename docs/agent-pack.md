# React-Sentinel Agent Pack

## Objective

The agent pack turns React-Sentinel into a project-local integration bundle that an AI coding agent can install, inspect, update, and remove without hand-editing every file.

Claude Code is the primary target. The same pack also exposes a generic MCP profile plus documented adaptations for Gemini CLI and Copilot.

## Target format

The pack is a **managed project-local bundle** rooted at:

```text
.react-sentinel/agent-pack/
```

The bundle is designed around three principles:

1. **Deterministic ownership** — React-Sentinel tracks every managed file in a manifest so update and uninstall can tell which files belong to the pack.
2. **Claude Code first** — installation writes the MCP server entry to the project-local `.mcp.json` file by default.
3. **Portable guidance** — commands, skills, heuristics, and compatibility notes live as plain Markdown files so they stay readable outside one specific client.

The repository keeps the reusable pack assets under `assets/agent-pack/`. Install and update flows copy those assets into the project-local managed bundle.

## Managed file layout

| Path | Purpose |
|---|---|
| `.react-sentinel/agent-pack/manifest.json` | Ownership record for generated files, install mode, server name, and conflict detection |
| `.react-sentinel/agent-pack/README.md` | Local summary of what the pack contains and how to use it |
| `.react-sentinel/agent-pack/commands/debug-react.md` | Main React debugging routine for agents |
| `.react-sentinel/agent-pack/commands/reproduce-bug.md` | Reproduction-focused routine for Replay or Attach |
| `.react-sentinel/agent-pack/commands/validate-fix.md` | Validation routine for assertions or Shadow Sandbox |
| `.react-sentinel/agent-pack/skills/react-sentinel-debug.md` | Reusable agent instructions for when and how to call React-Sentinel |
| `.react-sentinel/agent-pack/docs/heuristics.md` | Trigger signals, non-trigger rules, and mode decision guidance |
| `.react-sentinel/agent-pack/docs/compatibility.md` | Compatibility matrix across Claude Code, generic MCP, Gemini CLI, and Copilot |
| `.react-sentinel/agent-pack/profiles/*.md` | Per-agent profile notes and integration constraints |
| `.mcp.json` | Claude Code MCP config entry written or updated by install/update flows |

## Install model

The initial install model is:

- generate the pack bundle in `.react-sentinel/agent-pack/`,
- merge or write a `react-sentinel` server entry in `.mcp.json`,
- keep a manifest of content hashes for managed files,
- and refuse destructive overwrites unless the caller explicitly forces them.

The MCP entry remains standard stdio JSON and reuses the existing React-Sentinel launch modes:

- `local` -> `node /absolute/path/to/dist/index.js mcp --headless`
- `global` -> `react-sentinel mcp --headless`
- `npx` -> `npx -y react-sentinel mcp --headless`

## Compatibility boundaries

### Fully supported in Sprint 14

- **Claude Code** project-local installation through `.mcp.json`
- **Generic MCP** documented profile using the same stdio command, args, and environment expectations

### Documented, not auto-wired

- **Gemini CLI** adaptation notes
- **Copilot** adaptation notes

These profiles stay in the pack as documentation-first adapters because their command and prompt surfaces are less uniform than Claude Code's project-local MCP file.

## Conflict model

The pack must never silently overwrite user customizations.

- **Install** fails if managed files already exist outside the manifest, or if the target MCP entry already exists with a conflicting shape.
- **Update** compares current file hashes with the manifest and warns before overwriting modified managed files.
- **Uninstall** removes only React-Sentinel-owned files and only removes the MCP entry that the pack previously managed.

When the caller wants to override a conflict intentionally, the CLI must require an explicit force flag instead of guessing.
