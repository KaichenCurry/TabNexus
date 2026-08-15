import type { Locale } from "../../core/types";
import { message } from "../../i18n";
import { computeProgress, isUnassignedPage, type Task } from "../core/taskModel";

type Props = { task: Task; locale: Locale };

const SECTION_COLORS = [
  "var(--tn-section-1)",
  "var(--tn-section-2)",
  "var(--tn-section-3)",
  "var(--tn-section-4)",
  "var(--tn-section-5)",
  "var(--tn-section-6)"
];

export function ProgressBar({ task, locale }: Props) {
  const progress = computeProgress(task);
  const counted = Object.values(task.pages).filter((page) => page.status !== "excluded").length;
  const segments = [
    ...task.sections.map((section) => ({
      key: section.id,
      name: section.name,
      color: section.color ?? SECTION_COLORS[0],
      total: progress.sections.find((entry) => entry.sectionId === section.id)?.total ?? 0,
      percent: progress.sections.find((entry) => entry.sectionId === section.id)?.percent ?? 0
    })),
    {
      key: "__unassigned",
      name: message(locale, "v2Unassigned"),
      color: "var(--tn-gray-400)",
      total: counted - progress.sections.reduce((sum, section) => sum + section.total, 0),
      percent: 0
    }
  ].filter((segment) => segment.total > 0);

  return (
    <div className={`tn-progress ${progress.deliverable ? "deliverable" : ""}`} aria-label={message(locale, "v2ProgressRead", { read: progress.read, total: progress.total })}>
      <div className="tn-progress-track">
        {segments.map((segment) => {
          const width = counted > 0 ? (segment.total / counted) * 100 : 0;
          const fillPercent = segment.key === "__unassigned"
            ? 0
            : width > 0 ? segment.percent : 0;
          return (
            <button
              key={segment.key}
              type="button"
              className="tn-progress-segment"
              style={{ width: `${width}%` }}
              title={`${segment.name} · ${segment.total}`}
              onClick={() => document.getElementById(`section-${segment.key}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
            >
              <div className="tn-progress-fill" style={{ width: `${fillPercent}%`, background: segment.color }} />
            </button>
          );
        })}
      </div>
      <span className="tn-progress-read">{message(locale, "v2ProgressRead", { read: progress.read, total: progress.total })}</span>
      <span className="tn-progress-adopted">{message(locale, "v2ProgressAdopted", { count: progress.adopted })}</span>
      {progress.deliverable && <span className="tn-progress-hint">{message(locale, "v2DeliverableHint")}</span>}
    </div>
  );
}
