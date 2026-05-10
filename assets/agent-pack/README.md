# React-Sentinel Agent Pack

This pack is the local integration bundle that React-Sentinel installs for AI coding agents.

## Primary target

- **Primary:** Claude Code project-local integration
- **Also included as documentation profiles:** generic MCP, Gemini CLI, Copilot

## Contents

- `commands/` - ready-to-reuse prompt commands for React debugging
- `skills/` - reusable operating rules for when and how to call React-Sentinel
- `docs/` - heuristics and compatibility notes that stay local to the project
- `profiles/` - per-agent integration notes and limits
- `manifest.json` - machine-readable ownership record for update and uninstall

## Core commands

1. `debug-react` - start with server/session status, then inspect runtime, console, network, and component state.
2. `reproduce-bug` - build a reproducible Replay or Attach scenario before changing code.
3. `validate-fix` - turn the bug into assertions and use validation or sandbox tools to prove the fix.

## Managed MCP config

The pack expects React-Sentinel to manage one MCP server entry in the project config file, usually `.mcp.json` for Claude Code.

The Markdown assets in this folder are intentionally client-agnostic so they can be copied or adapted outside Claude Code when needed.
