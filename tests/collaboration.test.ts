import { describe, expect, it } from "vitest";
import { COLLABORATION_TOOL_DEFINITIONS, executeCollaborationTool, workspaceRevision } from "../src/core/collaboration";
import type { Workspace } from "../src/core/types";

function fixture(): Workspace {
  return {
    id: "ws",
    name: "Agent workspace",
    createdAt: "2026-07-21T00:00:00.000Z",
    updatedAt: "2026-07-21T00:00:00.000Z",
    groupOrder: ["research"],
    groups: { research: { id: "research", name: "Research", color: "#7A6EDC", cardIds: ["source"] } },
    cards: {
      source: { id: "source", type: "web", title: "Source", url: "https://example.com/source", note: "Keep this", status: "read", groupId: "research", source: "user" },
      evidence: { id: "evidence", type: "note", title: "Evidence", note: "Evidence note", status: "unread", groupId: null, source: "user" }
    },
    edges: []
  };
}

describe("M3 Agent collaboration contracts", () => {
  it("publishes versioned read, write, proposal, and workspace editing tools", () => {
    expect(COLLABORATION_TOOL_DEFINITIONS.map((tool) => tool.name)).toEqual([
      "read_workspace",
      "search_cards",
      "add_card",
      "add_cards",
      "write_report",
      "propose_structure",
      "edit_workspace",
      "manage_workspaces",
      "delete_workspace_items",
      "read_tab_workbench",
      "manage_tab_workbench",
      "dismiss_recent_tabs",
      "sync_browser_tabs",
      "close_browser_tabs",
      "export_workspace",
      "manage_preferences",
      "manage_agent_activity"
    ]);
    const workspaceActions = COLLABORATION_TOOL_DEFINITIONS.find((tool) => tool.name === "manage_workspaces")?.inputSchema.properties.actions.items.oneOf;
    const workbenchActions = COLLABORATION_TOOL_DEFINITIONS.find((tool) => tool.name === "manage_tab_workbench")?.inputSchema.properties.actions.items.oneOf;
    expect(workspaceActions?.map((schema) => schema.properties.type.const)).toEqual([
      "create_workspace", "set_active_workspace", "rename_workspace", "reorder_workspaces", "duplicate_workspace"
    ]);
    expect(workbenchActions?.map((schema) => schema.properties.type.const)).toEqual([
      "set_selection", "select_all", "clear_selection", "set_collapsed", "focus_tab", "reopen_recent"
    ]);
  });

  it("reads a detached workspace snapshot without settings or credentials", () => {
    const workspace = fixture();
    const execution = executeCollaborationTool(workspace, "en", { tool: "read_workspace", input: { detail: "full" } });
    expect(execution.changed).toBe(false);
    expect(execution.result).toMatchObject({ tool: "read_workspace", unchanged: false, detail: "full", workspace });
    if (execution.result.tool === "read_workspace" && execution.result.workspace) execution.result.workspace.name = "Changed copy";
    expect(workspace.name).toBe("Agent workspace");
  });

  it("supports compact, conditional, and card-scoped context reads", () => {
    const workspace = fixture();
    const revision = workspaceRevision(workspace);
    const summary = executeCollaborationTool(workspace, "en", { tool: "read_workspace" });
    expect(summary.result).toMatchObject({
      tool: "read_workspace",
      revision,
      unchanged: false,
      detail: "summary",
      summary: { revision }
    });
    if (summary.result.tool !== "read_workspace") throw new Error("unexpected result");
    expect(summary.result.summary?.cards.find((card) => card.id === "source")).toMatchObject({ id: "source", noteLength: 9 });
    expect(summary.result.tool === "read_workspace" && summary.result.summary?.cards[0]).not.toHaveProperty("note");

    const unchanged = executeCollaborationTool(workspace, "en", {
      tool: "read_workspace",
      input: { sinceRevision: revision }
    });
    expect(unchanged.result).toMatchObject({ tool: "read_workspace", revision, unchanged: true });
    expect(unchanged.result.tool === "read_workspace" && unchanged.result.summary).toBeUndefined();

    const selected = executeCollaborationTool(workspace, "en", {
      tool: "read_workspace",
      input: { detail: "full", cardIds: ["evidence"] }
    });
    if (selected.result.tool !== "read_workspace") throw new Error("unexpected result");
    expect(Object.keys(selected.result.workspace?.cards ?? {})).toEqual(["evidence"]);
    expect(selected.result.workspace?.cards.evidence.note).toBe("Evidence note");
  });

  it("adds Agent sources and writes report cards into a validated group", () => {
    const added = executeCollaborationTool(fixture(), "zh", {
      tool: "add_card",
      input: { title: "Agent source", url: "https://example.com/agent", note: "Generated finding", groupId: "research" }
    });
    expect(added.changed).toBe(true);
    expect(added.result.tool).toBe("add_card");
    const cardId = added.result.tool === "add_card" ? added.result.cardId! : "";
    expect(added.workspace.cards[cardId]).toMatchObject({ source: "agent", groupId: "research" });

    const reported = executeCollaborationTool(added.workspace, "zh", {
      tool: "write_report",
      input: { title: "Research report", content: "Conclusion and next steps", groupId: "research" }
    });
    const reportId = reported.result.tool === "write_report" ? reported.result.cardId! : "";
    expect(reported.workspace.cards[reportId]).toMatchObject({
      type: "report",
      source: "agent",
      note: "Conclusion and next steps",
      groupId: "research"
    });
  });

  it("adds many cards atomically, reports duplicates, and applies card status", () => {
    const workspace = fixture();
    const execution = executeCollaborationTool(workspace, "en", {
      tool: "add_cards",
      input: {
        expectedRevision: workspaceRevision(workspace),
        operationId: "agent:batch-1",
        cards: [
          { title: "Duplicate", url: "https://example.com/source" },
          { title: "New source", url: "https://example.com/new", groupId: "research", status: "read" },
          { title: "Agent note", note: "Remember this", type: "note", groupId: "research" }
        ]
      }
    });
    expect(execution.result).toMatchObject({
      tool: "add_cards",
      addedCardIds: [expect.stringMatching(/^card_/), expect.stringMatching(/^card_/)],
      duplicateCardIds: ["source"],
      operationId: "agent:batch-1"
    });
    if (execution.result.tool !== "add_cards") throw new Error("unexpected result");
    expect(execution.workspace.cards[execution.result.addedCardIds[0]]).toMatchObject({ source: "agent", status: "read", groupId: "research" });
    expect(() => executeCollaborationTool(workspace, "en", {
      tool: "add_cards",
      input: {
        expectedRevision: workspaceRevision(workspace),
        operationId: "agent:invalid-batch",
        cards: [{ title: "Unsafe", type: "invented" as any }]
      }
    })).toThrow(/Unsupported card type/);
    expect(Object.keys(workspace.cards)).toEqual(["source", "evidence"]);
  });

  it("rejects stale writes and returns retry-safe operation receipts", () => {
    const workspace = fixture();
    expect(() => executeCollaborationTool(workspace, "en", {
      tool: "add_card",
      input: { title: "Stale write", expectedRevision: "wsr_old", operationId: "run-1:add-source" }
    })).toThrow(/Workspace changed/);

    const execution = executeCollaborationTool(workspace, "en", {
      tool: "add_card",
      input: {
        title: "Fresh write",
        expectedRevision: workspaceRevision(workspace),
        operationId: "run-1:add-source"
      }
    });
    expect(execution.result).toMatchObject({
      tool: "add_card",
      operationId: "run-1:add-source",
      revision: expect.stringMatching(/^wsr_/)
    });
  });

  it("returns a non-destructive relationship proposal and blocks unknown references", () => {
    const proposed = executeCollaborationTool(fixture(), "en", {
      tool: "propose_structure",
      input: { summary: "Evidence supports source", edges: [{ fromCardId: "evidence", toCardId: "source", label: "supports" }] }
    });
    expect(proposed.changed).toBe(false);
    expect(proposed.result).toMatchObject({
      tool: "propose_structure",
      proposal: { source: "ai", summary: "Evidence supports source", edges: [{ fromCardId: "evidence", toCardId: "source", label: "supports" }] }
    });
    expect(() => executeCollaborationTool(fixture(), "en", {
      tool: "propose_structure",
      input: { edges: [{ fromCardId: "invented", toCardId: "source" }] }
    })).toThrow(/reference/);
  });

  it("atomically edits classification, metadata, graph layout, and relationships", () => {
    const workspace = fixture();
    const execution = executeCollaborationTool(workspace, "zh", {
      tool: "edit_workspace",
      input: {
        expectedRevision: workspaceRevision(workspace),
        operationId: "agent:organize-1",
        actions: [
          { type: "rename_workspace", name: "Agent 整理后的工作区" },
          { type: "create_group", groupId: "agent_evidence", name: "Evidence", color: "#3379D6" },
          { type: "move_cards", cardIds: ["evidence"], targetGroupId: "agent_evidence" },
          { type: "update_card", cardId: "source", note: "Agent updated note", status: "adopted" },
          { type: "position_cards", positions: [{ cardId: "source", x: 120, y: 80 }, { cardId: "evidence", x: 420, y: 80 }] },
          { type: "upsert_edges", edges: [{ fromCardId: "evidence", toCardId: "source", label: "supports" }] }
        ]
      }
    });
    expect(execution.changed).toBe(true);
    expect(execution.workspace.name).toBe("Agent 整理后的工作区");
    expect(execution.workspace.cards.evidence.groupId).toBe("agent_evidence");
    expect(execution.workspace.cards.source).toMatchObject({ note: "Agent updated note", status: "adopted", flow: { x: 120, y: 80 } });
    expect(execution.workspace.edges).toContainEqual({ fromCardId: "evidence", toCardId: "source", label: "supports" });
    expect(execution.result).toMatchObject({
      tool: "edit_workspace",
      changed: true,
      operationId: "agent:organize-1",
      createdGroupIds: ["agent_evidence"]
    });
    expect(workspace.name).toBe("Agent workspace");
  });

  it("requires fresh context for workspace edits", () => {
    const workspace = fixture();
    expect(() => executeCollaborationTool(workspace, "en", {
      tool: "edit_workspace",
      input: {
        expectedRevision: "wsr_stale",
        operationId: "agent:move-1",
        actions: [{ type: "move_cards", cardIds: ["source"], targetGroupId: null }]
      }
    })).toThrow(/Workspace changed/);
  });

  it("supports precise card order, URL updates, insertion positions, and layout reset", () => {
    const workspace = fixture();
    const execution = executeCollaborationTool(workspace, "en", {
      tool: "edit_workspace",
      input: {
        expectedRevision: workspaceRevision(workspace),
        operationId: "agent:detail-edit",
        actions: [
          { type: "move_cards", cardIds: ["evidence"], targetGroupId: "research", position: 0 },
          { type: "reorder_cards", groupId: "research", cardIds: ["source", "evidence"] },
          { type: "update_card", cardId: "evidence", url: "https://example.com/evidence", status: "adopted" },
          { type: "position_cards", positions: [{ cardId: "evidence", x: 500, y: 200 }] },
          { type: "reset_card_positions", cardIds: ["evidence"] }
        ]
      }
    });
    expect(execution.workspace.groups.research.cardIds).toEqual(["source", "evidence"]);
    expect(execution.workspace.cards.evidence).toMatchObject({ url: "https://example.com/evidence", type: "web", status: "adopted" });
    expect(execution.workspace.cards.evidence).not.toHaveProperty("flow");
  });
});
