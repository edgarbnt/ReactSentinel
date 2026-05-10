# GitHub visibility plan

This document provides a ready-to-apply configuration for the public GitHub repository. All actions listed here require Edgar's manual approval or execution; none are applied automatically.

---

## Suggested repository description

```
Runtime debugger for AI agents — MCP server that gives AI tools live React inspection, bug replay, and fix validation.
```

(140 characters, within GitHub's limit.)

## Suggested website URL

```
https://www.npmjs.com/package/@edgarbrunet/react-sentinel
```

Update this once the npm package is published.

## Suggested topics (GitHub repository topics)

Apply these under **Settings → General → Topics**:

```
mcp  react  debugging  ai  playwright  devtools  typescript  model-context-protocol  agent  browser-automation
```

Keep the list to 10 or fewer for maximum discoverability. Topics must be lowercase, hyphen-separated.

## Suggested repository labels

Create or rename labels under **Issues → Labels**:

| Name | Color | Description |
|---|---|---|
| `bug` | `#d73a4a` | Something is not working as expected |
| `enhancement` | `#a2eeef` | New feature or improvement request |
| `good first issue` | `#7057ff` | Easy entry point for new contributors |
| `help wanted` | `#008672` | Maintainer is actively seeking contributions |
| `needs-triage` | `#e4e669` | Not yet reviewed by a maintainer |
| `documentation` | `#0075ca` | Improvements or additions to documentation |
| `dependencies` | `#0366d6` | Pull requests that update a dependency |
| `ci` | `#bfd4f2` | Related to the CI/CD pipeline |
| `agent-pack` | `#f9d0c4` | Agent Pack CLI feature area |
| `mcp-protocol` | `#c5def5` | MCP server core or tool definitions |

## Social preview image

A placeholder SVG is available at [`assets/social-preview.svg`](../assets/social-preview.svg). To apply it as the repository's Open Graph image:

1. Convert the SVG to a PNG at 1280 × 640 px (GitHub requires PNG or JPEG for social previews).
2. Go to **Settings → General → Social preview → Edit**.
3. Upload the converted PNG.

Suggested conversion command (requires Inkscape or a similar tool):

```bash
inkscape assets/social-preview.svg --export-type=png --export-filename=assets/social-preview.png -w 1280 -h 640
```

Or using ImageMagick with rsvg-convert:

```bash
rsvg-convert -w 1280 -h 640 assets/social-preview.svg > assets/social-preview.png
```

## Draft public issues to create

Create these issues on GitHub after making the repository public. They improve discoverability and signal active maintenance.

---

### Issue 1 — Good first issue (new contributor entry point)

**Title:** `Add --json flag to init-mcp for machine-readable output`

**Labels:** `good first issue`, `enhancement`

**Body:**

```
### Task

The `init-mcp` command currently prints human-readable text. Add an optional `--json` flag that
outputs the generated MCP config snippet as a JSON object to stdout, making it easier for
shell scripts or editor plugins to consume.

### Acceptance criteria

- `node dist/index.js init-mcp --client claude-code --mode npx --json` prints valid JSON.
- The JSON shape is `{ "client": "<name>", "mode": "<mode>", "config": { … } }`.
- All existing text output is unchanged when `--json` is not passed.
- `npm run check && npm run build` pass.

### Starting points

- Entry point: `src/index.ts` — look for the `init-mcp` command handler.
- Config generation: `src/mcp-config.ts`.
- Run `npm run build && node dist/index.js init-mcp --client claude-code --mode npx` to see current output.

### Effort estimate

1–3 hours.
```

---

### Issue 2 — Feature request (ecosystem expansion)

**Title:** `Support JetBrains AI Assistant as an MCP client target`

**Labels:** `enhancement`, `help wanted`

**Body:**

```
### Motivation

JetBrains AI Assistant (IntelliJ, WebStorm, etc.) supports MCP servers via its plugin ecosystem.
React-Sentinel already supports Claude Code, Cursor, GitHub Copilot, and Gemini CLI. Adding a
`--client jetbrains` target would make the `init-mcp` command usable for JetBrains users.

### Proposed solution

1. Research the JetBrains AI Assistant MCP config file path and format.
2. Add a `jetbrains` client entry to `src/mcp-config.ts`.
3. Update `docs/integration-guides.md` with a JetBrains section.
4. Add the new client to the supported environments table in `README.md`.
```

---

### Issue 3 — Documentation improvement

**Title:** `Document how to use React-Sentinel with pnpm and Yarn workspaces`

**Labels:** `documentation`

**Body:**

```
### Motivation

The current `init-mcp` and agent-pack install flows assume npm. Teams using pnpm workspaces
or Yarn Berry (PnP) may encounter path or lockfile differences.

### Task

Add a section to `docs/universal-install.md` covering:
- How to run `npx @edgarbrunet/react-sentinel init-mcp` under pnpm (`pnpm dlx`) and Yarn (`yarn dlx`).
- Whether `install-agent-pack` works in a monorepo root vs. a sub-package.
- Known limitations (if any) when Yarn PnP is enabled.
```

## Pinned discussions / README badges

Consider adding these badges to `README.md` once the package is published:

```markdown
[![npm version](https://img.shields.io/npm/v/@edgarbrunet/react-sentinel)](https://www.npmjs.com/package/@edgarbrunet/react-sentinel)
[![CI](https://github.com/edgarbnt/ReactSentinel/actions/workflows/ci.yml/badge.svg)](https://github.com/edgarbnt/ReactSentinel/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
```

Apply these after the npm package is live and CI has run at least once.
