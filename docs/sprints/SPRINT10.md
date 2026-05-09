# Sprint 10 Report - React-Sentinel

## Objective

Sprint 10 focused on giving React-Sentinel a first **render-loop diagnosis** workflow for AI agents:
- reproduce a controlled render explosion in the demo app,
- count renders per component,
- detect hotspot components that rerender too fast,
- and explain unstable hook values behind those loops.

## Key Accomplishments

### 1. Reproducible Infinite Loop Fixture (SCRUM-181)
- Added a dedicated `InfiniteLoopScenario` to the demo app.
- The fixture starts a short controlled rerender burst through an effect that keeps reacting to a changing hook-derived value until a safety cap is reached.
- Documented how to trigger the fixture and what diagnosis to expect.

**What this enables:** an AI agent now has a stable demo scenario to validate render-loop tooling without freezing the app forever.

### 2. Per-Component Render Counting (SCRUM-182)
- Added a browser-side render monitor that hooks into the React commit flow in replay mode.
- Recorded per-component counters with:
  - `componentName`
  - `pathText`
  - `count`
  - `firstSeen`
  - `lastSeen`
- Added the new MCP tool **`get_render_counts`**.
- Validated the counters on the demo app through the Sprint 10 loop fixture.

**What this enables:** an AI agent can now ask which React components rerender the most during a replay session instead of guessing from source code.

### 3. Render Hotspot Detection (SCRUM-185)
- Added configurable hotspot detection based on:
  - a render-count threshold,
  - a sliding time window,
  - and renders-per-second calculation.
- Added the new MCP tool **`get_render_hotspots`**.
- Added probable-cause summaries that classify recent behavior as:
  - unstable state,
  - unstable hook value,
  - unstable props,
  - or repeated effect / chained updates.

**What this enables:** an AI agent can now spot the components that are actually exploding during replay and get a first diagnosis before opening the code.

### 4. Hook Change Timeline (SCRUM-178)
- Reused the render monitor history to persist simple hook snapshots across renders.
- Added chronological hook diffs with:
  - render IDs,
  - previous value,
  - next value,
  - suspicious hook ranking.
- Added the new MCP tool **`get_hook_changes`**.
- Validated the hook trace on `InfiniteLoopScenario`, where unstable hook values are surfaced as the likely cause.

**What this enables:** an AI agent can now move from “this component is rerendering too much” to “this specific hook value keeps changing and is likely causing the loop.”

## Technical Choices

- **Replay-only render monitoring:** Sprint 10 keeps commit tracking in the isolated replay browser, where React-Sentinel can install its own DevTools hook before page load and collect stable render history without touching a live user tab.
- **Commit-hook instrumentation first:** instead of polling the tree after the fact, the render monitor records data on React commits. This keeps render counts, hotspot windows, and hook timelines aligned with the actual runtime behavior.
- **Shared render history:** hotspot detection and hook tracing both read from the same captured sample history. That avoids duplicate instrumentation and keeps diagnostics consistent across tools.
- **Bounded snapshots:** per-component samples keep compact serialized props and hook values with bounded history. This is enough for AI diagnosis while preventing runaway payload growth.
- **Controlled demo explosion:** the new fixture deliberately stops after a safety cap, so it remains reproducible in automation while still generating enough churn to prove the monitor and hook trace flows.

## Validation

- **Root project validation**
  - `npm run check`
  - `npm run build`
- **Demo app validation**
  - `cd examples/test-app && npm run build`
- **Runtime validation**
  - `npm run e2e:smoke`
  - verified:
    - `get_render_counts`
    - `get_render_hotspots`
    - `get_hook_changes`
    - the controlled render-loop fixture on `InfiniteLoopScenario`

## Jira Tickets Completed

- **SCRUM-181**: [S10-04][Demo App] Créer un cas infinite loop reproductible
- **SCRUM-182**: [S10-01][Render Monitor] Compter les rendus par composant
- **SCRUM-185**: [S10-02][Render Monitor] Détecter les explosions de rendu
- **SCRUM-178**: [S10-03][Hooks Trace] Tracer les changements de hooks entre rendus

### Subtasks delivered
- **SCRUM-233**: [S10-04.01] Créer un composant de démo avec useEffect instable
- **SCRUM-235**: [S10-04.02] Documenter le scénario infinite loop
- **SCRUM-229**: [S10-01.01] Définir le modèle de compteur de rendu par composant
- **SCRUM-228**: [S10-01.02] Instrumenter le rendu des composants détectables
- **SCRUM-225**: [S10-01.03] Créer la commande MCP get_render_counts
- **SCRUM-224**: [S10-01.04] Tester les compteurs sur la mini-app React
- **SCRUM-227**: [S10-02.01] Définir un seuil d’alerte de rendu excessif
- **SCRUM-230**: [S10-02.02] Détecter les composants qui rendent trop vite
- **SCRUM-226**: [S10-02.03] Créer la commande MCP get_render_hotspots
- **SCRUM-223**: [S10-02.04] Ajouter un résumé de cause probable pour l’IA
- **SCRUM-234**: [S10-03.01] Capturer un snapshot simple des hooks à chaque rendu
- **SCRUM-231**: [S10-03.02] Comparer les valeurs de hooks entre deux rendus
- **SCRUM-237**: [S10-03.03] Détecter les valeurs instables répétées
- **SCRUM-232**: [S10-03.04] Créer la commande MCP get_hook_changes
- **SCRUM-238**: [S10-03.05] Résumer la cause probable d’une boucle de rendu
- **SCRUM-236**: [S10-03.06] Tester le hook trace sur un composant instable
