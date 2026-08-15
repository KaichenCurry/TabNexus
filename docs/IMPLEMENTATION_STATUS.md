# TabNexus M0–M3 implementation status

Updated: 2026-07-22

| Area | Status | Evidence |
|---|---|---|
| MV3 extension skeleton | Complete | `extension/public/manifest.json`, module service worker, production `dist/` |
| Toolbar singleton workspace | Complete | Background action contract test |
| Versioned local data and workspaces | Complete | Storage/workspace tests and reload E2E |
| Adaptive bilingual workspace UI | Complete | Horizontal group board, compact cards with icon-only navigation, persisted 320px → 56px rail collapse, and 1440×900 visual QA |
| Save/organize/close/reopen UX | Complete | State-specific rail styling, draggable open/saved/closed items, scoped AI grouping, product confirmation dialogs, explicit save-and-close |
| Tab collection and deduplication | Complete | Workspace, UI, Chrome contract, and extension E2E tests |
| Pinned/internal tab safety | Complete | Collection filter, manifest/API tests; pinned tabs remain manually addable |
| Groups, cards, notes, drag-and-drop | Complete | Data operations, branded name/confirmation dialogs, and production UI |
| Close/focus/restore/file permission | Complete | Chrome API contract tests and explicit file-access state |
| Multi-provider AI + schema validation + fallback | Complete | DeepSeek, OpenAI, Claude, Kimi, Qwen, and MiniMax; live JSON connection validation, timeout/retry handling, typed provider errors, proposal validation tests, and domain fallback tests |
| One-level AI undo | Complete | Session-only snapshot invalidated by manual edits |
| Markdown/JSON copy and download | Complete | Export tests and modal UI |
| Settings and key privacy | Complete | Masked field test, trusted storage access, restricted manifest hosts |
| M0 clustering/review/score tools | Complete pending real samples | Synthetic fixture is runnable; 3–5 real sample sets remain external |
| H2 paired export experiment | Complete pending human run | Both variants and evaluation CSV are generated |
| Developer-mode dogfood build | Complete | 189 unit/integration tests, packaged-extension E2E scenarios, Codex/Claude Code package validation, bridge self-check, and production build pass |
| Shared board/relationship views | Complete | Persisted view preference, group swimlanes, curved edges, zoom/auto-layout, same Workspace cards/groups/edges, 1440×900 visual QA |
| Card reading progress | Complete | Three-state control in board and relationship nodes, persistence/UI tests |
| Manual relationship editing | Complete | Node drag persistence, directed links, labels, deletion, reload E2E |
| AI task-structure suggestions | Complete | Provider-aware JSON request, runtime validation, preview, undo, local cross-group fallback |
| Manual source entry | Complete | Product dialog, optional URL/note/group, normalized-URL deduplication |
| Recently closed unsaved buffer | Complete | Separate bounded storage, gray non-draggable rows, explicit reopen/dismiss actions |
| Unified AI workspace + tab operator | Complete | Intent planner, exact workspace/rail scope, validated action preview, save-before-close, pinned/ID safety, workspace undo |
| M3 Agent tool contracts | Phase 2.8 complete | 17 focused tools, four prompts, cross-workspace search, shared tab-workbench selection/control, browser synchronization, export/preferences/activity management, atomic workspace edits, and isolated guarded destructive tools |
| M3 local MCP transport | Phase 2.9 complete (v1.0.5) | Multi-Agent local broker shares one Chrome connection across Codex, Cursor, Claude, VS Code, and TRAE; every adapter receives the same workbench, workspace, export, safe-preference, and activity operations with idempotency, stale-revision protection, installed-copy audits, mixed-version detection, and source-free release installers. Codex uses a verified one-click macOS installer that registers the Marketplace, installs the plugin, and checks the enabled state. |
| M3 context continuity | Complete | Workspace/current-window/workbench resources, UI-synchronized selection and collapse state, compact/card-scoped reads, deterministic revisions, conditional reads, subscriptions, stale-write rejection, idempotent retry receipts, structured MCP outputs |
| MCP automated capability test | Complete | One-command stdio/JSON-RPC run exercises 17/17 tools, four prompts, resources, shared workbench workflows, and destructive/stale-revision guards; writes JSON and Markdown reports |
| Codex MCP evaluation harness | Complete locally | 600 unique labeled queries across 50 archetypes, isolated synthetic broker, exact 17-tool contract check, workbench-operation coverage, 100-point executable rubric, BO3 stability reports, and hard safety gates |

M2 covers the PRD's task-thinking foundation. M3 phase 2.8 lets several Agent apps launch MCP and share one connection back to Chrome through each client's official plugin, extension, or deep-link flow, without a terminal-first native-host install. Versioned and subscribable context now includes the visible tab workbench: Agents can share the user's checkbox selection, select by saved/open state, collapse the rail, focus, save, restore, close, and recover tabs while retaining guarded confirmations. The selected built-in model is independent and is never called by MCP. Signed/registry installation, the authenticated Coze gateway, cloud sync, accounts, team collaboration, and page-content extraction remain later slices.
