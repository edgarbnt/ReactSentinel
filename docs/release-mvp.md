# React-Sentinel Local MVP Release Note

## Release scope

This MVP release focuses on the **local manual workflow** for React-Sentinel before the zero-config agent automation work planned for later sprints.

## MVP checklist

| Area | Status | Evidence |
|---|---|---|
| Local CLI start command | Done | `node dist/index.js start --headed` starts the MCP server over stdio |
| Local doctor command | Done | `node dist/index.js doctor` validates Node, replay browser, and Chrome CDP availability |
| Main launch options | Done | CLI supports `--headed` / `--headless` and `--cdp-endpoint` |
| Local onboarding | Done | README now documents build, doctor, start, MCP client wiring, and attach fallback |
| User diagnostics | Done | `docs/local-diagnostics-checklist.md` covers replay, CDP, selected-tab, and target-app failures |
| Product workflows | Done | `docs/workflows.md` documents Attach, Replay, Sandbox, and minimal MCP integration |
| MVP examples | Done | The demo app now highlights simple React, console/network, render-loop, race-condition, and hydration fixtures |
| Validation | Done | Root type-check/build, example-app build, and `npm run e2e:smoke` all passed |

## Main local commands

```bash
npm run build
node dist/index.js doctor
node dist/index.js start --headed
```

Useful variants:

```bash
node dist/index.js start --headless
node dist/index.js start --cdp-endpoint http://127.0.0.1:9333
```

## Included in this MVP

- a stable stdio CLI entrypoint for local MCP clients;
- actionable onboarding and troubleshooting guidance;
- a dedicated product workflow guide for live attach, replay, and replay-only hot patching;
- a more explicit demo app catalog for the main React-Sentinel value cases.

## Known limits

- Live attach still depends on a Chrome instance started with remote debugging enabled.
- MCP integration is still manual: the user must point the client at the React-Sentinel CLI entrypoint.
- Replay patches stay limited to runtime script injection in the isolated browser session.
- The automated agent setup layers remain intentionally deferred to later sprints.

## Next steps

- streamline client-side setup beyond the manual stdio configuration;
- build the zero-config agent integration planned for the next roadmap steps;
- keep expanding guided examples and benchmarks around real debugging workflows.
