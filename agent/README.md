# Agent integration

Everything required for external AI Agents lives in this directory:

- `bridge/` — the dependency-free local MCP server and native host bridge.
- `plugins/` — the canonical TabNexus Codex plugin and evaluation skill.
- `integrations/` — generated or client-specific packages for Claude, Claude Code, Codex, Cursor, VS Code, and TRAE-compatible MCP clients.

Run `pnpm agent:package` after changing the bridge contract. The command rebuilds the portable client assets from the canonical sources.

See [`docs/M3_AGENT_BRIDGE.md`](../docs/M3_AGENT_BRIDGE.md) and [`docs/MCP_CAPABILITY_MATRIX.md`](../docs/MCP_CAPABILITY_MATRIX.md).
