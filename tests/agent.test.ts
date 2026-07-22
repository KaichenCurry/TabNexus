import { describe, expect, it } from "vitest";
import { createAgentCommandRequest, validateAgentPlan } from "../extension/src/core/agent";
import type { Card, OpenTab, Workspace } from "../extension/src/core/types";

const workspace: Workspace = {
  id: "ws",
  name: "Research",
  createdAt: "2026-07-21T00:00:00.000Z",
  updatedAt: "2026-07-21T00:00:00.000Z",
  groupOrder: ["group-a"],
  groups: { "group-a": { id: "group-a", name: "Sources", color: "#7A6EDC", cardIds: ["saved"] } },
  cards: {
    saved: {
      id: "saved",
      type: "web",
      title: "Saved source",
      url: "https://example.com/saved",
      note: "private note",
      status: "unread",
      groupId: "group-a",
      source: "user"
    },
    closed: {
      id: "closed",
      type: "web",
      title: "Closed source",
      url: "https://example.com/closed",
      note: "",
      status: "read",
      groupId: null,
      source: "user"
    }
  },
  edges: []
};

const tabs: OpenTab[] = [
  { id: 1, windowId: 1, title: "Saved source", url: "https://example.com/saved", pinned: false, active: false, supported: true },
  { id: 2, windowId: 1, title: "Unsaved source", url: "https://other.example/new", pinned: false, active: false, supported: true },
  { id: 3, windowId: 1, title: "Pinned", url: "https://example.com/pinned", pinned: true, active: false, supported: true }
];

describe("unified Agent command planning", () => {
  it("builds selection context from exactly the checked rail items, including saved closed cards", () => {
    const request = createAgentCommandRequest(
      workspace,
      "zh",
      "selection",
      "重开关闭的资料并保存新标签",
      { tabs: [tabs[1]], cards: [workspace.cards.closed] },
      tabs
    );

    expect(request.tabs.map((tab) => tab.id)).toEqual([2]);
    expect(request.cards.map((card) => card.id)).toEqual(["closed"]);
    expect(JSON.stringify(request)).not.toContain("private note");
  });

  it("accepts safe tab and workspace operations that reference supplied ids", () => {
    const request = createAgentCommandRequest(
      workspace,
      "en",
      "selection",
      "Save this tab and reopen the closed source",
      { tabs: [tabs[1]], cards: [workspace.cards.closed] },
      tabs
    );
    const plan = validateAgentPlan({
      summary: "Resume both selected items",
      rationale: "One is open and unsaved; the other is saved and closed.",
      actions: [
        { type: "save_tabs", tabIds: [2] },
        { type: "reopen_cards", cardIds: ["closed"] }
      ]
    }, request);

    expect(plan.scope).toBe("selection");
    expect(plan.actions).toEqual([
      { type: "save_tabs", tabIds: [2], targetGroupId: undefined },
      { type: "reopen_cards", cardIds: ["closed"] }
    ]);
  });

  it("blocks invented ids, pinned closes, and mixed grouping mutations", () => {
    const request = createAgentCommandRequest(
      workspace,
      "zh",
      "selection",
      "整理所选标签",
      { tabs: [tabs[2]], cards: [] },
      tabs
    );
    expect(() => validateAgentPlan({
      summary: "close",
      actions: [{ type: "close_tabs", tabIds: [3] }]
    }, request)).toThrow(/Pinned/);
    expect(() => validateAgentPlan({
      summary: "save",
      actions: [{ type: "save_tabs", tabIds: [999] }]
    }, request)).toThrow(/Unknown/);
    expect(() => validateAgentPlan({
      summary: "mixed",
      actions: [
        { type: "organize", cardIds: [], tabIds: [3], instruction: "按类型" },
        { type: "create_group", name: "Other" }
      ]
    }, request)).toThrow(/standalone/);
  });
});
