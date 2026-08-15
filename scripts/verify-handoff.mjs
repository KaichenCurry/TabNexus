import { chromium } from "@playwright/test";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
const root = "/Users/chen/Desktop/TabNexus";
const extensionPath = await mkdtemp(resolve(tmpdir(), "tabnexus-handoff-"));
await cp(resolve(root, "dist"), extensionPath, { recursive: true });
const context = await chromium.launchPersistentContext("", { channel: "chromium", headless: true, args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`] });
const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
const id = new URL(worker.url()).host;
const setup = await context.newPage();
await setup.goto(`chrome-extension://${id}/workspace.html`);
await setup.waitForTimeout(900);
await setup.evaluate(async () => {
  await chrome.storage.local.set({
    "tabnexus.settings.v1": { locale: "zh", tutorialCompleted: true, v2ShellEnabled: true },
    "tabnexus.appState.v1": { schemaVersion: 1, activeWorkspaceId: "t", workspaceOrder: ["t"], workspaces: { t: {
      id: "t", name: "评估 Perplexity", createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-15T00:00:00.000Z",
      groupOrder: ["s"], groups: { s: { id: "s", name: "市场", color: "#E8833A", cardIds: ["a", "b"] } },
      cards: {
        a: { id: "a", type: "web", title: "融资轮次", url: "https://a.example.com", note: "估值 90 亿", status: "adopted", groupId: "s", source: "user" },
        b: { id: "b", type: "web", title: "旧测评", url: "https://b.example.com", note: "", status: "excluded", excludedReason: "已过期", groupId: "s", source: "user" }
      },
      edges: [], v2: { goal: "理解商业模式", nextStep: "补反例", conclusion: "值得研究" } } } }
  });
});
const page = await context.newPage();
await page.goto(`chrome-extension://${id}/workspace.html`);
await page.waitForTimeout(1000);
// 1) Handoff 面板
await page.getByRole("button", { name: "让 Agent 继续" }).click();
await page.waitForTimeout(400);
const modalText = await page.locator(".tn-modal").textContent();
console.log("handoff has exclude reason:", modalText.includes("排除: 已过期"));
console.log("handoff has progress:", modalText.includes("已读 1/1 · ⭐已采用 1 · 已排除 1"));
console.log("handoff has disclaimer:", modalText.includes("不会提供：网页正文、API Key、其他任务"));
// 2) MCP 适配：read_workspace 摘要含 v2 + excludedReason
const summary = await page.evaluate(async () => chrome.runtime.sendMessage({ type: "M3_AGENT_TOOL", payload: { tool: "read_workspace", input: { detail: "summary" } } }));
console.log("mcp summary v2:", JSON.stringify(summary.data?.summary?.v2));
console.log("mcp summary excludedReason:", JSON.stringify(summary.data?.summary?.cards?.find((c) => c.id === "b")?.excludedReason));
// 3) MCP 适配：update_card 排除原因 + excluded 状态
const edit = await page.evaluate(async (rev) => chrome.runtime.sendMessage({ type: "M3_AGENT_TOOL", payload: { tool: "edit_workspace", input: { expectedRevision: rev, operationId: "probe:ex", actions: [{ type: "update_card", cardId: "b", excludedReason: "过期且结论矛盾" }] } } }), summary.data.revision);
console.log("mcp update_card excluded:", edit.ok, edit.error ?? "");
const after = await page.evaluate(async () => {
  const s = (await chrome.storage.local.get("tabnexus.appState.v1"))["tabnexus.appState.v1"];
  return s.workspaces["t"].cards["b"];
});
console.log("stored card b:", JSON.stringify({ status: after.status, excludedReason: after.excludedReason }));
await context.close();
await rm(extensionPath, { recursive: true, force: true });
