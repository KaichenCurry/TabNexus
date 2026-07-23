export const SCHEMA_VERSION = 1 as const;

export type Locale = "zh" | "en";
export type CardType = "web" | "note" | "html" | "report" | "agent";
export type CardStatus = "unread" | "read" | "adopted";
export type CardSource = "user" | "ai" | "agent";
export type GroupingPolicy = "automatic" | "suggestion" | "domain";
export type WorkspaceView = "board" | "flow";
export type DeepSeekErrorCode =
  | "timeout"
  | "network"
  | "auth"
  | "balance"
  | "rate_limit"
  | "server"
  | "model"
  | "invalid_request"
  | "invalid_response"
  | "conflict"
  | "unknown";

export type Edge = {
  fromCardId: string;
  toCardId: string;
  label?: string;
};

export type Card = {
  id: string;
  type: CardType;
  title: string;
  url?: string;
  favicon?: string;
  note: string;
  status: CardStatus;
  groupId: string | null;
  source: CardSource;
  savedAt?: string;
  lastAccessedAt?: string;
  flow?: { x: number; y: number };
  flowLayout?: "mind";
};

export type Group = {
  id: string;
  name: string;
  color: string;
  cardIds: string[];
};

export type Workspace = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  groupOrder: string[];
  groups: Record<string, Group>;
  cards: Record<string, Card>;
  edges: Edge[];
};

export type WorkspaceIndexItem = {
  id: string;
  name: string;
  updatedAt: string;
  revision: string;
  groupCount: number;
  cardCount: number;
  edgeCount: number;
};

export type WorkspaceContextSummary = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  revision: string;
  groups: Array<{ id: string; name: string; color: string; cardIds: string[] }>;
  cards: Array<{
    id: string;
    type: CardType;
    title: string;
    url?: string;
    favicon?: string;
    status: CardStatus;
    groupId: string | null;
    source: CardSource;
    savedAt?: string;
    lastAccessedAt?: string;
    noteLength: number;
  }>;
  edges: Edge[];
};

export type BrowserTabContext = {
  tabId: number;
  windowId: number;
  title: string;
  url: string;
  favicon?: string;
  pinned: boolean;
  active: boolean;
  lastAccessedAt?: string;
  savedCardId?: string;
};

export type TabWorkbenchSelection = {
  tabIds: number[];
  cardIds: string[];
  updatedAt: string;
};

export type TabWorkbenchState = {
  schemaVersion: 1;
  selections: Record<string, TabWorkbenchSelection>;
};

export type TabWorkbenchContext = {
  revision: string;
  workspaceId: string;
  collapsed: boolean;
  selectedTabIds: number[];
  selectedCardIds: string[];
  counts: {
    open: number;
    unsavedOpen: number;
    savedOpen: number;
    savedClosed: number;
    recentlyClosed: number;
    unsupported: number;
    selected: number;
  };
  openTabs: BrowserTabContext[];
  savedClosedCards: Array<{
    cardId: string;
    title: string;
    url: string;
    favicon?: string;
    groupId: string | null;
    selected: boolean;
  }>;
  recentlyClosed: Array<RecentClosedTab>;
};

export type AppState = {
  schemaVersion: typeof SCHEMA_VERSION;
  activeWorkspaceId: string;
  workspaceOrder: string[];
  workspaces: Record<string, Workspace>;
};

export type Settings = {
  locale: Locale;
  closeAfterCollect: boolean;
  rightRailCollapsed: boolean;
  aiComposerCollapsed: boolean;
  workspaceView: WorkspaceView;
  aiEnabled: boolean;
  aiProvider: AiProviderId;
  aiProviderConfigs: Record<AiProviderId, AiProviderConfig>;
  /** Legacy DeepSeek fields are retained for a lossless settings migration. */
  deepSeekEnabled: boolean;
  deepSeekApiKey: string;
  deepSeekModel: "deepseek-v4-flash";
  deepSeekVerifiedAt: string;
  groupingPolicy: GroupingPolicy;
  agentBridgeEnabled: boolean;
  tutorialCompleted: boolean;
};

