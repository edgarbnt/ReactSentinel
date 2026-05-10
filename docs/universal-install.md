# Universal install

React-Sentinel is published publicly as **`@edgarbrunet/react-sentinel`**.

That package name is the only public npm reference that should be used in README text, onboarding docs, screenshots, and launch materials.

## Public command contract

| Use case | Recommended command |
|---|---|
| Print a config snippet for the detected environment | `npx -y @edgarbrunet/react-sentinel init-mcp --client auto --mode npx` |
| Write a Claude Code config | `npx -y @edgarbrunet/react-sentinel init-mcp --client claude-code --mode npx --write` |
| Write a Cursor config | `npx -y @edgarbrunet/react-sentinel init-mcp --client cursor --mode npx --write` |
| Write a GitHub Copilot / VS Code config | `npx -y @edgarbrunet/react-sentinel init-mcp --client github-copilot --mode npx --write` |
| Start the MCP server directly | `npx -y @edgarbrunet/react-sentinel mcp --headless` |
| Run the local doctor | `npx -y @edgarbrunet/react-sentinel doctor --json` |

## Install modes

| Mode | Meaning | Generated launch command |
|---|---|---|
| `local` | Use the compiled CLI from the current checkout | `node /absolute/path/to/dist/index.js mcp --headless` |
| `global` | Use a globally installed `react-sentinel` binary | `react-sentinel mcp --headless` |
| `npx` | Fetch the scoped package on demand | `npx -y @edgarbrunet/react-sentinel mcp --headless` |

## Target selection

`init-mcp` now supports these targets:

| Target | Config root | Default write target | Status |
|---|---|---|---|
| `claude-code` | `mcpServers` | `.mcp.json` | Supported |
| `claude-desktop` | `mcpServers` | OS-specific Claude Desktop config | Supported |
| `cursor` | `mcpServers` | `.cursor/mcp.json` | Supported |
| `github-copilot` | `servers` | `.vscode/mcp.json` | Supported |
| `gemini-cli` | `mcpServers` | `.gemini/settings.json` | Supported |
| `generic-mcp` | `mcpServers` | none | Manual paste |
| `auto` | detects an existing config if present, otherwise falls back to Claude Code | varies | Supported |

## What `--write` does

When the chosen target has a safe default path:

1. React-Sentinel reads the existing config file if it exists.
2. It merges or writes a `react-sentinel` server entry.
3. It prints the resolved target, launch command, and restart instruction.

When the target does **not** have a safe default path:

- `--write` is rejected;
- use the printed snippet instead and paste it manually into your MCP client config.

## Honest limitations

- `github-copilot` currently targets the workspace-level VS Code MCP file shape. Other Copilot surfaces can reuse the same stdio launch command but may need manual adaptation.
- `cursor`, `gemini-cli`, and `generic-mcp` share the same stdio launch contract, but their prompt workflows and slash-command surfaces are not standardized by React-Sentinel.
- `global` mode assumes you chose to install the CLI binary yourself. Public onboarding should prefer `npx`.
- Public npm naming and CLI binary naming are intentionally different: the package is scoped, the binary stays `react-sentinel`.

## Local repository workflow

Before public publication, use the same CLI from a checkout:

```bash
npm install
npm run build
node dist/index.js init-mcp --client auto --mode local
```

Then switch to `--write` once you know the target:

```bash
node dist/index.js init-mcp --client claude-code --mode local --write
```
