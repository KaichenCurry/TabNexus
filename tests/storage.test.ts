import { beforeEach, describe, expect, it } from "vitest";
import {
  clearAgentActivity,
  loadAgentActivity,
  loadAppState,
  loadRecentlyClosed,
  loadSettings,
  loadTabWorkbenchState,
  saveAppState,
  saveAgentActivity,
  saveRecentlyClosed,
  saveTabWorkbenchSelection
} from "../extension/src/core/storage";
import { createInitialAppState } from "../extension/src/core/workspace";

describe("versioned local persistence", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips schema v1 state", async () => {
    const state = createInitialAppState("en");
    await saveAppState(state);
    expect(await loadAppState("zh")).toEqual(state);
  });

  it("replaces an incompatible legacy state with a valid empty v1 state", async () => {
    localStorage.setItem("tabnexus.appState.v1", JSON.stringify({ schemaVersion: 0, workspaces: [] }));
    const state = await loadAppState("zh");
    expect(state.schemaVersion).toBe(1);
    expect(state.workspaceOrder).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem("tabnexus.appState.v1") ?? "null")).toEqual(state);
  });

  it("persists the first default workspace before returning it to an Agent", async () => {
    const state = await loadAppState("zh");
    expect(JSON.parse(localStorage.getItem("tabnexus.appState.v1") ?? "null")).toEqual(state);
    expect(await loadAppState("zh")).toEqual(state);
  });

  it("sanitizes settings and never accepts an unsupported model", async () => {
    localStorage.setItem("tabnexus.settings.v1", JSON.stringify({
      locale: "invalid",
      deepSeekModel: "other-model",
      groupingPolicy: "unknown",
      deepSeekApiKey: "  runtime-only  ",
      deepSeekVerifiedAt: "2026-07-21T00:00:00.000Z"
    }));
    const settings = await loadSettings();
    expect(settings.locale).toBe("zh");
    expect(settings.deepSeekModel).toBe("deepseek-v4-flash");
    expect(settings.groupingPolicy).toBe("suggestion");
    expect(settings.deepSeekApiKey).toBe("runtime-only");
    expect(settings.deepSeekVerifiedAt).toBe("2026-07-21T00:00:00.000Z");
    expect(settings.workspaceView).toBe("board");
    expect(settings.aiProvider).toBe("deepseek");
    expect(settings.aiProviderConfigs.deepseek).toMatchObject({
      apiKey: "runtime-only",
      model: "deepseek-v4-flash",
      verifiedAt: "2026-07-21T00:00:00.000Z"
    });
  });

  it("sanitizes independent provider settings without exposing them to workspace state", async () => {
    localStorage.setItem("tabnexus.settings.v1", JSON.stringify({
      aiEnabled: true,
      aiProvider: "openai",
      aiProviderConfigs: {
        openai: { apiKey: "  local-openai  ", model: "  gpt-5.6-terra  ", verifiedAt: "verified" },
        anthropic: { apiKey: "local-claude", model: "", verifiedAt: "" }
      }
    }));
    const settings = await loadSettings();
    expect(settings.aiEnabled).toBe(true);
    expect(settings.aiProvider).toBe("openai");
    expect(settings.aiProviderConfigs.openai).toEqual({ apiKey: "local-openai", model: "gpt-5.6-terra", verifiedAt: "verified" });
    expect(settings.aiProviderConfigs.anthropic.model).toBe("claude-sonnet-5");
  });

  it("keeps a bounded recently closed buffer separate from workspaces", async () => {
    await saveRecentlyClosed(Array.from({ length: 35 }, (_, index) => ({
      id: String(index),
      title: `Tab ${index}`,
      url: `https://example.com/${index}`,
      closedAt: "2026-07-20T00:00:00.000Z"
    })));
    expect(await loadRecentlyClosed()).toHaveLength(30);
  });

  it("persists a shared, sanitized tab-workbench selection per workspace", async () => {
    await saveTabWorkbenchSelection("ws-main", { tabIds: [3, 3, 8, -1], cardIds: ["card-a", "card-a", ""] });
    await saveTabWorkbenchSelection("ws-other", { tabIds: [12], cardIds: ["card-z"] });
    expect(await loadTabWorkbenchState()).toEqual({
      schemaVersion: 1,
      selections: {
        "ws-main": expect.objectContaining({ tabIds: [3, 8], cardIds: ["card-a"] }),
        "ws-other": expect.objectContaining({ tabIds: [12], cardIds: ["card-z"] })
      }
    });
  });

  it("keeps a bounded per-workspace Agent activity history", async () => {
    await saveAgentActivity(Array.from({ length: 55 }, (_, index) => ({
      id: `activity-${index}`,
      workspaceId: index % 2 ? "a" : "b",
      tool: "read_workspace" as const,
      status: "success" as const,
      createdAt: "2026-07-21T00:00:00.000Z",
      summary: `Read ${index}`
    })));
    expect(await loadAgentActivity()).toHaveLength(50);
    const remaining = await clearAgentActivity("a");
    expect(remaining.every((item) => item.workspaceId === "b")).toBe(true);
  });
});
