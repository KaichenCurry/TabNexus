import { chromium } from "@playwright/test";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
const root = "/Users/chen/Desktop/TabNexus";
const extensionPath = await mkdtemp(resolve(tmpdir(), "tabnexus-relation-"));
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
      groupOrder: ["s1"], groups: { s1: { id: "s1", name: "市场", color: "#E8833A", cardIds: ["a", "c"] } },
      cards: {
        a: { id: "a", type: "web", title: "融资轮次", url: "https://a.example.com", note: "", status: "adopted", groupId: "s1", source: "user" },
        b: { id: "b", type: "web", title: "旧测评", url: "https://b.example.com", note: "", status: "excluded", groupId: null, source: "user" },
        c: { id: "c", type: "web", title: "市场规模", url: "https://c.example.com", note: "", status: "read", groupId: "s1", source: "user" }
      },
      edges: [{ fromCardId: "a", toCardId: "c", label: "支撑" }, { fromCardId: "c", toCardId: "b", label: "对比" }],
      v2: { goal: "理解商业模式", nextStep: "", conclusion: "" } } } }
  });
});
const page = await context.newPage();
await page.goto(`chrome-extension://${id}/workspace.html`);
await page.waitForTimeout(1000);
await page.getByRole("button", { name: "关系" }).click();
await page.waitForTimeout(600);
const metrics = await page.evaluate(() => ({
  nodeCount: document.querySelectorAll(".tn-relation-node").length,
  edgeCount: document.querySelectorAll(".tn-relation-edge").length,
  laneCount: document.querySelectorAll(".tn-relation-lane").length,
  labels: [...document.querySelectorAll(".tn-relation-label")].map((el) => el.textContent),
  titles: [...document.querySelectorAll(".tn-relation-title")].map((el) => el.textContent),
  hint: document.querySelector(".tn-canvas-hint")?.textContent
}));
console.log(JSON.stringify(metrics, null, 1));
await page.screenshot({ path: "artifacts/ux-audit-v2/06-v2-relation.png" });
// 点击节点应打开原页
await page.locator(".tn-relation-node").first().click();
await page.waitForTimeout(800);
console.log("tab opened:", context.pages().length > 2);
await context.close();
await rm(extensionPath, { recursive: true, force: true });
