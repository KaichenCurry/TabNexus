import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("MV3 background action", () => {
  it("focuses the one existing workspace tab", async () => {
    let actionHandler: (() => void) | undefined;
    const query = vi.fn(async () => [{ id: 8, windowId: 2 }]);
    const tabUpdate = vi.fn(async () => undefined);
    const windowUpdate = vi.fn(async () => undefined);
    vi.stubGlobal("chrome", {
      action: { onClicked: { addListener: (handler: () => void) => { actionHandler = handler; } } },
      runtime: {
        id: "extension-id",
        getURL: (path: string) => `chrome-extension://extension-id/${path}`,
        onInstalled: { addListener: vi.fn() },
        onMessage: { addListener: vi.fn() }
      },
      tabs: { query, update: tabUpdate, create: vi.fn() },
      windows: { update: windowUpdate },
      storage: {
        local: { setAccessLevel: vi.fn(async () => undefined) },
        session: { setAccessLevel: vi.fn(async () => undefined) }
      }
    });
    await import("../src/background");
    expect(actionHandler).toBeTypeOf("function");
    actionHandler?.();
    await vi.waitFor(() => expect(tabUpdate).toHaveBeenCalledWith(8, { active: true }));
    expect(query).toHaveBeenCalledWith({ url: "chrome-extension://extension-id/workspace.html" });
    expect(windowUpdate).toHaveBeenCalledWith(2, { focused: true });
  });

  it("validates a key with a live JSON completion and trims credential whitespace", async () => {
    let messageHandler: ((request: unknown, sender: unknown, sendResponse: (response: unknown) => void) => boolean) | undefined;
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: '{"ok":true}' } }] })
    }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("chrome", {
      action: { onClicked: { addListener: vi.fn() } },
      runtime: {
        id: "extension-id",
        getURL: (path: string) => `chrome-extension://extension-id/${path}`,
        onInstalled: { addListener: vi.fn() },
        onMessage: { addListener: (handler: typeof messageHandler) => { messageHandler = handler; } }
      },
      tabs: { query: vi.fn(), update: vi.fn(), create: vi.fn() },
      windows: { update: vi.fn() },
      storage: {
        local: { setAccessLevel: vi.fn(async () => undefined) },
        session: { setAccessLevel: vi.fn(async () => undefined) }
      }
    });
    await import("../src/background");
    const response = await new Promise<unknown>((resolve) => {
      expect(messageHandler?.({
        type: "VALIDATE_KEY",
        provider: "deepseek",
        apiKey: "  runtime-key  ",
        model: "deepseek-v4-flash"
      }, {}, resolve)).toBe(true);
    });

    expect(response).toEqual({ ok: true, data: { model: "deepseek-v4-flash" } });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.deepseek.com/chat/completions");
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ Authorization: "Bearer runtime-key" });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      model: "deepseek-v4-flash",
      thinking: { type: "disabled" },
      response_format: { type: "json_object" }
    });
  });

  it("preserves actionable provider failures instead of collapsing them into unavailable", async () => {
    let messageHandler: ((request: unknown, sender: unknown, sendResponse: (response: unknown) => void) => boolean) | undefined;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, _init?: RequestInit) => ({
      ok: false,
      status: 402,
      json: async () => ({ error: { message: "Insufficient balance" } })
    })));
    vi.stubGlobal("chrome", {
      action: { onClicked: { addListener: vi.fn() } },
      runtime: {
        id: "extension-id",
        getURL: (path: string) => `chrome-extension://extension-id/${path}`,
        onInstalled: { addListener: vi.fn() },
        onMessage: { addListener: (handler: typeof messageHandler) => { messageHandler = handler; } }
      },
      tabs: { query: vi.fn(), update: vi.fn(), create: vi.fn() },
      windows: { update: vi.fn() },
      storage: {
        local: { setAccessLevel: vi.fn(async () => undefined) },
        session: { setAccessLevel: vi.fn(async () => undefined) }
      }
    });
    await import("../src/background");
    const response = await new Promise<unknown>((resolve) => {
      messageHandler?.({
        type: "VALIDATE_KEY",
        provider: "deepseek",
        apiKey: "runtime-key",
        model: "deepseek-v4-flash"
      }, {}, resolve);
    });

    expect(response).toEqual({
      ok: false,
      code: "balance",
      error: "Insufficient balance",
      retryable: false
    });
  });

  it("adapts Claude validation to the Anthropic Messages API", async () => {
    let messageHandler: ((request: unknown, sender: unknown, sendResponse: (response: unknown) => void) => boolean) | undefined;
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => ({ content: [{ type: "text", text: '{"ok":true}' }] })
    }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("chrome", {
      action: { onClicked: { addListener: vi.fn() } },
      runtime: {
        id: "extension-id",
        getURL: (path: string) => `chrome-extension://extension-id/${path}`,
        onInstalled: { addListener: vi.fn() },
        onMessage: { addListener: (handler: typeof messageHandler) => { messageHandler = handler; } }
      },
      tabs: { query: vi.fn(), update: vi.fn(), create: vi.fn() },
      windows: { update: vi.fn() },
      storage: {
        local: { setAccessLevel: vi.fn(async () => undefined) },
        session: { setAccessLevel: vi.fn(async () => undefined) }
      }
    });
    await import("../src/background");
    const response = await new Promise<unknown>((resolve) => messageHandler?.({
      type: "VALIDATE_KEY",
      provider: "anthropic",
      apiKey: "  anthropic-local-key  ",
      model: "claude-sonnet-5"
    }, {}, resolve));
    expect(response).toEqual({ ok: true, data: { model: "claude-sonnet-5" } });
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.anthropic.com/v1/messages");
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({
      "x-api-key": "anthropic-local-key",
      "anthropic-version": "2023-06-01"
    });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body).toMatchObject({ model: "claude-sonnet-5", max_tokens: 64 });
    expect(body).not.toHaveProperty("response_format");
  });

  it("routes trusted M3 Agent tools through the versioned workspace store", async () => {
    let messageHandler: ((request: unknown, sender: unknown, sendResponse: (response: unknown) => void) => boolean) | undefined;
    const stored: Record<string, unknown> = {
      "tabnexus.settings.v1": { locale: "zh" },
      "tabnexus.appState.v1": {
        schemaVersion: 1,
        activeWorkspaceId: "ws",
        workspaceOrder: ["ws"],
        workspaces: {
          ws: {
            id: "ws",
            name: "M3",
            createdAt: "2026-07-21T00:00:00.000Z",
            updatedAt: "2026-07-21T00:00:00.000Z",
            groupOrder: ["research"],
            groups: { research: { id: "research", name: "Research", color: "#7A6EDC", cardIds: [] } },
            cards: {},
            edges: []
          }
        }
      }
    };
    vi.stubGlobal("chrome", {
      action: { onClicked: { addListener: vi.fn() } },
      runtime: {
        id: "extension-id",
        getURL: (path: string) => `chrome-extension://extension-id/${path}`,
        onInstalled: { addListener: vi.fn() },
        onMessage: { addListener: (handler: typeof messageHandler) => { messageHandler = handler; } }
      },
      tabs: { query: vi.fn(), update: vi.fn(), create: vi.fn() },
      windows: { update: vi.fn() },
      storage: {
        local: {
          get: vi.fn(async (key: string) => ({ [key]: stored[key] })),
          set: vi.fn(async (patch: Record<string, unknown>) => Object.assign(stored, patch)),
          setAccessLevel: vi.fn(async () => undefined)
        },
        session: { setAccessLevel: vi.fn(async () => undefined) }
      }
    });
    await import("../src/background");
    const send = (request: unknown) => new Promise<any>((resolve) => messageHandler?.(request, {}, resolve));
    const context = await send({ type: "M3_AGENT_TOOL", payload: { tool: "read_workspace" } });
    expect(context.data).toMatchObject({
      tool: "read_workspace",
      unchanged: false,
      detail: "summary",
      activeWorkspaceId: "ws",
      workspaceIndex: [{ id: "ws", cardCount: 0 }]
    });
    const response = await send({
        type: "M3_AGENT_TOOL",
        payload: {
          tool: "write_report",
          input: {
            title: "Agent report",
            content: "Findings",
            groupId: "research",
            expectedRevision: context.data.revision,
            operationId: "research-run:report-1"
          }
        }
    });
    const retry = await send({
      type: "M3_AGENT_TOOL",
      payload: {
        tool: "write_report",
        input: {
          title: "Agent report",
          content: "Findings",
          groupId: "research",
          expectedRevision: context.data.revision,
          operationId: "research-run:report-1"
        }
      }
    });

    expect(response.ok).toBe(true);
    expect(response.data.tool).toBe("write_report");
    expect(retry).toEqual(response);
    const nextState = stored["tabnexus.appState.v1"] as any;
    const report = nextState.workspaces.ws.cards[response.data.cardId];
    expect(report).toMatchObject({ title: "Agent report", note: "Findings", source: "agent", type: "report" });
    expect(Object.keys(nextState.workspaces.ws.cards)).toHaveLength(1);
    expect(stored["tabnexus.agentActivity.v1"]).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "agent_op_ws_research-run:report-1",
        workspaceId: "ws",
        tool: "write_report",
        status: "success",
        summary: "Agent 写回报告“Agent report”",
        result: expect.objectContaining({ operationId: "research-run:report-1" })
      })
    ]));
    expect(stored["tabnexus.agentOperationReceipts.v1"]).toEqual([
      expect.objectContaining({
        id: "agent_op_ws_research-run:report-1",
        workspaceId: "ws",
        operationId: "research-run:report-1",
        result: expect.objectContaining({ cardId: response.data.cardId })
      })
    ]);

    const latest = await send({ type: "M3_AGENT_TOOL", payload: { tool: "read_workspace" } });
    const competingWrites = await Promise.all([
      send({
        type: "M3_AGENT_TOOL",
        payload: { tool: "add_card", input: { title: "Codex source", expectedRevision: latest.data.revision, operationId: "codex:add-1" } }
      }),
      send({
        type: "M3_AGENT_TOOL",
        payload: { tool: "add_card", input: { title: "Cursor source", expectedRevision: latest.data.revision, operationId: "cursor:add-1" } }
      })
    ]);
    expect(competingWrites.filter((result) => result.ok)).toHaveLength(1);
    expect(competingWrites.filter((result) => !result.ok)).toEqual([
      expect.objectContaining({ code: "conflict", error: expect.stringContaining("Workspace changed") })
    ]);
    expect(Object.keys((stored["tabnexus.appState.v1"] as any).workspaces.ws.cards)).toHaveLength(2);

    const afterWrites = await send({ type: "M3_AGENT_TOOL", payload: { tool: "read_workspace" } });
    const workspaceManagementRequest = {
      type: "M3_AGENT_TOOL",
      payload: {
        tool: "manage_workspaces",
        input: {
          expectedStateRevision: afterWrites.data.stateRevision,
          operationId: "agent:workspace-create-1",
          actions: [{ type: "create_workspace", workspaceId: "agent_project", name: "Agent project", makeActive: false }]
        }
      }
    };
    const managed = await send(workspaceManagementRequest);
    const managedRetry = await send(workspaceManagementRequest);
    expect(managed).toMatchObject({ ok: true, data: { tool: "manage_workspaces", createdWorkspaceIds: ["agent_project"], activeWorkspaceId: "ws" } });
    expect(managedRetry).toEqual(managed);
    expect((stored["tabnexus.appState.v1"] as any).workspaceOrder).toEqual(["ws", "agent_project"]);
  });

  it("persists a fresh default workspace before the first MCP write", async () => {
    let messageHandler: ((request: unknown, sender: unknown, sendResponse: (response: unknown) => void) => boolean) | undefined;
    const stored: Record<string, unknown> = { "tabnexus.settings.v1": { locale: "zh" } };
    vi.stubGlobal("chrome", {
      action: { onClicked: { addListener: vi.fn() } },
      runtime: {
        id: "extension-id",
        getURL: (path: string) => `chrome-extension://extension-id/${path}`,
        onInstalled: { addListener: vi.fn() },
        onMessage: { addListener: (handler: typeof messageHandler) => { messageHandler = handler; } }
      },
      tabs: { query: vi.fn(async () => []), update: vi.fn(), create: vi.fn() },
      windows: { update: vi.fn() },
      storage: {
        local: {
          get: vi.fn(async (key: string) => ({ [key]: stored[key] })),
          set: vi.fn(async (patch: Record<string, unknown>) => Object.assign(stored, patch)),
          setAccessLevel: vi.fn(async () => undefined)
        },
        session: { setAccessLevel: vi.fn(async () => undefined) }
      }
    });
    await import("../src/background");
    const send = (request: unknown) => new Promise<any>((resolve) => messageHandler?.(request, {}, resolve));

    const initial = await send({ type: "M3_AGENT_TOOL", payload: { tool: "read_workspace" } });
    const persisted = stored["tabnexus.appState.v1"] as any;
    expect(persisted.activeWorkspaceId).toBe(initial.data.activeWorkspaceId);
    expect(persisted.workspaces[persisted.activeWorkspaceId]).toBeTruthy();

    const grouped = await send({
      type: "M3_AGENT_TOOL",
      payload: {
        tool: "edit_workspace",
        input: {
          expectedRevision: initial.data.revision,
          operationId: "fresh:create-group",
          actions: [{ type: "create_group", groupId: "agent_research", name: "Agent research", color: "#5368AC" }]
        }
      }
    });
    expect(grouped).toMatchObject({ ok: true, data: { tool: "edit_workspace", createdGroupIds: ["agent_research"] } });

    const added = await send({
      type: "M3_AGENT_TOOL",
      payload: {
        tool: "add_card",
        input: {
          title: "First saved source",
          groupId: "agent_research",
          expectedRevision: grouped.data.revision,
          operationId: "fresh:add-card"
        }
      }
    });
    expect(added).toMatchObject({ ok: true, data: { tool: "add_card", cardId: expect.any(String) } });

    const latest = await send({ type: "M3_AGENT_TOOL", payload: { tool: "read_workspace", input: { detail: "full" } } });
    expect(latest.data.workspace.groups.agent_research.name).toBe("Agent research");
    expect(latest.data.workspace.cards[added.data.cardId].title).toBe("First saved source");
  });

  it("exports workspaces and manages safe preferences and Agent activity without exposing keys", async () => {
    let messageHandler: ((request: unknown, sender: unknown, sendResponse: (response: unknown) => void) => boolean) | undefined;
    const secret = "unit-test-secret-must-never-leave-settings";
    const stored: Record<string, unknown> = {
      "tabnexus.settings.v1": {
        locale: "zh",
        aiEnabled: true,
        aiProvider: "deepseek",
        aiProviderConfigs: { deepseek: { apiKey: secret, model: "deepseek-v4-flash", verifiedAt: "2026-07-22T00:00:00.000Z" } }
      },
      "tabnexus.appState.v1": {
        schemaVersion: 1,
        activeWorkspaceId: "ws",
        workspaceOrder: ["ws"],
        workspaces: {
          ws: {
            id: "ws", name: "Export me", createdAt: "2026-07-21T00:00:00.000Z", updatedAt: "2026-07-21T00:00:00.000Z",
            groupOrder: [], groups: {}, cards: {
              source: { id: "source", type: "web", title: "Source", url: "https://example.com/", note: "Useful", status: "unread", groupId: null, source: "user" }
            }, edges: []
          }
        }
      }
    };
    vi.stubGlobal("chrome", {
      action: { onClicked: { addListener: vi.fn() } },
      runtime: {
        id: "extension-id",
        getURL: (path: string) => `chrome-extension://extension-id/${path}`,
        onInstalled: { addListener: vi.fn() },
        onMessage: { addListener: (handler: typeof messageHandler) => { messageHandler = handler; } }
      },
      tabs: { query: vi.fn(async () => []), update: vi.fn(), create: vi.fn() },
      windows: { update: vi.fn() },
      storage: {
        local: {
          get: vi.fn(async (key: string) => ({ [key]: stored[key] })),
          set: vi.fn(async (patch: Record<string, unknown>) => Object.assign(stored, patch)),
          setAccessLevel: vi.fn(async () => undefined)
        },
        session: { setAccessLevel: vi.fn(async () => undefined) }
      }
    });
    await import("../src/background");
    const send = (request: unknown) => new Promise<any>((resolve) => messageHandler?.(request, {}, resolve));

    const exported = await send({ type: "M3_AGENT_TOOL", payload: { tool: "export_workspace", input: { format: "json" } } });
    expect(exported).toMatchObject({ ok: true, data: { tool: "export_workspace", format: "json", filename: "Export-me.json" } });
    expect(exported.data.content).toContain('"title": "Source"');
    expect(exported.data.content).not.toContain(secret);
    expect(exported.data.content).not.toContain("aiProviderConfigs");

    const preferences = await send({ type: "M3_AGENT_TOOL", payload: { tool: "manage_preferences", input: { action: "read" } } });
    expect(preferences).toMatchObject({ ok: true, data: { preferences: { aiProvider: "deepseek", providers: { deepseek: { configured: true, verified: true } } } } });
    expect(JSON.stringify(preferences)).not.toContain(secret);
    expect(JSON.stringify(preferences)).not.toContain("apiKey");
    const updated = await send({
      type: "M3_AGENT_TOOL",
      payload: {
        tool: "manage_preferences",
        input: {
          action: "update",
          expectedRevision: preferences.data.revision,
          operationId: "preferences:update-1",
          preferences: { workspaceView: "flow", rightRailCollapsed: true, groupingPolicy: "automatic" }
        }
      }
    });
    expect(updated).toMatchObject({ ok: true, data: { changed: true, preferences: { workspaceView: "flow", rightRailCollapsed: true, groupingPolicy: "automatic" } } });
    expect((stored["tabnexus.settings.v1"] as any).aiProviderConfigs.deepseek.apiKey).toBe(secret);
    const stale = await send({
      type: "M3_AGENT_TOOL",
      payload: { tool: "manage_preferences", input: { action: "update", expectedRevision: preferences.data.revision, operationId: "preferences:stale", preferences: { locale: "en" } } }
    });
    expect(stale).toMatchObject({ ok: false, code: "conflict", error: expect.stringContaining("Preferences changed") });

    const activity = await send({ type: "M3_AGENT_TOOL", payload: { tool: "manage_agent_activity", input: { action: "read" } } });
    expect(activity).toMatchObject({ ok: true, data: { action: "read", activities: expect.arrayContaining([expect.objectContaining({ tool: "export_workspace" })]) } });
    const cleared = await send({
      type: "M3_AGENT_TOOL",
      payload: { tool: "manage_agent_activity", input: { action: "clear", expectedRevision: activity.data.revision, operationId: "activity:clear-1", confirm: true, confirmationText: "我确认清空协作记录" } }
    });
    expect(cleared).toMatchObject({ ok: true, data: { action: "clear", activities: [], cleared: expect.any(Number) } });
    expect(stored["tabnexus.agentActivity.v1"]).toEqual([]);
  });

  it("lets an Agent save, reopen, focus, and safely close real current-window tabs", async () => {
    let messageHandler: ((request: unknown, sender: unknown, sendResponse: (response: unknown) => void) => boolean) | undefined;
    const stored: Record<string, unknown> = {
      "tabnexus.settings.v1": { locale: "zh", agentBridgeEnabled: false },
      "tabnexus.appState.v1": {
        schemaVersion: 1,
        activeWorkspaceId: "ws",
        workspaceOrder: ["ws"],
        workspaces: {
          ws: {
            id: "ws", name: "Browser operations", createdAt: "2026-07-21T00:00:00.000Z", updatedAt: "2026-07-21T00:00:00.000Z",
            groupOrder: ["saved"], groups: { saved: { id: "saved", name: "Saved", color: "#5368AC", cardIds: [] } }, cards: {}, edges: []
          }
        }
      },
      "tabnexus.recentlyClosed.v1": [
        { id: "recent-1", title: "Recovered one", url: "https://recent.example/one", closedAt: "2026-07-22T00:00:00.000Z" },
        { id: "recent-2", title: "Recovered two", url: "https://recent.example/two", closedAt: "2026-07-22T00:01:00.000Z" }
      ]
    };
    let tabs: any[] = [
      { id: 10, windowId: 1, title: "One", url: "https://example.com/one", pinned: false, active: true },
      { id: 11, windowId: 1, title: "Pinned", url: "https://example.com/pinned", pinned: true, active: false },
      { id: 12, windowId: 1, title: "Two", url: "https://example.com/two", pinned: false, active: false }
    ];
    const tabCreate = vi.fn(async ({ url, active }: { url: string; active: boolean }) => {
      const tab = { id: 100 + tabs.length, windowId: 1, title: url, url, pinned: false, active };
      tabs.push(tab);
      return tab;
    });
    const tabUpdate = vi.fn(async () => undefined);
    const tabRemove = vi.fn(async (ids: number[]) => { tabs = tabs.filter((tab) => !ids.includes(tab.id)); });
    vi.stubGlobal("chrome", {
      action: { onClicked: { addListener: vi.fn() } },
      extension: { isAllowedFileSchemeAccess: vi.fn(async () => true) },
      runtime: {
        id: "extension-id",
        getURL: (path: string) => `chrome-extension://extension-id/${path}`,
        onInstalled: { addListener: vi.fn() },
        onMessage: { addListener: (handler: typeof messageHandler) => { messageHandler = handler; } }
      },
      tabs: { query: vi.fn(async () => tabs), update: tabUpdate, create: tabCreate, remove: tabRemove },
      windows: { update: vi.fn(async () => undefined) },
      storage: {
        local: {
          get: vi.fn(async (key: string) => ({ [key]: stored[key] })),
          set: vi.fn(async (patch: Record<string, unknown>) => Object.assign(stored, patch)),
          setAccessLevel: vi.fn(async () => undefined)
        },
        session: { setAccessLevel: vi.fn(async () => undefined) }
      }
    });
    await import("../src/background");
    const send = (request: unknown) => new Promise<any>((resolve) => messageHandler?.(request, {}, resolve));
    const initial = await send({ type: "M3_AGENT_TOOL", payload: { tool: "read_workspace" } });
    const saved = await send({
      type: "M3_AGENT_TOOL",
      payload: {
        tool: "sync_browser_tabs",
        input: { action: "save_tabs", tabIds: [10, 11], groupId: "saved", expectedRevision: initial.data.revision, operationId: "browser:save-1" }
      }
    });
    expect(saved).toMatchObject({ ok: true, data: { tool: "sync_browser_tabs", savedCardIds: [expect.any(String), expect.any(String)], failed: 0 } });

    const focusedCardId = saved.data.savedCardIds[0];
    const focused = await send({
      type: "M3_AGENT_TOOL",
      payload: {
        tool: "sync_browser_tabs",
        input: { action: "focus_card", cardId: focusedCardId, expectedRevision: saved.data.revision, operationId: "browser:focus-1" }
      }
    });
    expect(focused).toMatchObject({ ok: true, data: { focusedCardId, existing: 1 } });
    expect(tabUpdate).toHaveBeenCalledWith(10, { active: true });

    const workbench = await send({ type: "M3_AGENT_TOOL", payload: { tool: "read_tab_workbench" } });
    expect(workbench).toMatchObject({
      ok: true,
      data: { tool: "read_tab_workbench", workbench: { counts: { open: 3, selected: 0 }, selectedTabIds: [] } }
    });
    const selected = await send({
      type: "M3_AGENT_TOOL",
      payload: {
        tool: "manage_tab_workbench",
        input: {
          expectedRevision: workbench.data.revision,
          operationId: "workbench:select-all-1",
          actions: [{ type: "select_all", scope: "open", includePinned: true }, { type: "set_collapsed", collapsed: true }]
        }
      }
    });
    expect(selected).toMatchObject({
      ok: true,
      data: { tool: "manage_tab_workbench", workbench: { collapsed: true, selectedTabIds: [10, 11, 12], counts: { selected: 3 } } }
    });
    const closed = await send({
      type: "M3_AGENT_TOOL",
      payload: {
        tool: "close_browser_tabs",
        input: {
          scope: "workbench_selection",
          expectedWorkbenchRevision: selected.data.revision,
          expectedRevision: saved.data.revision,
          operationId: "browser:close-1",
          confirm: true,
          confirmationText: "我确认关闭这些标签"
        }
      }
    });
    expect(closed).toMatchObject({
      ok: true,
      data: {
        tool: "close_browser_tabs",
        closedTabIds: [10, 12],
        skippedPinnedTabIds: [11],
        savedCardIds: [expect.any(String)],
        usedWorkbenchSelection: true,
        workbenchRevision: expect.stringMatching(/^railr_/)
      }
    });
    expect(tabRemove).toHaveBeenCalledWith([10, 12]);
    expect(tabs.map((tab) => tab.id)).toEqual([11]);
    expect(Object.keys((stored["tabnexus.appState.v1"] as any).workspaces.ws.cards)).toHaveLength(3);
    expect(stored["tabnexus.tabWorkbench.v1"]).toMatchObject({ selections: { ws: { tabIds: [], cardIds: [] } } });
    expect(stored["tabnexus.settings.v1"]).toMatchObject({ rightRailCollapsed: true });

    const afterClose = await send({ type: "M3_AGENT_TOOL", payload: { tool: "read_tab_workbench" } });
    expect(afterClose.data.workbench).toMatchObject({ counts: { recentlyClosed: 2, selected: 0 } });
    const reopened = await send({
      type: "M3_AGENT_TOOL",
      payload: {
        tool: "manage_tab_workbench",
        input: {
          expectedRevision: afterClose.data.revision,
          operationId: "workbench:reopen-recent-1",
          actions: [{ type: "reopen_recent", recentIds: ["recent-1"] }]
        }
      }
    });
    expect(reopened).toMatchObject({ ok: true, data: { reopenedRecentIds: ["recent-1"], failedRecentIds: [], workbench: { counts: { recentlyClosed: 1 } } } });
    expect(stored["tabnexus.recentlyClosed.v1"]).toEqual([expect.objectContaining({ id: "recent-2" })]);

    const dismissed = await send({
      type: "M3_AGENT_TOOL",
      payload: {
        tool: "dismiss_recent_tabs",
        input: {
          expectedRevision: reopened.data.revision,
          operationId: "workbench:dismiss-recent-2",
          recentIds: ["recent-2"],
          confirm: true,
          confirmationText: "我确认移除这条恢复记录"
        }
      }
    });
    expect(dismissed).toMatchObject({ ok: true, data: { dismissedRecentIds: ["recent-2"], missingRecentIds: [], workbench: { counts: { recentlyClosed: 0 } } } });
    expect(stored["tabnexus.recentlyClosed.v1"]).toEqual([]);

    const openedGroup = await send({
      type: "M3_AGENT_TOOL",
      payload: {
        tool: "sync_browser_tabs",
        input: { action: "open_group", groupId: "saved", expectedRevision: closed.data.revision, operationId: "browser:open-group-1" }
      }
    });
    expect(openedGroup).toMatchObject({ ok: true, data: { action: "open_group", opened: 1, existing: 1, failed: 0 } });
    const openedWorkspace = await send({
      type: "M3_AGENT_TOOL",
      payload: {
        tool: "sync_browser_tabs",
        input: { action: "open_workspace", expectedRevision: openedGroup.data.revision, operationId: "browser:open-workspace-1" }
      }
    });
    expect(openedWorkspace).toMatchObject({ ok: true, data: { action: "open_workspace", opened: 1, existing: 2, failed: 0 } });
    const currentWindow = await send({ type: "M3_AGENT_TOOL", payload: { tool: "read_tab_workbench" } });
    const savedWindow = await send({
      type: "M3_AGENT_TOOL",
      payload: {
        tool: "sync_browser_tabs",
        input: {
          action: "save_tabs",
          scope: "current_window",
          includePinned: false,
          expectedWorkbenchRevision: currentWindow.data.revision,
          expectedRevision: openedWorkspace.data.revision,
          operationId: "browser:save-window-1"
        }
      }
    });
    expect(savedWindow).toMatchObject({ ok: true, data: { action: "save_tabs", savedCardIds: [expect.any(String)], duplicateCardIds: [expect.any(String), expect.any(String)] } });
    const windowAfterSave = await send({ type: "M3_AGENT_TOOL", payload: { tool: "read_tab_workbench" } });
    const closedWindow = await send({
      type: "M3_AGENT_TOOL",
      payload: {
        tool: "close_browser_tabs",
        input: {
          scope: "current_window",
          expectedWorkbenchRevision: windowAfterSave.data.revision,
          expectedRevision: savedWindow.data.revision,
          operationId: "browser:close-window-1",
          confirm: true,
          confirmationText: "我确认关闭当前窗口标签"
        }
      }
    });
    expect(closedWindow).toMatchObject({ ok: true, data: { closedTabIds: expect.arrayContaining([expect.any(Number)]), skippedPinnedTabIds: [11] } });
    expect(tabs.map((tab) => tab.id)).toEqual([11]);
  });

  it("connects to an Agent-launched localhost bridge without native messaging permission", async () => {
    let messageHandler: ((request: unknown, sender: unknown, sendResponse: (response: unknown) => void) => boolean) | undefined;
    let socket: MockWebSocket | undefined;
    class MockWebSocket {
      static readonly OPEN = 1;
      readyState = 0;
      listeners = new Map<string, Array<(event: any) => void>>();
      send = vi.fn();
      constructor(public readonly url: string) { socket = this; }
      addEventListener(type: string, listener: (event: any) => void) {
        this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
      }
      emit(type: string, event: any = {}) {
        if (type === "message") this.readyState = MockWebSocket.OPEN;
        for (const listener of this.listeners.get(type) ?? []) listener(event);
      }
      close() { this.readyState = 3; }
    }
    vi.stubGlobal("WebSocket", MockWebSocket);
    vi.stubGlobal("chrome", {
      action: { onClicked: { addListener: vi.fn() } },
      runtime: {
        id: "extension-id",
        getURL: (path: string) => `chrome-extension://extension-id/${path}`,
        onInstalled: { addListener: vi.fn() },
        onStartup: { addListener: vi.fn() },
        onMessage: { addListener: (handler: typeof messageHandler) => { messageHandler = handler; } }
      },
      tabs: { query: vi.fn(), update: vi.fn(), create: vi.fn() },
      windows: { update: vi.fn() },
      storage: {
        local: {
          get: vi.fn(async (key: string) => ({ [key]: key === "tabnexus.settings.v1" ? { locale: "zh", agentBridgeEnabled: false } : undefined })),
          set: vi.fn(async () => undefined),
          setAccessLevel: vi.fn(async () => undefined)
        },
        session: { setAccessLevel: vi.fn(async () => undefined) }
      }
    });
    await import("../src/background");
    const responsePromise = new Promise<any>((resolve) => {
      messageHandler?.({ type: "M3_BRIDGE_CONNECT" }, {}, resolve);
    });
    await vi.waitFor(() => expect(socket?.url).toBe("ws://127.0.0.1:43119/tabnexus"));
    socket?.emit("message", { data: JSON.stringify({ type: "bridge_ready", hostVersion: "0.4.0", agentName: "Codex", agents: [{ id: "codex-1", name: "Codex" }] }) });
    await expect(responsePromise).resolves.toEqual({
      ok: true,
      data: {
        state: "connected",
        transport: "agent_websocket",
        endpoint: "ws://127.0.0.1:43119/tabnexus",
        agentName: "Codex",
        agentNames: ["Codex"],
        agentCount: 1,
        hostVersion: "0.4.0"
      }
    });
    socket?.emit("message", { data: JSON.stringify({
      type: "agents_changed",
      agents: [{ id: "codex-1", name: "Codex" }, { id: "cursor-1", name: "Cursor" }]
    }) });
    const status = await new Promise<any>((resolve) => {
      messageHandler?.({ type: "M3_BRIDGE_STATUS" }, {}, resolve);
    });
    expect(status.data).toMatchObject({
      state: "connected",
      agentName: "Codex",
      agentNames: ["Codex", "Cursor"],
      agentCount: 2
    });
  });
});
