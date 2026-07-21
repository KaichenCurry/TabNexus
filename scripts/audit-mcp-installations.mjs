#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const EXPECTED_VERSION = "0.8.0";
const EXPECTED_TOOLS = [
  "read_workspace",
  "search_cards",
  "add_card",
  "add_cards",
  "write_report",
  "propose_structure",
  "edit_workspace",
  "manage_workspaces",
  "delete_workspace_items",
  "read_tab_workbench",
  "manage_tab_workbench",
  "dismiss_recent_tabs",
  "sync_browser_tabs",
  "close_browser_tabs",
  "export_workspace",
  "manage_preferences",
  "manage_agent_activity"
];
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const userHome = homedir();

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

function serverPathFromConfig(config, shape = "mcpServers") {
  const server = config?.[shape]?.tabnexus;
  const args = Array.isArray(server?.args) ? server.args : [];
  return typeof args[0] === "string" && !args[0].includes("${") ? args[0] : null;
}

async function findServerCopies(directory) {
  if (!existsSync(directory)) return [];
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name === "index.mjs" && basename(entry.parentPath ?? entry.path) === "server")
    .map((entry) => join(entry.parentPath ?? entry.path, entry.name));
}

async function findCursorToolCaches(directory) {
  if (!existsSync(directory)) return [];
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  const caches = [];
  for (const entry of entries.filter((candidate) => candidate.isFile() && candidate.name === "SERVER_METADATA.json")) {
    const parent = entry.parentPath ?? entry.path;
    const metadataPath = join(parent, entry.name);
    const metadata = await readJson(metadataPath);
    if (metadata?.serverName !== "tabnexus") continue;
    const toolsPath = join(parent, "tools");
    let tools = [];
    try {
      tools = (await readdir(toolsPath))
        .filter((name) => name.endsWith(".json"))
        .map((name) => name.slice(0, -5));
    } catch { /* disconnected caches can briefly have no tools directory */ }
    caches.push({
      client: `Cursor offering cache (${metadata.serverIdentifier ?? basename(parent)})`,
      path: toolsPath,
      tools
    });
  }
  return caches;
}

async function activeAgentEntries() {
  try {
    const response = await fetch("http://127.0.0.1:43119/health", { signal: AbortSignal.timeout(1_000) });
    if (!response.ok) return [];
    const health = await response.json();
    return Array.isArray(health?.agents)
      ? health.agents.map((agent) => ({
          client: `Active runtime (${agent.name ?? "unknown Agent"})`,
          path: "http://127.0.0.1:43119/health",
          version: agent.version,
          toolCount: agent.toolCount
        }))
      : [];
  } catch {
    return [];
  }
}

async function configuredEntries() {
  const entries = [];
  const codexConfigPath = join(userHome, ".codex", "config.toml");
  try {
    const config = await readFile(codexConfigPath, "utf8");
    const section = config.match(/\[mcp_servers\.tabnexus\]([\s\S]*?)(?=\n\[|$)/)?.[1] ?? "";
    const path = section.match(/args\s*=\s*\[\s*"([^"]+)"/)?.[1];
    if (path) entries.push({ client: "Codex config", path, installed: true });
  } catch { /* not configured */ }

  const jsonConfigs = [
    ["Cursor config", join(userHome, ".cursor", "mcp.json"), "mcpServers"],
    ["Claude Desktop config", join(userHome, "Library", "Application Support", "Claude", "claude_desktop_config.json"), "mcpServers"],
    ["VS Code config", join(userHome, "Library", "Application Support", "Code", "User", "mcp.json"), "servers"],
    ["TRAE config", join(userHome, "Library", "Application Support", "Trae", "User", "mcp.json"), "mcpServers"],
    ["TRAE config", join(userHome, "Library", "Application Support", "TRAE", "User", "mcp.json"), "mcpServers"]
  ];
  for (const [client, configPath, shape] of jsonConfigs) {
    const config = await readJson(configPath);
    const path = serverPathFromConfig(config, shape);
    if (path) entries.push({ client, path, installed: true });
    else entries.push({ client, path: configPath, installed: false });
  }

  const claudePlugins = await readJson(join(userHome, ".claude", "plugins", "installed_plugins.json"));
  const claudeInstall = claudePlugins?.plugins?.["tabnexus@tabnexus-local"]?.at(-1)?.installPath;
  if (typeof claudeInstall === "string") {
    entries.push({ client: "Claude Code plugin", path: join(claudeInstall, "server", "index.mjs"), installed: true });
  } else {
    entries.push({ client: "Claude Code plugin", path: "not installed", installed: false });
  }

  for (const path of await findServerCopies(join(userHome, ".codex", "plugins", "cache", "personal", "tabnexus"))) {
    entries.push({ client: "Codex plugin cache", path, installed: true });
  }
  return entries;
}

function inspectServer(path, port) {
  return new Promise((resolveInspection) => {
    if (!existsSync(path)) {
      resolveInspection({ ok: false, version: "missing", tools: [], error: "entry file missing" });
      return;
    }
    const child = spawn(process.execPath, [path], {
      env: { ...process.env, TABNEXUS_BRIDGE_PORT: String(port), TABNEXUS_AGENT_NAME: "Capability Audit" },
      stdio: ["pipe", "pipe", "ignore"]
    });
    const responses = [];
    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
    lines.on("line", (line) => {
      try { responses.push(JSON.parse(line)); } catch { /* ignore diagnostics */ }
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } })}\n`);
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })}\n`);
    const timer = setTimeout(() => finish("timed out"), 3_000);
    const poll = setInterval(() => {
      if (responses.some((item) => item.id === 1) && responses.some((item) => item.id === 2)) finish();
    }, 20);
    function finish(error) {
      clearTimeout(timer);
      clearInterval(poll);
      child.kill();
      const version = responses.find((item) => item.id === 1)?.result?.serverInfo?.version ?? "unknown";
      const tools = responses.find((item) => item.id === 2)?.result?.tools?.map((tool) => tool.name) ?? [];
      resolveInspection({
        ok: !error && version === EXPECTED_VERSION && JSON.stringify(tools) === JSON.stringify(EXPECTED_TOOLS),
        version,
        tools,
        ...(error ? { error } : {})
      });
    }
  });
}

