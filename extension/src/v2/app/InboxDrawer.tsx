import { useCallback, useEffect, useState } from "react";
import type { Locale, RecentClosedTab } from "../../core/types";
import { message } from "../../i18n";
import { buildInboxSnapshot, closeableTabIds, selectionToOpenTabs, type InboxTabItem } from "../core/inbox";
import type { Task } from "../core/taskModel";
import { Icon } from "./Icon";

type Props = {
  task: Task;
  locale: Locale;
  recentlyClosed: RecentClosedTab[];
  targetSectionName?: string;
  onClose: () => void;
  onCollect: (tabs: ReturnType<typeof selectionToOpenTabs>, closeAfter: boolean) => Promise<"saved" | "cancelled" | "failed">;
  onRestoreRecent: (item: RecentClosedTab) => void;
  onDismissRecent: (id: string) => void;
};

type RawTab = { id?: number; windowId?: number; title?: string; url?: string; favIconUrl?: string; pinned?: boolean };

export function InboxDrawer({ task, locale, recentlyClosed, targetSectionName, onClose, onCollect, onRestoreRecent, onDismissRecent }: Props) {
  const [items, setItems] = useState<InboxTabItem[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (typeof chrome === "undefined" || !chrome.tabs?.query) return;
    try {
      setError(null);
      const tabs = await chrome.tabs.query({ lastFocusedWindow: true });
      const raw: RawTab[] = tabs;
      const snapshot = buildInboxSnapshot(task, raw
        .filter((tab): tab is Required<Pick<RawTab, "id" | "windowId">> & RawTab => tab.id !== undefined && tab.windowId !== undefined)
        .map((tab) => ({
          id: tab.id!,
          windowId: tab.windowId!,
          title: tab.title ?? (tab.url ?? ""),
          url: tab.url ?? "",
          favicon: tab.favIconUrl,
          pinned: Boolean(tab.pinned)
        })));
      setItems(snapshot.items);
    } catch {
      setItems([]);
      setError(locale === "zh" ? "无法读取当前窗口，请重新打开收件口" : "Could not read the current window. Reopen the inbox.");
    }
  }, [locale, task.id, task.pages]);

  useEffect(() => { void refresh(); }, [refresh]);

  const toggle = (tabId: number) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(tabId)) next.delete(tabId); else next.add(tabId);
      return next;
    });
  };

  const unsaved = items.filter((item) => !item.savedPageId);
  const selectedUnsaved = unsaved.filter((item) => selected.has(item.tabId));
  const selectedCount = selectedUnsaved.length;
  const allSelected = unsaved.length > 0 && selectedCount === unsaved.length;

  useEffect(() => {
    const available = new Set(unsaved.map((item) => item.tabId));
    setSelected((current) => new Set([...current].filter((id) => available.has(id))));
  }, [items]);

  const runCollect = async (closeAfter: boolean) => {
    if (busy || selectedCount === 0) return;
    setBusy(true);
    try {
      const result = await onCollect(selectionToOpenTabs(items, [...selected]), closeAfter);
      if (result === "saved") setSelected(new Set());
      if (result === "failed") setError(locale === "zh" ? "保存失败，浏览器页面没有被关闭" : "Save failed. Browser pages were left open.");
    } finally {
      setBusy(false);
      void refresh();
    }
  };

  return (
    <aside className="tn-inbox" aria-label={message(locale, "v2Inbox")}>
      <header className="tn-inbox-header">
        <span>
          <small>{targetSectionName ? message(locale, "v2Inbox") : (locale === "zh" ? "当前窗口" : "Current window")}</small>
          <strong>{targetSectionName
            ? (locale === "zh" ? `收进「${targetSectionName}」` : `Add to “${targetSectionName}”`)
            : (locale === "zh" ? "标签操作台" : "Tab workbench")}</strong>
        </span>
        <em>{items.length} {locale === "zh" ? "个打开" : "open"}</em>
        <button type="button" onClick={onClose} aria-label={message(locale, "closeModal")}><Icon name="close" /></button>
      </header>

      <div className="tn-inbox-tools">
        <label>
          <input
            type="checkbox"
            checked={allSelected}
            disabled={unsaved.length === 0}
            onChange={() => setSelected(allSelected ? new Set() : new Set(unsaved.map((item) => item.tabId)))}
          />
          {locale === "zh" ? "全选未保存页面" : "Select all unsaved pages"}
        </label>
        <button type="button" onClick={() => void refresh()}>{locale === "zh" ? "刷新" : "Refresh"}</button>
      </div>

      <div className="tn-inbox-list">
        {items.map((item) => (
          <label key={item.tabId} className={`tn-inbox-item ${item.savedPageId ? "saved" : ""}`}>
            <input
              type="checkbox"
              checked={Boolean(item.savedPageId) || selected.has(item.tabId)}
              disabled={Boolean(item.savedPageId)}
              onChange={() => toggle(item.tabId)}
            />
            {item.favicon ? <img src={item.favicon} alt="" /> : <span className="tn-inbox-fallback">{item.title.slice(0, 1).toUpperCase()}</span>}
            <span className="tn-inbox-copy">
              <span className="tn-inbox-title">{item.title}</span>
              <small>{domainOf(item.url)}{item.savedPageId ? ` · ${locale === "zh" ? "已保存" : "saved"}` : ""}</small>
            </span>
            {item.pinned && <i className="tn-inbox-pinned">{locale === "zh" ? "固定" : "Pinned"}</i>}
          </label>
        ))}
        {items.length === 0 && <p className="tn-inbox-empty">当前窗口没有可管理的网页标签</p>}
        {error && <p className="tn-inbox-error">{error}</p>}
      </div>

      <footer className="tn-inbox-actions">
        <button
          type="button"
          className="tn-primary"
          disabled={selectedCount === 0 || busy}
          onClick={() => void runCollect(false)}
        >
          {busy
            ? (locale === "zh" ? "正在保存…" : "Saving…")
            : targetSectionName
              ? (locale === "zh" ? `收进「${targetSectionName}」 ${selectedCount}` : `Add to “${targetSectionName}” ${selectedCount}`)
              : message(locale, "v2CollectIntoTask", { count: selectedCount })}
        </button>
        {selectedCount > 0 && (
          <button
            type="button"
            className="tn-inbox-close-after"
            disabled={busy || closeableTabIds(items, [...selected]).length === 0}
            onClick={() => void runCollect(true)}
          >
            {message(locale, "v2SaveAndClose")}
          </button>
        )}
      </footer>

      {recentlyClosed.length > 0 && (
        <div className="tn-inbox-recent">
          <strong>最近关闭 · 未保存</strong>
          {recentlyClosed.map((item) => (
            <div key={item.id} className="tn-inbox-recent-item">
              <span>{item.title}</span>
              <button type="button" onClick={() => onRestoreRecent(item)} aria-label={message(locale, "v2Restore")}><Icon name="external" /></button>
              <button type="button" onClick={() => onDismissRecent(item.id)} aria-label={message(locale, "delete")}><Icon name="close" /></button>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}

function domainOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}
