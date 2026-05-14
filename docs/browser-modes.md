# Browser Modes

React-Sentinel supports three browser modes. Choose the one that matches the kind of runtime evidence you need.

| Mode | Best for | User state | Consent | Main tradeoff |
| --- | --- | --- | --- | --- |
| **User Chrome attach** | Inspecting a real tab that already contains the user's authenticated or manually prepared state | Reuses the user's existing browser profile and selected tab | **Required** via `select_attach_tab` with `confirm: true` | Highest power, but depends on an external Chrome CDP endpoint |
| **Managed Chrome** | Reducing CDP setup friction while keeping a visible isolated browser that React-Sentinel can drive | Uses a temporary isolated profile created by React-Sentinel | Not needed for the managed profile itself | Easier than manual CDP, but still separate from the user's personal Chrome session |
| **Replay sandbox** | Deterministic reproduction, assertions, and runtime patch validation in an isolated environment | Fresh isolated Playwright context | Not needed | Lowest friction, but it does not reuse existing user session state |

## Recommended order

1. Use **user Chrome attach** when the bug depends on a real logged-in or user-prepared tab.
2. Use **managed Chrome** when attach mode is useful but the user does not want to launch Chrome with `--remote-debugging-port` manually.
3. Use **replay sandbox** when you only need deterministic reproduction, assertions, or patch verification.

## Safety notes

- **User Chrome attach** is explicit and consent-based because React-Sentinel can inspect and interact with the selected live tab.
- **Managed Chrome** uses a temporary profile directory so it does not silently reuse the user's personal browser data.
- **Replay sandbox** is the safest default when no live state is required.
