# Sprint 3 Report - React-Sentinel

## Objective
The primary goal of Sprint 3 was to implement the **Interaction and Validation Layer**. This phase focuses on transforming React-Sentinel from a passive observer into an active agent capable of:
- Simulating user actions (clics, keyboard input).
- Verifying the consequences of these actions on the application state.
- Implementing a full "Observation -> Correction -> Validation" loop.

## Key Accomplishments

### 1. Simple Interaction Simulation (SCRUM-13)
- **Tool `simulate_interaction`**: Implemented a tool that supports `click`, `type`, and `fill` actions via Playwright.
- **Robust Selection**: Integrated `waitForSelector` with a default 3-second timeout to ensure elements are ready and visible before interaction, reducing flakiness in React's dynamic UI.
- **Structured Feedback**: Interactions return detailed results, including success/failure flags and descriptive error messages if elements are missing or obstructed.

### 2. Validation Mechanism (SCRUM-14)
- **Tool `validate_after_action`**: Created an atomic flow to perform an interaction and immediately verify an assertion.
- **Extensible Assertions**:
    - `text_present`: Validates that specific strings (e.g., success messages, counter values) appear in the DOM.
    - `no_console_errors`: Checks if the interaction triggered new JavaScript exceptions or console errors.
- **Error Buffer Management**: Added capability to clear the console event buffer before an action to ensure validations are scoped specifically to the tested interaction.

### 3. End-to-End Scenario Validation (SCRUM-15)
- **Buggy Search Demo**: Enhanced the test application with a `BuggySearch` component that crashes intentionally when searching for specific keywords.
- **Workflow Demonstration**: Successfully validated the complete debugging loop:
    1. **Detect**: Triggered a crash via interaction and captured the stack trace via `no_console_errors`.
    2. **Fix**: Applied a code modification to the React source.
    3. **Verify**: Re-ran the interaction and confirmed the absence of errors via the validation tool.

## Technical Choices

- **Atomic Interaction-Validation**: We chose to implement a combined tool (`validate_after_action`) instead of requiring the agent to call two separate tools. This reduces latency and ensures that the validation happens in the same browser context immediately after the action.
- **DOM-based Assertion**: For the first iteration, we prioritized `innerText` checks over complex snapshot testing. This is faster and more resilient to minor styling changes while remaining highly effective for functional verification.
- **Wait for Settlement**: Implemented an optional `waitMs` (default 500ms) between interaction and validation to account for React's asynchronous rendering cycles and state updates.

## Jira Tickets Completed
- **SCRUM-13**: Simulation d’interaction navigateur simple (click, type)
- **SCRUM-14**: Mécanisme minimal de validation après action
- **SCRUM-15**: Cas de test complet : détecter une erreur puis vérifier sa disparition

## Next Steps (Sprint 4)
- **Sandboxing & Safety**: Implementing "dry-run" modes and confirmation prompts for destructive actions.
- **Complex UI Interactions**: Supporting drag-and-drop, hover, and multi-step workflows.
- **State Deep-Dive**: Expanding assertions to check React internal state (hooks, context) directly after interactions.
