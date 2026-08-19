// TabNexus v2 外壳可视化验证：启用 v2ShellEnabled，注入示例任务，逐态截图并扫描设计令牌合规。
import { chromium } from "@playwright/test";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "artifacts/ux-audit-v2");
await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const extensionPath = await mkdtemp(resolve(tmpdir(), "tabnexus-ux-v2-"));
await cp(resolve(root, "dist"), extensionPath, { recursive: true });

const context = await chromium.launchPersistentContext("", {
  channel: "chromium",
  headless: true,
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  viewport: { width: 1440, height: 900 },
  locale: "zh-CN"
});

const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
const id = new URL(worker.url()).host;

await context.route("https://tabnexus.test/**", (route) => {
  const title = decodeURIComponent(new URL(route.request().url()).pathname.slice(1));
  return route.fulfill({
    status: 200,
    contentType: "text/html",
    body: `<title>${title}</title><h1>${title}</h1>`
  });
});

const SAMPLE_TASK = {
  id: "task-1",
  name: "评估 Perplexity 值不值得对标",
  createdAt: "2026-08-14T00:00:00.000Z",
  updatedAt: "2026-08-15T00:00:00.000Z",
  groupOrder: ["s-market", "s-risk"],
  groups: {
    "s-market": { id: "s-market", name: "市场与商业模式", color: "#E8833A", cardIds: ["p-1", "p-2"] },
    "s-risk": { id: "s-risk", name: "风险与反例", color: "#D6455E", cardIds: ["p-3"] }
  },
  cards: {
    "p-1": { id: "p-1", type: "web", title: "Perplexity 融资轮次", url: "https://crunchbase.com/perp", note: "估值 90 亿，未披露 ARR", status: "adopted", groupId: "s-market", source: "user" },
    "p-2": { id: "p-2", type: "web", title: "AI 搜索市场规模", url: "https://example.com/market", note: "", status: "read", groupId: "s-market", source: "user" },
    "p-3": { id: "p-3", type: "web", title: "2023 年产品测评", url: "https://example.com/old-review", note: "", status: "excluded", excludedReason: "已过期，不能用于当前判断", groupId: "s-risk", source: "user" },
    "p-4": { id: "p-4", type: "web", title: "用户评价汇总", url: "https://zhihu.com/topic", note: "待归纳", status: "unread", groupId: null, source: "user" }
  },
  edges: [],
  v2: { goal: "理解商业模式、增长与风险", nextStep: "补一个失败案例", conclusion: "值得研究，但短期不宜直接复制", summary: undefined }
};

const setup = await context.newPage();
await setup.goto(`chrome-extension://${id}/workspace.html`);
await setup.waitForTimeout(900); // 等旧壳完成首读（避免其初始态写入覆盖种子）
await setup.evaluate(async (sampleTask) => {
  await chrome.storage.local.set({
    "tabnexus.settings.v1": { locale: "zh", tutorialCompleted: true, v2ShellEnabled: true },
    "tabnexus.appState.v1": {
      schemaVersion: 1,
      activeWorkspaceId: sampleTask.id,
      workspaceOrder: [sampleTask.id],
      workspaces: { [sampleTask.id]: sampleTask }
    }
  });
}, SAMPLE_TASK);
await setup.close();

const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
await page.goto(`chrome-extension://${id}/workspace.html`);
await page.waitForTimeout(1200);
await page.screenshot({ path: resolve(outDir, "01-v2-document.png") });

