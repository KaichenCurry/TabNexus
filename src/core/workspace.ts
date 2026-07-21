import { defaultGroupName, defaultWorkspaceName, GROUP_COLORS, untitledWorkspaceName } from "./defaults";
import { createId } from "./id";
import { inferCardType, isSupportedUrl, normalizeUrl } from "./url";
import {
  SCHEMA_VERSION,
  type AppState,
  type Card,
  type CardStatus,
  type CardType,
  type Edge,
  type Locale,
  type OpenTab,
  type Workspace
} from "./types";

export function createEmptyWorkspace(locale: Locale, name = defaultWorkspaceName(locale)): Workspace {
  const now = new Date().toISOString();
  return {
    id: createId("ws"),
    name,
    createdAt: now,
    updatedAt: now,
    groupOrder: [],
    groups: {},
    cards: {},
    edges: []
  };
}

export function createInitialAppState(locale: Locale = "zh"): AppState {
  const workspace = createEmptyWorkspace(locale);
  return {
    schemaVersion: SCHEMA_VERSION,
    activeWorkspaceId: workspace.id,
    workspaceOrder: [workspace.id],
    workspaces: { [workspace.id]: workspace }
  };
}

export function addWorkspace(state: AppState, locale: Locale): AppState {
  const workspace = createEmptyWorkspace(locale, untitledWorkspaceName(locale));
  return {
    ...state,
    activeWorkspaceId: workspace.id,
    workspaceOrder: [...state.workspaceOrder, workspace.id],
    workspaces: { ...state.workspaces, [workspace.id]: workspace }
  };
}

export function removeWorkspace(state: AppState, workspaceId: string, locale: Locale): AppState {
  const workspaces = { ...state.workspaces };
  delete workspaces[workspaceId];
  let workspaceOrder = state.workspaceOrder.filter((id) => id !== workspaceId);
  if (workspaceOrder.length === 0) {
    const replacement = createEmptyWorkspace(locale);
    workspaces[replacement.id] = replacement;
    workspaceOrder = [replacement.id];
  }
  return {
    ...state,
    workspaces,
    workspaceOrder,
    activeWorkspaceId:
      state.activeWorkspaceId === workspaceId ? workspaceOrder[0] : state.activeWorkspaceId
  };
}

export function updateWorkspace(state: AppState, workspace: Workspace): AppState {
  return {
    ...state,
    workspaces: {
      ...state.workspaces,
      [workspace.id]: { ...workspace, updatedAt: new Date().toISOString() }
    }
  };
}

export function renameWorkspace(workspace: Workspace, name: string): Workspace {
  const trimmed = name.trim();
  return trimmed ? { ...workspace, name: trimmed } : workspace;
}

export function createGroup(workspace: Workspace, locale: Locale, name?: string): Workspace {
  const id = createId("group");
  const index = workspace.groupOrder.length % GROUP_COLORS.length;
  return {
    ...workspace,
    groupOrder: [...workspace.groupOrder, id],
    groups: {
      ...workspace.groups,
      [id]: {
        id,
        name: name?.trim() || defaultGroupName(locale),
        color: GROUP_COLORS[index],
        cardIds: []
      }
    }
  };
}

export function updateGroup(
  workspace: Workspace,
  groupId: string,
  patch: Partial<Pick<Workspace["groups"][string], "name" | "color">>
): Workspace {
  const group = workspace.groups[groupId];
  if (!group) return workspace;
  return {
    ...workspace,
    groups: {
      ...workspace.groups,
      [groupId]: { ...group, ...patch, name: patch.name?.trim() || group.name }
    }
  };
}

export function deleteGroup(workspace: Workspace, groupId: string): Workspace {
  if (!workspace.groups[groupId]) return workspace;
  const groups = { ...workspace.groups };
  delete groups[groupId];
  const cards = Object.fromEntries(
    Object.entries(workspace.cards).map(([id, card]) => [
      id,
      card.groupId === groupId ? { ...card, groupId: null } : card
    ])
  );
  return {
    ...workspace,
    groups,
    cards,
    groupOrder: workspace.groupOrder.filter((id) => id !== groupId)
  };
}

