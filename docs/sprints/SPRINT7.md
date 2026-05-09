# Sprint 7 Report - React-Sentinel

## Objective

Sprint 7 focused on building a **Playwright-based replay sandbox** for React-Sentinel:
- launch an isolated browser session,
- navigate to a target app and wait for it to settle,
- replay a sequence of user interactions,
- and expose the difference between attach and replay modes in the MCP API.

This sprint turned the runtime from a single attached browser view into a controlled replay environment that can reproduce bugs more deterministically.

## Key Accomplishments

### 1. Isolated Playwright browser session (SCRUM-109)
- Added and configured Playwright for the sandbox runtime.
- Launched Chromium inside an isolated browser session.
- Made the headless / headed mode configurable.
- Ensured the browser session shuts down cleanly.

**What this enables:** React-Sentinel can now create a dedicated browser context for replay work instead of relying only on the live attached tab.

### 2. Target navigation and app readiness (SCRUM-108)
- Added a MCP command to navigate to a target URL.
- Made the application wait behavior configurable so replay can pause until the app is ready.
- Returned clearer navigation failures when the target cannot be reached or does not load correctly.
- Injected the runtime bridge after navigation so replay logic remains available in the sandbox.

**What this enables:** the agent can open a specific application, wait for a stable state, and keep replay behavior attached to the right page lifecycle.

### 3. Replay of interaction sequences (SCRUM-104)
- Defined the replay step format.
- Supported the core interaction actions:
  - click
  - fill
  - wait
  - press
- Logged the result of every replay step.
- Tested a complete replay scenario on the mini-app.

**What this enables:** an AI agent can now reproduce a bug as a structured interaction trace instead of manually driving the browser.

### 4. Attach vs replay in the MCP API (SCRUM-106)
- Exposed the current session type in the API.
- Clarified how commands behave in attach mode versus replay mode.
- Documented the limits of each mode so the runtime contract stays explicit.

**What this enables:** clients can decide whether they are operating on the live attached page or on the isolated replay sandbox, which avoids ambiguity in later validation flows.

## Technical Choices

- **Isolate replay from attach:** the replay workflow was kept separate from the live attached session to avoid accidental side effects on the developer browser.
- **Make navigation explicit:** navigation and readiness are separate from replay so the sandbox can recover cleanly when a target app loads slowly or fails.
- **Use structured replay steps:** a small typed step format keeps the replay runner predictable and makes step-level logging easier to consume.
- **Surface session mode in the API:** exposing attach vs replay keeps the behavior contract visible to callers and reduces hidden runtime assumptions.

## Validation

Sprint 7 is validated in Jira by the closure of the four parent tickets and their subtasks:
- SCRUM-109, SCRUM-108, SCRUM-104, SCRUM-106 all reached `Terminé`.
- The linked subtasks for Playwright setup, navigation, replay execution, and mode clarity were also completed.

## Jira Tickets Completed

- **SCRUM-109**: [S7-01][Playwright] Lancer une instance navigateur isolée
- **SCRUM-108**: [S7-02][Replay] Naviguer vers une URL cible et attendre l’app
- **SCRUM-104**: [S7-03][Replay] Rejouer une séquence d’interactions
- **SCRUM-106**: [S7-04][Sandbox] Comparer attach vs replay dans l’API MCP

### Subtasks delivered
- **SCRUM-159**: [S7-01.01] Installer et configurer Playwright
- **SCRUM-163**: [S7-01.02] Lancer Chromium en mode isolé
- **SCRUM-161**: [S7-01.03] Rendre le mode headless/headed configurable
- **SCRUM-160**: [S7-01.04] Fermer proprement la session navigateur isolée
- **SCRUM-156**: [S7-02.01] Créer une commande MCP navigate
- **SCRUM-162**: [S7-02.02] Attendre le chargement de l’application cible
- **SCRUM-158**: [S7-02.03] Retourner les erreurs de navigation de façon exploitable
- **SCRUM-157**: [S7-02.04] Injecter le bridge runtime après navigation
- **SCRUM-169**: [S7-03.01] Définir le format des étapes de replay
- **SCRUM-167**: [S7-03.02] Supporter les actions click, fill, wait et press
- **SCRUM-168**: [S7-03.03] Journaliser le résultat de chaque étape de replay
- **SCRUM-165**: [S7-03.04] Tester un scénario complet de replay sur la mini-app
- **SCRUM-166**: [S7-04.01] Exposer le type de session attach ou replay
- **SCRUM-164**: [S7-04.02] Documenter les limites attach vs replay

