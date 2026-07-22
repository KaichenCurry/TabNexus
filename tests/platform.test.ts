import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

function chromeMock({ fileAccess = true } = {}) {
  const query = vi.fn(async () => [
    { id: 1, windowId: 1, title: "Open", url: "https://example.com/a", pinned: false, active: true },
    { id: 2, windowId: 1, title: "Settings", url: "chrome://settings", pinned: false, active: false }
  ]);
  const create = vi.fn(async () => ({ id: 3 }));
  return {
    runtime: { id: "extension-id", openOptionsPage: vi.fn(), sendMessage: vi.fn() },
    extension: { isAllowedFileSchemeAccess: vi.fn(async () => fileAccess) },
    tabs: {
      query,
      create,
      remove: vi.fn(),
      update: vi.fn(),
      onCreated: { addListener: vi.fn(), removeListener: vi.fn() },
      onRemoved: { addListener: vi.fn(), removeListener: vi.fn() },
      onUpdated: { addListener: vi.fn(), removeListener: vi.fn() },
      onMoved: { addListener: vi.fn(), removeListener: vi.fn() },
      onAttached: { addListener: vi.fn(), removeListener: vi.fn() },
      onDetached: { addListener: vi.fn(), removeListener: vi.fn() },
      onActivated: { addListener: vi.fn(), removeListener: vi.fn() }
    },
    windows: { update: vi.fn() },
    query,
    create
  };
}

describe("Chrome tab contracts", () => {
  it("queries the current window and labels internal pages unsupported", async () => {
    const mock = chromeMock();
    vi.stubGlobal("chrome", mock);
    const { queryCurrentWindowTabs } = await import("../extension/src/core/platform");
    const tabs = await queryCurrentWindowTabs();
    expect(mock.query).toHaveBeenCalledWith({ currentWindow: true });
    expect(tabs.map((tab) => tab.supported)).toEqual([true, false]);
  });

  it("restores only missing URLs and reports denied file access", async () => {
    const mock = chromeMock({ fileAccess: false });
    vi.stubGlobal("chrome", mock);
    const { restoreUrls } = await import("../extension/src/core/platform");
    const result = await restoreUrls([
      "https://example.com/a#duplicate",
      "https://example.org/new",
      "file:///Users/test/local.html"
    ]);
    expect(result).toEqual({ restored: 1, existing: 1, failed: 1, fileAccessRequired: true });
    expect(mock.create).toHaveBeenCalledWith({ url: "https://example.org/new", active: false });
  });
});
