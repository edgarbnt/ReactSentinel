# Sprint 15 Report — Public Repo Readiness & GitHub Visibility

## Objective

Sprint 15 aimed to prepare React-Sentinel for public distribution. This includes auditing the repository for public safety, producing universal install documentation, adding GitHub community health files, establishing a CI pipeline, creating GitHub visibility assets, and documenting the manual release gate that keeps the npm publish step under Edgar's exclusive control.

## Key Accomplishments

### SCRUM-327 — Universal install documentation
- Created `docs/universal-install.md` with npx, local-checkout, and Docker install flows.
- Covered all supported AI clients (Claude Code, Claude Desktop, Cursor, GitHub Copilot, Gemini CLI, generic MCP).

### SCRUM-325 / SCRUM-326 / SCRUM-323 / SCRUM-324 — Product guides
- Added `docs/integration-guides.md` with per-environment setup steps.
- Added `docs/agent-runtime-ux.md` with runtime workflow examples.
- Added `docs/adoption-checklist.md` with validation scenarios and operator checklist.
- Added `docs/workflows.md` with prompt examples and agent decision trees.

### SCRUM-348 — Public repo readiness audit
- Produced `docs/public-readiness-audit.md` documenting what stays, what moves, and what needs human decision.
- Moved `BLUEPRINT.md` and `.agents/rules/coding-style.md` to project history per the audit recommendations.
- Added `docs/local-ports.md` to centralize port and URL references.
- Updated `README.md` to reference the canonical npm package name `@edgarbrunet/react-sentinel`.
- Confirmed zero real secrets via `git grep` scan.

### SCRUM-355 — GitHub visibility assets
- **Community standard files**: Added `CONTRIBUTING.md`, `SECURITY.md`, and `CODE_OF_CONDUCT.md` at the repository root.
- **GitHub issue templates** under `.github/ISSUE_TEMPLATE/`:
  - `bug_report.yml` — structured fields for version, Node.js, AI client, steps to reproduce.
  - `feature_request.yml` — problem/solution/alternatives/audience.
  - `good_first_issue.yml` — scoped task template for new contributors.
- **PR template**: Added `.github/PULL_REQUEST_TEMPLATE.md` with a validation checklist.
- **CI workflow**: Added `.github/workflows/ci.yml` running `npm run check`, `npm run build`, and `cd examples/test-app && npm run build` on Node.js 20 and 22, triggered on pushes to `main` and `sprint/**` and on PRs to `main`.
- **Social preview asset**: Added `assets/social-preview.svg` (1280 × 640, dark-themed) and wired it into `README.md`.
- **Visibility plan doc**: Added `docs/github-visibility-plan.md` with suggested repo description, topics, labels, draft public issues (including a `good first issue` candidate), and badge snippets.

### SCRUM-422 — Manual release gate
- Added `docs/release-gate.md` with a comprehensive pre-publish checklist, npm dry-run command, files allowlist recommendation, post-publish GitHub steps, and a rollback plan.
- Clearly documents which actions CI/agents may perform vs. which remain exclusively manual for Edgar.

## Technical Choices

- **YAML issue templates over Markdown**: GitHub's form-based YAML templates provide structured field validation, making bug reports more actionable.
- **Matrix CI (Node 20 + 22)**: Ensures forward-compatibility without adding significant CI cost.
- **SVG for social preview placeholder**: SVG is source-controlled and diff-friendly; the release gate docs explain the PNG conversion step required for the GitHub social preview upload.
- **Separate visibility plan vs. release gate**: Keeps discoverability config (topics, labels, draft issues) separate from the irreversible publish checklist, making each document independently actionable.

## Validation

```
npm run check      → ✅ Type-check passed (tsc --noEmit, zero errors)
npm run build      → ✅ Compiled src/ → dist/
cd examples/test-app && npm run build → ✅ Vite build, 41 modules, 155 kB JS output
```

No TypeScript changes were made; all new files are Markdown, YAML, SVG, and one GitHub Actions workflow.

## Jira Tickets Completed

- **[SCRUM-327]**: [S15] Universal install documentation
- **[SCRUM-325]**: [S15] Integration guides
- **[SCRUM-326]**: [S15] Agent runtime UX docs
- **[SCRUM-323]**: [S15] Adoption checklist
- **[SCRUM-324]**: [S15] Workflows documentation
- **[SCRUM-348]**: [S15] Public repo readiness audit
- **[SCRUM-355]**: [S15] GitHub visibility assets (community files, CI, issue templates, social preview, visibility plan)
- **[SCRUM-422]**: [S15] Manual release gate documentation

## Manual steps remaining (not automatable)

See `docs/release-gate.md` for the full checklist. In summary:

| Action | Owner |
|---|---|
| Make repository public on GitHub | Edgar |
| Apply topics, description, website URL | Edgar |
| Upload social preview PNG | Edgar |
| Create draft issues on GitHub | Edgar |
| `npm publish --access public` | Edgar |
| Create GitHub Release | Edgar |
| Update README badges after first CI run | Edgar |
