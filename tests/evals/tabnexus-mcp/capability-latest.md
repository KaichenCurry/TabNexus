# TabNexus MCP capability test

- Script: 1.0.0
- MCP: 0.8.0
- Result: PASS
- Checks: 36/36
- Successful tools: 17/17
- Duration: 489 ms

| Check | Result | Duration |
|---|---:|---:|
| protocol:initialize | PASS | 287 ms |
| protocol:tools-list | PASS | 13 ms |
| protocol:prompts | PASS | 7 ms |
| protocol:workbench-prompt | PASS | 1 ms |
| protocol:resources-list | PASS | 13 ms |
| protocol:workbench-resource | PASS | 13 ms |
| tool:read_workspace | PASS | 14 ms |
| tool:search_cards | PASS | 7 ms |
| tool:add_card | PASS | 9 ms |
| tool:add_cards | PASS | 6 ms |
| tool:write_report | PASS | 7 ms |
| tool:propose_structure | PASS | 5 ms |
| tool:edit_workspace | PASS | 5 ms |
| tool:export_workspace | PASS | 6 ms |
| tool:manage_preferences | PASS | 3 ms |
| tool:manage_preferences | PASS | 2 ms |
| tool:manage_agent_activity | PASS | 5 ms |
| tool:manage_agent_activity | PASS | 13 ms |
| tool:read_workspace | PASS | 5 ms |
| tool:manage_workspaces | PASS | 4 ms |
| tool:delete_workspace_items | PASS | 5 ms |
| tool:delete_workspace_items | PASS | 2 ms |
| tool:read_tab_workbench | PASS | 2 ms |
| tool:manage_tab_workbench | PASS | 6 ms |
| tool:sync_browser_tabs | PASS | 4 ms |
| tool:sync_browser_tabs | PASS | 2 ms |
| tool:sync_browser_tabs | PASS | 2 ms |
| tool:read_tab_workbench | PASS | 2 ms |
| tool:dismiss_recent_tabs | PASS | 2 ms |
| tool:manage_tab_workbench | PASS | 3 ms |
| tool:close_browser_tabs | PASS | 3 ms |
| tool:read_tab_workbench | PASS | 4 ms |
| guard:close_browser_tabs:confirm | PASS | 1 ms |
| guard:dismiss_recent_tabs:confirm | PASS | 1 ms |
| guard:manage_agent_activity:confirmation | PASS | 2 ms |
| guard:edit_workspace:changed | PASS | 3 ms |

## Successful tool coverage

- `read_workspace`
- `search_cards`
- `add_card`
- `add_cards`
- `write_report`
- `propose_structure`
- `edit_workspace`
- `manage_workspaces`
- `delete_workspace_items`
- `read_tab_workbench`
- `manage_tab_workbench`
- `dismiss_recent_tabs`
- `sync_browser_tabs`
- `close_browser_tabs`
- `export_workspace`
- `manage_preferences`
- `manage_agent_activity`
