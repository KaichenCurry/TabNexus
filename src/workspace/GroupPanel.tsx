import type { Card, CardStatus, Group, Locale } from "../core/types";
import { normalizeUrl } from "../core/url";
import { message } from "../i18n";
import { CardRow } from "./CardRow";
import { readDragPayload } from "./drag";

export function GroupPanel({
  group,
  cards,
  totalCount = cards.length,
  locale,
  openUrls,
  onDropPayload,
  onOpenCard,
  onNoteCard,
  onDeleteCard,
  onStatusChange,
  onAddSource,
  onRename,
  onColor,
  onRestore,
  onDelete
}: {
  group: Group;
  cards: Card[];
  totalCount?: number;
  locale: Locale;
  openUrls: Set<string>;
  onDropPayload: (payload: ReturnType<typeof readDragPayload>) => void;
  onOpenCard: (card: Card) => void;
  onNoteCard: (card: Card) => void;
  onDeleteCard: (card: Card) => void;
  onStatusChange: (card: Card, status: CardStatus) => void;
  onAddSource: () => void;
  onRename?: () => void;
  onColor?: (color: string) => void;
  onRestore?: () => void;
  onDelete?: () => void;
}) {
  return (
    <section
      className={`group-panel ${cards.length === 0 ? "is-empty" : ""}`}
      data-drop-zone={group.id}
      style={{ "--group-color": group.color } as React.CSSProperties}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => {
        event.preventDefault();
        onDropPayload(readDragPayload(event));
      }}
    >
      <header className="group-header">
        <div className="group-heading">
          <h2>{group.name}</h2>
          <p>{message(locale, totalCount === cards.length ? "groupCardsSaved" : "groupCardsFiltered", {
            count: cards.length,
            visible: cards.length,
            total: totalCount
          })}</p>
        </div>
        <span className="group-count-chip">{totalCount === cards.length ? cards.length : `${cards.length}/${totalCount}`}</span>
        <div className="group-actions">
          <button
            type="button"
            className="group-quick-action"
            onClick={onRestore}
            disabled={cards.length === 0}
            title={message(locale, "openMissing")}
            aria-label={message(locale, "openMissing")}
          >↗</button>
          <details className="group-menu">
            <summary title={message(locale, "groupMenu")} aria-label={message(locale, "groupMenu")}>•••</summary>
            <div className="group-menu-popover">
              <label className="group-color-action">
                <span>{message(locale, "groupColor")}</span>
                <input
                  className="color-input"
                  type="color"
                  value={group.color}
                  onChange={(event) => onColor?.(event.target.value.toUpperCase())}
                  aria-label={message(locale, "groupColor")}
                />
              </label>
              <button type="button" onClick={onRename}><span>✎</span>{message(locale, "rename")}</button>
              <button type="button" className="danger" onClick={onDelete}><span>×</span>{message(locale, "delete")}</button>
            </div>
          </details>
        </div>
      </header>
      <div className="card-list">
        {cards.length ? (
          cards.map((card) => (
            <CardRow
              key={card.id}
              card={card}
              locale={locale}
              isOpen={Boolean(card.url && openUrls.has(normalizeUrl(card.url)))}
              onOpen={() => onOpenCard(card)}
              onNote={() => onNoteCard(card)}
              onDelete={() => onDeleteCard(card)}
              onStatusChange={(status) => onStatusChange(card, status)}
            />
          ))
        ) : (
          <div className="group-empty">{message(locale, totalCount > 0 ? "filterGroupEmpty" : "dropHere")}</div>
        )}
      </div>
      <button className="group-add-source" type="button" onClick={onAddSource}>
        <span aria-hidden="true">＋</span>{message(locale, "addSourceToGroup")}
      </button>
    </section>
  );
}
