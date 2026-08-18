import { describe, expect, it } from "vitest";
import { buildRegroupRequest, createDomainProposalV2, createTimeProposal } from "../../extension/src/v2/core/regroup";
import { migrateWorkspaceToTask } from "../../extension/src/v2/core/taskModel";
import type { Card, Workspace } from "../../extension/src/core/types";

function makeTask(): ReturnType<typeof migrateWorkspaceToTask> {
  const card = (id: string, overrides: Partial<Card> = {}): Card => ({
    id, type: "web", title: id, url: `https://${id}.example.com`, note: "", status: "unread", groupId: null, source: "user", ...overrides
  });
  const workspace: Workspace = {
    id: "task-1", name: "t",
    createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z",
    groupOrder: [], groups: {},
    cards: {
      today: card("today", { savedAt: "2026-08-15T09:00:00.000Z" }),
      week: card("week", { savedAt: "2026-08-12T09:00:00.000Z" }),
      old: card("old", { savedAt: "2026-07-01T09:00:00.000Z" }),
      undated: card("undated", { savedAt: undefined }),
      dup: card("dup", { url: "https://today.example.com/other" })
    },
    edges: []
  };
  return migrateWorkspaceToTask(workspace);
}

// 固定"现在"= 2026-08-15 周五
const NOW = new Date("2026-08-15T12:00:00.000Z");

describe("v2 regroup", () => {
  it("buckets pages by savedAt into 今天/本周/更早", () => {
    const task = makeTask();
    const proposal = createTimeProposal(task, ["today", "week", "old", "undated"], NOW);
    expect(proposal.source).toBe("local");
    expect(proposal.pruneEmptyGroups).toBe(true);
    const groups = Object.fromEntries(proposal.groups.map((group) => [group.name, proposal.assignments.filter((a) => a.groupId === group.id).map((a) => a.cardId)]));
    expect(groups["今天"]).toEqual(["today"]);
    expect(groups["本周"]).toEqual(["week"]);
    expect(groups["更早"]).toEqual(["old", "undated"]);
  });

  it("keeps assignment ids aligned when only a later time bucket is present", () => {
    const task = makeTask();
    const proposal = createTimeProposal(task, ["old", "undated"], NOW);
    expect(proposal.groups).toHaveLength(1);
    expect(proposal.groups[0].name).toBe("更早");
    expect(new Set(proposal.assignments.map((assignment) => assignment.groupId))).toEqual(new Set([proposal.groups[0].id]));
  });

  it("groups by domain locally and reuses nothing when no sections exist", () => {
    const task = makeTask();
    const proposal = createDomainProposalV2(task, "zh", ["today", "dup"]);
    expect(proposal.source).toBe("domain");
    expect(proposal.assignments).toHaveLength(2);
    // today.example.com 的两个页面归入同一域名组
    const groupIds = new Set(proposal.assignments.map((assignment) => assignment.groupId));
    expect(groupIds.size).toBe(1);
  });

  it("builds an AI regroup request with metadata only", () => {
    const task = makeTask();
    const request = buildRegroupRequest(task, "zh", ["today", "week"], "按背景、证据划分");
    expect(request.instruction).toBe("按背景、证据划分");
    expect(request.cards.map((card) => card.id)).toEqual(["today", "week"]);
    expect(request.cards[0].hostname).toBe("today.example.com");
    expect(request.cards[0]).not.toHaveProperty("note");
    expect(request.existingGroups).toEqual([]);
  });
});
