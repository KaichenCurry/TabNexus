import { useEffect, useMemo, useState } from "react";
import { displayDomain, normalizeUrl } from "../core/url";
import type { Card, Locale, OpenTab, RecentClosedTab, TabWorkbenchSelection, Workspace } from "../core/types";
import { message } from "../i18n";
import { setDragPayload } from "./drag";

export type SelectionPayload = {
  tabs: OpenTab[];
  cards: Card[];
};

type RailItem = {
  key: string;
  title: string;
  url: string;
  favicon?: string;
  tab?: OpenTab;
  card?: Card;
};

export function OpenTabsRail({
  tabs,
  workspace,
  locale,
  aiLoading,
  aiEnabled = false,
  onSaveSelected,
  onOrganizeSelected,
  onCloseSelected,
  onReopenSelected,
  recentlyClosed = [],
  onReopenRecent,
  onDismissRecent,
  onSelectionChange,
  selection,
  onSelectionStateChange,
  unsupportedCount,
  collapsed = false,
  onCollapsedChange
}: {
  tabs: OpenTab[];
  workspace: Workspace;
  locale: Locale;
  aiLoading: boolean;
  aiEnabled?: boolean;
  onSaveSelected: (payload: SelectionPayload) => Promise<void | boolean>;
  onOrganizeSelected: (payload: SelectionPayload) => Promise<void | boolean>;
  onCloseSelected: (payload: SelectionPayload) => Promise<void | boolean>;
  onReopenSelected: (payload: SelectionPayload) => Promise<void | boolean>;
  recentlyClosed?: RecentClosedTab[];
  onReopenRecent?: (item: RecentClosedTab) => void | Promise<void>;
  onDismissRecent?: (item: RecentClosedTab) => void | Promise<void>;
  onSelectionChange?: (payload: SelectionPayload) => void;
  selection?: Pick<TabWorkbenchSelection, "tabIds" | "cardIds">;
  onSelectionStateChange?: (selection: Pick<TabWorkbenchSelection, "tabIds" | "cardIds">) => void;
  unsupportedCount: number;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}) {
  const [busyAction, setBusyAction] = useState<"save" | "organize" | "close" | "reopen" | null>(null);
  const [internalSelection, setInternalSelection] = useState<Pick<TabWorkbenchSelection, "tabIds" | "cardIds">>({ tabIds: [], cardIds: [] });
  const effectiveSelection = selection ?? internalSelection;
  const commitSelection = (next: Pick<TabWorkbenchSelection, "tabIds" | "cardIds">) => {
    if (onSelectionStateChange) onSelectionStateChange(next);
    else setInternalSelection(next);
  };
  const t = (key: Parameters<typeof message>[1], vars?: Record<string, string | number>) =>
    message(locale, key, vars);

  const visibleTabs = useMemo(() => tabs.filter((tab) => tab.supported), [tabs]);
  const cardsByUrl = useMemo(() => new Map(
    Object.values(workspace.cards).flatMap((card) => card.url ? [[normalizeUrl(card.url), card] as const] : [])
  ), [workspace.cards]);
  const openUrls = useMemo(
    () => new Set(visibleTabs.map((tab) => normalizeUrl(tab.url))),
    [visibleTabs]
  );
  const openItems = useMemo<RailItem[]>(() => visibleTabs.map((tab) => {
    const card = cardsByUrl.get(normalizeUrl(tab.url));
    return {
      key: `tab:${tab.id}`,
      title: card?.title ?? tab.title,
      url: tab.url,
      favicon: card?.favicon ?? tab.favicon,
      tab,
      card
    };
  }), [cardsByUrl, visibleTabs]);
  const missingItems = useMemo<RailItem[]>(() => Object.values(workspace.cards)
    .filter((card) => card.url && !openUrls.has(normalizeUrl(card.url)))
    .map((card) => ({
      key: `card:${card.id}`,
      title: card.title,
      url: card.url!,
      favicon: card.favicon,
      card
    })), [openUrls, workspace.cards]);
  const allItems = useMemo(() => [...openItems, ...missingItems], [missingItems, openItems]);
  const selectedTabIdSet = useMemo(() => new Set(effectiveSelection.tabIds), [effectiveSelection.tabIds]);
  const selectedCardIdSet = useMemo(() => new Set(effectiveSelection.cardIds), [effectiveSelection.cardIds]);
  const isSelected = (item: RailItem) => Boolean(
    (item.tab && selectedTabIdSet.has(item.tab.id)) ||
    (item.card && selectedCardIdSet.has(item.card.id))
  );
  const visibleRecentlyClosed = useMemo(() => recentlyClosed.filter((item) => {
    const normalized = normalizeUrl(item.url);
    return !openUrls.has(normalized) && !cardsByUrl.has(normalized);
  }), [cardsByUrl, openUrls, recentlyClosed]);

  useEffect(() => {
    const validTabIds = new Set(openItems.flatMap((item) => item.tab ? [item.tab.id] : []));
    const validCardIds = new Set(Object.keys(workspace.cards));
    const tabIds = [...selectedTabIdSet].filter((id) => validTabIds.has(id));
    const cardIds = [...selectedCardIdSet].filter((id) => validCardIds.has(id));
    if (tabIds.length === selectedTabIdSet.size && cardIds.length === selectedCardIdSet.size) return;
    commitSelection({ tabIds, cardIds });
  }, [onSelectionStateChange, openItems, selectedCardIdSet, selectedTabIdSet, workspace.cards]);

  const selectedItems = useMemo(
    () => allItems.filter(isSelected),
    [allItems, selectedCardIdSet, selectedTabIdSet]
  );
  const selectedTabs = useMemo(
    () => selectedItems.flatMap((item) => item.tab ? [item.tab] : []),
    [selectedItems]
  );
  const selectedCards = useMemo(() => [...new Map(
    selectedItems.flatMap((item) => item.card ? [[item.card.id, item.card] as const] : [])
  ).values()], [selectedItems]);
  const selectedPayload = useMemo<SelectionPayload>(
    () => ({ tabs: selectedTabs, cards: selectedCards }),
    [selectedCards, selectedTabs]
  );

  useEffect(() => onSelectionChange?.(selectedPayload), [onSelectionChange, selectedPayload]);
  const saveableTabs = selectedTabs.filter((tab) => !cardsByUrl.has(normalizeUrl(tab.url)));
  const closeableTabs = selectedTabs.filter((tab) => !tab.pinned);
  const reopenableCards = selectedItems.flatMap((item) => !item.tab && item.card ? [item.card] : []);
  const organizeCount = new Set([
    ...selectedTabs.map((tab) => normalizeUrl(tab.url)),
    ...selectedCards.flatMap((card) => card.url ? [normalizeUrl(card.url)] : [])
  ]).size;
  const bulkSelectableItems = allItems.filter((item) => !item.tab?.pinned);
  const allBulkSelected = bulkSelectableItems.length > 0 && bulkSelectableItems.every(isSelected);
  const unsavedOpenCount = openItems.filter((item) => !item.card).length;

  const runAction = async (
    action: "save" | "organize" | "close" | "reopen",
    handler: (payload: SelectionPayload) => Promise<void | boolean>
  ) => {
    setBusyAction(action);
    try {
      const completed = await handler(selectedPayload);
      if (completed !== false) commitSelection({ tabIds: [], cardIds: [] });
    } finally {
      setBusyAction(null);
    }
  };
  const setItemsSelected = (items: RailItem[]) => {
    commitSelection({
      tabIds: [...new Set(items.flatMap((item) => item.tab ? [item.tab.id] : []))],
      cardIds: [...new Set(items.flatMap((item) => item.card ? [item.card.id] : []))]
    });
  };
  const toggleItem = (item: RailItem) => {
    const tabIds = new Set(selectedTabIdSet);
    const cardIds = new Set(selectedCardIdSet);
    if (isSelected(item)) {
      if (item.tab) tabIds.delete(item.tab.id);
      if (item.card) cardIds.delete(item.card.id);
    } else {
      if (item.tab) tabIds.add(item.tab.id);
      if (item.card) cardIds.add(item.card.id);
    }
    commitSelection({ tabIds: [...tabIds], cardIds: [...cardIds] });
  };

  const renderItem = (item: RailItem) => {
    const selected = isSelected(item);
    const saved = Boolean(item.card);
    const missing = !item.tab && saved;
    const groupName = item.card?.groupId ? workspace.groups[item.card.groupId]?.name : undefined;
    const status = !saved
      ? t("notSaved")
      : missing
        ? groupName ? t("closedInGroup", { group: groupName }) : t("closedUngrouped")
        : groupName ? t("savedInGroup", { group: groupName }) : t("savedUngrouped");
    const dragPayload = item.card
      ? { kind: "card" as const, cardId: item.card.id }
      : item.tab
        ? { kind: "open-tab" as const, tabId: item.tab.id }
        : null;
    const draggable = Boolean(dragPayload);
    return (
      <article
        key={item.key}
        className={`open-tab rail-select-item ${item.tab?.pinned ? "is-pinned" : ""} ${saved ? "is-saved" : ""} ${missing ? "is-missing" : ""} ${selected ? "is-selected" : ""}`}
        draggable={draggable}
        aria-selected={selected}
        onDragStart={dragPayload ? (event) => setDragPayload(event, dragPayload) : undefined}
      >
        <label className="rail-checkbox">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => toggleItem(item)}
            aria-label={t("selectTab", { title: item.title })}
          />
          <span />
        </label>
        {item.favicon ? (
          <img className="favicon" src={item.favicon} alt="" />
        ) : (
          <span className="favicon fallback">{item.title.slice(0, 1).toUpperCase()}</span>
        )}
        <span className="open-tab-copy">
          <span className="open-tab-title">{item.title}</span>
          <span className="open-tab-domain">{displayDomain(item.url)}</span>
          <span className={`rail-item-status ${missing ? "missing" : saved ? "saved" : "unsaved"}`}>{status}</span>
        </span>
        {item.tab?.pinned && <span className="micro-chip">{t("pinned")}</span>}
      </article>
    );
  };

  if (collapsed) {
    return (
      <aside className="tabs-rail is-collapsed" aria-label={t("tabWorkbench")}>
        <button
          type="button"
          className="rail-collapse-button expand"
          onClick={() => onCollapsedChange?.(false)}
          aria-label={t("expandTabWorkbench")}
          title={t("expandTabWorkbench")}
        >
          <span aria-hidden="true">‹</span>
        </button>
        <div className="collapsed-rail-summary" aria-hidden="true">
          <span className="collapsed-rail-icon">▤</span>
          <strong>{visibleTabs.length}</strong>
          <span className="collapsed-rail-label">TABS</span>
          {unsavedOpenCount > 0 && <i className="collapsed-status-dot unsaved" title={t("notSaved")} />}
          {missingItems.length > 0 && <i className="collapsed-status-dot missing" title={t("closedSavedSection")} />}
          {visibleRecentlyClosed.length > 0 && <i className="collapsed-status-dot recent" title={t("recentlyClosedSection")} />}
        </div>
      </aside>
    );
  }

  return (
    <aside className="tabs-rail">
      <header className="rail-header">
        <div className="rail-title-copy">
          <span className="rail-eyebrow">{t("currentWindow")}</span>
          <h2>{t("tabWorkbench")}</h2>
          <p>{t("tabWorkbenchHint")}</p>
        </div>
        <div className="rail-header-actions">
          <span className="rail-tab-count"><strong>{visibleTabs.length}</strong>{t("openNowShort")}</span>
          <button
            type="button"
            className="rail-collapse-button"
            onClick={() => onCollapsedChange?.(true)}
            aria-label={t("collapseTabWorkbench")}
            title={t("collapseTabWorkbench")}
          >
            <span aria-hidden="true">›</span>
          </button>
        </div>
      </header>

      <section className="selection-console" aria-label={t("selectionActions")}>
        <div className="selection-console-head">
          <strong>{t("selectedCount", { count: selectedItems.length })}</strong>
          <button
            type="button"
            className={`master-select-button ${allBulkSelected ? "active" : ""}`}
            disabled={bulkSelectableItems.length === 0}
            aria-label={allBulkSelected ? t("clearSelection") : t("selectAll")}
            onClick={() => allBulkSelected ? onSelectionStateChange?.({ tabIds: [], cardIds: [] }) : setItemsSelected(bulkSelectableItems)}
          >
            <span className="master-checkbox" aria-hidden="true"><i /></span>
            <span>{allBulkSelected ? t("clearSelection") : t("selectAll")}</span>
            <em>{bulkSelectableItems.length}</em>
          </button>
        </div>
        <div className="selection-actions-grid">
          <button
            type="button"
            className="selection-action save"
            disabled={saveableTabs.length === 0 || busyAction !== null}
            onClick={() => void runAction("save", onSaveSelected)}
          ><span>↓</span><strong>{t("saveSelected", { count: saveableTabs.length })}</strong></button>
          <button
            type="button"
            className="selection-action ai"
            disabled={organizeCount === 0 || busyAction !== null || aiLoading}
            onClick={() => void runAction("organize", onOrganizeSelected)}
          ><span>✦</span><strong>{aiLoading ? t("aiLoadingShort") : t(aiEnabled ? "organizeSelected" : "localOrganizeSelected", { count: organizeCount })}</strong></button>
          <button
            type="button"
            className="selection-action close-tabs"
            disabled={closeableTabs.length === 0 || busyAction !== null}
            onClick={() => void runAction("close", onCloseSelected)}
          ><span>−</span><strong>{saveableTabs.length ? t("saveCloseSelected", { count: closeableTabs.length }) : t("closeSelected", { count: closeableTabs.length })}</strong></button>
          <button
            type="button"
            className="selection-action reopen"
            disabled={reopenableCards.length === 0 || busyAction !== null}
            onClick={() => void runAction("reopen", onReopenSelected)}
          ><span>↗</span><strong>{t("reopenSelected", { count: reopenableCards.length })}</strong></button>
        </div>
        <p className="selection-hint">{selectedItems.length ? t("selectionHint") : t("selectTabsFirst")}</p>
        <p className={`selection-mode-hint ${aiEnabled ? "connected" : "local"}`}><i />{t(aiEnabled ? "aiSelectionHint" : "localSelectionHint")}</p>
      </section>

      <div className="tab-list workbench-list">
        <div className="rail-section-heading">
          <span>{t("currentOpenSection")}</span>
          <strong>{openItems.length}</strong>
        </div>
        {openItems.length ? openItems.map(renderItem) : <div className="rail-empty compact">{t("noOpenTabs")}</div>}
        {missingItems.length > 0 && (
          <>
            <div className="rail-section-heading closed-heading">
              <span>{t("closedSavedSection")}</span>
              <strong>{missingItems.length}</strong>
            </div>
            {missingItems.map(renderItem)}
          </>
        )}
        {visibleRecentlyClosed.length > 0 && (
          <>
            <div className="rail-section-heading recent-heading">
              <span>{t("recentlyClosedSection")}</span>
              <strong>{visibleRecentlyClosed.length}</strong>
            </div>
            <p className="recently-closed-hint">{t("recentlyClosedHint")}</p>
            {visibleRecentlyClosed.map((item) => (
              <article className="open-tab recent-closed-item" key={item.id} draggable={false}>
                {item.favicon ? <img className="favicon" src={item.favicon} alt="" /> : <span className="favicon recent-fallback">×</span>}
                <span className="open-tab-copy">
                  <span className="open-tab-title">{item.title}</span>
                  <span className="open-tab-domain">{displayDomain(item.url)}</span>
                </span>
                <span className="recent-item-actions">
                  <button type="button" onClick={() => void onReopenRecent?.(item)} title={t("reopenRecent")} aria-label={t("reopenRecent")}>↗</button>
                  <button type="button" onClick={() => void onDismissRecent?.(item)} title={t("dismissRecent")} aria-label={t("dismissRecent")}>×</button>
                </span>
              </article>
            ))}
          </>
        )}
      </div>
      <p className="pinned-safety">⌖ {t("pinnedSelectionHint")}</p>
      {unsupportedCount > 0 && (
        <p className="unsupported-note">{unsupportedCount} {t("unsupportedTabs")}</p>
      )}
    </aside>
  );
}
