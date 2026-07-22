import { inferCardType, isSupportedUrl, normalizeUrl } from "./url";
import { validateStructureProposal } from "./structure";
import {
  addManualCard,
  createGroup,
  moveCard,
  removeEdge,
  renameWorkspace,
  updateCardFlows,
  updateCardNote,
  updateCardStatus,
  updateGroup,
  upsertEdge
} from "./workspace";
import type {
  CollaborationToolRequest,
  CollaborationToolResult,
  Locale,
  Workspace,
  WorkspaceContextSummary
} from "./types";

export type CollaborationExecution = {
  workspace: Workspace;
  changed: boolean;
  result: CollaborationToolResult;
};

export const COLLABORATION_TOOL_DEFINITIONS = [
  {
    name: "read_workspace",
    description: "Read versioned TabNexus context. Summary is the safe default; request full detail or selected cardIds only when needed.",
    inputSchema: {
      type: "object",
      properties: {
        detail: { type: "string", enum: ["summary", "full"], default: "summary" },
        sinceRevision: { type: "string", description: "Return unchanged=true when this revision is still current." },
        cardIds: { type: "array", maxItems: 50, items: { type: "string" } }
      },
      additionalProperties: false
    }
  },
  {
    name: "search_cards",
    description: "Search and filter cards across one or more workspaces. Notes are excluded unless includeNotes=true.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", maxLength: 500 },
        workspaceIds: { type: "array", maxItems: 50, items: { type: "string" } },
        groupIds: { type: "array", maxItems: 100, items: { type: "string" } },
        statuses: { type: "array", items: { type: "string", enum: ["unread", "read", "adopted"] } },
        types: { type: "array", items: { type: "string", enum: ["web", "note", "html", "report", "agent"] } },
        sources: { type: "array", items: { type: "string", enum: ["user", "ai", "agent"] } },
        includeNotes: { type: "boolean", default: false },
        limit: { type: "integer", minimum: 1, maximum: 200, default: 50 }
      },
      additionalProperties: false
    }
  },
  {
    name: "add_card",
    description: "Add a source or note to the active workspace without deleting or replacing existing cards.",
    inputSchema: {
      type: "object",
      required: ["title"],
      properties: {
        title: { type: "string", maxLength: 240 },
        url: { type: "string" },
        note: { type: "string", maxLength: 20_000 },
        groupId: { type: "string" },
        expectedRevision: { type: "string", description: "Reject the write if workspace context changed." },
        operationId: { type: "string", maxLength: 120, description: "Stable idempotency key for retries." }
      },
      additionalProperties: false
    }
  },
  {
    name: "add_cards",
    description: "Add 1-100 sources or notes in one atomic, idempotent workspace write.",
    inputSchema: {
      type: "object",
      required: ["cards", "expectedRevision", "operationId"],
      properties: {
        expectedRevision: { type: "string" },
        operationId: { type: "string", maxLength: 120, pattern: "^[A-Za-z0-9._:-]+$" },
        cards: {
          type: "array",
          minItems: 1,
          maxItems: 100,
          items: {
            type: "object",
            required: ["title"],
            properties: {
              title: { type: "string", maxLength: 240 },
              url: { type: "string" },
              note: { type: "string", maxLength: 20_000 },
              type: { type: "string", enum: ["web", "note", "html", "report", "agent"] },
              groupId: { type: "string" },
              status: { type: "string", enum: ["unread", "read", "adopted"] }
            },
            additionalProperties: false
          }
        }
      },
      additionalProperties: false
    }
  },
  {
    name: "write_report",
    description: "Write an Agent-generated report back as a report card in the active workspace.",
    inputSchema: {
      type: "object",
      required: ["title", "content"],
      properties: {
        title: { type: "string", maxLength: 240 },
        content: { type: "string", maxLength: 50_000 },
        url: { type: "string" },
        groupId: { type: "string" },
        expectedRevision: { type: "string", description: "Reject the write if workspace context changed." },
        operationId: { type: "string", maxLength: 120, description: "Stable idempotency key for retries." }
      },
      additionalProperties: false
    }
  },
  {
    name: "propose_structure",
    description: "Return a validated, non-destructive relationship proposal for human review in TabNexus.",
    inputSchema: {
      type: "object",
      required: ["edges"],
      properties: {
        summary: { type: "string", maxLength: 300 },
        expectedRevision: { type: "string", description: "Reject stale relationship references." },
        operationId: { type: "string", maxLength: 120, description: "Stable idempotency key for retries." },
        edges: {
          type: "array",
          items: {
            type: "object",
            required: ["fromCardId", "toCardId"],
            properties: {
              fromCardId: { type: "string" },
              toCardId: { type: "string" },
              label: { type: "string", maxLength: 40 }
            },
            additionalProperties: false
          }
        }
      },
      additionalProperties: false
    }
  },
  {
    name: "edit_workspace",
    description: "Atomically edit workspace organization, classification, card metadata, graph layout, and relationships. Read first and pass expectedRevision plus a stable operationId.",
    inputSchema: {
      type: "object",
      required: ["expectedRevision", "operationId", "actions"],
      properties: {
        expectedRevision: { type: "string", description: "Current revision returned by read_workspace." },
        operationId: { type: "string", maxLength: 120, pattern: "^[A-Za-z0-9._:-]+$" },
        actions: {
          type: "array",
          minItems: 1,
          maxItems: 100,
          items: {
            type: "object",
            required: ["type"],
            properties: {
              type: {
                type: "string",
                enum: ["rename_workspace", "create_group", "rename_group", "move_cards", "update_card", "reorder_groups", "reorder_cards", "position_cards", "reset_card_positions", "upsert_edges", "remove_edges"]
              },
              name: { type: "string", maxLength: 120 },
              color: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" },
              groupId: { type: "string" },
              targetGroupId: { type: ["string", "null"] },
              cardId: { type: "string" },
              cardIds: { type: "array", maxItems: 100, items: { type: "string" } },
              title: { type: "string", maxLength: 240 },
              url: { type: ["string", "null"] },
              note: { type: "string", maxLength: 20000 },
              status: { type: "string", enum: ["unread", "read", "adopted"] },
              cardType: { type: "string", enum: ["web", "note", "html", "report", "agent"] },
              position: { type: "integer", minimum: 0 },
              groupIds: { type: "array", maxItems: 100, items: { type: "string" } },
              positions: {
                type: "array",
                maxItems: 100,
                items: {
                  type: "object",
                  required: ["cardId", "x", "y"],
                  properties: { cardId: { type: "string" }, x: { type: "number" }, y: { type: "number" } },
                  additionalProperties: false
                }
              },
              edges: {
                type: "array",
                maxItems: 200,
                items: {
                  type: "object",
                  required: ["fromCardId", "toCardId"],
                  properties: { fromCardId: { type: "string" }, toCardId: { type: "string" }, label: { type: "string", maxLength: 40 } },
                  additionalProperties: false
                }
              },
              confirm: { type: "boolean" }
            },
            additionalProperties: false
          }
        }
      },
      additionalProperties: false
    }
  },
  {
    name: "manage_workspaces",
    description: "Atomically create, select, rename, reorder, or duplicate workspaces without deleting data.",
    inputSchema: {
      type: "object",
      required: ["expectedStateRevision", "operationId", "actions"],
      properties: {
        expectedStateRevision: { type: "string" },
        operationId: { type: "string", maxLength: 120, pattern: "^[A-Za-z0-9._:-]+$" },
        actions: {
          type: "array",
          minItems: 1,
          maxItems: 20,
          items: {
            oneOf: [
              { type: "object", required: ["type", "name"], properties: { type: { const: "create_workspace" }, workspaceId: { type: "string" }, name: { type: "string", maxLength: 120 }, makeActive: { type: "boolean", default: true } }, additionalProperties: false },
              { type: "object", required: ["type", "workspaceId"], properties: { type: { const: "set_active_workspace" }, workspaceId: { type: "string" } }, additionalProperties: false },
              { type: "object", required: ["type", "workspaceId", "name"], properties: { type: { const: "rename_workspace" }, workspaceId: { type: "string" }, name: { type: "string", maxLength: 120 } }, additionalProperties: false },
              { type: "object", required: ["type", "workspaceIds"], properties: { type: { const: "reorder_workspaces" }, workspaceIds: { type: "array", minItems: 1, maxItems: 100, uniqueItems: true, items: { type: "string" } } }, additionalProperties: false },
              { type: "object", required: ["type", "workspaceId"], properties: { type: { const: "duplicate_workspace" }, workspaceId: { type: "string" }, name: { type: "string", maxLength: 120 }, makeActive: { type: "boolean", default: false } }, additionalProperties: false }
            ]
          }
        }
      },
      additionalProperties: false
    }
  },
  {
    name: "delete_workspace_items",
    description: "Delete cards, groups, or one workspace only after literal confirmation in the user's latest message. Never infer confirmation from an imperative delete request.",
    inputSchema: {
      type: "object",
      required: ["expectedRevision", "operationId", "confirm", "confirmationText"],
      properties: {
        expectedRevision: { type: "string" },
        expectedStateRevision: { type: "string" },
        operationId: { type: "string", maxLength: 120, pattern: "^[A-Za-z0-9._:-]+$" },
        groupIds: { type: "array", maxItems: 100, items: { type: "string" } },
        cardIds: { type: "array", maxItems: 100, items: { type: "string" } },
        deleteWorkspace: { type: "boolean" },
        confirm: { const: true },
        confirmationText: { type: "string", minLength: 2, maxLength: 500, description: "Copy the user's explicit confirmation words, such as 我确认删除… or I confirm closing…." }
      },
      additionalProperties: false
    }
  },
  {
    name: "read_tab_workbench",
    description: "Read current tabs, saved-closed cards, recent unsaved closures, checkbox selection, collapsed state, and the workbench revision.",
    inputSchema: {
      type: "object",
      properties: { sinceRevision: { type: "string" } },
      additionalProperties: false
    }
  },
  {
    name: "manage_tab_workbench",
    description: "Manage checkbox selection, select-all scopes, collapsed state, tab focus, and reopening recently closed unsaved tabs.",
    inputSchema: {
      type: "object",
      required: ["expectedRevision", "operationId", "actions"],
      properties: {
        expectedRevision: { type: "string" },
        operationId: { type: "string", maxLength: 120, pattern: "^[A-Za-z0-9._:-]+$" },
        actions: {
          type: "array",
          minItems: 1,
          maxItems: 20,
          items: {
            oneOf: [
              { type: "object", required: ["type"], properties: { type: { const: "set_selection" }, mode: { type: "string", enum: ["replace", "add", "remove", "toggle"], default: "replace" }, tabIds: { type: "array", maxItems: 100, uniqueItems: true, items: { type: "integer" } }, cardIds: { type: "array", maxItems: 100, uniqueItems: true, items: { type: "string" } } }, additionalProperties: false },
              { type: "object", required: ["type"], properties: { type: { const: "select_all" }, scope: { type: "string", enum: ["all", "open", "unsaved_open", "saved_open", "saved_closed"], default: "all" }, includePinned: { type: "boolean", default: false } }, additionalProperties: false },
              { type: "object", required: ["type"], properties: { type: { const: "clear_selection" } }, additionalProperties: false },
              { type: "object", required: ["type", "collapsed"], properties: { type: { const: "set_collapsed" }, collapsed: { type: "boolean" } }, additionalProperties: false },
              { type: "object", required: ["type", "tabId"], properties: { type: { const: "focus_tab" }, tabId: { type: "integer" } }, additionalProperties: false },
              { type: "object", required: ["type", "recentIds"], properties: { type: { const: "reopen_recent" }, recentIds: { type: "array", minItems: 1, maxItems: 30, uniqueItems: true, items: { type: "string" } } }, additionalProperties: false }
            ]
          }
        }
      },
      additionalProperties: false
    }
  },
  {
    name: "dismiss_recent_tabs",
    description: "Permanently dismiss recovery entries only after literal confirmation in the user's latest message.",
    inputSchema: {
      type: "object",
      required: ["expectedRevision", "operationId", "recentIds", "confirm", "confirmationText"],
      properties: {
        expectedRevision: { type: "string" },
        operationId: { type: "string", maxLength: 120, pattern: "^[A-Za-z0-9._:-]+$" },
        recentIds: { type: "array", minItems: 1, maxItems: 30, items: { type: "string" } },
        confirm: { const: true },
        confirmationText: { type: "string", minLength: 2, maxLength: 500 }
      },
      additionalProperties: false
    }
  },
  {
    name: "sync_browser_tabs",
    description: "Save selected or all current-window tabs, reopen cards, an entire group, or the whole workspace, or focus one saved card without closing anything.",
    inputSchema: {
      type: "object",
      required: ["action", "expectedRevision", "operationId"],
      properties: {
        action: { type: "string", enum: ["save_tabs", "open_cards", "focus_card", "open_group", "open_workspace"] },
        scope: { type: "string", enum: ["explicit", "workbench_selection", "current_window"] },
        expectedWorkbenchRevision: { type: "string" },
        expectedRevision: { type: "string" },
        operationId: { type: "string", maxLength: 120, pattern: "^[A-Za-z0-9._:-]+$" },
        tabIds: { type: "array", maxItems: 100, items: { type: "integer" } },
        cardIds: { type: "array", maxItems: 100, items: { type: "string" } },
        cardId: { type: "string" },
        groupId: { type: "string" },
        includePinned: { type: "boolean", default: false }
      },
      additionalProperties: false
    }
  },
  {
    name: "close_browser_tabs",
    description: "Close selected non-pinned tabs only after literal confirmation in the user's latest message; saves first and always protects pinned tabs.",
    inputSchema: {
      type: "object",
      required: ["expectedRevision", "operationId", "confirm", "confirmationText"],
      properties: {
        tabIds: { type: "array", minItems: 1, maxItems: 100, items: { type: "integer" } },
        scope: { type: "string", enum: ["explicit", "workbench_selection", "current_window"] },
        expectedWorkbenchRevision: { type: "string" },
        saveBeforeClose: { type: "boolean", default: true },
        groupId: { type: "string" },
        expectedRevision: { type: "string" },
        operationId: { type: "string", maxLength: 120, pattern: "^[A-Za-z0-9._:-]+$" },
        confirm: { const: true },
        confirmationText: { type: "string", minLength: 2, maxLength: 500 }
      },
      additionalProperties: false
    }
  },
  {
    name: "export_workspace",
    description: "Export the active or requested workspace as stable Markdown or JSON without settings, API keys, or browser tab IDs.",
    inputSchema: {
      type: "object",
      properties: { format: { type: "string", enum: ["markdown", "json"], default: "markdown" } },
      additionalProperties: false
    }
  },
  {
    name: "manage_preferences",
    description: "Read or update safe TabNexus display and behavior preferences. Provider keys and other secrets are never exposed or writable.",
    inputSchema: {
      type: "object",
      required: ["action"],
      properties: {
        action: { type: "string", enum: ["read", "update"] },
        expectedRevision: { type: "string" },
        operationId: { type: "string", maxLength: 120, pattern: "^[A-Za-z0-9._:-]+$" },
        preferences: {
          type: "object",
          properties: {
            locale: { type: "string", enum: ["zh", "en"] },
            closeAfterCollect: { type: "boolean" },
            rightRailCollapsed: { type: "boolean" },
            aiComposerCollapsed: { type: "boolean" },
            workspaceView: { type: "string", enum: ["board", "flow"] },
            groupingPolicy: { type: "string", enum: ["automatic", "suggestion", "domain"] },
            aiEnabled: { type: "boolean" },
            aiProvider: { type: "string", enum: ["deepseek", "openai", "anthropic", "kimi", "qwen", "minimax"] }
          },
          additionalProperties: false
        }
      },
      additionalProperties: false
    }
  },
  {
    name: "manage_agent_activity",
    description: "Read or explicitly clear the active workspace's local Agent activity history. Clearing requires a fresh revision and confirm=true.",
    inputSchema: {
      type: "object",
      required: ["action"],
      properties: {
        action: { type: "string", enum: ["read", "clear"] },
        expectedRevision: { type: "string" },
        operationId: { type: "string", maxLength: 120, pattern: "^[A-Za-z0-9._:-]+$" },
        confirm: { const: true },
        confirmationText: { type: "string", minLength: 2, maxLength: 500 }
      },
      allOf: [
        {
          if: { properties: { action: { const: "clear" } } },
          then: { required: ["expectedRevision", "operationId", "confirm", "confirmationText"] }
        }
      ],
      additionalProperties: false
    }
  }
] as const;

