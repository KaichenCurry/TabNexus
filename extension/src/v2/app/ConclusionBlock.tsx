import { useEffect, useMemo, useState } from "react";
import { activeAiConfig } from "../../core/aiProviders";
import { message } from "../../i18n";
import type { Locale, Settings, SummarizeRequest } from "../../core/types";
import type { Task } from "../core/taskModel";
import { Icon } from "./Icon";

type Props = {
  task: Task;
  locale: Locale;
  settings: Settings;
  onApplySummary: (patch: { summary: string; conclusion: string; nextStep: string }) => void;
};

export function ConclusionBlock({ task, locale, settings, onApplySummary }: Props) {
  const [draft, setDraft] = useState(task.conclusion);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setDraft(task.conclusion); }, [task.id, task.conclusion]);

  const ai = useMemo(() => {
    if (!settings.aiEnabled) return null;
    try { return activeAiConfig(settings); } catch { return null; }
  }, [settings]);

  const summarize = async () => {
    if (busy || !ai || typeof chrome === "undefined" || !chrome.runtime?.sendMessage) return;
    setBusy(true);
    setError(null);
    try {
      const payload: SummarizeRequest = {
        locale,
        taskName: task.name,
        goal: task.goal,
        sections: task.sections.map((section) => ({
          name: section.name,
          pageTitles: section.pageIds.map((pageId) => task.pages[pageId]?.title ?? "")
        })),
        pages: Object.values(task.pages).map((page) => ({
          title: page.title,
          note: page.note,
          status: page.status,
          excludedReason: page.excludedReason
        }))
      };
      const response = await chrome.runtime.sendMessage({
        type: "SUMMARIZE_TASK",
        provider: ai.provider,
        apiKey: ai.apiKey.trim(),
        model: ai.model,
        payload
      });
      if (!response?.ok) throw new Error(response?.error ?? "AI 总结失败");
      onApplySummary(response.data);
      setDraft(response.data.conclusion);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "AI 总结失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="tn-conclusion" aria-label={message(locale, "v2Conclusion")}>
      <header className="tn-conclusion-head">
        <span>
          <small>{locale === "zh" ? "输出" : "OUTPUT"}</small>
          <strong>{message(locale, "v2Conclusion")}</strong>
        </span>
        <button
          type="button"
          className="tn-ai-text-button"
          disabled={busy || !ai}
          title={ai ? undefined : message(locale, "v2OrganizeLocalOnly")}
          onClick={() => void summarize()}
        >
          <Icon name="sparkles" />
          {busy ? message(locale, "v2OrganizeGenerating") : message(locale, "v2AiSummarize")}
        </button>
      </header>
      <textarea
        value={draft}
        placeholder="暂未成稿。写一句话结论，或让 AI 帮你总结。"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => draft !== task.conclusion && onApplySummary({ summary: task.summary ?? "", conclusion: draft, nextStep: task.nextStep })}
      />
      {error && <p className="tn-conclusion-error">{error}</p>}
    </section>
  );
}
