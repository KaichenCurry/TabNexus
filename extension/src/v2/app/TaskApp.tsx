import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { applyGroupingProposal } from "../../core/grouping";
import { normalizeUrl } from "../../core/url";
import { collectTabs, updateWorkspace } from "../../core/workspace";
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
import { AppSidebar } from "./AppSidebar";
import { CommandPalette } from "./CommandPalette";
import { ConclusionBlock } from "./ConclusionBlock";
import { ExportModal } from "./ExportModal";
import { FirstRun } from "./FirstRun";
import { HandoffModal } from "./HandoffModal";
import { Icon } from "./Icon";
import { InboxDrawer } from "./InboxDrawer";
import { OrganizeModal } from "./OrganizeModal";
import { RelationView } from "./RelationView";
import { SectionList } from "./SectionList";
import { TaskHeader } from "./TaskHeader";
import { TaskToolbar } from "./TaskToolbar";
import "../app.css";

const DEFAULT_TASK_NAMES = new Set(["我的工作区", "My workspace", "未命名工作区", "Untitled workspace"]);

export function TaskApp() {
  const [state, setState] = useState<AppState | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [recentlyClosed, setRecentlyClosed] = useState<RecentClosedTab[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const forceInboxOpen = useMemo(() => new URLSearchParams(window.location.search).has("inbox"), []);
  const [inboxOpen, setInboxOpen] = useState(forceInboxOpen);
  const [collectTargetSectionId, setCollectTargetSectionId] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [organizeOpen, setOrganizeOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [view, setView] = useState<"doc" | "relation">("doc");
  const [undoTask, setUndoTask] = useState<Task | null>(null);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("dsh") !== "connect" || typeof chrome === "undefined" || !chrome.runtime?.reload) return;

    // The DSH installer may replace an unpacked build while Chrome still runs
    // its previous service worker. Remove the marker before restarting so this
    // recovery path is always one-shot and can never enter a reload loop.
    window.history.replaceState(null, "", chrome.runtime.getURL("workspace.html"));
    const timer = window.setTimeout(() => chrome.runtime.reload(), 80);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let disposed = false;
    void Promise.all([loadAppState(), loadSettings(), loadRecentlyClosed()]).then(([nextState, nextSettings, nextRecent]) => {
      if (disposed) return;
      setState(nextState);
      setSettings(nextSettings);
      setRecentlyClosed(nextRecent);
    });
    const offState = subscribeToAppState(() => void loadAppState().then(setState));
    const offSettings = subscribeToSettings(() => void loadSettings().then(setSettings));
    return () => { disposed = true; offState(); offSettings(); };
  }, []);

  useEffect(() => {
    if (!settings) return;
    setInboxOpen(forceInboxOpen || !settings.rightRailCollapsed);
  }, [forceInboxOpen, settings?.rightRailCollapsed]);

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

  /** 串行写入，避免快速编辑时较早的 save 完成回调覆盖最后一次修改。 */
  const persist = useCallback((next: AppState): Promise<boolean> => {
    setState(next);
    setSaveError(null);
    const operation = saveQueue.current.then(() => saveAppState(next));
    saveQueue.current = operation.catch(() => undefined);
    return operation.then(() => true).catch(() => {
      setSaveError("本地保存失败，请保留此页面并重试");
      return false;
    });
  }, []);

  const locale: Locale = settings?.locale ?? "zh";
  const task = useMemo(() => (state ? activeTask(state) : null), [state]);
  const tasks = useMemo(() => (state ? listTasks(state) : []), [state]);

  if (!state || !settings || !task) return null;

  const isFirstRun = Object.keys(task.pages).length === 0 && !task.goal && DEFAULT_TASK_NAMES.has(task.name);
  const pageCount = Object.keys(task.pages).length;
  const collectTargetSection = collectTargetSectionId ? task.sections.find((section) => section.id === collectTargetSectionId) : undefined;
  const switchTask = (taskId: string) => { setUndoTask(null); setCollectTargetSectionId(null); void persist({ ...state, activeWorkspaceId: taskId }); };
  const handleRenameTask = (name: string) => void persist(renameTask(state, task.id, name));
  const handleMeta = (patch: Parameters<typeof updateTaskMeta>[2]) => void persist(updateTaskMeta(state, task.id, patch));
  const handleCreateSection = (name?: string) => void persist(createSection(state, task.id, locale, name));
  const handleMovePages = (pageIds: string[], sectionId: string | null) => void persist(movePagesToSection(state, task.id, pageIds, sectionId));
  const handlePageStatus = (pageId: string, status: PageStatus, reason?: string) => void persist(setPageStatus(state, task.id, pageId, status, reason));
  const handlePageNote = (pageId: string, note: string) => void persist(setPageNote(state, task.id, pageId, note));
  const setRailOpen = (open: boolean) => {
    setInboxOpen(open);
    const nextSettings = { ...settings, rightRailCollapsed: !open };
    setSettings(nextSettings);
    void saveSettings(nextSettings);
  };

  const openSettings = () => {
    const url = typeof chrome !== "undefined" && chrome.runtime?.getURL ? chrome.runtime.getURL("options.html") : "options.html";
    window.open(url, "_blank", "noopener");
  };
  const openPage = (url?: string) => {
    if (!url) return;
    if (typeof chrome !== "undefined" && chrome.tabs?.create) void chrome.tabs.create({ url });
    else window.open(url, "_blank", "noopener");
  };
  const openSection = async (urls: string[]) => {
    const uniqueUrls = [...new Map(urls.map((url) => [normalizeUrl(url), url])).values()];
    if (uniqueUrls.length === 0) return;
    if (typeof chrome !== "undefined" && chrome.tabs?.create) {
      const currentTabs = chrome.tabs.query ? await chrome.tabs.query({}) : [];
      const openUrls = new Set(currentTabs.flatMap((tab) => tab.url ? [normalizeUrl(tab.url)] : []));
      for (const url of uniqueUrls) {
        if (!openUrls.has(normalizeUrl(url))) await chrome.tabs.create({ url, active: false });
      }
      return;
    }
    uniqueUrls.forEach((url) => window.open(url, "_blank", "noopener"));
  };

  const handleCollect = async (openTabs: OpenTab[], closeAfter: boolean): Promise<"saved" | "cancelled" | "failed"> => {
    const workspace = state.workspaces[task.id];
    if (!workspace) return "failed";
    const closeable = openTabs.filter((tab) => !tab.pinned).map((tab) => tab.id);
    if (closeAfter && closeable.length > 0) {
      const confirmed = window.confirm(locale === "zh"
        ? `将先保存 ${openTabs.length} 个页面，再关闭其中 ${closeable.length} 个普通标签。固定标签不会关闭。`
        : `Save ${openTabs.length} pages, then close ${closeable.length} regular tabs. Pinned tabs stay open.`);
      if (!confirmed) return "cancelled";
    }
    const targetSectionId = collectTargetSectionId && task.sections.some((section) => section.id === collectTargetSectionId)
      ? collectTargetSectionId
      : null;
    const collected = collectTabs(workspace, openTabs, targetSectionId);
    const saved = await persist(updateWorkspace(state, collected.workspace));
    if (!saved) return "failed";
    if (closeAfter && closeable.length > 0 && typeof chrome !== "undefined" && chrome.tabs?.remove) {
      await chrome.tabs.remove(closeable);
    }
    return "saved";
  };

  const handleRestoreRecent = (item: RecentClosedTab) => {
    openPage(item.url);
    const next = recentlyClosed.filter((candidate) => candidate.id !== item.id);
    setRecentlyClosed(next);
    void saveRecentlyClosed(next);
  };
  const handleDismissRecent = (id: string) => {
    if (!window.confirm(locale === "zh" ? "从最近关闭记录中移除这一项？" : "Remove this item from recently closed?")) return;
    const next = recentlyClosed.filter((candidate) => candidate.id !== id);
    setRecentlyClosed(next);
    void saveRecentlyClosed(next);
  };
  const handleDeleteSection = (sectionId: string) => {
    const section = task.sections.find((candidate) => candidate.id === sectionId);
    if (!section || !window.confirm(locale === "zh" ? `删除章节「${section.name}」？页面会保留为未归类。` : `Delete “${section.name}”? Its pages will remain unassigned.`)) return;
    void persist(deleteSection(state, task.id, sectionId));
  };
  const handleDeletePage = (pageId: string, title: string) => {
    if (!window.confirm(locale === "zh" ? `从任务中移除「${title}」？浏览器标签不会关闭。` : `Remove “${title}” from this task? Its browser tab will stay open.`)) return;
    void persist(deletePage(state, task.id, pageId));
  };
  const handleApplyOrganize = (proposal: Parameters<typeof applyGroupingProposal>[1]) => {
    setUndoTask(task);
    void persist(updateWorkspace(state, applyGroupingProposal(taskToWorkspaceView(task), proposal)));
    setOrganizeOpen(false);
  };
  const handleUndoOrganize = () => {
    if (!undoTask) return;
    void persist(updateWorkspace(state, taskToWorkspaceView(undoTask)));
    setUndoTask(null);
  };

  return (
    <div className="tn-shell">
      <AppSidebar tasks={tasks} activeTaskId={task.id} locale={locale} onSwitchTask={switchTask} onCreateTask={() => void persist(createTask(state, locale))} onOpenSearch={() => setPaletteOpen(true)} />
      <main className="tn-main">
        <TaskToolbar
          locale={locale} taskName={task.name} pageCount={pageCount} view={view}
          canHandoff={pageCount > 0} canOrganize={pageCount > 0} canUndo={Boolean(undoTask)}
          railOpen={inboxOpen}
          onView={setView} onCollect={() => { setCollectTargetSectionId(null); setRailOpen(true); }} onOrganize={() => setOrganizeOpen(true)}
          onHandoff={() => setHandoffOpen(true)} onUndo={handleUndoOrganize} onExport={() => setExportOpen(true)}
          onOpenSearch={() => setPaletteOpen(true)} onOpenSettings={openSettings} onToggleRail={() => setRailOpen(!inboxOpen)}
        />
        {saveError && <div className="tn-save-error" role="alert">{saveError}</div>}
        <div className="tn-content">
          {view === "relation" ? <RelationView task={task} locale={locale} /> : (
            <>
              {isFirstRun ? (
                <FirstRun locale={locale} onCreate={(name) => { void persist(renameTask(state, task.id, name)); setCollectTargetSectionId(null); setRailOpen(true); }} />
              ) : (
                <>
                  <TaskHeader task={task} locale={locale} onRename={handleRenameTask} onMeta={handleMeta} />
                  <SectionList
                    task={task} locale={locale} onCreateSection={handleCreateSection}
                    onRenameSection={(sectionId, name) => void persist(renameSection(state, task.id, sectionId, name))}
                    onDeleteSection={handleDeleteSection} onMovePages={handleMovePages}
                    onPageStatus={handlePageStatus} onPageNote={handlePageNote} onRestorePage={openPage}
                    onRestoreSection={(urls) => void openSection(urls)}
                    onCollectToSection={(sectionId) => { setCollectTargetSectionId(sectionId); setRailOpen(true); }}
                    onDeletePage={handleDeletePage}
                  />
                  <ConclusionBlock task={task} locale={locale} settings={settings} onApplySummary={(patch) => void persist(updateTaskMeta(state, task.id, patch))} />
                </>
              )}
            </>
          )}
        </div>
      </main>

      {!inboxOpen && (
        <aside className="tn-inbox-collapsed">
          <button type="button" onClick={() => setRailOpen(true)} aria-label={locale === "zh" ? "展开标签操作台" : "Expand tab workbench"} title={locale === "zh" ? "展开标签操作台" : "Expand tab workbench"}>
            <Icon name="collect" />
            <span>{locale === "zh" ? "标签" : "Tabs"}</span>
          </button>
        </aside>
      )}
      {inboxOpen && (
        <InboxDrawer
          task={task} locale={locale} recentlyClosed={recentlyClosed} targetSectionName={collectTargetSection?.name}
          onClose={() => { setCollectTargetSectionId(null); setRailOpen(false); }} onCollect={handleCollect}
          onRestoreRecent={handleRestoreRecent} onDismissRecent={handleDismissRecent}
        />
      )}

      {organizeOpen && <OrganizeModal task={task} locale={locale} settings={settings} onApply={handleApplyOrganize} onClose={() => setOrganizeOpen(false)} />}
      {exportOpen && <ExportModal task={task} locale={locale} onClose={() => setExportOpen(false)} />}
      {handoffOpen && <HandoffModal task={task} locale={locale} onClose={() => setHandoffOpen(false)} />}
      {paletteOpen && (
        <CommandPalette
          tasks={tasks} activeTaskId={task.id} locale={locale} onSwitchTask={switchTask}
          onOpenPage={(taskId, url) => { if (taskId !== task.id) switchTask(taskId); openPage(url); }}
          onOpenInbox={() => { setCollectTargetSectionId(null); setRailOpen(true); }} onOrganize={() => pageCount > 0 && setOrganizeOpen(true)}
          onCreateSection={() => handleCreateSection()} onClose={() => setPaletteOpen(false)}
        />
      )}
    </div>
  );
}
