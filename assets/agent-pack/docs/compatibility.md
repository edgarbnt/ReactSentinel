# Agent compatibility

| Agent | Support level | What the pack provides | Notes |
|---|---|---|---|
| Claude Code | Primary | Project-local `.mcp.json`, commands, skills, heuristics, profile docs | The default install target |
| Generic MCP client | Supported with manual wiring | Standard stdio launch command, arguments, and local docs | Client-specific config path may differ |
| Cursor | Documented adaptation | Cursor profile notes plus the same MCP launch guidance | `.cursor/mcp.json` is a natural project-local target |
| Gemini CLI | Documented adaptation | Prompt/skill guidance and generic MCP notes | Manual setup expected |
| Copilot | Documented adaptation | Prompt/skill guidance and generic MCP notes | VS Code and CLI surfaces may differ |

The pack keeps the Markdown assets portable so the same guidance can move across clients even when their native command surfaces differ.
