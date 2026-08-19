import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { loadAppState, loadSettings, saveAppState } from "./core/storage";
import { collectTabs, updateWorkspace } from "./core/workspace";
import { isSupportedUrl } from "./core/url";
import type { AppState, Locale, OpenTab, Settings } from "./core/types";
import { message } from "./i18n";
import { Icon } from "./v2/app/Icon";
import "./popup.css";

function Popup() {
  const [state, setState] = useState<AppState | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void Promise.all([loadAppState(), loadSettings()]).then(([loadedState, loadedSettings]) => {
      setState(loadedState);
      setSettings(loadedSettings);
    });
  }, []);

  if (!state || !settings) return null;
  const locale: Locale = settings.locale;
  const active = state.workspaces[state.activeWorkspaceId]
    ?? state.workspaceOrder.map((id) => state.workspaces[id]).find(Boolean)
    ?? Object.values(state.workspaces)[0];
  if (!active) return null;

  const openDocument = (withInbox: boolean) => {
    const url = chrome.runtime.getURL(`workspace.html${withInbox ? "?inbox=1" : ""}`);
    void chrome.tabs.create({ url });
    window.close();
  };

  const saveCurrentPage = async () => {
    if (busy) return;
    setBusy(true);
    setStatus(null);
    try {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (!tab?.id || !tab?.url || !isSupportedUrl(tab.url)) {
        setStatus("当前页面不支持保存");
        return;
      }
      const openTab: OpenTab = {
        id: tab.id,
        windowId: tab.windowId ?? 0,
        title: tab.title ?? tab.url,
        url: tab.url,
        favicon: tab.favIconUrl,
        pinned: Boolean(tab.pinned),
        active: true,
        supported: true
      };
      const collected = collectTabs(active, [openTab], null);
      await saveAppState(updateWorkspace(state, collected.workspace));
      setStatus(collected.addedTabIds.length > 0
        ? message(locale, "v2SavedToast")
        : (locale === "zh" ? "这个页面已在当前任务中" : "This page is already in the current task"));
      setTimeout(() => window.close(), 900);
    } catch {
      setStatus("保存失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="popup">
      <header className="popup-head">
        <span className="popup-brand-mark" aria-hidden="true"><i /><i /></span>
        <span>
          <strong>TabNexus</strong>
          <small>{locale === "zh" ? "把页面收进任务上下文" : "Turn pages into task context"}</small>
        </span>
      </header>
      <div className="popup-task">
        <small>{locale === "zh" ? "保存到" : "SAVE TO"}</small>
        <strong>{active.name}</strong>
        <span>{Object.keys(active.cards).length} {locale === "zh" ? "个页面" : "pages"}</span>
      </div>
      <button type="button" className="popup-primary" disabled={busy} onClick={() => void saveCurrentPage()}>
        <Icon name="collect" />
        {message(locale, "v2PopupSaveCurrent")}
      </button>
      <p className="popup-helper">{locale === "zh" ? "保存后当前页面保持打开" : "The current page stays open after saving"}</p>
      <button type="button" className="popup-secondary" onClick={() => openDocument(true)}>
        <Icon name="document" />
        {message(locale, "v2PopupSelectWindow")}
      </button>
      <button type="button" className="popup-tertiary" onClick={() => openDocument(false)}>
        {message(locale, "v2OpenTaskDoc")}
        <Icon name="external" />
      </button>
      {status && <p className="popup-status">{status}</p>}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Popup />
  </StrictMode>
);
