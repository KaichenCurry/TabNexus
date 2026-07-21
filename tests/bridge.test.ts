// @vitest-environment node

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { afterEach, describe, expect, it, vi } from "vitest";

const children: ChildProcessWithoutNullStreams[] = [];

afterEach(() => {
  for (const child of children.splice(0)) child.kill();
});

function nativeFrame(child: ChildProcessWithoutNullStreams): Promise<any> {
  return new Promise((resolveFrame, reject) => {
    let buffer = Buffer.alloc(0);
    const onData = (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length < 4) return;
      const length = buffer.readUInt32LE(0);
      if (buffer.length < 4 + length) return;
      child.stdout.off("data", onData);
      resolveFrame(JSON.parse(buffer.subarray(4, 4 + length).toString("utf8")));
    };
    child.stdout.on("data", onData);
    child.once("error", reject);
  });
}

function writeNativeFrame(child: ChildProcessWithoutNullStreams, message: unknown): void {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  child.stdin.write(Buffer.concat([header, body]));
}

describe("M3 native and MCP bridge", () => {
  it("serves MCP initialize and versioned workspace tools over JSON-RPC stdio", async () => {
    const child = spawn(process.execPath, [resolve("bridge/tabnexus-mcp.mjs")], { stdio: ["pipe", "pipe", "pipe"] });
    children.push(child);
    const responses: any[] = [];
    createInterface({ input: child.stdout, crlfDelay: Infinity }).on("line", (line) => responses.push(JSON.parse(line)));
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } })}\n`);
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })}\n`);
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 3, method: "prompts/list", params: {} })}\n`);

    await vi.waitFor(() => expect(responses).toHaveLength(3));
    expect(responses.find((response) => response.id === 1)?.result.serverInfo).toEqual({
      name: "tabnexus", title: "TabNexus local workspace", version: "0.8.0"
    });
    expect(responses.find((response) => response.id === 1)?.result.capabilities.resources).toEqual({ subscribe: true, listChanged: false });
    expect(responses.find((response) => response.id === 1)?.result.capabilities.prompts).toEqual({ listChanged: false });
    const listedTools = responses.find((response) => response.id === 2)?.result.tools;
    expect(listedTools.map((tool: any) => tool.name)).toEqual([
      "read_workspace", "search_cards", "add_card", "add_cards", "write_report", "propose_structure", "edit_workspace", "manage_workspaces", "delete_workspace_items", "read_tab_workbench", "manage_tab_workbench", "dismiss_recent_tabs", "sync_browser_tabs", "close_browser_tabs", "export_workspace", "manage_preferences", "manage_agent_activity"
    ]);
    expect(listedTools.find((tool: any) => tool.name === "edit_workspace")?.annotations).toMatchObject({ destructiveHint: false, idempotentHint: true, openWorldHint: false });
    expect(listedTools.find((tool: any) => tool.name === "manage_workspaces")?.annotations).toMatchObject({ destructiveHint: false, idempotentHint: true });
    expect(listedTools.find((tool: any) => tool.name === "manage_workspaces")?.inputSchema.properties.actions.items.oneOf.map((schema: any) => schema.properties.type.const)).toEqual([
      "create_workspace", "set_active_workspace", "rename_workspace", "reorder_workspaces", "duplicate_workspace"
    ]);
    expect(listedTools.find((tool: any) => tool.name === "delete_workspace_items")?.annotations).toMatchObject({ destructiveHint: true, openWorldHint: false });
    expect(listedTools.find((tool: any) => tool.name === "manage_tab_workbench")?.annotations).toMatchObject({ destructiveHint: false, idempotentHint: true, openWorldHint: true });
    expect(listedTools.find((tool: any) => tool.name === "manage_tab_workbench")?.inputSchema.properties.actions.items.oneOf.map((schema: any) => schema.properties.type.const)).toEqual([
      "set_selection", "select_all", "clear_selection", "set_collapsed", "focus_tab", "reopen_recent"
    ]);
    expect(listedTools.find((tool: any) => tool.name === "dismiss_recent_tabs")?.annotations).toMatchObject({ destructiveHint: true, openWorldHint: false });
    expect(listedTools.find((tool: any) => tool.name === "close_browser_tabs")?.annotations).toMatchObject({ destructiveHint: true, openWorldHint: true });
    expect(responses.find((response) => response.id === 3)?.result.prompts.map((prompt: any) => prompt.name)).toEqual([
      "organize_workspace", "capture_tabs", "operate_tab_workbench", "workspace_audit"
    ]);
  });

  it("lets an Agent-launched MCP server relay tools to the Chrome extension over localhost WebSocket", async () => {
    const port = 43241;
    const child = spawn(process.execPath, [resolve("bridge/tabnexus-mcp.mjs")], {
      env: { ...process.env, TABNEXUS_BRIDGE_PORT: String(port), TABNEXUS_AGENT_NAME: "Cursor" },
      stdio: ["pipe", "pipe", "pipe"]
    });
    children.push(child);
    const rpcResponses: any[] = [];
    createInterface({ input: child.stdout, crlfDelay: Infinity }).on("line", (line) => rpcResponses.push(JSON.parse(line)));

    const bridgeMessages: any[] = [];
    let extension: WebSocket | undefined;
    for (let attempt = 0; attempt < 20 && !extension; attempt += 1) {
      try {
        extension = await new Promise<WebSocket>((resolveSocket, reject) => {
          const candidate = new WebSocket(`ws://127.0.0.1:${port}/tabnexus`);
          candidate.addEventListener("message", (event) => bridgeMessages.push(JSON.parse(String(event.data))));
          candidate.addEventListener("open", () => resolveSocket(candidate), { once: true });
          candidate.addEventListener("error", () => reject(new Error("not ready")), { once: true });
        });
      } catch {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
      }
    }
    expect(extension).toBeTruthy();
    await vi.waitFor(() => expect(bridgeMessages[0]).toMatchObject({
      type: "bridge_ready",
      transport: "agent_websocket",
      hostVersion: "0.8.0",
      agentName: "Cursor"
    }));

    child.stdin.write(`${JSON.stringify({
      jsonrpc: "2.0",
      id: 30,
      method: "tools/call",
      params: { name: "read_workspace", arguments: { detail: "summary" } }
    })}\n`);
    await vi.waitFor(() => expect(bridgeMessages.some((message) => message.type === "agent_tool_request")).toBe(true));
    const request = bridgeMessages.find((message) => message.type === "agent_tool_request");
    expect(request.payload).toEqual({ tool: "read_workspace", input: { detail: "summary" } });
    extension!.send(JSON.stringify({
      type: "agent_tool_result",
      requestId: request.requestId,
      ok: true,
      data: { tool: "read_workspace", revision: "wsr_websocket", unchanged: false, detail: "summary" }
    }));
    await vi.waitFor(() => expect(rpcResponses.find((response) => response.id === 30)).toBeTruthy());
    expect(rpcResponses.find((response) => response.id === 30)?.result.structuredContent).toMatchObject({
      tool: "read_workspace",
      revision: "wsr_websocket"
    });
    extension!.close();
  });

  it("shares one localhost broker across Codex and Cursor MCP processes", async () => {
    const port = 43242;
    const codex = spawn(process.execPath, [resolve("bridge/tabnexus-mcp.mjs")], {
      env: { ...process.env, TABNEXUS_BRIDGE_PORT: String(port), TABNEXUS_AGENT_NAME: "Codex" },
      stdio: ["pipe", "pipe", "pipe"]
    });
    children.push(codex);
    const codexResponses: any[] = [];
    createInterface({ input: codex.stdout, crlfDelay: Infinity }).on("line", (line) => codexResponses.push(JSON.parse(line)));

    let extension: WebSocket | undefined;
    const bridgeMessages: any[] = [];
    for (let attempt = 0; attempt < 20 && !extension; attempt += 1) {
      try {
        extension = await new Promise<WebSocket>((resolveSocket, reject) => {
          const candidate = new WebSocket(`ws://127.0.0.1:${port}/tabnexus`);
          candidate.addEventListener("open", () => resolveSocket(candidate), { once: true });
          candidate.addEventListener("error", () => reject(new Error("not ready")), { once: true });
        });
      } catch {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
      }
    }
    expect(extension).toBeTruthy();
    extension!.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      bridgeMessages.push(message);
      if (message.type !== "agent_tool_request") return;
      extension!.send(JSON.stringify({
        type: "agent_tool_result",
        requestId: message.requestId,
        ok: true,
        data: { tool: "read_workspace", revision: `wsr_${message.agentName.toLowerCase()}`, unchanged: false, detail: "summary" }
      }));
    });

    const cursor = spawn(process.execPath, [resolve("bridge/tabnexus-mcp.mjs")], {
      env: { ...process.env, TABNEXUS_BRIDGE_PORT: String(port), TABNEXUS_AGENT_NAME: "Cursor" },
      stdio: ["pipe", "pipe", "pipe"]
    });
    children.push(cursor);
    const cursorResponses: any[] = [];
    createInterface({ input: cursor.stdout, crlfDelay: Infinity }).on("line", (line) => cursorResponses.push(JSON.parse(line)));

    await vi.waitFor(async () => {
      const health = await fetch(`http://127.0.0.1:${port}/health`).then((response) => response.json());
      expect(health.agents.map((agent: any) => agent.name).sort()).toEqual(["Codex", "Cursor"]);
    });

    codex.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 41, method: "tools/call", params: { name: "read_workspace", arguments: { detail: "summary" } } })}\n`);
    cursor.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 42, method: "tools/call", params: { name: "read_workspace", arguments: { detail: "summary" } } })}\n`);

    await vi.waitFor(() => {
      expect(codexResponses.find((response) => response.id === 41)?.result?.structuredContent?.revision).toBe("wsr_codex");
      expect(cursorResponses.find((response) => response.id === 42)?.result?.structuredContent?.revision).toBe("wsr_cursor");
    });
    expect(bridgeMessages.filter((message) => message.type === "agent_tool_request").map((message) => message.agentName).sort()).toEqual(["Codex", "Cursor"]);
    extension!.close();

    const codexExit = new Promise<void>((resolveExit) => codex.once("exit", () => resolveExit()));
    codex.kill();
    await codexExit;
    let replacement: WebSocket | undefined;
    const reconnect = (async () => {
      for (let attempt = 0; attempt < 160 && !replacement; attempt += 1) {
        try {
          replacement = await new Promise<WebSocket>((resolveSocket, reject) => {
            const candidate = new WebSocket(`ws://127.0.0.1:${port}/tabnexus`);
            candidate.addEventListener("open", () => resolveSocket(candidate), { once: true });
            candidate.addEventListener("error", () => reject(new Error("not ready")), { once: true });
          });
        } catch {
          await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
        }
      }
      expect(replacement).toBeTruthy();
      replacement!.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data));
        if (message.type !== "agent_tool_request") return;
        replacement!.send(JSON.stringify({
          type: "agent_tool_result",
          requestId: message.requestId,
          ok: true,
          data: { tool: "read_workspace", revision: "wsr_cursor_takeover", unchanged: false, detail: "summary" }
        }));
      });
    })();
    cursor.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 43, method: "tools/call", params: { name: "read_workspace", arguments: { detail: "summary" } } })}\n`);
    await reconnect;
    await vi.waitFor(() => expect(cursorResponses.find((response) => response.id === 43)?.result?.structuredContent?.revision).toBe("wsr_cursor_takeover"), { timeout: 6_000 });
    replacement!.close();
  });

  it("reports a capability mismatch instead of routing new tools through an old broker", async () => {
    const port = 43243;
    const oldBroker = createServer((request, response) => {
      if (request.method === "GET" && request.url === "/health") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ ok: true, server: "tabnexus", version: "0.4.0", toolCount: 4 }));
        return;
      }
      if (request.method === "POST" && request.url === "/agent/register") {
        request.resume();
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ ok: true, agents: [] }));
        return;
      }
      request.resume();
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: false, error: "not supported" }));
    });
    await new Promise<void>((resolveListen) => oldBroker.listen(port, "127.0.0.1", resolveListen));
    const child = spawn(process.execPath, [resolve("bridge/tabnexus-mcp.mjs")], {
      env: { ...process.env, TABNEXUS_BRIDGE_PORT: String(port), TABNEXUS_AGENT_NAME: "Cursor" },
      stdio: ["pipe", "pipe", "pipe"]
    });
    children.push(child);
    const responses: any[] = [];
    createInterface({ input: child.stdout, crlfDelay: Infinity }).on("line", (line) => responses.push(JSON.parse(line)));
    child.stdin.write(`${JSON.stringify({
      jsonrpc: "2.0",
      id: 44,
      method: "tools/call",
      params: { name: "edit_workspace", arguments: { expectedRevision: "wsr_1", operationId: "mismatch", actions: [] } }
    })}\n`);

    await vi.waitFor(() => expect(responses.find((response) => response.id === 44)).toBeTruthy(), { timeout: 4_000 });
    const mismatchResponse = JSON.stringify(responses.find((response) => response.id === 44));
    expect(mismatchResponse).toContain("MCP capability version mismatch");
    expect(mismatchResponse).toContain("0.4.0");
    await new Promise<void>((resolveClose) => oldBroker.close(() => resolveClose()));
  });

  it("starts a permission-restricted Unix socket and answers bridge health checks", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tabnexus-bridge-"));
    const socketPath = join(directory, "bridge.sock");
    const child = spawn(process.execPath, [resolve("bridge/native-host.mjs")], {
      env: { ...process.env, TABNEXUS_BRIDGE_SOCKET: socketPath },
      stdio: ["pipe", "pipe", "pipe"]
    });
    children.push(child);
    const ready = await nativeFrame(child);
    expect(ready).toMatchObject({ type: "bridge_ready", hostVersion: "0.2.0", socketPath });
    expect((await stat(socketPath)).mode & 0o777).toBe(0o600);

    const pong = await new Promise<any>((resolvePong, reject) => {
      const socket = createConnection(socketPath);
      let buffer = "";
      socket.setEncoding("utf8");
      socket.once("connect", () => socket.write(`${JSON.stringify({ type: "ping" })}\n`));
      socket.on("data", (chunk) => {
        buffer += chunk;
        const newline = buffer.indexOf("\n");
        if (newline < 0) return;
        socket.end();
        resolvePong(JSON.parse(buffer.slice(0, newline)));
      });
      socket.once("error", reject);
    });
    expect(pong).toMatchObject({ type: "pong", hostVersion: "0.2.0", socketPath });

    const chromeRequestPromise = nativeFrame(child);
    const toolResultPromise = new Promise<any>((resolveResult, reject) => {
      const socket = createConnection(socketPath);
      let buffer = "";
      socket.setEncoding("utf8");
      socket.once("connect", () => socket.write(`${JSON.stringify({
        type: "tool_call",
        requestId: "relay-1",
        tool: "read_workspace",
        workspaceId: "ws",
        input: {}
      })}\n`));
      socket.on("data", (chunk) => {
        buffer += chunk;
        const newline = buffer.indexOf("\n");
        if (newline < 0) return;
        socket.end();
        resolveResult(JSON.parse(buffer.slice(0, newline)));
      });
      socket.once("error", reject);
    });
    const chromeRequest = await chromeRequestPromise;
    expect(chromeRequest).toEqual({
      type: "agent_tool_request",
      requestId: "relay-1",
      workspaceId: "ws",
      payload: { tool: "read_workspace" }
    });
    writeNativeFrame(child, {
      type: "agent_tool_result",
      requestId: "relay-1",
      ok: true,
      data: { tool: "read_workspace", workspace: { id: "ws" } }
    });
    await expect(toolResultPromise).resolves.toEqual({
      type: "tool_result",
      requestId: "relay-1",
      ok: true,
      data: { tool: "read_workspace", workspace: { id: "ws" } }
    });
    child.kill();
    await rm(directory, { recursive: true, force: true });
  });

  it("streams versioned workspace resource changes back to subscribed MCP clients", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tabnexus-context-"));
    const socketPath = join(directory, "bridge.sock");
    const host = spawn(process.execPath, [resolve("bridge/native-host.mjs")], {
      env: { ...process.env, TABNEXUS_BRIDGE_SOCKET: socketPath },
      stdio: ["pipe", "pipe", "pipe"]
    });
    children.push(host);
    await nativeFrame(host);

    const mcp = spawn(process.execPath, [resolve("bridge/tabnexus-mcp.mjs")], {
      env: { ...process.env, TABNEXUS_BRIDGE_SOCKET: socketPath },
      stdio: ["pipe", "pipe", "pipe"]
    });
    children.push(mcp);
    const responses: any[] = [];
    createInterface({ input: mcp.stdout, crlfDelay: Infinity }).on("line", (line) => responses.push(JSON.parse(line)));

    const listRelay = nativeFrame(host);
    mcp.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 10, method: "resources/list", params: {} })}\n`);
    const listRequest = await listRelay;
    expect(listRequest.payload).toEqual({ tool: "read_workspace", input: { detail: "summary" } });
    writeNativeFrame(host, {
      type: "agent_tool_result",
      requestId: listRequest.requestId,
      ok: true,
      data: {
        tool: "read_workspace",
        revision: "wsr_1",
        unchanged: false,
        detail: "summary",
        activeWorkspaceId: "ws",
        browserRevision: "tabsr_1",
        browserTabs: [{ tabId: 3, title: "Open source", url: "https://example.com" }],
        workspaceIndex: [{ id: "ws", name: "Research", updatedAt: "2026-07-21T00:00:00.000Z", revision: "wsr_1", groupCount: 1, cardCount: 2, edgeCount: 0 }]
      }
    });
    await vi.waitFor(() => expect(responses.find((response) => response.id === 10)).toBeTruthy());
    expect(responses.find((response) => response.id === 10)?.result.resources[0]).toMatchObject({
      uri: "tabnexus://workspaces",
      name: "workspace-index"
    });
    expect(responses.find((response) => response.id === 10)?.result.resources[1]).toMatchObject({
      uri: "tabnexus://workspace/ws",
      name: "Research"
    });
    expect(responses.find((response) => response.id === 10)?.result.resources[2]).toMatchObject({
      uri: "tabnexus://browser/current-window",
      name: "current-window-tabs"
    });
    expect(responses.find((response) => response.id === 10)?.result.resources[3]).toMatchObject({
      uri: "tabnexus://workbench/current",
      name: "tab-workbench"
    });

    const workbenchRelay = nativeFrame(host);
    mcp.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 13, method: "resources/read", params: { uri: "tabnexus://workbench/current" } })}\n`);
    const workbenchRequest = await workbenchRelay;
    expect(workbenchRequest.payload).toEqual({ tool: "read_tab_workbench" });
    writeNativeFrame(host, {
      type: "agent_tool_result",
      requestId: workbenchRequest.requestId,
      ok: true,
      data: {
        tool: "read_tab_workbench",
        revision: "railr_1",
        unchanged: false,
        workbench: { revision: "railr_1", counts: { open: 3, selected: 2 }, selectedTabIds: [3, 4] }
      }
    });
    await vi.waitFor(() => expect(responses.find((response) => response.id === 13)).toBeTruthy());
    expect(JSON.parse(responses.find((response) => response.id === 13)?.result.contents[0].text)).toMatchObject({
      resource: "tab_workbench",
      revision: "railr_1",
      counts: { open: 3, selected: 2 },
      selectedTabIds: [3, 4]
    });

    const subscribeRelay = nativeFrame(host);
    mcp.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 11, method: "resources/subscribe", params: { uri: "tabnexus://workspace/ws" } })}\n`);
    const subscribeRequest = await subscribeRelay;
    writeNativeFrame(host, {
      type: "agent_tool_result",
      requestId: subscribeRequest.requestId,
      ok: true,
      data: { tool: "read_workspace", revision: "wsr_1", unchanged: false, detail: "summary", summary: { id: "ws" } }
    });
    await vi.waitFor(() => expect(responses.find((response) => response.id === 11)).toBeTruthy());

    const writeRelay = nativeFrame(host);
    mcp.stdin.write(`${JSON.stringify({
      jsonrpc: "2.0",
      id: 12,
      method: "tools/call",
      params: { name: "add_card", arguments: { workspaceId: "ws", title: "New source", expectedRevision: "wsr_1", operationId: "agent-run:add-1" } }
    })}\n`);
    const writeRequest = await writeRelay;
    expect(writeRequest).toMatchObject({
      workspaceId: "ws",
      payload: { tool: "add_card", input: { title: "New source", expectedRevision: "wsr_1", operationId: "agent-run:add-1" } }
    });
    const refreshRelay = nativeFrame(host);
    writeNativeFrame(host, {
      type: "agent_tool_result",
      requestId: writeRequest.requestId,
      ok: true,
      data: { tool: "add_card", revision: "wsr_2", cardId: "new", operationId: "agent-run:add-1" }
    });
    const refreshRequest = await refreshRelay;
    expect(refreshRequest.payload).toEqual({
      tool: "read_workspace",
      input: { detail: "summary", sinceRevision: "wsr_1" }
    });
    writeNativeFrame(host, {
      type: "agent_tool_result",
      requestId: refreshRequest.requestId,
      ok: true,
      data: { tool: "read_workspace", revision: "wsr_2", unchanged: false, detail: "summary", summary: { id: "ws" } }
    });
    await vi.waitFor(() => expect(responses.some((response) => response.method === "notifications/resources/updated")).toBe(true));
    expect(responses.find((response) => response.method === "notifications/resources/updated")?.params.uri).toBe("tabnexus://workspace/ws");

    host.kill();
    mcp.kill();
    await rm(directory, { recursive: true, force: true });
  });

  it("runs the user-facing bridge verification against the live extension relay", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tabnexus-verify-"));
    const socketPath = join(directory, "bridge.sock");
    const host = spawn(process.execPath, [resolve("bridge/native-host.mjs")], {
      env: { ...process.env, TABNEXUS_BRIDGE_SOCKET: socketPath },
      stdio: ["pipe", "pipe", "pipe"]
    });
    children.push(host);
    await nativeFrame(host);

    const verifier = spawn(process.execPath, [resolve("scripts/verify-bridge.mjs")], {
      env: { ...process.env, TABNEXUS_BRIDGE_SOCKET: socketPath },
      stdio: ["pipe", "pipe", "pipe"]
    });
    children.push(verifier);
    let output = "";
    verifier.stdout.setEncoding("utf8");
    verifier.stdout.on("data", (chunk) => { output += chunk; });
    const relay = await nativeFrame(host);
    expect(relay.payload).toEqual({ tool: "read_workspace", input: { detail: "summary" } });
    writeNativeFrame(host, {
      type: "agent_tool_result",
      requestId: relay.requestId,
      ok: true,
      data: {
        tool: "read_workspace",
        revision: "wsr_verify",
        unchanged: false,
        detail: "summary",
        activeWorkspaceId: "ws",
        workspaceIndex: [{ id: "ws", name: "Verification workspace", cardCount: 4 }],
        browserTabs: [{ tabId: 1 }, { tabId: 2 }]
      }
    });
    await new Promise<void>((resolveClose, reject) => {
      verifier.once("error", reject);
      verifier.once("close", (code) => code === 0 ? resolveClose() : reject(new Error(`verify exited ${code}`)));
    });
    expect(output).toContain("TabNexus MCP bridge is ready.");
    expect(output).toContain("Workspace: Verification workspace");
    expect(output).toContain("Saved cards: 4");
    expect(output).toContain("Current supported tabs: 2");
    expect(output).toContain("Revision: wsr_verify");

    host.kill();
    await rm(directory, { recursive: true, force: true });
  });
});
