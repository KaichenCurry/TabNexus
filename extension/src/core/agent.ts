import { normalizeUrl } from "./url";
import type {
  AgentAction,
  AgentCommandRequest,
  AgentPlan,
  AgentScope,
  Card,
  CardStatus,
  Locale,
  OpenTab,
  Workspace
} from "./types";

type AgentSelection = { tabs: OpenTab[]; cards: Card[] };

function uniqueBy<T>(items: T[], key: (item: T) => string | number): T[] {
  return [...new Map(items.map((item) => [key(item), item] as const)).values()];
}

export function createAgentCommandRequest(
  workspace: Workspace,
  locale: Locale,
  scope: AgentScope,
  instruction: string,
  selection: AgentSelection,
  openTabs: OpenTab[]
): AgentCommandRequest {
  const cardsByUrl = new Map(
    Object.values(workspace.cards).flatMap((card) =>
      card.url ? [[normalizeUrl(card.url), card] as const] : []
    )
  );

  const scopedTabs = scope === "selection"
    ? selection.tabs.filter((tab) => tab.supported)
    : openTabs.filter((tab) => tab.supported && cardsByUrl.has(normalizeUrl(tab.url)));
  const selectedCardsFromTabs = scopedTabs.flatMap((tab) => {
    const card = cardsByUrl.get(normalizeUrl(tab.url));
    return card ? [card] : [];
  });
  const scopedCards = scope === "selection"
    ? uniqueBy([...selection.cards, ...selectedCardsFromTabs], (card) => card.id)
    : Object.values(workspace.cards);
  const allowedCardIds = new Set(scopedCards.map((card) => card.id));

  return {
    locale,
    scope,
    instruction: instruction.trim(),
    workspace: { id: workspace.id, name: workspace.name },
    cards: scopedCards.map((card) => ({
      id: card.id,
      title: card.title,
      url: card.url,
      type: card.type,
      status: card.status,
      groupId: card.groupId,
      savedAt: card.savedAt,
      lastAccessedAt: card.lastAccessedAt
    })),
    groups: workspace.groupOrder.map((groupId) => workspace.groups[groupId]).filter(Boolean).map((group) => ({
      id: group.id,
      name: group.name,
      cardIds: group.cardIds.filter((cardId) => allowedCardIds.has(cardId))
    })),
    tabs: uniqueBy(scopedTabs, (tab) => tab.id).map((tab) => ({
      id: tab.id,
      title: tab.title,
      url: tab.url,
      pinned: tab.pinned,
      savedCardId: cardsByUrl.get(normalizeUrl(tab.url))?.id,
      lastAccessedAt: tab.lastAccessedAt
    }))
  };
}

export function buildAgentPlanPrompt(request: AgentCommandRequest): string {
  const language = request.locale === "zh" ? "Simplified Chinese" : "English";
  return [
    "You are TabNexus's safe workspace and browser-tab operator.",
    "Interpret the user's intent literally. Do not force every request into topic grouping.",
    `Write summary, rationale, generated names, and organize instructions in ${language}.`,
    "Use only ids present in the supplied context. Never invent card, tab, group, or workspace ids.",
    "Never delete data. Never close pinned tabs. A close_tabs action is saved by TabNexus before the browser tab is closed.",
    "The scope is authoritative. For selection scope, operate only on the supplied selected cards and tabs.",
    "When the user asks to classify, group, sort, merge groups, or reorganize sources, return exactly one organize action. Preserve the user's requested basis in its instruction; include saved cardIds and unsaved tabIds that should be analyzed.",
    "Use move_sources for a direct move to a named/existing group without semantic classification.",
    "Use save_tabs, close_tabs, or reopen_cards for browser-tab operations. Use set_status for unread/read/adopted.",
    "Use suggest_structure only when the user asks for relationships, a graph, or task structure, and only for workspace scope.",
    "For unsupported or ambiguous requests, return no actions and explain what the user can clarify in summary.",
    "Return JSON only with this shape:",
    '{"summary":"...","rationale":"...","actions":[{"type":"organize","cardIds":["..."],"tabIds":[1],"instruction":"..."}]}',
    "Allowed action shapes:",
    JSON.stringify([
      { type: "organize", cardIds: ["card id"], tabIds: [123], instruction: "classification basis" },
      { type: "rename_workspace", name: "new name" },
      { type: "create_group", name: "group name", color: "#7A6EDC" },
      { type: "rename_group", groupId: "group id", name: "new name" },
      { type: "move_sources", cardIds: ["card id"], tabIds: [123], targetGroupId: "group id or null", targetGroupName: "new group name when needed" },
      { type: "set_status", cardIds: ["card id"], status: "unread | read | adopted" },
      { type: "save_tabs", tabIds: [123], targetGroupId: "group id or null" },
      { type: "close_tabs", tabIds: [123] },
      { type: "reopen_cards", cardIds: ["card id"] },
      { type: "suggest_structure" }
    ]),
    "Context:",
    JSON.stringify(request)
  ].join("\n");
}

