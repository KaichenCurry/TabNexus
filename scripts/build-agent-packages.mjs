#!/usr/bin/env node

import { copyFile, cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(root, "extension", "public", "agent", "tabnexus-claude.mcpb");
const codexServerPath = resolve(root, "agent", "plugins", "tabnexus", "server", "index.mjs");
const legacyCodexServerPath = resolve(root, "agent", "integrations", "codex", "plugins", "tabnexus", "server", "index.mjs");
const codexSkillsPath = resolve(root, "agent", "plugins", "tabnexus", "skills");
const legacyCodexSkillsPath = resolve(root, "agent", "integrations", "codex", "plugins", "tabnexus", "skills");
const codexIconPath = resolve(root, "agent", "plugins", "tabnexus", "assets", "icon.png");
const claudeCodeServerPath = resolve(root, "agent", "integrations", "claude-code", "server", "index.mjs");
const standardConfigPath = resolve(root, "extension", "public", "agent", "tabnexus-standard.mcp.json");
const vsCodeConfigPath = resolve(root, "extension", "public", "agent", "tabnexus-vscode.mcp.json");

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date("2026-07-21T00:00:00.000Z")) {
  const year = Math.max(1980, date.getUTCFullYear());
  return {
    date: ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate(),
    time: (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | Math.floor(date.getUTCSeconds() / 2)
  };
}

function createStoredZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const stamp = dosDateTime();
  for (const entry of entries) {
    const name = Buffer.from(entry.name.replaceAll("\\", "/"), "utf8");
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data);
    const checksum = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(stamp.time, 10);
    local.writeUInt16LE(stamp.date, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(stamp.time, 12);
    central.writeUInt16LE(stamp.date, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE((0o100644 * 0x10000) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

const [manifest, server, icon, packageJson] = await Promise.all([
  readFile(resolve(root, "agent", "integrations", "claude", "manifest.json")),
  readFile(resolve(root, "agent", "bridge", "tabnexus-mcp.mjs")),
  readFile(resolve(root, "extension", "public", "icons", "icon128.png")),
  readFile(resolve(root, "package.json"), "utf8").then(JSON.parse)
]);
const serverVersion = server.toString("utf8").match(/const SERVER_VERSION = "([^"]+)"/)?.[1];
if (!serverVersion) throw new Error("Unable to read MCP server version from agent/bridge/tabnexus-mcp.mjs");

await mkdir(dirname(outputPath), { recursive: true });
await mkdir(dirname(codexServerPath), { recursive: true });
await mkdir(dirname(legacyCodexServerPath), { recursive: true });
await mkdir(dirname(codexIconPath), { recursive: true });
await mkdir(dirname(claudeCodeServerPath), { recursive: true });
await writeFile(outputPath, createStoredZip([
  { name: "manifest.json", data: manifest },
  { name: "server/index.mjs", data: server },
  { name: "icon.png", data: icon }
]));
await writeFile(codexServerPath, server);
await writeFile(legacyCodexServerPath, server);
await cp(codexSkillsPath, legacyCodexSkillsPath, { recursive: true, force: true });
await writeFile(claudeCodeServerPath, server);
await copyFile(resolve(root, "extension", "public", "icons", "icon128.png"), codexIconPath);
await writeFile(standardConfigPath, `${JSON.stringify({
  mcpServers: {
    tabnexus: {
      command: "npx",
      args: ["--yes", `github:KaichenCurry/TabNexus#v${packageJson.version}`],
      env: { TABNEXUS_AGENT_NAME: "Agent IDE", TABNEXUS_MCP_VERSION: serverVersion }
    }
  }
}, null, 2)}\n`);
await writeFile(vsCodeConfigPath, `${JSON.stringify({
  servers: {
    tabnexus: {
      type: "stdio",
      command: "npx",
      args: ["--yes", `github:KaichenCurry/TabNexus#v${packageJson.version}`],
      env: { TABNEXUS_AGENT_NAME: "VS Code", TABNEXUS_MCP_VERSION: serverVersion }
    }
  }
}, null, 2)}\n`);

console.log(`Built Claude Desktop, Claude Code, Codex, VS Code, and standard MCP assets`);
