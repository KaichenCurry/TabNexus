import { describe, expect, it } from "vitest";
import type { OpenTab } from "../extension/src/core/types";
import {
  addManualCard,
  addWorkspace,
  collectTabs,
  createGroup,
  createInitialAppState,
  deleteGroup,
  deleteCard,
  removeWorkspace,
  updateCardFlow,
  updateCardFlows,
  updateCardStatus,
  upsertEdge
} from "../extension/src/core/workspace";

function tab(id: number, url: string, pinned = false): OpenTab {
  return { id, windowId: 1, title: `Tab ${id}`, url, pinned, active: false, supported: true };
}

describe("workspace data operations", () => {
  it("deduplicates normalized URLs only inside the current workspace", () => {
    const state = createInitialAppState("zh");
    const first = state.workspaces[state.activeWorkspaceId];
    const collected = collectTabs(first, [tab(1, "https://example.com/docs/#one")]);
    const duplicate = collectTabs(collected.workspace, [tab(2, "https://example.com/docs")]);
    expect(duplicate.addedTabIds).toEqual([]);
    expect(duplicate.duplicateTabIds).toEqual([2]);

    const withSecond = addWorkspace(state, "zh");
    const second = withSecond.workspaces[withSecond.activeWorkspaceId];
    expect(collectTabs(second, [tab(3, "https://example.com/docs")]).addedTabIds).toEqual([3]);
  });

  it("moves deleted-group cards back to the inbox", () => {
    const state = createInitialAppState("en");
    const base = createGroup(state.workspaces[state.activeWorkspaceId], "en", "Research");
    const groupId = base.groupOrder[0];
    const collected = collectTabs(base, [tab(1, "https://example.com/a")], groupId).workspace;
    const cardId = Object.keys(collected.cards)[0];
    const next = deleteGroup(collected, groupId);
    expect(next.groupOrder).toEqual([]);
    expect(next.cards[cardId].groupId).toBeNull();
  });

  it("creates a clean replacement after deleting the last workspace", () => {
    const state = createInitialAppState("zh");
    const next = removeWorkspace(state, state.activeWorkspaceId, "zh");
    expect(next.workspaceOrder).toHaveLength(1);
    expect(next.activeWorkspaceId).not.toBe(state.activeWorkspaceId);
    expect(next.workspaces[next.activeWorkspaceId].name).toBe("我的工作区");
  });

  it("persists card progress and graph positions without splitting the data model", () => {
    const state = createInitialAppState("zh");
    const grouped = createGroup(state.workspaces[state.activeWorkspaceId], "zh", "研究");
    const groupId = grouped.groupOrder[0];
    const collected = collectTabs(grouped, [
      tab(1, "https://example.com/a"),
      tab(2, "https://example.com/b")
    ], groupId).workspace;
    const [firstId, secondId] = Object.keys(collected.cards);
    const progressed = updateCardFlow(updateCardStatus(collected, firstId, "adopted"), firstId, { x: 123.4, y: 88.8 });
    const connected = upsertEdge(progressed, { fromCardId: firstId, toCardId: secondId, label: "支持" });

    expect(connected.cards[firstId].status).toBe("adopted");
    expect(connected.cards[firstId].flow).toEqual({ x: 123, y: 89 });
    expect(connected.edges).toEqual([{ fromCardId: firstId, toCardId: secondId, label: "支持" }]);
    expect(deleteCard(connected, secondId).edges).toEqual([]);
  });

  it("keeps page-space positions on every side of the infinite canvas", () => {
    const state = createInitialAppState("zh");
    const collected = collectTabs(state.workspaces[state.activeWorkspaceId], [tab(1, "https://example.com/a")]).workspace;
    const cardId = Object.keys(collected.cards)[0];
    const moved = updateCardFlow(collected, cardId, { x: -12_345.4, y: -6_789.6 });

    expect(moved.cards[cardId].flow).toEqual({ x: -12_345, y: -6_790 });
  });

  it("auto-arranges multiple relationship nodes in one workspace update", () => {
    const state = createInitialAppState("zh");
    const collected = collectTabs(state.workspaces[state.activeWorkspaceId], [
      tab(1, "https://example.com/a"),
      tab(2, "https://example.com/b")
    ]).workspace;
    const [firstId, secondId] = Object.keys(collected.cards);
    const arranged = updateCardFlows(collected, {
      [firstId]: { x: 42.4, y: 104.4 },
      [secondId]: { x: 362.6, y: 238.2 }
    });

    expect(arranged.cards[firstId].flow).toEqual({ x: 42, y: 104 });
    expect(arranged.cards[secondId].flow).toEqual({ x: 363, y: 238 });
  });

  it("adds manual sources to a real group and rejects duplicate URLs", () => {
    const state = createInitialAppState("en");
    const workspace = state.workspaces[state.activeWorkspaceId];
    const first = addManualCard(workspace, "en", {
      title: "Research note",
      url: "https://example.com/docs#intro",
      note: "Review this"
    });
    expect(first.workspace.groupOrder).toHaveLength(1);
    expect(first.cardId).toBeTruthy();
    expect(first.workspace.cards[first.cardId!].groupId).toBe(first.workspace.groupOrder[0]);

    const duplicate = addManualCard(first.workspace, "en", {
      title: "Same page",
      url: "https://example.com/docs"
    });
    expect(duplicate.duplicateCardId).toBe(first.cardId);
    expect(Object.keys(duplicate.workspace.cards)).toHaveLength(1);
  });
});
