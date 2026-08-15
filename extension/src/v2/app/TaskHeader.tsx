import { useEffect, useState } from "react";
import type { Locale } from "../../core/types";
import { message } from "../../i18n";
import { computeProgress, type Task } from "../core/taskModel";
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

  const progress = computeProgress(task);

  return (
    <header className="tn-task-header">
      <input
        className="tn-task-title"
        value={title}
        aria-label={message(locale, "v2Goal")}
        onChange={(event) => setTitle(event.target.value)}
        onBlur={() => title.trim() && title.trim() !== task.name && onRename(title)}
      />
      <input
        className="tn-goal-input"
        value={goal}
        placeholder={`${message(locale, "v2Goal")}…`}
        aria-label={message(locale, "v2Goal")}
        onChange={(event) => setGoal(event.target.value)}
        onBlur={() => goal !== task.goal && onMeta({ goal })}
      />
      <ProgressBar task={task} locale={locale} />
      <input
        className="tn-nextstep-input"
        value={nextStep}
        placeholder={`${message(locale, "v2NextStep")}…`}
        aria-label={message(locale, "v2NextStep")}
        onChange={(event) => setNextStep(event.target.value)}
        onBlur={() => nextStep !== task.nextStep && onMeta({ nextStep })}
      />
    </header>
  );
}
