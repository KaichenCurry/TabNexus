import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { loadAppState, loadSettings, saveAppState } from "./core/storage";
import { collectTabs, updateWorkspace } from "./core/workspace";
import { isSupportedUrl } from "./core/url";
import type { AppState, Locale, OpenTab, Settings } from "./core/types";
import { message } from "./i18n";
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
  const active = state.workspaces[state.activeWorkspaceId];

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
      setStatus(message(locale, "v2SavedToast"));
      setTimeout(() => window.close(), 700);
    } catch {
      setStatus("保存失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="popup">
      <header className="popup-head">
        <strong>TabNexus</strong>
        <small>{active.name}</small>
      </header>
      <button type="button" className="popup-primary" disabled={busy} onClick={() => void saveCurrentPage()}>
        {message(locale, "v2PopupSaveCurrent")}
      </button>
      <button type="button" className="popup-secondary" onClick={() => openDocument(true)}>
        {message(locale, "v2PopupSelectWindow")}
      </button>
      <button type="button" className="popup-secondary" onClick={() => openDocument(false)}>
        {message(locale, "v2OpenTaskDoc")}
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
