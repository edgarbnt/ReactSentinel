# Scenario: Diagnosis-Only Benchmark

This benchmark is meant to answer the question: **can an agent use React-Sentinel to find the problem without fixing the app?**

## Command

```bash
npm run e2e:diagnose
```

## Benchmark goal

Give the agent an application that shows a visible failure, but where the UI hides the real cause behind a generic message. The agent must:

1. reproduce the issue,
2. inspect runtime evidence,
3. isolate the useful signal,
4. state the root cause **without editing the code**.

## Fixture

The demo app now includes **Diagnosis Benchmark (API Failure)**:

- selector: `#diagnosis-query-input`
- trigger: `#diagnosis-run-button`
- failure query: `broken`
- visible result: `Status: error` and `Search temporarily unavailable.`

The UI does **not** expose the real backend error. The useful diagnosis must come from MCP runtime tools.

## Expected diagnosis

For the `broken` query, the correct conclusion is:

- the replayed request to `/api/mock/diagnosis?query=broken` fails with **HTTP 503**;
- React itself remains healthy;
- there are no client exceptions explaining the failure;
- the root cause is therefore an **upstream API outage**, not a frontend rendering crash.

## What the runner proves

The benchmark runner connects to React-Sentinel over MCP stdio and uses only the published tools to:

- reproduce the issue with `validate_scenario`,
- inspect network failures with `get_network_events`,
- rule out client crashes with `get_console_events`,
- confirm the chronology with `get_runtime_timeline`,
- emit a final diagnosis summary.

## Why this matters

This benchmark is intentionally different from the shadow-patch flow:

- **diagnosis benchmark:** prove the agent can find the cause;
- **patch benchmark:** prove the agent can test a hypothetical fix safely.

The diagnosis-only path is the right next gate for the concept because it isolates the "observe before changing code" promise.
