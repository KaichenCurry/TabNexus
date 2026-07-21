import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { exportWorkspaceJson, exportWorkspaceMarkdown, safeExportFilename } from "../core/export";
import { copyText, downloadText } from "../core/platform";
import type {
  AgentAction,
  AgentActivity,
  AgentPlan,
  Card,
  GroupingProposal,
  Locale,
  OpenTab,
  StructureProposal,
  Workspace
} from "../core/types";
import { displayDomain, isSupportedUrl } from "../core/url";
import { message } from "../i18n";
import { Modal } from "../components/Modal";

export function NoteModal({
  card,
  locale,
  onSave,
  onClose
}: {
  card: Card;
  locale: Locale;
  onSave: (note: string) => void;
  onClose: () => void;
}) {
  const [note, setNote] = useState(card.note);
  return (
    <Modal onClose={onClose} label={message(locale, "noteTitle")} closeLabel={message(locale, "closeModal")} className="action-modal note-modal">
      <div className="action-modal-icon note" aria-hidden="true">✎</div>
      <div className="action-modal-copy">
        <h2>{message(locale, "noteTitle")}</h2>
        <p>{message(locale, "noteHint", { title: card.title })}</p>
      </div>
      <form onSubmit={(event) => { event.preventDefault(); onSave(note); }}>
        <label className="modal-field">
          <span>{message(locale, "noteFieldLabel")}</span>
          <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder={message(locale, "notePlaceholder")} autoFocus maxLength={2_000} />
        </label>
        <div className="modal-actions action-modal-actions">
          <button className="button secondary" type="button" onClick={onClose}>{message(locale, "cancel")}</button>
          <button className="button primary" type="submit">{message(locale, "saveNote")}</button>
        </div>
      </form>
    </Modal>
  );
}

export function ExportModal({
  workspace,
  locale,
  onToast,
  onClose
}: {
  workspace: Workspace;
  locale: Locale;
  onToast: (value: string) => void;
  onClose: () => void;
}) {
  const [format, setFormat] = useState<"md" | "json">("md");
  const value = useMemo(
    () => format === "md" ? exportWorkspaceMarkdown(workspace, locale) : exportWorkspaceJson(workspace),
    [format, locale, workspace]
  );
  const handleCopy = async () => {
    await copyText(value);
    onToast(message(locale, "copied"));
  };
  const handleDownload = () => {
    downloadText(
      safeExportFilename(workspace, format),
      value,
      format === "md" ? "text/markdown;charset=utf-8" : "application/json;charset=utf-8"
    );
    onToast(message(locale, "downloaded"));
  };
  return (
    <Modal onClose={onClose} label={message(locale, "exportTitle")} closeLabel={message(locale, "closeModal")} className="review-modal export-modal">
      <div className="review-modal-header">
        <span className="review-modal-icon export" aria-hidden="true">⇧</span>
        <div><span className="review-modal-eyebrow">{message(locale, "exportEyebrow")}</span><h2>{message(locale, "exportTitle")}</h2><p>{message(locale, "exportHint")}</p></div>
      </div>
      <div className="segment-control">
        <button className={format === "md" ? "active" : ""} type="button" onClick={() => setFormat("md")}>{message(locale, "markdown")}</button>
        <button className={format === "json" ? "active" : ""} type="button" onClick={() => setFormat("json")}>{message(locale, "json")}</button>
      </div>
      <pre className="export-preview">{value}</pre>
      <div className="modal-actions review-modal-actions">
        <button className="button secondary" type="button" onClick={handleDownload}>{message(locale, "download")}</button>
        <button className="button primary" type="button" onClick={handleCopy}>{message(locale, "copy")}</button>
      </div>
    </Modal>
  );
}

