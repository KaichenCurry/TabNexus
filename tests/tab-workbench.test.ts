import { describe, expect, it } from "vitest";
import { buildTabWorkbenchContext, selectionForWorkbenchScope } from "../extension/src/core/tabWorkbench";
import type { BrowserTabContext, Workspace } from "../extension/src/core/types";

const workspace: Workspace = {
  id: "ws",
  name: "Workbench",
  createdAt: "2026-07-22T00:00:00.000Z",
  updatedAt: "2026-07-22T00:00:00.000Z",
  groupOrder: ["research"],
  groups: { research: { id: "research", name: "Research", color: "#5368AC", cardIds: ["saved-open", "saved-closed"] } },
  cards: {
    "saved-open": { id: "saved-open", type: "web", title: "Saved open", url: "https://example.com/open", note: "", status: "unread", groupId: "research", source: "user" },
    "saved-closed": { id: "saved-closed", type: "web", title: "Saved closed", url: "https://example.com/closed", note: "", status: "read", groupId: "research", source: "user" }
  },
  edges: []
};

const browserTabs: BrowserTabContext[] = [
  { tabId: 10, windowId: 1, title: "Saved open", url: "https://example.com/open", pinned: false, active: true, savedCardId: "saved-open" },
  { tabId: 11, windowId: 1, title: "Unsaved", url: "https://other.example/page", pinned: false, active: false },
  { tabId: 12, windowId: 1, title: "Pinned", url: "https://pinned.example/", pinned: true, active: false }
];

describe("shared tab workbench context", () => {
  it("mirrors visible rows without double-counting a saved open selection", () => {
    const context = buildTabWorkbenchContext({
      workspace,
      browserTabs,
      recentlyClosed: [
        { id: "recent-visible", title: "Recent", url: "https://recent.example/", closedAt: "2026-07-22T00:00:00.000Z" },
        { id: "recent-saved", title: "Already saved", url: "https://example.com/closed", closedAt: "2026-07-22T00:00:00.000Z" }
      ],
      selection: { tabIds: [10], cardIds: ["saved-open", "saved-closed"], updatedAt: "2026-07-22T00:00:00.000Z" },
      collapsed: true,
      unsupportedCount: 2
    });

    expect(context.revision).toMatch(/^railr_/);
    expect(context.counts).toEqual({ open: 3, unsavedOpen: 2, savedOpen: 1, savedClosed: 1, recentlyClosed: 1, unsupported: 2, selected: 2 });
    expect(context.savedClosedCards.map((card) => card.cardId)).toEqual(["saved-closed"]);
    expect(context.recentlyClosed.map((item) => item.id)).toEqual(["recent-visible"]);
    expect(context.collapsed).toBe(true);
  });

  it("supports the same all/open/saved/unsaved scopes used by the UI", () => {
    const context = buildTabWorkbenchContext({ workspace, browserTabs, recentlyClosed: [], collapsed: false });
    expect(selectionForWorkbenchScope(context, "all")).toEqual({ tabIds: [10, 11], cardIds: ["saved-open", "saved-closed"] });
    expect(selectionForWorkbenchScope(context, "unsaved_open")).toEqual({ tabIds: [11], cardIds: [] });
    expect(selectionForWorkbenchScope(context, "saved_open")).toEqual({ tabIds: [10], cardIds: ["saved-open"] });
    expect(selectionForWorkbenchScope(context, "saved_closed")).toEqual({ tabIds: [], cardIds: ["saved-closed"] });
    expect(selectionForWorkbenchScope(context, "open", true).tabIds).toEqual([10, 11, 12]);
  });
});
