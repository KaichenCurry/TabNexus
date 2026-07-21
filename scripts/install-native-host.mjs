#!/usr/bin/env node

import { chmod, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir, platform } from "node:os";
import { spawn } from "node:child_process";

if (platform() !== "darwin") {
  console.error("The current dogfood installer supports Google Chrome on macOS only.");
  process.exit(1);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const hostPath = resolve(root, "bridge", "native-host.mjs");
const mcpPath = resolve(root, "bridge", "tabnexus-mcp.mjs");
const installedBridgeDir = resolve(homedir(), "Library", "Application Support", "TabNexus");
const wrapperPath = resolve(installedBridgeDir, "native-host");
const manifestPath = resolve(
  homedir(),
  "Library",
  "Application Support",
  "Google",
  "Chrome",
  "NativeMessagingHosts",
  "com.tabnexus.bridge.json"
);
const args = process.argv.slice(2);
const uninstall = args.includes("--uninstall");
const configureCodex = args.includes("--codex");
const extensionId = args.find((arg) => arg.startsWith("--extension-id="))?.split("=").slice(1).join("=").trim();

if (uninstall) {
  await rm(manifestPath, { force: true });
  await rm(wrapperPath, { force: true });
  console.log(`Removed ${manifestPath}`);
  process.exit(0);
}

if (!extensionId || !/^[a-p]{32}$/.test(extensionId)) {
  console.error("Pass the unpacked extension ID: pnpm bridge:install -- --extension-id=<32-character Chrome ID>");
  process.exit(1);
}

await mkdir(dirname(manifestPath), { recursive: true });
await mkdir(installedBridgeDir, { recursive: true, mode: 0o700 });
await chmod(hostPath, 0o755);
await chmod(mcpPath, 0o755);
const shellQuote = (value) => `'${value.replaceAll("'", `'\\''`)}'`;
await writeFile(wrapperPath, `#!/bin/sh\nexec ${shellQuote(process.execPath)} ${shellQuote(hostPath)}\n`, { mode: 0o700 });
await writeFile(manifestPath, `${JSON.stringify({
  name: "com.tabnexus.bridge",
  description: "TabNexus local MCP bridge",
  path: wrapperPath,
  type: "stdio",
  allowed_origins: [`chrome-extension://${extensionId}/`]
}, null, 2)}\n`, { mode: 0o600 });

function run(command, commandArgs, { allowFailure = false, silent = false } = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, commandArgs, { stdio: silent ? "ignore" : "inherit" });
    child.once("error", (error) => allowFailure ? resolveRun(false) : rejectRun(error));
    child.once("close", (code) => {
      if (code === 0 || allowFailure) resolveRun(code === 0);
      else rejectRun(new Error(`${command} exited with code ${code}`));
    });
  });
}

console.log(`Installed native host for ${extensionId}`);
console.log(manifestPath);
console.log("MCP server configuration:");
console.log(JSON.stringify({ command: process.execPath, args: [mcpPath] }, null, 2));

if (configureCodex) {
  try {
    await run("codex", ["mcp", "remove", "tabnexus"], { allowFailure: true, silent: true });
    await run("codex", ["mcp", "add", "tabnexus", "--", process.execPath, mcpPath]);
    console.log("Registered TabNexus in Codex. Open a new Codex task after connecting the bridge in TabNexus Settings.");
  } catch (error) {
    console.error("The native host was installed, but Codex could not be configured automatically.");
    console.error(error instanceof Error ? error.message : String(error));
    console.error("Run the MCP server configuration shown above in your Agent client.");
    process.exitCode = 1;
  }
}
