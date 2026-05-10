# Sprint 13 Report - React-Sentinel

## Objective

Sprint 13 focused on making React-Sentinel easier for MCP clients and AI agents to adopt without manual glue code.

The goal was to ship:

- a zero-config CLI surface for explicit MCP startup,
- MCP client config generation and validation,
- automatic React project detection for local targets,
- trustworthy capability metadata for agents,
- and a machine-friendly playbook that explains how an agent should choose and use Attach, Replay, and Sandbox workflows.

## Key Accomplishments

### 1. Zero-config MCP startup path (SCRUM-274)

- Added an explicit `mcp` CLI command while keeping `start` backward-compatible.
- Added agent-friendly `--verbose` startup logs on stderr without polluting stdout MCP transport.
- Added `prepare` packaging support and validated `npx react-sentinel mcp`.
- Updated the smoke launcher to prefer the compiled CLI entrypoint and to assert child-process startup behavior.

**What this enables:** MCP clients and agents can launch React-Sentinel through a stable, explicit command instead of depending on a source-only entrypoint or ad-hoc setup.

### 2. MCP config generation and doctor validation (SCRUM-275)

- Added `init-mcp` to generate snippets for Claude Desktop and Claude Code in `local`, `global`, and `npx` modes.
- Added `--write` and `--config-path` support so React-Sentinel can update client config files directly while preserving unrelated keys.
- Extended `doctor` to validate existing MCP config files, including command shape, args, local path safety, and `npx react-sentinel mcp` wiring.
- Documented the new setup and validation flow in the README and workflow guide.

**What this enables:** a user or agent can generate, write, and validate MCP client configuration from the product itself instead of maintaining JSON by hand.

### 3. Local environment detection for React apps (SCRUM-277)

- Added `detect-project` to scan descendant `package.json` files and identify the best React, Vite React, or Next.js candidate.
- Exposed relevant scripts such as `dev`, `start`, `preview`, and `serve`, with a recommended script for the detected app.
- Added target URL suggestion and lightweight localhost probing, including explicit port parsing from scripts.
- Added a manual `--target-url` override that still works when no local React app is detected automatically.

**What this enables:** an agent can find the right local app, startup script, and likely URL before starting replay-driven debugging.

### 4. Trustworthy capability metadata for agents (SCRUM-279)

- Added `src/capabilities.ts` as the source of truth for capability names, summaries, supported modes, and backing tools.
- Defined the three capability states: `planned`, `partial`, and `available`.
- Updated `get_server_info` to return `capabilities`, `capabilityDetails`, and `capabilitiesByMode`.
- Added doctor validation and smoke assertions to ensure every available capability maps to real registered tools.
- Documented the meaning of the capability states, including why `runtime_inspection` and `shadow_sandbox` are currently partial.

**What this enables:** agents can trust the advertised capability surface and make better workflow choices based on real tool availability.

### 5. Machine-friendly agent playbook (SCRUM-278)

- Expanded `docs/workflows.md` with an agent-first React debug flow covering status checks, console, network, runtime health, tree inspection, and structured validation.
- Added replay-to-sandbox escalation guidance so agents know when to stop at diagnosis and when to validate a runtime-only hypothesis.
- Added a decision matrix comparing Attach, Replay, and Shadow Sandbox across real user state, isolation, safety, and reproducibility.
- Added prompt examples for UI bugs, network failures, render loops, and sandbox patch validation.

**What this enables:** an AI agent now has a concrete operating guide for choosing the right mode and using React-Sentinel in a consistent order.

## Technical Choices

- **CLI-first zero-config integration:** instead of adding a wrapper tool, Sprint 13 extends the existing CLI so MCP clients can launch, configure, and validate React-Sentinel through one consistent entrypoint.
- **Config generation and validation in the product:** `init-mcp` and `doctor --config-path` keep MCP onboarding close to the runtime behavior they configure, which reduces drift between docs and actual startup expectations.
- **Project detection based on package manifests and scripts:** scanning descendant `package.json` files lets React-Sentinel infer the most likely local target without imposing framework-specific project structure assumptions.
- **One source of truth for capabilities:** centralizing capability metadata in `src/capabilities.ts` prevents docs, doctor checks, and MCP server metadata from drifting apart.
- **Agent guidance embedded in existing product docs:** instead of creating a separate playbook file, Sprint 13 extends `docs/workflows.md` so the human and agent guidance stay aligned with the actual shipped workflows.

## Validation

- **Repository validation**
  - `npm run check`
  - `npm run build`
  - `npm run e2e:smoke`
- **Demo app validation**
  - `cd examples/test-app && npm run build`
- **Targeted launch and setup validation**
  - packaged `npx react-sentinel mcp` launch from a temporary install
  - `init-mcp` snippet generation and config write/merge checks
  - `doctor --config-path` validation for both valid and invalid MCP config shapes
  - `detect-project` checks for manifest detection, script recommendation, URL suggestion, and manual target URL fallback
  - `get_server_info` checks for capability state and mode grouping

## Jira Tickets Completed

- **SCRUM-274**: [S13-01][Zero Config CLI] Permettre un lancement MCP sans friction
- **SCRUM-275**: [S13-02][Config MCP] Générer la config client MCP automatiquement
- **SCRUM-277**: [S13-04][Environment Detection] Détecter projet, scripts et URL cible
- **SCRUM-279**: [S13-05][Capabilities] Fiabiliser les capabilities et leur cohérence avec les tools
- **SCRUM-278**: [S13-03][Agent Playbook] Créer un playbook machine-friendly pour agents IA

### Subtasks delivered

- **SCRUM-284**: [S13-01.01] Ajouter une commande claire `react-sentinel mcp`
- **SCRUM-289**: [S13-01.02] Permettre `npx react-sentinel mcp`
- **SCRUM-290**: [S13-01.03] Ajouter un mode `--verbose` orienté agent
- **SCRUM-286**: [S13-01.04] Vérifier le lancement en child process côté client MCP
- **SCRUM-287**: [S13-02.01] Ajouter la commande `init-mcp`
- **SCRUM-285**: [S13-02.02] Permettre l’écriture automatique de config client
- **SCRUM-283**: [S13-02.03] Étendre `doctor` pour vérifier une config MCP existante
- **SCRUM-288**: [S13-02.04] Documenter les modes local, global et npx
- **SCRUM-294**: [S13-04.01] Détecter automatiquement un package React/Next/Vite
- **SCRUM-293**: [S13-04.02] Détecter et recommander le bon script de dev
- **SCRUM-295**: [S13-04.03] Déduire ou tester l’URL locale par défaut
- **SCRUM-298**: [S13-04.04] Permettre un override manuel si la détection échoue
- **SCRUM-304**: [S13-05.01] Introduire le statut capability `partial`
- **SCRUM-301**: [S13-05.02] Vérifier que les capabilities `available` ont des tools réels
- **SCRUM-306**: [S13-05.03] Ajouter la vue `capabilitiesByMode`
- **SCRUM-302**: [S13-05.04] Documenter la sémantique planned, partial et available
- **SCRUM-292**: [S13-03.01] Définir le flow agent de debug React standard
- **SCRUM-291**: [S13-03.02] Définir le flow agent pour Replay et Sandbox
- **SCRUM-296**: [S13-03.03] Ajouter des exemples de prompts agent
- **SCRUM-297**: [S13-03.04] Documenter quand utiliser Attach, Replay ou Shadow Sandbox
