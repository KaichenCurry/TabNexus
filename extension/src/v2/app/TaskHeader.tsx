import { useEffect, useState } from "react";
import type { Locale } from "../../core/types";
import { message } from "../../i18n";
import type { Task } from "../core/taskModel";
import { ProgressBar } from "./ProgressBar";

type Props = {
  task: Task;
  locale: Locale;
  onRename: (name: string) => void;
  onMeta: (patch: { goal?: string; nextStep?: string }) => void;
};

export function TaskHeader({ task, locale, onRename, onMeta }: Props) {
  const [title, setTitle] = useState(task.name);
  const [goal, setGoal] = useState(task.goal);
  const [nextStep, setNextStep] = useState(task.nextStep);
  useEffect(() => { setTitle(task.name); setGoal(task.goal); setNextStep(task.nextStep); }, [task.id, task.name, task.goal, task.nextStep]);

  return (
    <header className="tn-task-header">
      <div className="tn-task-overview">
        <div className="tn-task-identity">
          <span className="tn-eyebrow">{locale === "zh" ? "任务上下文" : "TASK CONTEXT"}</span>
          <input
            className="tn-task-title"
            value={title}
            aria-label={locale === "zh" ? "任务名称" : "Task name"}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={() => title.trim() && title.trim() !== task.name && onRename(title.trim())}
          />
        </div>
        <ProgressBar task={task} locale={locale} />
      </div>
      <div className="tn-task-brief">
        <label>
          <span>{locale === "zh" ? "这次要搞清楚" : message(locale, "v2Goal")}</span>
          <input
            className="tn-goal-input"
            value={goal}
            placeholder={locale === "zh" ? "补充判断目标，让资料有共同方向" : "Add a clear decision goal"}
            aria-label={message(locale, "v2Goal")}
            onChange={(event) => setGoal(event.target.value)}
            onBlur={() => goal !== task.goal && onMeta({ goal })}
          />
        </label>
        <label>
          <span>{message(locale, "v2NextStep")}</span>
          <input
            className="tn-nextstep-input"
            value={nextStep}
            placeholder={locale === "zh" ? "写下重新打开任务时要做的第一件事" : "The first thing to do when you return"}
            aria-label={message(locale, "v2NextStep")}
            onChange={(event) => setNextStep(event.target.value)}
            onBlur={() => nextStep !== task.nextStep && onMeta({ nextStep })}
          />
        </label>
      </div>
    </header>
  );
}
