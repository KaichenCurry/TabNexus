// TabNexus 布局指标扫描：量化顶栏密度、面板结构、文字与色彩体系。
import { chromium } from "@playwright/test";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "artifacts/ux-audit");
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
await context.route("https://tabnexus.test/**", (route) => route.fulfill({
  status: 200, contentType: "text/html", body: "<title>demo</title><h1>demo</h1>"
}));
for (let i = 0; i < 12; i += 1) {
  const page = await context.newPage();
  await page.goto(`https://tabnexus.test/demo-${i}`);
}
const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
const id = new URL(worker.url()).host;
const setup = await context.newPage();
await setup.goto(`chrome-extension://${id}/workspace.html`);
await setup.evaluate(async () => {
  await chrome.storage.local.set({ "tabnexus.settings.v1": { locale: "zh", tutorialCompleted: true } });
});
await setup.close();

const page = await context.newPage();
await page.goto(`chrome-extension://${id}/workspace.html`);
await page.waitForTimeout(900);
await page.getByRole("button", { name: "全选" }).click();
await page.getByRole("button", { name: /保存 12/ }).click();
await page.waitForTimeout(1300);
await page.getByRole("button", { name: "全选" }).click();
await page.getByRole("button", { name: /本地整理 12/ }).click();
await page.waitForTimeout(800);
await page.getByRole("button", { name: /应用/ }).first().click().catch(() => {});
await page.waitForTimeout(900);

const metrics = await page.evaluate(() => {
  const rect = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return {
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
      fontSize: s.fontSize, color: s.color, bg: s.backgroundColor, radius: s.borderRadius,
      weight: s.fontWeight
    };
  };
  const vis = (el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0;
  const bar = [...document.querySelectorAll("header *, .topbar *, .toolbar *, [class*=header] button, [class*=top] button")].filter(vis);
  const buttons = [...document.querySelectorAll("button")].filter(vis);
  const vw = document.documentElement.clientWidth;
  const overflowX = document.documentElement.scrollWidth > vw;
  return {
    viewport: { w: vw, h: document.documentElement.clientHeight },
    overflowX,
    headerControls: bar.map((el) => ({ tag: el.tagName, text: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 30), cls: el.className?.toString?.().slice(0, 40), ...rect(el) })),
    allButtons: buttons.map((el) => ({ text: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 30), ...rect(el) })),
    mainFonts: [...document.querySelectorAll("h1,h2,body")].map((el) => ({ tag: el.tagName, ...rect(el) })),
    palette: [...new Set([...document.querySelectorAll("button, .card-row, .group-panel, .panel, header, aside, [class*=rail]")].filter(vis).map((el) => {
      const s = getComputedStyle(el);
      return `${s.backgroundColor}|${s.color}|${s.borderRadius}|${s.fontSize}`;
    }))].sort()
  };
});
await writeFile(resolve(outDir, "layout-metrics.json"), JSON.stringify(metrics, null, 2));
await context.close();
await rm(extensionPath, { recursive: true, force: true });
console.log("metrics saved");
