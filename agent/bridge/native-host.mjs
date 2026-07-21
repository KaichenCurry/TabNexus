#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { mkdir, chmod, unlink } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { homedir, platform } from "node:os";

const HOST_VERSION = "0.2.0";
const MAX_NATIVE_MESSAGE_BYTES = 1024 * 1024;
const MAX_SOCKET_LINE_BYTES = 512 * 1024;
const socketPath = process.env.TABNEXUS_BRIDGE_SOCKET || (platform() === "darwin"
  ? join(homedir(), "Library", "Application Support", "TabNexus", "bridge.sock")
  : join(homedir(), ".tabnexus", "bridge.sock"));

let nativeBuffer = Buffer.alloc(0);
const pendingClients = new Map();

function sendNative(message) {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  if (body.length > MAX_NATIVE_MESSAGE_BYTES) throw new Error("Native message exceeds 1 MB");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  process.stdout.write(Buffer.concat([header, body]));
}

function sendSocket(socket, message) {
  if (!socket.destroyed) socket.write(`${JSON.stringify(message)}\n`);
}

function handleNativeMessage(message) {
  if (!message || typeof message !== "object") return;
  if (message.type !== "agent_tool_result" || typeof message.requestId !== "string") return;
  const socket = pendingClients.get(message.requestId);
  if (!socket) return;
  pendingClients.delete(message.requestId);
  sendSocket(socket, {
    type: "tool_result",
    requestId: message.requestId,
    ok: message.ok === true,
    data: message.data,
    error: typeof message.error === "string" ? message.error : undefined
  });
}

function drainNativeInput(chunk) {
  nativeBuffer = Buffer.concat([nativeBuffer, chunk]);
  while (nativeBuffer.length >= 4) {
    const length = nativeBuffer.readUInt32LE(0);
    if (length === 0 || length > MAX_NATIVE_MESSAGE_BYTES) {
      throw new Error("Invalid native message length");
    }
    if (nativeBuffer.length < 4 + length) return;
    const body = nativeBuffer.subarray(4, 4 + length);
    nativeBuffer = nativeBuffer.subarray(4 + length);
    handleNativeMessage(JSON.parse(body.toString("utf8")));
  }
}

function handleSocketLine(socket, line) {
  if (!line.trim()) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    sendSocket(socket, { type: "tool_result", ok: false, error: "Invalid bridge JSON" });
    return;
  }
  if (message?.type === "ping") {
    sendSocket(socket, { type: "pong", hostVersion: HOST_VERSION, socketPath });
    return;
  }
  if (
    message?.type !== "tool_call" ||
    typeof message.tool !== "string" ||
    !["read_workspace", "search_cards", "add_card", "add_cards", "write_report", "propose_structure", "edit_workspace", "manage_workspaces", "delete_workspace_items", "read_tab_workbench", "manage_tab_workbench", "dismiss_recent_tabs", "sync_browser_tabs", "close_browser_tabs", "export_workspace", "manage_preferences", "manage_agent_activity"].includes(message.tool)
  ) {
    sendSocket(socket, { type: "tool_result", ok: false, error: "Unsupported bridge request" });
    return;
  }
  const requestId = typeof message.requestId === "string" && message.requestId
    ? message.requestId.slice(0, 120)
    : randomUUID();
  pendingClients.set(requestId, socket);
  sendNative({
    type: "agent_tool_request",
    requestId,
    workspaceId: typeof message.workspaceId === "string" ? message.workspaceId : undefined,
    payload: {
      tool: message.tool,
      ...(message.input && Object.keys(message.input).length > 0 ? { input: message.input } : {})
    }
  });
}

await mkdir(dirname(socketPath), { recursive: true, mode: 0o700 });
try {
  await unlink(socketPath);
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

const server = createServer((socket) => {
  socket.setEncoding("utf8");
  let buffer = "";
  socket.on("data", (chunk) => {
    buffer += chunk;
    if (Buffer.byteLength(buffer, "utf8") > MAX_SOCKET_LINE_BYTES) {
      sendSocket(socket, { type: "tool_result", ok: false, error: "Bridge request is too large" });
      socket.destroy();
      return;
    }
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      handleSocketLine(socket, line);
      newline = buffer.indexOf("\n");
    }
  });
  socket.on("close", () => {
    for (const [requestId, client] of pendingClients) {
      if (client === socket) pendingClients.delete(requestId);
    }
  });
});

await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(socketPath, resolve);
});
await chmod(socketPath, 0o600);

process.stdin.on("data", (chunk) => {
  try {
    drainNativeInput(chunk);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    server.close();
  }
});
process.stdin.on("end", () => server.close());
server.on("close", async () => {
  try { await unlink(socketPath); } catch {}
  process.exit();
});

sendNative({ type: "bridge_ready", hostVersion: HOST_VERSION, socketPath });
