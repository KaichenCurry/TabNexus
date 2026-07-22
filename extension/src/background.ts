import { executeCollaborationTool, workspaceRevision } from "./core/collaboration";
import { appStateRevision, deleteWorkspaceItems, manageWorkspaces, searchWorkspaceCards, workspaceIndex } from "./core/collaborationApp";
import {
  clearAgentActivity,
  initializeStorageAccess,
  loadAgentActivity,
  loadAgentOperationReceipts,
  loadAppState,
  loadRecentlyClosed,
  loadSettings,
  loadTabWorkbenchState,
  saveAgentActivity,
  saveAgentOperationReceipt,
  saveAppState,
  saveRecentlyClosed,
  saveSettings,
  saveTabWorkbenchSelection
} from "./core/storage";
import { buildAgentPlanPrompt } from "./core/agent";
import { AI_PROVIDERS } from "./core/aiProviders";
import { agentPreferencesRevision, applyAgentPreferencePatch, safeAgentPreferences } from "./core/appPreferences";
import { exportWorkspaceJson, exportWorkspaceMarkdown, safeExportFilename } from "./core/export";
import { buildGroupingPrompt } from "./core/groupingPrompt";
import { isSupportedUrl, normalizeUrl } from "./core/url";
import { buildTabWorkbenchContext, selectionForWorkbenchScope } from "./core/tabWorkbench";
import { collectTabs, updateWorkspace } from "./core/workspace";
import type {
  AgentActivity,
  AgentPlan,
  AppState,
  BackgroundRequest,
  BackgroundResponse,
  BridgeConnectionStatus,
  CollaborationToolRequest,
  CollaborationToolResult,
  DeepSeekErrorCode,
  GroupingProposal,
  Settings,
  StructureProposal,
  TabWorkbenchContext,
  TabWorkbenchSelection,
  OpenTab,
  Workspace
} from "./core/types";

const REQUEST_TIMEOUT_MS = 25_000;
const RETRY_DELAY_MS = 750;
const AGENT_BRIDGE_ENDPOINT = "ws://127.0.0.1:43119/tabnexus" as const;

let agentBridgeSocket: WebSocket | null = null;
let bridgeStatus: BridgeConnectionStatus = {
  state: "disconnected",
  transport: "agent_websocket",
  endpoint: AGENT_BRIDGE_ENDPOINT
};
let bridgeConnectWaiter: ((connected: boolean) => void) | null = null;
let bridgeKeepAliveTimer: ReturnType<typeof globalThis.setInterval> | null = null;
let bridgeReconnectTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
let bridgeShouldReconnect = false;
let agentToolQueue: Promise<void> = Promise.resolve();

class AiTransportError extends Error {
  constructor(public readonly code: "timeout" | "network", message: string) {
    super(message);
    this.name = "AiTransportError";
  }
}

async function openWorkspace(): Promise<void> {
  const url = chrome.runtime.getURL("workspace.html");
  const tabs = await chrome.tabs.query({ url });
  const existing = tabs.find((tab) => tab.id !== undefined);
  if (existing?.id !== undefined) {
    await chrome.tabs.update(existing.id, { active: true });
    if (existing.windowId !== undefined) await chrome.windows.update(existing.windowId, { focused: true });
    return;
  }
  await chrome.tabs.create({ url, active: true });
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw new AiTransportError("timeout", "AI request timed out");
    throw new AiTransportError(
      "network",
      error instanceof Error ? error.message : "Unable to reach the AI provider"
    );
  } finally {
    clearTimeout(timer);
  }
}

function retryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

async function requestWithRetry(url: string, init: RequestInit): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url, init);
      if (response.ok || !retryableStatus(response.status) || attempt === 1) return response;
    } catch (error) {
      lastError = error;
      if (attempt === 1) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
  }
  throw lastError instanceof Error ? lastError : new Error("AI request failed");
}

function codeForStatus(status: number): DeepSeekErrorCode {
  if (status === 401 || status === 403) return "auth";
  if (status === 402) return "balance";
  if (status === 404) return "model";
  if (status === 408) return "timeout";
  if (status === 429) return "rate_limit";
  if (status >= 500) return "server";
  if (status === 400 || status === 422) return "invalid_request";
  return "unknown";
}

async function failureFromResponse(response: Response, providerName: string): Promise<Extract<BackgroundResponse, { ok: false }>> {
  let providerMessage = "";
  try {
    const payload = await response.json() as { error?: { message?: unknown }; message?: unknown };
    const value = payload.error?.message ?? payload.message;
    if (typeof value === "string") providerMessage = value.trim().slice(0, 240);
  } catch {
    // Status and error code remain sufficient when the provider body is not JSON.
  }
  const code = codeForStatus(response.status);
  return {
    ok: false,
    code,
    error: providerMessage || `${providerName} request failed (${response.status})`,
    retryable: retryableStatus(response.status)
  };
}

function failureFromError(error: unknown): Extract<BackgroundResponse, { ok: false }> {
  if (error instanceof AiTransportError) {
    return { ok: false, code: error.code, error: error.message, retryable: true };
  }
  return {
    ok: false,
    code: "unknown",
    error: error instanceof Error ? error.message : "AI request failed"
  };
}

function parseJsonContent(content: string): unknown {
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(trimmed);
}

type AiRequest = Pick<Extract<BackgroundRequest, { type: "VALIDATE_KEY" }>, "provider" | "apiKey" | "model">;

async function requestJsonCompletion(
  request: AiRequest,
  system: string,
  user: string,
  maxTokens: number
): Promise<BackgroundResponse<unknown>> {
  if (!request.apiKey.trim()) return { ok: false, code: "auth", error: "API key is empty" };
  const provider = AI_PROVIDERS[request.provider];
  if (!provider) return { ok: false, code: "invalid_request", error: "Unsupported AI provider" };
  const isAnthropic = provider.protocol === "anthropic";
  const headers: HeadersInit = isAnthropic
    ? {
        "x-api-key": request.apiKey.trim(),
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json"
      }
    : { Authorization: `Bearer ${request.apiKey.trim()}`, "Content-Type": "application/json" };
  const openAiBody: Record<string, unknown> = {
    model: request.model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ],
    response_format: { type: "json_object" },
    stream: false
  };
  if (request.provider === "openai") openAiBody.max_completion_tokens = maxTokens;
  else openAiBody.max_tokens = maxTokens;
  if (request.provider === "deepseek") openAiBody.thinking = { type: "disabled" };
  const body = isAnthropic
    ? {
        model: request.model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: user }]
      }
    : openAiBody;
  try {
    const response = await requestWithRetry(provider.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    });
    if (!response.ok) return await failureFromResponse(response, provider.name);
    const payload = await response.json() as {
      choices?: Array<{ message?: { content?: string | null } }>;
      content?: Array<{ type?: string; text?: string }>;
    };
    const content = isAnthropic
      ? payload.content?.find((item) => item.type === "text")?.text
      : payload.choices?.[0]?.message?.content;
    if (!content) return { ok: false, code: "invalid_response", error: `${provider.name} returned an empty response` };
    try {
      return { ok: true, data: parseJsonContent(content) };
    } catch {
      return { ok: false, code: "invalid_response", error: `${provider.name} returned invalid JSON` };
    }
  } catch (error) {
    return failureFromError(error);
  }
}