export function collectTabs(
  workspace: Workspace,
  tabs: OpenTab[],
  targetGroupId: string | null = null
): { workspace: Workspace; addedTabIds: number[]; duplicateTabIds: number[] } {
  const knownUrls = new Map(
    Object.values(workspace.cards).flatMap((card) =>
      card.url ? [[normalizeUrl(card.url), card.id] as const] : []
    )
  );
  const cards = { ...workspace.cards };
  const groups = Object.fromEntries(
    Object.entries(workspace.groups).map(([id, group]) => [id, { ...group, cardIds: [...group.cardIds] }])
  );
  const addedTabIds: number[] = [];
  const duplicateTabIds: number[] = [];

  for (const tab of tabs) {
    if (!tab.supported || !isSupportedUrl(tab.url)) continue;
    const normalized = normalizeUrl(tab.url);
    const existingCardId = knownUrls.get(normalized);
    if (existingCardId) {
      duplicateTabIds.push(tab.id);
      const existing = cards[existingCardId];
      if (existing && tab.lastAccessedAt && existing.lastAccessedAt !== tab.lastAccessedAt) {
        cards[existingCardId] = { ...existing, lastAccessedAt: tab.lastAccessedAt };
      }
      continue;
    }
    const savedAt = new Date().toISOString();
    const id = createId("card");
    knownUrls.set(normalized, id);
    const card: Card = {
      id,
      type: inferCardType(tab.url),
      title: tab.title.trim() || tab.url,
      url: tab.url,
      favicon: tab.favicon,
      note: "",
      status: "unread",
      groupId: targetGroupId,
      source: "user",
      savedAt,
      lastAccessedAt: tab.lastAccessedAt
    };
    cards[id] = card;
    if (targetGroupId && groups[targetGroupId]) groups[targetGroupId].cardIds.push(id);
    addedTabIds.push(tab.id);
  }

  return { workspace: { ...workspace, cards, groups }, addedTabIds, duplicateTabIds };
}

export function moveCard(workspace: Workspace, cardId: string, targetGroupId: string | null): Workspace {
  const card = workspace.cards[cardId];
  if (!card || card.groupId === targetGroupId || (targetGroupId && !workspace.groups[targetGroupId])) {
    return workspace;
  }
  const groups = Object.fromEntries(
    Object.entries(workspace.groups).map(([id, group]) => [
      id,
      { ...group, cardIds: group.cardIds.filter((id2) => id2 !== cardId) }
    ])
  );
  if (targetGroupId) groups[targetGroupId].cardIds.push(cardId);
  return {
    ...workspace,
    groups,
    cards: { ...workspace.cards, [cardId]: { ...card, groupId: targetGroupId } }
  };
}

export function updateCardNote(workspace: Workspace, cardId: string, note: string): Workspace {
  const card = workspace.cards[cardId];
  if (!card) return workspace;
  return { ...workspace, cards: { ...workspace.cards, [cardId]: { ...card, note } } };
}

export function updateCardStatus(workspace: Workspace, cardId: string, status: CardStatus): Workspace {
  const card = workspace.cards[cardId];
  if (!card || card.status === status) return workspace;
  return { ...workspace, cards: { ...workspace.cards, [cardId]: { ...card, status } } };
}

export function updateCardFlow(
  workspace: Workspace,
  cardId: string,
  flow: { x: number; y: number }
): Workspace {
  const card = workspace.cards[cardId];
  if (!card) return workspace;
  const clamped = {
    x: Math.max(-1_000_000, Math.min(1_000_000, Math.round(flow.x))),
    y: Math.max(-1_000_000, Math.min(1_000_000, Math.round(flow.y)))
  };
  return { ...workspace, cards: { ...workspace.cards, [cardId]: { ...card, flow: clamped, flowLayout: "mind" } } };
}

export function updateCardFlows(
  workspace: Workspace,
  flows: Record<string, { x: number; y: number }>
): Workspace {
  const cards = { ...workspace.cards };
  let changed = false;
  for (const [cardId, flow] of Object.entries(flows)) {
    const card = cards[cardId];
    if (!card) continue;
    cards[cardId] = {
      ...card,
      flowLayout: "mind",
      flow: {
        x: Math.max(-1_000_000, Math.min(1_000_000, Math.round(flow.x))),
        y: Math.max(-1_000_000, Math.min(1_000_000, Math.round(flow.y)))
      }
    };
    changed = true;
  }
  return changed ? { ...workspace, cards } : workspace;
}

