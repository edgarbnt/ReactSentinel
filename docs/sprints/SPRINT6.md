# Sprint 6 Report - React-Sentinel

## Objective

Sprint 6 focused on making React-Sentinel materially better at **runtime state inspection** for AI agents:
- extract simple React hook values from component Fibers,
- surface detectable React context values,
- reshape inspection responses for AI consumption,
- and keep rich runtime payloads safe through bounded serialization.

This sprint extends the project from "component props + runtime signals" to a more useful **component state inspection** layer where an agent can ask what a component currently holds, not only what props it received.

## Key Accomplishments

### 1. Hook State Extraction (SCRUM-110)
- Added a new MCP tool: **`get_component_state`**
- Implemented browser-side traversal of the React Fiber hook chain through `memoizedState`
- Extracted serializable values for simple hooks:
  - `useState`
  - `useRef`
  - `useMemo`
- Returned hook metadata with:
  - hook index,
  - hook kind,
  - source,
  - serialized value
- Added a stable demo fixture in the mini-app to validate real hook extraction

**What this enables:** an AI agent can inspect a component's current local state directly from the browser runtime instead of inferring it from source code.

### 2. React Context Surfacing (SCRUM-105)
- Added context extraction to **`inspect_component`**
- Surfaced context values from the inspected component through:
  - React context dependencies when available,
  - provider-based fallback detection when dependency metadata is unavailable
- Preserved context names via `displayName` when available
- Added a dedicated context fixture in the demo app using `ThemeContext`

**What this enables:** an AI can see which context values are actively shaping a component's behavior, which is critical when debugging apps that rely on providers instead of explicit props.

### 3. AI-Oriented Inspection Format (SCRUM-111)
- Enriched inspection responses with:
  - `pathText`
  - `summary`
  - consistent `responseMode`
- Added **compact mode** for `inspect_component` and `get_component_state`
- Normalized runtime inspection failures into stable prefixed error messages:
  - `get_react_tree:*`
  - `inspect_component:*`
  - `get_component_state:*`

**What this enables:** large responses are easier for an agent to summarize, compare, and route into follow-up actions without being flooded by low-signal nested payloads.

### 4. Safe Serialization Limits (SCRUM-107)
- Introduced a shared bounded serializer for runtime inspection payloads
- Added explicit safeguards for:
  - circular references,
  - maximum depth,
  - maximum array length,
  - maximum object key count,
  - maximum total traversed nodes,
  - long strings
- Added readable placeholders for complex runtime values such as:
  - functions,
  - React elements,
  - DOM elements,
  - `Map`,
  - `Set`,
  - `Date`,
  - `URL`

**What this enables:** inspection stays deterministic and safe even when runtime objects become deeply nested, recursive, or non-JSON-native.

## Technical Choices

- **One shared browser-side inspection runtime:** instead of duplicating Fiber traversal logic across multiple tools, Sprint 6 centralizes the core runtime traversal in a single browser-evaluated helper. This keeps hook extraction, context extraction, and serialization rules aligned.
- **Dependency-first context detection:** context values are resolved from React dependency metadata when available, then fall back to provider ancestry. This favors the values actually consumed by the inspected component.
- **Compact mode through stricter serialization limits:** rather than defining a second response shape, compact mode keeps the same schema but uses more aggressive payload trimming. This makes the tool easier for both humans and AI clients to consume.
- **Safe placeholders over silent drops:** complex or unsupported values are rendered as explicit placeholders (`[Circular]`, `[MaxDepthReached]`, `[Function:...]`, etc.) instead of disappearing from the payload.

## Documentation d'usage et limites (SCRUM-142)

La doc d'usage doit expliciter les limites suivantes pour que l'outil soit compréhensible côté utilisateur:

