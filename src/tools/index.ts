/**
 * tools/index.ts
 *
 * Central registry for all React-Sentinel MCP tools.
 * Each tool lives in its own file and is registered here.
 *
 * Convention:
 *   - One file per tool group (e.g. fiber.ts, network.ts, sandbox.ts)
 *   - Export a `register(server: McpServer)` function from each file
 *   - Import and call it here to keep index.ts clean
 */

export {};
