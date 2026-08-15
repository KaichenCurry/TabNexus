import { useState } from "react";
import type { Locale } from "../../core/types";
import { message } from "../../i18n";
import { isUnassignedPage, type PageStatus, type Task } from "../core/taskModel";
import { PageBlock } from "./PageBlock";

type Props = {
  task: Task;
  locale: Locale;
  onCreateSection: (name?: string) => void;
  onRenameSection: (sectionId: string, name: string) => void;
  onDeleteSection: (sectionId: string) => void;
  onMovePages: (pageIds: string[], sectionId: string | null) => void;
  onPageStatus: (pageId: string, status: PageStatus, excludedReason?: string) => void;
  onPageNote: (pageId: string, note: string) => void;
  onRestorePage: (url?: string) => void;
  onDeletePage: (pageId: string, title: string) => void;
};

export function SectionList(props: Props) {
  const { task, locale } = props;
  const [adding, setAdding] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const sections = task.sections.map((section) => ({
    ...section,
    pages: section.pageIds.map((pageId) => task.pages[pageId]).filter(Boolean)
  }));
  const unassigned = Object.values(task.pages).filter((page) => isUnassignedPage(task, page.id));

  const submitSection = () => {
    props.onCreateSection(draftName.trim() || undefined);
    setDraftName("");
    setAdding(false);
  };

  return (
    <section className="tn-sections" aria-label={message(locale, "v2Document")}>
      {sections.map((section) => (
        <article key={section.id} id={`section-${section.id}`} className={`tn-section ${collapsed.has(section.id) ? "collapsed" : ""}`}>
          <SectionHeading
            name={section.name}
            color={section.color}
            count={section.pages.length}
            locale={locale}
            collapsed={collapsed.has(section.id)}
            onToggle={() => setCollapsed((current) => {
              const next = new Set(current);
              if (next.has(section.id)) next.delete(section.id); else next.add(section.id);
              return next;
            })}
            onRename={(name) => props.onRenameSection(section.id, name)}
            onDelete={() => props.onDeleteSection(section.id)}
          />
          <div className="tn-section-pages">
            {section.pages.map((page) => (
              <PageBlock
                key={page.id}
                page={page}
                locale={locale}
                moveTargets={[{ id: null, name: message(locale, "v2Unassigned") }, ...task.sections.map((candidate) => ({ id: candidate.id, name: candidate.name }))]}
                onMove={(targetId) => props.onMovePages([page.id], targetId)}
                onStatus={(status, reason) => props.onPageStatus(page.id, status, reason)}
                onNote={(note) => props.onPageNote(page.id, note)}
                onRestore={() => props.onRestorePage(page.url)}
                onDelete={() => props.onDeletePage(page.id, page.title)}
              />
            ))}
          </div>
        </article>
      ))}

      {unassigned.length > 0 && (
        <article id="section-unassigned" className="tn-section unassigned">
          <h3 className="tn-section-heading">{message(locale, "v2Unassigned")} <em>{unassigned.length}</em></h3>
          <div className="tn-section-pages">
            {unassigned.map((page) => (
              <PageBlock
                key={page.id}
                page={page}
                locale={locale}
                moveTargets={task.sections.map((candidate) => ({ id: candidate.id, name: candidate.name }))}
                onMove={(targetId) => props.onMovePages([page.id], targetId)}
                onStatus={(status, reason) => props.onPageStatus(page.id, status, reason)}
                onNote={(note) => props.onPageNote(page.id, note)}
                onRestore={() => props.onRestorePage(page.url)}
                onDelete={() => props.onDeletePage(page.id, page.title)}
              />
            ))}
          </div>
        </article>
      )}

      <div className="tn-section-add">
        {adding ? (
          <>
            <input
              autoFocus
              value={draftName}
              placeholder={message(locale, "v2NewSection")}
              onChange={(event) => setDraftName(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") submitSection(); if (event.key === "Escape") setAdding(false); }}
            />
            <button type="button" className="tn-primary" onClick={submitSection}>＋</button>
          </>
        ) : (
          <button type="button" className="tn-section-add-button" onClick={() => setAdding(true)}>
            ＋ {message(locale, "v2NewSection")}
          </button>
        )}
      </div>
    </section>
  );
}

function SectionHeading({ name, color, count, locale, collapsed, onToggle, onRename, onDelete }: {
  name: string; color?: string; count: number; locale: Locale; collapsed: boolean;
  onToggle: () => void; onRename: (name: string) => void; onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const submit = () => { onRename(draft.trim() || name); setEditing(false); };
  return (
    <h3 className="tn-section-heading">
      <button type="button" className="tn-sec-collapse" onClick={onToggle} aria-pressed={collapsed} aria-label={collapsed ? "展开" : "折叠"}>
        {collapsed ? "▸" : "▾"}
      </button>
      {color && <i className="tn-sec-dot" style={{ background: color }} />}
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={submit}
          onKeyDown={(event) => { if (event.key === "Enter") submit(); if (event.key === "Escape") setEditing(false); }}
        />
      ) : (
        <button type="button" onDoubleClick={() => { setDraft(name); setEditing(true); }} title={message(locale, "rename")}>
          {name}
        </button>
      )}
      <em>{count}</em>
      <button type="button" className="tn-section-delete" onClick={onDelete} aria-label={message(locale, "delete")}>×</button>
    </h3>
  );
}