function revisionPayload(workspace: Workspace): string {
  return JSON.stringify({
    id: workspace.id,
    name: workspace.name,
    groupOrder: workspace.groupOrder,
    groups: workspace.groups,
    cards: workspace.cards,
    edges: workspace.edges
  });
}

export function workspaceRevision(workspace: Workspace): string {
  let hash = 0x811c9dc5;
  for (const character of revisionPayload(workspace)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return `wsr_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function orderedCardIds(workspace: Workspace): string[] {
  const grouped = workspace.groupOrder.flatMap((groupId) => workspace.groups[groupId]?.cardIds ?? []);
  const remaining = Object.keys(workspace.cards).filter((cardId) => !grouped.includes(cardId));
  return [...new Set([...grouped, ...remaining])];
}

export function summarizeWorkspace(workspace: Workspace): WorkspaceContextSummary {
  const revision = workspaceRevision(workspace);
  return {
    id: workspace.id,
    name: workspace.name,
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
    revision,
    groups: workspace.groupOrder.flatMap((groupId) => {
      const group = workspace.groups[groupId];
      return group ? [{ ...group, cardIds: [...group.cardIds] }] : [];
    }),
    cards: orderedCardIds(workspace).flatMap((cardId) => {
      const card = workspace.cards[cardId];
      if (!card) return [];
      return [{
        id: card.id,
        type: card.type,
        title: card.title,
        url: card.url,
        favicon: card.favicon,
        status: card.status,
        groupId: card.groupId,
        source: card.source,
        savedAt: card.savedAt,
        lastAccessedAt: card.lastAccessedAt,
        noteLength: card.note.length
      }];
    }),
    edges: workspace.edges.map((edge) => ({ ...edge }))
  };
}

function selectedWorkspace(workspace: Workspace, requestedIds?: string[]): Workspace {
  if (!requestedIds?.length) return structuredClone(workspace);
  const selectedIds = [...new Set(requestedIds)].slice(0, 50);
  for (const cardId of selectedIds) {
    if (!workspace.cards[cardId]) throw new Error(`Unknown card id: ${cardId}`);
  }
  const selected = new Set(selectedIds);
  return {
    ...structuredClone(workspace),
    groups: Object.fromEntries(Object.entries(workspace.groups).map(([groupId, group]) => [
      groupId,
      { ...group, cardIds: group.cardIds.filter((cardId) => selected.has(cardId)) }
    ])),
    cards: Object.fromEntries(selectedIds.map((cardId) => [cardId, structuredClone(workspace.cards[cardId])])),
    edges: workspace.edges.filter((edge) => selected.has(edge.fromCardId) && selected.has(edge.toCardId))
  };
}

function operationId(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !/^[A-Za-z0-9._:-]{1,120}$/.test(value)) {
    throw new Error("operationId must use 1-120 safe characters");
  }
  return value;
}

function assertExpectedRevision(workspace: Workspace, value: unknown): void {
  if (value === undefined || value === null || value === "") return;
  if (typeof value !== "string" || value !== workspaceRevision(workspace)) {
    throw new Error("Workspace changed since the Agent read it; read the latest context and retry");
  }
}

function requiredText(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required`);
  return value.trim().slice(0, maxLength);
}

