import { createId } from "./id";
import { workspaceRevision } from "./collaboration";
import {
  createEmptyWorkspace,
  deleteCard,
  deleteGroup,
  removeWorkspace,
  renameWorkspace,
  updateWorkspace,
  workspaceCardOrder
} from "./workspace";
import type {
  AppState,
  Card,
  CollaborationToolRequest,
  CollaborationToolResult,
  Locale,
  Workspace,
  WorkspaceIndexItem
} from "./types";

function hash(prefix: string, value: unknown): string {
  let result = 0x811c9dc5;
  for (const character of JSON.stringify(value)) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 0x01000193);
  }
  return `${prefix}_${(result >>> 0).toString(16).padStart(8, "0")}`;
}

export function appStateRevision(state: AppState): string {
  return hash("appsr", {
    activeWorkspaceId: state.activeWorkspaceId,
    workspaceOrder: state.workspaceOrder,
    revisions: state.workspaceOrder.map((id) => [id, state.workspaces[id] ? workspaceRevision(state.workspaces[id]) : null])
  });
}

export function workspaceIndex(state: AppState): WorkspaceIndexItem[] {
  return state.workspaceOrder.flatMap((id) => {
    const workspace = state.workspaces[id];
    return workspace ? [{
      id: workspace.id,
      name: workspace.name,
      updatedAt: workspace.updatedAt,
      revision: workspaceRevision(workspace),
      groupCount: workspace.groupOrder.length,
      cardCount: Object.keys(workspace.cards).length,
      edgeCount: workspace.edges.length
    }] : [];
  });
}

function safeOperationId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9._:-]{1,120}$/.test(value)) {
    throw new Error("operationId must use 1-120 safe characters");
  }
  return value;
}

function requiredName(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("Workspace name is required");
  return value.trim().slice(0, 120);
}

function knownWorkspace(state: AppState, workspaceId: unknown): Workspace {
  if (typeof workspaceId !== "string" || !state.workspaces[workspaceId]) {
    throw new Error(`Unknown workspace id: ${String(workspaceId)}`);
  }
  return state.workspaces[workspaceId];
}

function cloneWorkspace(source: Workspace, name?: string): Workspace {
  const now = new Date().toISOString();
  const workspaceId = createId("ws");
  const groupIds = new Map(source.groupOrder.map((id) => [id, createId("group")]));
  const cardIds = new Map(Object.keys(source.cards).map((id) => [id, createId("card")]));
  const cards = Object.fromEntries(Object.entries(source.cards).map(([oldId, card]) => {
    const id = cardIds.get(oldId)!;
    return [id, {
      ...structuredClone(card),
      id,
      groupId: card.groupId ? groupIds.get(card.groupId) ?? null : null,
      savedAt: card.savedAt ?? now
    }];
  }));
  const groups = Object.fromEntries(source.groupOrder.map((oldId) => {
    const group = source.groups[oldId];
    const id = groupIds.get(oldId)!;
    return [id, { ...structuredClone(group), id, cardIds: group.cardIds.flatMap((cardId) => cardIds.get(cardId) ?? []) }];
  }));
  return {
    id: workspaceId,
    name: name?.trim().slice(0, 120) || `${source.name} copy`,
    createdAt: now,
    updatedAt: now,
    groupOrder: source.groupOrder.map((id) => groupIds.get(id)!),
    groups,
    cards,
    edges: source.edges.flatMap((edge) => {
      const fromCardId = cardIds.get(edge.fromCardId);
      const toCardId = cardIds.get(edge.toCardId);
      return fromCardId && toCardId ? [{ ...edge, fromCardId, toCardId }] : [];
    })
  };
}