export type AgentSafePreferences = {
  locale: Locale;
  closeAfterCollect: boolean;
  rightRailCollapsed: boolean;
  aiComposerCollapsed: boolean;
  workspaceView: WorkspaceView;
  groupingPolicy: GroupingPolicy;
  aiEnabled: boolean;
  aiProvider: AiProviderId;
  providers: Record<AiProviderId, { configured: boolean; verified: boolean; model: string }>;
};

export type AiProviderId = "deepseek" | "openai" | "anthropic" | "kimi" | "qwen" | "minimax";

export type AiProviderConfig = {
  apiKey: string;
  model: string;
  verifiedAt: string;
};

export type RecentClosedTab = {
  id: string;
  title: string;
  url: string;
  favicon?: string;
  closedAt: string;
};

export type OpenTab = {
  id: number;
  windowId: number;
  title: string;
  url: string;
  favicon?: string;
  pinned: boolean;
  active: boolean;
  supported: boolean;
  lastAccessedAt?: string;
};

export type ProposalGroup = {
  id: string;
  name: string;
  color: string;
  isNew: boolean;
};

export type ProposalAssignment = {
  cardId: string;
  groupId: string;
  reason?: string;
};

export type GroupingProposal = {
  source: "ai" | "domain";
  groups: ProposalGroup[];
  assignments: ProposalAssignment[];
  summary?: string;
  basis?: string;
  instruction?: string;
  pruneEmptyGroups?: boolean;
};

export type GroupingRequest = {
  locale: Locale;
  instruction?: string;
  cards: Array<{
    id: string;
    title: string;
    url?: string;
    type: CardType;
    hostname?: string;
    savedAt?: string;
    lastAccessedAt?: string;
  }>;
  existingGroups: Array<{
    id: string;
    name: string;
    cards: Array<{
      id: string;
      title: string;
      url?: string;
      type: CardType;
      hostname?: string;
      savedAt?: string;
      lastAccessedAt?: string;
    }>;
  }>;
};

export type StructureRequest = {
  locale: Locale;
  cards: Array<{
    id: string;
    title: string;
    url?: string;
    groupId: string | null;
    groupName?: string;
  }>;
  existingEdges: Edge[];
};

export type StructureProposal = {
  source: "ai" | "local";
  edges: Edge[];
  summary?: string;
};

export type AgentScope = "workspace" | "selection";

export type AgentAction =
  | {
      type: "organize";
      cardIds: string[];
      tabIds: number[];
      instruction: string;
    }
  | { type: "rename_workspace"; name: string }
  | { type: "create_group"; groupId?: string; name: string; color?: string }
  | { type: "rename_group"; groupId: string; name: string }
  | {
      type: "move_sources";
      cardIds: string[];
      tabIds: number[];
      targetGroupId?: string | null;
      targetGroupName?: string;
    }
  | { type: "set_status"; cardIds: string[]; status: CardStatus }
  | { type: "save_tabs"; tabIds: number[]; targetGroupId?: string | null }
  | { type: "close_tabs"; tabIds: number[] }
  | { type: "reopen_cards"; cardIds: string[] }
  | { type: "suggest_structure" };

export type AgentPlan = {
  source: "ai";
  scope: AgentScope;
  summary: string;
  rationale?: string;
  actions: AgentAction[];
};

export type AgentCommandRequest = {
  locale: Locale;
  scope: AgentScope;
  instruction: string;
  workspace: { id: string; name: string };
  cards: Array<{
    id: string;
    title: string;
    url?: string;
    type: CardType;
    status: CardStatus;
    groupId: string | null;
    savedAt?: string;
    lastAccessedAt?: string;
  }>;
  groups: Array<{ id: string; name: string; cardIds: string[] }>;
  tabs: Array<{
    id: number;
    title: string;
    url: string;
    pinned: boolean;
    savedCardId?: string;
    lastAccessedAt?: string;
  }>;
};

