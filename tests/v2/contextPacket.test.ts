import { describe, expect, it } from "vitest";
import { buildContextPacket, renderContextPacketMarkdown } from "../../extension/src/v2/core/contextPacket";
import { migrateWorkspaceToTask } from "../../extension/src/v2/core/taskModel";
import type { Card, Workspace } from "../../extension/src/core/types";

function makeTask(): ReturnType<typeof migrateWorkspaceToTask> {
  const card = (id: string, overrides: Partial<Card> = {}): Card => ({
    id, type: "web", title: id, url: `https://${id}.example.com`, note: "", status: "unread", groupId: null, source: "user", ...overrides
  });
  const workspace: Workspace = {
    id: "task-1", name: "评估 Perplexity",
    createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-15T00:00:00.000Z",
    groupOrder: ["s1"],
    groups: { s1: { id: "s1", name: "市场", color: "#E8833A", cardIds: ["a", "b"] } },
    cards: {
      a: card("a", { status: "adopted", note: "估值 90 亿", groupId: "s1" }),
      b: card("b", { status: "excluded", excludedReason: "已过期", groupId: "s1" }),
      c: card("c", { status: "read", groupId: null })
    },
    edges: [],
    v2: { goal: "理解商业模式", nextStep: "补反例", conclusion: "值得研究" }
  };
  return migrateWorkspaceToTask(workspace);
}

describe("v2 context packet", () => {
  it("carries task meta, progress and pages with exclusion reasons", () => {
    const packet = buildContextPacket(makeTask());
    expect(packet.version).toBe(2);
    expect(packet.task).toMatchObject({ name: "评估 Perplexity", goal: "理解商业模式", nextStep: "补反例", conclusion: "值得研究" });
    expect(packet.progress).toMatchObject({ total: 2, read: 2, adopted: 1, excluded: 1, deliverable: true });
    expect(packet.sections[0].name).toBe("市场");
    expect(packet.sections[0].pages.map((page) => page.id)).toEqual(["a", "b"]);
    expect(packet.sections[0].pages[1].excludedReason).toBe("已过期");
    expect(packet.unassigned.map((page) => page.id)).toEqual(["c"]);
    expect(packet.excludes).toEqual(["page-bodies", "api-keys", "other-tasks"]);
  });

  it("renders a markdown handoff with status glyphs and exclusion reasons", () => {
    const markdown = renderContextPacketMarkdown(buildContextPacket(makeTask()), "zh");
    expect(markdown).toContain("# 评估 Perplexity");
    expect(markdown).toContain("目标: 理解商业模式");
    expect(markdown).toContain("已读 2/2 · ⭐已采用 1 · 已排除 1");
    expect(markdown).toContain("[⭐] a (https://a.example.com) — 估值 90 亿");
    expect(markdown).toContain("[✕] b (https://b.example.com) [排除: 已过期]");
    expect(markdown).toContain("## 未归类");
    expect(markdown).toContain("[◐] c");
  });
});
