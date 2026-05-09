# Sprint 8 Report - React-Sentinel

## Objective

Sprint 8 focused on turning React-Sentinel's validation layer into a broader **assertion engine** that an AI agent can use after an interaction or a replay:
- validate richer DOM outcomes,
- check React runtime invariants directly,
- detect remaining console or network problems,
- and generate readable validation reports for humans and AI clients.

## Key Accomplishments

### 1. Advanced DOM Assertions (SCRUM-173)
- Extended the assertion model beyond the original `text_present` check.
- Added support for:
  - `text_absent`
  - `selector_visible`
  - `selector_hidden`
- Kept the result format structured with explicit `expected`, `actual`, `details`, and `durationMs` fields.

**What this enables:** an agent can now verify both positive and negative DOM outcomes without falling back to brittle manual page scraping.

### 2. React Runtime Assertions (SCRUM-172)
- Added `component_present` to validate that a React component exists in the current Fiber tree.
- Added `component_prop_value` for simple prop checks through dot-path access (for example `todo.completed`).
- Added `component_state_value` for simple hook-state checks with hook index targeting.
- Normalized failure messages so missing components, missing hooks, and value mismatches are explicit.

**What this enables:** an agent can now confirm React-level outcomes directly, instead of inferring success only from the DOM.

### 3. Console and Network Assertions (SCRUM-171)
- Added `no_console_warnings` alongside the existing `no_console_errors`.
- Added `no_http_5xx` and `no_unexpected_http_requests`.
- Introduced runtime signal clearing before validation so assertions are scoped to the current action sequence.
- Fixed the runtime bridge installation so fetch/XHR interception reliably survives replay navigation.

**What this enables:** validation can now fail with the exact remaining warning, error, or failing request traces that blocked success.

### 4. Validation Reports (SCRUM-170)
- Added a new MCP tool: **`validate_scenario`**
- `validate_scenario`:
  - replays a deterministic sequence,
  - evaluates multiple assertions,
  - returns a raw JSON report,
  - returns a readable Markdown report.
- The report includes:
  - action results,
  - assertion outcomes,
  - pass/fail summary,
  - relevant console and network traces.

**What this enables:** an agent can now produce a compact proof of validation instead of only a raw tool response.

## Technical Choices

- **Typed assertion union instead of loose flags:** each assertion now carries its own explicit payload (`expected`, `selector`, `componentName`, etc.), which keeps validation logic predictable and easier to extend.
- **Scenario runner built on replay infrastructure:** `validate_scenario` reuses the replay session and step executor instead of creating a second browser workflow.
- **Path-based React value lookup:** prop assertions use dot-paths and state assertions use hook indexes plus optional value paths, which keeps the API simple while still covering nested serializable values.
- **String-based runtime bridge injection:** the browser bridge is now injected from a generated source string, avoiding function-serialization issues during Playwright evaluation and restoring reliable network capture.
- **Current-root React resolution:** runtime inspection now resolves the current HostRoot fiber, which keeps state assertions aligned with the latest rendered React tree after updates.

## Validation

Sprint 8 was validated through compile-time, build-time, and runtime checks:

- **Root project validation**
  - `npm run check`
  - `npm run build`
- **Demo app validation**
  - `cd examples/test-app && npm run build`
- **Runtime validation**
  - validated DOM assertions on the mocked success scenario,
  - validated React component, prop, and state assertions on the demo app,
  - validated console/network pass assertions on the success flow,
  - validated a failing `no_http_5xx` report on the mocked error flow,
  - validated Markdown report generation with actions, assertions, and traces.

## Jira Tickets Completed

- **SCRUM-173**: [S8-01][Assertions] Ajouter des assertions DOM avancées
- **SCRUM-172**: [S8-02][Assertions] Ajouter des assertions runtime React
- **SCRUM-171**: [S8-03][Assertions] Ajouter des assertions réseau et console
- **SCRUM-170**: [S8-04][Reports] Générer un rapport de validation lisible

### Subtasks delivered
- **SCRUM-192**: [S8-01.01] Implémenter une assertion texte présent
- **SCRUM-193**: [S8-01.02] Implémenter une assertion texte absent
- **SCRUM-198**: [S8-01.03] Implémenter une assertion sélecteur visible
- **SCRUM-191**: [S8-01.04] Implémenter une assertion sélecteur caché ou absent
- **SCRUM-196**: [S8-02.01] Implémenter une assertion composant React présent
- **SCRUM-194**: [S8-02.02] Implémenter une assertion prop simple attendue
- **SCRUM-195**: [S8-02.03] Implémenter une assertion state simple attendu
- **SCRUM-197**: [S8-02.04] Normaliser les erreurs d’assertion React runtime
- **SCRUM-206**: [S8-03.01] Implémenter une assertion aucune erreur console
- **SCRUM-204**: [S8-03.02] Implémenter une assertion aucun warning critique
- **SCRUM-200**: [S8-03.03] Implémenter une assertion aucune requête HTTP 5xx
- **SCRUM-201**: [S8-03.04] Implémenter une assertion aucune requête HTTP inattendue
- **SCRUM-203**: [S8-04.01] Définir le format JSON du rapport de validation
- **SCRUM-199**: [S8-04.02] Générer un rapport Markdown lisible par l’IA
- **SCRUM-205**: [S8-04.03] Inclure les traces console et réseau pertinentes
- **SCRUM-202**: [S8-04.04] Tester le rapport sur un scénario pass et un scénario fail
