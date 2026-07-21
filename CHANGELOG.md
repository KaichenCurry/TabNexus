# Changelog

All notable changes to TabNexus will be documented here.

## [0.17.0] - 2026-07-22

First public developer preview.

### Highlights

- Local-first Chrome MV3 workspace with multi-window tab collection, clear saved/open/closed states, deduplication, notes, reading status, filters, exports, and safe restore.
- Intent-first AI organization with editable proposals and adapters for DeepSeek, OpenAI, Claude, Kimi, Qwen, and MiniMax.
- Obsidian-inspired infinite relationship canvas with persistent positions and editable edges.
- Local multi-Agent MCP `0.8.0` with 17 workspace and tab-workbench tools, version-safe concurrent writes, idempotent retries, activity attribution, and guarded destructive actions.
- Codex, Claude Desktop, Claude Code, Cursor, VS Code, and TRAE source-install adapters.
- Chinese and English product interfaces.

### Validation

- 106 automated tests.
- 17/17 MCP tools and 36/36 deterministic capability checks.
- Curated 600-query MCP evaluation dataset with BO3 safety evaluation support.

### Known limitations

- Developer-mode source installation only; Chrome Web Store distribution is not available yet.
- Cursor, VS Code, and TRAE source installs depend on the local checkout path used during the build.
- Coze requires a future authenticated remote MCP gateway.
- Cloud sync, accounts, and team collaboration are intentionally out of scope for this preview.
