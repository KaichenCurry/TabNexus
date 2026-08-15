#!/usr/bin/env node
// DSH 端到端验证用独立 broker：监听 43119，记录每次 /agent/call 到日志文件。
// 用法：node scripts/dsh-broker-standalone.mjs [port] [logfile]
import { appendFileSync } from "node:fs";
import { startMockBroker } from "../agent/plugins/tabnexus/skills/tabnexus-mcp-evals/scripts/run-evals.mjs";

const port = Number.parseInt(process.argv[2] || "43119", 10);
const logfile = process.argv[3] || "artifacts/dsh-e2e/broker-calls.jsonl";

const broker = await startMockBroker(port);
console.log(`READY port=${broker.port} log=${logfile}`);

// 记录每次调用（calls 数组在每次 /agent/call 时追加，这里轮询导出）
let exported = 0;
const timer = setInterval(() => {
  while (exported < broker.calls.length) {
    appendFileSync(logfile, `${JSON.stringify(broker.calls[exported])}\n`);
    exported += 1;
  }
}, 200);

async function shutdown() {
  clearInterval(timer);
  while (exported < broker.calls.length) {
    appendFileSync(logfile, `${JSON.stringify(broker.calls[exported])}\n`);
    exported += 1;
  }
  await broker.close();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
