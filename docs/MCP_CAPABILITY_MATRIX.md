# TabNexus MCP capability matrix

Status: v0.17.1 / MCP bridge 0.8.0

All adapters must pass the same runtime contract: MCP `0.8.0`, exactly 17 tools, four prompts, and subscribed versioned resources. `npm run bridge:audit` verifies both release packages and installed local copies; it does not infer capability parity from configuration files alone.

`npm run mcp:test` executes every tool through a real stdio MCP process and isolated local broker, including positive workflows and destructive/stale-revision guard cases. It writes a machine-readable JSON result and a Markdown report under `tests/evals/tabnexus-mcp/`.

The audit target is practical parity with normal workspace operations, not a large tool count. External Agents should be able to discover context, make one coherent revision-safe change, and receive enough result detail to continue without guessing IDs.

| Product area | External Agent coverage | MCP path |
|---|---|---|
| Discover all workspaces | Complete | `tabnexus://workspaces`, `read_workspace` index + `stateRevision` |
| Read active/specific workspace | Complete | summary by default; full notes only for selected cards |
| Watch changes | Complete | resource subscriptions and deterministic revisions |
| Search across workspaces | Complete | `search_cards` with workspace/group/status/type/source filters and opt-in notes |
| Add one source/note | Complete | `add_card` |
| Add many sources/notes/reports | Complete | atomic `add_cards`, up to 100 items, URL deduplication |
| Write a report | Complete | `write_report` |
| Rename workspace | Complete | `edit_workspace` or `manage_workspaces` |
| Create/select/reorder/duplicate workspace | Complete | atomic `manage_workspaces` |
| Delete workspace | Complete, guarded | `delete_workspace_items` with fresh workspace/app revisions, `confirm: true`, and the user's literal confirmation text |
| Create/rename/recolor group | Complete | non-destructive `edit_workspace` |
| Delete group | Complete, guarded | `delete_workspace_items`; its cards are retained |
| Classify/move/reorder cards | Complete | `move_cards`, Agent-chosen new group IDs, insertion position, `reorder_cards` |
| Edit card title/URL/type/note/status | Complete | `update_card`; duplicate or unsupported URLs are rejected |
| Delete cards | Complete, guarded | `delete_workspace_items` with explicit confirmation proof; related edges are removed |
| Group order | Complete | `reorder_groups` |
| Mind-map layout | Complete | `position_cards` and `reset_card_positions` |
| Relationships | Complete | direct upsert/remove or non-destructive `propose_structure` review |
| Inspect current Chrome window | Complete | `tabnexus://browser/current-window` with saved-card mapping |
| Inspect visible tab workbench | Complete | `tabnexus://workbench/current`, including counts, checkbox selection, rail state, saved-closed cards, and recovery entries |
| Select/clear/filter/select all | Complete | `manage_tab_workbench`; scopes match the product UI and skip pinned tabs by default |
| Collapse/expand tab rail | Complete | `manage_tab_workbench: set_collapsed`; synchronized to the visible extension UI |
| Focus an open tab | Complete | `manage_tab_workbench: focus_tab` |
| Reopen recently closed unsaved tabs | Complete | `manage_tab_workbench: reopen_recent` |
| Dismiss recently closed recovery entries | Complete, guarded | `dismiss_recent_tabs` with a fresh workbench revision and explicit confirmation proof |
| Save selected tabs | Complete | `sync_browser_tabs: save_tabs`; explicitly selected pinned tabs may be saved |
| Save all current-window tabs | Complete | `sync_browser_tabs` with `scope: "current_window"`; pinned tabs are excluded unless explicitly included |
| Reopen/focus saved cards | Complete | `sync_browser_tabs: open_cards` / `focus_card` |
| Reopen a whole group/workspace | Complete | `sync_browser_tabs: open_group` / `open_workspace`; existing URLs are not duplicated |
| Save/open/close the user's workbench selection | Complete | `scope: "workbench_selection"` with a fresh workbench revision; the selection is cleared after success |
| Save and close selected tabs | Complete, guarded | `close_browser_tabs`; saves first by default, requires literal user confirmation, never closes pinned tabs |
| Save and close the current window | Complete, guarded | `close_browser_tabs` with `scope: "current_window"`; pinned tabs remain open |
| Export Workspace | Complete | `export_workspace` returns stable Markdown or JSON without settings, keys, or tab IDs |
| Safe product preferences | Complete | `manage_preferences`; can change locale, layout, rail/composer state, grouping policy, and active provider without exposing keys |
| Read/clear Agent activity | Complete, guarded | `manage_agent_activity`; clearing requires a fresh activity revision and confirmation |
| Multi-Agent concurrency | Complete | serialized writes, workspace/app revisions, idempotent operation receipts |
| Activity attribution | Complete | originating Agent name, running/success/error state, result receipt |

## Deliberate boundaries

- No tool can read or change built-in model API keys. Provider status is exposed only as configured/verified booleans plus model name.
- No tool can change extension permissions, browser history, cookies, downloads, accounts, or cloud data.
- Internal Chrome/extension pages are never returned as manageable tabs.
- Pinned tabs can be saved when explicitly selected but cannot be closed through MCP.
- Page body extraction remains outside the extension permission model.

## Recommended Agent flow

1. Read `tabnexus://workspaces` for saved content, or `tabnexus://workbench/current` for visible tab operations.
2. Use `search_cards` before requesting many full notes.
3. Explain the intended change in one short summary.
4. Apply one atomic tool call with the latest `expectedRevision` or `expectedStateRevision`.
5. Reuse the same `operationId` if the client retries after a timeout.
6. On a revision conflict, re-read and rebuild the change instead of overwriting newer user or Agent edits.

Destructive calls must also include `confirmationText` copied from the user's latest explicit confirmation (for example, `我确认关闭这些标签`). An Agent-generated confirmation string is rejected by policy and must never be fabricated.

For new classifications, provide stable group IDs such as `agent_research` in `create_group`, then reference those IDs in later actions within the same `edit_workspace` call.
