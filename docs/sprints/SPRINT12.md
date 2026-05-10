# Sprint 12 Report - React-Sentinel

## Objective

Sprint 12 focused on packaging the local MVP into something coherent, testable, and explainable before the more advanced agent-integration sprints.

The goal was to ship:

- a stable local CLI entrypoint,
- actionable onboarding and troubleshooting,
- product-level workflow documentation,
- clearer demo examples,
- and a first MVP release package with explicit limits and next steps.

## Key Accomplishments

### 1. Stable local CLI for the MVP (SCRUM-189)

- Added a real CLI surface with `start`, `doctor`, and `help`.
- Kept the stdio MCP server behavior as the default `start` path.
- Added launch options for replay mode (`--headed` / `--headless`) and the default CDP endpoint (`--cdp-endpoint`).
- Verified the CLI through a local stdio smoke run that executed MCP calls against `dist/index.js start`.

**What this enables:** React-Sentinel can now be started, diagnosed, and configured through a stable local command instead of relying on the raw source entrypoint only.

### 2. Actionable local onboarding and diagnostics (SCRUM-190)

- Improved the Chrome CDP failure path so users get:
  - the failing endpoint,
  - the Chrome launch command,
  - and an explicit replay fallback.
- Improved the missing/closed live-tab guidance for attach mode.
- Reworked the README so the local MVP flow starts with `build -> doctor -> start`.
- Added `docs/local-diagnostics-checklist.md` to cover the main recovery flows.

**What this enables:** a new local user can understand whether the problem is Node, Playwright, Chrome attach, tab selection, or the target app itself.

### 3. Product workflow documentation (SCRUM-187)

- Added `docs/workflows.md`.
- Documented the main MVP flows:
  - **Attach** for real live-tab inspection,
  - **Replay** for deterministic isolated reproduction,
  - **Sandbox / hot patch** for replay-only runtime experimentation,
  - and the **minimal MCP integration** for local clients.
- Linked the workflow guide from the README.

**What this enables:** a human developer or guided agent now has one place to understand when to use attach, replay, or sandbox mode.

### 4. Clearer MVP demo examples (SCRUM-188)

- Added a dedicated **Simple React Example** fixture to the demo app.
- Promoted the app into a clearer MVP example catalog covering:
  - simple React state + props,
  - console and network diagnostics,
  - infinite render loop behavior,
  - async race conditions,
  - and hydration mismatch on the dedicated page.
- Updated `examples/README.md` to document the fixtures that actually exist today.

**What this enables:** the demo app now reads like a curated MVP showcase instead of a loose collection of internal test fixtures.

### 5. MVP release package and sprint closing artifacts (SCRUM-186)

- Added `docs/release-mvp.md` with the final MVP checklist.
- Listed the main commands, known limits, and next steps for the local release.
- Produced this sprint report at `docs/sprints/SPRINT12.md`.

**What this enables:** Sprint 12 closes with an explicit release-ready narrative, not just implementation changes scattered across code and README updates.

## Technical Choices

- **CLI-first local MVP:** instead of introducing a new wrapper package or extra dependency, Sprint 12 extends the existing Node entrypoint into a small CLI while preserving the published stdio server behavior.
- **Configurable defaults, not duplicate tools:** replay headless/headed mode and the default CDP endpoint are now CLI-configurable through the existing browser manager and tool surface, which avoids maintaining a second attach/replay API.
- **Actionable attach failures with replay fallback:** rather than treating missing Chrome CDP as a hard blocker, the MVP now explains the fix and explicitly points users back to replay mode so the product remains usable.
- **One workflow guide for product-level understanding:** the new workflow documentation groups attach, replay, sandbox, and MCP setup into a single guide, which is easier to navigate than scattering the story across low-level tool references.
- **Examples as a catalog, not only as fixtures:** the demo app and `examples/README.md` now present the core MVP scenarios as deliberate examples that match product value, while still staying compatible with the existing smoke runner.

## Validation

- **Root project validation**
  - `npm run check`
  - `npm run build`
- **Demo app validation**
  - `cd examples/test-app && npm run build`
- **Runtime validation**
  - `npm run e2e:smoke`
  - local CLI doctor run
  - stdio smoke against `dist/index.js start --headed --cdp-endpoint http://127.0.0.1:9333`

## Jira Tickets Completed

- **SCRUM-189**: [S12-01][CLI] Stabiliser la CLI MVP de base
- **SCRUM-190**: [S12-02][DX] Finaliser l’onboarding utilisateur local
- **SCRUM-187**: [S12-03][Docs] Documenter les workflows produit Attach, Replay et Sandbox
- **SCRUM-188**: [S12-04][Examples] Ajouter des scénarios de démonstration MVP complets
- **SCRUM-186**: [S12-05][Release] Préparer une release MVP locale taggable

### Subtasks delivered

- **SCRUM-256**: [S12-01.01] Créer la commande react-sentinel start
- **SCRUM-262**: [S12-01.02] Créer la commande react-sentinel doctor
- **SCRUM-255**: [S12-01.03] Ajouter les options de lancement principales
- **SCRUM-261**: [S12-01.04] Tester la CLI sur un lancement local complet
- **SCRUM-257**: [S12-02.01] Améliorer le message quand Chrome CDP est absent
- **SCRUM-260**: [S12-02.02] Améliorer les erreurs de navigateur non connecté
- **SCRUM-258**: [S12-02.03] Ajouter un onboarding minimal dans le README
- **SCRUM-259**: [S12-02.04] Ajouter une checklist de diagnostic utilisateur
- **SCRUM-268**: [S12-03.01] Documenter le workflow Attach
- **SCRUM-263**: [S12-03.02] Documenter le workflow Replay
- **SCRUM-264**: [S12-03.03] Documenter le workflow Sandbox et hot patch
- **SCRUM-269**: [S12-03.04] Documenter l’intégration MCP minimale et pointer vers l’automatisation agent
- **SCRUM-267**: [S12-04.01] Ajouter un exemple React simple
- **SCRUM-265**: [S12-04.02] Ajouter un exemple bug console et réseau
- **SCRUM-270**: [S12-04.03] Ajouter un exemple infinite render
- **SCRUM-266**: [S12-04.04] Ajouter un exemple hydration ou async race condition
- **SCRUM-271**: [S12-05.01] Créer la checklist MVP finale
- **SCRUM-272**: [S12-05.02] Rédiger la note de release MVP
