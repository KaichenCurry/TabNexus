import { DEFAULT_SETTINGS } from "./defaults";
import { AI_PROVIDER_IDS, normalizeAiProviderConfigs } from "./aiProviders";
import { createInitialAppState } from "./workspace";
import {
  SCHEMA_VERSION,
  type AgentActivity,
  type AgentOperationReceipt,
  type AppState,
  type Locale,
  type RecentClosedTab,
  type Settings,
  type TabWorkbenchSelection,
  type TabWorkbenchState,
  type UndoSnapshot
} from "./types";

const APP_STATE_KEY = "tabnexus.appState.v1";
const SETTINGS_KEY = "tabnexus.settings.v1";
const UNDO_KEY = "tabnexus.undo.v1";
const RECENTLY_CLOSED_KEY = "tabnexus.recentlyClosed.v1";
const AGENT_ACTIVITY_KEY = "tabnexus.agentActivity.v1";
const AGENT_OPERATION_RECEIPTS_KEY = "tabnexus.agentOperationReceipts.v1";
const TAB_WORKBENCH_KEY = "tabnexus.tabWorkbench.v1";

function hasChromeStorage(): boolean {
  return typeof chrome !== "undefined" && Boolean(chrome.storage?.local);
}

async function localGet<T>(key: string): Promise<T | undefined> {
  if (hasChromeStorage()) {
    const result = await chrome.storage.local.get(key);
    return result[key] as T | undefined;
  }
  const raw = globalThis.localStorage?.getItem(key);
  return raw ? (JSON.parse(raw) as T) : undefined;
}

async function localSet<T>(key: string, value: T): Promise<void> {
  if (hasChromeStorage()) {
    await chrome.storage.local.set({ [key]: value });
    return;
  }
  globalThis.localStorage?.setItem(key, JSON.stringify(value));
}

export async function initializeStorageAccess(): Promise<void> {
  if (!hasChromeStorage()) return;
  try {
    await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
    await chrome.storage.session?.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  } catch {
    // Older Chrome versions still keep this extension free of content scripts.
  }
}

function isAppState(value: unknown): value is AppState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<AppState>;
  return (
    state.schemaVersion === SCHEMA_VERSION &&
    typeof state.activeWorkspaceId === "string" &&
    Array.isArray(state.workspaceOrder) &&
    Boolean(state.workspaces && typeof state.workspaces === "object")
  );
}

export async function loadAppState(locale: Locale = "zh"): Promise<AppState> {
  const stored = await localGet<unknown>(APP_STATE_KEY);
  if (isAppState(stored)) return stored;
  const initial = createInitialAppState(locale);
  await localSet(APP_STATE_KEY, initial);
  return initial;
}

export async function saveAppState(state: AppState): Promise<void> {
  await localSet(APP_STATE_KEY, state);
}

