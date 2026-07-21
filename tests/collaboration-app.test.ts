import { describe, expect, it } from "vitest";
import { appStateRevision, deleteWorkspaceItems, manageWorkspaces, searchWorkspaceCards } from "../src/core/collaborationApp";
import { workspaceRevision } from "../src/core/collaboration";
import type { AppState } from "../src/core/types";

function fixture(): AppState {
  return {
    schemaVersion: 1,
    activeWorkspaceId: "ws-a",
    workspaceOrder: ["ws-a", "ws-b"],
    workspaces: {
      "ws-a": {
        id: "ws-a", name: "Research", createdAt: "2026-07-21T00:00:00.000Z", updatedAt: "2026-07-21T00:00:00.000Z",
        groupOrder: ["sources"],
        groups: { sources: { id: "sources", name: "Sources", color: "#5368AC", cardIds: ["alpha"] } },
        cards: { alpha: { id: "alpha", type: "web", title: "Alpha API", url: "https://example.com/alpha", note: "private evidence", status: "read", groupId: "sources", source: "user" } },
        edges: []
      },
      "ws-b": {
        id: "ws-b", name: "Planning", createdAt: "2026-07-21T00:00:00.000Z", updatedAt: "2026-07-21T00:00:00.000Z",
        groupOrder: [], groups: {},
        cards: { beta: { id: "beta", type: "note", title: "Beta launch", note: "release checklist", status: "unread", groupId: null, source: "agent" } },
        edges: []
      }
    }
  };
}

describe("MCP app-level collaboration", () => {
  it("searches across workspaces while keeping notes opt-in", () => {
    const state = fixture();
    const publicSearch = searchWorkspaceCards(state, { tool: "search_cards", input: { query: "alpha" } });
    expect(publicSearch).toMatchObject({ tool: "search_cards", total: 1, matches: [{ workspaceId: "ws-a", card: { id: "alpha", noteLength: 16 } }] });
    if (publicSearch.tool !== "search_cards") throw new Error("unexpected result");
    expect(publicSearch.matches[0].card).not.toHaveProperty("note");

    const privateSearch = searchWorkspaceCards(state, { tool: "search_cards", input: { query: "checklist", includeNotes: true } });
    expect(privateSearch).toMatchObject({ total: 1, matches: [{ workspaceId: "ws-b", card: { id: "beta", note: "release checklist" } }] });
  });

  it("atomically creates, duplicates, reorders, selects, renames, and deletes workspaces", () => {
    const state = fixture();
    const first = manageWorkspaces(state, "en", {
      tool: "manage_workspaces",
      input: {
        expectedStateRevision: appStateRevision(state),
        operationId: "agent:workspaces-1",
        actions: [
          { type: "create_workspace", name: "New project", makeActive: false },
          { type: "duplicate_workspace", workspaceId: "ws-a", name: "Research copy" },
          { type: "rename_workspace", workspaceId: "ws-b", name: "Launch planning" }
        ]
      }
    });
    expect(first.changed).toBe(true);
    expect(first.result.createdWorkspaceIds).toHaveLength(2);
    expect(first.state.activeWorkspaceId).toBe(first.result.createdWorkspaceIds[1]);
    const duplicate = first.state.workspaces[first.result.createdWorkspaceIds[1]];
    expect(duplicate.name).toBe("Research copy");
    expect(Object.keys(duplicate.cards)).toHaveLength(1);
    expect(Object.keys(duplicate.cards)[0]).not.toBe("alpha");

    const second = deleteWorkspaceItems(first.state, "ws-b", "en", {
      tool: "delete_workspace_items",
      input: {
        expectedRevision: workspaceRevision(first.state.workspaces["ws-b"]),
        expectedStateRevision: first.result.stateRevision,
        operationId: "agent:workspaces-2",
        deleteWorkspace: true,
        confirm: true,
        confirmationText: "I confirm deleting this workspace"
      }
    });
    expect(second.result.deletedWorkspaceId).toBe("ws-b");
    expect(second.state.workspaces["ws-b"]).toBeUndefined();
    expect(() => manageWorkspaces(state, "en", {
      tool: "manage_workspaces",
      input: { expectedStateRevision: "appsr_stale", operationId: "stale", actions: [{ type: "set_active_workspace", workspaceId: "ws-b" }] }
    })).toThrow(/Workspace list changed/);
  });

  it("keeps destructive card/group/workspace operations behind one confirmed tool", () => {
    const state = fixture();
    expect(() => deleteWorkspaceItems(state, "ws-a", "en", {
      tool: "delete_workspace_items",
      input: { expectedRevision: workspaceRevision(state.workspaces["ws-a"]), operationId: "delete:no-confirm", cardIds: ["alpha"], confirm: false as true, confirmationText: "delete it" }
    })).toThrow(/confirm=true/);
    expect(() => deleteWorkspaceItems(state, "ws-a", "en", {
      tool: "delete_workspace_items",
      input: { expectedRevision: workspaceRevision(state.workspaces["ws-a"]), operationId: "delete:missing-proof", cardIds: ["alpha"], confirm: true, confirmationText: "delete it" }
    })).toThrow(/confirmationText/);

    const deleted = deleteWorkspaceItems(state, "ws-a", "en", {
      tool: "delete_workspace_items",
      input: { expectedRevision: workspaceRevision(state.workspaces["ws-a"]), operationId: "delete:items", groupIds: ["sources"], cardIds: ["alpha"], confirm: true, confirmationText: "I confirm deleting these items" }
    });
    expect(deleted.result).toMatchObject({ deletedGroupIds: ["sources"], deletedCardIds: ["alpha"] });
    expect(deleted.state.workspaces["ws-a"].groups).toEqual({});
    expect(deleted.state.workspaces["ws-a"].cards).toEqual({});
  });
});
