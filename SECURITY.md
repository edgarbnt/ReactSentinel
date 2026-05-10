# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| `0.1.x` (current) | ✅ Active |
| Earlier pre-releases | ❌ Not supported |

## Scope

React-Sentinel runs as a local MCP stdio server. It opens a Playwright browser, attaches to a Chrome DevTools Protocol endpoint, and never contacts external servers on behalf of the user.

**In scope for security reports:**

- Code execution vulnerabilities triggered by crafted MCP tool input.
- Unintended credential or secret exposure through CDP, logs, or stdout/stderr.
- Supply-chain risks (malicious dependency updates).

**Out of scope:**

- Issues in the user's own React application or browser extensions.
- The Playwright project itself (report those at [github.com/microsoft/playwright](https://github.com/microsoft/playwright)).
- Social-engineering attacks against the user's AI agent.

## Reporting a vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Send a private report using one of these channels:

1. **GitHub private vulnerability reporting** — go to the repository Security tab → "Report a vulnerability".
2. **Email** — contact the maintainer directly at the email address on the npm package page.

Include:

- A description of the vulnerability and its potential impact.
- Reproduction steps or a proof-of-concept (attach files rather than pasting secrets).
- The version of `@edgarbrunet/react-sentinel` you tested against.

## Response timeline

| Stage | Target |
|---|---|
| Acknowledgement | Within 3 business days |
| Initial assessment | Within 7 business days |
| Fix + release | Depends on severity; critical issues get priority |

Thank you for helping keep React-Sentinel safe.
