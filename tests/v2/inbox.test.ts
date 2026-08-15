import { describe, expect, it } from "vitest";
import { buildInboxSnapshot, closeableTabIds, selectionToOpenTabs } from "../../extension/src/v2/core/inbox";
import { migrateWorkspaceToTask } from "../../extension/src/v2/core/taskModel";
import type { Card, Workspace } from "../../extension/src/core/types";

function makeTask(): ReturnType<typeof migrateWorkspaceToTask> {
  const card = (id: string, url: string, overrides: Partial<Card> = {}): Card => ({
    id, type: "web", title: id, url, note: "", status: "unread", groupId: null, source: "user", ...overrides
  });
  const workspace: Workspace = {
    id: "task-1",
    name: "t",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    groupOrder: [],
    groups: {},
    cards: {
      a: card("a", "https://example.com/page"),
      b: card("b", "https://example.com/page#frag") // 与 a 同规范化 URL
    },
    edges: []
  };
  return migrateWorkspaceToTask(workspace);
}

const TABS = [
  { id: 1, windowId: 1, title: "已保存页", url: "https://example.com/page", pinned: false },
  { id: 2, windowId: 1, title: "新页面", url: "https://news.example.com/x", pinned: false },
  { id: 3, windowId: 1, title: "固定标签", url: "https://pinned.example.com", pinned: true },
  { id: 4, windowId: 1, title: "内部页", url: "chrome://extensions", pinned: false }
];

describe("v2 inbox snapshot", () => {
  it("splits saved vs unsaved by normalized URL and drops unsupported schemes", () => {
    const snapshot = buildInboxSnapshot(makeTask(), TABS);
    expect(snapshot.openCount).toBe(3);
    expect(snapshot.unsavedCount).toBe(2);
    expect(snapshot.savedCount).toBe(1);
    expect(snapshot.unsaved.map((item) => item.tabId)).toEqual([2, 3]);
    // 同规范化 URL 的页去重（后者覆盖前者），任一 id 均合法
    expect(["a", "b"]).toContain(snapshot.savedOpen[0].savedPageId);
  });

  it("maps selection to collectable OpenTabs, skipping saved ones", () => {
    const snapshot = buildInboxSnapshot(makeTask(), TABS);
    const openTabs = selectionToOpenTabs(snapshot.items, [1, 2, 3]);
    expect(openTabs.map((tab) => tab.id)).toEqual([2, 3]);
    expect(openTabs.every((tab) => tab.supported)).toBe(true);
  });

  it("never marks pinned tabs as batch-closeable", () => {
    const snapshot = buildInboxSnapshot(makeTask(), TABS);
    expect(closeableTabIds(snapshot.items, [2, 3])).toEqual([2]);
  });
});