function text(value: unknown, label: string, maxLength = 80): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Invalid ${label}`);
  return value.trim().slice(0, maxLength);
}

function ids<T extends string | number>(
  value: unknown,
  allowed: Set<T>,
  label: string
): T[] {
  if (!Array.isArray(value)) throw new Error(`Invalid ${label}`);
  const values = [...new Set(value)] as T[];
  if (values.some((id) => !allowed.has(id))) throw new Error(`Unknown ${label}`);
  return values;
}

function isStatus(value: unknown): value is CardStatus {
  return value === "unread" || value === "read" || value === "adopted";
}

export function validateAgentPlan(value: unknown, request: AgentCommandRequest): AgentPlan {
  if (!value || typeof value !== "object") throw new Error("Invalid agent plan");
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.actions) || raw.actions.length > 12) throw new Error("Invalid agent actions");

  const allowedCards = new Set(request.cards.map((card) => card.id));
  const allowedTabs = new Set(request.tabs.map((tab) => tab.id));
  const allowedGroups = new Set(request.groups.map((group) => group.id));
  const pinnedTabs = new Set(request.tabs.filter((tab) => tab.pinned).map((tab) => tab.id));

  const actions = raw.actions.map((candidate): AgentAction => {
    if (!candidate || typeof candidate !== "object") throw new Error("Invalid agent action");
    const action = candidate as Record<string, unknown>;
    switch (action.type) {
      case "organize": {
        const cardIds = ids(action.cardIds ?? [], allowedCards, "organize card ids");
        const tabIds = ids(action.tabIds ?? [], allowedTabs, "organize tab ids");
        if (!cardIds.length && !tabIds.length) throw new Error("Organize action is empty");
        return {
          type: "organize",
          cardIds,
          tabIds,
          instruction: text(action.instruction ?? request.instruction, "organize instruction", 600)
        };
      }
      case "rename_workspace":
        if (request.scope !== "workspace") throw new Error("Workspace rename is outside selection scope");
        return { type: "rename_workspace", name: text(action.name, "workspace name", 60) };
      case "create_group": {
        const color = typeof action.color === "string" && /^#[0-9A-F]{6}$/i.test(action.color)
          ? action.color.toUpperCase()
          : undefined;
        return { type: "create_group", name: text(action.name, "group name", 60), color };
      }
      case "rename_group":
        if (request.scope !== "workspace") throw new Error("Group rename is outside selection scope");
        if (typeof action.groupId !== "string" || !allowedGroups.has(action.groupId)) throw new Error("Unknown group id");
        return { type: "rename_group", groupId: action.groupId, name: text(action.name, "group name", 60) };
      case "move_sources": {
        const cardIds = ids(action.cardIds ?? [], allowedCards, "move card ids");
        const tabIds = ids(action.tabIds ?? [], allowedTabs, "move tab ids");
        if (!cardIds.length && !tabIds.length) throw new Error("Move action is empty");
        const hasTargetId = Object.prototype.hasOwnProperty.call(action, "targetGroupId");
        const targetGroupId = action.targetGroupId === null
          ? null
          : typeof action.targetGroupId === "string" && allowedGroups.has(action.targetGroupId)
            ? action.targetGroupId
            : undefined;
        const targetGroupName = typeof action.targetGroupName === "string" && action.targetGroupName.trim()
          ? action.targetGroupName.trim().slice(0, 60)
          : undefined;
        if ((!hasTargetId || targetGroupId === undefined) && !targetGroupName) throw new Error("Move target is missing");
        return { type: "move_sources", cardIds, tabIds, targetGroupId, targetGroupName };
      }
      case "set_status": {
        const cardIds = ids(action.cardIds ?? [], allowedCards, "status card ids");
        if (!cardIds.length || !isStatus(action.status)) throw new Error("Invalid status action");
        return { type: "set_status", cardIds, status: action.status };
      }
      case "save_tabs": {
        const tabIds = ids(action.tabIds ?? [], allowedTabs, "save tab ids");
        if (!tabIds.length) throw new Error("Save action is empty");
        const targetGroupId = action.targetGroupId === null
          ? null
          : typeof action.targetGroupId === "string" && allowedGroups.has(action.targetGroupId)
            ? action.targetGroupId
            : undefined;
        if (action.targetGroupId !== undefined && targetGroupId === undefined) throw new Error("Unknown save target group");
        return { type: "save_tabs", tabIds, targetGroupId };
      }
      case "close_tabs": {
        const tabIds = ids(action.tabIds ?? [], allowedTabs, "close tab ids");
        if (!tabIds.length || tabIds.some((id) => pinnedTabs.has(id))) throw new Error("Pinned or empty close action");
        return { type: "close_tabs", tabIds };
      }
      case "reopen_cards": {
        const cardIds = ids(action.cardIds ?? [], allowedCards, "reopen card ids");
        if (!cardIds.length) throw new Error("Reopen action is empty");
        return { type: "reopen_cards", cardIds };
      }
      case "suggest_structure":
        if (request.scope !== "workspace") throw new Error("Structure suggestion is outside selection scope");
        return { type: "suggest_structure" };
      default:
        throw new Error("Unsupported agent action");
    }
  });

  if (actions.some((action) => action.type === "organize") && actions.length !== 1) {
    throw new Error("Organize must be reviewed as a standalone action");
  }
  if (actions.some((action) => action.type === "suggest_structure") && actions.length !== 1) {
    throw new Error("Structure suggestion must be reviewed as a standalone action");
  }

  return {
    source: "ai",
    scope: request.scope,
    summary: typeof raw.summary === "string" && raw.summary.trim()
      ? raw.summary.trim().slice(0, 240)
      : request.instruction,
    rationale: typeof raw.rationale === "string" && raw.rationale.trim()
      ? raw.rationale.trim().slice(0, 500)
      : undefined,
    actions
  };
}
