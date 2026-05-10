# Contributing to React-Sentinel

Thank you for your interest in React-Sentinel! This guide covers how to set up the project locally, propose changes, and get feedback.

## Prerequisites

- **Node.js ≥ 20** (enforced by `engines` in `package.json`)
- **npm** or **pnpm** (pnpm workspace is configured; npm works for the root package)
- A Chromium-compatible browser (Playwright installs its own)

## Local setup

```bash
git clone https://github.com/edgarbnt/ReactSentinel.git
cd ReactSentinel
npm install
npm run build
```

Verify the build:

```bash
npm run check          # TypeScript strict type-check
npm run build          # compile src/ → dist/
cd examples/test-app && npm run build   # compile the demo app
```

## Project layout

| Path | What it contains |
|---|---|
| `src/` | TypeScript source for the MCP server |
| `dist/` | Compiled output (committed for consumption as a local checkout) |
| `assets/agent-pack/` | Markdown guidance assets bundled by the CLI |
| `examples/test-app/` | Minimal Vite/React app used as the E2E fixture |
| `scripts/` | E2E smoke and diagnostic helpers |
| `docs/` | Product, workflow, and sprint documentation |
| `.github/` | CI workflows and issue/PR templates |

## Making a change

1. **Fork** the repository and create a topic branch from `main`.
2. Keep changes **focused**: one logical concern per pull request.
3. Run `npm run check && npm run build` before pushing.
4. Describe the change clearly in the PR body using the provided template.

## Commit style

Follow the [Conventional Commits](https://www.conventionalcommits.org/) prefix pattern:

```
feat: short description
fix: short description
docs: short description
chore: short description
```

Include the relevant Jira/issue ID when applicable (e.g., `fix: [SCRUM-355] add CI workflow`).

## Reporting issues

Use the GitHub issue templates:

- **Bug report** — unexpected runtime behavior or crashes.
- **Feature request** — ideas for new capabilities.
- **Good first issue** — clearly scoped tasks suitable for new contributors (labeled `good first issue`).

## Security

Please do **not** open a public issue for security vulnerabilities. See [SECURITY.md](SECURITY.md) for the responsible disclosure process.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE) that covers this project.
