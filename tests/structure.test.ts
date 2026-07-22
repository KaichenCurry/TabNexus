import { describe, expect, it } from "vitest";
import {
  applyStructureProposal,
  createLocalStructureProposal,
  validateStructureProposal
} from "../extension/src/core/structure";
import { collectTabs, createGroup, createInitialAppState } from "../extension/src/core/workspace";
import type { OpenTab } from "../extension/src/core/types";

function tab(id: number): OpenTab {
  return {
    id,
    windowId: 1,
    title: `Source ${id}`,
    url: `https://example.com/${id}`,
    pinned: false,
    active: false,
    supported: true
  };
}

function sampleWorkspace() {
  const state = createInitialAppState("zh");
  const grouped = createGroup(state.workspaces[state.activeWorkspaceId], "zh", "资料");
  return collectTabs(grouped, [tab(1), tab(2), tab(3)], grouped.groupOrder[0]).workspace;
}

describe("task structure proposals", () => {
  it("validates AI edges and rejects invented or duplicate references", () => {
    const workspace = sampleWorkspace();
    const [first, second] = Object.keys(workspace.cards);
    expect(validateStructureProposal({
      edges: [{ fromCardId: first, toCardId: second, label: "支持" }],
      summary: "结构"
    }, workspace)).toMatchObject({ source: "ai", edges: [{ fromCardId: first, toCardId: second, label: "支持" }] });

    expect(() => validateStructureProposal({ edges: [{ fromCardId: first, toCardId: "invented" }] }, workspace)).toThrow();
    expect(() => validateStructureProposal({
      edges: [
        { fromCardId: first, toCardId: second },
        { fromCardId: first, toCardId: second }
      ]
    }, workspace)).toThrow();
  });

  it("creates a deterministic local fallback and merges it without deleting existing edges", () => {
    const workspace = sampleWorkspace();
    const proposal = createLocalStructureProposal(workspace, "zh");
    expect(proposal.edges).toHaveLength(2);
    expect(applyStructureProposal(workspace, proposal).edges).toEqual(proposal.edges);
  });

  it("connects adjacent non-empty groups so cold-start suggestions remain useful", () => {
    const state = createInitialAppState("zh");
    const first = createGroup(state.workspaces[state.activeWorkspaceId], "zh", "输入");
    const second = createGroup(first, "zh", "结论");
    const withFirst = collectTabs(second, [tab(1)], second.groupOrder[0]).workspace;
    const workspace = collectTabs(withFirst, [tab(2)], second.groupOrder[1]).workspace;
    const proposal = createLocalStructureProposal(workspace, "zh");
    expect(proposal.edges).toEqual([{
      fromCardId: workspace.groups[workspace.groupOrder[0]].cardIds[0],
      toCardId: workspace.groups[workspace.groupOrder[1]].cardIds[0],
      label: "下一步"
    }]);
  });
});