export type CollaborationToolRequest =
  | {
      tool: "read_workspace";
      input?: {
        detail?: "summary" | "full";
        sinceRevision?: string;
        cardIds?: string[];
      };
    }
  | {
      tool: "search_cards";
      input: {
        query?: string;
        workspaceIds?: string[];
        groupIds?: string[];
        statuses?: CardStatus[];
        types?: CardType[];
        sources?: CardSource[];
        includeNotes?: boolean;
        limit?: number;
      };
    }
  | {
      tool: "add_card";
      input: {
        title: string;
        url?: string;
        note?: string;
        groupId?: string;
        expectedRevision?: string;
        operationId?: string;
      };
    }
  | {
      tool: "add_cards";
      input: {
        cards: Array<{
          title: string;
          url?: string;
          note?: string;
          type?: CardType;
          groupId?: string;
          status?: CardStatus;
        }>;
        expectedRevision: string;
        operationId: string;
      };
    }
  | {
      tool: "write_report";
      input: {
        title: string;
        content: string;
        url?: string;
        groupId?: string;
        expectedRevision?: string;
        operationId?: string;
      };
    }
  | {
      tool: "propose_structure";
      input: {
        summary?: string;
        edges: Array<{ fromCardId: string; toCardId: string; label?: string }>;
        expectedRevision?: string;
        operationId?: string;
      };
    }
  | {
      tool: "edit_workspace";
      input: {
        expectedRevision: string;
        operationId: string;
        actions: WorkspaceEditAction[];
      };
    }
  | {
      tool: "manage_workspaces";
      input: {
        expectedStateRevision: string;
        operationId: string;
        actions: WorkspaceManagementAction[];
      };
    }
  | {
      tool: "delete_workspace_items";
      input: {
        expectedRevision: string;
        expectedStateRevision?: string;
        operationId: string;
        groupIds?: string[];
        cardIds?: string[];
        deleteWorkspace?: boolean;
        confirm: true;
        confirmationText: string;
      };
    }
  | {
      tool: "read_tab_workbench";
      input?: { sinceRevision?: string };
    }
  | {
      tool: "manage_tab_workbench";
      input: {
        expectedRevision: string;
        operationId: string;
        actions: Array<
          | { type: "set_selection"; mode?: "replace" | "add" | "remove" | "toggle"; tabIds?: number[]; cardIds?: string[] }
          | { type: "select_all"; scope?: "all" | "open" | "unsaved_open" | "saved_open" | "saved_closed"; includePinned?: boolean }
          | { type: "clear_selection" }
          | { type: "set_collapsed"; collapsed: boolean }
          | { type: "focus_tab"; tabId: number }
          | { type: "reopen_recent"; recentIds: string[] }
        >;
      };
    }
  | {
      tool: "dismiss_recent_tabs";
      input: {
        expectedRevision: string;
        operationId: string;
        recentIds: string[];
        confirm: true;
        confirmationText: string;
      };
    }
  | {
      tool: "sync_browser_tabs";
      input: {
        action: "save_tabs" | "open_cards" | "focus_card" | "open_group" | "open_workspace";
        scope?: "explicit" | "workbench_selection" | "current_window";
        expectedWorkbenchRevision?: string;
        expectedRevision: string;
        operationId: string;
        tabIds?: number[];
        cardIds?: string[];
        cardId?: string;
        groupId?: string;
        includePinned?: boolean;
      };
    }
  | {
      tool: "close_browser_tabs";
      input: {
        tabIds?: number[];
        scope?: "explicit" | "workbench_selection" | "current_window";
        expectedWorkbenchRevision?: string;
        saveBeforeClose?: boolean;
        groupId?: string;
        expectedRevision: string;
        operationId: string;
        confirm: true;
        confirmationText: string;
      };
    }
  | {
      tool: "export_workspace";
      input?: { format?: "markdown" | "json" };
    }
  | {
      tool: "manage_preferences";
      input: {
        action: "read" | "update";
        expectedRevision?: string;
        operationId?: string;
        preferences?: Partial<Pick<AgentSafePreferences,
          "locale" | "closeAfterCollect" | "rightRailCollapsed" | "aiComposerCollapsed" | "workspaceView" | "groupingPolicy" | "aiEnabled" | "aiProvider"
        >>;
      };
    }
  | {
      tool: "manage_agent_activity";
      input: {
        action: "read" | "clear";
        expectedRevision?: string;
        operationId?: string;
        confirm?: true;
        confirmationText?: string;
      };
    };

