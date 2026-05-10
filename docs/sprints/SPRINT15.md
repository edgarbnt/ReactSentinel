# Sprint 15 Report — Universal Agent Adoption & Public Repo Readiness

## Objective

The objective of Sprint 15 was to turn React-Sentinel into a clearer public product: define a safe public npm package contract, support more agent and IDE environments, rewrite the documentation around user onboarding, and prepare the repository for a public launch without automating sensitive release actions.

## Key Accomplishments

- **Universal install contract**:
    - Switched the public npm package name to `@edgarbrunet/react-sentinel`.
    - Kept the CLI binary name `react-sentinel`.
    - Updated `init-mcp` to support `auto`, `claude-code`, `claude-desktop`, `cursor`, `github-copilot`, `gemini-cli`, and `generic-mcp`.
    - Added client-aware write targets for `.mcp.json`, `.cursor/mcp.json`, `.vscode/mcp.json`, and `.gemini/settings.json`.
- **Product documentation refresh**:
    - Rewrote `README.md` into a product-facing entrypoint with a quick start and supported-environment table.
    - Added dedicated docs for universal install, integration guides, runtime UX, adoption validation, local ports, public-readiness audit, GitHub visibility planning, and the manual release gate.
    - Extended the agent-pack docs and assets with a Cursor profile and updated portability notes for Copilot and Gemini.
- **Adoption validation**:
    - Validated `init-mcp` flows for Claude Code, Cursor, GitHub Copilot / VS Code, Gemini CLI, generic MCP, and auto-detection in temporary workspaces.
    - Converted the onboarding findings into a reusable adoption checklist and explicit limitations.
- **Public repo cleanup**:
    - Produced a public-readiness audit before cleanup.
    - Moved the French root blueprint and internal agent rule file into `docs/project-history/`.
    - Centralized legitimate local URLs, ports, and CDP endpoints in `docs/local-ports.md`.
- **GitHub visibility assets**:
    - Added `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, issue templates, a PR template, a declarative labels file, and a baseline CI workflow.
    - Added a social-preview placeholder SVG and linked it from the README.
    - Drafted a GitHub visibility plan with repo description, topics, labels, badges, and seeded public issue ideas.
- **Manual release safety**:
    - Added `docs/release-gate.md` listing every action that must remain manual for Edgar.
    - Added an npm `files` allowlist and an MIT `LICENSE` file to keep package publication scoped and predictable.

## Technical Choices

- **Scoped package, stable binary**: the public npm package uses the scope `@edgarbrunet/react-sentinel`, while the command-line binary stays `react-sentinel`. This avoids collisions with the unscoped npm package while keeping CLI ergonomics familiar.
- **Client-specific MCP config roots**: `init-mcp` now differentiates between `mcpServers`-based configs and the VS Code/Copilot `servers` root. This keeps each target honest instead of pretending one JSON shape works everywhere.
- **History preserved, not deleted**: internal French notes were moved into `docs/project-history/` instead of being destroyed. The repository stays cleaner at the root while preserving useful project context.
- **Publish surface explicitly bounded**: the `files` allowlist limits what goes into the npm tarball to `dist/`, `assets/agent-pack/`, `README.md`, and `LICENSE`. This avoids leaking sprint reports, project-history notes, or internal automation files into the package.
- **Manual-only release steps**: sensitive actions such as npm publish, GitHub visibility changes, topics, social preview, and public issue creation remain manual by design. The repository now prepares these steps instead of automating them unsafely.

## Validation

- **Type-check**: `npm run check`
- **Build**: `npm run build`
- **Demo app build**: `cd examples/test-app && npm run build`
- **Smoke test**: `npm run e2e:smoke`
    - confirmed MCP connection, replay navigation, runtime inspection, validation tools, patch workflow, and hydration diagnostics.
- **Multi-client onboarding**:
    - verified `init-mcp --write` for Claude Code, Cursor, GitHub Copilot / VS Code, and Gemini CLI in temporary workspaces;
    - verified generic MCP snippet generation uses `@edgarbrunet/react-sentinel`;
    - verified `doctor --config-path` accepts the Copilot / VS Code config shape.
- **Package dry-run**: `npm pack --dry-run`
    - confirmed that `LICENSE`, `README.md`, `assets/agent-pack/`, and `dist/` are included;
    - confirmed that internal docs and historical files are excluded from the npm package.
- **MCP stdio cleanliness**:
    - confirmed `node dist/index.js mcp --headless` writes **0 bytes to stdout** during startup and uses stderr for human-readable startup logs.

## Jira Tickets Completed

- **[SCRUM-327]**: [S15-01][Universal Install] Créer l’installation universelle avec `@edgarbrunet/react-sentinel`
- **[SCRUM-325]**: [S15-02][Integration Guides] Documenter chaque environnement agent et IDE
- **[SCRUM-326]**: [S15-03][Agent Runtime UX] Définir comment les agents utilisent React-Sentinel au bon moment
- **[SCRUM-323]**: [S15-04][README Product] Refaire le README en mode produit installable
- **[SCRUM-324]**: [S15-05][Adoption Validation] Tester l’onboarding complet sur plusieurs environnements
- **[SCRUM-348]**: [S15-06][Public Repo Readiness] Nettoyer le repo public avec règles d’automatisation Copilot CLI
- **[SCRUM-355]**: [S15-07][GitHub Visibility] Optimiser visibilité avec `@edgarbrunet/react-sentinel`
- **[SCRUM-422]**: [S15-08][Manual Release Gate] Actions sensibles à valider uniquement par Edgar
