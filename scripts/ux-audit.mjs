// TabNexus UX 审查脚本：加载 dist 扩展，模拟真实用户走完全流程并逐屏截图。
// 用法：node scripts/ux-audit.mjs
import { chromium } from "@playwright/test";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "artifacts/ux-audit");
await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const extensionPath = await mkdtemp(resolve(tmpdir(), "tabnexus-ux-"));
await cp(resolve(root, "dist"), extensionPath, { recursive: true });

const context = await chromium.launchPersistentContext("", {
  channel: "chromium",
  headless: true,
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  viewport: { width: 1440, height: 900 },
  locale: "zh-CN"
});

await context.route("https://tabnexus.test/**", (route) => {
  const title = decodeURIComponent(new URL(route.request().url()).pathname.slice(1));
  return route.fulfill({
    status: 200,
    contentType: "text/html",
    body: `<title>${title}</title><h1>${title}</h1><p>TabNexus UX 审查示例页面。</p>`
  });
});

const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
const id = new URL(worker.url()).host;

// 12 个"任务上下文"风格的真实感标签：调研一家公司
const TABS = [
  "feishu-调研提纲",
  "yuque-竞品笔记",
  "market-size-2026",
  "competitor-a-pricing",
  "competitor-b-pricing",
  "gongshang-工商信息",
  "funding-crunchbase",
  "user-review-zhihu",
  "user-review-reddit",
  "tech-blog-architecture",
  "html-report-v0-draft",
  "meeting-minutes"
];
for (const slug of TABS) {
  const page = await context.newPage();
  await page.goto(`https://tabnexus.test/${slug}`);
}

async function shot(page, name) {
  await page.waitForTimeout(450);
  await page.screenshot({ path: resolve(outDir, `${name}.png`), fullPage: false });
  console.log("shot:", name);
}

async function dumpControls(page, name) {
  const controls = await page.evaluate(() => ({
    buttons: [...document.querySelectorAll("button")].map((b) => ({
      text: (b.textContent || "").replace(/\s+/g, " ").trim().slice(0, 48),
      aria: b.getAttribute("aria-label"),
      pressed: b.getAttribute("aria-pressed"),
      title: b.getAttribute("title")
    })).filter((c) => c.text || c.aria),
    headings: [...document.querySelectorAll("h1,h2,h3,h4")].map((h) => h.textContent?.replace(/\s+/g, " ").trim()),
    dialogs: [...document.querySelectorAll("[role=dialog]")].map((d) => d.getAttribute("aria-label") || d.textContent?.slice(0, 40))
  }));
  await writeFile(resolve(outDir, `${name}.json`), JSON.stringify(controls, null, 2));
}

// 主工作区：先跳过教程
const setup = await context.newPage();
await setup.goto(`chrome-extension://${id}/workspace.html`);
await setup.evaluate(async () => {
  await chrome.storage.local.set({ "tabnexus.settings.v1": { locale: "zh", tutorialCompleted: true } });
});
await setup.close();

const workspace = await context.newPage();
const pageErrors = [];
workspace.on("pageerror", (error) => pageErrors.push(error.message));
await workspace.goto(`chrome-extension://${id}/workspace.html`);
await workspace.waitForTimeout(1000);
await shot(workspace, "01-initial");
await dumpControls(workspace, "controls-workspace");

// 采集：全选 → 保存
await workspace.getByRole("button", { name: "全选" }).click();
await shot(workspace, "02-selected");
await workspace.getByRole("button", { name: /保存 12/ }).click();
await workspace.waitForTimeout(1300);
await shot(workspace, "03-saved");

// 本地整理弹窗（在已保存卡片上重新勾选触发）
try {
  await workspace.getByRole("button", { name: "全选" }).click();
  await workspace.getByRole("button", { name: /本地整理 12/ }).click();
  await workspace.waitForTimeout(800);
  await shot(workspace, "04-local-organize");
  await workspace.keyboard.press("Escape");
  await workspace.waitForTimeout(400);
} catch (error) {
  console.log("skip local-organize:", error.message.split("\n")[0]);
}

// AI 助手
try {
  await workspace.getByRole("button", { name: "AI 助手", exact: true }).click();
  await workspace.waitForTimeout(500);
  await shot(workspace, "05-ai-composer");
  await workspace.getByRole("button", { name: "AI 助手", exact: true }).click();
} catch (error) {
  console.log("skip ai-composer:", error.message.split("\n")[0]);
}

// 关系图
try {
  await workspace.getByRole("button", { name: "关系图" }).click();
  await workspace.waitForTimeout(900);
  await shot(workspace, "06-flow");
} catch (error) {
  console.log("skip flow:", error.message.split("\n")[0]);
}

// 教程（重置后重新加载）
await workspace.evaluate(async () => {
  const settings = await chrome.storage.local.get("tabnexus.settings.v1");
  await chrome.storage.local.set({ "tabnexus.settings.v1": { ...settings["tabnexus.settings.v1"], tutorialCompleted: false } });
});
await workspace.reload();
await workspace.waitForTimeout(900);
await shot(workspace, "07-tutorial");
await dumpControls(workspace, "controls-tutorial");
await workspace.getByRole("button", { name: /开始使用|知道了|关闭/ }).first().click({ force: true }).catch(() => {});

// 设置页
const options = await context.newPage();
await options.goto(`chrome-extension://${id}/options.html`);
await options.waitForTimeout(700);
await shot(options, "08-options-top");
await dumpControls(options, "controls-options");
await options.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.5));
await shot(options, "09-options-mid");
await options.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await shot(options, "10-options-bottom");

console.log("pageErrors:", pageErrors);
await writeFile(resolve(outDir, "page-errors.json"), JSON.stringify(pageErrors, null, 2));
await context.close();
await rm(extensionPath, { recursive: true, force: true });
console.log("done:", outDir);