export function ProposalModal({
  proposal,
  workspace,
  locale,
  onApply,
  onClose
}: {
  proposal: GroupingProposal;
  workspace: Workspace;
  locale: Locale;
  onApply: (proposal: GroupingProposal) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<GroupingProposal>(() => structuredClone(proposal));
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(new Set());
  const groupOptions = [
    ...workspace.groupOrder.map((id) => ({ id, name: workspace.groups[id]?.name ?? id, color: workspace.groups[id]?.color ?? "#8A93A3" })),
    ...draft.groups.map((group) => ({ id: group.id, name: group.name, color: group.color }))
  ];
  const assignmentCounts = new Map<string, number>();
  for (const assignment of draft.assignments) {
    assignmentCounts.set(assignment.groupId, (assignmentCounts.get(assignment.groupId) ?? 0) + 1);
  }
  const targetGroups = groupOptions.filter((group) => assignmentCounts.has(group.id));
  const changedCount = draft.assignments.filter((assignment) => workspace.cards[assignment.cardId]?.groupId !== assignment.groupId).length;
  const keptCount = draft.assignments.length - changedCount;
  const usedNewGroupCount = draft.groups.filter((group) => assignmentCounts.has(group.id)).length;
  const hasInvalidGroupName = draft.groups.some((group) => !group.name.trim());
  const toggleGroup = (groupId: string) => setExpandedGroupIds((current) => {
    const next = new Set(current);
    if (next.has(groupId)) next.delete(groupId);
    else next.add(groupId);
    return next;
  });
  const applyEdited = () => {
    const usedGroupIds = new Set(draft.assignments.map((assignment) => assignment.groupId));
    onApply({
      ...draft,
      groups: draft.groups.filter((group) => usedGroupIds.has(group.id)).map((group) => ({ ...group, name: group.name.trim() }))
    });
  };
  return (
    <Modal onClose={onClose} label={message(locale, proposal.source === "ai" ? "aiPreview" : "domainPreview")} closeLabel={message(locale, "closeModal")} className="review-modal proposal-modal">
      <div className="review-modal-header proposal-review-header">
        <span className="review-modal-icon ai" aria-hidden="true">✦</span>
        <div>
          <h2>{message(locale, proposal.source === "ai" ? "aiPreview" : "domainPreview")}</h2>
          <p>{message(locale, changedCount ? "aiChangeSummary" : "aiNoChangeSummary", { changed: changedCount, groups: targetGroups.length, kept: keptCount })}</p>
        </div>
      </div>
      <div className="proposal-overview" aria-label={message(locale, "aiChangeOverview")}>
        <div><strong>{usedNewGroupCount}</strong><span>{message(locale, "aiNewGroupMetric")}</span></div>
        <div><strong>{changedCount}</strong><span>{message(locale, "aiMovedMetric")}</span></div>
        <div><strong>{keptCount}</strong><span>{message(locale, "aiKeptMetric")}</span></div>
      </div>
      <section className="proposal-basis-card" aria-label={message(locale, "aiRationaleLabel")}>
        <span className="proposal-basis-icon" aria-hidden="true">✦</span>
        <div>
          <strong>{message(locale, "aiRationaleLabel")}</strong>
          <p>{draft.basis || draft.summary || message(locale, "aiRationaleFallback")}</p>
        </div>
      </section>
      <div className="proposal-section-heading destination-heading"><strong>{message(locale, "aiDestinationGroups")}</strong><span>{message(locale, "aiDestinationHint")}</span></div>
      <div className="proposal-destinations">
        {targetGroups.map((group) => {
          const proposedGroup = draft.groups.find((candidate) => candidate.id === group.id);
          const assignments = draft.assignments.filter((assignment) => assignment.groupId === group.id);
          const expanded = expandedGroupIds.has(group.id);
          return (
            <section className={`proposal-destination ${expanded ? "expanded" : ""}`} key={group.id} style={{ "--proposal-color": group.color } as CSSProperties}>
              <div className="proposal-destination-head">
                <i />
                {proposedGroup ? (
                  <input
                    value={proposedGroup.name}
                    onChange={(event) => setDraft((current) => ({
                      ...current,
                      groups: current.groups.map((candidate) => candidate.id === group.id ? { ...candidate, name: event.target.value } : candidate)
                    }))}
                    maxLength={40}
                    aria-label={message(locale, "aiRenameGroup", { name: proposedGroup.name })}
                  />
                ) : <strong>{group.name}</strong>}
                {proposedGroup && <span className="proposal-new-chip">{message(locale, "aiNewLabel")}</span>}
                <span className="proposal-destination-count">{message(locale, "aiGroupSourceCount", { count: assignments.length })}</span>
                <button
                  type="button"
                  className="proposal-expand-button"
                  onClick={() => toggleGroup(group.id)}
                  aria-label={message(locale, expanded ? "aiCollapseGroup" : "aiExpandGroup", { name: group.name, count: assignments.length })}
                  title={message(locale, expanded ? "aiCollapseGroup" : "aiExpandGroup", { name: group.name, count: assignments.length })}
                >{expanded ? "−" : "+"}</button>
              </div>
              {expanded && (
                <div className="proposal-list compact">
                  {assignments.map((assignment) => {
                    const card = workspace.cards[assignment.cardId];
                    const previousGroup = card?.groupId ? workspace.groups[card.groupId]?.name : message(locale, "aiUngrouped");
                    return (
                      <div className="proposal-row" key={assignment.cardId}>
                        <div className="proposal-card-identity">
                          {card?.favicon
                            ? <img className="proposal-card-favicon" src={card.favicon} alt="" />
                            : <span className="proposal-card-fallback" aria-hidden="true">{card?.title?.trim().slice(0, 1).toUpperCase() || "W"}</span>}
                          <div className="proposal-card-copy">
                            <strong>{card?.title}</strong>
                            <span className="proposal-card-domain">{displayDomain(card?.url) || card?.type.toUpperCase()}</span>
                            <small>{message(locale, "aiFromGroup", { group: previousGroup ?? message(locale, "aiUngrouped") })} · {assignment.reason || message(locale, "aiRationaleFallback")}</small>
                          </div>
                        </div>
                        <label className="proposal-target">
                          <span>{message(locale, "aiTargetGroup")}</span>
                          <select
                            value={assignment.groupId}
                            onChange={(event) => setDraft((current) => ({
                              ...current,
                              assignments: current.assignments.map((candidate) => candidate.cardId === assignment.cardId
                                ? { ...candidate, groupId: event.target.value }
                                : candidate)
                            }))}
                            aria-label={message(locale, "aiTargetFor", { title: card?.title ?? "" })}
                          >
                            {groupOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                          </select>
                        </label>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>
      <div className="modal-actions review-modal-actions">
        <button className="button secondary" type="button" onClick={onClose}>{message(locale, "cancel")}</button>
        <button className="button primary" type="button" onClick={applyEdited} disabled={hasInvalidGroupName}>{message(locale, "applyEditedGrouping")}</button>
      </div>
    </Modal>
  );
}

export function AgentPlanModal({
  plan,
  workspace,
  tabs,
  locale,
  onApply,
  onClose
}: {
  plan: AgentPlan;
  workspace: Workspace;
  tabs: OpenTab[];
  locale: Locale;
  onApply: () => void | Promise<void>;
  onClose: () => void;
}) {
  const [applying, setApplying] = useState(false);
  const t = (key: Parameters<typeof message>[1], vars?: Record<string, string | number>) =>
    message(locale, key, vars);
  const cardsById = workspace.cards;
  const tabsById = new Map(tabs.map((tab) => [tab.id, tab]));

  const actionCount = (action: AgentAction) => {
    if (action.type === "organize" || action.type === "move_sources") return action.cardIds.length + action.tabIds.length;
    if (action.type === "set_status" || action.type === "reopen_cards") return action.cardIds.length;
    if (action.type === "save_tabs" || action.type === "close_tabs") return action.tabIds.length;
    return 1;
  };
  const actionTitle = (action: AgentAction): string => {
    const count = actionCount(action);
    switch (action.type) {
      case "organize": return t("agentActionOrganize", { count });
      case "rename_workspace": return t("agentActionRenameWorkspace", { name: action.name });
      case "create_group": return t("agentActionCreateGroup", { name: action.name });
      case "rename_group": return t("agentActionRenameGroup", { name: action.name });
      case "move_sources": {
        const name = action.targetGroupName || (action.targetGroupId ? workspace.groups[action.targetGroupId]?.name : "");
        return name
          ? t("agentActionMoveSources", { count, name })
          : t("agentActionMoveUngrouped", { count });
      }
      case "set_status": return t("agentActionSetStatus", { count, status: t(action.status === "read" ? "statusRead" : action.status === "adopted" ? "statusAdopted" : "statusUnread") });
      case "save_tabs": return t("agentActionSaveTabs", { count });
      case "close_tabs": return t("agentActionCloseTabs", { count });
      case "reopen_cards": return t("agentActionReopenCards", { count });
      case "suggest_structure": return t("agentActionSuggestStructure");
    }
  };
  const actionIcon = (action: AgentAction) => ({
    organize: "✦",
    rename_workspace: "Aa",
    create_group: "+",
    rename_group: "Aa",
    move_sources: "→",
    set_status: "✓",
    save_tabs: "↓",
    close_tabs: "−",
    reopen_cards: "↗",
    suggest_structure: "⌘"
  }[action.type]);
  const actionTargets = (action: AgentAction) => {
    const cardIds = "cardIds" in action ? action.cardIds : [];
    const tabIds = "tabIds" in action ? action.tabIds : [];
    return [
      ...cardIds.map((id) => ({ key: `card:${id}`, title: cardsById[id]?.title ?? id, favicon: cardsById[id]?.favicon })),
      ...tabIds.map((id) => ({ key: `tab:${id}`, title: tabsById.get(id)?.title ?? String(id), favicon: tabsById.get(id)?.favicon }))
    ].slice(0, 4);
  };
  const handleApply = async () => {
    setApplying(true);
    try {
      await onApply();
    } finally {
      setApplying(false);
    }
  };

  return (
    <Modal onClose={onClose} label={t("agentPlanTitle")} closeLabel={t("closeModal")} className="review-modal agent-plan-modal">
      <div className="review-modal-header agent-plan-header">
        <span className="review-modal-icon ai" aria-hidden="true">✦</span>
        <div>
          <span className="review-modal-eyebrow">{t("agentPlanEyebrow")}</span>
          <h2>{t("agentPlanTitle")}</h2>
          <p>{t("agentPlanHint")}</p>
        </div>
        <span className="agent-plan-scope">{t(plan.scope === "workspace" ? "agentPlanScopeWorkspace" : "agentPlanScopeSelection")}</span>
      </div>
      <section className="agent-plan-summary">
        <strong>{plan.summary}</strong>
        {plan.rationale && <p><span>✦ {t("agentPlanRationale")}</span>{plan.rationale}</p>}
      </section>
      <div className="proposal-section-heading agent-plan-section-heading">
        <strong>{t("agentPlanActions", { count: plan.actions.length })}</strong>
      </div>
      <div className="agent-plan-list">
        {plan.actions.map((action, index) => {
          const targets = actionTargets(action);
          return (
            <article className={`agent-plan-row action-${action.type}`} key={`${action.type}:${index}`}>
              <span className="agent-plan-action-icon" aria-hidden="true">{actionIcon(action)}</span>
              <div className="agent-plan-action-copy">
                <strong>{actionTitle(action)}</strong>
                {targets.length > 0 && (
                  <div className="agent-plan-targets">
                    {targets.map((target) => (
                      <span key={target.key} title={target.title}>
                        {target.favicon ? <img src={target.favicon} alt="" /> : <i aria-hidden="true">{target.title.slice(0, 1).toUpperCase()}</i>}
                        {target.title}
                      </span>
                    ))}
                    {actionCount(action) > targets.length && <em>+{actionCount(action) - targets.length}</em>}
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>
      <p className="agent-plan-safety"><span aria-hidden="true">✓</span>{t("agentPlanSafety")}</p>
      <div className="modal-actions review-modal-actions">
        <button className="button secondary" type="button" onClick={onClose} disabled={applying}>{t("cancel")}</button>
        <button className="button primary" type="button" onClick={() => void handleApply()} disabled={applying}>{applying ? t("aiLoadingShort") : t("agentPlanApply")}</button>
      </div>
    </Modal>
  );
}

export function AgentActivityModal({
  activities,
  locale,
  onClear,
  onReviewProposal,
  onClose
}: {
  activities: AgentActivity[];
  locale: Locale;
  onClear: () => void | Promise<void>;
  onReviewProposal: (activity: AgentActivity) => void;
  onClose: () => void;
}) {
  const t = (key: Parameters<typeof message>[1], vars?: Record<string, string | number>) =>
    message(locale, key, vars);
  const toolLabel = (tool: AgentActivity["tool"]) => t({
    read_workspace: "agentToolReadWorkspace",
    search_cards: "agentToolSearchCards",
    add_card: "agentToolAddCard",
    add_cards: "agentToolAddCards",
    write_report: "agentToolWriteReport",
    propose_structure: "agentToolProposeStructure",
    edit_workspace: "agentToolEditWorkspace",
    manage_workspaces: "agentToolManageWorkspaces",
    delete_workspace_items: "agentToolDeleteWorkspaceItems",
    read_tab_workbench: "agentToolReadTabWorkbench",
    manage_tab_workbench: "agentToolManageTabWorkbench",
    dismiss_recent_tabs: "agentToolDismissRecentTabs",
    sync_browser_tabs: "agentToolSyncBrowserTabs",
    close_browser_tabs: "agentToolCloseBrowserTabs",
    export_workspace: "agentToolExportWorkspace",
    manage_preferences: "agentToolManagePreferences",
    manage_agent_activity: "agentToolManageAgentActivity"
  }[tool] as Parameters<typeof message>[1]);
  const statusLabel = (status: AgentActivity["status"]) => t(status === "running"
    ? "agentActivityRunning"
    : status === "success" ? "agentActivitySuccess" : "agentActivityError");
  const formatTime = (value: string) => new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));

  return (
    <Modal onClose={onClose} label={t("agentActivityTitle")} closeLabel={t("closeModal")} className="review-modal agent-activity-modal">
      <div className="review-modal-header agent-activity-header">
        <span className="review-modal-icon agent" aria-hidden="true">⌘</span>
        <div>
          <span className="review-modal-eyebrow">MCP · LOCAL BRIDGE</span>
          <h2>{t("agentActivityTitle")}</h2>
          <p>{t("agentActivityHint")}</p>
        </div>
        {activities.length > 0 && <span className="agent-activity-total">{t("agentActivityCount", { count: activities.length })}</span>}
      </div>
      {activities.length === 0 ? (
        <section className="agent-activity-empty">
          <span aria-hidden="true">⌁</span>
          <strong>{t("agentActivityEmptyTitle")}</strong>
          <p>{t("agentActivityEmptyBody")}</p>
        </section>
      ) : (
        <div className="agent-activity-list">
          {activities.map((activity) => (
            <article className={`agent-activity-row is-${activity.status}`} key={activity.id}>
              <span className="agent-activity-tool-icon" aria-hidden="true">{{
                read_workspace: "↙",
                search_cards: "⌕",
                add_card: "+",
                add_cards: "＋",
                write_report: "▤",
                propose_structure: "⌁",
                edit_workspace: "✦",
                manage_workspaces: "▦",
                delete_workspace_items: "×",
                read_tab_workbench: "◫",
                manage_tab_workbench: "✓",
                dismiss_recent_tabs: "⌫",
                sync_browser_tabs: "↗",
                close_browser_tabs: "−",
                export_workspace: "⇩",
                manage_preferences: "⚙",
                manage_agent_activity: "◷"
              }[activity.tool]}</span>
              <div className="agent-activity-copy">
                <div>
                  <strong>{toolLabel(activity.tool)}</strong>
                  {activity.agentName && <em className="agent-activity-origin">{activity.agentName}</em>}
                  <span>{formatTime(activity.completedAt ?? activity.createdAt)}</span>
                </div>
                <p>{activity.summary}</p>
                {activity.error && <small>{activity.error}</small>}
                {activity.proposal && (
                  <button type="button" onClick={() => onReviewProposal(activity)}>{t("agentActivityReviewProposal")} <span>→</span></button>
                )}
              </div>
              <span className={`agent-activity-status is-${activity.status}`}><i />{statusLabel(activity.status)}</span>
            </article>
          ))}
        </div>
      )}
      <div className="modal-actions review-modal-actions agent-activity-actions">
        {activities.length > 0 && <button className="button secondary" type="button" onClick={() => void onClear()}>{t("agentActivityClear")}</button>}
        <button className="button primary" type="button" onClick={onClose}>{t("closeModal")}</button>
      </div>
    </Modal>
  );
}

export function NameModal({
  locale,
  title,
  subtitle,
  fieldLabel,
  initialValue,
  confirmLabel,
  icon,
  onSubmit,
  onClose
}: {
  locale: Locale;
  title: string;
  subtitle: string;
  fieldLabel: string;
  initialValue: string;
  confirmLabel: string;
  icon?: string;
  onSubmit: (value: string) => void | Promise<void>;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const [submitting, setSubmitting] = useState(false);
  const submit = async () => {
    const trimmed = value.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(trimmed);
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <Modal
      onClose={onClose}
      label={title}
      closeLabel={message(locale, "closeModal")}
      className="action-modal name-modal"
    >
      <div className="action-modal-icon name" aria-hidden="true">{icon ?? "Aa"}</div>
      <div className="action-modal-copy">
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      <form onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <label className="modal-field">
          <span>{fieldLabel}</span>
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onFocus={(event) => event.currentTarget.select()}
            maxLength={80}
            autoFocus
          />
        </label>
        <div className="modal-actions action-modal-actions">
          <button className="button secondary" type="button" onClick={onClose}>{message(locale, "cancel")}</button>
          <button className="button primary" type="submit" disabled={!value.trim() || submitting}>{confirmLabel}</button>
        </div>
      </form>
    </Modal>
  );
}

export function ConfirmModal({
  locale,
  title,
  body,
  confirmLabel,
  tone = "danger",
  onConfirm,
  onClose
}: {
  locale: Locale;
  title: string;
  body: string;
  confirmLabel: string;
  tone?: "danger" | "warning";
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const submitConfirmation = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <Modal
      onClose={onClose}
      label={title}
      closeLabel={message(locale, "closeModal")}
      className={`action-modal confirm-modal ${tone}`}
    >
      <div className={`action-modal-icon ${tone}`} aria-hidden="true">{tone === "danger" ? "!" : "↘"}</div>
      <div className="action-modal-copy">
        <h2>{title}</h2>
        <p>{body}</p>
      </div>
      <div className="modal-actions action-modal-actions">
        <button className="button secondary" type="button" onClick={onClose}>{message(locale, "cancel")}</button>
        <button className={`button ${tone === "danger" ? "danger-button" : "warning-button"}`} type="button" disabled={submitting} onClick={() => void submitConfirmation()}>{confirmLabel}</button>
      </div>
    </Modal>
  );
}

export function ManualCardModal({
  workspace,
  locale,
  initialGroupId,
  onSubmit,
  onClose
}: {
  workspace: Workspace;
  locale: Locale;
  initialGroupId?: string;
  onSubmit: (value: { title: string; url?: string; note?: string; groupId?: string }) => void | Promise<void>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [groupId, setGroupId] = useState(
    initialGroupId && workspace.groups[initialGroupId] ? initialGroupId : workspace.groupOrder[0] ?? ""
  );
  const [submitted, setSubmitted] = useState(false);
  const urlValid = !url.trim() || isSupportedUrl(url.trim());
  const submit = async () => {
    if (!title.trim() || !urlValid || submitted) return;
    setSubmitted(true);
    try {
      await onSubmit({
        title: title.trim(),
        url: url.trim() || undefined,
        note: note.trim() || undefined,
        groupId: groupId || undefined
      });
    } finally {
      setSubmitted(false);
    }
  };
  return (
    <Modal onClose={onClose} label={message(locale, "addSourceTitle")} closeLabel={message(locale, "closeModal")} className="action-modal manual-card-modal">
      <div className="action-modal-icon" aria-hidden="true">＋</div>
      <div className="action-modal-copy">
        <h2>{message(locale, "addSourceTitle")}</h2>
        <p>{message(locale, "addSourceHint")}</p>
      </div>
      <form className="modal-form-grid" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <label className="modal-field full">
          <span>{message(locale, "sourceTitleLabel")}</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} autoFocus />
        </label>
        <label className="modal-field full">
          <span>{message(locale, "sourceUrlLabel")}</span>
          <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://…" />
          {!urlValid && <small className="modal-field-error">{message(locale, "sourceUrlInvalid")}</small>}
        </label>
        {workspace.groupOrder.length > 0 && (
          <label className="modal-field full">
            <span>{message(locale, "sourceGroupLabel")}</span>
            <select value={groupId} onChange={(event) => setGroupId(event.target.value)}>
              {workspace.groupOrder.map((id) => <option key={id} value={id}>{workspace.groups[id]?.name}</option>)}
            </select>
          </label>
        )}
        <label className="modal-field full">
          <span>{message(locale, "sourceNoteLabel")}</span>
          <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={2_000} />
        </label>
        <div className="modal-actions action-modal-actions full">
          <button className="button secondary" type="button" onClick={onClose}>{message(locale, "cancel")}</button>
          <button className="button primary" type="submit" disabled={!title.trim() || !urlValid || submitted}>{message(locale, "addSource")}</button>
        </div>
      </form>
    </Modal>
  );
}

export function RelationModal({
  fromCard,
  toCard,
  locale,
  onSubmit,
  onClose
}: {
  fromCard: Card;
  toCard: Card;
  locale: Locale;
  onSubmit: (label: string) => void | Promise<void>;
  onClose: () => void;
}) {
  const [label, setLabel] = useState("");
  return (
    <Modal onClose={onClose} label={message(locale, "relationTitle")} closeLabel={message(locale, "closeModal")} className="action-modal relation-modal">
      <div className="action-modal-icon relation" aria-hidden="true">⌁</div>
      <div className="action-modal-copy">
        <h2>{message(locale, "relationTitle")}</h2>
        <p>{message(locale, "relationHint")}</p>
      </div>
      <div className="relation-route"><span>{fromCard.title}</span><i>→</i><span>{toCard.title}</span></div>
      <form onSubmit={(event) => { event.preventDefault(); void onSubmit(label); }}>
        <label className="modal-field">
          <span>{message(locale, "relationLabel")}</span>
          <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder={message(locale, "relationPlaceholder")} maxLength={40} autoFocus />
        </label>
        <div className="relation-presets">
          {(locale === "zh" ? ["支持", "反驳", "引用", "下一步"] : ["supports", "challenges", "cites", "next step"]).map((value) => (
            <button key={value} type="button" onClick={() => setLabel(value)}>{value}</button>
          ))}
        </div>
        <div className="modal-actions action-modal-actions">
          <button className="button secondary" type="button" onClick={onClose}>{message(locale, "cancel")}</button>
          <button className="button primary" type="submit">{message(locale, "createRelation")}</button>
        </div>
      </form>
    </Modal>
  );
}

export function StructureProposalModal({
  proposal,
  workspace,
  locale,
  onApply,
  onClose
}: {
  proposal: StructureProposal;
  workspace: Workspace;
  locale: Locale;
  onApply: () => void;
  onClose: () => void;
}) {
  return (
    <Modal onClose={onClose} label={message(locale, "structurePreview")} closeLabel={message(locale, "closeModal")} className="review-modal structure-modal">
      <div className="review-modal-header">
        <span className="review-modal-icon ai" aria-hidden="true">✦</span>
        <div><span className="review-modal-eyebrow">{message(locale, "aiReviewEyebrow")}</span><h2>{message(locale, "structurePreview")}</h2><p>{proposal.summary || message(locale, "structurePreviewHint")}</p></div>
      </div>
      <div className="structure-proposal-list">
        {proposal.edges.map((edge, index) => (
          <div className="structure-proposal-row" key={`${edge.fromCardId}:${edge.toCardId}:${index}`}>
            <span>{workspace.cards[edge.fromCardId]?.title}</span>
            <i>→</i>
            <span>{workspace.cards[edge.toCardId]?.title}</span>
            <strong>{edge.label || message(locale, "relationDefault")}</strong>
          </div>
        ))}
      </div>
      <div className="modal-actions review-modal-actions">
        <button className="button secondary" type="button" onClick={onClose}>{message(locale, "cancel")}</button>
        <button className="button primary" type="button" onClick={onApply}>{message(locale, "applyStructure")}</button>
      </div>
    </Modal>
  );
}
