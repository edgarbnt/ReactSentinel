# Sprint 2 Report - React-Sentinel

## Objective
The goal of Sprint 2 was to implement core diagnostic capabilities, specifically:
- Targeted React component inspection (props, metadata).
- Runtime error and console event telemetry.
- Transitioning to a stateful browser architecture to support real-time debugging.

## Key Accomplishments
- **Stateful Browser Manager**: Refactored the `BrowserManager` from an ephemeral pattern to a persistent singleton session. This allows capturing events (like crashes) that occur after the initial page load and maintains context for future interactions.
- **Console & Error Telemetry**: Implemented the `get_console_events` tool. It captures:
    - `console.error` and `console.warn` calls.
    - Unhandled exceptions (`pageerror`).
    - Unhandled promise rejections.
- **Targeted Component Inspection**: Implemented the `inspect_component` tool.
    - Uses a DFS search on the React Fiber tree.
    - Extracts props, paths, and metadata for a specific component name.
- **Validation Suite**:
    - Updated `examples/test-app` with a "Crash Test" button to simulate runtime exceptions.
    - Verified that errors triggered by user interaction (via future interaction tools) are correctly captured and reported via the MCP protocol.

## Technical Choices
- **Persistent Context**: We shifted from a "snapshot" model to a "persistent session" model. This is critical for React applications where many errors occur during runtime interactions rather than during initial render.
- **Buffer-based Telemetry**: Implemented a circular buffer (or simple list) for console events to ensure the AI agent can "catch up" on errors that happened since the last check.

## Jira Tickets Completed
- **SCRUM-8**: Remonter les erreurs console et exceptions JavaScript au serveur MCP
- **SCRUM-9**: Ajouter une commande d’inspection d’un composant React ciblé
- **SCRUM-11**: Tester l’inspection sur une mini-application React de démonstration

## Next Steps (Sprint 3)
- **Interaction Layer**: Implementing tools for clicking, typing, and filling forms to enable end-to-end bug reproduction.
- **Advanced Inspection**: Investigating React Hooks state extraction and context provider inspection.
