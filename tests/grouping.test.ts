import { describe, expect, it } from "vitest";
import { applyGroupingProposal, createDomainProposal, validateGroupingProposal } from "../extension/src/core/grouping";
import { collectTabs, createInitialAppState } from "../extension/src/core/workspace";
import type { OpenTab } from "../extension/src/core/types";

const openTabs: OpenTab[] = [
  { id: 1, windowId: 1, title: "Docs", url: "https://docs.example.com/a", pinned: false, active: false, supported: true },
  { id: 2, windowId: 1, title: "Blog", url: "https://blog.example.com/b", pinned: false, active: false, supported: true },
  { id: 3, windowId: 1, title: "Other", url: "https://other.org/c", pinned: false, active: false, supported: true }
];

function populatedWorkspace() {
  const state = createInitialAppState("en");
  return collectTabs(state.workspaces[state.activeWorkspaceId], openTabs).workspace;
}

describe("grouping proposals", () => {
  it("creates deterministic registrable-domain groups and applies them", () => {
    const workspace = populatedWorkspace();
    const proposal = createDomainProposal(workspace, "en");
    expect(proposal.groups.map((group) => group.name)).toEqual(["example.com", "other.org"]);
    const next = applyGroupingProposal(workspace, proposal);
    expect(Object.values(next.cards).every((card) => card.groupId)).toBe(true);
    expect(next.groupOrder).toHaveLength(2);
  });

  it("groups only the selected cards when the right-rail selection is scoped", () => {
    const workspace = populatedWorkspace();
    const ids = Object.keys(workspace.cards);
    const proposal = createDomainProposal(workspace, "en", [ids[2]]);
    expect(proposal.groups.map((group) => group.name)).toEqual(["other.org"]);
    expect(proposal.assignments.map((assignment) => assignment.cardId)).toEqual([ids[2]]);
  });

  it("accepts a complete schema-valid AI response", () => {
    const workspace = populatedWorkspace();
    const ids = Object.keys(workspace.cards);
    const result = validateGroupingProposal({
      basis: "Page type",
      groups: [
        { id: "new_platform", name: "Platform", color: "#33549E" },
        { id: "new_other", name: "Other", color: "#9A78D4" }
      ],
      assignments: [
        { cardId: ids[0], groupId: "new_platform" },
        { cardId: ids[1], groupId: "new_platform" },
        { cardId: ids[2], groupId: "new_other" }
      ]
    }, workspace, ids);
    expect(result.source).toBe("ai");
    expect(result.basis).toBe("Page type");
    expect(result.assignments).toHaveLength(3);
  });

  it("replaces vacated topic groups when a custom instruction defines a new taxonomy", () => {
    const ungrouped = populatedWorkspace();
    const topicProposal = createDomainProposal(ungrouped, "en");
    const workspace = applyGroupingProposal(ungrouped, topicProposal);
    const ids = Object.keys(workspace.cards);
    const next = applyGroupingProposal(workspace, {
      source: "ai",
      instruction: "Group by page type",
      pruneEmptyGroups: true,
      basis: "Page type",
      groups: [
        { id: "new_docs", name: "Documentation", color: "#33549E", isNew: true },
        { id: "new_articles", name: "Articles", color: "#7A6EDC", isNew: true }
      ],
      assignments: [
        { cardId: ids[0], groupId: "new_docs" },
        { cardId: ids[1], groupId: "new_articles" },
        { cardId: ids[2], groupId: "new_articles" }
      ]
    });
    expect(next.groupOrder).toEqual(["new_docs", "new_articles"]);
    expect(Object.values(next.groups).map((group) => group.name)).toEqual(["Documentation", "Articles"]);
  });

  it("rejects duplicate assignments, illegal colors, and empty groups", () => {
    const workspace = populatedWorkspace();
    const ids = Object.keys(workspace.cards);
    expect(() => validateGroupingProposal({
      groups: [{ id: "g", name: "One", color: "blue" }],
      assignments: ids.map((cardId) => ({ cardId, groupId: "g" }))
    }, workspace, ids)).toThrow();
    expect(() => validateGroupingProposal({
      groups: [
        { id: "g", name: "One", color: "#33549E" },
        { id: "unused", name: "Unused", color: "#9A78D4" }
      ],
      assignments: ids.map((cardId) => ({ cardId, groupId: "g" }))
    }, workspace, ids)).toThrow("empty");
  });
});
