import { useCallback, useEffect, useMemo, useState } from "react";
import {
  loadAppState,
  loadRecentlyClosed,
  loadSettings,
  saveAppState,
  saveRecentlyClosed,
  saveSettings,
  subscribeToAppState,
  subscribeToSettings
} from "../../core/storage";
import type { AppState, Locale, OpenTab, RecentClosedTab, Settings } from "../../core/types";
import { message } from "../../i18n";
import { collectTabs, updateWorkspace } from "../../core/workspace";
import { applyGroupingProposal } from "../../core/grouping";
import {
  activeTask,
  createSection,
  createTask,
  deletePage,
  deleteSection,
  listTasks,
  movePagesToSection,
  renameSection,
  renameTask,
  setPageNote,
  setPageStatus,
  taskToWorkspaceView,
  updateTaskMeta
} from "../core/taskOps";
import type { PageStatus, Task } from "../core/taskModel";
import { TaskHeader } from "./TaskHeader";
import { SectionList } from "./SectionList";
import { ConclusionBlock } from "./ConclusionBlock";
import { FirstRun } from "./FirstRun";
import { InboxDrawer } from "./InboxDrawer";
import { CommandPalette } from "./CommandPalette";
import { OrganizeModal } from "./OrganizeModal";
import { ExportModal } from "./ExportModal";
import { HandoffModal } from "./HandoffModal";
import { RelationView } from "./RelationView";
import "../app.css";

const DEFAULT_TASK_NAMES = new Set(["我的工作区", "My workspace", "未命名工作区", "Untitled workspace"]);

