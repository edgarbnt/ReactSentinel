# Universal adoption checklist

This checklist captures the onboarding scenarios React-Sentinel should support across its documented environments.

## Validation scenarios

| Environment | Validation target | Status |
|---|---|---|
| Claude Code | `init-mcp --client claude-code --mode local --write` produces a valid `.mcp.json` entry | Validated |
| Generic MCP | `init-mcp --client generic-mcp --mode npx` prints a portable snippet that references `@edgarbrunet/react-sentinel` | Validated |
| Cursor | `init-mcp --client cursor --mode local --write` produces `.cursor/mcp.json` | Validated |
| GitHub Copilot / VS Code | `init-mcp --client github-copilot --mode local --write` produces `.vscode/mcp.json` with a `servers` root and `type: \"stdio\"` | Validated |
| Gemini CLI | `init-mcp --client gemini-cli --mode local --write` produces `.gemini/settings.json` | Validated |
| Copilot CLI | Manual adaptation of the generic MCP snippet is documented | Documentation path |

## Operator checklist

1. Confirm Node.js 20+ is installed.
2. Confirm the React-Sentinel CLI can build or run from `npx`.
3. Choose the target environment explicitly or use `--client auto`.
4. Generate or write the MCP config.
5. Restart the client or IDE.
6. Verify the server launches with `mcp` over stdio.
7. Run a first runtime task such as `get_server_info` or `browser_ping`.
8. If the setup fails, convert the limitation into a doc note or a CLI help improvement.

## Common failure-to-doc loop

| Failure | Expected response |
|---|---|
| Wrong config file shape | Document the correct root key (`mcpServers` vs `servers`) |
| No standard config path | Use `generic-mcp` and document the client-specific manual path |
| Missing replay browser | Point the user to `npx playwright install chromium` |
| Attach mode unavailable | Keep working in replay mode and document the Chrome CDP requirement |

## Exit criteria

- At least one Claude setup is validated end to end.
- At least one generic MCP snippet is validated.
- Cursor, Copilot, and Gemini flows are either validated locally or documented honestly as manual adaptations.
- Every failed onboarding step produces either a doc clarification or a CLI message.
