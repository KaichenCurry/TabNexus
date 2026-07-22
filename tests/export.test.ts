import { describe, expect, it } from "vitest";
import { createWorkspaceExport, exportWorkspaceJson, exportWorkspaceMarkdown, safeExportFilename } from "../extension/src/core/export";
import { collectTabs, createGroup, createInitialAppState } from "../extension/src/core/workspace";

function workspaceFixture() {
  const state = createInitialAppState("en");
  const withGroup = createGroup(state.workspaces[state.activeWorkspaceId], "en", "Research");
  const groupId = withGroup.groupOrder[0];
  const result = collectTabs(withGroup, [{
    id: 1,
    windowId: 1,
    title: "Chrome Tabs API",
    url: "https://developer.chrome.com/docs/extensions/reference/api/tabs",
    pinned: false,
    active: false,
    supported: true
  }], groupId);
  return result.workspace;
}

describe("stable exports", () => {
  it("emits structured Markdown in workspace/group/card order", () => {
    const markdown = exportWorkspaceMarkdown(workspaceFixture(), "en");
    expect(markdown).toContain("# TabNexus Workspace: My workspace");
    expect(markdown).toContain("## Research");
    expect(markdown).toContain("- [Chrome Tabs API](https://developer.chrome.com/docs/extensions/reference/api/tabs)");
    expect(markdown).toContain("  - Type: web\n  - Source: user");
  });

  it("keeps settings and credentials out of JSON", () => {
    const workspace = workspaceFixture();
    const value = createWorkspaceExport(workspace, "2026-07-20T00:00:00.000Z");
    expect(value).toEqual({ schemaVersion: 1, exportedAt: "2026-07-20T00:00:00.000Z", workspace });
    const json = exportWorkspaceJson(workspace);
    expect(JSON.parse(json).workspace).toEqual(workspace);
    expect(json).not.toMatch(/apiKey|settings|tabId/i);
  });

  it("creates safe filenames", () => {
    const workspace = { ...workspaceFixture(), name: "Research: tabs / AI" };
    expect(safeExportFilename(workspace, "md")).toBe("Research-tabs-AI.md");
  });
});
