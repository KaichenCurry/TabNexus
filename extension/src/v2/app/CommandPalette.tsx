import { useEffect, useMemo, useState } from "react";
import type { Locale } from "../../core/types";
import { message } from "../../i18n";
import type { Task } from "../core/taskModel";
import { Icon } from "./Icon";

type Props = {
  tasks: Task[];
  activeTaskId: string;
  locale: Locale;
  onSwitchTask: (taskId: string) => void;
  onOpenPage: (taskId: string, url?: string) => void;
  onOpenInbox: () => void;
  onOrganize: () => void;
  onCreateSection: () => void;
  onClose: () => void;
};

export function CommandPalette({ tasks, activeTaskId, locale, onSwitchTask, onOpenPage, onOpenInbox, onOrganize, onCreateSection, onClose }: Props) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const taskMatches = tasks
      .filter((task) => !q || task.name.toLowerCase().includes(q))
      .map((task) => ({ kind: "task" as const, task }));
    const pageMatches = q ? tasks.flatMap((task) => Object.values(task.pages)
      .filter((page) => `${page.title} ${page.url ?? ""} ${page.note}`.toLowerCase().includes(q))
      .map((page) => ({ kind: "page" as const, task, page }))) : [];
    return [...taskMatches, ...pageMatches].slice(0, 12);
  }, [tasks, query]);

  return (
    <div className="tn-palette-backdrop" onClick={onClose}>
      <div className="tn-palette" role="dialog" aria-label="command" onClick={(event) => event.stopPropagation()}>
        <div className="tn-palette-search">
          <Icon name="search" />
          <input
            autoFocus
            value={query}
            placeholder={message(locale, "v2CommandPlaceholder")}
            onChange={(event) => setQuery(event.target.value)}
          />
          <kbd>ESC</kbd>
        </div>
        <ul>
          {!query.trim() && (
            <li className="tn-palette-actions">
              <button type="button" onClick={() => { onOpenInbox(); onClose(); }}><Icon name="collect" /><span>{locale === "zh" ? "收集当前窗口页面" : "Collect current-window pages"}</span></button>
              <button type="button" onClick={() => { onOrganize(); onClose(); }}><Icon name="sparkles" /><span>{locale === "zh" ? "整理当前任务" : "Organize current task"}</span></button>
              <button type="button" onClick={() => { onCreateSection(); onClose(); }}><Icon name="add" /><span>{message(locale, "v2NewSection")}</span></button>
            </li>
          )}
          {matches.map((result) => result.kind === "task" ? (
            <li key={`task-${result.task.id}`}>
              <button
                type="button"
                className={result.task.id === activeTaskId ? "active" : ""}
                onClick={() => { onSwitchTask(result.task.id); onClose(); }}
              >
                <Icon name="document" />
                <span>{result.task.name}</span>
                <small>{Object.keys(result.task.pages).length}</small>
              </button>
            </li>
          ) : (
            <li key={`page-${result.task.id}-${result.page.id}`}>
              <button type="button" onClick={() => { onOpenPage(result.task.id, result.page.url); onClose(); }}>
                <Icon name="external" />
                <span>{result.page.title}<small>{result.task.name}</small></span>
              </button>
            </li>
          ))}
          {query.trim() && matches.length === 0 && <li className="tn-palette-empty">{locale === "zh" ? "没有匹配的任务或页面" : "No matching tasks or pages"}</li>}
        </ul>
      </div>
    </div>
  );
}