export function upsertEdge(workspace: Workspace, edge: Edge): Workspace {
  if (
    edge.fromCardId === edge.toCardId ||
    !workspace.cards[edge.fromCardId] ||
    !workspace.cards[edge.toCardId]
  ) return workspace;
  const label = edge.label?.trim().slice(0, 40) || undefined;
  const existingIndex = workspace.edges.findIndex(
    (item) => item.fromCardId === edge.fromCardId && item.toCardId === edge.toCardId
  );
  if (existingIndex >= 0) {
    const edges = [...workspace.edges];
    edges[existingIndex] = { fromCardId: edge.fromCardId, toCardId: edge.toCardId, label };
    return { ...workspace, edges };
  }
  return { ...workspace, edges: [...workspace.edges, { fromCardId: edge.fromCardId, toCardId: edge.toCardId, label }] };
}

export function removeEdge(workspace: Workspace, fromCardId: string, toCardId: string): Workspace {
  return {
    ...workspace,
    edges: workspace.edges.filter(
      (edge) => edge.fromCardId !== fromCardId || edge.toCardId !== toCardId
    )
  };
}

export function addManualCard(
  workspace: Workspace,
  locale: Locale,
  input: { title: string; url?: string; note?: string; type?: CardType; groupId?: string }
): { workspace: Workspace; cardId?: string; duplicateCardId?: string } {
  const title = input.title.trim();
  const url = input.url?.trim() || undefined;
  if (!title) return { workspace };
  if (url) {
    const normalized = normalizeUrl(url);
    const duplicate = Object.values(workspace.cards).find(
      (card) => card.url && normalizeUrl(card.url) === normalized
    );
    if (duplicate) return { workspace, duplicateCardId: duplicate.id };
  }

  let nextWorkspace = workspace;
  let groupId = input.groupId && workspace.groups[input.groupId] ? input.groupId : workspace.groupOrder[0];
  if (!groupId) {
    nextWorkspace = createGroup(
      workspace,
      locale,
      locale === "zh" ? "手动资料" : "Manual sources"
    );
    groupId = nextWorkspace.groupOrder[0];
  }

  const id = createId("card");
  const card: Card = {
    id,
    type: url ? inferCardType(url) : input.type ?? "note",
    title,
    url,
    note: input.note?.trim() ?? "",
    status: "unread",
    groupId,
    source: "user",
    savedAt: new Date().toISOString()
  };
  const group = nextWorkspace.groups[groupId];
  return {
    cardId: id,
    workspace: {
      ...nextWorkspace,
      cards: { ...nextWorkspace.cards, [id]: card },
      groups: {
        ...nextWorkspace.groups,
        [groupId]: { ...group, cardIds: [...group.cardIds, id] }
      }
    }
  };
}

export function deleteCard(workspace: Workspace, cardId: string): Workspace {
  if (!workspace.cards[cardId]) return workspace;
  const cards = { ...workspace.cards };
  delete cards[cardId];
  const groups = Object.fromEntries(
    Object.entries(workspace.groups).map(([id, group]) => [
      id,
      { ...group, cardIds: group.cardIds.filter((id2) => id2 !== cardId) }
    ])
  );
  return {
    ...workspace,
    cards,
    groups,
    edges: workspace.edges.filter((edge) => edge.fromCardId !== cardId && edge.toCardId !== cardId)
  };
}

export function workspaceCardOrder(workspace: Workspace): Card[] {
  const ordered = workspace.groupOrder.flatMap((groupId) =>
    (workspace.groups[groupId]?.cardIds ?? [])
      .map((cardId) => workspace.cards[cardId])
      .filter((card): card is Card => Boolean(card))
  );
  const groupedIds = new Set(ordered.map((card) => card.id));
  const inbox = Object.values(workspace.cards).filter((card) => !groupedIds.has(card.id));
  return [...ordered, ...inbox];
}
