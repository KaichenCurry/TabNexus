# TabNexus MCP capability test

- Script: 1.0.0
- MCP: 0.8.0
- Result: PASS
- Checks: 36/36
- Successful tools: 17/17
- Duration: 110 ms

| Check | Result | Duration |
|---|---:|---:|
| protocol:initialize | PASS | 72 ms |
| protocol:tools-list | PASS | 4 ms |
| protocol:prompts | PASS | 3 ms |
| protocol:workbench-prompt | PASS | 0 ms |
| protocol:resources-list | PASS | 2 ms |
| protocol:workbench-resource | PASS | 2 ms |
| tool:read_workspace | PASS | 1 ms |
| tool:search_cards | PASS | 1 ms |
| tool:add_card | PASS | 1 ms |
| tool:add_cards | PASS | 1 ms |
| tool:write_report | PASS | 0 ms |
| tool:propose_structure | PASS | 1 ms |
| tool:edit_workspace | PASS | 1 ms |
| tool:export_workspace | PASS | 0 ms |
| tool:manage_preferences | PASS | 1 ms |
| tool:manage_preferences | PASS | 0 ms |
| tool:manage_agent_activity | PASS | 1 ms |
| tool:manage_agent_activity | PASS | 3 ms |
| tool:read_workspace | PASS | 0 ms |
| tool:manage_workspaces | PASS | 1 ms |
| tool:delete_workspace_items | PASS | 1 ms |
| tool:delete_workspace_items | PASS | 1 ms |
| tool:read_tab_workbench | PASS | 0 ms |
| tool:manage_tab_workbench | PASS | 1 ms |
| tool:sync_browser_tabs | PASS | 0 ms |
| tool:sync_browser_tabs | PASS | 1 ms |
| tool:sync_browser_tabs | PASS | 1 ms |
| tool:read_tab_workbench | PASS | 0 ms |
| tool:dismiss_recent_tabs | PASS | 1 ms |
| tool:manage_tab_workbench | PASS | 0 ms |
| tool:close_browser_tabs | PASS | 1 ms |
| tool:read_tab_workbench | PASS | 1 ms |
| guard:close_browser_tabs:confirm | PASS | 0 ms |
| guard:dismiss_recent_tabs:confirm | PASS | 1 ms |
| guard:manage_agent_activity:confirmation | PASS | 0 ms |
| guard:edit_workspace:changed | PASS | 1 ms |

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