function optionalUrl(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !isSupportedUrl(value.trim())) throw new Error("Unsupported URL");
  return value.trim();
}

function optionalGroupId(workspace: Workspace, value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !workspace.groups[value]) throw new Error("Unknown group id");
  return value;
}

function markAgentCard(workspace: Workspace, cardId: string, type?: "report"): Workspace {
  const card = workspace.cards[cardId];
  if (!card) return workspace;
  return {
    ...workspace,
    cards: {
      ...workspace.cards,
      [cardId]: { ...card, source: "agent", type: type ?? card.type }
    }
  };
}

function knownCard(workspace: Workspace, cardId: unknown): string {
  if (typeof cardId !== "string" || !workspace.cards[cardId]) throw new Error(`Unknown card id: ${String(cardId)}`);
  return cardId;
}

function knownGroup(workspace: Workspace, groupId: unknown): string {
  if (typeof groupId !== "string" || !workspace.groups[groupId]) throw new Error(`Unknown group id: ${String(groupId)}`);
  return groupId;
}

function safeColor(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error("color must be a six-digit hex value");
  return value.toUpperCase();
}

function editWorkspace(
  workspace: Workspace,
  locale: Locale,
  request: Extract<CollaborationToolRequest, { tool: "edit_workspace" }>
): CollaborationExecution {
  assertExpectedRevision(workspace, request.input.expectedRevision);
  const requestOperationId = operationId(request.input.operationId);
  if (!requestOperationId) throw new Error("operationId is required");
  if (!Array.isArray(request.input.actions) || request.input.actions.length < 1 || request.input.actions.length > 100) {
    throw new Error("actions must contain 1-100 edits");
  }
  let next = structuredClone(workspace);
  const changes: string[] = [];
  const createdGroupIds: string[] = [];
  for (const action of request.input.actions) {
    const before = workspaceRevision(next);
    switch (action.type) {
      case "rename_workspace":
        next = renameWorkspace(next, requiredText(action.name, "name", 120));
        break;
      case "create_group": { 
        const previousIds = new Set(next.groupOrder);
        next = createGroup(next, locale, requiredText(action.name, "name", 120));
        let groupId = next.groupOrder.find((id) => !previousIds.has(id));
        if (!groupId) throw new Error("Unable to create group");
        if (action.groupId !== undefined) {
          const requestedId = requiredText(action.groupId, "groupId", 100);
          if (!/^[A-Za-z0-9._:-]+$/.test(requestedId)) throw new Error("groupId must use safe characters");
          if (previousIds.has(requestedId)) throw new Error(`Group id already exists: ${requestedId}`);
          const generatedGroup = next.groups[groupId];
          const groups = { ...next.groups };
          delete groups[groupId];
          groups[requestedId] = { ...generatedGroup, id: requestedId };
          next = { ...next, groupOrder: next.groupOrder.map((id) => id === groupId ? requestedId : id), groups };
          groupId = requestedId;
        }
        const color = safeColor(action.color);
        if (color) next = updateGroup(next, groupId, { color });
        createdGroupIds.push(groupId);
        break;
      }
      case "rename_group": {
        const groupId = knownGroup(next, action.groupId);
        next = updateGroup(next, groupId, {
          name: requiredText(action.name, "name", 120),
          ...(action.color === undefined ? {} : { color: safeColor(action.color) })
        });
        break;
      }
      case "move_cards": {
        if (!Array.isArray(action.cardIds) || action.cardIds.length < 1 || action.cardIds.length > 100) throw new Error("cardIds must contain 1-100 cards");
        const targetGroupId = action.targetGroupId === null ? null : knownGroup(next, action.targetGroupId);
        const cardIds = [...new Set(action.cardIds)].map((cardId) => knownCard(next, cardId));
        for (const cardId of cardIds) next = moveCard(next, cardId, targetGroupId);
        if (targetGroupId && action.position !== undefined) {
          if (!Number.isInteger(action.position) || action.position < 0) throw new Error("position must be a non-negative integer");
          const group = next.groups[targetGroupId];
          const remaining = group.cardIds.filter((cardId) => !cardIds.includes(cardId));
          const position = Math.min(action.position, remaining.length);
          next = {
            ...next,
            groups: {
              ...next.groups,
              [targetGroupId]: { ...group, cardIds: [...remaining.slice(0, position), ...cardIds, ...remaining.slice(position)] }
            }
          };
        }
        break;
      }
      case "update_card": {
        const cardId = knownCard(next, action.cardId);
        if (action.cardType !== undefined && !["web", "note", "html", "report", "agent"].includes(action.cardType)) {
          throw new Error("Unsupported card type");
        }
        if (action.title !== undefined) {
          const title = requiredText(action.title, "title", 240);
          next = { ...next, cards: { ...next.cards, [cardId]: { ...next.cards[cardId], title } } };
        }
        if (action.url !== undefined) {
          const url = action.url === null || action.url === "" ? undefined : optionalUrl(action.url);
          if (url) {
            const normalized = normalizeUrl(url);
            const duplicate = Object.values(next.cards).find((card) => card.id !== cardId && card.url && normalizeUrl(card.url) === normalized);
            if (duplicate) throw new Error(`URL already exists on card: ${duplicate.id}`);
          }
          const card = next.cards[cardId];
          next = {
            ...next,
            cards: {
              ...next.cards,
              [cardId]: { ...card, url, type: action.cardType ?? (url ? inferCardType(url) : card.type) }
            }
          };
        } else if (action.cardType !== undefined) {
          next = { ...next, cards: { ...next.cards, [cardId]: { ...next.cards[cardId], type: action.cardType } } };
        }
        if (action.note !== undefined) next = updateCardNote(next, cardId, action.note.slice(0, 20_000));
        if (action.status !== undefined) {
          if (!["unread", "read", "adopted"].includes(action.status)) throw new Error("Unsupported card status");
          next = updateCardStatus(next, cardId, action.status);
        }
        break;
      }
      case "reorder_groups": {
        if (!Array.isArray(action.groupIds)) throw new Error("groupIds is required");
        const groupIds = [...new Set(action.groupIds)];
        if (groupIds.length !== next.groupOrder.length || groupIds.some((id) => !next.groups[id])) {
          throw new Error("groupIds must contain every workspace group exactly once");
        }
        next = { ...next, groupOrder: groupIds };
        break;
      }
      case "reorder_cards": {
        const groupId = knownGroup(next, action.groupId);
        if (!Array.isArray(action.cardIds)) throw new Error("cardIds is required");
        const cardIds = [...new Set(action.cardIds)];
        const group = next.groups[groupId];
        if (cardIds.length !== group.cardIds.length || cardIds.some((cardId) => !group.cardIds.includes(cardId))) {
          throw new Error("cardIds must contain every card in the group exactly once");
        }
        next = { ...next, groups: { ...next.groups, [groupId]: { ...group, cardIds } } };
        break;
      }
      case "position_cards": {
        if (!Array.isArray(action.positions) || action.positions.length < 1 || action.positions.length > 100) throw new Error("positions must contain 1-100 cards");
        const flows: Record<string, { x: number; y: number }> = {};
        for (const position of action.positions) {
          const cardId = knownCard(next, position.cardId);
          if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) throw new Error("Card positions must be finite numbers");
          flows[cardId] = { x: position.x, y: position.y };
        }
        next = updateCardFlows(next, flows);
        break;
      }
      case "reset_card_positions": {
        if (!Array.isArray(action.cardIds) || action.cardIds.length < 1 || action.cardIds.length > 100) throw new Error("cardIds must contain 1-100 cards");
        const cards = { ...next.cards };
        for (const requestedId of [...new Set(action.cardIds)]) {
          const cardId = knownCard(next, requestedId);
          const { flow: _flow, flowLayout: _flowLayout, ...card } = cards[cardId];
          cards[cardId] = card;
        }
        next = { ...next, cards };
        break;
      }
      case "upsert_edges":
        if (!Array.isArray(action.edges) || action.edges.length > 200) throw new Error("edges must contain at most 200 relationships");
        for (const edge of action.edges) {
          const fromCardId = knownCard(next, edge.fromCardId);
          const toCardId = knownCard(next, edge.toCardId);
          if (fromCardId === toCardId) throw new Error("A card cannot relate to itself");
          next = upsertEdge(next, { fromCardId, toCardId, label: edge.label });
        }
        break;
      case "remove_edges":
        if (!Array.isArray(action.edges) || action.edges.length > 200) throw new Error("edges must contain at most 200 relationships");
        for (const edge of action.edges) next = removeEdge(next, knownCard(next, edge.fromCardId), knownCard(next, edge.toCardId));
        break;
      default:
        throw new Error("Unsupported workspace edit action");
    }
    if (workspaceRevision(next) !== before) changes.push(action.type);
  }
  return {
    workspace: next,
    changed: changes.length > 0,
    result: {
      tool: "edit_workspace",
      revision: workspaceRevision(next),
      changed: changes.length > 0,
      changes,
      createdGroupIds,
      operationId: requestOperationId
    }
  };
}

