import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { createInterface } from "node:readline";

const serverEntry = process.argv[2] ? resolve(process.argv[2]) : resolve("agent/bridge/tabnexus-mcp.mjs");
const child = spawn(process.execPath, [serverEntry], {
  stdio: ["pipe", "pipe", "inherit"]
});
const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
const responses = [];
lines.on("line", (line) => responses.push(JSON.parse(line)));
child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } })}\n`);
child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })}\n`);
child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 3, method: "prompts/list", params: {} })}\n`);

await new Promise((resolveWait, reject) => {
  const timer = setTimeout(() => reject(new Error("MCP self-check timed out")), 3_000);
  const interval = setInterval(() => {
    if (responses.length < 3) return;
    clearTimeout(timer);
    clearInterval(interval);
    resolveWait();
  }, 20);
});
child.kill();

const initialize = responses.find((response) => response.id === 1);
const listed = responses.find((response) => response.id === 2);
const promptList = responses.find((response) => response.id === 3);
if (initialize?.result?.serverInfo?.name !== "tabnexus") throw new Error("Invalid MCP initialize response");
if (initialize?.result?.capabilities?.resources?.subscribe !== true) throw new Error("MCP resource subscriptions are unavailable");
const names = listed?.result?.tools?.map((tool) => tool.name);
if (JSON.stringify(names) !== JSON.stringify(["read_workspace", "search_cards", "add_card", "add_cards", "write_report", "propose_structure", "edit_workspace", "manage_workspaces", "delete_workspace_items", "read_tab_workbench", "manage_tab_workbench", "dismiss_recent_tabs", "sync_browser_tabs", "close_browser_tabs", "export_workspace", "manage_preferences", "manage_agent_activity"])) {
  throw new Error("Invalid MCP tool list");
}
if (listed.result.tools.some((tool) => !tool.outputSchema || !tool.annotations)) {
  throw new Error("MCP tools are missing structured output or safety annotations");
}
if (JSON.stringify(promptList?.result?.prompts?.map((prompt) => prompt.name)) !== JSON.stringify(["organize_workspace", "capture_tabs", "operate_tab_workbench", "workspace_audit"])) {
  throw new Error("Invalid MCP prompt list");
}
console.log(`TabNexus MCP ${initialize.result.serverInfo.version}: ${names.length} tools + prompts + subscribed resources ready (${serverEntry})`);
