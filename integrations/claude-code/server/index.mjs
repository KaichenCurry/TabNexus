#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { createConnection } from "node:net";
import { createInterface } from "node:readline";

const SERVER_VERSION = "0.8.0";
const LATEST_PROTOCOL_VERSION = "2025-11-25";
const SUPPORTED_PROTOCOL_VERSIONS = new Set([LATEST_PROTOCOL_VERSION, "2025-06-18", "2025-03-26"]);
const BRIDGE_HOST = "127.0.0.1";
const BRIDGE_PORT = Number.parseInt(process.env.TABNEXUS_BRIDGE_PORT || "43119", 10);
const AGENT_NAME = (process.env.TABNEXUS_AGENT_NAME || "Local Agent").trim().slice(0, 60) || "Local Agent";
const AGENT_ID = randomUUID();
const BROKER_BASE_URL = `http://${BRIDGE_HOST}:${BRIDGE_PORT}`;
const legacySocketPath = process.env.TABNEXUS_BRIDGE_SOCKET;
const MAX_WEBSOCKET_MESSAGE_BYTES = 512 * 1024;
const MAX_BROKER_BODY_BYTES = 512 * 1024;
const AGENT_TTL_MS = 15_000;

function compareVersions(left, right) {
  const parse = (value) => String(value || "0").split(".").map((part) => Number.parseInt(part, 10) || 0);
  const leftParts = parse(left);
  const rightParts = parse(right);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

const revisionFields = {
  expectedRevision: { type: "string", description: "Optimistic concurrency token returned by read_workspace." },
  operationId: { type: "string", maxLength: 120, pattern: "^[A-Za-z0-9._:-]+$", description: "Stable idempotency key for safe retries." }
};

const toolOutputSchema = {
  type: "object",
  required: ["tool", "revision"],
  properties: { tool: { type: "string" }, revision: { type: "string" } },
  additionalProperties: true
};

const cardIdList = { type: "array", minItems: 1, maxItems: 100, uniqueItems: true, items: { type: "string" } };
const edgeList = {
  type: "array",
  maxItems: 200,
  items: {
    type: "object",
    required: ["fromCardId", "toCardId"],
    properties: { fromCardId: { type: "string" }, toCardId: { type: "string" }, label: { type: "string", maxLength: 40 } },
    additionalProperties: false
  }
};
const editActionSchema = {
  oneOf: [
    { type: "object", required: ["type", "name"], properties: { type: { const: "rename_workspace" }, name: { type: "string", maxLength: 120 } }, additionalProperties: false },
    { type: "object", required: ["type", "name"], properties: { type: { const: "create_group" }, groupId: { type: "string", maxLength: 100, pattern: "^[A-Za-z0-9._:-]+$", description: "Optional Agent-chosen ID so later actions in the same atomic call can target this new group." }, name: { type: "string", maxLength: 120 }, color: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" } }, additionalProperties: false },
    { type: "object", required: ["type", "groupId", "name"], properties: { type: { const: "rename_group" }, groupId: { type: "string" }, name: { type: "string", maxLength: 120 }, color: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" } }, additionalProperties: false },
    { type: "object", required: ["type", "cardIds", "targetGroupId"], properties: { type: { const: "move_cards" }, cardIds: cardIdList, targetGroupId: { type: ["string", "null"] }, position: { type: "integer", minimum: 0 } }, additionalProperties: false },
    { type: "object", required: ["type", "cardId"], properties: { type: { const: "update_card" }, cardId: { type: "string" }, title: { type: "string", maxLength: 240 }, url: { type: ["string", "null"] }, note: { type: "string", maxLength: 20000 }, status: { type: "string", enum: ["unread", "read", "adopted"] }, cardType: { type: "string", enum: ["web", "note", "html", "report", "agent"] } }, additionalProperties: false },
    { type: "object", required: ["type", "groupIds"], properties: { type: { const: "reorder_groups" }, groupIds: { type: "array", maxItems: 100, uniqueItems: true, items: { type: "string" } } }, additionalProperties: false },
    { type: "object", required: ["type", "groupId", "cardIds"], properties: { type: { const: "reorder_cards" }, groupId: { type: "string" }, cardIds: { type: "array", maxItems: 100, uniqueItems: true, items: { type: "string" } } }, additionalProperties: false },
    { type: "object", required: ["type", "positions"], properties: { type: { const: "position_cards" }, positions: { type: "array", minItems: 1, maxItems: 100, items: { type: "object", required: ["cardId", "x", "y"], properties: { cardId: { type: "string" }, x: { type: "number" }, y: { type: "number" } }, additionalProperties: false } } }, additionalProperties: false },
    { type: "object", required: ["type", "cardIds"], properties: { type: { const: "reset_card_positions" }, cardIds: cardIdList }, additionalProperties: false },
    { type: "object", required: ["type", "edges"], properties: { type: { const: "upsert_edges" }, edges: edgeList }, additionalProperties: false },
    { type: "object", required: ["type", "edges"], properties: { type: { const: "remove_edges" }, edges: edgeList }, additionalProperties: false },
  ]
};
const workspaceActionSchema = {
  oneOf: [
    { type: "object", required: ["type", "name"], properties: { type: { const: "create_workspace" }, workspaceId: { type: "string", maxLength: 100, pattern: "^[A-Za-z0-9._:-]+$" }, name: { type: "string", maxLength: 120 }, makeActive: { type: "boolean", default: true } }, additionalProperties: false },
    { type: "object", required: ["type", "workspaceId"], properties: { type: { const: "set_active_workspace" }, workspaceId: { type: "string" } }, additionalProperties: false },
    { type: "object", required: ["type", "workspaceId", "name"], properties: { type: { const: "rename_workspace" }, workspaceId: { type: "string" }, name: { type: "string", maxLength: 120 } }, additionalProperties: false },
    { type: "object", required: ["type", "workspaceIds"], properties: { type: { const: "reorder_workspaces" }, workspaceIds: { type: "array", uniqueItems: true, items: { type: "string" } } }, additionalProperties: false },
    { type: "object", required: ["type", "workspaceId"], properties: { type: { const: "duplicate_workspace" }, workspaceId: { type: "string" }, name: { type: "string", maxLength: 120 }, makeActive: { type: "boolean", default: true } }, additionalProperties: false },
  ]
};

const tools = [
  {
    name: "read_workspace",
    title: "Read TabNexus workspace context",
    description: "Read versioned workspace context. Start with summary; request full notes only for selected cardIds. Use sinceRevision to avoid re-sending unchanged context.",
    inputSchema: {
      type: "object",
      properties: {
        workspaceId: { type: "string", description: "Omit to read the active workspace." },
        detail: { type: "string", enum: ["summary", "full"], default: "summary" },
        sinceRevision: { type: "string" },
        cardIds: { type: "array", maxItems: 50, items: { type: "string" } }
      },
      additionalProperties: false
    },
    outputSchema: toolOutputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  {
    name: "search_cards",
    title: "Search TabNexus cards",
    description: "Search and filter cards across workspaces. Notes are excluded unless includeNotes=true. Use this before requesting full workspace detail.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", maxLength: 500 },
        workspaceIds: { type: "array", maxItems: 50, uniqueItems: true, items: { type: "string" } },
        groupIds: { type: "array", maxItems: 100, uniqueItems: true, items: { type: "string" } },
        statuses: { type: "array", uniqueItems: true, items: { type: "string", enum: ["unread", "read", "adopted"] } },
        types: { type: "array", uniqueItems: true, items: { type: "string", enum: ["web", "note", "html", "report", "agent"] } },
        sources: { type: "array", uniqueItems: true, items: { type: "string", enum: ["user", "ai", "agent"] } },
        includeNotes: { type: "boolean", default: false },
        limit: { type: "integer", minimum: 1, maximum: 200, default: 50 }
      },
      additionalProperties: false
    },
    outputSchema: toolOutputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  {
    name: "add_card",
    title: "Add source to TabNexus",
    description: "Add one source or note without deleting existing cards. Read first, pass expectedRevision, and reuse operationId when retrying.",
    inputSchema: {
      type: "object",
      required: ["title"],
      properties: {
        workspaceId: { type: "string" }, title: { type: "string", maxLength: 240 }, url: { type: "string" },
        note: { type: "string", maxLength: 20000 }, groupId: { type: "string" }, ...revisionFields
      },
      additionalProperties: false
    },
    outputSchema: toolOutputSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  {
    name: "add_cards",
    title: "Add multiple sources to TabNexus",
    description: "Add 1-100 sources, notes, or reports in one atomic write. Read first, pass expectedRevision, and reuse operationId when retrying.",
    inputSchema: {
      type: "object",
      required: ["cards", "expectedRevision", "operationId"],
      properties: {
        workspaceId: { type: "string" }, ...revisionFields,
        cards: {
          type: "array", minItems: 1, maxItems: 100,
          items: {
            type: "object", required: ["title"],
            properties: {
              title: { type: "string", maxLength: 240 }, url: { type: "string" }, note: { type: "string", maxLength: 20000 },
              type: { type: "string", enum: ["web", "note", "html", "report", "agent"] }, groupId: { type: "string" },
              status: { type: "string", enum: ["unread", "read", "adopted"] }
            },
            additionalProperties: false
          }
        }
      },
      additionalProperties: false
    },
    outputSchema: toolOutputSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  {
    name: "write_report",
    title: "Write report to TabNexus",
    description: "Write an Agent report as a reviewable card. Read first, pass expectedRevision, and reuse operationId when retrying.",
    inputSchema: {
      type: "object",
      required: ["title", "content"],
      properties: {
        workspaceId: { type: "string" }, title: { type: "string", maxLength: 240 }, content: { type: "string", maxLength: 50000 },
        url: { type: "string" }, groupId: { type: "string" }, ...revisionFields
      },
      additionalProperties: false
    },
    outputSchema: toolOutputSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  {
    name: "propose_structure",
    title: "Propose TabNexus relationships",
    description: "Create a non-destructive relationship proposal for human review. It never edits the graph automatically.",
    inputSchema: {
      type: "object",
      required: ["edges"],
      properties: {
        workspaceId: { type: "string" }, summary: { type: "string", maxLength: 300 }, ...revisionFields,
        edges: {
          type: "array",
          items: {
            type: "object", required: ["fromCardId", "toCardId"],
            properties: { fromCardId: { type: "string" }, toCardId: { type: "string" }, label: { type: "string", maxLength: 40 } },
            additionalProperties: false
          }
        }
      },
      additionalProperties: false
    },
    outputSchema: toolOutputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  {
    name: "edit_workspace",
    title: "Edit TabNexus workspace",
    description: "Atomically edit workspace organization, classification, card metadata, mind-map layout, and relationships without deleting data. Read first, pass expectedRevision, and reuse operationId on retries.",
    inputSchema: {
      type: "object",
      required: ["expectedRevision", "operationId", "actions"],
      properties: {
        workspaceId: { type: "string", description: "Omit to edit the active workspace." },
        ...revisionFields,
        actions: { type: "array", minItems: 1, maxItems: 100, items: editActionSchema }
      },
      additionalProperties: false
    },
    outputSchema: toolOutputSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  {
    name: "manage_workspaces",
    title: "Manage TabNexus workspaces",
    description: "Atomically create, select, rename, reorder, or duplicate workspaces without deleting data. Read first and pass stateRevision as expectedStateRevision.",
    inputSchema: {
      type: "object",
      required: ["expectedStateRevision", "operationId", "actions"],
      properties: {
        expectedStateRevision: { type: "string", description: "App-level revision returned by read_workspace." },
        operationId: revisionFields.operationId,
        actions: { type: "array", minItems: 1, maxItems: 20, items: workspaceActionSchema }
      },
      additionalProperties: false
    },
    outputSchema: toolOutputSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  {
    name: "delete_workspace_items",
    title: "Delete TabNexus workspace items",
    description: "The only saved-data deletion tool. NEVER call it merely because the user says delete/remove. Call only when the user's latest message literally and explicitly confirms deletion (for example 'I confirm' or '我确认'); otherwise ask for confirmation and do not call. Requires fresh revisions and confirm=true.",
    inputSchema: {
      type: "object",
      required: ["expectedRevision", "operationId", "confirm", "confirmationText"],
      properties: {
        workspaceId: { type: "string", description: "Omit to target the active workspace." },
        expectedRevision: revisionFields.expectedRevision,
        expectedStateRevision: { type: "string", description: "Required when deleteWorkspace=true." },
        operationId: revisionFields.operationId,
        groupIds: { type: "array", maxItems: 100, uniqueItems: true, items: { type: "string" } },
        cardIds: cardIdList,
        deleteWorkspace: { type: "boolean", default: false },
        confirm: { const: true, description: "Set only when the latest user message explicitly confirms this exact deletion. Never infer confirmation from an imperative request." },
        confirmationText: { type: "string", minLength: 2, maxLength: 500, description: "Copy the user's literal confirmation words. The extension rejects text without explicit confirmation language such as 我确认 or I confirm." }
      },
      additionalProperties: false
    },
    outputSchema: toolOutputSchema,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false }
  },
  {
    name: "read_tab_workbench",
    title: "Read the TabNexus tab workbench",
    description: "Read the right-side tab workbench exactly as the user sees it: current supported tabs, saved-closed cards, recently closed unsaved tabs, current checkbox selection, collapsed state, capabilities, and a revision token.",
    inputSchema: {
      type: "object",
      properties: { sinceRevision: { type: "string" } },
      additionalProperties: false
    },
    outputSchema: toolOutputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  {
    name: "manage_tab_workbench",
    title: "Manage the TabNexus tab workbench",
    description: "Atomically manage the user's right-side tab workbench: set or clear checkbox selection, select all matching items, collapse or expand the rail, focus an open tab, or reopen recently closed unsaved tabs. Read the workbench first and pass its revision.",
    inputSchema: {
      type: "object",
      required: ["expectedRevision", "operationId", "actions"],
      properties: {
        expectedRevision: { type: "string" },
        operationId: revisionFields.operationId,
        actions: {
          type: "array", minItems: 1, maxItems: 20,
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
    },
    outputSchema: toolOutputSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  {
    name: "dismiss_recent_tabs",
    title: "Dismiss recently closed tabs",
    description: "Permanently remove selected recovery entries. Call only when the user's latest message explicitly confirms this exact removal; otherwise ask and do not call.",
    inputSchema: {
      type: "object",
      required: ["expectedRevision", "operationId", "recentIds", "confirm", "confirmationText"],
      properties: {
        expectedRevision: { type: "string" },
        operationId: revisionFields.operationId,
        recentIds: { type: "array", minItems: 1, maxItems: 30, uniqueItems: true, items: { type: "string" } },
        confirm: { const: true, description: "Set only after literal, explicit confirmation in the latest user message." },
        confirmationText: { type: "string", minLength: 2, maxLength: 500, description: "Copy the user's literal confirmation words." }
      },
      additionalProperties: false
    },
    outputSchema: toolOutputSchema,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false }
  },
  {
    name: "sync_browser_tabs",
    title: "Save or open Chrome tabs",
    description: "Without closing anything: save selected or all current-window tabs, reopen saved cards, an entire group, or the whole workspace, or focus one saved card.",
    inputSchema: {
      type: "object",
      required: ["action", "expectedRevision", "operationId"],
      properties: {
        workspaceId: { type: "string" }, ...revisionFields,
        action: { type: "string", enum: ["save_tabs", "open_cards", "focus_card", "open_group", "open_workspace"] },
        scope: { type: "string", enum: ["explicit", "workbench_selection", "current_window"], default: "explicit" },
        expectedWorkbenchRevision: { type: "string", description: "Required when scope uses the workbench selection or current window; returned by read_tab_workbench." },
        tabIds: { type: "array", minItems: 1, maxItems: 100, uniqueItems: true, items: { type: "integer" } },
        cardIds: cardIdList,
        cardId: { type: "string" },
        groupId: { type: "string" },
        includePinned: { type: "boolean", default: false }
      },
      additionalProperties: false,
      allOf: [
        { if: { properties: { action: { const: "save_tabs" } } }, then: { anyOf: [{ required: ["tabIds"] }, { properties: { scope: { const: "workbench_selection" } }, required: ["scope", "expectedWorkbenchRevision"] }, { properties: { scope: { const: "current_window" } }, required: ["scope", "expectedWorkbenchRevision"] }] } },
        { if: { properties: { action: { const: "open_cards" } } }, then: { anyOf: [{ required: ["cardIds"] }, { properties: { scope: { const: "workbench_selection" } }, required: ["scope", "expectedWorkbenchRevision"] }] } },
        { if: { properties: { action: { const: "focus_card" } } }, then: { required: ["cardId"] } },
        { if: { properties: { action: { const: "open_group" } } }, then: { required: ["groupId"] } }
      ]
    },
    outputSchema: toolOutputSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  {
    name: "close_browser_tabs",
    title: "Save and close Chrome tabs",
    description: "Close selected supported non-pinned current-window tabs. NEVER call it merely because the user says close. Call only when the user's latest message literally and explicitly confirms closing (for example 'I confirm' or '我确认'); otherwise ask for confirmation and do not call. Saves first by default and never closes pinned tabs.",
    inputSchema: {
      type: "object",
      required: ["expectedRevision", "operationId", "confirm", "confirmationText"],
      properties: {
        workspaceId: { type: "string" }, ...revisionFields,
        tabIds: { type: "array", minItems: 1, maxItems: 100, uniqueItems: true, items: { type: "integer" } },
        scope: { type: "string", enum: ["explicit", "workbench_selection", "current_window"], default: "explicit" },
        expectedWorkbenchRevision: { type: "string", description: "Required when scope uses the workbench selection or current window; returned by read_tab_workbench." },
        saveBeforeClose: { type: "boolean", default: true }, groupId: { type: "string" }, confirm: { const: true, description: "Set only when the latest user message explicitly confirms closing these exact tabs. Never infer confirmation from an imperative request." },
        confirmationText: { type: "string", minLength: 2, maxLength: 500, description: "Copy the user's literal confirmation words. The extension rejects text without explicit confirmation language such as 我确认 or I confirm." }
      },
      additionalProperties: false,
      anyOf: [
        { required: ["tabIds"] },
        { properties: { scope: { const: "workbench_selection" } }, required: ["scope", "expectedWorkbenchRevision"] },
        { properties: { scope: { const: "current_window" } }, required: ["scope", "expectedWorkbenchRevision"] }
      ]
    },
    outputSchema: toolOutputSchema,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true }
  },
  {
    name: "export_workspace",
    title: "Export a TabNexus workspace",
    description: "Export a workspace as deterministic Markdown or JSON. Settings, API keys, and browser tab IDs are never included.",
    inputSchema: {
      type: "object",
      properties: {
        workspaceId: { type: "string", description: "Omit to export the active workspace." },
        format: { type: "string", enum: ["markdown", "json"], default: "markdown" }
      },
      additionalProperties: false
    },
    outputSchema: toolOutputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  {
    name: "manage_preferences",
    title: "Manage safe TabNexus preferences",
    description: "Read or update safe display and behavior preferences. API keys and other secrets are never returned or accepted.",
    inputSchema: {
      type: "object",
      required: ["action"],
      properties: {
        action: { type: "string", enum: ["read", "update"] },
        expectedRevision: { type: "string" },
        operationId: revisionFields.operationId,
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
      additionalProperties: false,
      allOf: [{ if: { properties: { action: { const: "update" } } }, then: { required: ["expectedRevision", "operationId", "preferences"] } }]
    },
    outputSchema: toolOutputSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  {
    name: "manage_agent_activity",
    title: "Manage TabNexus Agent activity",
    description: "Read local Agent activity, or clear it only when the user's latest message explicitly confirms clearing this exact history. Clearing requires a fresh revision and confirm=true.",
    inputSchema: {
      type: "object",
      required: ["action"],
      properties: {
        workspaceId: { type: "string", description: "Omit to target the active workspace." },
        action: { type: "string", enum: ["read", "clear"] },
        expectedRevision: { type: "string" },
        operationId: revisionFields.operationId,
        confirm: { const: true, description: "Set only after literal, explicit confirmation in the latest user message." },
        confirmationText: { type: "string", minLength: 2, maxLength: 500, description: "Copy the user's literal confirmation words." }
      },
      additionalProperties: false,
      allOf: [{ if: { properties: { action: { const: "clear" } } }, then: { required: ["expectedRevision", "operationId", "confirm", "confirmationText"] } }]
    },
    outputSchema: toolOutputSchema,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false }
  }
];

const prompts = [
  {
    name: "organize_workspace",
    title: "Organize a TabNexus workspace",
    description: "Read, classify, rename, reorder, and arrange a workspace with a revision-safe edit.",
    arguments: [
      { name: "objective", description: "How the user wants the sources organized.", required: true },
      { name: "workspaceId", description: "Optional target workspace ID.", required: false }
    ]
  },
  {
    name: "capture_tabs",
    title: "Save current Chrome tabs",
    description: "Inspect current-window tabs, save the requested set, and close them only when explicitly requested.",
    arguments: [{ name: "objective", description: "Which tabs to save and whether to close them.", required: true }]
  },
  {
    name: "operate_tab_workbench",
    title: "Operate the TabNexus tab workbench",
    description: "Use the user's visible right-side selection to select, save, close, reopen, focus, or change the workbench view safely.",
    arguments: [{ name: "objective", description: "What to do in the tab workbench.", required: true }]
  },
  {
    name: "workspace_audit",
    title: "Audit a TabNexus workspace",
    description: "Find duplicates, stale grouping, missing relationships, and unclear statuses without changing anything by default.",
    arguments: [{ name: "workspaceId", description: "Optional target workspace ID.", required: false }]
  }
];

const subscriptions = new Map();
let subscriptionPollInFlight = false;
let extensionSocket = null;
let bridgeListenError = null;
let bridgeMode = "starting";
let followerHeartbeatTimer = null;
let leadershipAttempt = null;
const pendingBridgeCalls = new Map();
const activeAgents = new Map();

function writeJson(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function encodeWebSocketFrame(value, opcode = 0x1) {
  const payload = Buffer.isBuffer(value) ? value : Buffer.from(String(value), "utf8");
  if (payload.length > MAX_WEBSOCKET_MESSAGE_BYTES) throw new Error("TabNexus bridge message is too large");
  if (payload.length < 126) return Buffer.concat([Buffer.from([0x80 | opcode, payload.length]), payload]);
  if (payload.length <= 0xffff) {
    const header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(payload.length, 2);
    return Buffer.concat([header, payload]);
  }
  const header = Buffer.alloc(10);
  header[0] = 0x80 | opcode;
  header[1] = 127;
  header.writeBigUInt64BE(BigInt(payload.length), 2);
  return Buffer.concat([header, payload]);
}

function sendWebSocket(socket, message) {
  if (!socket || socket.destroyed) throw new Error("TabNexus Agent connection is offline");
  socket.write(encodeWebSocketFrame(JSON.stringify(message)));
}

function attachWebSocketParser(socket, onMessage) {
  let buffer = Buffer.alloc(0);
  socket.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 2) {
      const first = buffer[0];
      const second = buffer[1];
      const fin = (first & 0x80) !== 0;
      const opcode = first & 0x0f;
      const masked = (second & 0x80) !== 0;
      let length = second & 0x7f;
      let offset = 2;
      if (length === 126) {
        if (buffer.length < 4) return;
        length = buffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (buffer.length < 10) return;
        const wideLength = buffer.readBigUInt64BE(2);
        if (wideLength > BigInt(MAX_WEBSOCKET_MESSAGE_BYTES)) {
          socket.destroy();
          return;
        }
        length = Number(wideLength);
        offset = 10;
      }
      if (!fin || length > MAX_WEBSOCKET_MESSAGE_BYTES) {
        socket.destroy();
        return;
      }
      const maskOffset = masked ? 4 : 0;
      if (buffer.length < offset + maskOffset + length) return;
      const mask = masked ? buffer.subarray(offset, offset + 4) : null;
      offset += maskOffset;
      const payload = Buffer.from(buffer.subarray(offset, offset + length));
      buffer = buffer.subarray(offset + length);
      if (mask) {
        for (let index = 0; index < payload.length; index += 1) payload[index] ^= mask[index % 4];
      }
      if (opcode === 0x8) {
        socket.end(encodeWebSocketFrame(payload, 0x8));
        return;
      }
      if (opcode === 0x9) {
        socket.write(encodeWebSocketFrame(payload, 0xA));
        continue;
      }
      if (opcode !== 0x1) continue;
      try {
        onMessage(JSON.parse(payload.toString("utf8")));
      } catch {
        // Ignore malformed local messages; the pending request will time out safely.
      }
    }
  });
}

function normalizedAgent(value, fallbackId = randomUUID()) {
  const id = typeof value?.agentId === "string" && /^[A-Za-z0-9-]{1,80}$/.test(value.agentId)
    ? value.agentId
    : fallbackId;
  const name = typeof value?.agentName === "string" && value.agentName.trim()
    ? value.agentName.trim().slice(0, 60)
    : "Local Agent";
  const version = typeof value?.agentVersion === "string" && value.agentVersion.trim()
    ? value.agentVersion.trim().slice(0, 30)
    : undefined;
  const toolCount = Number.isInteger(value?.toolCount) && value.toolCount >= 0 ? value.toolCount : undefined;
  return { id, name, version, toolCount };
}

function pruneActiveAgents() {
  const threshold = Date.now() - AGENT_TTL_MS;
  for (const [id, agent] of activeAgents) {
    if (id !== AGENT_ID && agent.lastSeen < threshold) activeAgents.delete(id);
  }
}

function activeAgentList() {
  pruneActiveAgents();
  return [...activeAgents.values()].map(({ id, name, version, toolCount }) => ({
    id,
    name,
    ...(version ? { version } : {}),
    ...(Number.isInteger(toolCount) ? { toolCount } : {})
  }));
}

function broadcastAgentList() {
  if (!extensionSocket || extensionSocket.destroyed) return;
  sendWebSocket(extensionSocket, { type: "agents_changed", agents: activeAgentList() });
}

function touchAgent(value) {
  const agent = normalizedAgent(value);
  const previousSize = activeAgents.size;
  const previous = activeAgents.get(agent.id);
  activeAgents.set(agent.id, { ...agent, lastSeen: Date.now() });
  if (
    activeAgents.size !== previousSize ||
    previous?.name !== agent.name ||
    previous?.version !== agent.version ||
    previous?.toolCount !== agent.toolCount
  ) broadcastAgentList();
  return agent;
}

function sendHttpJson(response, status, value) {
  response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  response.end(JSON.stringify(value));
}

function readHttpJson(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BROKER_BODY_BYTES) {
        reject(new Error("TabNexus broker request is too large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        reject(new Error("TabNexus broker request contains invalid JSON"));
      }
    });
    request.on("error", reject);
  });
}

async function postToBroker(path, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(`${BROKER_BASE_URL}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-tabnexus-broker": "0.4" },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const value = await response.json().catch(() => null);
    if (!response.ok || !value || typeof value !== "object") {
      throw new Error(value?.error || `TabNexus broker returned HTTP ${response.status}`);
    }
    return value;
  } finally {
    clearTimeout(timer);
  }
}

async function readBrokerHealth() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2_000);
  try {
    const response = await fetch(`${BROKER_BASE_URL}/health`, { signal: controller.signal, cache: "no-store" });
    const value = await response.json().catch(() => null);
    if (!response.ok && response.status !== 503) throw new Error(`TabNexus broker returned HTTP ${response.status}`);
    if (!value || typeof value !== "object") throw new Error("TabNexus broker returned invalid health data");
    return value;
  } finally {
    clearTimeout(timer);
  }
}

async function announceFollower() {
  if (bridgeMode !== "follower") return;
  try {
    await postToBroker("/agent/register", {
      agentId: AGENT_ID,
      agentName: AGENT_NAME,
      agentVersion: SERVER_VERSION,
      toolCount: tools.length
    });
    bridgeListenError = null;
  } catch (error) {
    bridgeListenError = error instanceof Error ? error.message : String(error);
    void attemptBrokerLeadership();
  }
}

function startFollowerHeartbeat() {
  if (followerHeartbeatTimer !== null) return;
  void announceFollower();
  followerHeartbeatTimer = setInterval(() => void announceFollower(), 5_000);
  followerHeartbeatTimer.unref();
}

async function waitForBridgeMode(timeoutMs = 1_000) {
  const deadline = Date.now() + timeoutMs;
  while (bridgeMode === "starting" && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return bridgeMode;
}

async function waitForExtensionSocket(timeoutMs = 4_000) {
  const deadline = Date.now() + timeoutMs;
  while ((!extensionSocket || extensionSocket.destroyed) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return Boolean(extensionSocket && !extensionSocket.destroyed);
}

function markBrokerLeader() {
  bridgeMode = "leader";
  bridgeListenError = null;
  if (followerHeartbeatTimer !== null) clearInterval(followerHeartbeatTimer);
  followerHeartbeatTimer = null;
  touchAgent({ agentId: AGENT_ID, agentName: AGENT_NAME, agentVersion: SERVER_VERSION, toolCount: tools.length });
}

function listenForBroker() {
  bridgeMode = "starting";
  localBridgeServer.listen(BRIDGE_PORT, BRIDGE_HOST, markBrokerLeader);
  localBridgeServer.unref();
}

async function attemptBrokerLeadership() {
  if (bridgeMode === "leader") return true;
  if (leadershipAttempt) return leadershipAttempt;
  leadershipAttempt = (async () => {
    if (bridgeMode !== "follower") return bridgeMode === "leader";
    try {
      listenForBroker();
    } catch (error) {
      bridgeMode = "error";
      bridgeListenError = error instanceof Error ? error.message : String(error);
      return false;
    }
    const mode = await waitForBridgeMode(750);
    if (mode !== "leader") return false;
    await waitForExtensionSocket();
    return true;
  })().finally(() => { leadershipAttempt = null; });
  return leadershipAttempt;
}

function rejectPendingBridgeCalls(message) {
  for (const [requestId, pending] of pendingBridgeCalls) {
    clearTimeout(pending.timer);
    pending.reject(new Error(message));
    pendingBridgeCalls.delete(requestId);
  }
}

function handleExtensionMessage(message) {
  if (!message || typeof message !== "object") return;
  if (message.type === "keepalive") {
    if (extensionSocket) sendWebSocket(extensionSocket, { type: "keepalive_ack", at: Date.now() });
    return;
  }
  if (message.type !== "agent_tool_result" || typeof message.requestId !== "string") return;
  const pending = pendingBridgeCalls.get(message.requestId);
  if (!pending) return;
  pendingBridgeCalls.delete(message.requestId);
  clearTimeout(pending.timer);
  if (message.ok === true) pending.resolve(message.data);
  else pending.reject(new Error(typeof message.error === "string" ? message.error : "TabNexus Agent request failed"));
}

async function handleBrokerHttpRequest(request, response) {
  if (request.method === "GET" && request.url === "/health") {
    const agents = activeAgentList();
    sendHttpJson(response, extensionSocket ? 200 : 503, {
      ok: Boolean(extensionSocket),
      server: "tabnexus",
      version: SERVER_VERSION,
      toolCount: tools.length,
      toolNames: tools.map((tool) => tool.name),
      agentName: AGENT_NAME,
      agentCount: agents.length,
      agents
    });
    return;
  }
  if (request.method === "POST" && request.headers["x-tabnexus-broker"] === "0.4") {
    try {
      const body = await readHttpJson(request);
      if (request.url === "/agent/register") {
        touchAgent(body);
        sendHttpJson(response, 200, {
          ok: true,
          version: SERVER_VERSION,
          toolCount: tools.length,
          agents: activeAgentList()
        });
        return;
      }
      if (request.url === "/agent/call") {
        const agent = touchAgent(body);
        const tool = typeof body.tool === "string" ? body.tool : "";
        if (!tool) {
          sendHttpJson(response, 400, { ok: false, error: "A TabNexus tool name is required" });
          return;
        }
        try {
          const data = await directExtensionCall(tool, body.args ?? {}, agent);
          sendHttpJson(response, 200, { ok: true, data });
        } catch (error) {
          sendHttpJson(response, 200, { ok: false, error: error instanceof Error ? error.message : String(error) });
        }
        return;
      }
    } catch (error) {
      sendHttpJson(response, 400, { ok: false, error: error instanceof Error ? error.message : String(error) });
      return;
    }
  }
  response.writeHead(404, { "content-type": "text/plain" });
  response.end("Not found");
}

const localBridgeServer = createServer((request, response) => {
  void handleBrokerHttpRequest(request, response);
});

localBridgeServer.on("upgrade", (request, socket) => {
  const origin = typeof request.headers.origin === "string" ? request.headers.origin : "";
  const key = request.headers["sec-websocket-key"];
  const isExtensionOrigin = !origin || origin.startsWith("chrome-extension://");
  if (request.url !== "/tabnexus" || !isExtensionOrigin || typeof key !== "string") {
    socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    return;
  }
  const accept = createHash("sha1").update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
  socket.write([
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${accept}`,
    "\r\n"
  ].join("\r\n"));
  if (extensionSocket && extensionSocket !== socket) extensionSocket.destroy();
  extensionSocket = socket;
  socket.setNoDelay(true);
  attachWebSocketParser(socket, handleExtensionMessage);
  socket.on("close", () => {
    if (extensionSocket !== socket) return;
    extensionSocket = null;
    rejectPendingBridgeCalls("TabNexus extension disconnected");
  });
  socket.on("error", () => {
    if (extensionSocket === socket) extensionSocket = null;
  });
  sendWebSocket(socket, {
    type: "bridge_ready",
    transport: "agent_websocket",
    hostVersion: SERVER_VERSION,
    agentName: AGENT_NAME,
    agents: activeAgentList()
  });
});

localBridgeServer.on("error", (error) => {
  if (error?.code === "EADDRINUSE") {
    bridgeMode = "follower";
    bridgeListenError = null;
    startFollowerHeartbeat();
    return;
  }
  bridgeMode = "error";
  bridgeListenError = error instanceof Error ? error.message : String(error);
});

if (Number.isInteger(BRIDGE_PORT) && BRIDGE_PORT > 0 && BRIDGE_PORT <= 65535) {
  listenForBroker();
} else {
  bridgeMode = "error";
  bridgeListenError = "TABNEXUS_BRIDGE_PORT must be a valid TCP port";
}

function directExtensionCall(tool, args = {}, agent = { id: AGENT_ID, name: AGENT_NAME }) {
  return new Promise((resolve, reject) => {
    if (!extensionSocket || extensionSocket.destroyed) {
      reject(new Error("TabNexus is not connected. Open the TabNexus extension once, then retry in your Agent."));
      return;
    }
    const requestId = randomUUID();
    const { workspaceId, ...input } = args;
    const timer = setTimeout(() => {
      pendingBridgeCalls.delete(requestId);
      reject(new Error("TabNexus Agent request timed out"));
    }, 15_000);
    pendingBridgeCalls.set(requestId, { resolve, reject, timer });
    try {
      sendWebSocket(extensionSocket, {
        type: "agent_tool_request",
        requestId,
        agentId: agent.id,
        agentName: agent.name,
        workspaceId,
        payload: {
          tool,
          ...(Object.keys(input).length > 0 ? { input } : {})
        }
      });
    } catch (error) {
      pendingBridgeCalls.delete(requestId);
      clearTimeout(timer);
      reject(error);
    }
  });
}

async function websocketBridgeCall(tool, args = {}) {
  const mode = await waitForBridgeMode();
  if (mode === "leader") return directExtensionCall(tool, args);
  if (mode !== "follower") {
    throw new Error(bridgeListenError || "TabNexus local broker could not start");
  }
  let result;
  try {
    const health = await readBrokerHealth();
    if (typeof health.version !== "string" || compareVersions(health.version, SERVER_VERSION) < 0) {
      throw new Error(
        `MCP capability version mismatch: the shared bridge is ${health.version || "unknown"}, ` +
        `but this Agent loaded ${SERVER_VERSION}. Fully quit and reopen every Agent using TabNexus, then retry.`
      );
    }
    result = await postToBroker("/agent/call", {
      agentId: AGENT_ID,
      agentName: AGENT_NAME,
      agentVersion: SERVER_VERSION,
      toolCount: tools.length,
      tool,
      args
    });
  } catch (error) {
    if (await attemptBrokerLeadership()) {
      if (await waitForExtensionSocket()) return directExtensionCall(tool, args);
      throw new Error("TabNexus became the shared broker, but Chrome has not reconnected yet. Retry in a few seconds.");
    }
    throw new Error(`TabNexus shared broker is unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (result.ok === true) return result.data;
  throw new Error(typeof result.error === "string" ? result.error : "TabNexus Agent request failed");
}

function legacyBridgeCall(tool, args = {}) {
  return new Promise((resolve, reject) => {
    const socket = createConnection(legacySocketPath);
    const requestId = randomUUID();
    let buffer = "";
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("TabNexus bridge timed out"));
    }, 15_000);
    socket.setEncoding("utf8");
    socket.once("connect", () => {
      const { workspaceId, ...input } = args;
      socket.write(`${JSON.stringify({ type: "tool_call", requestId, tool, workspaceId, input })}\n`);
    });
    socket.on("data", (chunk) => {
      buffer += chunk;
      const newline = buffer.indexOf("\n");
      if (newline < 0) return;
      clearTimeout(timer);
      let response;
      try {
        response = JSON.parse(buffer.slice(0, newline));
      } catch {
        socket.destroy();
        reject(new Error("TabNexus bridge returned invalid JSON"));
        return;
      }
      socket.end();
      if (response.ok) resolve(response.data);
      else reject(new Error(response.error || "TabNexus bridge request failed"));
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(new Error(error.code === "ENOENT"
        ? "The legacy TabNexus bridge is offline."
        : error.message));
    });
  });
}

function bridgeCall(tool, args = {}) {
  return legacySocketPath ? legacyBridgeCall(tool, args) : websocketBridgeCall(tool, args);
}

function parseResourceUri(uri) {
  let parsed;
  try { parsed = new URL(uri); } catch { throw new Error("Invalid TabNexus resource URI"); }
  if (parsed.protocol !== "tabnexus:") {
    throw new Error("Unsupported TabNexus resource URI");
  }
  if (parsed.hostname === "workspaces" && parsed.pathname === "") return { index: true };
  if (parsed.hostname === "browser" && parsed.pathname === "/current-window") return { browser: true };
  if (parsed.hostname === "workbench" && parsed.pathname === "/current") return { workbench: true };
  if (parsed.hostname !== "workspace") throw new Error("Unsupported TabNexus resource URI");
  const segments = parsed.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (!segments[0]) throw new Error("Workspace resource is missing an id");
  if (segments.length === 1) return { workspaceId: segments[0], detail: "summary" };
  if (segments.length === 3 && segments[1] === "card") {
    return { workspaceId: segments[0], detail: "full", cardIds: [segments[2]] };
  }
  throw new Error("Unsupported TabNexus resource path");
}

async function readResourceData(uri, sinceRevision) {
  const input = parseResourceUri(uri);
  if (input.index) {
    const context = await bridgeCall("read_workspace", { detail: "summary" });
    if (sinceRevision && sinceRevision === context.stateRevision) {
      return { resource: "workspace_index", revision: context.stateRevision, unchanged: true };
    }
    return {
      resource: "workspace_index",
      revision: context.stateRevision,
      unchanged: false,
      activeWorkspaceId: context.activeWorkspaceId,
      workspaces: context.workspaceIndex ?? []
    };
  }
  if (input.browser) {
    const context = await bridgeCall("read_workspace", {
      detail: "summary",
      ...(sinceRevision ? { sinceRevision: `browser:${sinceRevision}` } : {})
    });
    if (sinceRevision && sinceRevision === context.browserRevision) {
      return { resource: "current_window_tabs", revision: context.browserRevision, unchanged: true };
    }
    return {
      resource: "current_window_tabs",
      revision: context.browserRevision,
      unchanged: false,
      tabs: context.browserTabs ?? []
    };
  }
  if (input.workbench) {
    const context = await bridgeCall("read_tab_workbench", { ...(sinceRevision ? { sinceRevision } : {}) });
    if (context.unchanged) return { resource: "tab_workbench", revision: context.revision, unchanged: true };
    return { resource: "tab_workbench", revision: context.revision, unchanged: false, ...context.workbench };
  }
  return bridgeCall("read_workspace", { ...input, sinceRevision });
}

async function listResources() {
  const context = await bridgeCall("read_workspace", { detail: "summary" });
  const workspaces = (context.workspaceIndex ?? []).map((workspace) => ({
    uri: `tabnexus://workspace/${encodeURIComponent(workspace.id)}`,
    name: workspace.name,
    title: workspace.name,
    description: `${workspace.cardCount} cards · ${workspace.groupCount} groups · revision ${workspace.revision}`,
    mimeType: "application/json",
    annotations: { audience: ["assistant"], priority: workspace.id === context.activeWorkspaceId ? 1 : 0.7, lastModified: workspace.updatedAt }
  }));
  return [{
    uri: "tabnexus://workspaces",
    name: "workspace-index",
    title: "All TabNexus workspaces",
    description: `${workspaces.length} workspaces · active ${context.activeWorkspaceId}`,
    mimeType: "application/json",
    annotations: { audience: ["assistant"], priority: 1, lastModified: new Date().toISOString() }
  }, ...workspaces, {
    uri: "tabnexus://browser/current-window",
    name: "current-window-tabs",
    title: "Current Chrome window tabs",
    description: `${context.browserTabs?.length ?? 0} supported tabs · revision ${context.browserRevision}`,
    mimeType: "application/json",
    annotations: { audience: ["assistant"], priority: 0.9 }
  }, {
    uri: "tabnexus://workbench/current",
    name: "tab-workbench",
    title: "TabNexus tab workbench",
    description: "Live right-side tab operation area, including the user's selection, open tabs, saved-closed cards, and recovery entries",
    mimeType: "application/json",
    annotations: { audience: ["assistant"], priority: 1 }
  }];
}

async function pollSubscriptions() {
  if (subscriptionPollInFlight || subscriptions.size === 0) return;
  subscriptionPollInFlight = true;
  try {
    await Promise.all([...subscriptions.entries()].map(async ([uri, revision]) => {
      try {
        const context = await readResourceData(uri, revision);
        if (context.unchanged) return;
        subscriptions.set(uri, context.revision);
        writeJson({ jsonrpc: "2.0", method: "notifications/resources/updated", params: { uri } });
      } catch {
        // A disconnected extension is reported by the next explicit client read or tool call.
      }
    }));
  } finally {
    subscriptionPollInFlight = false;
  }
}

const subscriptionTimer = setInterval(() => void pollSubscriptions(), 2_000);
subscriptionTimer.unref();

function chosenProtocolVersion(requested) {
  return SUPPORTED_PROTOCOL_VERSIONS.has(requested) ? requested : LATEST_PROTOCOL_VERSION;
}

async function handleRequest(message) {
  if (!message || typeof message !== "object" || message.jsonrpc !== "2.0") return;
  if (message.method === "initialize") {
    writeJson({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        protocolVersion: chosenProtocolVersion(message.params?.protocolVersion),
        capabilities: { tools: { listChanged: false }, resources: { subscribe: true, listChanged: false }, prompts: { listChanged: false } },
        serverInfo: { name: "tabnexus", title: "TabNexus local workspace", version: SERVER_VERSION },
        instructions: "Start with tabnexus://workspaces for saved content and tabnexus://workbench/current for the visible tab operation area. Re-read the relevant revision before every write and reuse one stable operationId on retries. NEVER infer destructive confirmation from words such as delete, remove, close, or clear: call delete_workspace_items, close_browser_tabs, dismiss_recent_tabs, or manage_agent_activity clear only when the latest user message literally and explicitly confirms the exact action; otherwise ask and do not call. manage_tab_workbench controls selection, rail visibility, focus, and recovery. sync_browser_tabs can save a selection/current window and reopen cards, a group, or a workspace. edit_workspace handles classification, metadata, order, canvas layout, and relationships; manage_workspaces handles workspace lifecycle. export_workspace returns Markdown or JSON; manage_preferences exposes only non-secret settings. Pinned tabs cannot be closed. Built-in model API keys are never exposed."
      }
    });
    return;
  }
  if (message.method === "ping") {
    writeJson({ jsonrpc: "2.0", id: message.id, result: {} });
    return;
  }
  if (message.method === "tools/list") {
    writeJson({ jsonrpc: "2.0", id: message.id, result: { tools } });
    return;
  }
  if (message.method === "prompts/list") {
    writeJson({ jsonrpc: "2.0", id: message.id, result: { prompts } });
    return;
  }
  if (message.method === "prompts/get") {
    const prompt = prompts.find((candidate) => candidate.name === message.params?.name);
    if (!prompt) {
      writeJson({ jsonrpc: "2.0", id: message.id, error: { code: -32602, message: "Unknown TabNexus prompt" } });
      return;
    }
    const objective = String(message.params?.arguments?.objective ?? "Organize the workspace clearly").slice(0, 1000);
    const workspaceId = String(message.params?.arguments?.workspaceId ?? "").trim();
    const target = workspaceId ? ` Target workspace: ${workspaceId}.` : " Use the active workspace unless the user names another one.";
    const text = prompt.name === "organize_workspace"
      ? `Use TabNexus to achieve this objective: ${objective}.${target} Read the latest summary first, explain the proposed changes briefly, then apply one revision-safe edit_workspace call. Do not delete cards unless the user explicitly asks.`
      : prompt.name === "capture_tabs"
        ? `Inspect tabnexus://workbench/current and fulfill: ${objective}. Respect the user's visible selection; use manage_tab_workbench when selection must change, then use sync_browser_tabs with scope=workbench_selection. Call close_browser_tabs only if explicitly requested, keep pinned tabs open, and save before closing.`
        : prompt.name === "operate_tab_workbench"
          ? `Operate TabNexus's visible tab workbench to fulfill: ${objective}. Read tabnexus://workbench/current first. Prefer the existing user selection. If it must change, use manage_tab_workbench with the fresh revision. Use scope=workbench_selection for save/open/close actions; require explicit confirmation before closing tabs or dismissing recovery entries.`
          : `Audit the TabNexus workspace.${target} Search and read relevant cards, then report duplicate URLs, unclear groups, missing statuses, and useful relationships. Do not modify anything unless the user asks after seeing the audit.`;
    writeJson({ jsonrpc: "2.0", id: message.id, result: { description: prompt.description, messages: [{ role: "user", content: { type: "text", text } }] } });
    return;
  }
  if (message.method === "resources/list") {
    try {
      writeJson({ jsonrpc: "2.0", id: message.id, result: { resources: await listResources() } });
    } catch (error) {
      writeJson({ jsonrpc: "2.0", id: message.id, error: { code: -32001, message: error instanceof Error ? error.message : String(error) } });
    }
    return;
  }
  if (message.method === "resources/templates/list") {
    writeJson({
      jsonrpc: "2.0",
      id: message.id,
      result: { resourceTemplates: [{
        uriTemplate: "tabnexus://workspace/{workspaceId}/card/{cardId}",
        name: "tabnexus-card",
        title: "TabNexus card detail",
        description: "Full detail for one saved card, including its note.",
        mimeType: "application/json"
      }] }
    });
    return;
  }
  if (message.method === "resources/read") {
    try {
      const uri = message.params?.uri;
      const result = await readResourceData(uri);
      writeJson({
        jsonrpc: "2.0",
        id: message.id,
        result: { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(result, null, 2), _meta: { revision: result.revision } }] }
      });
    } catch (error) {
      writeJson({ jsonrpc: "2.0", id: message.id, error: { code: -32602, message: error instanceof Error ? error.message : String(error) } });
    }
    return;
  }
  if (message.method === "resources/subscribe") {
    try {
      const uri = message.params?.uri;
      const result = await readResourceData(uri);
      subscriptions.set(uri, result.revision);
      writeJson({ jsonrpc: "2.0", id: message.id, result: {} });
    } catch (error) {
      writeJson({ jsonrpc: "2.0", id: message.id, error: { code: -32602, message: error instanceof Error ? error.message : String(error) } });
    }
    return;
  }
  if (message.method === "resources/unsubscribe") {
    subscriptions.delete(message.params?.uri);
    writeJson({ jsonrpc: "2.0", id: message.id, result: {} });
    return;
  }
  if (message.method === "tools/call") {
    const tool = message.params?.name;
    if (!tools.some((candidate) => candidate.name === tool)) {
      writeJson({ jsonrpc: "2.0", id: message.id, error: { code: -32602, message: "Unknown TabNexus tool" } });
      return;
    }
    try {
      const result = await bridgeCall(tool, message.params?.arguments ?? {});
      writeJson({
        jsonrpc: "2.0",
        id: message.id,
        result: { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result }
      });
      void pollSubscriptions();
    } catch (error) {
      writeJson({
        jsonrpc: "2.0",
        id: message.id,
        result: { isError: true, content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }] }
      });
    }
    return;
  }
  if (message.id !== undefined) {
    writeJson({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "Method not found" } });
  }
}

const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on("line", (line) => {
  if (!line.trim()) return;
  try {
    void handleRequest(JSON.parse(line));
  } catch {
    writeJson({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
  }
});
