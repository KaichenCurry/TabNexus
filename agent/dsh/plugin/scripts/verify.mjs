#!/usr/bin/env node
// dsh-plugin-tabnexus 离线冒烟验证：包结构 / patch / host 产物 / client 产物
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];
const ok = (name, pass, detail = "") => checks.push({ name, pass: Boolean(pass), detail });

const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
ok("package exports host face", pkg.exports["."]?.default === "./lib/index.js");
ok("package exports client face", typeof pkg.exports["./client"]?.default === "string" && pkg.exports["./client"].default.endsWith("client.js"));
ok("package exports patch", pkg.exports["./cordis.patch.yml"] === "./cordis.patch.yml");
ok("dsh.bundle.patch declared", typeof pkg.dsh?.bundle?.patch === "string");
ok("dsh.client platform=web", pkg.dsh?.client?.platform === "web");

const patch = await readFile(resolve(root, "cordis.patch.yml"), "utf8");
ok("patch inserts tabnexus row", patch.includes("id: tabnexus") && patch.includes("name: dsh-plugin-tabnexus"));

const host = await import(resolve(root, "lib/index.js"));
ok("host exports name", host.name === "tabnexus");
ok("host exports apply", typeof host.apply === "function");
ok("host exports Config", typeof host.Config === "function");

const client = await readFile(resolve(root, "lib/client.js"), "utf8");
ok("client closure factory", client.includes("window.__ModuleLoader__.load") && client.includes('id: "dsh-plugin-tabnexus"'));
ok("client ships status chip", client.includes("tn-dsh-chip"));

const failed = checks.filter((check) => !check.pass);
for (const check of checks) console.log(`${check.pass ? "PASS" : "FAIL"}  ${check.name}${check.detail ? ` — ${check.detail}` : ""}`);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
