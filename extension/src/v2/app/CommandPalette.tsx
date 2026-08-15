import { useEffect, useMemo, useState } from "react";
import type { Locale } from "../../core/types";
import { message } from "../../i18n";
import type { Task } from "../core/taskModel";

type Props = {
  tasks: Task[];
  activeTaskId: string;
  locale: Locale;
  onSwitchTask: (taskId: string) => void;
  onCreateSection: () => void;
  onClose: () => void;
};

export function CommandPalette({ tasks, activeTaskId, locale, onSwitchTask, onCreateSection, onClose }: Props) {
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
    return tasks.filter((task) => !q || task.name.toLowerCase().includes(q));
  }, [tasks, query]);

  return (
    <div className="tn-palette-backdrop" onClick={onClose}>
      <div className="tn-palette" role="dialog" aria-label="command" onClick={(event) => event.stopPropagation()}>
        <input
          autoFocus
          value={query}
          placeholder={message(locale, "v2CommandPlaceholder")}
          onChange={(event) => setQuery(event.target.value)}
        />
        <ul>
          {matches.map((task) => (
            <li key={task.id}>
              <button
                type="button"
                className={task.id === activeTaskId ? "active" : ""}
                onClick={() => { onSwitchTask(task.id); onClose(); }}
              >
                {task.name} <small>{Object.keys(task.pages).length}</small>
              </button>
            </li>
          ))}
          <li>
            <button type="button" onClick={() => { onCreateSection(); onClose(); }}>＋ {message(locale, "v2NewSection")}</button>
          </li>
        </ul>
      </div>
    </div>
  );
}