async function validateKey(request: Extract<BackgroundRequest, { type: "VALIDATE_KEY" }>): Promise<BackgroundResponse<{ model: string }>> {
  const response = await requestJsonCompletion(
    request,
    "Output valid JSON only.",
    'Return exactly {"ok":true}.',
    64
  );
  if (!response.ok) return response;
  const parsed = response.data as { ok?: unknown };
  return parsed.ok === true
    ? { ok: true, data: { model: request.model } }
    : { ok: false, code: "invalid_response", error: `${AI_PROVIDERS[request.provider].name} connection test returned an invalid response` };
}

async function clusterTabs(
  request: Extract<BackgroundRequest, { type: "CLUSTER_TABS" }>
): Promise<BackgroundResponse<GroupingProposal>> {
  const response = await requestJsonCompletion(
    request,
    "Follow the user's classification intent exactly. Output valid JSON only.",
    buildGroupingPrompt(request.payload),
    4_000
  );
  return response.ok ? { ok: true, data: response.data as GroupingProposal } : response;
}

function structurePrompt(request: Extract<BackgroundRequest, { type: "SUGGEST_STRUCTURE" }>["payload"]): string {
  const language = request.locale === "zh" ? "Simplified Chinese" : "English";
  return [
    "You turn saved browser sources into a small, useful directed task graph.",
    "Suggest only high-confidence relationships that help a user understand research order, evidence, contrast, or dependency.",
    "Use only the supplied card ids. Never connect a card to itself. Avoid duplicate edges and keep labels under 20 characters.",
    `Write labels and summary in ${language}.`,
    "Return JSON only with this shape:",
    '{"edges":[{"fromCardId":"...","toCardId":"...","label":"supports"}],"summary":"..."}',
    "Workspace context:",
    JSON.stringify(request)
  ].join("\n");
}

async function suggestStructure(
  request: Extract<BackgroundRequest, { type: "SUGGEST_STRUCTURE" }>
): Promise<BackgroundResponse<StructureProposal>> {
  const response = await requestJsonCompletion(
    request,
    "You are a deterministic task-graph editor. Output valid JSON.",
    structurePrompt(request.payload),
    1_500
  );
  return response.ok ? { ok: true, data: response.data as StructureProposal } : response;
}

async function planAgentActions(
  request: Extract<BackgroundRequest, { type: "PLAN_AGENT_ACTIONS" }>
): Promise<BackgroundResponse<AgentPlan>> {
  const response = await requestJsonCompletion(
    request,
    "You are a deterministic, non-destructive browser workspace operator. Output valid JSON only.",
    buildAgentPlanPrompt(request.payload),
    2_500
  );
  return response.ok ? { ok: true, data: response.data as AgentPlan } : response;
}

function activitySummary(payload: CollaborationToolRequest, locale: "zh" | "en"): string {
  const zh = locale === "zh";
  switch (payload.tool) {
    case "read_workspace": return zh ? "Agent 读取了工作区上下文" : "Agent read the workspace context";
    case "search_cards": return zh ? "Agent 搜索了工作区资料" : "Agent searched workspace cards";
    case "add_card": return zh ? `Agent 添加资料“${payload.input.title}”` : `Agent added “${payload.input.title}”`;
    case "add_cards": return zh ? `Agent 批量添加了 ${payload.input.cards.length} 条资料` : `Agent added ${payload.input.cards.length} cards`;
    case "write_report": return zh ? `Agent 写回报告“${payload.input.title}”` : `Agent wrote report “${payload.input.title}”`;
    case "propose_structure": return zh ? `Agent 提交了 ${payload.input.edges.length} 条关系建议` : `Agent proposed ${payload.input.edges.length} relationships`;
    case "edit_workspace": return zh ? `Agent 编辑了工作区（${payload.input.actions.length} 项）` : `Agent edited the workspace (${payload.input.actions.length} actions)`;
    case "manage_workspaces": return zh ? `Agent 管理了工作区（${payload.input.actions.length} 项）` : `Agent managed workspaces (${payload.input.actions.length} actions)`;
    case "delete_workspace_items": return zh ? "Agent 删除了工作区内容" : "Agent deleted workspace items";
    case "read_tab_workbench": return zh ? "Agent 读取了标签操作台" : "Agent read the tab workbench";
    case "manage_tab_workbench": return zh ? `Agent 操作了标签操作台（${payload.input.actions.length} 项）` : `Agent managed the tab workbench (${payload.input.actions.length} actions)`;
    case "dismiss_recent_tabs": return zh ? `Agent 移除了 ${payload.input.recentIds.length} 条最近关闭记录` : `Agent dismissed ${payload.input.recentIds.length} recent tabs`;
    case "sync_browser_tabs": return zh ? "Agent 同步了浏览器标签" : "Agent synchronized browser tabs";
    case "close_browser_tabs": {
      const count = payload.input.tabIds?.length;
      if (count !== undefined) return zh ? `Agent 关闭了 ${count} 个标签` : `Agent closed ${count} tabs`;
      return zh ? "Agent 关闭了标签操作台中的已选标签" : "Agent closed the selected workbench tabs";
    }
    case "export_workspace": return zh ? "Agent 导出了工作区" : "Agent exported the workspace";
    case "manage_preferences": return payload.input.action === "read"
      ? (zh ? "Agent 读取了安全设置" : "Agent read safe preferences")
      : (zh ? "Agent 更新了安全设置" : "Agent updated safe preferences");
    case "manage_agent_activity": return payload.input.action === "read"
      ? (zh ? "Agent 读取了协作记录" : "Agent read Agent activity")
      : (zh ? "Agent 清空了协作记录" : "Agent cleared Agent activity");
  }
}

function collaborationOperationId(payload: CollaborationToolRequest): string | undefined {
  if (
    payload.tool === "read_workspace" || payload.tool === "search_cards" || payload.tool === "read_tab_workbench" ||
    payload.tool === "export_workspace" || (payload.tool === "manage_preferences" && payload.input.action === "read") ||
    (payload.tool === "manage_agent_activity" && payload.input.action === "read")
  ) return undefined;
  const value = payload.input.operationId;
  return typeof value === "string" && value ? value.slice(0, 120) : undefined;
}