export function searchWorkspaceCards(
  state: AppState,
  request: Extract<CollaborationToolRequest, { tool: "search_cards" }>
): CollaborationToolResult {
  const input = request.input ?? {};
  const workspaceIds = input.workspaceIds?.length ? [...new Set(input.workspaceIds)] : state.workspaceOrder;
  workspaceIds.forEach((id) => knownWorkspace(state, id));
  const groupIds = input.groupIds?.length ? new Set(input.groupIds) : null;
  const statuses = input.statuses?.length ? new Set(input.statuses) : null;
  const types = input.types?.length ? new Set(input.types) : null;
  const sources = input.sources?.length ? new Set(input.sources) : null;
  const includeNotes = input.includeNotes === true;
  const query = input.query?.trim().toLocaleLowerCase() ?? "";
  const limit = Math.max(1, Math.min(200, Number.isFinite(input.limit) ? Math.floor(input.limit!) : 50));
  const matches: Extract<CollaborationToolResult, { tool: "search_cards" }> ["matches"] = [];

  for (const workspaceId of workspaceIds) {
    const workspace = state.workspaces[workspaceId];
    for (const card of workspaceCardOrder(workspace)) {
      if (groupIds && (!card.groupId || !groupIds.has(card.groupId))) continue;
      if (statuses && !statuses.has(card.status)) continue;
      if (types && !types.has(card.type)) continue;
      if (sources && !sources.has(card.source)) continue;
      const group = card.groupId ? workspace.groups[card.groupId] : undefined;
      const searchable = [card.title, card.url ?? "", group?.name ?? "", includeNotes ? card.note : ""]
        .join("\n")
        .toLocaleLowerCase();
      if (query && !searchable.includes(query)) continue;
      const safeCard: Omit<Card, "note"> & { note?: string; noteLength: number } = {
        ...card,
        noteLength: card.note.length,
        ...(includeNotes ? { note: card.note } : {})
      };
      delete (safeCard as Partial<Card>).note;
      if (includeNotes) safeCard.note = card.note;
      matches.push({
        workspaceId,
        workspaceName: workspace.name,
        groupId: card.groupId,
        groupName: group?.name,
        card: safeCard
      });
    }
  }
  return { tool: "search_cards", revision: appStateRevision(state), total: matches.length, matches: matches.slice(0, limit) };
}

export function manageWorkspaces(
  state: AppState,
  locale: Locale,
  request: Extract<CollaborationToolRequest, { tool: "manage_workspaces" }>
): { state: AppState; changed: boolean; result: Extract<CollaborationToolResult, { tool: "manage_workspaces" }> } {
  if (request.input.expectedStateRevision !== appStateRevision(state)) {
    throw new Error("Workspace list changed since the Agent read it; read the latest context and retry");
  }
  const operationId = safeOperationId(request.input.operationId);
  if (!Array.isArray(request.input.actions) || request.input.actions.length < 1 || request.input.actions.length > 20) {
    throw new Error("actions must contain 1-20 workspace operations");
  }
  let next = structuredClone(state);
  const createdWorkspaceIds: string[] = [];
  for (const action of request.input.actions) {
    switch (action.type) {
      case "create_workspace": { 
        let workspace = createEmptyWorkspace(locale, requiredName(action.name));
        if (action.workspaceId !== undefined) {
          const workspaceId = requiredName(action.workspaceId);
          if (!/^[A-Za-z0-9._:-]+$/.test(workspaceId)) throw new Error("workspaceId must use safe characters");
          if (next.workspaces[workspaceId]) throw new Error(`Workspace id already exists: ${workspaceId}`);
          workspace = { ...workspace, id: workspaceId };
        }
        next = {
          ...next,
          activeWorkspaceId: action.makeActive === false ? next.activeWorkspaceId : workspace.id,
          workspaceOrder: [...next.workspaceOrder, workspace.id],
          workspaces: { ...next.workspaces, [workspace.id]: workspace }
        };
        createdWorkspaceIds.push(workspace.id);
        break;
      }
      case "set_active_workspace":
        knownWorkspace(next, action.workspaceId);
        next = { ...next, activeWorkspaceId: action.workspaceId };
        break;
      case "rename_workspace": { 
        const workspace = knownWorkspace(next, action.workspaceId);
        next = updateWorkspace(next, renameWorkspace(workspace, requiredName(action.name)));
        break;
      }
      case "reorder_workspaces": { 
        if (!Array.isArray(action.workspaceIds)) throw new Error("workspaceIds is required");
        const ids = [...new Set(action.workspaceIds)];
        if (ids.length !== next.workspaceOrder.length || ids.some((id) => !next.workspaces[id])) {
          throw new Error("workspaceIds must contain every workspace exactly once");
        }
        next = { ...next, workspaceOrder: ids };
        break;
      }
      case "duplicate_workspace": { 
        const source = knownWorkspace(next, action.workspaceId);
        const workspace = cloneWorkspace(source, action.name);
        next = {
          ...next,
          activeWorkspaceId: action.makeActive === false ? next.activeWorkspaceId : workspace.id,
          workspaceOrder: [...next.workspaceOrder, workspace.id],
          workspaces: { ...next.workspaces, [workspace.id]: workspace }
        };
        createdWorkspaceIds.push(workspace.id);
        break;
      }
      default:
        throw new Error("Unsupported workspace management action");
    }
  }
  const activeWorkspace = next.workspaces[next.activeWorkspaceId];
  return {
    state: next,
    changed: appStateRevision(next) !== appStateRevision(state),
    result: {
      tool: "manage_workspaces",
      revision: workspaceRevision(activeWorkspace),
      stateRevision: appStateRevision(next),
      activeWorkspaceId: next.activeWorkspaceId,
      createdWorkspaceIds,
      workspaceIndex: workspaceIndex(next),
      operationId
    }
  };
}