// 布局与令牌合规扫描
const metrics = await page.evaluate(() => {
  const vis = (el) => el.offsetWidth > 0 || el.offsetHeight > 0;
  const buttons = [...document.querySelectorAll(".tn-shell button")].filter(vis);
  const computed = (el) => {
    const s = getComputedStyle(el);
    return { fontSize: s.fontSize, color: s.color, bg: s.backgroundColor, radius: s.borderRadius };
  };
  const rootStyle = getComputedStyle(document.documentElement);
  const colorProbe = document.createElement("span");
  colorProbe.hidden = true;
  document.body.append(colorProbe);
  const allowedColors = new Set(["rgb(255, 255, 255)", "rgb(0, 0, 0)"]);
  for (const name of rootStyle) {
    if (!name.startsWith("--tn-")) continue;
    const value = rootStyle.getPropertyValue(name).trim();
    if (!CSS.supports("color", value)) continue;
    colorProbe.style.color = value;
    allowedColors.add(getComputedStyle(colorProbe).color);
  }
  colorProbe.remove();
  const palette = [...new Set(buttons.map((b) => { const s = computed(b); return `${s.bg}|${s.color}|${s.radius}|${s.fontSize}`; }))];
  const badTokens = [];
  for (const el of document.querySelectorAll(".tn-shell *")) {
    const s = getComputedStyle(el);
    if (!vis(el) || el.tagName === "SELECT") continue;
    for (const [prop, raw, token] of [
      ["background-color", s.backgroundColor, "gray/primary"],
      ["color", s.color, "gray"],
      ["border-radius", s.borderRadius, "radius"]
    ]) {
      if (!raw || raw === "rgba(0, 0, 0, 0)" || raw === "transparent") continue;
      // 色值必须来自当前设计令牌。令牌动态解析，换主题时审计不需要维护手写色表。
      const rgb = raw.startsWith("rgb") ? raw : null;
      if (rgb && !allowedColors.has(rgb)) badTokens.push({ tag: el.tagName, cls: (el.className || "").toString().slice(0, 40), prop, raw });
    }
  }
  return {
    buttonCount: buttons.length,
    toolbarButtonCount: [...document.querySelectorAll(".tn-toolbar button")].filter(vis).length,
    headings: [...document.querySelectorAll("h2,h3")].map((h) => h.textContent?.trim()),
    fontSizes: [...new Set([...document.querySelectorAll(".tn-shell *")]
      .filter((el) => vis(el) && [...el.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()))
      .map((el) => getComputedStyle(el).fontSize))].sort(),
    undersizedText: [...document.querySelectorAll(".tn-shell *")]
      .filter((el) => vis(el) && [...el.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) && parseFloat(getComputedStyle(el).fontSize) < 12)
      .map((el) => ({ tag: el.tagName, cls: (el.className || "").toString().slice(0, 60), text: el.textContent?.trim().slice(0, 60), fontSize: getComputedStyle(el).fontSize })),
    palette,
    badTokens: badTokens.slice(0, 10)
  };
});
await writeFile(resolve(outDir, "v2-metrics.json"), JSON.stringify(metrics, null, 2));

// 布局与微交互验证：章节按横向资料列呈现，卡片菜单不被列容器裁切。
const firstSection = page.locator(".tn-section").first();
const boardMetrics = await page.evaluate(() => {
  const board = document.querySelector(".tn-sections");
  const columns = [...document.querySelectorAll(".tn-section")];
  return {
    display: board ? getComputedStyle(board).display : null,
    gridAutoFlow: board ? getComputedStyle(board).gridAutoFlow : null,
    columnCount: columns.length,
    columnWidths: columns.map((column) => Math.round(column.getBoundingClientRect().width)),
    pageCardCount: document.querySelectorAll(".tn-page").length,
    collectLabels: [...document.querySelectorAll(".tn-section-collect")].map((button) => button.textContent?.replace(/\s+/g, " ").trim()),
    horizontalOverflow: board ? board.scrollWidth > board.clientWidth : false
  };
});
const lastPage = firstSection.locator(".tn-page").last();
await lastPage.hover();
await lastPage.locator(".tn-page-menu > summary").click();
const popoverVisible = await lastPage.locator(".tn-page-menu > div").evaluate((el) => {
  const rect = el.getBoundingClientRect();
  const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + Math.min(rect.height / 2, 24));
  return rect.width > 0 && rect.height > 0 && Boolean(hit && (hit === el || el.contains(hit)));
});
await lastPage.locator(".tn-page-menu > summary").click();

await firstSection.locator(".tn-section-collect").click();
await page.waitForTimeout(320);
const targetedInboxTitle = await page.locator(".tn-inbox-header strong").textContent();
await page.screenshot({ path: resolve(outDir, "10-v2-targeted-inbox.png") });
await page.locator(".tn-inbox-header > button").click();
await writeFile(resolve(outDir, "interaction-metrics.json"), JSON.stringify({ ...boardMetrics, popoverVisible, targetedInboxTitle }, null, 2));

