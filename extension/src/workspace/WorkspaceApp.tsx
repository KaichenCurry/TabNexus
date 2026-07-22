import { useEffect, useMemo, useRef, useState } from "react";
import { Logo } from "../components/Logo";
import { createAgentCommandRequest, validateAgentPlan } from "../core/agent";
import { activeAiConfig } from "../core/aiProviders";
import { createGroupingRequest } from "../core/ai";
import { defaultGroupName, untitledWorkspaceName } from "../core/defaults";
import { applyGroupingProposal, createDomainProposal, validateGroupingProposal } from "../core/grouping";
import {
  clearAgentActivity,
  clearUndoSnapshot,
  loadAgentActivity,
  loadAppState,
  loadRecentlyClosed,
  loadSettings,
  loadTabWorkbenchState,
  loadUndoSnapshot,
  saveAppState,
  saveRecentlyClosed,
  saveSettings,
  saveTabWorkbenchSelection,
  saveUndoSnapshot,
  subscribeToAgentActivity,
  subscribeToAppState,
  subscribeToRecentlyClosed,
  subscribeToSettings,
  subscribeToTabWorkbench
} from "../core/storage";
import {
  closeTabIds,
  focusOrOpenUrl,
  openOptions,
  queryCurrentWindowTabs,
  restoreUrls,
  sendBackgroundRequest,
  subscribeToTabChanges
} from "../core/platform";
import { normalizeUrl } from "../core/url";
import {
  applyStructureProposal,
  createLocalStructureProposal,
  createStructureRequest,
  validateStructureProposal
} from "../core/structure";
import {
  addManualCard,
  addWorkspace,
  collectTabs,
  createGroup,
  deleteCard,
  deleteGroup,
  moveCard,
  removeEdge,
  removeWorkspace,
  renameWorkspace,
  updateCardFlows,
  updateCardNote,
  updateCardStatus,
  updateGroup,
  updateWorkspace,
  upsertEdge
} from "../core/workspace";
import type {
  AgentActivity,
  AgentPlan,
  AppState,
  Card,
  CardStatus,
  CardType,
  DeepSeekErrorCode,
  GroupingProposal,
  OpenTab,
  RecentClosedTab,
  Settings,
  StructureProposal,
  TabWorkbenchState,
  UndoSnapshot,
  Workspace
} from "../core/types";
import { message } from "../i18n";
import { GroupPanel } from "./GroupPanel";
import { FlowCanvas } from "./FlowCanvas";
import { OpenTabsRail, type SelectionPayload } from "./OpenTabsRail";
import {
  AgentActivityModal,
  AgentPlanModal,
  ConfirmModal,
  ExportModal,
  ManualCardModal,
  NameModal,
  NoteModal,
  ProposalModal,
  RelationModal,
  StructureProposalModal
} from "./WorkspaceModals";
import type { DragPayload } from "./drag";

type ModalState =
  | { type: "note"; cardId: string }
  | { type: "export" }
  | { type: "proposal"; proposal: GroupingProposal; baseWorkspace?: Workspace; baseState?: AppState }
  | { type: "agent-plan"; plan: AgentPlan; tabs: OpenTab[] }
  | { type: "agent-activity" }
  | { type: "structure-proposal"; proposal: StructureProposal }
  | { type: "manual-card"; groupId?: string }
  | { type: "relation"; fromCardId: string; toCardId: string }
  | { type: "name"; action: "create-workspace" | "create-group" | "rename-group"; initialValue: string; groupId?: string }
  | { type: "confirm"; action: "close-tabs"; tabs: OpenTab[]; closeCount: number; saveCount: number }
  | { type: "confirm"; action: "delete-workspace"; workspaceId: string }
  | { type: "confirm"; action: "delete-group"; groupId: string }
  | { type: "confirm"; action: "delete-card"; cardId: string; cardTitle: string }
  | null;

