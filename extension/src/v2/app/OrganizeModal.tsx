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

  const scopePageIds = useMemo(() => {
    const candidates = Object.values(task.pages).filter((page) => page.status !== "excluded");
    const unassigned = candidates.filter((page) => !task.sections.some((section) => section.pageIds.includes(page.id)));
    return (unassigned.length > 0 ? unassigned : candidates).map((page) => page.id);
  }, [task]);

  const [mode, setMode] = useState<RegroupMode>(ai ? "content" : "time");
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

  const groupNameOf = (groupId: string) => proposal?.groups.find((group) => group.id === groupId)?.name ?? "…";
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
          <strong>✦ {message(locale, "v2AiOneClickOrganize")}</strong>
          <button type="button" onClick={onClose}>×</button>
        </header>

        <div className="tn-modal-body">
          <div className="tn-mode-list" role="group">
            {MODES.map((entry) => (
              <label key={entry.id} className={mode === entry.id ? "active" : ""}>
                <input type="radio" name="regroup-mode" checked={mode === entry.id} onChange={() => { setMode(entry.id); setProposal(null); }} />
                {message(locale, entry.labelKey)}
              </label>
            ))}
          </div>

          {needsAi && (
            <input
              className="tn-modal-input"
              value={instruction}
              placeholder={mode === "custom" ? "如：按背景、证据、反例、结论" : ""}
              onChange={(event) => setInstruction(event.target.value)}
            />
          )}

          <p className="tn-modal-scope">{message(locale, "v2OrganizeScope", { count: scopePageIds.length, meta: needsAi ? message(locale, "v2OrganizeMetaHint") : "" })}</p>
          {!ai && needsAi && <p className="tn-modal-warn">{message(locale, "v2OrganizeLocalOnly")}</p>}

          {!proposal ? (
            <button type="button" className="tn-primary" disabled={busy || scopePageIds.length === 0 || (needsAi && !ai)} onClick={() => void generate()}>
              {busy ? message(locale, "v2OrganizeGenerating") : message(locale, "v2OrganizeGenerate")}
            </button>
          ) : (
            <div className="tn-proposal-preview">
              {grouped.map(([groupId, assignments]) => (
                <div key={groupId} className="tn-proposal-group">
                  <strong>{groupNameOf(groupId)} <em>{assignments.length}</em></strong>
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
