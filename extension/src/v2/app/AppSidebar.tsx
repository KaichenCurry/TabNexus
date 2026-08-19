import type { Locale } from "../../core/types";
import { message } from "../../i18n";
import { computeProgress, type Task } from "../core/taskModel";
import { Icon } from "./Icon";

type Props = {
  tasks: Task[];
  activeTaskId: string;
  locale: Locale;
  onSwitchTask: (taskId: string) => void;
  onCreateTask: () => void;
  onOpenSearch: () => void;
};

export function AppSidebar({ tasks, activeTaskId, locale, onSwitchTask, onCreateTask, onOpenSearch }: Props) {
  return (
    <aside className="tn-sidebar">
      <div className="tn-brand">
        <span className="tn-brand-mark" aria-hidden="true"><i /><i /></span>
        <span>
          <strong>TabNexus</strong>
          <small>{locale === "zh" ? "浏览器任务上下文" : "Browser task context"}</small>
        </span>
      </div>

      <button type="button" className="tn-sidebar-add" onClick={onCreateTask}>
        <Icon name="add" />
        {message(locale, "v2NewTask")}
      </button>

      <div className="tn-sidebar-label">
        <span>{message(locale, "v2Tasks")}</span>
        <small>{tasks.length}</small>
      </div>
      <nav className="tn-task-list" aria-label={message(locale, "v2Tasks")}>
        {tasks.map((task) => {
          const progress = computeProgress(task);
          return (
            <button
              key={task.id}
              type="button"
              className={`tn-task-item ${task.id === activeTaskId ? "active" : ""}`}
              onClick={() => onSwitchTask(task.id)}
            >
              <span className="tn-task-copy">
                <span className="tn-task-name">{task.name}</span>
                <small>{Object.keys(task.pages).length === 0
                  ? (locale === "zh" ? "还没有页面" : "No pages yet")
                  : `${progress.percent}% · ${Object.keys(task.pages).length} ${locale === "zh" ? "页" : "pages"}`}</small>
              </span>
              <span className="tn-task-progress-dot" style={{ "--progress": `${progress.percent * 3.6}deg` } as React.CSSProperties} />
            </button>
          );
        })}
      </nav>

      <button type="button" className="tn-sidebar-search" onClick={onOpenSearch}>
        <Icon name="search" />
        <span>{locale === "zh" ? "搜索任务和页面" : "Search tasks and pages"}</span>
        <kbd>⌘K</kbd>
      </button>
    </aside>
  );
}