export function executeCollaborationTool(
  workspace: Workspace,
  locale: Locale,
  request: CollaborationToolRequest
): CollaborationExecution {
  if (request.tool === "read_workspace") {
    const revision = workspaceRevision(workspace);
    const detail = request.input?.detail === "full" ? "full" : "summary";
    const unchanged = request.input?.sinceRevision === revision;
    return {
      workspace,
      changed: false,
      result: {
        tool: "read_workspace",
        revision,
        unchanged,
        detail,
        ...(!unchanged && detail === "full"
          ? { workspace: selectedWorkspace(workspace, request.input?.cardIds) }
          : !unchanged
            ? { summary: summarizeWorkspace(workspace) }
            : {})
      }
    };
  }

  if (request.tool === "propose_structure") {
    assertExpectedRevision(workspace, request.input.expectedRevision);
    const requestOperationId = operationId(request.input.operationId);
    const proposal = validateStructureProposal(request.input, workspace);
    return {
      workspace,
      changed: false,
      result: { tool: "propose_structure", revision: workspaceRevision(workspace), proposal, operationId: requestOperationId }
    };
  }

  if (request.tool === "edit_workspace") return editWorkspace(workspace, locale, request);

  if (request.tool === "add_cards") {
    assertExpectedRevision(workspace, request.input.expectedRevision);
    const requestOperationId = operationId(request.input.operationId);
    if (!requestOperationId) throw new Error("operationId is required");
    if (!Array.isArray(request.input.cards) || request.input.cards.length < 1 || request.input.cards.length > 100) {
      throw new Error("cards must contain 1-100 items");
    }
    let next = structuredClone(workspace);
    const addedCardIds: string[] = [];
    const duplicateCardIds: string[] = [];
    for (const input of request.input.cards) {
      if (input.type !== undefined && !["web", "note", "html", "report", "agent"].includes(input.type)) {
        throw new Error("Unsupported card type");
      }
      if (input.status !== undefined && !["unread", "read", "adopted"].includes(input.status)) {
        throw new Error("Unsupported card status");
      }
      const groupId = optionalGroupId(next, input.groupId);
      const result = addManualCard(next, locale, {
        title: requiredText(input.title, "title", 240),
        url: optionalUrl(input.url),
        note: typeof input.note === "string" ? input.note.slice(0, 20_000) : undefined,
        type: input.type,
        groupId
      });
      if (result.duplicateCardId) {
        duplicateCardIds.push(result.duplicateCardId);
        continue;
      }
      if (!result.cardId) continue;
      next = markAgentCard(result.workspace, result.cardId, input.type === "report" ? "report" : undefined);
      if (input.status && input.status !== "unread") next = updateCardStatus(next, result.cardId, input.status);
      addedCardIds.push(result.cardId);
    }
    return {
      workspace: next,
      changed: addedCardIds.length > 0,
      result: {
        tool: "add_cards",
        revision: workspaceRevision(next),
        addedCardIds,
        duplicateCardIds: [...new Set(duplicateCardIds)],
        operationId: requestOperationId
      }
    };
  }

  if (
    request.tool === "search_cards" ||
    request.tool === "manage_workspaces" ||
    request.tool === "delete_workspace_items" ||
    request.tool === "read_tab_workbench" ||
    request.tool === "manage_tab_workbench" ||
    request.tool === "dismiss_recent_tabs" ||
    request.tool === "sync_browser_tabs" ||
    request.tool === "close_browser_tabs" ||
    request.tool === "export_workspace" ||
    request.tool === "manage_preferences" ||
    request.tool === "manage_agent_activity"
  ) {
    throw new Error(`${request.tool} requires application context`);
  }

  assertExpectedRevision(workspace, request.input.expectedRevision);
  const requestOperationId = operationId(request.input.operationId);
  const groupId = optionalGroupId(workspace, request.input.groupId);
  const url = optionalUrl(request.input.url);
  if (request.tool === "add_card") {
    const result = addManualCard(workspace, locale, {
      title: requiredText(request.input.title, "title", 240),
      url,
      note: typeof request.input.note === "string" ? request.input.note.trim().slice(0, 20_000) : undefined,
      groupId
    });
    const nextWorkspace = result.cardId ? markAgentCard(result.workspace, result.cardId) : result.workspace;
    return {
      workspace: nextWorkspace,
      changed: Boolean(result.cardId),
      result: {
        tool: "add_card",
        revision: workspaceRevision(nextWorkspace),
        cardId: result.cardId,
        duplicateCardId: result.duplicateCardId,
        operationId: requestOperationId
      }
    };
  }

  const result = addManualCard(workspace, locale, {
    title: requiredText(request.input.title, "title", 240),
    url,
    note: requiredText(request.input.content, "content", 50_000),
    type: "report",
    groupId
  });
  const nextWorkspace = result.cardId ? markAgentCard(result.workspace, result.cardId, "report") : result.workspace;
  return {
    workspace: nextWorkspace,
    changed: Boolean(result.cardId),
    result: {
      tool: "write_report",
      revision: workspaceRevision(nextWorkspace),
      cardId: result.cardId,
      duplicateCardId: result.duplicateCardId,
      operationId: requestOperationId
    }
  };
}
