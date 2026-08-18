import { useMemo, useState } from "react";
import { applyGroupingProposal, validateGroupingProposal } from "../../core/grouping";
import { activeAiConfig } from "../../core/aiProviders";
import { message } from "../../i18n";
import type { GroupingProposal, Locale, Settings } from "../../core/types";
import { taskToWorkspaceView } from "../core/taskOps";
import {
  buildRegroupRequest,
  createDomainProposalV2,
  createTimeProposal,
  type RegroupMode
} from "../core/regroup";
import type { Task } from "../core/taskModel";
import { Icon } from "./Icon";

type Props = {
  task: Task;
  locale: Locale;
  settings: Settings;
  onApply: (proposal: GroupingProposal) => void;
  onClose: () => void;
};

const MODES: Array<{ id: RegroupMode; labelKey: "v2OrganizeByContent" | "v2OrganizeByTime" | "v2OrganizeByDomain" | "v2OrganizeCustom" }> = [
  { id: "content", labelKey: "v2OrganizeByContent" },
  { id: "time", labelKey: "v2OrganizeByTime" },
  { id: "domain", labelKey: "v2OrganizeByDomain" },
  { id: "custom", labelKey: "v2OrganizeCustom" }
];

export function OrganizeModal({ task, locale, settings, onApply, onClose }: Props) {
  const ai = useMemo(() => {
    if (!settings.aiEnabled) return null;
    try { return activeAiConfig(settings); } catch { return null; }
  }, [settings]);

  const candidates = useMemo(() => Object.values(task.pages).filter((page) => page.status !== "excluded"), [task.pages]);
  const unassigned = useMemo(() => candidates.filter((page) => !task.sections.some((section) => section.pageIds.includes(page.id))), [candidates, task.sections]);
  const [scope, setScope] = useState<"unassigned" | "all">(() => unassigned.length > 0 ? "unassigned" : "all");
  const scopePageIds = useMemo(() => {
    return (scope === "unassigned" && unassigned.length > 0 ? unassigned : candidates).map((page) => page.id);
  }, [candidates, scope, unassigned]);

  const [mode, setMode] = useState<RegroupMode>(ai ? "content" : "domain");
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<GroupingProposal | null>(null);

  const needsAi = mode === "content" || mode === "custom";

  const generate = async () => {
    if (busy || scopePageIds.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      let next: GroupingProposal;
      if (mode === "time") {
        next = createTimeProposal(task, scopePageIds);
      } else if (mode === "domain") {
        next = createDomainProposalV2(task, locale, scopePageIds);
      } else {
        if (!ai) throw new Error(message(locale, "v2OrganizeAiMissing"));
        const response = await chrome.runtime.sendMessage({
          type: "CLUSTER_TABS",
          provider: ai.provider,
          apiKey: ai.apiKey.trim(),
          model: ai.model,
          payload: buildRegroupRequest(task, locale, scopePageIds, instruction)
        });
        if (!response?.ok) throw new Error(response?.error ?? "AI 整理失败");
        next = {
          ...validateGroupingProposal(response.data, taskToWorkspaceView(task), scopePageIds),
          instruction: instruction.trim() || undefined,
          pruneEmptyGroups: true
        };
      }
      setProposal(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "整理失败");
    } finally {
      setBusy(false);
    }
  };

  const apply = () => {
    if (!proposal) return;
    onApply(proposal);
  };

  const groupNameOf = (groupId: string) => proposal?.groups.find((group) => group.id === groupId)?.name
    ?? task.sections.find((section) => section.id === groupId)?.name
    ?? (locale === "zh" ? "未命名章节" : "Untitled section");
  const grouped = useMemo(() => {
    if (!proposal) return [];
    const byGroup = new Map<string, Array<{ cardId: string; reason?: string }>>();
    for (const assignment of proposal.assignments) {
      byGroup.set(assignment.groupId, [...(byGroup.get(assignment.groupId) ?? []), assignment]);
    }
    return [...byGroup.entries()];
  }, [proposal]);

  return (
    <div className="tn-modal-backdrop" onClick={onClose}>
      <div className="tn-modal" role="dialog" aria-label={message(locale, "v2AiOneClickOrganize")} onClick={(event) => event.stopPropagation()}>
        <header className="tn-modal-head">
          <span><Icon name="sparkles" /><strong>{locale === "zh" ? "整理任务上下文" : "Organize task context"}</strong></span>
          <button type="button" onClick={onClose} aria-label={message(locale, "closeModal")}><Icon name="close" /></button>
        </header>

        <div className="tn-modal-body">
          <div className="tn-modal-section">
            <div className="tn-modal-label">
              <strong>{locale === "zh" ? "1. 选择范围" : "1. Choose scope"}</strong>
              <span>{locale === "zh" ? "不会处理已排除页面" : "Excluded pages are never changed"}</span>
            </div>
            <div className="tn-scope-switch" role="group" aria-label={locale === "zh" ? "整理范围" : "Organize scope"}>
              {unassigned.length > 0 && (
                <button type="button" className={scope === "unassigned" ? "active" : ""} onClick={() => { setScope("unassigned"); setProposal(null); }}>
                  {locale === "zh" ? `仅未归类 · ${unassigned.length}` : `Unassigned only · ${unassigned.length}`}
                </button>
              )}
              <button type="button" className={scope === "all" || unassigned.length === 0 ? "active" : ""} onClick={() => { setScope("all"); setProposal(null); }}>
                {locale === "zh" ? `全部页面 · ${candidates.length}` : `All pages · ${candidates.length}`}
              </button>
            </div>
          </div>

          <div className="tn-modal-section">
            <div className="tn-modal-label">
              <strong>{locale === "zh" ? "2. 选择整理方式" : "2. Choose a method"}</strong>
              <span>{locale === "zh" ? "先生成预览，确认后才会写回" : "Preview first; nothing changes until you apply"}</span>
            </div>
          <div className="tn-mode-list" role="group" aria-label={locale === "zh" ? "整理方式" : "Organization method"}>
            {MODES.map((entry) => (
              <label key={entry.id} className={`${mode === entry.id ? "active" : ""} ${(entry.id === "content" || entry.id === "custom") && !ai ? "disabled" : ""}`}>
                <input
                  type="radio"
                  name="regroup-mode"
                  checked={mode === entry.id}
                  disabled={(entry.id === "content" || entry.id === "custom") && !ai}
                  onChange={() => { setMode(entry.id); setProposal(null); }}
                />
                <span>
                  <strong>{message(locale, entry.labelKey)}</strong>
                  <small>{entry.id === "content"
                    ? (locale === "zh" ? "理解标题和网址的语义" : "Understand title and URL meaning")
                    : entry.id === "time"
                      ? (locale === "zh" ? "今天、本周、更早" : "Today, this week, earlier")
                      : entry.id === "domain"
                        ? (locale === "zh" ? "按网站来源归类" : "Group by website")
                        : (locale === "zh" ? "用你的规则整理" : "Use your own rule")}</small>
                </span>
                <em>{entry.id === "content" || entry.id === "custom" ? "AI" : (locale === "zh" ? "本地" : "Local")}</em>
              </label>
            ))}
          </div>
          </div>

          {needsAi && (
            <label className="tn-instruction-field">
              <span>{mode === "custom" ? (locale === "zh" ? "你的整理规则" : "Your rule") : (locale === "zh" ? "补充要求（可选）" : "Extra instruction (optional)")}</span>
              <input
                className="tn-modal-input"
                value={instruction}
                placeholder={locale === "zh" ? "例如：按背景、证据、反例、结论" : "e.g. context, evidence, counterexamples, conclusion"}
                onChange={(event) => setInstruction(event.target.value)}
              />
            </label>
          )}

          <p className="tn-modal-scope">{message(locale, "v2OrganizeScope", { count: scopePageIds.length, meta: needsAi ? message(locale, "v2OrganizeMetaHint") : "" })}</p>
          {!ai && needsAi && <p className="tn-modal-warn">{message(locale, "v2OrganizeLocalOnly")}</p>}

          {!proposal ? (
            <button type="button" className="tn-primary tn-modal-primary" disabled={busy || scopePageIds.length === 0 || (needsAi && !ai)} onClick={() => void generate()}>
              {busy ? message(locale, "v2OrganizeGenerating") : message(locale, "v2OrganizeGenerate")}
            </button>
          ) : (
            <div className="tn-proposal-preview">
              {grouped.map(([groupId, assignments]) => (
                <div key={groupId} className="tn-proposal-group">
                  <strong>{groupNameOf(groupId)} <em>{assignments.length} {locale === "zh" ? "页" : "pages"}</em></strong>
                  <ul>
                    {assignments.map((assignment) => (
                      <li key={assignment.cardId}>
                        {task.pages[assignment.cardId]?.title ?? assignment.cardId}
                        {assignment.reason ? <small> · {assignment.reason}</small> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {proposal.summary && <p className="tn-proposal-summary">{proposal.summary}</p>}
              <div className="tn-modal-actions">
                <button type="button" className="tn-secondary" onClick={() => setProposal(null)}>{message(locale, "v2OrganizeRegenerate")}</button>
                <button type="button" className="tn-primary" onClick={apply}>{message(locale, "v2OrganizeApply")}</button>
              </div>
            </div>
          )}

          {error && <p className="tn-modal-error">{error}</p>}
        </div>
      </div>
    </div>
  );
}
