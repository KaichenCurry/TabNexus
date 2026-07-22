import { normalizeUrl, isSupportedUrl } from "./url";
import type {
  BackgroundRequest,
  BackgroundResponse,
  OpenTab,
  RestoreResult
} from "./types";

export const isExtensionRuntime =
  typeof chrome !== "undefined" && Boolean(chrome.runtime?.id && chrome.tabs);

const DEV_TABS: OpenTab[] = [
  {
    id: 101,
    windowId: 1,
    title: "Perplexity AI — Funding Rounds",
    url: "https://www.crunchbase.com/organization/perplexity-ai",
    favicon: "",
    pinned: false,
    active: false,
    supported: true,
    lastAccessedAt: "2026-07-20T09:15:00.000Z"
  },
  {
    id: 102,
    windowId: 1,
    title: "How we built retrieval at scale",
    url: "https://blog.perplexity.ai/retrieval",
    favicon: "",
    pinned: false,
    active: false,
    supported: true,
    lastAccessedAt: "2026-07-21T01:20:00.000Z"
  },
  {
    id: 103,
    windowId: 1,
    title: "Pinned research inbox",
    url: "https://example.com/inbox",
    favicon: "",
    pinned: true,
    active: false,
    supported: true,
    lastAccessedAt: "2026-07-19T16:40:00.000Z"
  }
];

const restoredUrlByTabId = new Map<number, string>();

function toOpenTab(tab: chrome.tabs.Tab): OpenTab | null {
  if (tab.id === undefined || tab.windowId === undefined) return null;
  const rawUrl = tab.url ?? tab.pendingUrl ?? "";
  const restoredUrl = restoredUrlByTabId.get(tab.id);
  const rawSupported = isSupportedUrl(rawUrl);
  const url = restoredUrl && !rawSupported ? restoredUrl : rawUrl;
  if (restoredUrl && rawSupported && normalizeUrl(rawUrl) !== normalizeUrl(restoredUrl)) {
    restoredUrlByTabId.delete(tab.id);
  }
  return {
    id: tab.id,
    windowId: tab.windowId,
    title: restoredUrl && !rawSupported ? restoredUrl : tab.title ?? url,
    url,
    favicon: tab.favIconUrl,
    pinned: Boolean(tab.pinned),
    active: Boolean(tab.active),
    supported: isSupportedUrl(url),
    lastAccessedAt: typeof tab.lastAccessed === "number" ? new Date(tab.lastAccessed).toISOString() : undefined
  };
}

export async function queryCurrentWindowTabs(): Promise<OpenTab[]> {
  if (!isExtensionRuntime) return DEV_TABS;
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const liveIds = new Set(tabs.flatMap((tab) => tab.id === undefined ? [] : [tab.id]));
  for (const tabId of restoredUrlByTabId.keys()) {
    if (!liveIds.has(tabId)) restoredUrlByTabId.delete(tabId);
  }
  return tabs.map(toOpenTab).filter((tab): tab is OpenTab => Boolean(tab));
}

export function subscribeToTabChanges(onChange: () => void): () => void {
  if (!isExtensionRuntime) return () => undefined;
  const listener = () => onChange();
  chrome.tabs.onCreated.addListener(listener);
  chrome.tabs.onRemoved.addListener(listener);
  chrome.tabs.onUpdated.addListener(listener);
  chrome.tabs.onMoved.addListener(listener);
  chrome.tabs.onAttached.addListener(listener);
  chrome.tabs.onDetached.addListener(listener);
  chrome.tabs.onActivated.addListener(listener);
  return () => {
    chrome.tabs.onCreated.removeListener(listener);
    chrome.tabs.onRemoved.removeListener(listener);
    chrome.tabs.onUpdated.removeListener(listener);
    chrome.tabs.onMoved.removeListener(listener);
    chrome.tabs.onAttached.removeListener(listener);
    chrome.tabs.onDetached.removeListener(listener);
    chrome.tabs.onActivated.removeListener(listener);
  };
}

export async function closeTabIds(tabIds: number[]): Promise<void> {
  if (!isExtensionRuntime || tabIds.length === 0) return;
  await chrome.tabs.remove(tabIds);
}

export async function focusOrOpenUrl(url: string): Promise<void> {
  if (!isExtensionRuntime) {
    globalThis.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  const normalized = normalizeUrl(url);
  const tabs = await chrome.tabs.query({});
  const existing = tabs.find((tab) => tab.id !== undefined && tab.url && normalizeUrl(tab.url) === normalized);
  if (existing?.id !== undefined) {
    await chrome.tabs.update(existing.id, { active: true });
    if (existing.windowId !== undefined) await chrome.windows.update(existing.windowId, { focused: true });
    return;
  }
  if (url.startsWith("file:") && !(await isFileAccessAllowed())) {
    throw new Error("FILE_ACCESS_REQUIRED");
  }
  await chrome.tabs.create({ url, active: true });
}

export async function restoreUrls(urls: string[]): Promise<RestoreResult> {
  if (!isExtensionRuntime) {
    return { restored: urls.length, existing: 0, failed: 0, fileAccessRequired: false };
  }
  const openTabs = await chrome.tabs.query({ currentWindow: true });
  const openUrls = new Set(openTabs.map((tab) => tab.url).filter(Boolean).map((url) => normalizeUrl(url!)));
  let restored = 0;
  let existing = 0;
  let failed = 0;
  let fileAccessRequired = false;
  const fileAccess = await isFileAccessAllowed();

  for (const url of urls) {
    const normalized = normalizeUrl(url);
    if (openUrls.has(normalized)) {
      existing += 1;
      continue;
    }
    if (url.startsWith("file:") && !fileAccess) {
      failed += 1;
      fileAccessRequired = true;
      continue;
    }
    try {
      const created = await chrome.tabs.create({ url, active: false });
      openUrls.add(normalized);
      restored += 1;
      if (created.id !== undefined) restoredUrlByTabId.set(created.id, url);
    } catch {
      failed += 1;
    }
  }
  return { restored, existing, failed, fileAccessRequired };
}

export async function isFileAccessAllowed(): Promise<boolean> {
  if (!isExtensionRuntime) return true;
  try {
    return await chrome.extension.isAllowedFileSchemeAccess();
  } catch {
    return false;
  }
}

export async function openOptions(): Promise<void> {
  if (isExtensionRuntime) await chrome.runtime.openOptionsPage();
  else globalThis.location.href = "/options.html";
}

export async function openExtensionDetails(): Promise<void> {
  if (!isExtensionRuntime) return;
  await chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });
}

export async function sendBackgroundRequest<T>(request: BackgroundRequest): Promise<BackgroundResponse<T>> {
  if (!isExtensionRuntime) return { ok: false, error: "Extension service worker is unavailable" };
  return (await chrome.runtime.sendMessage(request)) as BackgroundResponse<T>;
}

export async function copyText(value: string): Promise<void> {
  await navigator.clipboard.writeText(value);
}

export function downloadText(filename: string, value: string, type: string): void {
  const blob = new Blob([value], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