function hashContext(prefix: string, value: unknown): string {
  let hash = 0x811c9dc5;
  for (const character of JSON.stringify(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${prefix}_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function agentActivitySnapshot(items: AgentActivity[], workspaceId: string) {
  return items.filter((item) => item.workspaceId === workspaceId).map((item) => ({
    id: item.id,
    workspaceId: item.workspaceId,
    agentName: item.agentName,
    tool: item.tool,
    status: item.status,
    createdAt: item.createdAt,
    completedAt: item.completedAt,
    summary: item.summary,
    error: item.error
  }));
}

function agentActivityRevision(items: ReturnType<typeof agentActivitySnapshot>): string {
  return hashContext("actr", items);
}

async function readBrowserTabContext(workspace: Workspace) {
  try {
    const savedCardsByUrl = new Map(Object.values(workspace.cards).flatMap((card) =>
      card.url ? [[normalizeUrl(card.url), card.id] as const] : []
    ));
    const tabs = await chrome.tabs.query({ lastFocusedWindow: true });
    const browserTabs = tabs.flatMap((tab) => {
      const url = tab.url ?? tab.pendingUrl ?? "";
      if (tab.id === undefined || tab.windowId === undefined || !isSupportedUrl(url)) return [];
      return [{
        tabId: tab.id,
        windowId: tab.windowId,
        title: tab.title ?? url,
        url,
        favicon: tab.favIconUrl,
        pinned: Boolean(tab.pinned),
        active: Boolean(tab.active),
        lastAccessedAt: typeof tab.lastAccessed === "number" ? new Date(tab.lastAccessed).toISOString() : undefined,
        savedCardId: savedCardsByUrl.get(normalizeUrl(url))
      }];
    });
    return { browserTabs, browserRevision: hashContext("tabsr", browserTabs), unsupportedCount: tabs.length - browserTabs.length };
  } catch {
    return { browserTabs: [], browserRevision: hashContext("tabsr", []), unsupportedCount: 0 };
  }
}

async function readTabWorkbenchContext(workspace: Workspace, settings: Settings): Promise<TabWorkbenchContext> {
  const [{ browserTabs, unsupportedCount }, recentlyClosed, stored] = await Promise.all([
    readBrowserTabContext(workspace),
    loadRecentlyClosed(),
    loadTabWorkbenchState()
  ]);
  return buildTabWorkbenchContext({
    workspace,
    browserTabs,
    recentlyClosed,
    selection: stored.selections[workspace.id],
    collapsed: settings.rightRailCollapsed,
    unsupportedCount
  });
}

function assertTabWorkbenchRevision(context: TabWorkbenchContext, revision: string | undefined): void {
  if (!revision || revision !== context.revision) {
    throw new Error("Tab workbench changed since the Agent read it; read the latest workbench and retry");
  }
}

function expandedWorkbenchSelection(
  context: TabWorkbenchContext,
  tabIds: number[] = [],
  cardIds: string[] = []
): Pick<TabWorkbenchSelection, "tabIds" | "cardIds"> {
  const validTabs = new Map(context.openTabs.map((tab) => [tab.tabId, tab]));
  const validCards = new Set([
    ...context.openTabs.flatMap((tab) => tab.savedCardId ? [tab.savedCardId] : []),
    ...context.savedClosedCards.map((card) => card.cardId)
  ]);
  const selectedTabIds = new Set(tabIds.map((id) => {
    if (!validTabs.has(id)) throw new Error(`Unknown current-window tab id: ${id}`);
    return id;
  }));
  const selectedCardIds = new Set(cardIds.map((id) => {
    if (!validCards.has(id)) throw new Error(`Unknown tab-workbench card id: ${id}`);
    return id;
  }));
  for (const tabId of selectedTabIds) {
    const cardId = validTabs.get(tabId)?.savedCardId;
    if (cardId) selectedCardIds.add(cardId);
  }
  for (const cardId of selectedCardIds) {
    const tab = context.openTabs.find((item) => item.savedCardId === cardId);
    if (tab) selectedTabIds.add(tab.tabId);
  }
  return { tabIds: [...selectedTabIds], cardIds: [...selectedCardIds] };
}

async function focusCurrentTab(tabId: number): Promise<void> {
  const tab = await chrome.tabs.get(tabId);
  if (tab.id === undefined || tab.windowId === undefined) throw new Error(`Unknown current-window tab id: ${tabId}`);
  await chrome.tabs.update(tab.id, { active: true });
  await chrome.windows.update(tab.windowId, { focused: true });
}

async function reopenRecentUrl(url: string): Promise<boolean> {
  if (url.startsWith("file:") && !(await fileAccessAllowed())) return false;
  const normalized = normalizeUrl(url);
  const existing = (await chrome.tabs.query({})).find((tab) => tab.id !== undefined && tab.url && isSupportedUrl(tab.url) && normalizeUrl(tab.url) === normalized);
  if (existing?.id !== undefined) {
    await chrome.tabs.update(existing.id, { active: true });
    if (existing.windowId !== undefined) await chrome.windows.update(existing.windowId, { focused: true });
    return true;
  }
  await chrome.tabs.create({ url, active: false });
  return true;
}

async function executeTabWorkbenchManagement(
  workspace: Workspace,
  settings: Settings,
  request: Extract<CollaborationToolRequest, { tool: "manage_tab_workbench" }>
): Promise<Extract<CollaborationToolResult, { tool: "manage_tab_workbench" }>> {
  const operationId = assertAgentOperationId(request.input.operationId);
  if (!Array.isArray(request.input.actions) || request.input.actions.length < 1 || request.input.actions.length > 20) {
    throw new Error("actions must contain 1-20 tab-workbench actions");
  }
  const original = await readTabWorkbenchContext(workspace, settings);
  assertTabWorkbenchRevision(original, request.input.expectedRevision);
  let selection = expandedWorkbenchSelection(original, original.selectedTabIds, original.selectedCardIds);
  let collapsed = settings.rightRailCollapsed;
  let recent = await loadRecentlyClosed();
  const reopenedRecentIds: string[] = [];
  const failedRecentIds: string[] = [];
  let focusedTabId: number | undefined;

  for (const action of request.input.actions) {
    if (action.type === "set_selection") {
      const requested = expandedWorkbenchSelection(original, action.tabIds ?? [], action.cardIds ?? []);
      const tabIds = new Set(selection.tabIds);
      const cardIds = new Set(selection.cardIds);
      const mode = action.mode ?? "replace";
      if (mode === "replace") {
        selection = requested;
        continue;
      }
      for (const tabId of requested.tabIds) {
        if (mode === "remove") tabIds.delete(tabId);
        else if (mode === "toggle" && tabIds.has(tabId)) tabIds.delete(tabId);
        else tabIds.add(tabId);
      }
      for (const cardId of requested.cardIds) {
        if (mode === "remove") cardIds.delete(cardId);
        else if (mode === "toggle" && cardIds.has(cardId)) cardIds.delete(cardId);
        else cardIds.add(cardId);
      }
      selection = { tabIds: [...tabIds], cardIds: [...cardIds] };
    } else if (action.type === "select_all") {
      selection = selectionForWorkbenchScope(original, action.scope ?? "all", Boolean(action.includePinned));
    } else if (action.type === "clear_selection") {
      selection = { tabIds: [], cardIds: [] };
    } else if (action.type === "set_collapsed") {
      collapsed = action.collapsed;
    } else if (action.type === "focus_tab") {
      if (!original.openTabs.some((tab) => tab.tabId === action.tabId)) throw new Error(`Unknown current-window tab id: ${action.tabId}`);
      await focusCurrentTab(action.tabId);
      focusedTabId = action.tabId;
    } else if (action.type === "reopen_recent") {
      if (!Array.isArray(action.recentIds) || action.recentIds.length < 1 || action.recentIds.length > 30) throw new Error("recentIds must contain 1-30 entries");
      for (const recentId of [...new Set(action.recentIds)]) {
        const item = recent.find((candidate) => candidate.id === recentId);
        if (!item) { failedRecentIds.push(recentId); continue; }
        try {
          if (!(await reopenRecentUrl(item.url))) { failedRecentIds.push(recentId); continue; }
          reopenedRecentIds.push(recentId);
          recent = recent.filter((candidate) => candidate.id !== recentId);
        } catch { failedRecentIds.push(recentId); }
      }
    }
  }

  await saveTabWorkbenchSelection(workspace.id, selection);
  if (collapsed !== settings.rightRailCollapsed) await saveSettings({ ...settings, rightRailCollapsed: collapsed });
  if (reopenedRecentIds.length) await saveRecentlyClosed(recent);
  const workbench = await readTabWorkbenchContext(workspace, { ...settings, rightRailCollapsed: collapsed });
  return { tool: "manage_tab_workbench", revision: workbench.revision, workbench, reopenedRecentIds, failedRecentIds, focusedTabId, operationId };
}

async function dismissRecentTabs(
  workspace: Workspace,
  settings: Settings,
  request: Extract<CollaborationToolRequest, { tool: "dismiss_recent_tabs" }>
): Promise<Extract<CollaborationToolResult, { tool: "dismiss_recent_tabs" }>> {
  const operationId = assertAgentOperationId(request.input.operationId);
  assertExplicitAgentConfirmation(request.input.confirm, request.input.confirmationText, "dismiss_recent_tabs");
  if (!Array.isArray(request.input.recentIds) || request.input.recentIds.length < 1 || request.input.recentIds.length > 30) throw new Error("recentIds must contain 1-30 entries");
  const original = await readTabWorkbenchContext(workspace, settings);
  assertTabWorkbenchRevision(original, request.input.expectedRevision);
  const requested = [...new Set(request.input.recentIds)];
  const current = await loadRecentlyClosed();
  const available = new Set(current.map((item) => item.id));
  const dismissedRecentIds = requested.filter((id) => available.has(id));
  const missingRecentIds = requested.filter((id) => !available.has(id));
  await saveRecentlyClosed(current.filter((item) => !dismissedRecentIds.includes(item.id)));
  const workbench = await readTabWorkbenchContext(workspace, settings);
  return { tool: "dismiss_recent_tabs", revision: workbench.revision, workbench, dismissedRecentIds, missingRecentIds, operationId };
}

function assertAgentRevision(workspace: Workspace, revision: string): void {
  if (revision !== workspaceRevision(workspace)) {
    throw new Error("Workspace changed since the Agent read it; read the latest context and retry");
  }
}

function assertAgentOperationId(value: string): string {
  if (!/^[A-Za-z0-9._:-]{1,120}$/.test(value)) throw new Error("operationId must use 1-120 safe characters");
  return value;
}

function assertExplicitAgentConfirmation(confirm: unknown, confirmationText: unknown, action: string): void {
  if (confirm !== true) throw new Error(`${action} requires confirm=true`);
  if (typeof confirmationText !== "string" || confirmationText.length > 500 || !/(?:我确认|确认|i\s+confirm|confirmed)/i.test(confirmationText.trim())) {
    throw new Error(`${action} requires confirmationText copied from the user's explicit confirmation`);
  }
}

function chromeTabToOpenTab(tab: chrome.tabs.Tab): OpenTab | undefined {
  const url = tab.url ?? tab.pendingUrl ?? "";
  if (tab.id === undefined || tab.windowId === undefined || !isSupportedUrl(url)) return undefined;
  return {
    id: tab.id,
    windowId: tab.windowId,
    title: tab.title ?? url,
    url,
    favicon: tab.favIconUrl,
    pinned: Boolean(tab.pinned),
    active: Boolean(tab.active),
    supported: true,
    lastAccessedAt: typeof tab.lastAccessed === "number" ? new Date(tab.lastAccessed).toISOString() : undefined
  };
}

function cardIdsForTabs(workspace: Workspace, tabs: OpenTab[]): string[] {
  const idsByUrl = new Map(Object.values(workspace.cards).flatMap((card) =>
    card.url ? [[normalizeUrl(card.url), card.id] as const] : []
  ));
  return [...new Set(tabs.flatMap((tab) => idsByUrl.get(normalizeUrl(tab.url)) ?? []))];
}

async function fileAccessAllowed(): Promise<boolean> {
  try { return await chrome.extension.isAllowedFileSchemeAccess(); } catch { return false; }
}

async function executeBrowserSync(
  workspace: Workspace,
  locale: "zh" | "en",
  request: Extract<CollaborationToolRequest, { tool: "sync_browser_tabs" }>
) {
  assertAgentRevision(workspace, request.input.expectedRevision);
  const operationId = assertAgentOperationId(request.input.operationId);
  let next = workspace;
  let savedCardIds: string[] = [];
  let duplicateCardIds: string[] = [];
  let opened = 0;
  let existing = 0;
  let failed = 0;
  let fileAccessRequired = false;
  let focusedCardId: string | undefined;

  if (request.input.action === "save_tabs") {
    if (!Array.isArray(request.input.tabIds) || request.input.tabIds.length < 1 || request.input.tabIds.length > 100) {
      throw new Error("tabIds must contain 1-100 current-window tabs");
    }
    if (request.input.groupId && !workspace.groups[request.input.groupId]) throw new Error("Unknown group id");
    const requestedIds = new Set(request.input.tabIds);
    const current = await chrome.tabs.query({ lastFocusedWindow: true });
    const selected = current.flatMap((tab) => requestedIds.has(tab.id ?? -1) ? chromeTabToOpenTab(tab) ?? [] : []);
    failed = requestedIds.size - selected.length;
    const collected = collectTabs(workspace, selected, request.input.groupId ?? null);
    next = collected.workspace;
    savedCardIds = cardIdsForTabs(next, selected.filter((tab) => collected.addedTabIds.includes(tab.id)));
    duplicateCardIds = cardIdsForTabs(next, selected.filter((tab) => collected.duplicateTabIds.includes(tab.id)));
  } else if (["open_cards", "open_group", "open_workspace"].includes(request.input.action)) {
    let cardIds: string[];
    if (request.input.action === "open_cards") {
      if (!Array.isArray(request.input.cardIds) || request.input.cardIds.length < 1 || request.input.cardIds.length > 100) {
        throw new Error("cardIds must contain 1-100 saved cards");
      }
      cardIds = [...new Set(request.input.cardIds)];
    } else if (request.input.action === "open_group") {
      const group = request.input.groupId ? workspace.groups[request.input.groupId] : undefined;
      if (!group) throw new Error(`Unknown group id: ${String(request.input.groupId)}`);
      cardIds = [...group.cardIds];
    } else {
      const grouped = workspace.groupOrder.flatMap((groupId) => workspace.groups[groupId]?.cardIds ?? []);
      cardIds = [...new Set([...grouped, ...Object.keys(workspace.cards)])];
    }
    const cards = cardIds.map((cardId) => {
      const card = workspace.cards[cardId];
      if (!card) throw new Error(`Unknown card id: ${cardId}`);
      return card;
    });
    const openTabs = await chrome.tabs.query({ lastFocusedWindow: true });
    const openUrls = new Set(openTabs.flatMap((tab) => {
      const url = tab.url ?? tab.pendingUrl;
      return url && isSupportedUrl(url) ? [normalizeUrl(url)] : [];
    }));
    const canOpenFiles = await fileAccessAllowed();
    for (const card of cards) {
      if (!card.url) { failed += 1; continue; }
      const normalized = normalizeUrl(card.url);
      if (openUrls.has(normalized)) { existing += 1; continue; }
      if (card.url.startsWith("file:") && !canOpenFiles) {
        failed += 1;
        fileAccessRequired = true;
        continue;
      }
      try {
        await chrome.tabs.create({ url: card.url, active: false });
        openUrls.add(normalized);
        opened += 1;
      } catch { failed += 1; }
    }
  } else if (request.input.action === "focus_card") {
    const cardId = request.input.cardId;
    const card = cardId ? workspace.cards[cardId] : undefined;
    if (!card) throw new Error(`Unknown card id: ${String(cardId)}`);
    if (!card.url) throw new Error("The requested card has no URL");
    const normalized = normalizeUrl(card.url);
    const openTabs = await chrome.tabs.query({});
    const match = openTabs.find((tab) => tab.id !== undefined && tab.url && isSupportedUrl(tab.url) && normalizeUrl(tab.url) === normalized);
    if (match?.id !== undefined) {
      await chrome.tabs.update(match.id, { active: true });
      if (match.windowId !== undefined) await chrome.windows.update(match.windowId, { focused: true });
      existing = 1;
    } else {
      if (card.url.startsWith("file:") && !(await fileAccessAllowed())) {
        fileAccessRequired = true;
        failed = 1;
      } else {
        await chrome.tabs.create({ url: card.url, active: true });
        opened = 1;
      }
    }
    focusedCardId = card.id;
  } else {
    throw new Error("Unsupported browser sync action");
  }

  return {
    workspace: next,
    changed: workspaceRevision(next) !== workspaceRevision(workspace),
    result: {
      tool: "sync_browser_tabs" as const,
      revision: workspaceRevision(next),
      action: request.input.action,
      savedCardIds,
      duplicateCardIds,
      opened,
      existing,
      failed,
      fileAccessRequired,
      focusedCardId,
      operationId
    }
  };
}

async function prepareBrowserClose(
  workspace: Workspace,
  locale: "zh" | "en",
  request: Extract<CollaborationToolRequest, { tool: "close_browser_tabs" }>
) {
  assertAgentRevision(workspace, request.input.expectedRevision);
  const operationId = assertAgentOperationId(request.input.operationId);
  assertExplicitAgentConfirmation(request.input.confirm, request.input.confirmationText, "close_browser_tabs");
  if (!Array.isArray(request.input.tabIds) || request.input.tabIds.length < 1 || request.input.tabIds.length > 100) {
    throw new Error("tabIds must contain 1-100 current-window tabs");
  }
  if (request.input.groupId && !workspace.groups[request.input.groupId]) throw new Error("Unknown group id");
  const requestedIds = [...new Set(request.input.tabIds)];
  const requested = new Set(requestedIds);
  const current = await chrome.tabs.query({ lastFocusedWindow: true });
  const foundIds = new Set(current.flatMap((tab) => tab.id !== undefined && requested.has(tab.id) ? [tab.id] : []));
  const missingTabIds = requestedIds.filter((id) => !foundIds.has(id));
  const skippedPinnedTabIds = current.flatMap((tab) => tab.id !== undefined && requested.has(tab.id) && tab.pinned ? [tab.id] : []);
  const closeable = current.flatMap((tab) => {
    if (tab.id === undefined || !requested.has(tab.id) || tab.pinned) return [];
    return chromeTabToOpenTab(tab) ?? [];
  });
  let next = workspace;
  let savedCardIds: string[] = [];
  let duplicateCardIds: string[] = [];
  if (request.input.saveBeforeClose !== false) {
    const collected = collectTabs(workspace, closeable, request.input.groupId ?? null);
    next = collected.workspace;
    savedCardIds = cardIdsForTabs(next, closeable.filter((tab) => collected.addedTabIds.includes(tab.id)));
    duplicateCardIds = cardIdsForTabs(next, closeable.filter((tab) => collected.duplicateTabIds.includes(tab.id)));
  }
  const closedTabIds = closeable.map((tab) => tab.id);
  return {
    workspace: next,
    changed: workspaceRevision(next) !== workspaceRevision(workspace),
    afterPersist: async () => { if (closedTabIds.length) await chrome.tabs.remove(closedTabIds); },
    result: {
      tool: "close_browser_tabs" as const,
      revision: workspaceRevision(next),
      savedCardIds,
      duplicateCardIds,
      closedTabIds,
      skippedPinnedTabIds,
      missingTabIds,
      operationId
    }
  };
}

async function enrichCollaborationResult(
  result: CollaborationToolResult,
  state: AppState,
  workspace: Workspace
): Promise<CollaborationToolResult> {
  if (result.tool !== "read_workspace") return result;
  const { browserTabs, browserRevision } = await readBrowserTabContext(workspace);
  return {
    ...result,
    browserTabs,
    browserRevision,
    activeWorkspaceId: state.activeWorkspaceId,
    stateRevision: appStateRevision(state),
    workspaceIndex: workspaceIndex(state)
  };
}

async function upsertAgentActivity(activity: AgentActivity): Promise<void> {
  const current = await loadAgentActivity();
  const previous = current.find((item) => item.id === activity.id);
  const merged = previous ? { ...previous, ...activity } : activity;
  await saveAgentActivity([merged, ...current.filter((item) => item.id !== activity.id)]);
}

async function executeCollaborationToolRequest(
  request: Extract<BackgroundRequest, { type: "M3_AGENT_TOOL" }>,
  activityId = `agent_${crypto.randomUUID()}`,
  agentName?: string
): Promise<BackgroundResponse<CollaborationToolResult>> {
  let workspaceId = request.workspaceId;
  let summary = "Agent tool request";
  let silentConditionalRead = false;
  let suppressActivity = request.payload.tool === "manage_agent_activity";
  try {
    const settings = await loadSettings();
    const state = await loadAppState(settings.locale);
    workspaceId = request.workspaceId ?? state.activeWorkspaceId;
    const workspace = state.workspaces[workspaceId];
    if (!workspace) return { ok: false, code: "invalid_request", error: "Workspace not found" };
    if (request.payload.tool === "manage_agent_activity") {
      const payload = request.payload;
      const current = agentActivitySnapshot(await loadAgentActivity(), workspaceId);
      const revision = agentActivityRevision(current);
      if (payload.input.action === "read") {
        return { ok: true, data: { tool: "manage_agent_activity", action: "read", revision, activities: current, cleared: 0 } };
      }
      assertExplicitAgentConfirmation(payload.input.confirm, payload.input.confirmationText, "manage_agent_activity clear");
      if (payload.input.expectedRevision !== revision) throw new Error("Agent activity changed since it was read; read it again and retry");
      const operationId = assertAgentOperationId(String(payload.input.operationId ?? ""));
      const receiptId = `agent_op_${workspaceId}_${operationId}`.slice(0, 240);
      const receipt = (await loadAgentOperationReceipts()).find((item) => item.id === receiptId);
      if (receipt) return { ok: true, data: receipt.result };
      await clearAgentActivity(workspaceId);
      const activities = agentActivitySnapshot(await loadAgentActivity(), workspaceId);
      const result: CollaborationToolResult = {
        tool: "manage_agent_activity",
        action: "clear",
        revision: agentActivityRevision(activities),
        activities,
        cleared: current.length,
        operationId
      };
      await saveAgentOperationReceipt({ id: receiptId, workspaceId, operationId, completedAt: new Date().toISOString(), result });
      return { ok: true, data: result };
    }
    silentConditionalRead = (
      request.payload.tool === "read_workspace" || request.payload.tool === "read_tab_workbench"
    ) && Boolean(request.payload.input?.sinceRevision);
    if (silentConditionalRead) {
      if (request.payload.tool === "read_tab_workbench") {
        const workbench = await readTabWorkbenchContext(workspace, settings);
        const unchanged = request.payload.input?.sinceRevision === workbench.revision;
        return {
          ok: true,
          data: {
            tool: "read_tab_workbench",
            revision: workbench.revision,
            unchanged,
            ...(unchanged ? {} : { workbench })
          }
        };
      }
      const execution = executeCollaborationTool(workspace, settings.locale, request.payload);
      return { ok: true, data: await enrichCollaborationResult(execution.result, state, workspace) };
    }
    const operationId = collaborationOperationId(request.payload);
    if (operationId) {
      const operationScope = request.payload.tool === "manage_workspaces" || (request.payload.tool === "delete_workspace_items" && request.payload.input.deleteWorkspace)
        ? "app"
        : workspaceId;
      activityId = `agent_op_${operationScope}_${operationId}`.slice(0, 240);
      const receipt = (await loadAgentOperationReceipts()).find((item) => item.id === activityId);
      if (receipt) {
        return { ok: true, data: receipt.result };
      }
    }
    summary = activitySummary(request.payload, settings.locale);
    const running: AgentActivity = {
      id: activityId,
      workspaceId,
      agentName,
      tool: request.payload.tool,
      status: "running",
      createdAt: new Date().toISOString(),
      summary
    };
    await upsertAgentActivity(running);
    let nextState = state;
    let changed = false;
    let afterPersist: (() => Promise<void>) | undefined;
    let usedWorkbenchSelection = false;
    let result: CollaborationToolResult;
    if (request.payload.tool === "read_tab_workbench") {
      const workbench = await readTabWorkbenchContext(workspace, settings);
      result = { tool: "read_tab_workbench", revision: workbench.revision, unchanged: false, workbench };
    } else if (request.payload.tool === "manage_tab_workbench") {
      result = await executeTabWorkbenchManagement(workspace, settings, request.payload);
    } else if (request.payload.tool === "dismiss_recent_tabs") {
      result = await dismissRecentTabs(workspace, settings, request.payload);
    } else if (request.payload.tool === "search_cards") {
      result = searchWorkspaceCards(state, request.payload);
    } else if (request.payload.tool === "manage_workspaces") {
      const execution = manageWorkspaces(state, settings.locale, request.payload);
      nextState = execution.state;
      changed = execution.changed;
      result = execution.result;
    } else if (request.payload.tool === "delete_workspace_items") {
      const execution = deleteWorkspaceItems(state, workspaceId, settings.locale, request.payload);
      nextState = execution.state;
      changed = execution.changed;
      result = execution.result;
    } else if (request.payload.tool === "sync_browser_tabs") {
      let payload = request.payload;
      if (payload.input.scope === "workbench_selection") {
        const workbench = await readTabWorkbenchContext(workspace, settings);
        assertTabWorkbenchRevision(workbench, payload.input.expectedWorkbenchRevision);
        if (payload.input.action === "focus_card") {
          throw new Error("focus_card requires an explicit cardId; use manage_tab_workbench focus_tab for a browser tab");
        }
        payload = {
          ...payload,
          input: payload.input.action === "save_tabs"
            ? { ...payload.input, tabIds: workbench.selectedTabIds }
            : { ...payload.input, cardIds: workbench.selectedCardIds }
        };
        usedWorkbenchSelection = true;
      } else if (payload.input.scope === "current_window") {
        const workbench = await readTabWorkbenchContext(workspace, settings);
        assertTabWorkbenchRevision(workbench, payload.input.expectedWorkbenchRevision);
        if (payload.input.action !== "save_tabs") throw new Error("current_window scope is only valid with save_tabs");
        payload = {
          ...payload,
          input: {
            ...payload.input,
            tabIds: workbench.openTabs
              .filter((tab) => payload.input.includePinned === true || !tab.pinned)
              .map((tab) => tab.tabId)
          }
        };
      }
      const execution = await executeBrowserSync(workspace, settings.locale, payload);
      nextState = execution.changed ? updateWorkspace(state, execution.workspace) : state;
      changed = execution.changed;
      result = execution.result;
    } else if (request.payload.tool === "close_browser_tabs") {
      let payload = request.payload;
      if (payload.input.scope === "workbench_selection") {
        const workbench = await readTabWorkbenchContext(workspace, settings);
        assertTabWorkbenchRevision(workbench, payload.input.expectedWorkbenchRevision);
        payload = { ...payload, input: { ...payload.input, tabIds: workbench.selectedTabIds } };
        usedWorkbenchSelection = true;
      } else if (payload.input.scope === "current_window") {
        const workbench = await readTabWorkbenchContext(workspace, settings);
        assertTabWorkbenchRevision(workbench, payload.input.expectedWorkbenchRevision);
        payload = { ...payload, input: { ...payload.input, tabIds: workbench.openTabs.map((tab) => tab.tabId) } };
      }
      const execution = await prepareBrowserClose(workspace, settings.locale, payload);
      nextState = execution.changed ? updateWorkspace(state, execution.workspace) : state;
      changed = execution.changed;
      afterPersist = execution.afterPersist;
      result = execution.result;
    } else if (request.payload.tool === "export_workspace") {
      const format = request.payload.input?.format ?? "markdown";
      result = {
        tool: "export_workspace",
        revision: workspaceRevision(workspace),
        format,
        filename: safeExportFilename(workspace, format === "markdown" ? "md" : "json"),
        content: format === "markdown" ? exportWorkspaceMarkdown(workspace, settings.locale) : exportWorkspaceJson(workspace)
      };
    } else if (request.payload.tool === "manage_preferences") {
      const payload = request.payload;
      if (payload.input.action === "read") {
        result = {
          tool: "manage_preferences",
          revision: agentPreferencesRevision(settings),
          changed: false,
          preferences: safeAgentPreferences(settings)
        };
      } else {
        const expected = payload.input.expectedRevision;
        if (expected !== agentPreferencesRevision(settings)) throw new Error("Preferences changed since the Agent read them; read them again and retry");
        const operationId = assertAgentOperationId(String(payload.input.operationId ?? ""));
        const nextSettings = applyAgentPreferencePatch(settings, payload.input.preferences ?? {});
        const changedSettings = agentPreferencesRevision(nextSettings) !== agentPreferencesRevision(settings);
        if (changedSettings) await saveSettings(nextSettings);
        result = {
          tool: "manage_preferences",
          revision: agentPreferencesRevision(nextSettings),
          changed: changedSettings,
          preferences: safeAgentPreferences(nextSettings),
          operationId
        };
      }
    } else {
      const execution = executeCollaborationTool(workspace, settings.locale, request.payload);
      nextState = execution.changed ? updateWorkspace(state, execution.workspace) : state;
      changed = execution.changed;
      result = execution.result;
    }
    if (changed) await saveAppState(nextState);
    if (afterPersist) await afterPersist();
    const resultWorkspace = nextState.workspaces[workspaceId] ?? nextState.workspaces[nextState.activeWorkspaceId];
    if (usedWorkbenchSelection) {
      await saveTabWorkbenchSelection(workspaceId, { tabIds: [], cardIds: [] });
      const workbench = await readTabWorkbenchContext(resultWorkspace, settings);
      result = { ...result, workbenchRevision: workbench.revision, usedWorkbenchSelection: true } as CollaborationToolResult;
    }
    if (changed && result.tool !== "manage_workspaces" && result.tool !== "delete_workspace_items" && result.tool !== "search_cards") {
      result = { ...result, revision: workspaceRevision(resultWorkspace) } as CollaborationToolResult;
    }
    result = await enrichCollaborationResult(result, nextState, resultWorkspace);
    await upsertAgentActivity({
      ...running,
      status: "success",
      completedAt: new Date().toISOString(),
      proposal: result.tool === "propose_structure" ? result.proposal : undefined,
      result
    });
    if (operationId) {
      await saveAgentOperationReceipt({
        id: activityId,
        workspaceId,
        operationId,
        completedAt: new Date().toISOString(),
        result
      });
    }
    return { ok: true, data: result };
  } catch (error) {
    if (workspaceId && !silentConditionalRead && !suppressActivity) {
      await upsertAgentActivity({
        id: activityId,
        workspaceId,
        agentName,
        tool: request.payload.tool,
        status: "error",
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        summary,
        error: error instanceof Error ? error.message : "Agent tool request failed"
      });
    }
    const message = error instanceof Error ? error.message : "Agent tool request failed";
    return {
      ok: false,
      code: message.startsWith("Workspace changed") || message.startsWith("Workspace list changed") || message.startsWith("Tab workbench changed") || message.startsWith("Preferences changed") || message.startsWith("Agent activity changed") ? "conflict" : "invalid_request",
      error: message
    };
  }
}

function runCollaborationTool(
  request: Extract<BackgroundRequest, { type: "M3_AGENT_TOOL" }>,
  activityId = `agent_${crypto.randomUUID()}`,
  agentName?: string
): Promise<BackgroundResponse<CollaborationToolResult>> {
  const task = agentToolQueue.then(() => executeCollaborationToolRequest(request, activityId, agentName));
  agentToolQueue = task.then(() => undefined, () => undefined);
  return task;
}

function stopBridgeTimers(): void {
  if (bridgeKeepAliveTimer !== null) globalThis.clearInterval(bridgeKeepAliveTimer);
  if (bridgeReconnectTimer !== null) globalThis.clearTimeout(bridgeReconnectTimer);
  bridgeKeepAliveTimer = null;
  bridgeReconnectTimer = null;
}

function sendAgentBridgeMessage(message: unknown): void {
  if (agentBridgeSocket?.readyState === WebSocket.OPEN) {
    agentBridgeSocket.send(JSON.stringify(message));
  }
}

function scheduleAgentBridgeReconnect(): void {
  if (!bridgeShouldReconnect || bridgeReconnectTimer !== null) return;
  bridgeReconnectTimer = globalThis.setTimeout(() => {
    bridgeReconnectTimer = null;
    void connectAgentBridge();
  }, 2_500);
}

function handleAgentBridgeMessage(message: unknown): void {
  if (!message || typeof message !== "object") return;
  const value = message as Record<string, unknown>;
  const messageAgentNames = Array.isArray(value.agents)
    ? [...new Set(value.agents.flatMap((agent) => {
      if (!agent || typeof agent !== "object") return [];
      const name = (agent as Record<string, unknown>).name;
      return typeof name === "string" && name.trim() ? [name.trim().slice(0, 60)] : [];
    }))]
    : [];
  if (value.type === "bridge_ready") {
    const fallbackAgentName = typeof value.agentName === "string" ? value.agentName.slice(0, 60) : "Agent";
    const agentNames = messageAgentNames.length > 0 ? messageAgentNames : [fallbackAgentName];
    bridgeStatus = {
      state: "connected",
      transport: "agent_websocket",
      endpoint: AGENT_BRIDGE_ENDPOINT,
      agentName: agentNames[0],
      agentNames,
      agentCount: agentNames.length,
      hostVersion: typeof value.hostVersion === "string" ? value.hostVersion : undefined
    };
    if (bridgeKeepAliveTimer !== null) globalThis.clearInterval(bridgeKeepAliveTimer);
    bridgeKeepAliveTimer = globalThis.setInterval(() => {
      sendAgentBridgeMessage({ type: "keepalive", at: Date.now() });
    }, 20_000);
    bridgeConnectWaiter?.(true);
    bridgeConnectWaiter = null;
    return;
  }
  if (value.type === "agents_changed" && bridgeStatus.state === "connected") {
    const agentNames = messageAgentNames.length > 0 ? messageAgentNames : bridgeStatus.agentNames ?? [];
    bridgeStatus = {
      ...bridgeStatus,
      agentName: agentNames[0] ?? bridgeStatus.agentName,
      agentNames,
      agentCount: agentNames.length
    };
    return;
  }
  if (
    value.type !== "agent_tool_request" ||
    typeof value.requestId !== "string" ||
    !value.payload ||
    typeof value.payload !== "object"
  ) return;
  const requestId = value.requestId.slice(0, 120);
  const requestAgentName = typeof value.agentName === "string" && value.agentName.trim()
    ? value.agentName.trim().slice(0, 60)
    : bridgeStatus.agentName;
  void runCollaborationTool({
    type: "M3_AGENT_TOOL",
    workspaceId: typeof value.workspaceId === "string" ? value.workspaceId : undefined,
    payload: value.payload as CollaborationToolRequest
  }, requestId, requestAgentName).then((response) => {
    sendAgentBridgeMessage(response.ok
      ? { type: "agent_tool_result", requestId, ok: true, data: response.data }
      : { type: "agent_tool_result", requestId, ok: false, error: response.error });
  });
}

async function connectAgentBridge(): Promise<BridgeConnectionStatus> {
  bridgeShouldReconnect = true;
  if (bridgeStatus.state === "connected" && agentBridgeSocket?.readyState === WebSocket.OPEN) return bridgeStatus;
  if (typeof WebSocket === "undefined") {
    bridgeStatus = {
      state: "error",
      transport: "agent_websocket",
      endpoint: AGENT_BRIDGE_ENDPOINT,
      error: "unsupported"
    };
    return bridgeStatus;
  }
  if (agentBridgeSocket) {
    agentBridgeSocket.close();
    agentBridgeSocket = null;
  }
  if (bridgeReconnectTimer !== null) globalThis.clearTimeout(bridgeReconnectTimer);
  bridgeReconnectTimer = null;
  bridgeStatus = {
    state: "connecting",
    transport: "agent_websocket",
    endpoint: AGENT_BRIDGE_ENDPOINT
  };
  try {
    const socket = new WebSocket(AGENT_BRIDGE_ENDPOINT);
    agentBridgeSocket = socket;
    socket.addEventListener("message", (event) => {
      if (agentBridgeSocket !== socket || typeof event.data !== "string") return;
      try {
        handleAgentBridgeMessage(JSON.parse(event.data));
      } catch {
        // Invalid local relay messages are ignored and never reach product logic.
      }
    });
    socket.addEventListener("close", () => {
      if (agentBridgeSocket !== socket) return;
      const wasConnected = bridgeStatus.state === "connected";
      agentBridgeSocket = null;
      if (bridgeKeepAliveTimer !== null) globalThis.clearInterval(bridgeKeepAliveTimer);
      bridgeKeepAliveTimer = null;
      bridgeStatus = {
        state: "error",
        transport: "agent_websocket",
        endpoint: AGENT_BRIDGE_ENDPOINT,
        error: wasConnected ? "host_disconnected" : "agent_offline"
      };
      bridgeConnectWaiter?.(false);
      bridgeConnectWaiter = null;
      scheduleAgentBridgeReconnect();
    });
    const connected = await new Promise<boolean>((resolve) => {
      bridgeConnectWaiter = resolve;
      globalThis.setTimeout(() => {
        if (bridgeConnectWaiter !== resolve) return;
        bridgeConnectWaiter = null;
        resolve(false);
      }, 2_500);
    });
    if (!connected && bridgeStatus.state === "connecting") {
      socket.close();
      bridgeStatus = {
        state: "error",
        transport: "agent_websocket",
        endpoint: AGENT_BRIDGE_ENDPOINT,
        error: "agent_offline"
      };
    }
  } catch {
    agentBridgeSocket = null;
    bridgeStatus = {
      state: "error",
      transport: "agent_websocket",
      endpoint: AGENT_BRIDGE_ENDPOINT,
      error: "agent_offline"
    };
    scheduleAgentBridgeReconnect();
  }
  return bridgeStatus;
}

function disconnectAgentBridge(): BridgeConnectionStatus {
  bridgeShouldReconnect = false;
  const socket = agentBridgeSocket;
  agentBridgeSocket = null;
  bridgeConnectWaiter?.(false);
  bridgeConnectWaiter = null;
  stopBridgeTimers();
  if (socket) socket.close();
  bridgeStatus = {
    state: "disconnected",
    transport: "agent_websocket",
    endpoint: AGENT_BRIDGE_ENDPOINT
  };
  return bridgeStatus;
}

chrome.action.onClicked.addListener(() => {
  void openWorkspace();
});

chrome.runtime.onInstalled.addListener(() => {
  void initializeBackground();
});

chrome.runtime.onMessage.addListener((request: BackgroundRequest, _sender, sendResponse) => {
  let task: Promise<BackgroundResponse>;
  switch (request.type) {
    case "VALIDATE_KEY": task = validateKey(request); break;
    case "CLUSTER_TABS": task = clusterTabs(request); break;
    case "SUGGEST_STRUCTURE": task = suggestStructure(request); break;
    case "PLAN_AGENT_ACTIONS": task = planAgentActions(request); break;
    case "M3_AGENT_TOOL": task = runCollaborationTool(request); break;
    case "M3_BRIDGE_CONNECT": task = connectAgentBridge().then((data) => ({ ok: true, data })); break;
    case "M3_BRIDGE_DISCONNECT": task = Promise.resolve({ ok: true, data: disconnectAgentBridge() }); break;
    case "M3_BRIDGE_STATUS": task = Promise.resolve({ ok: true, data: bridgeStatus }); break;
    case "M3_BRIDGE_ACTIVITY":
      task = loadAgentActivity().then((items) => ({
        ok: true,
        data: request.workspaceId ? items.filter((item) => item.workspaceId === request.workspaceId) : items
      }));
      break;
    case "M3_BRIDGE_CLEAR_ACTIVITY":
      task = clearAgentActivity(request.workspaceId).then((data) => ({ ok: true, data }));
      break;
    default: task = Promise.resolve({ ok: false, error: "Unknown request" });
  }
  task.then(sendResponse).catch(() => sendResponse({ ok: false, error: "Background request failed" }));
  return true;
});

async function initializeBackground(): Promise<void> {
  await initializeStorageAccess();
  try {
    const settings = await loadSettings();
    bridgeShouldReconnect = settings.agentBridgeEnabled;
    if (settings.agentBridgeEnabled) await connectAgentBridge();
  } catch {
    // The extension remains fully usable when the optional local bridge is unavailable.
  }
}

chrome.runtime.onStartup?.addListener(() => {
  void initializeBackground();
});

void initializeBackground();
