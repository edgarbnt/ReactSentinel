# Manual release gate

This document lists every action that **must stay manual** before and during the public launch of React-Sentinel. No agent, CI job, or automation script should perform these steps without Edgar's explicit approval.

---

## Why this gate exists

React-Sentinel operates in two modes:

1. **Repository mode** — source code visible on GitHub (low risk, mostly reversible).
2. **Package mode** — a published npm package under `@edgarbrunet/react-sentinel` (irreversible once indexed by registries and consumed by users).

The release gate separates the two and ensures Edgar retains ownership of every public reputation decision.

---

## Checklist: before making the repository public

- [ ] **Read and accept the public-readiness audit** at `docs/public-readiness-audit.md`.
- [ ] **Apply repository settings manually:**
  - Repository description (see `docs/github-visibility-plan.md`).
  - Website URL (npm page once published).
  - Topics (see `docs/github-visibility-plan.md`).
  - Social preview image (see `docs/github-visibility-plan.md` for the PNG export step).
- [ ] **Review default branch protection rules** — ensure `main` requires a passing CI check before merges.
- [ ] **Verify that no secrets are committed** — run the secret scan below.
- [ ] **Confirm `LICENSE` file exists** at the repo root (MIT).

### Secret scan command (run locally before going public)

```bash
git grep -n -E "(password|token|secret|api.?key|private.?key)\s*[:=]\s*['\"]" \
  -- ':!node_modules' ':!dist' ':!pnpm-lock.yaml' ':!package-lock.json'
```

Expected result: zero matches (the audit in `docs/public-readiness-audit.md` confirmed this as of Sprint 15).

---

## Checklist: npm publish

npm publication is **irreversible**. Once a version is indexed, it is permanently available in the npm registry.

- [ ] **Ensure the package name is exactly `@edgarbrunet/react-sentinel`** — confirm in `package.json`.
- [ ] **Bump `version`** in `package.json` to the intended release version (e.g., `0.1.0`).
- [ ] **Run the full validation suite locally:**

```bash
# From repo root
npm run check
npm run build
cd examples/test-app && npm run build
```

- [ ] **Dry-run publish** to inspect what will be uploaded:

```bash
npm pack --dry-run
```

This prints the list of files that would be included. Verify no internal docs, French notes, or agent rules are accidentally bundled. Check `package.json` for a `files` allowlist if needed.

- [ ] **Authenticate with the npm registry:**

```bash
npm login --scope=@edgarbrunet
```

- [ ] **Publish:**

```bash
npm publish --access public
```

- [ ] **Verify the published package on npm:**

```bash
npm info @edgarbrunet/react-sentinel
npx -y @edgarbrunet/react-sentinel --version
```

### Recommended `package.json` `files` allowlist

Before publishing, add a `files` field to `package.json` to limit what is uploaded:

```json
"files": [
  "dist/",
  "assets/agent-pack/",
  "README.md",
  "LICENSE"
]
```

This keeps internal docs, sprint reports, and `.agents/` out of the npm package.

---

## Checklist: post-publish GitHub actions

These steps are manual because they affect public reputation and discoverability:

- [ ] **Create a GitHub Release** tagged `v0.1.0` with a human-written changelog.
- [ ] **Create the public issues** listed in `docs/github-visibility-plan.md` (bug report, feature request, good first issue).
- [ ] **Apply repository labels** as specified in `docs/github-visibility-plan.md`.
- [ ] **Pin or close the planning issues** once they are no longer relevant.
- [ ] **Update the README badges** (npm version, CI status) once CI has run successfully on `main`.

---

## What automation is allowed to do

| Action | Allowed | Notes |
|---|---|---|
| Type-check (`npm run check`) | ✅ CI | Runs on every PR and push |
| Build (`npm run build`) | ✅ CI | Runs on every PR and push |
| Test-app build | ✅ CI | Runs on every PR and push |
| Open pull requests | ✅ Agents | Always reviewed by Edgar before merge |
| Commit and push to sprint branches | ✅ Agents | Never to `main` directly |
| `npm publish` | ❌ Never automated | Must be manual |
| Change repository visibility | ❌ Never automated | Must be manual in GitHub Settings |
| Apply repository topics/description | ❌ Never automated | Must be manual in GitHub Settings |
| Create public GitHub issues | ❌ Never automated | Must be manual (drafts provided in `docs/github-visibility-plan.md`) |
| Upload social preview image | ❌ Never automated | Must be manual in GitHub Settings |

---

## Rollback plan

If a bad version is published to npm:

1. **Deprecate immediately** (does not remove, but warns users):

```bash
npm deprecate @edgarbrunet/react-sentinel@0.1.0 "This version has a known issue. Please use 0.1.1."
```

2. **Un-publish is only possible within 72 hours** and only if no other package depends on it:

```bash
npm unpublish @edgarbrunet/react-sentinel@0.1.0
```

3. **Publish a patch version** with the fix and update documentation.

npm does not support true deletion after 72 hours; plan accordingly.