async function inspectBundle(path, port) {
  if (!existsSync(path)) return { ok: false, version: "missing", tools: [], error: "bundle missing" };
  const archive = await readFile(path);
  let offset = 0;
  let server;
  while (offset + 30 <= archive.length && archive.readUInt32LE(offset) === 0x04034b50) {
    const method = archive.readUInt16LE(offset + 8);
    const compressedSize = archive.readUInt32LE(offset + 18);
    const nameLength = archive.readUInt16LE(offset + 26);
    const extraLength = archive.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = archive.subarray(nameStart, nameStart + nameLength).toString("utf8");
    if (name === "server/index.mjs" && method === 0) server = archive.subarray(dataStart, dataStart + compressedSize);
    offset = dataStart + compressedSize;
  }
  if (!server) return { ok: false, version: "invalid", tools: [], error: "bundled server missing" };
  const directory = await mkdtemp(join(tmpdir(), "tabnexus-mcp-audit-"));
  const entry = join(directory, "index.mjs");
  try {
    await writeFile(entry, server);
    return await inspectServer(entry, port);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

const projectEntries = [
  { client: "Shared development entry", path: join(root, "bridge", "tabnexus-mcp.mjs"), installed: true },
  { client: "Codex package", path: join(root, "plugins", "tabnexus", "server", "index.mjs"), installed: true },
  { client: "Claude Desktop package", path: join(root, "public", "agent", "tabnexus-claude.mcpb"), installed: true, bundle: true },
  { client: "Claude Code package", path: join(root, "integrations", "claude-code", "server", "index.mjs"), installed: true },
  { client: "Cursor adapter", path: join(root, "bridge", "tabnexus-mcp.mjs"), installed: true },
  { client: "VS Code adapter", path: join(root, "bridge", "tabnexus-mcp.mjs"), installed: true },
  { client: "TRAE adapter", path: join(root, "bridge", "tabnexus-mcp.mjs"), installed: true }
];
const discovered = await configuredEntries();
const unique = [...projectEntries, ...discovered].filter((entry, index, all) =>
  all.findIndex((candidate) => candidate.client === entry.client && candidate.path === entry.path) === index
);
const results = [];
let port = 45200;
for (const entry of unique) {
  if (!entry.installed) {
    results.push({ ...entry, state: "not installed", version: "—", toolCount: "—" });
    continue;
  }
  const inspection = entry.bundle ? await inspectBundle(entry.path, port++) : await inspectServer(entry.path, port++);
  results.push({
    ...entry,
    state: inspection.ok ? "ready" : "STALE",
    version: inspection.version,
    toolCount: inspection.tools.length,
    missingTools: EXPECTED_TOOLS.filter((tool) => !inspection.tools.includes(tool)).join(", ")
  });
}

for (const cache of await findCursorToolCaches(join(userHome, ".cursor", "projects"))) {
  const missingTools = EXPECTED_TOOLS.filter((tool) => !cache.tools.includes(tool));
  const unexpectedTools = cache.tools.filter((tool) => !EXPECTED_TOOLS.includes(tool));
  results.push({
    ...cache,
    state: missingTools.length === 0 && unexpectedTools.length === 0 && cache.tools.length === EXPECTED_TOOLS.length ? "ready" : "STALE",
    version: "Cursor cache",
    toolCount: cache.tools.length,
    missingTools: missingTools.join(", "),
    unexpectedTools: unexpectedTools.join(", ")
  });
}

for (const runtime of await activeAgentEntries()) {
  results.push({
    ...runtime,
    state: runtime.version === EXPECTED_VERSION && runtime.toolCount === EXPECTED_TOOLS.length ? "ready" : "STALE",
    missingTools: runtime.toolCount === EXPECTED_TOOLS.length ? "" : `runtime advertises ${runtime.toolCount}/${EXPECTED_TOOLS.length} tools`
  });
}

console.table(results.map(({ client, state, version, toolCount, path }) => ({ client, state, version, tools: toolCount, path })));
for (const result of results.filter((item) => item.state === "STALE")) {
  const details = [
    result.missingTools ? `missing ${result.missingTools}` : "",
    result.unexpectedTools ? `unexpected ${result.unexpectedTools}` : ""
  ].filter(Boolean).join("; ");
  console.error(`${result.client}: ${details || "version or schema mismatch"}`);
}
if (results.some((item) => item.state === "STALE")) process.exitCode = 1;
