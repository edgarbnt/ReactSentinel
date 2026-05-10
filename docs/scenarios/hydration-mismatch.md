# Scenario: Next.js-Style Hydration Mismatch

This fixture exists to prove that React-Sentinel can observe a classic SSR/client divergence during hydration.

## Start the demo app

```bash
cd examples/test-app
npm run dev
```

Then open:

```text
http://127.0.0.1:5173/hydration-nextjs.html
```

## What the page does

The HTML document ships a server snapshot inside `#hydration-root`, then the client boot script hydrates that
same container with a deliberately different tree:

- title changes from `SSR shell` to `Client shell`
- message changes from `Welcome from the server snapshot.` to `Welcome from the client runtime.`
- locale changes from `fr-FR` to `en-US`
- mode changes from `server` to `client`

This is intentionally close to a Next.js mismatch: the browser receives pre-rendered HTML, then React hydrates
to a different client view and emits hydration warnings.

## Expected runtime signals

- console warnings or errors mentioning hydration mismatch
- server HTML replacement / hydration failure details from React
- DOM ending in the client version after hydration recovery

## Suggested React-Sentinel flow

1. Navigate the replay browser to `http://127.0.0.1:5173/hydration-nextjs.html`.
2. Read runtime console signals.
3. Confirm that the mismatch is hydration-related instead of a network or component-state bug.
