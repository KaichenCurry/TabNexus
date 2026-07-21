import { normalizeUrl } from "./url";
import type {
  BrowserTabContext,
  RecentClosedTab,
  TabWorkbenchContext,
  TabWorkbenchSelection,
  Workspace
} from "./types";

function hashContext(prefix: string, value: unknown): string {
  let hash = 0x811c9dc5;
  for (const character of JSON.stringify(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${prefix}_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function buildTabWorkbenchContext({
  workspace,
  browserTabs,
  recentlyClosed,
  selection,
  collapsed,
  unsupportedCount = 0
}: {
  workspace: Workspace;
  browserTabs: BrowserTabContext[];
  recentlyClosed: RecentClosedTab[];
  selection?: TabWorkbenchSelection;
  collapsed: boolean;
  unsupportedCount?: number;
}): TabWorkbenchContext {
  const openUrls = new Set(browserTabs.map((tab) => normalizeUrl(tab.url)));
  const cardsByUrl = new Map(Object.values(workspace.cards).flatMap((card) =>
    card.url ? [[normalizeUrl(card.url), card] as const] : []
  ));
  const enrichedTabs = browserTabs.map((tab) => ({
    ...tab,
    savedCardId: tab.savedCardId ?? cardsByUrl.get(normalizeUrl(tab.url))?.id
  }));
  const validTabIds = new Set(enrichedTabs.map((tab) => tab.tabId));
  const selectedTabIds = [...new Set(selection?.tabIds ?? [])].filter((id) => validTabIds.has(id));
  const validCardIds = new Set(Object.values(workspace.cards).flatMap((card) => card.url ? [card.id] : []));
  const selectedCardIds = [...new Set(selection?.cardIds ?? [])].filter((id) => validCardIds.has(id));
  const savedClosedCards = Object.values(workspace.cards).flatMap((card) => {
    if (!card.url || openUrls.has(normalizeUrl(card.url))) return [];
    return [{
      cardId: card.id,
      title: card.title,
      url: card.url,
      favicon: card.favicon,
      groupId: card.groupId,
      selected: selectedCardIds.includes(card.id)
    }];
  });
  const visibleRecentlyClosed = recentlyClosed.filter((item) => {
    const normalized = normalizeUrl(item.url);
    return !openUrls.has(normalized) && !cardsByUrl.has(normalized);
  });
  const selectedOpenRows = enrichedTabs.filter((tab) =>
    selectedTabIds.includes(tab.tabId) || Boolean(tab.savedCardId && selectedCardIds.includes(tab.savedCardId))
  ).length;
  const selectedOpenCardIds = new Set(enrichedTabs.flatMap((tab) => tab.savedCardId ? [tab.savedCardId] : []));
  const selectedClosedRows = selectedCardIds.filter((cardId) => !selectedOpenCardIds.has(cardId)).length;
  const revisionPayload = {
    workspaceId: workspace.id,
    collapsed,
    selectedTabIds,
    selectedCardIds,
    openTabs: enrichedTabs,
    savedClosedCards,
    recentlyClosed: visibleRecentlyClosed
  };
  return {
    revision: hashContext("railr", revisionPayload),
    workspaceId: workspace.id,
    collapsed,
    selectedTabIds,
    selectedCardIds,
    counts: {
      open: enrichedTabs.length,
      unsavedOpen: enrichedTabs.filter((tab) => !tab.savedCardId).length,
      savedOpen: enrichedTabs.filter((tab) => tab.savedCardId).length,
      savedClosed: savedClosedCards.length,
      recentlyClosed: visibleRecentlyClosed.length,
      unsupported: unsupportedCount,
      selected: selectedOpenRows + selectedClosedRows
    },
    openTabs: enrichedTabs,
    savedClosedCards,
    recentlyClosed: visibleRecentlyClosed
  };
}

export function selectionForWorkbenchScope(
  context: TabWorkbenchContext,
  scope: "all" | "open" | "unsaved_open" | "saved_open" | "saved_closed" = "all",
  includePinned = false
): Pick<TabWorkbenchSelection, "tabIds" | "cardIds"> {
  const open = context.openTabs.filter((tab) => {
    if (!includePinned && tab.pinned) return false;
    if (scope === "unsaved_open") return !tab.savedCardId;
    if (scope === "saved_open") return Boolean(tab.savedCardId);
    return scope === "all" || scope === "open";
  });
  const includeClosed = scope === "all" || scope === "saved_closed";
  return {
    tabIds: open.map((tab) => tab.tabId),
    cardIds: [
      ...open.flatMap((tab) => tab.savedCardId ? [tab.savedCardId] : []),
      ...(includeClosed ? context.savedClosedCards.map((card) => card.cardId) : [])
    ]
  };
}
