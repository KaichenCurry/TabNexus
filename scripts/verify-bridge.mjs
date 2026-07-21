#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { createConnection } from "node:net";
import { homedir, platform } from "node:os";
import { join } from "node:path";

const socketPath = process.env.TABNEXUS_BRIDGE_SOCKET || (platform() === "darwin"
  ? join(homedir(), "Library", "Application Support", "TabNexus", "bridge.sock")
  : join(homedir(), ".tabnexus", "bridge.sock"));
const socket = createConnection(socketPath);
const requestId = randomUUID();
let buffer = "";

const timeout = setTimeout(() => {
  socket.destroy();
  console.error("Verification timed out. Keep Chrome open and reconnect the local bridge in TabNexus Settings.");
  process.exitCode = 1;
}, 10_000);

socket.setEncoding("utf8");
socket.once("connect", () => {
  socket.write(`${JSON.stringify({
    type: "tool_call",
    requestId,
    tool: "read_workspace",
    input: { detail: "summary" }
  })}\n`);
});
socket.on("data", (chunk) => {
  buffer += chunk;
  const newline = buffer.indexOf("\n");
  if (newline < 0) return;
  clearTimeout(timeout);
  socket.end();
  const response = JSON.parse(buffer.slice(0, newline));
  if (!response.ok) {
    console.error(response.error || "TabNexus bridge verification failed.");
    process.exitCode = 1;
    return;
  }
  const data = response.data ?? {};
  const active = (data.workspaceIndex ?? []).find((workspace) => workspace.id === data.activeWorkspaceId);
  console.log("TabNexus MCP bridge is ready.");
  console.log(`Workspace: ${active?.name ?? data.summary?.name ?? "unknown"}`);
  console.log(`Saved cards: ${active?.cardCount ?? data.summary?.cards?.length ?? 0}`);
  console.log(`Current supported tabs: ${data.browserTabs?.length ?? 0}`);
  console.log(`Revision: ${data.revision ?? "unknown"}`);
});
socket.once("error", (error) => {
  clearTimeout(timeout);
  console.error(error.code === "ENOENT"
    ? "The bridge is not running. In TabNexus Settings, click “Connect local bridge” first."
    : error.message);
  process.exitCode = 1;
});