export type WorkspaceEditAction =
  | { type: "rename_workspace"; name: string }
  | { type: "create_group"; groupId?: string; name: string; color?: string }
  | { type: "rename_group"; groupId: string; name: string; color?: string }
  | { type: "move_cards"; cardIds: string[]; targetGroupId: string | null; position?: number }
  | { type: "update_card"; cardId: string; title?: string; url?: string | null; note?: string; status?: CardStatus; cardType?: CardType }
  | { type: "reorder_groups"; groupIds: string[] }
  | { type: "reorder_cards"; groupId: string; cardIds: string[] }
  | { type: "position_cards"; positions: Array<{ cardId: string; x: number; y: number }> }
  | { type: "reset_card_positions"; cardIds: string[] }
  | { type: "upsert_edges"; edges: Edge[] }
  | { type: "remove_edges"; edges: Array<Pick<Edge, "fromCardId" | "toCardId">> };

export type WorkspaceManagementAction =
  | { type: "create_workspace"; workspaceId?: string; name: string; makeActive?: boolean }
  | { type: "set_active_workspace"; workspaceId: string }
  | { type: "rename_workspace"; workspaceId: string; name: string }
  | { type: "reorder_workspaces"; workspaceIds: string[] }
  | { type: "duplicate_workspace"; workspaceId: string; name?: string; makeActive?: boolean };

export type CollaborationToolResult =
  | {
      tool: "read_workspace";
      revision: string;
      unchanged: boolean;
      detail: "summary" | "full";
      summary?: WorkspaceContextSummary;
      workspace?: Workspace;
      activeWorkspaceId?: string;
      stateRevision?: string;
      workspaceIndex?: WorkspaceIndexItem[];
      browserRevision?: string;
      browserTabs?: BrowserTabContext[];
    }
  | {
      tool: "search_cards";
      revision: string;
      total: number;
      matches: Array<{
        workspaceId: string;
        workspaceName: string;
        groupId: string | null;
        groupName?: string;
        card: Omit<Card, "note"> & { note?: string; noteLength: number };
      }>;
    }
  | { tool: "add_card"; revision: string; cardId?: string; duplicateCardId?: string; operationId?: string }
  | { tool: "add_cards"; revision: string; addedCardIds: string[]; duplicateCardIds: string[]; operationId: string }
  | { tool: "write_report"; revision: string; cardId?: string; duplicateCardId?: string; operationId?: string }
  | { tool: "propose_structure"; revision: string; proposal: StructureProposal; operationId?: string }
  | { tool: "edit_workspace"; revision: string; changed: boolean; changes: string[]; createdGroupIds: string[]; operationId: string }
  | {
      tool: "manage_workspaces";
      revision: string;
      stateRevision: string;
      activeWorkspaceId: string;
      createdWorkspaceIds: string[];
      workspaceIndex: WorkspaceIndexItem[];
      operationId: string;
    }
  | {
      tool: "delete_workspace_items";
      revision: string;
      stateRevision: string;
      activeWorkspaceId: string;
      deletedWorkspaceId?: string;
      deletedGroupIds: string[];
      deletedCardIds: string[];
      operationId: string;
    }
  | {
      tool: "read_tab_workbench";
      revision: string;
      unchanged: boolean;
      workbench?: TabWorkbenchContext;
    }
  | {
      tool: "manage_tab_workbench";
      revision: string;
      workbench: TabWorkbenchContext;
      reopenedRecentIds: string[];
      failedRecentIds: string[];
      focusedTabId?: number;
      operationId: string;
    }
  | {
      tool: "dismiss_recent_tabs";
      revision: string;
      workbench: TabWorkbenchContext;
      dismissedRecentIds: string[];
      missingRecentIds: string[];
      operationId: string;
    }
  | {
      tool: "sync_browser_tabs";
      revision: string;
      action: "save_tabs" | "open_cards" | "focus_card" | "open_group" | "open_workspace";
      savedCardIds: string[];
      duplicateCardIds: string[];
      opened: number;
      existing: number;
      failed: number;
      fileAccessRequired: boolean;
      focusedCardId?: string;
      workbenchRevision?: string;
      usedWorkbenchSelection?: boolean;
      operationId: string;
    }
  | {
      tool: "close_browser_tabs";
      revision: string;
      savedCardIds: string[];
      duplicateCardIds: string[];
      closedTabIds: number[];
      skippedPinnedTabIds: number[];
      missingTabIds: number[];
      workbenchRevision?: string;
      usedWorkbenchSelection?: boolean;
      operationId: string;
    }
  | {
      tool: "export_workspace";
      revision: string;
      format: "markdown" | "json";
      filename: string;
      content: string;
    }
  | {
      tool: "manage_preferences";
      revision: string;
      changed: boolean;
      preferences: AgentSafePreferences;
      operationId?: string;
    }
  | {
      tool: "manage_agent_activity";
      revision: string;
      action: "read" | "clear";
      activities: Array<{
        id: string;
        workspaceId: string;
        agentName?: string;
        tool: CollaborationToolRequest["tool"];
        status: "running" | "success" | "error";
        createdAt: string;
        completedAt?: string;
        summary: string;
        error?: string;
      }>;
      cleared: number;
      operationId?: string;
    };

