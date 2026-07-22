import { describe, expect, it } from "vitest";
import { createGroupingRequest } from "../extension/src/core/ai";
import type { Workspace } from "../extension/src/core/types";

describe("AI grouping request", () => {
  it("includes the user instruction, existing group names, and title-only sources", () => {
    const workspace: Workspace = {
      id: "ws",
      name: "Research",
      createdAt: "2026-07-21T00:00:00.000Z",
      updatedAt: "2026-07-21T00:00:00.000Z",
      groupOrder: ["group"],
      groups: { group: { id: "group", name: "Background", color: "#33549E", cardIds: ["web"] } },
      edges: [],
      cards: {
        web: { id: "web", type: "web", title: "Reference", url: "https://example.com", note: "private note", status: "read", groupId: "group", source: "user", savedAt: "2026-07-20T08:00:00.000Z", lastAccessedAt: "2026-07-21T09:00:00.000Z" },
        note: { id: "note", type: "note", title: "Working hypothesis", note: "private reasoning", status: "unread", groupId: null, source: "user" }
      }
    };
    const request = createGroupingRequest(workspace, "en", ["web", "note"], "Group by evidence strength");
    expect(request.instruction).toBe("Group by evidence strength");
    expect(request.cards[0]).toMatchObject({
      id: "web",
      title: "Reference",
      url: "https://example.com",
      hostname: "example.com",
      type: "web",
      savedAt: "2026-07-20T08:00:00.000Z",
      lastAccessedAt: "2026-07-21T09:00:00.000Z"
    });
    expect(request.cards[1]).toMatchObject({ id: "note", title: "Working hypothesis", type: "note" });
    expect(request.existingGroups[0]).toMatchObject({ id: "group", name: "Background" });
    expect(JSON.stringify(request)).not.toContain("private");
  });
});
