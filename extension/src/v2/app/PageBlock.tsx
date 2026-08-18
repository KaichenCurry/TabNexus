import { useEffect, useRef, useState } from "react";
import type { Locale } from "../../core/types";
import { message, type MessageKey } from "../../i18n";
import type { Page, PageStatus } from "../core/taskModel";
import { Icon } from "./Icon";

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
  currentSectionId: string | null;
  moveTargets: MoveTarget[];
  onMove: (sectionId: string | null) => void;
  onStatus: (status: PageStatus, excludedReason?: string) => void;
  onNote: (note: string) => void;
  onRestore: () => void;
  onDelete: () => void;
};

export function PageBlock({ page, locale, currentSectionId, moveTargets, onMove, onStatus, onNote, onRestore, onDelete }: Props) {
  const [noteDraft, setNoteDraft] = useState(page.note);
  const [reasonDraft, setReasonDraft] = useState(page.excludedReason ?? "");
  const [noteOpen, setNoteOpen] = useState(false);
  const menuRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    setNoteDraft(page.note);
    setReasonDraft(page.excludedReason ?? "");
    setNoteOpen(false);
  }, [page.id, page.note, page.excludedReason]);

  const openUrl = () => {
    if (page.url) onRestore();
  };

  const closeMenu = () => { if (menuRef.current) menuRef.current.open = false; };

  return (
    <div className={`tn-page status-${page.status}`}>
      <div className="tn-page-top">
        {page.favicon ? (
          <img className="tn-favicon" src={page.favicon} alt="" />
        ) : (
          <span className="tn-favicon fallback" aria-hidden="true"><Icon name="document" /></span>
        )}

        <div className="tn-page-body">
          <button type="button" className="tn-page-title" onClick={openUrl} disabled={!page.url}>{page.title}</button>
          {page.url && <span className="tn-page-domain">{domainOf(page.url)}</span>}
          {page.note && !noteOpen && <button type="button" className="tn-page-note-preview" onClick={() => setNoteOpen(true)}>{page.note}</button>}
        </div>

        {page.url && <button type="button" className="tn-page-open" onClick={openUrl} aria-label={message(locale, "restore")}><Icon name="external" /></button>}

        <details className="tn-page-menu" ref={menuRef}>
          <summary aria-label={locale === "zh" ? "页面操作" : "Page actions"}><Icon name="more" /></summary>
          <div>
            <button type="button" onClick={() => { closeMenu(); setNoteOpen(true); }}><Icon name="note" />{page.note ? (locale === "zh" ? "编辑备注" : "Edit note") : (locale === "zh" ? "添加备注" : "Add note")}</button>
            <label>
              <span>{locale === "zh" ? "移动到" : "Move to"}</span>
              <select
                value={currentSectionId ?? "__null"}
                aria-label={locale === "zh" ? "移动到章节" : "Move to section"}
                onChange={(event) => {
                  const targetId = event.target.value === "__null" ? null : event.target.value;
                  closeMenu();
                  onMove(targetId);
                }}
              >
                {moveTargets.map((target) => (
                  <option key={target.id ?? "__null"} value={target.id ?? "__null"}>{target.name}</option>
                ))}
              </select>
            </label>
            <button type="button" className="danger" onClick={() => { closeMenu(); onDelete(); }}><Icon name="trash" />{message(locale, "delete")}</button>
          </div>
        </details>
      </div>

      <div className="tn-page-editors">
        {noteOpen && (
          <textarea
            autoFocus
            className="tn-page-note"
            value={noteDraft}
            placeholder={locale === "zh" ? "记录这页为什么重要…" : "Why does this page matter?"}
            onChange={(event) => setNoteDraft(event.target.value)}
            onBlur={() => { if (noteDraft !== page.note) onNote(noteDraft); setNoteOpen(false); }}
            onKeyDown={(event) => { if (event.key === "Escape") { setNoteDraft(page.note); setNoteOpen(false); } }}
          />
        )}
        {page.status === "excluded" && (
          <input
            className="tn-page-reason"
            value={reasonDraft}
            placeholder={`${message(locale, "v2ExcludeReason")}…`}
            onChange={(event) => setReasonDraft(event.target.value)}
            onBlur={() => onStatus("excluded", reasonDraft)}
          />
        )}
      </div>

      <footer className="tn-page-footer">
        <label className={`tn-status-control status-${page.status}`}>
          <span className="tn-status-dot" aria-hidden="true" />
          <select
            value={page.status}
            aria-label={message(locale, "filterStatus")}
            onChange={(event) => { const status = event.target.value as PageStatus; onStatus(status, status === "excluded" ? reasonDraft : undefined); }}
          >
            {STATUS_ORDER.map((status) => (
              <option key={status} value={status}>{message(locale, STATUS_LABELS[status])}</option>
            ))}
          </select>
        </label>
        {page.url && (
          <span className="tn-page-availability">
            <span aria-hidden="true" />
            {locale === "zh" ? "可重新打开" : "Reopenable"}
          </span>
        )}
        <span className="tn-page-type">{page.type}</span>
      </footer>
    </div>
  );
}

function domainOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}