export function WorkspaceApp() {
  const [appState, setAppState] = useState<AppState | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([]);
  const [recentlyClosed, setRecentlyClosed] = useState<RecentClosedTab[]>([]);
  const [agentActivity, setAgentActivity] = useState<AgentActivity[]>([]);
  const [undo, setUndo] = useState<UndoSnapshot | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiScope, setAiScope] = useState<"workspace" | "window">("workspace");
  const [railSelection, setRailSelection] = useState<SelectionPayload>({ tabs: [], cards: [] });
  const [tabWorkbenchState, setTabWorkbenchState] = useState<TabWorkbenchState>({ schemaVersion: 1, selections: {} });
  const [cardFilters, setCardFilters] = useState<{
    status: "all" | CardStatus;
    type: "all" | CardType;
    groupId: "all" | string;
  }>({ status: "all", type: "all", groupId: "all" });
  const [aiLoading, setAiLoading] = useState(false);
  const toastTimer = useRef<number | undefined>(undefined);
  const previousTabs = useRef<OpenTab[] | null>(null);

  const locale = settings?.locale ?? "zh";
  const t = (key: Parameters<typeof message>[1], vars?: Record<string, string | number>) =>
    message(locale, key, vars);
  const selectedAi = settings ? activeAiConfig(settings) : null;
  const deepSeekReady = Boolean(settings?.aiEnabled && selectedAi?.apiKey.trim());
  const deepSeekFailureReason = (code: DeepSeekErrorCode | undefined) => {
    const keys: Record<DeepSeekErrorCode, Parameters<typeof message>[1]> = {
      timeout: "deepSeekTimeout",
      network: "deepSeekNetwork",
      auth: "deepSeekAuth",
      balance: "deepSeekBalance",
      rate_limit: "deepSeekRateLimit",
      server: "deepSeekServer",
      model: "deepSeekModel",
      invalid_request: "deepSeekInvalidRequest",
      invalid_response: "deepSeekInvalidResponse",
      conflict: "deepSeekInvalidRequest",
      unknown: "deepSeekUnknown"
    };
    return t(keys[code ?? "unknown"]);
  };

  const showToast = (value: string) => {
    window.clearTimeout(toastTimer.current);
    setToast(value);
    toastTimer.current = window.setTimeout(() => setToast(null), 3_200);
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const loadedSettings = await loadSettings();
      const [loadedState, loadedUndo, loadedRecentlyClosed, loadedAgentActivity, loadedTabWorkbench] = await Promise.all([
        loadAppState(loadedSettings.locale),
        loadUndoSnapshot(),
        loadRecentlyClosed(),
        loadAgentActivity(),
        loadTabWorkbenchState()
      ]);
      if (cancelled) return;
      setSettings(loadedSettings);
      setAppState(loadedState);
      setUndo(loadedUndo && loadedState.workspaces[loadedUndo.workspaceId] ? loadedUndo : null);
      setRecentlyClosed(loadedRecentlyClosed);
      setAgentActivity(loadedAgentActivity);
      setTabWorkbenchState(loadedTabWorkbench);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const unsubscribeState = subscribeToAppState(() => {
      void loadAppState().then(setAppState);
    });
    const unsubscribeActivity = subscribeToAgentActivity(() => {
      void loadAgentActivity().then(setAgentActivity);
    });
    const unsubscribeSettings = subscribeToSettings(() => {
      void loadSettings().then(setSettings);
    });
    const unsubscribeRecentlyClosed = subscribeToRecentlyClosed(() => {
      void loadRecentlyClosed().then(setRecentlyClosed);
    });
    const unsubscribeTabWorkbench = subscribeToTabWorkbench(() => {
      void loadTabWorkbenchState().then(setTabWorkbenchState);
    });
    return () => {
      unsubscribeState();
      unsubscribeActivity();
      unsubscribeSettings();
      unsubscribeRecentlyClosed();
      unsubscribeTabWorkbench();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let refreshTimer: number | undefined;
    const refresh = () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        void queryCurrentWindowTabs().then((tabs) => {
          if (cancelled) return;
          const previous = previousTabs.current;
          if (previous) {
            const currentIds = new Set(tabs.map((tab) => tab.id));
            const removed = previous.filter((tab) => tab.supported && !currentIds.has(tab.id));
            if (removed.length) {
              setRecentlyClosed((current) => {
                const next = [...removed.map((tab, index) => ({
                  id: `recent_${tab.id}_${Date.now()}_${index}`,
                  title: tab.title,
                  url: tab.url,
                  favicon: tab.favicon,
                  closedAt: new Date().toISOString()
                })), ...current]
                  .filter((item, index, all) => all.findIndex((candidate) => normalizeUrl(candidate.url) === normalizeUrl(item.url)) === index)
                  .slice(0, 30);
                void saveRecentlyClosed(next);
                return next;
              });
            }
          }
          previousTabs.current = tabs;
          setOpenTabs(tabs);
        });
      }, 40);
    };
    refresh();
    const unsubscribe = subscribeToTabChanges(refresh);
    return () => {
      cancelled = true;
      window.clearTimeout(refreshTimer);
      unsubscribe();
    };
  }, []);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const workspace = appState ? appState.workspaces[appState.activeWorkspaceId] : undefined;
  useEffect(() => {
    if (cardFilters.groupId === "all" || workspace?.groups[cardFilters.groupId]) return;
    setCardFilters((current) => ({ ...current, groupId: "all" }));
  }, [cardFilters.groupId, workspace?.id, workspace?.groups]);
  const knownUrls = useMemo(
    () => new Set(Object.values(workspace?.cards ?? {}).flatMap((card) => card.url ? [normalizeUrl(card.url)] : [])),
    [workspace]
  );
  const openUrlSet = useMemo(
    () => new Set(openTabs.filter((tab) => tab.supported).map((tab) => normalizeUrl(tab.url))),
    [openTabs]
  );
  const aiSelectionCount = useMemo(() => new Set([
    ...railSelection.tabs.map((tab) => `url:${normalizeUrl(tab.url)}`),
    ...railSelection.cards.map((card) => card.url ? `url:${normalizeUrl(card.url)}` : `card:${card.id}`)
  ]).size, [railSelection]);

  const persistState = async (next: AppState) => {
    setAppState(next);
    await saveAppState(next);
  };

  const invalidateUndo = async () => {
    if (!undo) return;
    setUndo(null);
    await clearUndoSnapshot();
  };

  const commitWorkspace = async (nextWorkspace: Workspace, manual = true) => {
    if (!appState) return;
    if (manual) await invalidateUndo();
    await persistState(updateWorkspace(appState, nextWorkspace));
  };

  const changeSettings = async (patch: Partial<Settings>) => {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    await saveSettings(next);
  };

  const changeTabWorkbenchSelection = async (selection: { tabIds: number[]; cardIds: string[] }) => {
    if (!workspace) return;
    const updatedAt = new Date().toISOString();
    setTabWorkbenchState((current) => ({
      schemaVersion: 1,
      selections: { ...current.selections, [workspace.id]: { ...selection, updatedAt } }
    }));
    const next = await saveTabWorkbenchSelection(workspace.id, selection);
    setTabWorkbenchState(next);
  };

  const handleCollect = async (tabs: OpenTab[], targetGroupId: string | null = null) => {
    if (!workspace || !appState) return;
    await invalidateUndo();
    const result = collectTabs(workspace, tabs, targetGroupId);
    const nextState = updateWorkspace(appState, result.workspace);
    await persistState(nextState);
    if (result.addedTabIds.length === 0) {
      showToast(t("alreadySaved"));
    } else {
      showToast(t("savedKeepOpen", { added: result.addedTabIds.length }));
    }
  };

  const handleDrop = async (payload: DragPayload | null, targetGroupId: string | null) => {
    if (!payload || !workspace) return;
    if (payload.kind === "card") {
      await commitWorkspace(moveCard(workspace, payload.cardId, targetGroupId));
      return;
    }
    const tab = openTabs.find((candidate) => candidate.id === payload.tabId);
    if (!tab) return;
    if (knownUrls.has(normalizeUrl(tab.url))) {
      showToast(t("alreadySaved"));
      return;
    }
    await handleCollect([tab], targetGroupId);
  };

  const handleRestore = async (cards: Card[]) => {
    const urls = cards.flatMap((card) => card.url ? [card.url] : []);
    const result = await restoreUrls(urls);
    const refreshedTabs = await queryCurrentWindowTabs();
    previousTabs.current = refreshedTabs;
    setOpenTabs(refreshedTabs);
    showToast(t("restoreDone", {
      restored: result.restored,
      existing: result.existing,
      failed: result.failed
    }));
    if (result.fileAccessRequired) window.setTimeout(() => showToast(t("fileAccessRequired")), 200);
  };

  const dismissRecentlyClosed = async (item: RecentClosedTab) => {
    const next = recentlyClosed.filter((candidate) => candidate.id !== item.id);
    setRecentlyClosed(next);
    await saveRecentlyClosed(next);
  };

  const reopenRecentlyClosed = async (item: RecentClosedTab) => {
    try {
      await focusOrOpenUrl(item.url);
      await dismissRecentlyClosed(item);
      showToast(t("recentlyReopened"));
    } catch {
      showToast(t("fileAccessRequired"));
    }
  };

  const changeCardStatus = async (cardId: string, status: CardStatus) => {
    if (!workspace) return;
    await commitWorkspace(updateCardStatus(workspace, cardId, status));
  };

  const applySuggestedStructure = async (proposal: StructureProposal) => {
    if (!workspace || !appState) return;
    const snapshot: UndoSnapshot = {
      workspaceId: workspace.id,
      workspace: structuredClone(workspace),
      createdAt: new Date().toISOString(),
      kind: "structure"
    };
    await saveUndoSnapshot(snapshot);
    setUndo(snapshot);
    await persistState(updateWorkspace(appState, applyStructureProposal(workspace, proposal)));
    setModal(null);
    showToast(t("structureApplied"));
  };

  const runStructureSuggestion = async () => {
    if (!workspace || !settings || aiLoading) return;
    if (Object.keys(workspace.cards).length < 2) {
      showToast(t("structureNeedsCards"));
      return;
    }
    setAiLoading(true);
    let failureCode: DeepSeekErrorCode | undefined;
    try {
      let proposal: StructureProposal;
      if (!deepSeekReady) {
        proposal = createLocalStructureProposal(workspace, locale);
      } else {
        const response = await sendBackgroundRequest<unknown>({
          type: "SUGGEST_STRUCTURE",
          provider: selectedAi!.provider,
          apiKey: selectedAi!.apiKey.trim(),
          model: selectedAi!.model,
          payload: createStructureRequest(workspace, locale)
        });
        if (!response.ok) {
          failureCode = response.code;
          throw new Error(response.error);
        }
        try {
          proposal = validateStructureProposal(response.data, workspace);
        } catch (error) {
          failureCode = "invalid_response";
          throw error;
        }
      }
      if (!proposal.edges.length) {
        showToast(t("noStructureEdges"));
        return;
      }
      setModal({ type: "structure-proposal", proposal });
    } catch {
      const proposal = createLocalStructureProposal(workspace, locale);
      if (proposal.edges.length) {
        setModal({ type: "structure-proposal", proposal });
        showToast(t("structureFallbackUsed", { reason: deepSeekFailureReason(failureCode) }));
      }
      else showToast(t("noStructureEdges"));
    } finally {
      setAiLoading(false);
    }
  };

  const applyProposal = async (
    proposal: GroupingProposal,
    baseWorkspace: Workspace | undefined = workspace,
    baseState: AppState | null = appState
  ) => {
    if (!baseState || !baseWorkspace) return;
    const snapshot: UndoSnapshot = {
      workspaceId: baseWorkspace.id,
      workspace: structuredClone(baseWorkspace),
      createdAt: new Date().toISOString(),
      kind: "grouping"
    };
    await saveUndoSnapshot(snapshot);
    setUndo(snapshot);
    const nextWorkspace = applyGroupingProposal(baseWorkspace, proposal);
    await persistState(updateWorkspace(baseState, nextWorkspace));
    setModal(null);
    showToast(t(proposal.source === "ai" ? "aiApplied" : "localGroupingApplied"));
  };

  const runGrouping = async (
    cardIds: string[],
    baseWorkspace: Workspace | undefined = workspace,
    baseState: AppState | null = appState,
    instruction?: string
  ) => {
    if (!baseWorkspace || !baseState || !settings || aiLoading) return false;
    if (!cardIds.length) {
      showToast(t("nothingToTidy"));
      return false;
    }
    if (instruction && !deepSeekReady) {
      showToast(t("aiInstructionNeedsDeepSeek"));
      return false;
    }
    setAiLoading(true);
    let failureCode: DeepSeekErrorCode | undefined;
    try {
      if (!instruction && (!deepSeekReady || settings.groupingPolicy === "domain")) {
        const fallback = createDomainProposal(baseWorkspace, locale, cardIds);
        await applyProposal(fallback, baseWorkspace, baseState);
        return true;
      }
      const response = await sendBackgroundRequest<unknown>({
        type: "CLUSTER_TABS",
        provider: selectedAi!.provider,
        apiKey: selectedAi!.apiKey.trim(),
        model: selectedAi!.model,
        payload: createGroupingRequest(baseWorkspace, locale, cardIds, instruction)
      });
      if (!response.ok) {
        failureCode = response.code;
        throw new Error(response.error);
      }
      let proposal: GroupingProposal;
      try {
        proposal = {
          ...validateGroupingProposal(response.data, baseWorkspace, cardIds),
          instruction: instruction?.trim() || undefined,
          pruneEmptyGroups: Boolean(instruction?.trim())
        };
      } catch (error) {
        failureCode = "invalid_response";
        throw error;
      }
      if (!instruction && settings.groupingPolicy === "automatic") await applyProposal(proposal, baseWorkspace, baseState);
      else setModal({ type: "proposal", proposal, baseWorkspace, baseState });
      return true;
    } catch {
      if (instruction) {
        showToast(t("aiInstructionFailed", { reason: deepSeekFailureReason(failureCode) }));
        return false;
      }
      await applyProposal(createDomainProposal(baseWorkspace, locale, cardIds), baseWorkspace, baseState);
      showToast(t("fallbackUsed", { reason: deepSeekFailureReason(failureCode) }));
      return true;
    } finally {
      setAiLoading(false);
    }
  };

  const handleUndo = async () => {
    if (!undo || !appState || !appState.workspaces[undo.workspaceId]) return;
    await persistState(updateWorkspace(appState, undo.workspace));
    setUndo(null);
    await clearUndoSnapshot();
    showToast(t(undo.kind === "structure" ? "undoStructureDone" : undo.kind === "agent" ? "undoAgentDone" : "undoDone"));
  };

  const organizeSelected = async ({ tabs, cards }: { tabs: OpenTab[]; cards: Card[] }) => {
    if (!workspace || !appState) return;
    await invalidateUndo();
    const collected = collectTabs(workspace, tabs, null);
    const baseWorkspace = collected.workspace;
    const baseState = updateWorkspace(appState, baseWorkspace);
    if (collected.addedTabIds.length) await persistState(baseState);
    const selectedUrls = new Set([
      ...tabs.map((tab) => normalizeUrl(tab.url)),
      ...cards.flatMap((card) => card.url ? [normalizeUrl(card.url)] : [])
    ]);
    const cardIds = Object.values(baseWorkspace.cards)
      .filter((card) => card.url && selectedUrls.has(normalizeUrl(card.url)))
      .map((card) => card.id);
    await runGrouping(cardIds, baseWorkspace, baseState);
  };

  const organizeFromInstruction = async () => {
    const instruction = aiInstruction.trim();
    if (!instruction || !workspace || !appState || !settings || aiLoading) return;
    if (!deepSeekReady) {
      showToast(t("aiInstructionNeedsDeepSeek"));
      return;
    }
    const request = createAgentCommandRequest(
      workspace,
      locale,
      aiScope === "window" ? "selection" : "workspace",
      instruction,
      railSelection,
      openTabs
    );
    if (request.scope === "selection" && request.cards.length === 0 && request.tabs.length === 0) {
      showToast(t("aiSelectTabsFirst"));
      return;
    }

    setAiLoading(true);
    let plan: AgentPlan;
    try {
      const response = await sendBackgroundRequest<unknown>({
        type: "PLAN_AGENT_ACTIONS",
        provider: selectedAi!.provider,
        apiKey: selectedAi!.apiKey.trim(),
        model: selectedAi!.model,
        payload: request
      });
      if (!response.ok) {
        showToast(t("aiInstructionFailed", { reason: deepSeekFailureReason(response.code) }));
        return;
      }
      try {
        plan = validateAgentPlan(response.data, request);
      } catch {
        showToast(t("agentPlanInvalid"));
        return;
      }
    } catch {
      showToast(t("aiInstructionFailed", { reason: deepSeekFailureReason("network") }));
      return;
    } finally {
      setAiLoading(false);
    }

    if (!plan.actions.length) {
      showToast(plan.summary || t("agentPlanEmpty"));
      return;
    }
    setAiInstruction("");
    const action = plan.actions[0];
    if (action.type === "organize") {
      const tabIdSet = new Set(action.tabIds);
      const referencedTabs = openTabs.filter((tab) => tabIdSet.has(tab.id));
      const baseWorkspace = collectTabs(workspace, referencedTabs, null).workspace;
      const selectedCardIds = new Set(action.cardIds);
      const selectedUrls = new Set(referencedTabs.map((tab) => normalizeUrl(tab.url)));
      for (const card of Object.values(baseWorkspace.cards)) {
        if (card.url && selectedUrls.has(normalizeUrl(card.url))) selectedCardIds.add(card.id);
      }
      await runGrouping(
        [...selectedCardIds],
        baseWorkspace,
        updateWorkspace(appState, baseWorkspace),
        action.instruction
      );
      return;
    }
    if (action.type === "suggest_structure") {
      await runStructureSuggestion();
      return;
    }
    const plannedTabIds = new Set(request.tabs.map((tab) => tab.id));
    setModal({ type: "agent-plan", plan, tabs: openTabs.filter((tab) => plannedTabIds.has(tab.id)) });
  };

  const applyAgentPlan = async (plan: AgentPlan, plannedTabs: OpenTab[]) => {
    if (!workspace || !appState) return;
    const tabsById = new Map(plannedTabs.map((tab) => [tab.id, tab]));
    const allTabIds = new Set<number>();
    for (const action of plan.actions) {
      if ("tabIds" in action) action.tabIds.forEach((tabId) => allTabIds.add(tabId));
    }
    const involvedTabs = [...allTabIds].flatMap((tabId) => {
      const tab = tabsById.get(tabId);
      return tab?.supported ? [tab] : [];
    });

    const baselineWorkspace = collectTabs(workspace, involvedTabs, null).workspace;
    let nextWorkspace = baselineWorkspace;
    const closeIds = new Set<number>();
    const reopenUrls = new Set<string>();

    const ensureGroup = (name: string, color?: string) => {
      const existing = nextWorkspace.groupOrder
        .map((groupId) => nextWorkspace.groups[groupId])
        .find((group) => group?.name.trim().toLowerCase() === name.trim().toLowerCase());
      if (existing) return existing.id;
      nextWorkspace = createGroup(nextWorkspace, locale, name);
      const groupId = nextWorkspace.groupOrder[nextWorkspace.groupOrder.length - 1];
      if (color) nextWorkspace = updateGroup(nextWorkspace, groupId, { color });
      return groupId;
    };
    const cardIdForTab = (tabId: number) => {
      const tab = tabsById.get(tabId);
      if (!tab) return undefined;
      const normalized = normalizeUrl(tab.url);
      return Object.values(nextWorkspace.cards).find((card) => card.url && normalizeUrl(card.url) === normalized)?.id;
    };

    for (const action of plan.actions) {
      switch (action.type) {
        case "rename_workspace":
          nextWorkspace = renameWorkspace(nextWorkspace, action.name);
          break;
        case "create_group":
          ensureGroup(action.name, action.color);
          break;
        case "rename_group":
          nextWorkspace = updateGroup(nextWorkspace, action.groupId, { name: action.name });
          break;
        case "move_sources": {
          const targetGroupId = action.targetGroupName
            ? ensureGroup(action.targetGroupName)
            : action.targetGroupId ?? null;
          const cardIds = new Set([
            ...action.cardIds,
            ...action.tabIds.flatMap((tabId) => {
              const cardId = cardIdForTab(tabId);
              return cardId ? [cardId] : [];
            })
          ]);
          for (const cardId of cardIds) nextWorkspace = moveCard(nextWorkspace, cardId, targetGroupId);
          break;
        }
        case "set_status":
          for (const cardId of action.cardIds) nextWorkspace = updateCardStatus(nextWorkspace, cardId, action.status);
          break;
        case "save_tabs":
          if (action.targetGroupId) {
            for (const tabId of action.tabIds) {
              const cardId = cardIdForTab(tabId);
              if (cardId) nextWorkspace = moveCard(nextWorkspace, cardId, action.targetGroupId);
            }
          }
          break;
        case "close_tabs":
          action.tabIds.forEach((tabId) => {
            if (!tabsById.get(tabId)?.pinned) closeIds.add(tabId);
          });
          break;
        case "reopen_cards":
          action.cardIds.forEach((cardId) => {
            const url = nextWorkspace.cards[cardId]?.url;
            if (url) reopenUrls.add(url);
          });
          break;
        case "organize":
        case "suggest_structure":
          break;
      }
    }

    const undoableChange = nextWorkspace !== baselineWorkspace;
    if (undoableChange) {
      const snapshot: UndoSnapshot = {
        workspaceId: workspace.id,
        workspace: structuredClone(baselineWorkspace),
        createdAt: new Date().toISOString(),
        kind: "agent"
      };
      await saveUndoSnapshot(snapshot);
      setUndo(snapshot);
    } else {
      await invalidateUndo();
    }
    if (nextWorkspace !== workspace) await persistState(updateWorkspace(appState, nextWorkspace));

    let browserOperationFailed = false;
    if (closeIds.size) {
      try {
        await closeTabIds([...closeIds]);
      } catch {
        browserOperationFailed = true;
      }
    }
    if (reopenUrls.size) {
      const result = await restoreUrls([...reopenUrls]);
      if (result.failed) browserOperationFailed = true;
      if (result.fileAccessRequired) window.setTimeout(() => showToast(t("fileAccessRequired")), 200);
    }
    const refreshedTabs = await queryCurrentWindowTabs();
    previousTabs.current = refreshedTabs;
    setOpenTabs(refreshedTabs);
    setModal(null);
    showToast(t(browserOperationFailed ? "agentPlanPartial" : undoableChange ? "agentPlanApplied" : "agentPlanCompleted"));
  };

  const closeSelected = async ({ tabs }: { tabs: OpenTab[]; cards: Card[] }) => {
    if (!workspace || !appState) return;
    const closeableIds = tabs.filter((tab) => tab.supported && !tab.pinned).map((tab) => tab.id);
    if (!closeableIds.length) {
      showToast(t("nothingToClose"));
      return;
    }
    const collected = collectTabs(workspace, tabs, null);
    setModal({
      type: "confirm",
      action: "close-tabs",
      tabs,
      closeCount: closeableIds.length,
      saveCount: collected.addedTabIds.length
    });
    return false as const;
  };

  if (!appState || !settings || !workspace) {
    return <div className="loading-screen"><Logo /><p>{t("loading")}</p></div>;
  }

  const query = search.trim().toLowerCase();
  const workspaceMatches = (candidate: Workspace) =>
    !query || candidate.name.toLowerCase().includes(query) ||
    Object.values(candidate.cards).some((card) => card.title.toLowerCase().includes(query));
  const filterCards = (cards: Card[]) => cards.filter((card) => {
    const matchesQuery = !query || card.title.toLowerCase().includes(query) ||
      card.note.toLowerCase().includes(query) || card.url?.toLowerCase().includes(query);
    const matchesStatus = cardFilters.status === "all" || card.status === cardFilters.status;
    const matchesType = cardFilters.type === "all" || card.type === cardFilters.type;
    const matchesGroup = cardFilters.groupId === "all" || card.groupId === cardFilters.groupId;
    return matchesQuery && matchesStatus && matchesType && matchesGroup;
  });
  const noteCard = modal?.type === "note" ? workspace.cards[modal.cardId] : undefined;
  const savedCards = Object.values(workspace.cards);
  const filteredSavedCards = filterCards(savedCards);
  const hasCardFilters = cardFilters.status !== "all" || cardFilters.type !== "all" || cardFilters.groupId !== "all";
  const workspaceActivities = agentActivity.filter((activity) => activity.workspaceId === workspace.id);
  const clearCurrentAgentActivity = async () => {
    const next = await clearAgentActivity(workspace.id);
    setAgentActivity(next);
  };

  const removeSavedCard = (card: Card) => {
    setModal({ type: "confirm", action: "delete-card", cardId: card.id, cardTitle: card.title });
  };

  const openCreateGroupModal = () => {
    setModal({ type: "name", action: "create-group", initialValue: defaultGroupName(locale) });
  };

  const handleNameSubmit = async (value: string) => {
    if (modal?.type !== "name") return;
    if (modal.action === "create-workspace") {
      const next = addWorkspace(appState, locale);
      const created = next.workspaces[next.activeWorkspaceId];
      await invalidateUndo();
      await persistState(updateWorkspace(next, renameWorkspace(created, value)));
    } else if (modal.action === "create-group") {
      await commitWorkspace(createGroup(workspace, locale, value));
      showToast(t("groupCreated"));
    } else if (modal.groupId) {
      await commitWorkspace(updateGroup(workspace, modal.groupId, { name: value }));
    }
    setModal(null);
  };

  const handleManualCardSubmit = async (value: {
    title: string;
    url?: string;
    note?: string;
    groupId?: string;
  }) => {
    const result = addManualCard(workspace, locale, value);
    if (result.duplicateCardId) {
      showToast(t("sourceDuplicate"));
      return;
    }
    if (!result.cardId) return;
    await commitWorkspace(result.workspace);
    setModal(null);
    showToast(t("sourceAdded"));
  };

  const handleRelationSubmit = async (label: string) => {
    if (modal?.type !== "relation") return;
    await commitWorkspace(upsertEdge(workspace, {
      fromCardId: modal.fromCardId,
      toCardId: modal.toCardId,
      label
    }));
    setModal(null);
  };

  const handleConfirmAction = async () => {
    if (modal?.type !== "confirm") return;
    if (modal.action === "close-tabs") {
      const closeableIds = modal.tabs.filter((tab) => tab.supported && !tab.pinned).map((tab) => tab.id);
      const collected = collectTabs(workspace, modal.tabs, null);
      await invalidateUndo();
      await persistState(updateWorkspace(appState, collected.workspace));
      await closeTabIds(closeableIds);
      showToast(t("selectedCloseDone", {
        saved: collected.addedTabIds.length,
        closed: closeableIds.length
      }));
    } else if (modal.action === "delete-workspace") {
      await invalidateUndo();
      await persistState(removeWorkspace(appState, modal.workspaceId, locale));
      showToast(t("workspaceDeleted"));
    } else if (modal.action === "delete-group") {
      await commitWorkspace(deleteGroup(workspace, modal.groupId));
      showToast(t("groupDeleted"));
    } else {
      await commitWorkspace(deleteCard(workspace, modal.cardId));
    }
    setModal(null);
  };

  const nameModalCopy = modal?.type === "name" ? (
    modal.action === "create-workspace"
      ? { title: t("createWorkspaceTitle"), subtitle: t("createWorkspaceHint"), fieldLabel: t("workspaceNameLabel"), confirmLabel: t("createWorkspaceAction") }
      : modal.action === "create-group"
        ? { title: t("createGroupTitle"), subtitle: t("createGroupHint"), fieldLabel: t("groupNameLabel"), confirmLabel: t("createGroupAction") }
        : { title: t("renameGroupTitle"), subtitle: t("renameGroupHint"), fieldLabel: t("groupNameLabel"), confirmLabel: t("renameAction") }
  ) : null;

  const confirmModalCopy = modal?.type === "confirm" ? (
    modal.action === "close-tabs"
      ? {
          title: t("closeTabsTitle"),
          body: t("selectedCloseConfirm", { close: modal.closeCount, save: modal.saveCount }),
          confirmLabel: t("closeTabsAction", { count: modal.closeCount }),
          tone: "warning" as const
        }
      : modal.action === "delete-workspace"
        ? { title: t("deleteWorkspaceTitle"), body: t("deleteWorkspaceConfirm"), confirmLabel: t("deleteAction"), tone: "danger" as const }
        : modal.action === "delete-group"
          ? { title: t("deleteGroupTitle"), body: t("deleteGroupConfirm"), confirmLabel: t("deleteAction"), tone: "danger" as const }
          : { title: t("removeCardTitle"), body: t("removeCardConfirm", { title: modal.cardTitle }), confirmLabel: t("removeAction"), tone: "danger" as const }
  ) : null;
  const relationFrom = modal?.type === "relation" ? workspace.cards[modal.fromCardId] : undefined;
  const relationTo = modal?.type === "relation" ? workspace.cards[modal.toCardId] : undefined;

  return (
    <div className={`app-shell ${settings.rightRailCollapsed ? "rail-collapsed" : ""} ${settings.aiComposerCollapsed ? "ai-composer-collapsed" : "ai-composer-open"}`}>
      <aside className="workspace-sidebar">
        <Logo />
        <label className="search-box">
          <span aria-hidden="true">⌕</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("search")} />
        </label>
        <div className="sidebar-section-title">
          <span>{t("workspaces")}</span>
          <button
            type="button"
            onClick={() => setModal({ type: "name", action: "create-workspace", initialValue: untitledWorkspaceName(locale) })}
            title={t("addWorkspace")}
          >＋</button>
        </div>
        <nav className="workspace-list">
          {appState.workspaceOrder.map((workspaceId) => appState.workspaces[workspaceId]).filter(workspaceMatches).map((candidate) => (
            <div className={`workspace-item ${candidate.id === workspace.id ? "active" : ""}`} key={candidate.id}>
              <button className="workspace-select" type="button" onClick={() => void persistState({ ...appState, activeWorkspaceId: candidate.id })}>
                <span>{candidate.name}</span>
                <small>{Object.keys(candidate.cards).length}</small>
              </button>
              {candidate.id === workspace.id && (
                <button
                  className="workspace-delete"
                  type="button"
                  title={t("delete")}
                  onClick={() => setModal({ type: "confirm", action: "delete-workspace", workspaceId: candidate.id })}
                >×</button>
              )}
            </div>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <button className="settings-link" type="button" onClick={() => void openOptions()}><span>⚙</span>{t("settings")}</button>
        <div className="sidebar-footer">
          <div className="locale-switch">
            <button className={locale === "zh" ? "active" : ""} type="button" onClick={() => void changeSettings({ locale: "zh" })}>中文</button>
            <button className={locale === "en" ? "active" : ""} type="button" onClick={() => void changeSettings({ locale: "en" })}>EN</button>
          </div>
          <span>{t("autoSaved")}</span>
        </div>
      </aside>

      <main className="workspace-main">
        <header className="workspace-topbar">
          <div className="workspace-identity">
            <span className="workspace-kicker">{t("workspaceLabel")}</span>
            <div className="workspace-title-row">
              <input
                className="workspace-title-input"
                key={workspace.id}
                defaultValue={workspace.name}
                onBlur={(event) => void commitWorkspace(renameWorkspace(workspace, event.target.value))}
                aria-label={t("rename")}
              />
              <p><strong>{workspace.groupOrder.length}</strong> {t("groups")}<i /> <strong>{Object.keys(workspace.cards).length}</strong> {t("cards")}</p>
            </div>
          </div>
          <div className="toolbar utility-toolbar">
            <div className="view-switch" role="group" aria-label={t("viewSwitch")}>
              <button
                type="button"
                className={settings.workspaceView === "board" ? "active" : ""}
                onClick={() => void changeSettings({ workspaceView: "board" })}
              ><span aria-hidden="true">▦</span>{t("boardView")}</button>
              <button
                type="button"
                className={settings.workspaceView === "flow" ? "active" : ""}
                onClick={() => void changeSettings({ workspaceView: "flow" })}
              ><span aria-hidden="true">⌁</span>{t("flowView")}</button>
            </div>
            {undo?.workspaceId === workspace.id && (
              <button className="button ghost undo-button" type="button" onClick={() => void handleUndo()}>
                ↶ {t(undo.kind === "structure" ? "undoStructure" : "undo")}
              </button>
            )}
            <button className="button secondary" type="button" onClick={() => setModal({ type: "manual-card" })}>＋ {t("addSource")}</button>
            <button
              className="button secondary"
              type="button"
              onClick={openCreateGroupModal}
            >＋ {t("addGroup")}</button>
            <button
              className={`button ai-launch-button ${settings.aiComposerCollapsed ? "" : "active"}`}
              type="button"
              aria-pressed={!settings.aiComposerCollapsed}
              title={t(settings.aiComposerCollapsed ? "openAiComposer" : "hideAiComposer")}
              onClick={() => void changeSettings({ aiComposerCollapsed: !settings.aiComposerCollapsed })}
            ><span aria-hidden="true">✦</span>{t("openAiComposer")}</button>
            <button
              className={`button agent-activity-button ${workspaceActivities.length ? "has-activity" : ""}`}
              type="button"
              title={t("agentActivityOpen")}
              aria-label={`${t("agentActivityOpen")} · ${t("agentActivityCount", { count: workspaceActivities.length })}`}
              onClick={() => setModal({ type: "agent-activity" })}
            ><span aria-hidden="true">⌘</span>{t("agentActivityTitle")}{workspaceActivities.length > 0 && <em>{workspaceActivities.length}</em>}</button>
            <button className="button primary" type="button" disabled={savedCards.length === 0} onClick={() => setModal({ type: "export" })}>⇧ {t("export")}</button>
          </div>
        </header>

        <section className="workspace-filterbar" aria-label={t("filterSources")}>
          <div className="filterbar-heading"><span aria-hidden="true">⌁</span><strong>{t("filterSources")}</strong></div>
          <label>
            <span>{t("filterStatus")}</span>
            <select
              value={cardFilters.status}
              onChange={(event) => setCardFilters((current) => ({ ...current, status: event.target.value as "all" | CardStatus }))}
              aria-label={t("filterStatus")}
            >
              <option value="all">{t("filterAll")}</option>
              <option value="unread">{t("statusUnread")}</option>
              <option value="read">{t("statusRead")}</option>
              <option value="adopted">{t("statusAdopted")}</option>
            </select>
          </label>
          <label>
            <span>{t("filterType")}</span>
            <select
              value={cardFilters.type}
              onChange={(event) => setCardFilters((current) => ({ ...current, type: event.target.value as "all" | CardType }))}
              aria-label={t("filterType")}
            >
              <option value="all">{t("filterAll")}</option>
              <option value="web">WEB</option>
              <option value="note">NOTE</option>
              <option value="html">HTML</option>
              <option value="report">REPORT</option>
              <option value="agent">AGENT</option>
            </select>
          </label>
          <label className="filter-group-select">
            <span>{t("filterGroup")}</span>
            <select
              value={cardFilters.groupId}
              onChange={(event) => setCardFilters((current) => ({ ...current, groupId: event.target.value }))}
              aria-label={t("filterGroup")}
            >
              <option value="all">{t("filterAll")}</option>
              {workspace.groupOrder.map((groupId) => workspace.groups[groupId]).filter(Boolean).map((group) => (
                <option key={group.id} value={group.id}>{group.name}</option>
              ))}
            </select>
          </label>
          <span className="filter-result">{t("filterResults", { visible: filteredSavedCards.length, total: savedCards.length })}</span>
          <button
            type="button"
            className="filter-clear"
            disabled={!hasCardFilters}
            onClick={() => setCardFilters({ status: "all", type: "all", groupId: "all" })}
          >{t("clearFilters")}</button>
        </section>

        <div className="workspace-content">
          {settings.workspaceView === "flow" ? (
            <FlowCanvas
              workspace={workspace}
              cards={filteredSavedCards}
              locale={locale}
              aiLoading={aiLoading}
              aiEnabled={deepSeekReady}
              onAutoArrange={(flows) => void commitWorkspace(updateCardFlows(workspace, flows))}
              onStatusChange={(cardId, status) => void changeCardStatus(cardId, status)}
              onOpenCard={(card) => card.url && void focusOrOpenUrl(card.url).catch(() => showToast(t("fileAccessRequired")))}
              onConnect={(fromCardId, toCardId) => setModal({ type: "relation", fromCardId, toCardId })}
              onRemoveEdge={(edge) => void commitWorkspace(removeEdge(workspace, edge.fromCardId, edge.toCardId))}
              onSuggestStructure={() => void runStructureSuggestion()}
              onAddSourceToGroup={(groupId) => setModal({ type: "manual-card", groupId })}
            />
          ) : workspace.groupOrder.length === 0 ? (
            <section className="group-canvas-empty">
              <div className="empty-board-illustration" aria-hidden="true">
                <span><i /><i /><i /></span>
                <span><i /><i /></span>
                <span><i /></span>
              </div>
              <h2>{t("groupCanvasTitle")}</h2>
              <p>{t("groupCanvasBody")}</p>
              <div className="empty-onboarding-steps">
                <span><strong>1</strong>{t("emptyStepSelect")}</span>
                <i>→</i>
                <span><strong>2</strong>{t("emptyStepOrganize")}</span>
              </div>
              <button
                className="button secondary"
                type="button"
                onClick={openCreateGroupModal}
              >＋ {t("createFirstGroup")}</button>
            </section>
          ) : (
            <div className="group-board">
              {workspace.groupOrder.map((groupId) => workspace.groups[groupId]).filter(Boolean).filter((group) => (
                cardFilters.groupId === "all" || cardFilters.groupId === group.id
              )).map((group) => {
                const cards = filterCards(group.cardIds.map((id) => workspace.cards[id]).filter(Boolean));
                return (
                  <GroupPanel
                    key={group.id}
                    group={group}
                    cards={cards}
                    totalCount={group.cardIds.filter((id) => Boolean(workspace.cards[id])).length}
                    locale={locale}
                    openUrls={openUrlSet}
                    onDropPayload={(payload) => void handleDrop(payload, group.id)}
                    onOpenCard={(card) => card.url && void focusOrOpenUrl(card.url).catch(() => showToast(t("fileAccessRequired")))}
                    onNoteCard={(card) => setModal({ type: "note", cardId: card.id })}
                    onDeleteCard={removeSavedCard}
                    onStatusChange={(card, status) => void changeCardStatus(card.id, status)}
                    onAddSource={() => setModal({ type: "manual-card", groupId: group.id })}
                    onRename={() => setModal({ type: "name", action: "rename-group", groupId: group.id, initialValue: group.name })}
                    onColor={(color) => void commitWorkspace(updateGroup(workspace, group.id, { color }))}
                    onRestore={() => void handleRestore(cards)}
                    onDelete={() => setModal({ type: "confirm", action: "delete-group", groupId: group.id })}
                  />
                );
              })}
              <button
                className="add-group-lane"
                type="button"
                onClick={openCreateGroupModal}
              ><span>＋</span>{t("addAnotherGroup")}</button>
            </div>
          )}
        </div>

        {!settings.aiComposerCollapsed && (
          <section className={`workspace-ai-dock ${deepSeekReady ? "is-connected" : "needs-setup"}`} aria-label={t("aiCommandTitle")}>
            <form
              className="ai-command-composer"
              onSubmit={(event) => { event.preventDefault(); void organizeFromInstruction(); }}
            >
              <div className="ai-command-heading">
                <span className="ai-command-mark" aria-hidden="true">
                  <svg viewBox="0 0 24 24"><path d="M12 2.8c.55 4.6 3 7.05 7.6 7.6-4.6.55-7.05 3-7.6 7.6-.55-4.6-3-7.05-7.6-7.6 4.6-.55 7.05-3 7.6-7.6Z" /><path d="M19 16.1c.23 1.8 1.2 2.77 3 3-1.8.23-2.77 1.2-3 3-.23-1.8-1.2-2.77-3-3 1.8-.23 2.77-1.2 3-3Z" /></svg>
                </span>
                <div>
                  <strong>{t("aiCommandTitle")}</strong>
                  <small>{t(deepSeekReady ? "aiCommandConnected" : "aiCommandSetup")}</small>
                </div>
                {!deepSeekReady && <button className="ai-connect-action" type="button" onClick={() => void openOptions()}>{t("connectDeepSeek")}</button>}
                <button
                  className="ai-command-collapse"
                  type="button"
                  onClick={() => void changeSettings({ aiComposerCollapsed: true })}
                  aria-label={t("hideAiComposer")}
                  title={t("hideAiComposer")}
                ><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 8 5 5 5-5" /></svg></button>
              </div>
              <div className="ai-command-suggestions" aria-label={t("aiCommandExamples")}>
                <span className="ai-suggestion-label"><i aria-hidden="true">✦</i>{t("aiTryPrompt")}</span>
                {[
                  { label: t("aiCommandExampleType"), icon: <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="3" width="5" height="5" rx="1" /><rect x="12" y="3" width="5" height="5" rx="1" /><rect x="3" y="12" width="5" height="5" rx="1" /><rect x="12" y="12" width="5" height="5" rx="1" /></svg> },
                  { label: t("aiCommandExampleTime"), icon: <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7" /><path d="M10 6v4l3 2" /></svg> },
                  { label: t("aiCommandExampleStage"), icon: <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5h8M3 10h12M3 15h6" /><circle cx="14.5" cy="5" r="1.5" /><circle cx="17" cy="10" r="1.5" /><circle cx="11.5" cy="15" r="1.5" /></svg> },
                  { label: t("aiCommandExampleClose"), icon: <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5 5 15" /><path d="M3 2.8h14" /></svg> }
                ].map((example) => (
                  <button type="button" key={example.label} onClick={() => setAiInstruction(example.label)}><span>{example.icon}</span>{example.label}</button>
                ))}
              </div>
              <div className="ai-command-input-row">
                <textarea
                  rows={2}
                  value={aiInstruction}
                  onChange={(event) => setAiInstruction(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                      event.preventDefault();
                      void organizeFromInstruction();
                    }
                  }}
                  onInput={(event) => {
                    event.currentTarget.style.height = "auto";
                    event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 120)}px`;
                  }}
                  placeholder={t("aiCommandPlaceholder")}
                  disabled={aiLoading}
                  maxLength={600}
                />
                <button className="ai-command-submit" type="submit" disabled={!aiInstruction.trim() || aiLoading || (aiScope === "window" && aiSelectionCount === 0)} aria-label={t("runAiCommand")}>
                  {aiLoading ? <i /> : <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 15V5M6 9l4-4 4 4" /></svg>}
                </button>
              </div>
              <div className="ai-command-footer">
                <div className="ai-scope-switch" role="group" aria-label={t("aiCommandScope")}>
                  <button
                    type="button"
                    className={aiScope === "workspace" ? "active" : ""}
                    onClick={() => setAiScope("workspace")}
                    aria-pressed={aiScope === "workspace"}
                  ><span aria-hidden="true">▦</span><strong>{t("aiScopeWorkspaceName")}</strong><small>{t("aiScopeWorkspaceMeta", { count: savedCards.length })}</small></button>
                  <button
                    type="button"
                    className={aiScope === "window" ? "active" : ""}
                    onClick={() => setAiScope("window")}
                    aria-pressed={aiScope === "window"}
                    disabled={aiSelectionCount === 0}
                    title={aiSelectionCount ? undefined : t("aiSelectTabsFirst")}
                  ><span aria-hidden="true">✓</span><strong>{t("aiScopeSelectionName")}</strong><small>{aiSelectionCount ? t("aiScopeSelectionMeta", { count: aiSelectionCount }) : t("aiScopeSelectionEmpty")}</small></button>
                </div>
                <span className="ai-command-shortcut"><kbd>Cmd</kbd><span>+</span><kbd>Enter</kbd></span>
              </div>
            </form>
          </section>
        )}
      </main>

      <OpenTabsRail
        key={workspace.id}
        tabs={openTabs}
        workspace={workspace}
        locale={locale}
        aiLoading={aiLoading}
        aiEnabled={deepSeekReady}
        onSaveSelected={({ tabs }) => handleCollect(tabs)}
        onOrganizeSelected={organizeSelected}
        onCloseSelected={closeSelected}
        onReopenSelected={({ cards }) => handleRestore(cards)}
        recentlyClosed={recentlyClosed}
        onReopenRecent={reopenRecentlyClosed}
        onSelectionChange={setRailSelection}
        selection={tabWorkbenchState.selections[workspace.id]}
        onSelectionStateChange={(selection) => void changeTabWorkbenchSelection(selection)}
        onDismissRecent={dismissRecentlyClosed}
        unsupportedCount={openTabs.filter((tab) => !tab.supported).length}
        collapsed={settings.rightRailCollapsed}
        onCollapsedChange={(rightRailCollapsed) => void changeSettings({ rightRailCollapsed })}
      />

      {noteCard && modal?.type === "note" && (
        <NoteModal
          card={noteCard}
          locale={locale}
          onClose={() => setModal(null)}
          onSave={(note) => void commitWorkspace(updateCardNote(workspace, noteCard.id, note)).then(() => setModal(null))}
        />
      )}
      {modal?.type === "export" && <ExportModal workspace={workspace} locale={locale} onToast={showToast} onClose={() => setModal(null)} />}
      {modal?.type === "proposal" && <ProposalModal proposal={modal.proposal} workspace={modal.baseWorkspace ?? workspace} locale={locale} onApply={(proposal) => void applyProposal(proposal, modal.baseWorkspace, modal.baseState)} onClose={() => setModal(null)} />}
      {modal?.type === "agent-plan" && (
        <AgentPlanModal
          plan={modal.plan}
          workspace={workspace}
          tabs={modal.tabs}
          locale={locale}
          onApply={() => applyAgentPlan(modal.plan, modal.tabs)}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "agent-activity" && (
        <AgentActivityModal
          activities={workspaceActivities}
          locale={locale}
          onClear={clearCurrentAgentActivity}
          onReviewProposal={(activity) => activity.proposal && setModal({ type: "structure-proposal", proposal: activity.proposal })}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "structure-proposal" && (
        <StructureProposalModal
          proposal={modal.proposal}
          workspace={workspace}
          locale={locale}
          onApply={() => void applySuggestedStructure(modal.proposal)}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "manual-card" && (
        <ManualCardModal workspace={workspace} locale={locale} initialGroupId={modal.groupId} onSubmit={handleManualCardSubmit} onClose={() => setModal(null)} />
      )}
      {modal?.type === "relation" && relationFrom && relationTo && (
        <RelationModal
          fromCard={relationFrom}
          toCard={relationTo}
          locale={locale}
          onSubmit={handleRelationSubmit}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "name" && nameModalCopy && (
        <NameModal
          locale={locale}
          title={nameModalCopy.title}
          subtitle={nameModalCopy.subtitle}
          fieldLabel={nameModalCopy.fieldLabel}
          initialValue={modal.initialValue}
          confirmLabel={nameModalCopy.confirmLabel}
          icon={modal.action === "create-workspace" ? "▦" : modal.action === "create-group" ? "＋" : "Aa"}
          onSubmit={handleNameSubmit}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "confirm" && confirmModalCopy && (
        <ConfirmModal
          locale={locale}
          title={confirmModalCopy.title}
          body={confirmModalCopy.body}
          confirmLabel={confirmModalCopy.confirmLabel}
          tone={confirmModalCopy.tone}
          onConfirm={handleConfirmAction}
          onClose={() => setModal(null)}
        />
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
