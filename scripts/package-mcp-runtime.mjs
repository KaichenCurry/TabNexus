#!/usr/bin/env node

import { spawn } from "node:child_process";
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const outputDirectory = resolve(root, "artifacts", "release");
const stagingDirectory = await mkdtemp(join(tmpdir(), "tabnexus-mcp-runtime-"));

const runtimeManifest = {
  name: "tabnexus-mcp-runtime",
  version: packageJson.version,
  description: "Pinned local MCP runtime for the TabNexus Chrome extension.",
  type: "module",
  bin: { "tabnexus-mcp": "tabnexus-mcp.mjs" },
  files: ["tabnexus-mcp.mjs"],
  engines: { node: ">=22.13.0" },
  license: "MIT",
  repository: packageJson.repository
};

async function run(command, args, cwd) {
  return await new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolvePromise(stdout);
      else reject(new Error(stderr || `${command} exited with code ${code}`));
    });
  });
}

try {
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(resolve(stagingDirectory, "package.json"), `${JSON.stringify(runtimeManifest, null, 2)}\n`);
  const runtimeEntry = resolve(stagingDirectory, "tabnexus-mcp.mjs");
  await copyFile(resolve(root, "agent", "bridge", "tabnexus-mcp.mjs"), runtimeEntry);
  await chmod(runtimeEntry, 0o755);
  const packed = JSON.parse(await run("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", outputDirectory], stagingDirectory));
  const filename = basename(packed[0]?.filename ?? "");
  const expectedFilename = `tabnexus-mcp-runtime-${packageJson.version}.tgz`;
  if (filename !== expectedFilename) throw new Error(`Expected ${expectedFilename}, received ${filename || "no package"}`);
  console.log(`Built artifacts/release/${filename} (${packed[0].size} bytes)`);
} finally {
  await rm(stagingDirectory, { recursive: true, force: true });
}
