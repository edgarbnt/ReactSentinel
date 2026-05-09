# GitHub Instructions — Sprint Work (Autonomous Mode, Live Jira & Reporting)

## Objective
This document defines the operating procedure for completing an entire sprint autonomously. You must execute all parent tickets sequentially without interruption, keep the Jira board updated in real-time via the Atlassian MCP server, and document the final delivery.

## General Principles
- **Complete Autonomy**: Once the sprint is launched, process all identified tickets one after another without waiting for validation to move to the next one.
- **Single Branch**: Create **one single branch** for the entire sprint (e.g., `sprint/sprint-name`). Work exclusively on this branch.
- **Jira-Driven**: Systematically use the `mcp-atlassian` server tools to read ticket details and update their status.
- **Context-Mode Usage**: Prioritize `ctx_*` tools for analyzing logs or the codebase. Use Bash only for Git actions and test execution.

## Execution Order
1. **Planning**: Identify all parent tickets for the sprint.
2. **Sequencing**: Validate the execution order (via Jira ID, priority, or logical dependencies).
3. **Branching**: Create the unique sprint branch from the reference branch (`main` or `develop`).
4. **Continuous Execution**: Process parent tickets fluidly and without pauses between tickets.

## Workflow per Parent Ticket
For each parent ticket, strictly follow this lifecycle:

### 1. Jira Update (Start)
- Move the parent ticket and its first sub-task to **"In Progress"** (or equivalent) via `mcp-atlassian`.

### 2. Implementation and Validation
- Implement sub-tasks one by one.
- After each sub-task:
    - Test the functional behavior (not just compilation).
    - If successful, use `mcp-atlassian` to move the sub-task to the **"Done"** column.
    - Make an intermediate commit on the sprint branch.
- A sub-task is only considered finished if its test is validated and its Jira status is updated.

### 3. Parent Finalization
Once all sub-tasks of a parent are validated:
- **Jira Closure**: Move the parent ticket to the **"Done"** column via `mcp-atlassian`.
- **Push**: Push the sprint branch to the remote repository to secure progress.
- **Transition**: Immediately create/start the next parent ticket and repeat from step 1.

## Implementation Rules
- **Surgical Changes**: Modify only what is strictly necessary.
- **Reuse**: Employ helpers, patterns, and conventions already present in the project.
- **Commit Messages**: Include the Jira ticket ID in every message (e.g., `fix: [SCRUM-15] fix crash on click`).

## End of Sprint — MANDATORY DELIVERABLE
The mission ends **ONLY** when these two conditions are met:
1. The last parent ticket is marked as **"Done"** on Jira.
2. **Report Writing**: You must create a new summary file in `docs/sprints/SPRINTX.md` (replace X with the sprint number).

The report must follow the project's standardized structure:
- **Objective**: Reminder of the sprint's goals.
- **Key Accomplishments**: Detailed list of features or fixes delivered.
- **Technical Choices**: Justification for structural choices.
- **Validation**: Evidence of correct operation (tests, builds, checks).
- **Jira Tickets Completed**: Exhaustive list of closed tickets.

Once the file is created and committed, provide a global summary in the chat with the link to the branch and the new report.
