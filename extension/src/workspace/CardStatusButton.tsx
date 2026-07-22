import type { CardStatus, Locale } from "../core/types";
import { message } from "../i18n";

const STATUS_ORDER: CardStatus[] = ["unread", "read", "adopted"];

export function CardStatusButton({
  status,
  locale,
  onChange
}: {
  status: CardStatus;
  locale: Locale;
  onChange: (status: CardStatus) => void;
}) {
  const label = message(locale, status === "unread" ? "statusUnread" : status === "read" ? "statusRead" : "statusAdopted");
  const cycle = () => {
    const index = STATUS_ORDER.indexOf(status);
    onChange(STATUS_ORDER[(index + 1) % STATUS_ORDER.length]);
  };
  return (
    <button
      type="button"
      className={`card-status-button ${status}`}
      onClick={(event) => { event.stopPropagation(); cycle(); }}
      aria-label={message(locale, "cardStatus", { status: label })}
      title={message(locale, "cardStatus", { status: label })}
    >
      <i />{label}
    </button>
  );
}
