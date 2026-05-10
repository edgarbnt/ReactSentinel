# Integration guides

This guide explains how to wire React-Sentinel into each supported agent or IDE environment.

## Support matrix

| Environment | Setup status | Best install mode | Notes |
|---|---|---|---|
| Claude Code | Supported | `npx` or `local` | Project-local `.mcp.json` |
| Claude Desktop | Supported | `npx` or `local` | User-level Claude config |
| Cursor | Supported | `npx` or `local` | Project-local `.cursor/mcp.json` |
| GitHub Copilot / VS Code | Supported | `npx` | Workspace `.vscode/mcp.json` using the VS Code `servers` shape |
| Gemini CLI | Supported | `npx` | Project-local `.gemini/settings.json` |
| Copilot CLI | Partial / manual | `npx` | Reuse the same stdio launch command; CLI-specific setup may be interactive |
| Generic MCP client | Supported manually | `npx` or `local` | Paste the snippet into the client-specific config |

## Claude Code

### Recommended

```bash
npx -y @edgarbrunet/react-sentinel init-mcp --client claude-code --mode npx --write
```

### Result

- writes or updates `.mcp.json` in the current project;
- adds a `react-sentinel` entry under `mcpServers`;
- keeps the MCP setup local to the repository.

### Limitations

- React-Sentinel only manages the MCP server entry, not Claude-specific prompts or memories.

## Claude Desktop

### Recommended

```bash
npx -y @edgarbrunet/react-sentinel init-mcp --client claude-desktop --mode npx --write
```

### Result

- writes the standard `mcpServers` entry into the OS-specific Claude Desktop config file;
- keeps the launch command on stdio transport;
- requires a Claude Desktop restart afterward.

### Limitations

- local repository routines still live in this repository or the optional agent pack; Desktop does not automatically import them.

## Cursor

### Recommended

```bash
npx -y @edgarbrunet/react-sentinel init-mcp --client cursor --mode npx --write
```

### Result

- writes `.cursor/mcp.json` in the current project;
- uses the standard `mcpServers` JSON shape;
- keeps setup shareable inside the repository if you choose to commit the file.

### Limitations

- React-Sentinel wires the MCP transport only. Cursor-specific prompt recipes remain documentation-first.

## GitHub Copilot / VS Code

### Recommended

```bash
npx -y @edgarbrunet/react-sentinel init-mcp --client github-copilot --mode npx --write
```

### Result

- writes `.vscode/mcp.json`;
- uses the VS Code-style `servers` root;
- sets the server type to `stdio`;
- reload the workspace so Copilot can detect the MCP server.

### Limitations

- This targets the VS Code workspace integration surface. Other GitHub Copilot entry points can reuse the same stdio command but may need manual setup.

## Copilot CLI

### Recommended

Use the same stdio launch command as the VS Code integration:

```bash
npx -y @edgarbrunet/react-sentinel init-mcp --client generic-mcp --mode npx
```

Then either:

1. paste the snippet into your Copilot CLI MCP config flow, or
2. register the same command through the CLI's interactive MCP setup if you prefer UI-assisted wiring.

### Limitations

- The repository does not assume one universal Copilot CLI config file path.
- Prompt and routine surfacing remains manual.

## Gemini CLI

### Recommended

```bash
npx -y @edgarbrunet/react-sentinel init-mcp --client gemini-cli --mode npx --write
```

### Result

- writes `.gemini/settings.json` in the current project;
- adds a `mcpServers.react-sentinel` entry;
- keeps the same stdio command contract used by other MCP clients.

### Limitations

- Gemini-specific command aliases and memory wiring are not managed by React-Sentinel.

## Generic MCP clients

### Recommended

```bash
npx -y @edgarbrunet/react-sentinel init-mcp --client generic-mcp --mode npx
```

### Result

- prints a portable `mcpServers` JSON snippet;
- lets you paste the same launch command into any MCP-compatible client.

### Limitations

- React-Sentinel does not guess the config path or JSON root for arbitrary clients.
- Some clients may expect additional fields such as `type`, `env`, or client-specific wrappers.

## IDE integration note

For IDEs that do not expose a first-class React-Sentinel target yet:

1. start from the **generic MCP** snippet;
2. keep the launch command on stdio transport;
3. document the IDE-specific config path next to the project if you plan to share it with a team.
