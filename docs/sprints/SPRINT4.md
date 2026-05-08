# Sprint 4 Report - React-Sentinel

## Objective

The goal of Sprint 4 was to add a first **network diagnostics layer** to React-Sentinel and make it usable end-to-end:
- capture browser-side HTTP activity,
- expose it through MCP tools,
- merge it with existing runtime signals,
- and provide a deterministic demo scenario to validate the whole flow.

This sprint extends React-Sentinel from "console + interaction debugging" to a broader **runtime observability** model where an AI agent can understand not only what crashed, but also what the application called over the network and in what order.

## Key Accomplishments

### 1. Network Event Capture (SCRUM-99)
- **Browser-side fetch interception**: `fetch` is wrapped in the page context so each request produces a structured runtime event.
- **XMLHttpRequest interception**: legacy or library-driven XHR traffic is captured the same way as `fetch`.
- **Normalized network event model**: all events now share the same fields:
  - `type`
  - `url`
  - `method`
  - `status`
  - `durationMs`
  - `timestamp`
  - `error`
- **Bounded runtime buffer**: network events are stored in a fixed-size in-browser buffer instead of growing without limit.

**What this enables:** the AI can inspect recent network activity after reproducing a bug, instead of inferring API failures from code alone.

### 2. HTTP Error Exposure for MCP (SCRUM-102)
- **Tool `get_network_events`**: added a dedicated MCP command to retrieve recent network traffic.
- **HTTP error classification**: responses in the `4xx` and `5xx` ranges are explicitly marked as network errors.
- **Compact summary for the AI**: the tool returns:
  - total events,
  - number of HTTP errors,
  - status distribution,
  - unique URLs involved.
- **Filtering support**: `onlyErrors` and `limit` make the tool usable both for broad inspection and focused diagnostics.

**What this enables:** an agent can immediately answer questions like “what request failed?”, “how many errors occurred?”, and “which endpoints are involved?”.

### 3. Unified Runtime Timeline (SCRUM-97)
- **Shared timeline schema**: introduced a common event format for:
  - console logs/warnings/errors,
  - unhandled JavaScript exceptions,
  - network events.
- **Tool `get_runtime_timeline`**: added an MCP command that returns a merged chronological event stream.
- **Stable chronological sorting**: timeline events are ordered by timestamp, with deterministic tie-breaking to keep the output stable when multiple events happen at nearly the same time.
- **High-signal summary**: the timeline includes counts by source, counts by level, and a total error count.

**What this enables:** an AI can reconstruct the actual sequence of a bug, for example:
1. a user action,
2. a network request,
3. a `500`,
4. a console error,
5. a thrown exception.

### 4. Mock API Scenario in the Demo App (SCRUM-100)
- **New demo component `MockApiScenario`**: added a reproducible UI fixture with:
  - one success request,
  - one error request.
- **Self-contained mock endpoints in Vite**:
  - `/api/mock/success` returns `200`
  - `/api/mock/error` returns `500`
- **Visible UI feedback**: the component displays the result of each scenario directly in the demo app.
- **Explicit fetch failure handling**: unexpected fetch or JSON parsing failures are surfaced in the UI instead of failing silently.

**What this enables:** Sprint 4 features can be tested locally without depending on an external API or flaky backend.

## Technical Choices

- **In-page interception instead of external proxying**: network capture is implemented by instrumenting `fetch` and `XMLHttpRequest` directly in the browser context. This keeps the architecture simple, aligned with the existing persistent Playwright session, and close to the runtime state the AI is inspecting.
- **Buffer-based retention**: network events are kept in a bounded in-browser buffer. This avoids unbounded memory growth while still giving enough recent history for diagnostics.
- **Separated tool responsibilities**:
  - `get_network_events` focuses on raw network diagnostics and summary,
  - `get_runtime_timeline` focuses on cross-signal ordering and reconstruction.
  This keeps each MCP command specialized and easier for an agent to use correctly.
- **Typed protocol first**: network and timeline payloads were formalized in shared TypeScript interfaces before tool exposure. This reduces drift between browser capture, MCP responses, and future consumers.
- **Self-contained demo infrastructure**: mocked endpoints were added through Vite middleware rather than ad-hoc client-side stubs. This produces real HTTP traffic, which is critical because the goal of the sprint was to validate network capture, not only simulate state changes.

## Validation

Sprint 4 was validated through both compile-time and runtime checks:

- **Root project validation**
  - `npm run build`
  - `npm run check`
- **Demo app validation**
  - `cd examples/test-app && npm run build`
- **Runtime validation scenarios**
  - verified `fetch` and `XMLHttpRequest` capture on a local HTTP server,
  - verified `200`, `404`, and `500` classification in `get_network_events`,
  - verified merged console/exception/network ordering in `get_runtime_timeline`,
  - verified the demo app’s mocked success/error flows through the browser with observable `200` and `500` network events.

## Jira Tickets Completed

- **SCRUM-99**: [S4-01][Network] Capturer les requêtes fetch et XHR
- **SCRUM-102**: [S4-02][Network] Exposer les erreurs HTTP au serveur MCP
- **SCRUM-97**: [S4-03][Timeline] Créer une timeline runtime unifiée
- **SCRUM-100**: [S4-04][Demo App] Ajouter un scénario API mocké dans la mini-app

### Subtasks delivered
- **SCRUM-117**: Intercepter les appels fetch côté navigateur
- **SCRUM-113**: Intercepter les appels XMLHttpRequest
- **SCRUM-118**: Normaliser le format des événements réseau
- **SCRUM-119**: Stocker les événements réseau dans un buffer runtime
- **SCRUM-115**: Identifier les réponses HTTP 4xx et 5xx
- **SCRUM-116**: Créer la commande MCP `get_network_events`
- **SCRUM-114**: Ajouter un résumé des erreurs HTTP pour l’IA
- **SCRUM-112**: Tester la remontée d’une requête HTTP en erreur
- **SCRUM-122**: Définir le schéma d’événement de timeline runtime
- **SCRUM-121**: Fusionner console, exceptions et réseau dans la timeline
- **SCRUM-124**: Trier les événements runtime par timestamp
- **SCRUM-123**: Créer la commande MCP `get_runtime_timeline`
- **SCRUM-125**: Ajouter un scénario API mocké en succès
- **SCRUM-120**: Ajouter un scénario API mocké en erreur

## Outcome

At the end of Sprint 4, React-Sentinel can now:
- observe recent browser network traffic,
- highlight failing HTTP requests,
- merge network activity with console and exception signals,
- and validate the whole diagnostic flow against a deterministic local demo scenario.

This is the first sprint where React-Sentinel provides a genuinely **multi-signal runtime narrative** instead of isolated diagnostics.

## Next Steps (Sprint 5)

- Add richer timeline filtering (by source, level, status, or URL).
- Support clearing/resetting runtime buffers in a more explicit way for test isolation.
- Expand interaction-driven validation so agents can assert not only DOM outcomes, but also runtime/network invariants after an action.
- Continue toward the broader “observe -> patch -> validate” workflow described in the project blueprint.