export function subscribeToAppState(onChange: () => void): () => void {
  if (!hasChromeStorage() || !chrome.storage.onChanged) return () => undefined;
  const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
    if (areaName === "local" && changes[APP_STATE_KEY]) onChange();
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

export async function loadSettings(): Promise<Settings> {
  const stored = await localGet<Partial<Settings>>(SETTINGS_KEY);
  const aiProvider = stored?.aiProvider && AI_PROVIDER_IDS.includes(stored.aiProvider)
    ? stored.aiProvider
    : "deepseek";
  const aiProviderConfigs = normalizeAiProviderConfigs(stored?.aiProviderConfigs, stored);
  return {
    ...DEFAULT_SETTINGS,
    ...(stored ?? {}),
    locale: stored?.locale === "en" ? "en" : "zh",
    closeAfterCollect: Boolean(stored?.closeAfterCollect),
    rightRailCollapsed: Boolean(stored?.rightRailCollapsed),
    aiComposerCollapsed: stored?.aiComposerCollapsed !== false,
    workspaceView: stored?.workspaceView === "flow" ? "flow" : "board",
    aiEnabled: typeof stored?.aiEnabled === "boolean" ? stored.aiEnabled : Boolean(stored?.deepSeekEnabled),
    aiProvider,
    aiProviderConfigs,
    deepSeekEnabled: Boolean(stored?.deepSeekEnabled),
    deepSeekApiKey: typeof stored?.deepSeekApiKey === "string" ? stored.deepSeekApiKey.trim() : "",
    deepSeekModel: "deepseek-v4-flash",
    deepSeekVerifiedAt: typeof stored?.deepSeekVerifiedAt === "string" ? stored.deepSeekVerifiedAt : "",
    groupingPolicy: ["automatic", "suggestion", "domain"].includes(stored?.groupingPolicy ?? "")
      ? stored!.groupingPolicy!
      : "suggestion",
    agentBridgeEnabled: Boolean(stored?.agentBridgeEnabled)
  };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await localSet(SETTINGS_KEY, settings);
}

export function subscribeToSettings(onChange: () => void): () => void {
  if (!hasChromeStorage() || !chrome.storage.onChanged) return () => undefined;
  const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
    if (areaName === "local" && changes[SETTINGS_KEY]) onChange();
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

export async function loadUndoSnapshot(): Promise<UndoSnapshot | null> {
  if (hasChromeStorage() && chrome.storage.session) {
    const result = await chrome.storage.session.get(UNDO_KEY);
    return (result[UNDO_KEY] as UndoSnapshot | undefined) ?? null;
  }
  return null;
}

export async function saveUndoSnapshot(snapshot: UndoSnapshot): Promise<void> {
  if (hasChromeStorage() && chrome.storage.session) {
    await chrome.storage.session.set({ [UNDO_KEY]: snapshot });
  }
}

export async function clearUndoSnapshot(): Promise<void> {
  if (hasChromeStorage() && chrome.storage.session) {
    await chrome.storage.session.remove(UNDO_KEY);
  }
}

export async function loadRecentlyClosed(): Promise<RecentClosedTab[]> {
  const stored = await localGet<unknown>(RECENTLY_CLOSED_KEY);
  if (!Array.isArray(stored)) return [];
  return stored.filter((item): item is RecentClosedTab => Boolean(
    item &&
    typeof item === "object" &&
    typeof (item as RecentClosedTab).id === "string" &&
    typeof (item as RecentClosedTab).title === "string" &&
    typeof (item as RecentClosedTab).url === "string" &&
    typeof (item as RecentClosedTab).closedAt === "string"
  )).slice(0, 30);
}

export async function saveRecentlyClosed(items: RecentClosedTab[]): Promise<void> {
  await localSet(RECENTLY_CLOSED_KEY, items.slice(0, 30));
}

export function subscribeToRecentlyClosed(onChange: () => void): () => void {
  if (!hasChromeStorage() || !chrome.storage.onChanged) return () => undefined;
  const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
    if (areaName === "local" && changes[RECENTLY_CLOSED_KEY]) onChange();
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

function validWorkbenchSelection(value: unknown): value is TabWorkbenchSelection {
  if (!value || typeof value !== "object") return false;
  const selection = value as Partial<TabWorkbenchSelection>;
  return Array.isArray(selection.tabIds) && selection.tabIds.every((id) => Number.isInteger(id) && id > 0) &&
    Array.isArray(selection.cardIds) && selection.cardIds.every((id) => typeof id === "string") &&
    typeof selection.updatedAt === "string";
}

export async function loadTabWorkbenchState(): Promise<TabWorkbenchState> {
  const stored = await localGet<unknown>(TAB_WORKBENCH_KEY);
  if (!stored || typeof stored !== "object") return { schemaVersion: 1, selections: {} };
  const value = stored as Partial<TabWorkbenchState>;
  if (value.schemaVersion !== 1 || !value.selections || typeof value.selections !== "object") {
    return { schemaVersion: 1, selections: {} };
  }
  return {
    schemaVersion: 1,
    selections: Object.fromEntries(Object.entries(value.selections).filter((entry): entry is [string, TabWorkbenchSelection] => validWorkbenchSelection(entry[1])))
  };
}

export async function saveTabWorkbenchSelection(
  workspaceId: string,
  selection: Pick<TabWorkbenchSelection, "tabIds" | "cardIds">
): Promise<TabWorkbenchState> {
  const current = await loadTabWorkbenchState();
  const normalized: TabWorkbenchSelection = {
    tabIds: [...new Set(selection.tabIds.filter((id) => Number.isInteger(id) && id > 0))].slice(0, 100),
    cardIds: [...new Set(selection.cardIds.filter((id) => typeof id === "string" && id))].slice(0, 100),
    updatedAt: new Date().toISOString()
  };
  const next: TabWorkbenchState = {
    schemaVersion: 1,
    selections: { ...current.selections, [workspaceId]: normalized }
  };
  await localSet(TAB_WORKBENCH_KEY, next);
  return next;
}

export function subscribeToTabWorkbench(onChange: () => void): () => void {
  if (!hasChromeStorage() || !chrome.storage.onChanged) return () => undefined;
  const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
    if (areaName === "local" && changes[TAB_WORKBENCH_KEY]) onChange();
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

export async function loadAgentActivity(): Promise<AgentActivity[]> {
  const stored = await localGet<unknown>(AGENT_ACTIVITY_KEY);
  if (!Array.isArray(stored)) return [];
  return stored.filter((item): item is AgentActivity => Boolean(
    item &&
    typeof item === "object" &&
    typeof (item as AgentActivity).id === "string" &&
    typeof (item as AgentActivity).workspaceId === "string" &&
    ["read_workspace", "search_cards", "add_card", "add_cards", "write_report", "propose_structure", "edit_workspace", "manage_workspaces", "delete_workspace_items", "read_tab_workbench", "manage_tab_workbench", "dismiss_recent_tabs", "sync_browser_tabs", "close_browser_tabs", "export_workspace", "manage_preferences", "manage_agent_activity"].includes((item as AgentActivity).tool) &&
    ["running", "success", "error"].includes((item as AgentActivity).status) &&
    typeof (item as AgentActivity).createdAt === "string"
  )).slice(0, 50);
}

export async function saveAgentActivity(items: AgentActivity[]): Promise<void> {
  await localSet(AGENT_ACTIVITY_KEY, items.slice(0, 50));
}

export async function clearAgentActivity(workspaceId?: string): Promise<AgentActivity[]> {
  const current = await loadAgentActivity();
  const next = workspaceId ? current.filter((item) => item.workspaceId !== workspaceId) : [];
  await saveAgentActivity(next);
  return next;
}

export function subscribeToAgentActivity(onChange: () => void): () => void {
  if (!hasChromeStorage() || !chrome.storage.onChanged) return () => undefined;
  const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
    if (areaName === "local" && changes[AGENT_ACTIVITY_KEY]) onChange();
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

export async function loadAgentOperationReceipts(): Promise<AgentOperationReceipt[]> {
  const stored = await localGet<unknown>(AGENT_OPERATION_RECEIPTS_KEY);
  if (!Array.isArray(stored)) return [];
  return stored.filter((item): item is AgentOperationReceipt => Boolean(
    item &&
    typeof item === "object" &&
    typeof (item as AgentOperationReceipt).id === "string" &&
    typeof (item as AgentOperationReceipt).workspaceId === "string" &&
    typeof (item as AgentOperationReceipt).operationId === "string" &&
    typeof (item as AgentOperationReceipt).completedAt === "string" &&
    (item as AgentOperationReceipt).result &&
    typeof (item as AgentOperationReceipt).result === "object"
  ));
}

export async function saveAgentOperationReceipt(receipt: AgentOperationReceipt): Promise<void> {
  const current = await loadAgentOperationReceipts();
  await localSet(AGENT_OPERATION_RECEIPTS_KEY, [
    receipt,
    ...current.filter((item) => item.id !== receipt.id)
  ].slice(0, 200));
}
