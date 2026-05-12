# Agent compatibility

| Agent / client | Support level | What the pack provides | Notes |
|---|---|---|---|
| Claude Code | Primary | `.claude/commands`, `.claude/skills`, `.claude/agents`, `.claude/docs`, and `.mcp.json` | Immediately usable without rewriting the markdown files |
| Generic MCP client | Supported with manual wiring | Standard stdio launch command plus reusable guidance | Client-specific config path may differ |
| Cursor | Documented adaptation | Reuse the same MCP launch config and markdown guidance manually | `.cursor/mcp.json` remains a natural project-local target |
| Gemini CLI | Documented adaptation | Reuse the same MCP launch config and guidance manually | Command and prompt wiring remain client-specific |
| GitHub Copilot / VS Code | Documented adaptation | Reuse the same MCP launch config and guidance manually | `.vscode/mcp.json` remains the main config target |

The pack keeps Claude Code as the only auto-wired experience. Other clients can still reuse the same transport config and prompt guidance without changing the core React-Sentinel launch command.
