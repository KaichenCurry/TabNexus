/*
 * TabNexus v2 收件口（Inbox）纯逻辑：当前窗口标签 ↔ 任务页面的快照与选择。
 * 全部纯函数，可单测；chrome.* 访问只存在于组件层。
 */
import { isSupportedUrl, normalizeUrl } from "../../core/url";
import type { BrowserTabContext, OpenTab } from "../../core/types";
import type { Task } from "./taskModel";

export type InboxTabItem = {
  tabId: number;
  windowId: number;
  title: string;
  url: string;
  favicon?: string;
  pinned: boolean;
  /** 该标签是否已保存为当前任务的页（按规范化 URL 去重） */
  savedPageId?: string;
};

export type InboxSnapshot = {
  items: InboxTabItem[];
  unsaved: InboxTabItem[];
  savedOpen: InboxTabItem[];
  openCount: number;
  unsavedCount: number;
  savedCount: number;
};

/** 由浏览器原始标签构建收件口快照（纯函数，输入已是普通对象） */
export function buildInboxSnapshot(
  task: Pick<Task, "pages">,
  tabs: Array<{ id: number; windowId: number; title: string; url: string; favicon?: string; pinned: boolean }>
): InboxSnapshot {
  const pageUrls = new Map(
    Object.values(task.pages).flatMap((page) => (page.url ? [[normalizeUrl(page.url), page.id] as const] : []))
  );
  const items: InboxTabItem[] = tabs
    .filter((tab) => isSupportedUrl(tab.url))
    .map((tab) => {
      const savedPageId = pageUrls.get(normalizeUrl(tab.url));
      return {
        tabId: tab.id,
        windowId: tab.windowId,
        title: tab.title,
        url: tab.url,
        favicon: tab.favicon,
        pinned: tab.pinned,
        savedPageId
      };
    });
  const unsaved = items.filter((item) => !item.savedPageId);
  const savedOpen = items.filter((item) => item.savedPageId);
  return {
    items,
    unsaved,
    savedOpen,
    openCount: items.length,
    unsavedCount: unsaved.length,
    savedCount: savedOpen.length
  };
}

/** 收件口选择 → collectTabs 需要的 OpenTab[]（仅未保存项） */
export function selectionToOpenTabs(items: InboxTabItem[], selectedTabIds: number[]): OpenTab[] {
  const selected = new Set(selectedTabIds);
  return items
    .filter((item) => selected.has(item.tabId) && !item.savedPageId)
    .map((item) => ({
      id: item.tabId,
      windowId: item.windowId,
      title: item.title,
      url: item.url,
      favicon: item.favicon,
      pinned: item.pinned,
      active: false,
      supported: true
    }));
}

/** 关闭保护：固定标签永不批量关闭 */
export function closeableTabIds(items: InboxTabItem[], selectedTabIds: number[]): number[] {
  const selected = new Set(selectedTabIds);
  return items.filter((item) => selected.has(item.tabId) && !item.pinned).map((item) => item.tabId);
}
