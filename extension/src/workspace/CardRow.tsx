import { displayDomain } from "../core/url";
import type { Card, CardStatus, Locale } from "../core/types";
import { message } from "../i18n";
import { setDragPayload } from "./drag";
import { CardStatusButton } from "./CardStatusButton";

export function CardRow({
  card,
  locale,
  isOpen,
  onOpen,
  onNote,
  onDelete,
  onStatusChange
}: {
  card: Card;
  locale: Locale;
  isOpen: boolean;
  onOpen: () => void;
  onNote: () => void;
  onDelete: () => void;
  onStatusChange: (status: CardStatus) => void;
}) {
  return (
    <article
      className={`card-row ${card.url ? (isOpen ? "is-open" : "is-missing") : "is-note"} ${card.favicon ? "has-favicon" : ""}`}
      draggable
      onDragStart={(event) => setDragPayload(event, { kind: "card", cardId: card.id })}
    >
      <div className="card-head">
        {card.favicon && <img className="favicon" src={card.favicon} alt="" />}
        <div className="card-main">
          <span className="card-title">{card.title}</span>
          <span className="card-domain">{displayDomain(card.url)}</span>
        </div>
        {card.url && (
          <button
            type="button"
            className="card-open-button"
            onClick={(event) => { event.stopPropagation(); onOpen(); }}
            title={isOpen ? message(locale, "open") : message(locale, "restore")}
            aria-label={isOpen ? message(locale, "open") : message(locale, "restore")}
          >↗</button>
        )}
        <div className="card-actions">
          <button type="button" className="card-action-button" onClick={onNote} title={message(locale, "note")} aria-label={message(locale, "note")}>✎</button>
          <button type="button" className="card-action-button danger" onClick={onDelete} title={message(locale, "removeFromWorkspace")} aria-label={message(locale, "removeFromWorkspace")}>×</button>
        </div>
      </div>
      {card.note && <p className="card-note-preview">{card.note}</p>}
      <footer className="card-footer">
        <CardStatusButton status={card.status} locale={locale} onChange={onStatusChange} />
        {card.url && (
          <span className={`card-open-state ${isOpen ? "open" : "missing"}`}>
            <i /> {isOpen ? message(locale, "openInBrowserShort") : message(locale, "readyToReopenShort")}
          </span>
        )}
        <span className="card-type-chip">{card.type.toUpperCase()}</span>
        <span className="card-drag-handle" aria-hidden="true">⠿</span>
      </footer>
    </article>
  );
}
