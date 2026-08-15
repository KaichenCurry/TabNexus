import { describe, expect, it } from "vitest";
import { layoutRelations, nodeCenter } from "../../extension/src/v2/core/relation";
import { migrateWorkspaceToTask } from "../../extension/src/v2/core/taskModel";
import type { Card, Workspace } from "../../extension/src/core/types";

function makeTask(): ReturnType<typeof migrateWorkspaceToTask> {
  const card = (id: string, overrides: Partial<Card> = {}): Card => ({
    id, type: "web", title: id, url: `https://${id}.example.com`, note: "", status: "unread", groupId: null, source: "user", ...overrides
  });
  const workspace: Workspace = {
    id: "task-1", name: "t",
    createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-15T00:00:00.000Z",
    groupOrder: ["s1"],
    groups: { s1: { id: "s1", name: "市场", color: "#E8833A", cardIds: ["a"] } },
    cards: {
      a: card("a", { status: "adopted", groupId: "s1" }),
      b: card("b", { status: "excluded", groupId: null })
    },
    edges: [{ fromCardId: "a", toCardId: "b", label: "对比" }]
  };
  return migrateWorkspaceToTask(workspace);
}

describe("v2 relation layout", () => {
  it("places section pages in the first lane and unassigned in the last", () => {
    const layout = layoutRelations(makeTask());
    expect(layout.nodes.map((node) => node.pageId)).toEqual(["a", "b"]);
    const a = layout.nodes[0];
    const b = layout.nodes[1];
    expect(a.x).toBe(48);
    expect(a.status).toBe("adopted");
    // 未归类泳道在章节泳道右侧（第二列）
    expect(b.x).toBeGreaterThan(a.x);
    expect(layout.width).toBeGreaterThan(480);
  });

  it("keeps edges with labels and only for existing pages", () => {
    const layout = layoutRelations(makeTask());
    expect(layout.edges).toEqual([{ fromPageId: "a", toPageId: "b", label: "对比" }]);
    expect(nodeCenter(layout.nodes[0])).toEqual({ x: 48 + 208 / 2, y: 40 + 64 / 2 });
  });

  it("handles an empty task", () => {
    const empty = makeTask();
    empty.pages = {};
    empty.sections = [];
    empty.canvas = { version: 1, elements: [], arrows: [] };
    const layout = layoutRelations(empty);
    expect(layout.nodes).toEqual([]);
    expect(layout.edges).toEqual([]);
    expect(layout.height).toBe(320);
  });
});
