import { useEffect, useRef, useState } from "react";
import type { Locale } from "../../core/types";
import { message } from "../../i18n";
import { Icon } from "./Icon";

type Props = {
  locale: Locale;
  taskName: string;
  pageCount: number;
  view: "doc" | "relation";
  canHandoff: boolean;
  canOrganize: boolean;
  canUndo: boolean;
  onView: (view: "doc" | "relation") => void;
  onCollect: () => void;
  onOrganize: () => void;
  onHandoff: () => void;
  onUndo: () => void;
  onExport: () => void;
  onOpenSearch: () => void;
  onOpenSettings: () => void;
};

export function TaskToolbar(props: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menuOpen]);

  const run = (action: () => void) => {
    setMenuOpen(false);
    action();
  };

  return (
    <header className="tn-toolbar">
      <div className="tn-toolbar-context">
        <small>{props.locale === "zh" ? "当前任务" : "Current task"}</small>
        <strong>{props.taskName}</strong>
        <span>{props.pageCount} {props.locale === "zh" ? "个页面" : "pages"}</span>
      </div>

      <div className="tn-view-tabs" role="group" aria-label={props.locale === "zh" ? "任务视图" : "Task view"}>
        <button type="button" className={props.view === "doc" ? "active" : ""} onClick={() => props.onView("doc")}>
          <Icon name="document" />
          {message(props.locale, "v2Document")}
        </button>
        <button type="button" className={props.view === "relation" ? "active" : ""} onClick={() => props.onView("relation")}>
          <Icon name="relation" />
          {message(props.locale, "v2Canvas")}
        </button>
      </div>

      <div className="tn-toolbar-actions">
        {props.canUndo && (
          <button type="button" className="tn-icon-button" onClick={props.onUndo} aria-label={message(props.locale, "v2Undo")} title={message(props.locale, "v2Undo")}>
            <Icon name="undo" />
          </button>
        )}
        <button type="button" className="tn-secondary tn-organize-button" disabled={!props.canOrganize} onClick={props.onOrganize}>
          <Icon name="sparkles" />
          {props.locale === "zh" ? "智能整理" : "Organize"}
        </button>
        <button type="button" className="tn-agent-button" disabled={!props.canHandoff} onClick={props.onHandoff}>
          <Icon name="agent" />
          {message(props.locale, "v2LetAgentContinue")}
        </button>
        <button type="button" className="tn-primary tn-collect-button" onClick={props.onCollect}>
          <Icon name="collect" />
          {props.locale === "zh" ? "收集页面" : "Collect pages"}
        </button>
        <div className="tn-more" ref={menuRef}>
          <button type="button" className="tn-icon-button" onClick={() => setMenuOpen((value) => !value)} aria-haspopup="menu" aria-expanded={menuOpen} aria-label={props.locale === "zh" ? "更多操作" : "More actions"}>
            <Icon name="more" />
          </button>
          {menuOpen && (
            <div className="tn-more-menu" role="menu">
              <button type="button" role="menuitem" onClick={() => run(props.onExport)}><Icon name="export" />{message(props.locale, "export")}</button>
              <button type="button" role="menuitem" onClick={() => run(props.onOpenSearch)}><Icon name="search" />{props.locale === "zh" ? "搜索与命令" : "Search and commands"}<kbd>⌘K</kbd></button>
              <button type="button" role="menuitem" onClick={() => run(props.onOpenSettings)}><Icon name="settings" />{message(props.locale, "settings")}</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
