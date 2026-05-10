# Copilot adaptation

Use the **generic MCP profile** as the baseline and keep the pack guidance close to the repository.

## What carries over

- the same stdio launch command and arguments;
- the same runtime-debugging heuristics;
- the same command routines for debug, reproduction, and fix validation.

## What stays manual in Sprint 14

- mapping the pack routines to Copilot chat prompts or custom instructions;
- deciding where to surface the skill text in the client workflow;
- any client-specific packaging beyond standard MCP wiring.

For VS Code workspaces, a project-local `.vscode/mcp.json` file is a reasonable place to carry the same stdio launch command.
