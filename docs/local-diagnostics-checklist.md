# Local Diagnostics Checklist

Use this checklist when React-Sentinel does not behave as expected in a local setup.

## 1. Run the CLI doctor first

```bash
npm run build
node dist/index.js doctor
```

What to look for:

- **Node FAIL**: install Node.js 20+ and retry.
- **Replay browser FAIL**: run `npx playwright install chromium`, then retry.
- **Attach endpoint WARN**: this is acceptable if you only plan to use replay mode.

## 2. If Chrome CDP is unavailable

Symptoms:

- `get_attach_status` reports that Chrome CDP is unavailable.
- `get_attach_tabs` or `select_attach_tab` says that live Chrome attach is unavailable.

Fix:

```bash
google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/react-sentinel-cdp
```

Or let React-Sentinel launch an isolated managed Chromium for you:

```bash
react-sentinel mcp --browser-mode managed --headed
```

Then retry:

1. `get_attach_status`
2. `get_attach_tabs`
3. `select_attach_tab` with `confirm: true`

If you do not need the live browser, skip attach mode and stay in replay mode with `browser_ping` or `navigate_replay`.

See [browser-modes.md](browser-modes.md) for the differences between user Chrome attach, managed Chrome, and replay sandbox.

## 3. If no live browser tab is selected

Symptoms:

- A tool says no live Chrome tab is selected.

Fix:

1. Call `get_attach_tabs`
2. Pick a tab with `select_attach_tab`
3. Re-run `select_attach_tab` with `confirm: true`

If you only need an isolated browser, use replay mode instead.

## 4. If the selected Chrome tab disappeared

Symptoms:

- A tool says the selected live Chrome tab is no longer available.

Fix:

1. Re-run `get_attach_tabs`
2. Select a fresh tab with `select_attach_tab`

Or switch back to replay mode with `navigate_replay`.

## 5. If the target app is unreachable

Symptoms:

- `browser_ping` or `navigate_replay` says it cannot connect to the URL.

Fix:

1. Start the target app locally
2. Verify the URL in your MCP request
3. Retry with a reachable URL such as the demo app (`http://127.0.0.1:5173`)

See [local-ports.md](local-ports.md) for the full list of legitimate local URLs and ports used in the repository.
