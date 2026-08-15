import { describe, expect, it } from "vitest";
import {
  computeProgress,
  isUnassignedPage,
  migrateCardToPage,
  migrateWorkspaceToTask,
  type Task
} from "../extension/src/v2/core/taskModel";
import type { Card, Edge, Workspace } from "../extension/src/core/types";

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

function makeWorkspace(): Workspace {
  const cards: Record<string, Card> = {
    a: makeCard("a", { status: "read" }),
    b: makeCard("b", { status: "adopted" }),
    c: makeCard("c", { status: "unread" }),
    d: makeCard("d", { status: "excluded" as Card["status"], note: "outdated" }),
    e: makeCard("e", { status: "read" })
  };
  const edges: Edge[] = [{ fromCardId: "b", toCardId: "a", label: "supports" }];
  return {
    id: "ws-1",
    name: "竞品调研",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-15T00:00:00.000Z",
    groupOrder: ["g1", "g2"],
    groups: {
      g1: { id: "g1", name: "市场", color: "#E8833A", cardIds: ["a", "b"] },
      g2: { id: "g2", name: "风险", color: "#D6455E", cardIds: ["c"] }
    },
    cards,
    edges
  };
}

function makeTask(): Task {
  const workspace = makeWorkspace();
  return migrateWorkspaceToTask(workspace);
}

describe("v2 computeProgress", () => {
  it("aggregates weighted progress and excludes excluded pages", () => {
    const task = makeTask();
    // pages: a=read(0.5), b=adopted(1), c=unread(0), d=excluded(不计), e=read(0.5, 未归类)
    const progress = computeProgress(task);
    expect(progress.total).toBe(4);
    expect(progress.read).toBe(3);
    expect(progress.adopted).toBe(1);
    expect(progress.excluded).toBe(1);
    expect(progress.percent).toBe(Math.round(((0.5 + 1 + 0 + 0.5) / 4) * 100));
    expect(progress.deliverable).toBe(false);
    expect(progress.sections).toHaveLength(2);
    expect(progress.sections[0]).toEqual({ sectionId: "g1", total: 2, adopted: 1, percent: 75 });
    expect(progress.sections[1]).toEqual({ sectionId: "g2", total: 1, adopted: 0, percent: 0 });
  });

  it("marks deliverable only when everything is read and at least one adopted", () => {
    const allAdopted: Task = {
      ...makeTask(),
      pages: {
        a: migrateCardToPage(makeCard("a", { status: "adopted" })),
        b: migrateCardToPage(makeCard("b", { status: "adopted" }))
      },
      sections: [{ id: "g1", name: "市场", pageIds: ["a", "b"] }]
    };
    expect(computeProgress(allAdopted).deliverable).toBe(true);
    const noAdopted: Task = { ...allAdopted, pages: { a: migrateCardToPage(makeCard("a", { status: "read" })), b: migrateCardToPage(makeCard("b", { status: "read" })) } };
    expect(computeProgress(noAdopted).deliverable).toBe(false);
  });

  it("handles an empty task", () => {
    const progress = computeProgress({ sections: [], pages: {} });
    expect(progress).toEqual({
      total: 0,
      read: 0,
      adopted: 0,
      excluded: 0,
      percent: 0,
      deliverable: false,
      sections: []
    });
  });
});

describe("v2 migration", () => {
  it("migrates groups to sections and edges to arrows losslessly", () => {
    const workspace = makeWorkspace();
    const task = migrateWorkspaceToTask(workspace);
    expect(task.id).toBe("ws-1");
    expect(task.name).toBe("竞品调研");
    expect(task.goal).toBe("");
    expect(task.nextStep).toBe("");
    expect(task.conclusion).toBe("");
    expect(task.sections).toEqual([
      { id: "g1", name: "市场", color: "#E8833A", pageIds: ["a", "b"] },
      { id: "g2", name: "风险", color: "#D6455E", pageIds: ["c"] }
    ]);
    expect(Object.keys(task.pages).sort()).toEqual(["a", "b", "c", "d", "e"]);
    expect(task.pages.a).toMatchObject({ title: "page-a", status: "read", url: "https://example.com/a" });
    expect(task.canvas.arrows).toEqual([{ fromPageId: "b", toPageId: "a", label: "supports" }]);
    expect(task.canvas.elements).toEqual([]);
    expect(task.createdAt).toBe("2026-08-01T00:00:00.000Z");
  });

  it("is a pure copy — the v1 workspace stays untouched", () => {
    const workspace = makeWorkspace();
    const before = JSON.stringify(workspace);
    migrateWorkspaceToTask(workspace);
    expect(JSON.stringify(workspace)).toBe(before);
  });

  it("detects unassigned pages (未归类)", () => {
    const task = makeTask();
    expect(isUnassignedPage(task, "a")).toBe(false);
    expect(isUnassignedPage(task, "e")).toBe(true);
  });
});
