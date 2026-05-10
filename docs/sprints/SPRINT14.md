# Sprint 14 Report — Agent Plugin, Skills & Commands Pack

## Objective

The objective of Sprint 14 was to turn React-Sentinel into a project-local integration bundle ("Agent Pack") that AI coding agents (primarily Claude Code) can install, use, and manage autonomously. This included defining the pack format, creating agent-specific guidance (commands, skills, heuristics), and implementing the lifecycle management (install, update, uninstall) in the CLI.

## Key Accomplishments

- **Agent Pack Architecture**: Defined a deterministic, project-local bundle structure rooted at `.react-sentinel/agent-pack/`.
- **Agent Guidance Assets**:
    - **Commands**: Created `debug-react.md`, `reproduce-bug.md`, and `validate-fix.md` routines.
    - **Skills**: Structured the `react-sentinel-debug.md` reusable agent instructions.
    - **Heuristics**: Documented auto-use triggers and decision trees in `heuristics.md`.
- **Lifecycle Implementation**:
    - Implemented `install-agent-pack`: Copies assets and updates project-local `.mcp.json`.
    - Implemented `update-agent-pack`: Refreshes assets while detecting non-managed conflicts.
    - Implemented `uninstall-agent-pack`: Deterministically removes managed files and cleans up the MCP configuration.
- **Multi-Agent Support**: Prepared profiles for Claude Code, generic MCP, Gemini CLI, and Copilot.

## Technical Choices

- **Manifest-Driven Ownership**: Use of a `manifest.json` with content hashes ensures that React-Sentinel only touches or removes files it owns, preventing accidental deletion of user customizations.
- **Markdown-First Guidance**: All agent instructions are stored as plain Markdown files. This makes them readable by both humans and LLMs, and allows them to be portable across different agent environments.
- **MCP Config Integration**: The CLI now handles parsing and merging of `.mcp.json` files, allowing for a "one-command" setup experience similar to `claude-mem`.
- **Safe Directory Cleanup**: The uninstallation process includes a safe, deepest-first removal of empty directories to leave the project tree clean.

## Validation

- **Build**: Successfully compiled with `tsc` after all changes.
- **Functional Testing**:
    - Verified `install-agent-pack` creates the correct directory structure and `.mcp.json` entry.
    - Verified `update-agent-pack` overwrites files only when forced or when they match previous hashes.
    - Verified `uninstall-agent-pack` removes all managed files and restores `.mcp.json` to its previous state (removing the `react-sentinel` entry).
- **Conflict Detection**: Confirmed that the installer refuses to overwrite existing files that are not tracked in the manifest.

## Jira Tickets Completed

- **[SCRUM-276]**: [S14-01][Claude Code Plugin] Préparer un package/plugin installable type claude-mem
- **[SCRUM-280]**: [S14-02][Skills & Commands] Définir les skills et commandes agent pour debug React
- **[SCRUM-273]**: [S14-03][Auto Use Heuristics] Déclencher React-Sentinel au bon moment
- **[SCRUM-282]**: [S14-04][Distribution] Installer, mettre à jour et désinstaller l’intégration agent
    - [SCRUM-319]: [S14-04.01] Définir une commande install-agent-pack
    - [SCRUM-317]: [S14-04.02] Définir une commande update-agent-pack
    - [SCRUM-320]: [S14-04.03] Définir une commande uninstall-agent-pack
    - [SCRUM-321]: [S14-04.04] Gérer les conflits avec une configuration agent existante
- **[SCRUM-281]**: [S14-05][Multi-Agent Support] Préparer les profils Claude, Gemini et Copilot
