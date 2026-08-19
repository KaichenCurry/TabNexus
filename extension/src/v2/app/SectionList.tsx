import { useRef, useState } from "react";
import type { Locale } from "../../core/types";
import { message } from "../../i18n";
import { isUnassignedPage, type Page, type PageStatus, type Task } from "../core/taskModel";
import { Icon } from "./Icon";
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
  onRestoreSection: (urls: string[]) => void;
  onCollectToSection: (sectionId: string | null) => void;
  onDeletePage: (pageId: string, title: string) => void;
};

export function SectionList(props: Props) {
  const { task, locale } = props;
  const [adding, setAdding] = useState(false);
  const [draftName, setDraftName] = useState("");
  const moveTargets = [
    { id: null, name: message(locale, "v2Unassigned") },
    ...task.sections.map((section) => ({ id: section.id, name: section.name }))
  ];
  const unassigned = Object.values(task.pages).filter((page) => isUnassignedPage(task, page.id));

  const submitSection = () => {
    props.onCreateSection(draftName.trim() || undefined);
    setDraftName("");
    setAdding(false);
  };

  return (
    <section className="tn-sections" aria-label={message(locale, "v2Document")}>
      {task.sections.map((section) => (
        <SectionColumn
          key={section.id}
          sectionId={section.id}
          name={section.name}
          color={section.color}
          pages={section.pageIds.map((pageId) => task.pages[pageId]).filter(Boolean)}
          locale={locale}
          moveTargets={moveTargets}
          onRename={(name) => props.onRenameSection(section.id, name)}
          onDelete={() => props.onDeleteSection(section.id)}
          onCollect={() => props.onCollectToSection(section.id)}
          onRestoreSection={props.onRestoreSection}
          onMovePages={props.onMovePages}
          onPageStatus={props.onPageStatus}
          onPageNote={props.onPageNote}
          onRestorePage={props.onRestorePage}
          onDeletePage={props.onDeletePage}
        />
      ))}

      {unassigned.length > 0 && (
        <SectionColumn
          sectionId={null}
          name={message(locale, "v2Unassigned")}
          pages={unassigned}
          locale={locale}
          moveTargets={moveTargets}
          onCollect={() => props.onCollectToSection(null)}
          onRestoreSection={props.onRestoreSection}
          onMovePages={props.onMovePages}
          onPageStatus={props.onPageStatus}
          onPageNote={props.onPageNote}
          onRestorePage={props.onRestorePage}
          onDeletePage={props.onDeletePage}
        />
      )}

      <div className="tn-section-add">
        {adding ? (
          <div className="tn-section-add-form">
            <span>{locale === "zh" ? "新建任务章节" : "Create task section"}</span>
            <input
              autoFocus
              value={draftName}
              placeholder={message(locale, "v2NewSection")}
              onChange={(event) => setDraftName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submitSection();
                if (event.key === "Escape") setAdding(false);
              }}
            />
            <div>
              <button type="button" className="tn-secondary" onClick={() => setAdding(false)}>{locale === "zh" ? "取消" : "Cancel"}</button>
              <button type="button" className="tn-primary" onClick={submitSection}>{locale === "zh" ? "创建" : "Create"}</button>
            </div>
          </div>
        ) : (
          <button type="button" className="tn-new-section-card" onClick={() => setAdding(true)}>
            <Icon name="add" />
            <span>{message(locale, "v2NewSection")}</span>
            <small>{locale === "zh" ? "为任务增加新的资料章节" : "Add another source section"}</small>
          </button>
        )}
      </div>
    </section>
  );
}

function SectionColumn(props: {
  sectionId: string | null;
  name: string;
  color?: string;
  pages: Page[];
  locale: Locale;
  moveTargets: Array<{ id: string | null; name: string }>;
  onRename?: (name: string) => void;
  onDelete?: () => void;
  onCollect: () => void;
  onRestoreSection: (urls: string[]) => void;
  onMovePages: Props["onMovePages"];
  onPageStatus: Props["onPageStatus"];
  onPageNote: Props["onPageNote"];
  onRestorePage: Props["onRestorePage"];
  onDeletePage: Props["onDeletePage"];
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(props.name);
  const menuRef = useRef<HTMLDetailsElement>(null);
  const urls = props.pages.flatMap((page) => page.url ? [page.url] : []);
  const submitRename = () => {
    props.onRename?.(draft.trim() || props.name);
    setEditing(false);
  };
  const closeMenu = () => { if (menuRef.current) menuRef.current.open = false; };

  return (
    <article id={`section-${props.sectionId ?? "unassigned"}`} className={`tn-section ${props.sectionId === null ? "unassigned" : ""}`}>
      <header className="tn-section-heading">
        <span className="tn-section-copy">
          {editing ? (
            <input
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={submitRename}
              onKeyDown={(event) => {
                if (event.key === "Enter") submitRename();
                if (event.key === "Escape") setEditing(false);
              }}
            />
          ) : <h3>{props.name}</h3>}
          <small>{props.locale === "zh" ? `已保存 ${props.pages.length} 个页面` : `${props.pages.length} pages saved`}</small>
        </span>
        <span className="tn-section-actions">
          <em>{props.pages.length}</em>
          <button
            type="button"
            className="tn-section-open"
            disabled={urls.length === 0}
            onClick={() => props.onRestoreSection(urls)}
            aria-label={props.locale === "zh" ? `打开章节「${props.name}」全部页面` : `Open all pages in ${props.name}`}
          ><Icon name="external" /></button>
          {props.sectionId !== null && (
            <details className="tn-section-menu" ref={menuRef}>
              <summary aria-label={props.locale === "zh" ? `管理章节「${props.name}」` : `Manage ${props.name}`}><Icon name="more" /></summary>
              <div>
                <button type="button" onClick={() => { closeMenu(); setDraft(props.name); setEditing(true); }}><Icon name="note" />{message(props.locale, "rename")}</button>
                <button type="button" className="danger" onClick={() => { closeMenu(); props.onDelete?.(); }}><Icon name="trash" />{message(props.locale, "delete")}</button>
              </div>
            </details>
          )}
        </span>
      </header>

      {props.color && <div className="tn-section-accent" style={{ background: props.color }} />}
      <div className="tn-section-pages">
        {props.pages.map((page) => (
          <PageBlock
            key={page.id}
            page={page}
            locale={props.locale}
            currentSectionId={props.sectionId}
            moveTargets={props.moveTargets}
            onMove={(targetId) => props.onMovePages([page.id], targetId)}
            onStatus={(status, reason) => props.onPageStatus(page.id, status, reason)}
            onNote={(note) => props.onPageNote(page.id, note)}
            onRestore={() => props.onRestorePage(page.url)}
            onDelete={() => props.onDeletePage(page.id, page.title)}
          />
        ))}
        {props.pages.length === 0 && <p className="tn-section-empty">{props.locale === "zh" ? "这个章节还没有资料" : "No sources in this section yet"}</p>}
      </div>

      <button type="button" className="tn-section-collect" onClick={props.onCollect}>
        <Icon name="add" />
        {props.locale === "zh" ? `添加资料到「${props.name}」` : `Add sources to “${props.name}”`}
      </button>
    </article>
  );
}
