# Public readiness audit

This audit was produced before the Sprint 15 cleanup changes for public-repo readiness.

## Safe to keep

| Path | Why it stays |
|---|---|
| `README.md` | Public product entrypoint in English |
| `docs/universal-install.md`, `docs/integration-guides.md`, `docs/agent-runtime-ux.md`, `docs/adoption-checklist.md`, `docs/workflows.md` | Public onboarding and workflow docs |
| `examples/test-app/` and `examples/README.md` | Legitimate demo and validation fixture |
| `src/`, `scripts/`, `assets/agent-pack/`, `dist/` | Product source, automation, packaged CLI output, and reusable assets |
| `docs/sprints/` | Historical delivery reports; useful as project history |
| `.github/copilot-instructions.md` | Automation config, not user-facing product documentation |

## Should document

| Topic | Evidence | Follow-up |
|---|---|---|
| Local URLs and ports | `examples/test-app/package.json`, `scripts/mcp-e2e-utils.ts`, `src/browser/index.ts`, `src/project-detection.ts`, `docs/workflows.md`, `docs/local-diagnostics-checklist.md` | Centralize them in `docs/local-ports.md` |
| Alternate CDP endpoint example | `docs/release-mvp.md`, `src/index.ts` | Keep it as a documented example rather than treating it as suspicious |
| Historical docs | `docs/sprints/*.md` | Keep them clearly framed as history, not onboarding |

## Should move

| Path | Reason |
|---|---|
| `BLUEPRINT.md` | French internal vision note at the repository root; better kept under project history |
| `.agents/rules/coding-style.md` | Internal agent rule file in French; not part of the public product surface |

## Should remove

No obviously useless temporary files, generated crash dumps, or real secrets were found during this audit.

## Needs human decision

| Topic | Why human validation is required |
|---|---|
| GitHub visibility, topics, social preview, and description | Public reputation and settings ownership belong to Edgar |
| npm publication under `@edgarbrunet/react-sentinel` | Public release is irreversible and must stay manual |
| Marketplace submissions and launch messaging | Public distribution choices must remain human-approved |

## Secret scan summary

`git grep` produced only false positives:

- `js-tokens` entries in example lockfiles;
- a demo DOM label named `render-loop-token`;
- the `username` and `password` parameter names in the browser instrumentation wrapper.

No likely real credentials, access tokens, or private keys were found.

## MCP stdio audit

- `node dist/index.js mcp --headless` produced **0 stdout bytes** during startup.
- startup and shutdown logs are emitted on **stderr** via `console.error`.
- normal `console.log` usage in `src/index.ts` is restricted to non-MCP commands such as `doctor`, `init-mcp`, and install helpers.
