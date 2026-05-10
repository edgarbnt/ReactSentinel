# Sprint 11 Report - React-Sentinel

## Objective

Sprint 11 focused on two related debugging signals for AI agents:

- **hydration mismatches** between server HTML and client React output,
- and **async race conditions** where a late response overwrites newer UI state.

The goal was to make both issues reproducible in the demo app and diagnosable through dedicated MCP tools.

## Key Accomplishments

### 1. Next.js-Style Hydration Mismatch Fixture (SCRUM-184)
- Added a dedicated page at `examples/test-app/hydration-nextjs.html`.
- The page ships a server snapshot and hydrates it with a different client tree on load.
- The mismatch now emits real React hydration warnings and recovery errors in the replay browser.
- Added scenario documentation for reproduction and expected signals.

**What this enables:** an AI agent now has a stable hydration bug fixture instead of relying on hypothetical SSR/client divergence.

### 2. Hydration Issue Detection Tool (SCRUM-179)
- Added normalized hydration issue parsing on top of captured runtime console events.
- Introduced the new MCP tool **`get_hydration_issues`**.
- Each returned issue is:
  - tagged as `hydration`,
  - classified (`mismatch`, `replacement`, `hydration_failure`, `client_render_fallback`, `warning`),
  - and summarized by framework and severity.
- Extended the smoke runner to verify the hydration fixture through the published MCP surface.

**What this enables:** an AI agent can now ask directly for hydration problems instead of manually filtering raw console noise.

### 3. Async Timeline Diagnostics (SCRUM-183)
- Added a new async timeline model derived from captured fetch/XHR lifecycles.
- Introduced the new MCP tool **`get_async_timeline`**.
- Added a concurrent request fixture in the demo app that produces a deterministic inversion:
  - one request starts first but resolves last,
  - another starts later but resolves earlier.
- Surfaced summary signals for:
  - slow requests,
  - grouped request flows,
  - and inverted completion order.

**What this enables:** an AI agent can now inspect concurrent request order chronologically instead of inferring races from source code alone.

### 4. Readable Race Condition Diagnosis (SCRUM-180)
- Added a dedicated UI fixture where a stale `slow` response overwrites the newer `fast` intent.
- Introduced the new MCP tool **`get_race_condition_diagnosis`**.
- The diagnosis links:
  - the latest user intent,
  - the real completion order from the async timeline,
  - and the final visible UI state.
- Extended the smoke runner to prove the stale overwrite is detected end to end.

**What this enables:** an AI agent can now move from “these requests completed out of order” to “this older response overwrote the final UI and explains the inconsistency.”

## Technical Choices

- **Hydration via dedicated page:** instead of forcing a mismatch inside the main demo tree, Sprint 11 uses a separate hydration page with pre-rendered HTML and a client boot entry. This keeps the bug realistic while preserving the existing demo app flows.
- **Hydration normalization on top of console capture:** the hydration tool reuses the existing runtime console buffer rather than adding a separate browser probe. This keeps the implementation small and aligned with the real React warnings already emitted in the browser.
- **Async timeline derived from network lifecycle:** instead of instrumenting generic Promises globally, Sprint 11 derives start and settle phases from captured fetch/XHR timing. This keeps the signal deterministic and directly tied to observable UI-facing async work.
- **Race diagnosis as correlation, not guesswork:** the race-condition tool compares final UI text with request query parameters and the inverted request order. This keeps the explanation grounded in runtime evidence rather than heuristic speculation.
- **Shared mock endpoint for async and race fixtures:** the concurrent timeline fixture and the stale overwrite fixture both reuse the same delayed mock API. That avoids duplicate backend logic while still exercising two different diagnoses.

## Validation

- **Root project validation**
  - `npm run check`
  - `npm run build`
- **Demo app validation**
  - `cd examples/test-app && npm run build`
- **Runtime validation**
  - `npm run e2e:smoke`
  - verified:
    - `get_hydration_issues`
    - `get_async_timeline`
    - `get_race_condition_diagnosis`
    - the hydration mismatch page
    - the concurrent async trace fixture
    - the stale overwrite race-condition fixture

## Jira Tickets Completed

- **SCRUM-184**: [S11-02][Hydration Demo] Créer un scénario Next.js de mismatch
- **SCRUM-179**: [S11-01][Hydration] Détecter les warnings d’hydratation React ou Next.js
- **SCRUM-183**: [S11-03][Async Trace] Tracer l’ordre des promesses et requêtes
- **SCRUM-180**: [S11-04][Race Condition] Détecter un état UI écrasé par une réponse tardive

### Subtasks delivered
- **SCRUM-243**: [S11-02.01] Créer une mini page Next.js de démonstration
- **SCRUM-239**: [S11-02.02] Introduire volontairement un mismatch SSR/client
- **SCRUM-246**: [S11-02.03] Vérifier que React-Sentinel détecte le mismatch
- **SCRUM-244**: [S11-02.04] Documenter le scénario d’hydratation Next.js
- **SCRUM-245**: [S11-01.01] Capturer les warnings React liés à l’hydratation
- **SCRUM-242**: [S11-01.02] Normaliser les événements hydration_mismatch
- **SCRUM-241**: [S11-01.03] Créer la commande MCP get_hydration_issues
- **SCRUM-240**: [S11-01.04] Tester la capture sur un warning simulé
- **SCRUM-253**: [S11-03.01] Définir un schéma d’événement async
- **SCRUM-251**: [S11-03.02] Relier les événements réseau à la timeline async
- **SCRUM-250**: [S11-03.03] Tracer l’ordre de résolution des opérations async
- **SCRUM-247**: [S11-03.04] Créer la commande MCP get_async_timeline
- **SCRUM-252**: [S11-03.05] Ajouter un résumé des opérations lentes ou inversées
- **SCRUM-248**: [S11-03.06] Tester async trace sur deux requêtes concurrentes
- **SCRUM-254**: [S11-04.01] Créer un scénario de réponse tardive qui écrase l’état
- **SCRUM-249**: [S11-04.02] Générer un diagnostic race condition lisible