- **Hooks supportés:** extraction fiable pour les cellules React reconnues comme `useState`, `useRef` et `useMemo`.
- **Limite de parcours:** la remontée des hooks s'arrête à **25 cellules** par composant pour éviter les chaînes trop longues ou cycliques.
- **Hooks custom / non reconnus:** React-Sentinel ne devine pas le nom des custom hooks; il inspecte les cellules internes du Fiber. Si une cellule ne ressemble pas à un hook connu et que sa valeur n'est pas un primitif sérialisable, elle est ignorée plutôt qu'inventée. Les primitives non reconnues sont exposées comme `kind: "unknown"`.
- **Troncature des valeurs complexes:** les chaînes longues, tableaux, objets, `Map`, `Set`, éléments React et objets DOM sont tronqués ou remplacés par des placeholders explicites (`[MaxDepthReached]`, `[MaxNodesReached]`, `[Circular]`, `[Function:...]`, `[ReactElement:...]`, `[HTMLElement:...]`).

Ces limites sont volontaires: elles gardent les réponses stables, lisibles et exploitables par un agent IA sans faire exploser le contexte.

## Demo App Additions

Sprint 6 added a dedicated runtime fixture to `examples/test-app`:
- **`ThemeContextScenario`**
  - exposes a stable `ThemeContext`
  - consumes that context through `ThemePreview`
  - keeps a local accent state to validate hook extraction
  - allows a visible state transition via a toggle button

This fixture complements the existing counter and todo demos by providing a deterministic context-driven scenario.

## Validation

Sprint 6 was validated through compile-time, build-time, and runtime checks:

- **Root project validation**
  - `npm run check`
  - `npm run build`
- **Demo app validation**
  - `cd examples/test-app && npm run build`
- **Runtime validation**
  - verified `get_component_state` on `ThemeContextScenario`
  - verified hook extraction returns both a `state` hook and a `memo` hook
  - verified `inspect_component` on `ThemePreview` returns `ThemeContext`
  - verified compact inspection mode on `TodoList`
  - verified `summary.pathText` is present
  - verified `browserManager` cleanup remains stable after runtime inspection

## Jira Tickets Completed

- **SCRUM-110**: [S6-01][React Hooks] Extraire les hooks simples des composants
- **SCRUM-105**: [S6-02][React Context] Remonter les contextes détectables
- **SCRUM-111**: [S6-03][Inspector] Améliorer le format d’inspection pour l’IA
- **SCRUM-107**: [S6-04][Safety] Limiter et sérialiser proprement les valeurs complexes

### Subtasks delivered
- **SCRUM-146**: [S6-01.01] Explorer memoizedState dans les Fiber React
- **SCRUM-144**: [S6-01.02] Détecter les valeurs simples de useState
- **SCRUM-145**: [S6-01.03] Sérialiser les valeurs de hooks compatibles JSON
- **SCRUM-143**: [S6-01.04] Créer la commande MCP get_component_state
- **SCRUM-141**: [S6-01.05] Tester l’extraction des hooks sur la mini-app
- **SCRUM-142**: [S6-01.06] Documenter les limites d’extraction des hooks
- **SCRUM-140**: [S6-02.01] Identifier les contextes React détectables
- **SCRUM-147**: [S6-02.02] Sérialiser les valeurs simples de contexte
- **SCRUM-154**: [S6-02.03] Exposer les contextes dans l’inspection composant
- **SCRUM-155**: [S6-02.04] Tester la remontée d’un contexte sur la mini-app
- **SCRUM-152**: [S6-03.01] Définir un format résumé pour l’inspection IA
- **SCRUM-148**: [S6-03.02] Ajouter le chemin du composant dans les réponses
- **SCRUM-153**: [S6-03.03] Normaliser les erreurs d’inspection runtime
- **SCRUM-151**: [S6-03.04] Ajouter un mode compact pour les réponses longues
- **SCRUM-149**: [S6-04.01] Ajouter une sérialisation protégée contre les cycles
- **SCRUM-150**: [S6-04.02] Ajouter une limite de profondeur et de taille

## Outcome

At the end of Sprint 6, React-Sentinel can now:
- inspect a component's current hook state,
- surface detectable React context values,
- deliver AI-friendly compact inspection payloads,
- and serialize complex runtime values safely.

This makes the runtime inspector substantially more actionable for real debugging sessions, especially in React applications that rely heavily on stateful hooks and provider trees.
