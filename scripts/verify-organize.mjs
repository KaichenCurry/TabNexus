// TabNexus v2 AI 一键整理功能验证：模态 → 模式选择 → 预览 → 应用 → 撤销。
import { chromium } from "@playwright/test";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const root = "/Users/chen/Desktop/TabNexus";
const extensionPath = await mkdtemp(resolve(tmpdir(), "tabnexus-organize-"));
await cp(resolve(root, "dist"), extensionPath, { recursive: true });
const context = await chromium.launchPersistentContext("", {
  channel: "chromium", headless: true,
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]
});
const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
const id = new URL(worker.url()).host;

const TASK = {
  id: "task-1", name: "评估 Perplexity",
  createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-15T00:00:00.000Z",
  groupOrder: [], groups: {},
  cards: {
    a: { id: "a", type: "web", title: "今日页面", url: "https://a.example.com", note: "", status: "unread", groupId: null, source: "user", savedAt: "2026-08-15T09:00:00.000Z" },
    b: { id: "b", type: "web", title: "本周页面", url: "https://b.example.com", note: "", status: "unread", groupId: null, source: "user", savedAt: "2026-08-12T09:00:00.000Z" },
    c: { id: "c", type: "web", title: "旧页面", url: "https://c.example.com", note: "", status: "unread", groupId: null, source: "user", savedAt: "2026-07-01T09:00:00.000Z" },
    d: { id: "d", type: "web", title: "同域另一页", url: "https://a.example.com/other", note: "", status: "unread", groupId: null, source: "user", savedAt: "2026-08-15T10:00:00.000Z" }
  },
  edges: [], v2: { goal: "g", nextStep: "", conclusion: "" }
};

const setup = await context.newPage();
await setup.goto(`chrome-extension://${id}/workspace.html`);
await setup.waitForTimeout(900);
await setup.evaluate(async (TASK) => {
  await chrome.storage.local.set({
    "tabnexus.settings.v1": { locale: "zh", tutorialCompleted: true, v2ShellEnabled: true },
    "tabnexus.appState.v1": { schemaVersion: 1, activeWorkspaceId: TASK.id, workspaceOrder: [TASK.id], workspaces: { [TASK.id]: TASK } }
  });
}, TASK);

const page = await context.newPage();
await page.goto(`chrome-extension://${id}/workspace.html`);
await page.waitForTimeout(1200);

// 1) 打开整理模态，选「按时间」
await page.getByRole("button", { name: /AI 一键整理/ }).click();
await page.waitForTimeout(400);
await page.getByText("按时间", { exact: true }).click();
await page.getByRole("button", { name: "生成整理建议" }).click();
await page.waitForTimeout(600);
const previewGroups = await page.locator(".tn-proposal-group strong").allTextContents();
console.log("time preview groups:", JSON.stringify(previewGroups));

// 2) 应用整理 → 存储里应有 3 个章节、4 页入节
await page.getByRole("button", { name: "应用整理" }).click();
await page.waitForTimeout(1000);
const afterApply = await page.evaluate(async () => {
  const s = (await chrome.storage.local.get("tabnexus.appState.v1"))["tabnexus.appState.v1"];
  const ws = s.workspaces[s.activeWorkspaceId];
  return { groupOrder: ws.groupOrder.map((id) => ws.groups[id].name), cardCount: Object.keys(ws.cards).length };
});
console.log("after apply:", JSON.stringify(afterApply));

// 3) 撤销按钮出现并恢复
await page.getByRole("button", { name: /撤销 AI 一键整理/ }).click();
await page.waitForTimeout(800);
const afterUndo = await page.evaluate(async () => {
  const s = (await chrome.storage.local.get("tabnexus.appState.v1"))["tabnexus.appState.v1"];
  const ws = s.workspaces[s.activeWorkspaceId];
  return { groupCount: ws.groupOrder.length };
});
console.log("after undo groupCount:", afterUndo.groupCount);

// 4) 按域名模式
await page.getByRole("button", { name: /AI 一键整理/ }).click();
await page.waitForTimeout(300);
await page.getByText("按域名", { exact: true }).click();
await page.getByRole("button", { name: "生成整理建议" }).click();
await page.waitForTimeout(600);
const domainPreview = await page.locator(".tn-proposal-group strong").allTextContents();
console.log("domain preview groups:", JSON.stringify(domainPreview));

await context.close();
await rm(extensionPath, { recursive: true, force: true });
