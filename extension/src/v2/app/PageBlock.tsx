import { useState } from "react";
import type { Locale } from "../../core/types";
import { message, type MessageKey } from "../../i18n";
import type { Page, PageStatus } from "../core/taskModel";

const STATUS_LABELS: Record<PageStatus, MessageKey> = {
  unread: "statusUnread",
  read: "statusRead",
  adopted: "statusAdopted",
  excluded: "v2Excluded"
};

const STATUS_ORDER: PageStatus[] = ["unread", "read", "adopted", "excluded"];

type MoveTarget = { id: string | null; name: string };

type Props = {
  page: Page;
  locale: Locale;
  moveTargets: MoveTarget[];
  onMove: (sectionId: string | null) => void;
  onStatus: (status: PageStatus, excludedReason?: string) => void;
  onNote: (note: string) => void;
  onRestore: () => void;
  onDelete: () => void;
};

export function PageBlock({ page, locale, moveTargets, onMove, onStatus, onNote, onRestore, onDelete }: Props) {
  const [noteDraft, setNoteDraft] = useState(page.note);
  const [reasonDraft, setReasonDraft] = useState(page.excludedReason ?? "");

  const openUrl = () => {
    if (!page.url) return;
    if (typeof chrome !== "undefined" && chrome.tabs?.create) {
      void chrome.tabs.create({ url: page.url });
    } else {
      window.open(page.url, "_blank", "noopener");
    }
  };

  return (
    <div className={`tn-page status-${page.status}`}>
      {page.favicon ? (
        <img className="tn-favicon" src={page.favicon} alt="" />
      ) : (
        <span className="tn-favicon fallback" aria-hidden="true">{page.title.slice(0, 1).toUpperCase()}</span>
      )}

      <div className="tn-page-status" role="group" aria-label={message(locale, "filterStatus")}>
        {STATUS_ORDER.map((status) => (
          <button
            key={status}
            type="button"
            className={`tn-status-pill st-${status} ${page.status === status ? "active" : ""}`}
            title={message(locale, STATUS_LABELS[status])}
            aria-label={message(locale, STATUS_LABELS[status])}
            onClick={() => onStatus(status, status === "excluded" ? reasonDraft : undefined)}
          >
            {status === "unread" ? "○" : status === "read" ? "◐" : status === "adopted" ? "⭐" : "✕"}
          </button>
        ))}
      </div>

      <div className="tn-page-body">
        <div className="tn-page-title-row">
          <span className="tn-page-title" onClick={openUrl} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter") openUrl(); }}>{page.title}</span>
          {page.url && (
            <button type="button" className="tn-page-open" onClick={openUrl} aria-label={message(locale, "restore")}>↗</button>
          )}
        </div>
        <input
          className="tn-page-note"
          value={noteDraft}
          placeholder="备注…"
          onChange={(event) => setNoteDraft(event.target.value)}
          onBlur={() => noteDraft !== page.note && onNote(noteDraft)}
        />
        {page.status === "excluded" && (
          <input
            className="tn-page-reason"
            value={reasonDraft}
            placeholder={`${message(locale, "v2ExcludeReason")}…`}
            onChange={(event) => setReasonDraft(event.target.value)}
            onBlur={() => onStatus("excluded", reasonDraft)}
          />
        )}
        {page.url && <span className="tn-page-domain">{domainOf(page.url)}</span>}
      </div>

      <label className="tn-page-move">
        <span aria-hidden="true">→</span>
        <select
          value={""}
          aria-label="move"
          onChange={(event) => { const targetId = event.target.value === "__null" ? null : event.target.value; onMove(targetId); }}
        >
          <option value="">{message(locale, "v2Unassigned")}</option>
          {moveTargets.map((target) => (
            <option key={target.id ?? "__null"} value={target.id ?? "__null"}>{target.name}</option>
          ))}
        </select>
        <button type="button" className="tn-page-delete" onClick={onDelete} aria-label={message(locale, "delete")}>×</button>
      </label>
    </div>
  );
}

function domainOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}