await page.getByRole("button", { name: "智能整理" }).click();
await page.waitForTimeout(320);
await page.screenshot({ path: resolve(outDir, "08-v2-organize.png") });
await page.locator(".tn-modal-head > button").click();

// 首启态：清空任务 → 默认任务名 → 首启输入框
await page.evaluate(async () => {
  await chrome.storage.local.set({
    "tabnexus.appState.v1": {
      schemaVersion: 1,
      activeWorkspaceId: "empty",
      workspaceOrder: ["empty"],
      workspaces: { empty: {
        id: "empty", name: "我的工作区", createdAt: "2026-08-15T00:00:00.000Z", updatedAt: "2026-08-15T00:00:00.000Z",
        groupOrder: [], groups: {}, cards: {}, edges: []
      } }
    }
  });
});
await page.reload();
await page.waitForTimeout(1000);
await page.screenshot({ path: resolve(outDir, "02-v2-firstrun.png") });

// ── 收件口态：开 3 个真实标签 + ?inbox=1 ──
for (const slug of ["unsaved-page-a", "unsaved-page-b", "saved-page"]) {
  const tab = await context.newPage();
  await tab.goto(`https://tabnexus.test/${slug}`);
}
await page.goto(`chrome-extension://${id}/workspace.html?inbox=1`);
await page.waitForTimeout(1500);
await page.screenshot({ path: resolve(outDir, "03-v2-inbox.png") });
const inboxMetrics = await page.evaluate(() => ({
  inboxItems: [...document.querySelectorAll(".tn-inbox-item")].map((el) => el.textContent?.replace(/\s+/g, " ").trim()),
  collectButton: document.querySelector(".tn-inbox-actions .tn-primary")?.textContent,
  hasPalette: Boolean(document.querySelector(".tn-palette"))
}));
await writeFile(resolve(outDir, "inbox-metrics.json"), JSON.stringify(inboxMetrics, null, 2));

// ⌘K
await page.keyboard.press("Meta+k");
await page.waitForTimeout(400);
await page.screenshot({ path: resolve(outDir, "04-v2-palette.png") });

// ── Popup ──
const popup = await context.newPage();
await popup.goto(`chrome-extension://${id}/popup.html`);
await popup.waitForTimeout(800);
await popup.screenshot({ path: resolve(outDir, "05-v2-popup.png") });
const popupMetrics = await popup.evaluate(() => ({
  buttons: [...document.querySelectorAll("button")].map((b) => b.textContent?.trim()),
  head: document.querySelector(".popup-head")?.textContent?.replace(/\s+/g, " ").trim()
}));
await writeFile(resolve(outDir, "popup-metrics.json"), JSON.stringify(popupMetrics, null, 2));

// ── Settings ──
const options = await context.newPage();
await options.goto(`chrome-extension://${id}/options.html`);
await options.waitForTimeout(900);
await options.screenshot({ path: resolve(outDir, "07-v2-options.png") });
const optionsMetrics = await options.evaluate(() => ({
  headings: [...document.querySelectorAll("h1,h2")].filter((el) => el.getBoundingClientRect().top < innerHeight).map((el) => el.textContent?.trim()),
  undersizedText: [...document.querySelectorAll(".options-page *")]
    .filter((el) => {
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && [...el.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) && parseFloat(getComputedStyle(el).fontSize) < 12;
    })
    .map((el) => ({ tag: el.tagName, cls: (el.className || "").toString().slice(0, 80), parent: (el.parentElement?.className || "").toString().slice(0, 80), text: el.textContent?.trim().slice(0, 60), fontSize: getComputedStyle(el).fontSize }))
}));
await writeFile(resolve(outDir, "options-metrics.json"), JSON.stringify(optionsMetrics, null, 2));
await options.locator(".agent-section-heading").scrollIntoViewIfNeeded();
await options.waitForTimeout(300);
await options.screenshot({ path: resolve(outDir, "09-v2-options-agent.png") });

console.log("pageErrors:", pageErrors);
await writeFile(resolve(outDir, "page-errors.json"), JSON.stringify(pageErrors, null, 2));
await context.close();
await rm(extensionPath, { recursive: true, force: true });
console.log("done:", outDir);
