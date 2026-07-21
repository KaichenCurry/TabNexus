# Security policy

## Supported version

TabNexus is currently a developer preview. Security fixes are applied to the latest version on the default branch; older dogfood builds are not supported.

## Report a vulnerability

Please do **not** open a public issue for a suspected vulnerability, exposed credential, or privacy leak.

Use GitHub's private vulnerability reporting for this repository when available. If it is not available, contact the maintainer through the repository owner's GitHub profile and ask for a private reporting channel. Include:

- affected version and environment;
- reproduction steps or a minimal proof of concept;
- expected impact;
- any suggested mitigation.

Do not include a real API key, private URL, browser title, exported workspace, or personal data. Rotate any credential that may have been exposed.

## Security model

- The MV3 extension uses `tabs`, `storage`, and `clipboardWrite`; it has no content scripts, `<all_urls>`, `webRequest`, `downloads`, or new-tab override.
- Provider hosts are allowlisted in `public/manifest.json`.
- Workspaces and provider credentials are stored in `chrome.storage.local`. This is extension-local persistence, not operating-system-level encryption.
- Provider keys are excluded from exports, fixtures, logs, Agent resources, and MCP tools.
- The MCP bridge listens only on `127.0.0.1`, validates the extension connection, uses revision-safe writes, and requires explicit confirmation proof for destructive operations.
- Pinned tabs cannot be closed through MCP.

Changes to permissions, host access, credential handling, remote transport, or destructive Agent operations require security tests and reviewer attention.
