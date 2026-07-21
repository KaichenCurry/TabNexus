#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import {
  EXPECTED_MCP_VERSION,
  EXPECTED_TOOLS,
  startMockBroker
} from "../plugins/tabnexus/skills/tabnexus-mcp-evals/scripts/run-evals.mjs";

const SCRIPT_VERSION = "1.0.0";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) continue;
    const key = argument.slice(2).replaceAll("-", "_");
    const value = argv[index + 1];
    if (value && !value.startsWith("--")) { options[key] = value; index += 1; }
    else options[key] = true;
  }
  return options;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function unique(values) {
  return [...new Set(values)];
}

function markdownReport(report) {
  return `${[
    "# TabNexus MCP capability test",
    "",
    `- Script: ${report.scriptVersion}`,
    `- MCP: ${report.mcpVersion}`,
    `- Result: ${report.pass ? "PASS" : "FAIL"}`,
    `- Checks: ${report.passedChecks}/${report.totalChecks}`,
    `- Successful tools: ${report.successfulTools.length}/${report.expectedTools.length}`,
    `- Duration: ${report.durationMs} ms`,
    "",
    "| Check | Result | Duration |",
    "|---|---:|---:|",
    ...report.checks.map((check) => `| ${check.name} | ${check.pass ? "PASS" : `FAIL — ${check.error}`} | ${check.durationMs} ms |`),
    "",
    "## Successful tool coverage",
    "",
    report.successfulTools.map((tool) => `- \`${tool}\``).join("\n"),
    ...(report.failure ? ["", "## Failure", "", `\`${report.failure}\``] : [])
  ].join("\n")}\n`;
}

function createRpcClient(child) {
  let nextId = 1;
  const pending = new Map();
  let stderr = "";
  createInterface({ input: child.stdout, crlfDelay: Infinity }).on("line", (line) => {
    let message;
    try { message = JSON.parse(line); } catch { return; }
    if (message.id === undefined || !pending.has(message.id)) return;
    const waiter = pending.get(message.id);
    pending.delete(message.id);
    clearTimeout(waiter.timer);
    if (message.error) waiter.reject(new Error(message.error.message || "MCP JSON-RPC error"));
    else waiter.resolve(message.result);
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.once("exit", (code, signal) => {
    for (const waiter of pending.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error(`MCP process exited (${code ?? signal ?? "unknown"})${stderr ? `: ${stderr.trim()}` : ""}`));
    }
    pending.clear();
  });
  return {
    request(method, params = {}, timeoutMs = 10_000) {
      const id = nextId++;
      return new Promise((resolveRequest, rejectRequest) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          rejectRequest(new Error(`MCP request timed out: ${method}`));
        }, timeoutMs);
        pending.set(id, { resolve: resolveRequest, reject: rejectRequest, timer });
        child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
      });
    },
    stderr: () => stderr
  };
}

async function runCapabilityTest({ serverEntry, reportDirectory }) {
  const startedAt = Date.now();
  const checks = [];
  const successfulTools = new Set();
  const broker = await startMockBroker();
  const child = spawn(process.execPath, [serverEntry], {
    env: {
      ...process.env,
      TABNEXUS_BRIDGE_PORT: String(broker.port),
      TABNEXUS_AGENT_NAME: "Capability Test"
    },
    stdio: ["pipe", "pipe", "pipe"]
  });
  const rpc = createRpcClient(child);

  const check = async (name, task) => {
    const checkStartedAt = Date.now();
    try {
      const value = await task();
      checks.push({ name, pass: true, durationMs: Date.now() - checkStartedAt });
      return value;
    } catch (error) {
      checks.push({ name, pass: false, durationMs: Date.now() - checkStartedAt, error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  };
  const callTool = (name, argumentsValue = {}) => check(`tool:${name}`, async () => {
    const response = await rpc.request("tools/call", { name, arguments: argumentsValue });
    if (response?.isError) throw new Error(response.content?.[0]?.text || `${name} failed`);
    assert(response?.structuredContent?.tool === name, `${name} returned an invalid structured result`);
    successfulTools.add(name);
    return response.structuredContent;
  });
  const expectToolError = (name, argumentsValue, contains) => check(`guard:${name}:${contains}`, async () => {
    const response = await rpc.request("tools/call", { name, arguments: argumentsValue });
    assert(response?.isError === true, `${name} unexpectedly accepted an unsafe call`);
    assert(String(response.content?.[0]?.text ?? "").toLowerCase().includes(contains.toLowerCase()), `${name} returned the wrong guard error`);
  });

  let failure;
  try {
    const initialized = await check("protocol:initialize", () => rpc.request("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "tabnexus-capability-test", version: SCRIPT_VERSION } }));
    assert(initialized.serverInfo.version === EXPECTED_MCP_VERSION, `Expected MCP ${EXPECTED_MCP_VERSION}, received ${initialized.serverInfo.version}`);
    assert(initialized.capabilities.resources.subscribe === true, "Resource subscriptions are not enabled");

    const listed = await check("protocol:tools-list", () => rpc.request("tools/list"));
    const toolNames = listed.tools.map((tool) => tool.name);
    assert(JSON.stringify(toolNames) === JSON.stringify(EXPECTED_TOOLS), "MCP tool list does not match the 17-tool contract");
    assert(listed.tools.every((tool) => tool.inputSchema && tool.outputSchema && tool.annotations), "A tool is missing schema or safety annotations");

    const prompts = await check("protocol:prompts", () => rpc.request("prompts/list"));
    assert(JSON.stringify(prompts.prompts.map((prompt) => prompt.name)) === JSON.stringify(["organize_workspace", "capture_tabs", "operate_tab_workbench", "workspace_audit"]), "MCP guided prompts are incomplete");
    const workbenchPrompt = await check("protocol:workbench-prompt", () => rpc.request("prompts/get", { name: "operate_tab_workbench", arguments: { objective: "Save the selected tabs" } }));
    assert(workbenchPrompt.messages?.[0]?.content?.text.includes("workbench_selection"), "Workbench prompt does not teach selection-safe operation");

    const resources = await check("protocol:resources-list", () => rpc.request("resources/list"));
    const resourceUris = resources.resources.map((resource) => resource.uri);
    assert(resourceUris.includes("tabnexus://workspaces"), "Workspace index resource is missing");
    assert(resourceUris.includes("tabnexus://browser/current-window"), "Browser resource is missing");
    assert(resourceUris.includes("tabnexus://workbench/current"), "Workbench resource is missing");
    const workbenchResource = await check("protocol:workbench-resource", () => rpc.request("resources/read", { uri: "tabnexus://workbench/current" }));
    const workbenchResourceData = JSON.parse(workbenchResource.contents[0].text);
    assert(workbenchResourceData.counts.open === 4, "Workbench resource returned the wrong open-tab count");

    let workspace = await callTool("read_workspace", { detail: "summary" });
    assert(workspace.summary.name === "浏览器调研", "read_workspace returned the wrong fixture");
    const searched = await callTool("search_cards", { query: "DeepSeek", includeNotes: false, limit: 20 });
    assert(searched.matches.length >= 2, "search_cards did not find fixture sources");

    const added = await callTool("add_card", {
      title: "Capability source",
      url: "https://capability.example/source",
      note: "single add",
      expectedRevision: workspace.revision,
      operationId: "cap:add-one"
    });
    const batch = await callTool("add_cards", {
      cards: [
        { title: "Batch note", note: "batch one", type: "note" },
        { title: "Batch URL", url: "https://capability.example/batch", type: "web", status: "read" }
      ],
      expectedRevision: added.revision,
      operationId: "cap:add-batch"
    });
    assert(batch.addedCardIds.length === 2, "add_cards did not add both cards");
    const report = await callTool("write_report", {
      title: "Capability report",
      content: "Automated MCP capability test",
      groupId: "group_research",
      expectedRevision: batch.revision,
      operationId: "cap:report"
    });
    const proposal = await callTool("propose_structure", {
      summary: "Connect docs to home",
      edges: [{ fromCardId: "card_docs", toCardId: "card_home", label: "supports" }],
      expectedRevision: report.revision,
      operationId: "cap:proposal"
    });
    const edited = await callTool("edit_workspace", {
      expectedRevision: proposal.revision,
      operationId: "cap:edit",
      actions: [
        { type: "create_group", groupId: "auto_group", name: "Automation", color: "#5368AC" },
        { type: "move_cards", cardIds: ["card_notes"], targetGroupId: "auto_group" },
        { type: "update_card", cardId: "card_notes", status: "read", note: "Updated by capability test" },
        { type: "position_cards", positions: [{ cardId: "card_notes", x: 320, y: 180 }] },
        { type: "upsert_edges", edges: [{ fromCardId: "card_notes", toCardId: "card_docs", label: "references" }] }
      ]
    });
    const exported = await callTool("export_workspace", { format: "markdown" });
    assert(exported.content.includes("浏览器调研"), "export_workspace did not return workspace content");
    const preferences = await callTool("manage_preferences", { action: "read" });
    assert(!JSON.stringify(preferences).toLowerCase().includes("apikey"), "manage_preferences exposed a secret field");
    const updatedPreferences = await callTool("manage_preferences", {
      action: "update",
      expectedRevision: preferences.revision,
      operationId: "cap:update-preferences",
      preferences: { workspaceView: "flow", rightRailCollapsed: true }
    });
    assert(updatedPreferences.preferences.workspaceView === "flow", "manage_preferences did not update the workspace view");
    const activity = await callTool("manage_agent_activity", { action: "read" });
    const clearedActivity = await callTool("manage_agent_activity", {
      action: "clear",
      expectedRevision: activity.revision,
      operationId: "cap:clear-activity",
      confirm: true,
      confirmationText: "I confirm clearing this test activity"
    });
    assert(clearedActivity.activities.length === 0, "manage_agent_activity did not clear activity");

    workspace = await callTool("read_workspace", { detail: "summary" });
    const managed = await callTool("manage_workspaces", {
      expectedStateRevision: workspace.stateRevision,
      operationId: "cap:manage-workspaces",
      actions: [
        { type: "create_workspace", workspaceId: "ws_auto", name: "Automation workspace", makeActive: false },
        { type: "rename_workspace", workspaceId: "ws_research", name: "浏览器调研 · 已测试" },
        { type: "duplicate_workspace", workspaceId: "ws_research", name: "Automation copy", makeActive: false },
        { type: "set_active_workspace", workspaceId: "ws_research" }
      ]
    });
    const deletedItems = await callTool("delete_workspace_items", {
      expectedRevision: managed.revision,
      operationId: "cap:delete-items",
      cardIds: [added.cardId],
      groupIds: ["auto_group"],
      confirm: true,
      confirmationText: "I confirm deleting these test items"
    });
    const deletedWorkspace = await callTool("delete_workspace_items", {
      workspaceId: "ws_auto",
      expectedRevision: deletedItems.revision,
      expectedStateRevision: deletedItems.stateRevision,
      operationId: "cap:delete-workspace",
      deleteWorkspace: true,
      confirm: true,
      confirmationText: "I confirm deleting this test workspace"
    });

    let workbench = await callTool("read_tab_workbench");
    const selectedForSave = await callTool("manage_tab_workbench", {
      expectedRevision: workbench.revision,
      operationId: "cap:select-save",
      actions: [
        { type: "set_selection", mode: "replace", tabIds: [102] },
        { type: "set_collapsed", collapsed: true },
        { type: "focus_tab", tabId: 101 },
        { type: "reopen_recent", recentIds: ["recent_2"] }
      ]
    });
    assert(selectedForSave.workbench.selectedTabIds.includes(102), "manage_tab_workbench did not share the selection");
    assert(selectedForSave.workbench.collapsed === true, "manage_tab_workbench did not persist the collapsed state");
    const savedSelection = await callTool("sync_browser_tabs", {
      action: "save_tabs",
      scope: "workbench_selection",
      expectedWorkbenchRevision: selectedForSave.revision,
      expectedRevision: deletedWorkspace.revision,
      operationId: "cap:save-selection",
      groupId: "group_research"
    });
    assert(savedSelection.usedWorkbenchSelection === true, "sync_browser_tabs did not consume the shared selection");
    assert(savedSelection.savedCardIds.length === 1, "sync_browser_tabs did not save the selected unsaved tab");
    await callTool("sync_browser_tabs", {
      action: "open_cards",
      cardIds: ["card_home"],
      expectedRevision: savedSelection.revision,
      operationId: "cap:open-card"
    });
    await callTool("sync_browser_tabs", {
      action: "focus_card",
      cardId: "card_docs",
      expectedRevision: savedSelection.revision,
      operationId: "cap:focus-card"
    });

    workbench = await callTool("read_tab_workbench");
    assert(workbench.workbench.selectedTabIds.length === 0, "Successful scoped save did not clear the workbench selection");
    const dismissed = await callTool("dismiss_recent_tabs", {
      expectedRevision: workbench.revision,
      operationId: "cap:dismiss-recent",
      recentIds: ["recent_1"],
      confirm: true,
      confirmationText: "I confirm dismissing this recovery entry"
    });
    assert(dismissed.dismissedRecentIds.includes("recent_1"), "dismiss_recent_tabs did not remove the requested recovery entry");
    const selectedForClose = await callTool("manage_tab_workbench", {
      expectedRevision: dismissed.revision,
      operationId: "cap:select-close",
      actions: [
        { type: "select_all", scope: "open", includePinned: true },
        { type: "set_collapsed", collapsed: false }
      ]
    });
    const closed = await callTool("close_browser_tabs", {
      scope: "workbench_selection",
      expectedWorkbenchRevision: selectedForClose.revision,
      expectedRevision: savedSelection.revision,
      operationId: "cap:close-selection",
      saveBeforeClose: true,
      confirm: true,
      confirmationText: "I confirm closing the selected test tabs"
    });
    assert(closed.usedWorkbenchSelection === true, "close_browser_tabs did not consume the shared selection");
    assert(closed.skippedPinnedTabIds.includes(103), "close_browser_tabs did not protect the pinned tab");
    assert(closed.closedTabIds.length === 3, "close_browser_tabs closed the wrong number of ordinary tabs");
    const finalWorkbench = await callTool("read_tab_workbench");
    assert(finalWorkbench.workbench.counts.open === 1, "The final workbench should contain only the pinned tab");
    assert(finalWorkbench.workbench.counts.selected === 0, "Successful close did not clear selection");

    await expectToolError("close_browser_tabs", {
      tabIds: [103],
      expectedRevision: savedSelection.revision,
      operationId: "cap:unsafe-close",
      confirm: false
    }, "confirm");
    await expectToolError("dismiss_recent_tabs", {
      expectedRevision: finalWorkbench.revision,
      operationId: "cap:unsafe-dismiss",
      recentIds: ["missing"],
      confirm: false
    }, "confirm");
    await expectToolError("manage_agent_activity", {
      action: "clear",
      expectedRevision: clearedActivity.revision,
      operationId: "cap:unsafe-clear-activity",
      confirm: false
    }, "confirmation");
    await expectToolError("edit_workspace", {
      expectedRevision: "wsr_eval_0001",
      operationId: "cap:stale-edit",
      actions: [{ type: "rename_workspace", name: "Stale overwrite" }]
    }, "changed");

    const brokerSuccessfulTools = unique(broker.calls.filter((call) => call.ok).map((call) => call.tool));
    const missingTools = EXPECTED_TOOLS.filter((tool) => !brokerSuccessfulTools.includes(tool));
    assert(missingTools.length === 0, `Successful end-to-end coverage is missing: ${missingTools.join(", ")}`);
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
  } finally {
    child.kill();
    await broker.close();
  }

  const successfulToolList = EXPECTED_TOOLS.filter((tool) => successfulTools.has(tool));
  const report = {
    scriptVersion: SCRIPT_VERSION,
    mcpVersion: EXPECTED_MCP_VERSION,
    generatedAt: new Date().toISOString(),
    pass: !failure && checks.every((check) => check.pass) && successfulToolList.length === EXPECTED_TOOLS.length,
    durationMs: Date.now() - startedAt,
    totalChecks: checks.length,
    passedChecks: checks.filter((check) => check.pass).length,
    expectedTools: EXPECTED_TOOLS,
    successfulTools: successfulToolList,
    brokerCalls: broker.calls,
    checks,
    ...(failure ? { failure } : {})
  };
  await mkdir(reportDirectory, { recursive: true });
  await Promise.all([
    writeFile(resolve(reportDirectory, "capability-latest.json"), `${JSON.stringify(report, null, 2)}\n`),
    writeFile(resolve(reportDirectory, "capability-latest.md"), markdownReport(report))
  ]);
  return report;
}

const options = parseArgs(process.argv.slice(2));
const report = await runCapabilityTest({
  serverEntry: resolve(root, String(options.server ?? "bridge/tabnexus-mcp.mjs")),
  reportDirectory: resolve(root, String(options.report_dir ?? "evals/tabnexus-mcp"))
});
console.log(JSON.stringify({
  pass: report.pass,
  mcpVersion: report.mcpVersion,
  tools: `${report.successfulTools.length}/${report.expectedTools.length}`,
  checks: `${report.passedChecks}/${report.totalChecks}`,
  durationMs: report.durationMs,
  report: resolve(root, String(options.report_dir ?? "evals/tabnexus-mcp"), "capability-latest.md"),
  ...(report.failure ? { failure: report.failure } : {})
}, null, 2));
if (!report.pass) process.exitCode = 1;
