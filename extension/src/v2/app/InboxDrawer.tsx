import { useCallback, useEffect, useState } from "react";
import type { Locale, RecentClosedTab } from "../../core/types";
import { message } from "../../i18n";
import { buildInboxSnapshot, closeableTabIds, selectionToOpenTabs, type InboxTabItem } from "../core/inbox";
import type { Task } from "../core/taskModel";

type Props = {
  task: Task;
  locale: Locale;
  recentlyClosed: RecentClosedTab[];
  onClose: () => void;
  onCollect: (tabs: ReturnType<typeof selectionToOpenTabs>, closeAfter: boolean) => Promise<boolean>;
  onRestoreRecent: (item: RecentClosedTab) => void;
  onDismissRecent: (id: string) => void;
};

type RawTab = { id?: number; windowId?: number; title?: string; url?: string; favIconUrl?: string; pinned?: boolean };

export function InboxDrawer({ task, locale, recentlyClosed, onClose, onCollect, onRestoreRecent, onDismissRecent }: Props) {
  const [items, setItems] = useState<InboxTabItem[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [showSaved, setShowSaved] = useState(false);

  const refresh = useCallback(async () => {
    if (typeof chrome === "undefined" || !chrome.tabs?.query) return;
    try {
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
    }
  }, [task.id, task.pages]);

  useEffect(() => { void refresh(); }, [refresh]);

  const toggle = (tabId: number) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(tabId)) next.delete(tabId); else next.add(tabId);
      return next;
    });
  };

  const unsaved = items.filter((item) => !item.savedPageId);
  const saved = items.filter((item) => item.savedPageId);
  const selectedUnsaved = unsaved.filter((item) => selected.has(item.tabId));
  const selectedCount = selectedUnsaved.length;

  const runCollect = async (closeAfter: boolean) => {
    if (busy || selectedCount === 0) return;
    setBusy(true);
    try {
      const ok = await onCollect(selectionToOpenTabs(items, [...selected]), closeAfter);
      if (ok) setSelected(new Set());
    } finally {
      setBusy(false);
      void refresh();
    }
  };

  return (
    <aside className="tn-inbox" aria-label={message(locale, "v2Inbox")}>
      <header className="tn-inbox-header">
        <strong>{message(locale, "v2Inbox")}</strong>
        <em>{unsaved.length}</em>
        <button type="button" onClick={onClose} aria-label="close">×</button>
      </header>

      <div className="tn-inbox-list">
        {unsaved.map((item) => (
          <label key={item.tabId} className="tn-inbox-item">
            <input
              type="checkbox"
              checked={selected.has(item.tabId)}
              onChange={() => toggle(item.tabId)}
            />
            <span className="tn-inbox-title">{item.title}</span>
            <small>{domainOf(item.url)}</small>
            {item.pinned && <i className="tn-inbox-pinned">固定</i>}
          </label>
        ))}
        {unsaved.length === 0 && <p className="tn-inbox-empty">当前窗口没有未保存的页面</p>}
      </div>

      <footer className="tn-inbox-actions">
        <button
          type="button"
          className="tn-primary"
          disabled={selectedCount === 0 || busy}
          onClick={() => void runCollect(false)}
        >
          {message(locale, "v2CollectIntoTask", { count: selectedCount })}
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

      {saved.length > 0 && (
        <div className="tn-inbox-saved">
          <button type="button" onClick={() => setShowSaved((value) => !value)}>
            {message(locale, "v2SavedCollapsed", { count: saved.length })} ▸
          </button>
          {showSaved && saved.map((item) => (
            <div key={item.tabId} className="tn-inbox-saved-item">
              <span>{item.title}</span>
              <small>已保存</small>
            </div>
          ))}
        </div>
      )}

      {recentlyClosed.length > 0 && (
        <div className="tn-inbox-recent">
          <strong>最近关闭 · 未保存</strong>
          {recentlyClosed.map((item) => (
            <div key={item.id} className="tn-inbox-recent-item">
              <span>{item.title}</span>
              <button type="button" onClick={() => onRestoreRecent(item)}>↗</button>
              <button type="button" onClick={() => onDismissRecent(item.id)}>×</button>
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