export function TaskApp() {
  const [state, setState] = useState<AppState | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [pendingSave, setPendingSave] = useState<AppState | null>(null);
  const [recentlyClosed, setRecentlyClosed] = useState<RecentClosedTab[]>([]);
  const [inboxOpen, setInboxOpen] = useState(() => new URLSearchParams(window.location.search).has("inbox"));
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [organizeOpen, setOrganizeOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [view, setView] = useState<"doc" | "canvas">("doc");
  const [undoTask, setUndoTask] = useState<Task | null>(null);

  useEffect(() => {
    let disposed = false;
    void Promise.all([loadAppState(), loadSettings(), loadRecentlyClosed()]).then(([loadedState, loadedSettings, loadedRecent]) => {
      if (disposed) return;
      setState(loadedState);
      setSettings(loadedSettings);
      setRecentlyClosed(loadedRecent);
    });
    const offState = subscribeToAppState(() => {
      void loadAppState().then((next) => setState((current) => (current ? next : current)));
    });
    const offSettings = subscribeToSettings(() => {
      void loadSettings().then((next) => setSettings((current) => (current ? next : current)));
    });
    return () => { disposed = true; offState(); offSettings(); };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!pendingSave) return;
    void saveAppState(pendingSave).then(() => setPendingSave(null));
  }, [pendingSave]);

  const persist = useCallback((next: AppState) => {
    setState(next);
    setPendingSave(next);
  }, []);

  const locale: Locale = settings?.locale ?? "zh";
  const task = useMemo(() => (state ? activeTask(state) : null), [state]);
  const tasks = useMemo(() => (state ? listTasks(state) : []), [state]);

  if (!state || !settings || !task) return null;

  const isFirstRun = Object.keys(task.pages).length === 0 && !task.goal && DEFAULT_TASK_NAMES.has(task.name);

  const switchTask = (taskId: string) => persist({ ...state, activeWorkspaceId: taskId });
  const handleRenameTask = (name: string) => persist(renameTask(state, task.id, name));
  const handleMeta = (patch: Parameters<typeof updateTaskMeta>[2]) => persist(updateTaskMeta(state, task.id, patch));
  const handleCreateSection = (name?: string) => persist(createSection(state, task.id, locale, name));
  const handleRenameSection = (sectionId: string, name: string) => persist(renameSection(state, task.id, sectionId, name));
  const handleDeleteSection = (sectionId: string) => persist(deleteSection(state, task.id, sectionId));
  const handleMovePages = (pageIds: string[], sectionId: string | null) => persist(movePagesToSection(state, task.id, pageIds, sectionId));
  const handlePageStatus = (pageId: string, status: PageStatus, excludedReason?: string) => persist(setPageStatus(state, task.id, pageId, status, excludedReason));
  const handlePageNote = (pageId: string, note: string) => persist(setPageNote(state, task.id, pageId, note));
  const handleLocale = (next: Locale) => {
    const updated = { ...settings, locale: next };
    setSettings(updated);
    void saveSettings(updated);
  };

  // ── 日常底座动作 ──
  // 注意：这里必须是普通函数（早退 return 之后不允许再出现 hook 调用）
  const handleCollect = async (openTabs: OpenTab[], closeAfter: boolean): Promise<boolean> => {
    const workspace = state.workspaces[task.id];
    const collected = collectTabs(workspace, openTabs, null);
    persist(updateWorkspace(state, collected.workspace));
    if (closeAfter && typeof chrome !== "undefined" && chrome.tabs?.remove) {
      const closeable = openTabs.filter((tab) => !tab.pinned).map((tab) => tab.id);
      if (closeable.length) await chrome.tabs.remove(closeable);
    }
    return true;
  };

  const handleRestoreRecent = (item: RecentClosedTab) => {
    if (typeof chrome !== "undefined" && chrome.tabs?.create) void chrome.tabs.create({ url: item.url });
    const next = recentlyClosed.filter((candidate) => candidate.id !== item.id);
    setRecentlyClosed(next);
    void saveRecentlyClosed(next);
  };
  const handleDismissRecent = (id: string) => {
    const next = recentlyClosed.filter((candidate) => candidate.id !== id);
    setRecentlyClosed(next);
    void saveRecentlyClosed(next);
  };

  const handleRestorePage = (url?: string) => {
    if (!url) return;
    if (typeof chrome !== "undefined" && chrome.tabs?.create) void chrome.tabs.create({ url });
    else window.open(url, "_blank", "noopener");
  };
  const handleCreateTask = () => {
    const name = window.prompt(message(locale, "v2FirstQuestion"));
    if (name === null) return;
    persist(createTask(state, locale, name));
  };

  const handleDeletePage = (pageId: string, title: string) => {
    if (!window.confirm(`删除「${title}」？此操作不可撤销。`)) return;
    persist(deletePage(state, task.id, pageId));
  };

  // ── AI 一键整理（任务链"整"）──
  const handleApplyOrganize = (proposal: Parameters<typeof applyGroupingProposal>[1]) => {
    setUndoTask(task);
    const nextWorkspace = applyGroupingProposal(taskToWorkspaceView(task), proposal);
    persist(updateWorkspace(state, nextWorkspace));
    setOrganizeOpen(false);
  };
  const handleUndoOrganize = () => {
    if (!undoTask) return;
    persist(updateWorkspace(state, taskToWorkspaceView(undoTask)));
    setUndoTask(null);
  };

  // ── AI 总结（任务链"结"）──
  const handleApplySummary = (patch: { summary: string; conclusion: string; nextStep: string }) => {
    persist(updateTaskMeta(state, task.id, patch));
  };

  return (
    <div className="tn-shell">
      <aside className="tn-sidebar">
        <div className="tn-brand">TabNexus</div>
        <nav className="tn-task-list">
          {tasks.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              className={`tn-task-item ${candidate.id === task.id ? "active" : ""}`}
              onClick={() => switchTask(candidate.id)}
            >
              <span className="tn-task-name">{candidate.name}</span>
              <small>{Object.keys(candidate.pages).length}</small>
            </button>
          ))}
        </nav>
        <button type="button" className="tn-sidebar-add" onClick={handleCreateTask}>
          ＋ {message(locale, "v2NewTask")}
        </button>
        <div className="tn-sidebar-footer">
          <button type="button" className="tn-locale" onClick={() => handleLocale(locale === "zh" ? "en" : "zh")}>
            {locale === "zh" ? "中文" : "EN"}
          </button>
          <button type="button" className="tn-settings" onClick={() => window.open(chrome?.runtime?.getURL?.("options.html"), "_blank")}>
            ⚙ {message(locale, "settings")}
          </button>
        </div>
      </aside>

      <main className="tn-main">
        <div className="tn-viewbar">
          <div className="tn-view-tabs" role="group" aria-label="view">
            <button type="button" className={view === "doc" ? "active" : ""} onClick={() => setView("doc")}>{message(locale, "v2Document")}</button>
            <button type="button" className={view === "canvas" ? "active" : ""} onClick={() => setView("canvas")}>{message(locale, "v2Canvas")}</button>
            <button type="button" onClick={() => setInboxOpen((value) => !value)} aria-pressed={inboxOpen}>
              {message(locale, "v2Inbox")} {recentlyClosed.length > 0 ? "●" : ""}
            </button>
          </div>
          <div className="tn-viewbar-right">
            {undoTask && (
              <button type="button" className="tn-secondary" onClick={handleUndoOrganize}>↶ {message(locale, "v2Undo")}</button>
            )}
            <button type="button" className="tn-secondary" onClick={() => setOrganizeOpen(true)}>✦ {message(locale, "v2AiOneClickOrganize")}</button>
            <button type="button" className="tn-secondary" onClick={() => setExportOpen(true)}>⇧ {message(locale, "export")}</button>
            <button type="button" className="tn-kbutton" onClick={() => setPaletteOpen(true)} title="⌘K">⌘K</button>
            <button
              type="button"
              className="tn-primary"
              disabled={Object.keys(task.pages).length === 0}
              title={Object.keys(task.pages).length === 0 ? "先收进一些页面" : undefined}
              onClick={() => setHandoffOpen(true)}
            >{message(locale, "v2LetAgentContinue")}</button>
          </div>
        </div>

        {view === "canvas" ? (
          <RelationView
            task={task}
            locale={locale}
            onClose={() => setView("doc")}
          />
        ) : (
        <>
        <TaskHeader
          task={task}
          locale={locale}
          onRename={handleRenameTask}
          onMeta={handleMeta}
        />

        {isFirstRun ? (
          <FirstRun locale={locale} onCreate={(name) => persist(renameTask(state, task.id, name))} />
        ) : (
          <>
            <SectionList
              task={task}
              locale={locale}
              onCreateSection={handleCreateSection}
              onRenameSection={handleRenameSection}
              onDeleteSection={handleDeleteSection}
              onMovePages={handleMovePages}
              onPageStatus={handlePageStatus}
              onPageNote={handlePageNote}
              onRestorePage={handleRestorePage}
              onDeletePage={handleDeletePage}
            />
            <ConclusionBlock task={task} locale={locale} settings={settings} onApplySummary={handleApplySummary} />
          </>
        )}
        </>
        )}
      </main>

      {organizeOpen && (
        <OrganizeModal
          task={task}
          locale={locale}
          settings={settings}
          onApply={handleApplyOrganize}
          onClose={() => setOrganizeOpen(false)}
        />
      )}

      {exportOpen && <ExportModal task={task} locale={locale} onClose={() => setExportOpen(false)} />}

      {handoffOpen && <HandoffModal task={task} locale={locale} onClose={() => setHandoffOpen(false)} />}

      {inboxOpen && (
        <InboxDrawer
          task={task}
          locale={locale}
          recentlyClosed={recentlyClosed}
          onClose={() => setInboxOpen(false)}
          onCollect={handleCollect}
          onRestoreRecent={handleRestoreRecent}
          onDismissRecent={handleDismissRecent}
        />
      )}

      {paletteOpen && (
        <CommandPalette
          tasks={tasks}
          activeTaskId={task.id}
          locale={locale}
          onSwitchTask={switchTask}
          onCreateSection={() => handleCreateSection()}
          onClose={() => setPaletteOpen(false)}
        />
      )}
    </div>
  );
}
