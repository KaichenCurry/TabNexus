import { chromium } from "@playwright/test";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const root = "/Users/chen/Desktop/TabNexus";
const extensionPath = await mkdtemp(resolve(tmpdir(), "tabnexus-inbox-"));
await cp(resolve(root, "dist"), extensionPath, { recursive: true });
const context = await chromium.launchPersistentContext("", {
  channel: "chromium", headless: true,
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]
});
await context.route("https://tabnexus.test/**", (route) => route.fulfill({
  status: 200, contentType: "text/html", body: "<title>t</title>"
}));
const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
const id = new URL(worker.url()).host;

const TASK = { id: "task-1", name: "评估 Perplexity", createdAt: "2026-08-14T00:00:00.000Z", updatedAt: "2026-08-15T00:00:00.000Z",
  groupOrder: [], groups: {}, cards: {}, edges: [], v2: { goal: "g", nextStep: "", conclusion: "" } };

const setup = await context.newPage();
await setup.goto(`chrome-extension://${id}/workspace.html`);
await setup.waitForTimeout(900);
await setup.evaluate(async (TASK) => {
  await chrome.storage.local.set({
    "tabnexus.settings.v1": { locale: "zh", tutorialCompleted: true, v2ShellEnabled: true },
    "tabnexus.appState.v1": { schemaVersion: 1, activeWorkspaceId: TASK.id, workspaceOrder: [TASK.id], workspaces: { [TASK.id]: TASK } }
  });
}, TASK);

for (const slug of ["page-one", "page-two"]) {
  const tab = await context.newPage();
  await tab.goto(`https://tabnexus.test/${slug}`);
}
const page = await context.newPage();
await page.goto(`chrome-extension://${id}/workspace.html?inbox=1`);
await page.waitForTimeout(1500);

// 1) 勾选两项
await page.locator(".tn-inbox-item input[type=checkbox]").nth(0).click();
await page.locator(".tn-inbox-item input[type=checkbox]").nth(1).click();
const buttonText = await page.locator(".tn-inbox-actions .tn-primary").textContent();
console.log("collect button:", buttonText?.trim());

// 2) 收进任务
await page.locator(".tn-inbox-actions .tn-primary").click();
await page.waitForTimeout(1200);
const after = await page.evaluate(async () => {
  const stored = await chrome.storage.local.get("tabnexus.appState.v1");
  const s = stored["tabnexus.appState.v1"];
  const ws = s.workspaces[s.activeWorkspaceId];
  return { cardCount: Object.keys(ws.cards).length, titles: Object.values(ws.cards).map((c) => c.title) };
});
console.log("after collect:", JSON.stringify(after));

// 3) ⌘K 面板
await page.keyboard.press("Meta+k");
await page.waitForTimeout(400);
console.log("palette visible:", Boolean(await page.locator(".tn-palette").count()));

// 4) 收件口应显示已保存折叠区
const savedLabel = await page.locator(".tn-inbox-saved > button").textContent().catch(() => null);
console.log("saved collapsed label:", savedLabel?.trim() ?? "(none)");

await context.close();
await rm(extensionPath, { recursive: true, force: true });