export type AgentActivity = {
  id: string;
  workspaceId: string;
  agentName?: string;
  tool: CollaborationToolRequest["tool"];
  status: "running" | "success" | "error";
  createdAt: string;
  completedAt?: string;
  summary: string;
  error?: string;
  proposal?: StructureProposal;
  result?: CollaborationToolResult;
};

export type AgentOperationReceipt = {
  id: string;
  workspaceId: string;
  operationId: string;
  completedAt: string;
  result: CollaborationToolResult;
};

export type BridgeConnectionStatus = {
  state: "disconnected" | "connecting" | "connected" | "error";
  transport: "agent_websocket";
  endpoint: string;
  agentName?: string;
  agentNames?: string[];
  agentCount?: number;
  hostVersion?: string;
  error?: "agent_offline" | "port_conflict" | "host_disconnected" | "unsupported" | "unknown";
};

export type BackgroundRequest =
  | {
      type: "VALIDATE_KEY";
      provider: AiProviderId;
      apiKey: string;
      model: string;
    }
  | {
      type: "CLUSTER_TABS";
      provider: AiProviderId;
      apiKey: string;
      model: string;
      payload: GroupingRequest;
    }
  | {
      type: "SUGGEST_STRUCTURE";
      provider: AiProviderId;
      apiKey: string;
      model: string;
      payload: StructureRequest;
    }
  | {
      type: "PLAN_AGENT_ACTIONS";
      provider: AiProviderId;
      apiKey: string;
      model: string;
      payload: AgentCommandRequest;
    }
  | {
      type: "M3_AGENT_TOOL";
      workspaceId?: string;
      payload: CollaborationToolRequest;
    }
  | { type: "M3_BRIDGE_CONNECT" }
  | { type: "M3_BRIDGE_DISCONNECT" }
  | { type: "M3_BRIDGE_STATUS" }
  | { type: "M3_BRIDGE_ACTIVITY"; workspaceId?: string }
  | { type: "M3_BRIDGE_CLEAR_ACTIVITY"; workspaceId?: string };

export type BackgroundResponse<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: DeepSeekErrorCode; retryable?: boolean };

export type RestoreResult = {
  restored: number;
  existing: number;
  failed: number;
  fileAccessRequired: boolean;
};

export type UndoSnapshot = {
  workspaceId: string;
  workspace: Workspace;
  createdAt: string;
  kind?: "grouping" | "structure" | "agent";
};