export function deleteWorkspaceItems(
  state: AppState,
  workspaceId: string,
  locale: Locale,
  request: Extract<CollaborationToolRequest, { tool: "delete_workspace_items" }>
): { state: AppState; changed: boolean; result: Extract<CollaborationToolResult, { tool: "delete_workspace_items" }> } {
  if (request.input.confirm !== true) throw new Error("delete_workspace_items requires confirm=true");
  if (typeof request.input.confirmationText !== "string" || request.input.confirmationText.length > 500 || !/(?:我确认|确认|i\s+confirm|confirmed)/i.test(request.input.confirmationText.trim())) {
    throw new Error("delete_workspace_items requires confirmationText copied from the user's explicit confirmation");
  }
  const operationId = safeOperationId(request.input.operationId);
  const workspace = knownWorkspace(state, workspaceId);
  if (request.input.expectedRevision !== workspaceRevision(workspace)) {
    throw new Error("Workspace changed since the Agent read it; read the latest context and retry");
  }
  const deleteWorkspace = request.input.deleteWorkspace === true;
  const groupIds = [...new Set(request.input.groupIds ?? [])];
  const cardIds = [...new Set(request.input.cardIds ?? [])];
  if (groupIds.length > 100 || cardIds.length > 100) throw new Error("At most 100 groups or cards may be deleted at once");
  if (!deleteWorkspace && groupIds.length === 0 && cardIds.length === 0) throw new Error("Select cards, groups, or deleteWorkspace=true");
  if (deleteWorkspace && (groupIds.length > 0 || cardIds.length > 0)) throw new Error("Workspace deletion cannot be combined with card or group deletion");
  if (deleteWorkspace && request.input.expectedStateRevision !== appStateRevision(state)) {
    throw new Error("Workspace list changed since the Agent read it; read the latest context and retry");
  }

  let next = structuredClone(state);
  const deletedGroupIds: string[] = [];
  const deletedCardIds: string[] = [];
  let deletedWorkspaceId: string | undefined;
  if (deleteWorkspace) {
    next = removeWorkspace(next, workspaceId, locale);
    deletedWorkspaceId = workspaceId;
  } else {
    let nextWorkspace = next.workspaces[workspaceId];
    for (const groupId of groupIds) {
      if (!nextWorkspace.groups[groupId]) throw new Error(`Unknown group id: ${groupId}`);
      nextWorkspace = deleteGroup(nextWorkspace, groupId);
      deletedGroupIds.push(groupId);
    }
    for (const cardId of cardIds) {
      if (!nextWorkspace.cards[cardId]) throw new Error(`Unknown card id: ${cardId}`);
      nextWorkspace = deleteCard(nextWorkspace, cardId);
      deletedCardIds.push(cardId);
    }
    next = updateWorkspace(next, nextWorkspace);
  }
  const resultWorkspace = next.workspaces[workspaceId] ?? next.workspaces[next.activeWorkspaceId];
  return {
    state: next,
    changed: true,
    result: {
      tool: "delete_workspace_items",
      revision: workspaceRevision(resultWorkspace),
      stateRevision: appStateRevision(next),
      activeWorkspaceId: next.activeWorkspaceId,
      deletedWorkspaceId,
      deletedGroupIds,
      deletedCardIds,
      operationId
    }
  };
}
