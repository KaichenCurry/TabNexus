import { describe, expect, it } from "vitest";
import {
  activeTask,
  createSection,
  deleteSection,
  listTasks,
  movePagesToSection,
  renameSection,
  renameTask,
  setPageNote,
  setPageStatus,
  taskToWorkspaceView,
  updateTaskMeta
} from "../../extension/src/v2/core/taskOps";
import { computeProgress, type Task } from "../../extension/src/v2/core/taskModel";
import type { AppState, Card, Workspace } from "../../extension/src/core/types";

function makeCard(id: string, overrides: Partial<Card> = {}): Card {
  return {
    id,
    type: "web",
    title: `page-${id}`,
    url: `https://example.com/${id}`,
    note: "",
    status: "unread",
    groupId: null,
    source: "user",
    ...overrides
  };
}

function makeState(): AppState {
  const workspace: Workspace = {
    id: "task-1",
    name: "评估 Perplexity",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-15T00:00:00.000Z",
    groupOrder: ["s1"],
    groups: { s1: { id: "s1", name: "市场", color: "#E8833A", cardIds: ["a"] } },
    cards: {
      a: makeCard("a", { status: "read", groupId: "s1" }),
      b: makeCard("b", { status: "unread" })
    },
    edges: []
  };
  return {
    schemaVersion: 1,
    activeWorkspaceId: "task-1",
    workspaceOrder: ["task-1"],
    workspaces: { "task-1": workspace }
  };
}

describe("v2 taskOps", () => {
  it("exposes the active task as the v2 view-model with v2 meta", () => {
    const state = makeState();
    const task = activeTask(state)!;
    expect(task.name).toBe("评估 Perplexity");
    expect(task.goal).toBe("");
    expect(task.sections).toHaveLength(1);
    expect(Object.keys(task.pages).sort()).toEqual(["a", "b"]);
  });

  it("updates task meta (goal / nextStep / conclusion / archivedAt)", () => {
    const state = makeState();
    const next = updateTaskMeta(state, "task-1", { goal: "理解商业模式", nextStep: "找 1 个反例", conclusion: "值得研究" });
    const task = activeTask(next)!;
    expect(task.goal).toBe("理解商业模式");
    expect(task.nextStep).toBe("找 1 个反例");
    expect(task.conclusion).toBe("值得研究");
    expect(task.archivedAt).toBeUndefined();
    const archived = updateTaskMeta(next, "task-1", { archivedAt: "2026-08-16T00:00:00.000Z" });
    expect(activeTask(archived)!.archivedAt).toBe("2026-08-16T00:00:00.000Z");
    // 原 state 不变（纯函数）
    expect(activeTask(state)!.goal).toBe("");
  });

  it("renames task and sections", () => {
    const state = makeState();
    const renamed = renameTask(state, "task-1", " 对标 Perplexity ");
    expect(activeTask(renamed)!.name).toBe("对标 Perplexity");
    const sectionRenamed = renameSection(renamed, "task-1", "s1", "市场与商业模式");
    expect(activeTask(sectionRenamed)!.sections[0].name).toBe("市场与商业模式");
  });

  it("creates, deletes sections and moves pages", () => {
    const state = makeState();
    const withSection = createSection(state, "task-1", "zh", "风险");
    let task = activeTask(withSection)!;
    const newSection = task.sections.find((section) => section.name === "风险")!;
    const moved = movePagesToSection(withSection, "task-1", ["b"], newSection.id);
    task = activeTask(moved)!;
    expect(task.sections.find((section) => section.id === newSection.id)?.pageIds).toEqual(["b"]);
    // 移回未归类
    const unassigned = movePagesToSection(moved, "task-1", ["b"], null);
    expect(activeTask(unassigned)!.sections.every((section) => !section.pageIds.includes("b"))).toBe(true);
    const removed = deleteSection(unassigned, "task-1", newSection.id);
    expect(activeTask(removed)!.sections.map((section) => section.id)).toEqual(["s1"]);
  });

  it("sets page status incl. excluded with reason, and notes", () => {
    const state = makeState();
    const adopted = setPageStatus(state, "task-1", "b", "adopted");
    expect(activeTask(adopted)!.pages.b.status).toBe("adopted");
    const excluded = setPageStatus(adopted, "task-1", "b", "excluded", "已过期");
    const task = activeTask(excluded)!;
    expect(task.pages.b.status).toBe("excluded");
    expect(task.pages.b.excludedReason).toBe("已过期");
    // excluded 不计入进度分母
    expect(computeProgress(task).total).toBe(1);
    // 状态改回后排除原因清除
    const restored = setPageStatus(excluded, "task-1", "b", "unread");
    expect(activeTask(restored)!.pages.b.excludedReason).toBeUndefined();
    const noted = setPageNote(restored, "task-1", "b", "关键证据");
    expect(activeTask(noted)!.pages.b.note).toBe("关键证据");
  });

  it("lists all tasks and throws on unknown ids", () => {
    const state = makeState();
    expect(listTasks(state).map((task) => task.name)).toEqual(["评估 Perplexity"]);
    expect(() => updateTaskMeta(state, "nope", { goal: "x" })).toThrow(/Unknown task id/);
  });

  it("preserves non-web page types and legacy metadata through the v2 bridge", () => {
    const state = makeState();
    state.workspaces["task-1"].cards.a = makeCard("a", {
      type: "report",
      lastAccessedAt: "2026-08-15T09:00:00.000Z",
      flow: { x: 120, y: -20 },
      flowLayout: "mind"
    });
    const workspace = taskToWorkspaceView(activeTask(state)!);
    expect(workspace.cards.a).toMatchObject({
      type: "report",
      lastAccessedAt: "2026-08-15T09:00:00.000Z",
      flow: { x: 120, y: -20 },
      flowLayout: "mind"
    });
  });

  it("recovers task lists when stale workspace ids remain in stored order", () => {
    const state = makeState();
    state.workspaceOrder = ["missing", "task-1"];
    state.activeWorkspaceId = "missing";
    expect(activeTask(state)?.id).toBe("task-1");
    expect(listTasks(state).map((task) => task.id)).toEqual(["task-1"]);
  });
});
