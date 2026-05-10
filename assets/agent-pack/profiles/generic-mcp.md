# Generic MCP profile

## Role

This profile describes the portable stdio setup for any MCP client that can launch a local command.

## Expected values

- command: `node`, `react-sentinel`, or `npx`
- args: launch React-Sentinel with `mcp` and a replay visibility flag
- env: normal local shell environment, plus any client-specific overrides

When the client fetches React-Sentinel from npm, the public package name is `@edgarbrunet/react-sentinel`.

## Limits

- config file path and JSON shape may differ by client;
- command palette and slash-command wiring are not assumed;
- the Markdown command and skill files may need manual copy or adaptation.
