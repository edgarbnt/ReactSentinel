# Sprint 9 Report - React-Sentinel

## Objective

Sprint 9 focused on turning the replay sandbox into a first **shadow patching** workflow for AI agents:
- define a safe ephemeral patch payload,
- inject runtime-only fixes inside the replay browser,
- validate those fixes through replay + assertions,
- and guarantee the sandbox can return to a clean state afterward.

## Key Accomplishments

### 1. Runtime Patch Format (SCRUM-177)
- Added a typed Sprint 9 MVP patch payload with:
  - `type: "script"`
  - `target: "page"`
  - `source`
  - `metadata`
- Required `metadata.expiresWithSession = true` so every patch is explicitly session-scoped.
- Added normalization and validation for:
  - empty patch rejection,
  - unsupported type / target rejection,
  - source length cap,
  - generated patch IDs when none are provided.
- Documented the MVP payload and its current limits in the public docs.

**What this enables:** an AI agent can now propose a structured temporary patch without touching the developer's files.

### 2. Runtime Patch Application in the Replay Sandbox (SCRUM-175)
- Added a new MCP tool: **`apply_runtime_patch`**
- Implemented replay-only patch injection so shadow patches never target the live attach tab.
- Preferentially register future-navigation patch scripts through CDP when available, with Playwright init-script fallback.
- Apply the same patch immediately to the current replay document with per-patch deduplication.
- Surface patch failures with explicit `[runtime_patch:<id>]` errors.
- Track active replay patches in session metadata.

**What this enables:** an agent can now test a browser-side fix experimentally inside the isolated sandbox before proposing any real source edit.

### 3. Patch + Replay + Assertions Flow (SCRUM-174)
- Added a new MCP tool: **`apply_patch_then_replay`**
- Combined:
  - runtime patch application,
  - deterministic replay steps,
  - post-replay assertions,
  - explicit verdicts: `patch_validated` or `patch_failed`.
- Added a readable Markdown report that merges patch metadata, replay results, assertions, and cleanup outcome.

**What this enables:** an AI agent can now run the full "patch -> replay -> validate" loop in one tool call and get a compact proof of success or failure.

### 4. Cleanup and Safety Guardrails (SCRUM-176)
- Added a new MCP tool: **`reset_runtime_patches`**
- Implemented cleanup by:
  - reloading the replay page when removal is safe,
  - automatically falling back to full replay-session reset when cleanup in place is not reliable.
- Ensured failed patch application resets the replay session to avoid leaking partial state.
- Documented the main guardrails:
  - replay-only scope,
  - session-bound lifetime,
  - no local file writes,
  - top-level module imports not supported in the MVP patch source,
  - cleanup fallback to session reset when necessary.

**What this enables:** temporary fixes can be tested aggressively without polluting later replay sessions.

## Technical Choices

- **Replay-only patch target:** Sprint 9 deliberately keeps hot patches inside the isolated replay sandbox instead of the live attach tab. This keeps the feature aligned with the "test without touching the developer environment" goal.
- **Single MVP patch type:** the first iteration supports only JavaScript `script` payloads targeting the page main world. This keeps validation, reporting, and cleanup predictable.
- **CDP-first init-script registration:** when Chromium exposes CDP, React-Sentinel registers patch scripts for future navigations there first, while keeping a Playwright fallback for resilience.
- **Per-document deduplication:** patch execution is wrapped in a runtime registry so the same patch ID does not re-apply twice in the same document when both init-script and immediate execution paths are used.
- **Cleanup favors correctness over cleverness:** if in-place removal cannot be trusted, React-Sentinel resets the replay session and reopens a clean page instead of leaving ambiguous patch state behind.

## Validation

Sprint 9 was validated through compile-time, build-time, and runtime checks:

- **Root project validation**
  - `npm run check`
  - `npm run build`
- **Demo app validation**
  - `cd examples/test-app && npm run build`
- **Runtime validation**
  - started the demo app on `http://127.0.0.1:5173`
  - applied an ephemeral fetch patch that converts `/api/mock/error` into a mocked `200` response
  - validated the patched replay scenario with:
    - `text_present "Error: 200 — Patched success response"`
    - `no_http_5xx`
  - reset runtime patches and confirmed the unpatched replay returns:
    - `text_present "Error: 500 — Mock error response"`

## Jira Tickets Completed

- **SCRUM-177**: [S9-01][Hot Patch] Définir le format d’un patch éphémère
- **SCRUM-175**: [S9-02][Hot Patch] Injecter un patch simple côté navigateur
- **SCRUM-174**: [S9-03][Sandbox] Exécuter patch, replay et assertions
- **SCRUM-176**: [S9-04][Safety] Isoler et nettoyer les patchs après test

### Subtasks delivered
- **SCRUM-213**: [S9-01.01] Définir le payload minimal d’un patch
- **SCRUM-211**: [S9-01.02] Définir les types de patch supportés au MVP
- **SCRUM-208**: [S9-01.03] Documenter les limites du patch éphémère
- **SCRUM-214**: [S9-01.04] Valider le format de patch avant exécution
- **SCRUM-210**: [S9-02.01] Injecter un script runtime via Playwright
- **SCRUM-209**: [S9-02.02] Injecter un script runtime via CDP si disponible
- **SCRUM-207**: [S9-02.03] Capturer les erreurs d’exécution du patch
- **SCRUM-212**: [S9-02.04] Vérifier que le patch reste limité à la session
- **SCRUM-216**: [S9-02.05] Tester le patch sur un bug simple de la mini-app
- **SCRUM-220**: [S9-02.06] Documenter les erreurs connues d’injection
- **SCRUM-215**: [S9-03.01] Créer un flux apply_patch_then_replay
- **SCRUM-217**: [S9-03.02] Lancer les assertions après replay patché
- **SCRUM-222**: [S9-03.03] Retourner un verdict patch_validated ou patch_failed
- **SCRUM-219**: [S9-03.04] Générer un rapport de validation après patch
- **SCRUM-221**: [S9-04.01] Réinitialiser la page ou session après patch
- **SCRUM-218**: [S9-04.02] Documenter les garde-fous de sécurité des patchs
