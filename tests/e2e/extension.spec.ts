import { expect, test, chromium, type BrowserContext } from "@playwright/test";
import { spawn } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createInterface } from "node:readline";

let context: BrowserContext;
let extensionPath: string;
const E2E_BRIDGE_PORT = 43243;
const PACKAGED_EXTENSION_UNDER_TEST = Boolean(process.env.TABNEXUS_E2E_EXTENSION_PATH);

test.beforeAll(async () => {
  extensionPath = await mkdtemp(resolve(tmpdir(), "tabnexus-e2e-extension-"));
  const sourceExtensionPath = process.env.TABNEXUS_E2E_EXTENSION_PATH
    ? resolve(process.env.TABNEXUS_E2E_EXTENSION_PATH)
    : resolve("dist");
  await cp(sourceExtensionPath, extensionPath, { recursive: true });
  const backgroundPath = resolve(extensionPath, "background.js");
  const background = await readFile(backgroundPath, "utf8");
  await writeFile(backgroundPath, background.replaceAll("ws://127.0.0.1:43119/tabnexus", `ws://127.0.0.1:${E2E_BRIDGE_PORT}/tabnexus`));
  const manifestPath = resolve(extensionPath, "manifest.json");
  const manifest = await readFile(manifestPath, "utf8");
  await writeFile(manifestPath, manifest.replaceAll("ws://127.0.0.1:43119", `ws://127.0.0.1:${E2E_BRIDGE_PORT}`));
});

test.afterAll(async () => {
  await rm(extensionPath, { recursive: true, force: true });
});

test.beforeEach(async () => {
  context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ],
    viewport: { width: 1440, height: 900 }
  });
  await context.route("https://tabnexus.test/**", (route) => route.fulfill({
    status: 200,
    contentType: "text/html",
    body: `<title>${new URL(route.request().url()).pathname.slice(1)}</title><h1>TabNexus E2E fixture</h1>`
  }));
});

test.afterEach(async () => {
  await context.close();
});

async function extensionId(): Promise<string> {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
  return new URL(worker.url()).host;
}

test("multi-selects 20 tabs, restores 15 from the right rail, and survives reload", async () => {
  const sourcePages = [];
  for (let index = 0; index < 20; index += 1) {
    const page = await context.newPage();
    await page.goto(`https://tabnexus.test/research-${index}?q=keep#fragment`);
    sourcePages.push(page);
  }

  const id = await extensionId();
  const workspace = await context.newPage();
  await workspace.goto(`chrome-extension://${id}/workspace.html`);

  await expect(workspace.getByRole("heading", { name: "标签操作台" })).toBeVisible();
  await expect(workspace.locator(".rail-tab-count strong")).toHaveText("20");
  await workspace.getByRole("button", { name: "全选" }).click();
  await expect(workspace.getByText("已选择 20 个")).toBeVisible();
  const collectionStartedAt = Date.now();
  await workspace.getByRole("button", { name: /保存 20/ }).click();
  await expect(workspace.getByText("已保存 20 个标签；原标签继续留在浏览器中")).toBeVisible();
  expect(Date.now() - collectionStartedAt).toBeLessThan(2_000);
  await expect(workspace.locator(".card-row")).toHaveCount(0);
  await expect(workspace.locator(".inbox-panel")).toHaveCount(0);
  await expect(workspace.locator(".open-tab.is-saved")).toHaveCount(20);
  await expect(workspace.locator(".open-tab.is-saved").first()).toHaveAttribute("draggable", "true");

  await Promise.all(sourcePages.slice(0, 15).map((page) => page.close()));
  await expect(workspace.locator(".open-tab.is-missing")).toHaveCount(15);
  await expect(workspace.locator(".open-tab.is-missing").first()).toHaveAttribute("draggable", "true");
  await workspace.getByRole("button", { name: "全选" }).click();
  await workspace.getByRole("button", { name: /重开 15/ }).click();
  await expect(workspace.getByText("重新打开 15 个，已有 5 个，失败 0 个")).toBeVisible();
  await expect(workspace.locator(".open-tab.is-missing")).toHaveCount(0);

  await workspace.reload();
  await expect(workspace.locator(".open-tab.is-saved")).toHaveCount(20);
  await expect(workspace.getByText("20 张卡片", { exact: false })).toBeVisible();
});

test("the selected save-and-close action closes originals only after saving", async () => {
  const sourcePages = [];
  for (let index = 0; index < 3; index += 1) {
    const page = await context.newPage();
    await page.goto(`https://tabnexus.test/close-mode-${index}`);
    sourcePages.push(page);
  }
  const id = await extensionId();
  const workspace = await context.newPage();
  await workspace.goto(`chrome-extension://${id}/workspace.html`);

  await expect(workspace.getByRole("heading", { name: "标签操作台" })).toBeVisible();
  await workspace.getByRole("button", { name: "全选" }).click();
  await workspace.getByRole("button", { name: /保存并关闭 3/ }).click();
  await expect(workspace.getByRole("dialog", { name: "保存并关闭所选标签？" })).toBeVisible();
  await expect(workspace.getByText("已选择 3 个")).toBeVisible();
  await workspace.getByRole("button", { name: "关闭 3 个标签" }).click();
  await expect(workspace.getByText("已新保存 3 个，关闭 3 个；卡片继续保留")).toBeVisible();
  await expect(workspace.locator(".open-tab.is-missing")).toHaveCount(3);
  expect(sourcePages.every((page) => page.isClosed())).toBe(true);
});

test("AI organize moves only checked tabs directly into real groups", async () => {
  for (let index = 0; index < 2; index += 1) {
    const page = await context.newPage();
    await page.goto(`https://tabnexus.test/ai-${index}`);
  }
  const id = await extensionId();
  const workspace = await context.newPage();
  await workspace.goto(`chrome-extension://${id}/workspace.html`);

  await workspace.getByRole("button", { name: "全选" }).click();
  await workspace.getByRole("button", { name: /本地整理 2/ }).click();
  await expect(workspace.getByRole("heading", { name: "tabnexus.test" })).toBeVisible();
  await expect(workspace.locator(".group-panel .card-row")).toHaveCount(2);
  await expect(workspace.locator(".inbox-panel")).toHaveCount(0);
  await expect(workspace.locator(".open-tab.is-saved")).toHaveCount(2);
});

test("the Agent composer analyzes exactly the tabs checked in the right rail", async () => {
  for (let index = 0; index < 3; index += 1) {
    const page = await context.newPage();
    await page.goto(`https://tabnexus.test/scope-${index}`);
  }
  let capturedCards: Array<{ title: string }> = [];
  let capturedPlannerTabs: Array<{ id: number; title: string }> = [];
  await context.route("https://api.deepseek.com/chat/completions", async (route) => {
    const body = route.request().postDataJSON() as { messages: Array<{ content: string }> };
    const userMessage = body.messages.at(-1)?.content ?? "";
    if (userMessage.includes("TabNexus's safe workspace and browser-tab operator")) {
      const payload = JSON.parse(userMessage.split("Context:\n").at(-1) ?? "{}") as {
        tabs: Array<{ id: number; title: string }>;
      };
      capturedPlannerTabs = payload.tabs;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({
          summary: "Organize only the checked rail tabs",
          rationale: "The rail selection is the authoritative scope.",
          actions: [{ type: "organize", cardIds: [], tabIds: payload.tabs.map((tab) => tab.id), instruction: "只整理我勾选的标签" }]
        }) } }] })
      });
      return;
    }
    const payload = JSON.parse(userMessage.split("Workspace context:\n").at(-1) ?? "{}") as {
      cards: Array<{ id: string; title: string }>;
    };
    capturedCards = payload.cards;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          basis: "Checked-tab scope",
          groups: [{ id: "new_selected", name: "Selected only", color: "#7A6EDC" }],
          assignments: payload.cards.map((card) => ({ cardId: card.id, groupId: "new_selected", reason: "Included in the checked selection" })),
          summary: "Only the checked tabs were analyzed."
        }) } }]
      })
    });
  });

  const id = await extensionId();
  const workspace = await context.newPage();
  await workspace.goto(`chrome-extension://${id}/workspace.html`);
  await workspace.evaluate(async () => {
    await chrome.storage.local.set({
      "tabnexus.settings.v1": {
        locale: "zh",
        deepSeekEnabled: true,
        deepSeekApiKey: "e2e-runtime-only",
        deepSeekVerifiedAt: "2026-07-21T00:00:00.000Z",
        deepSeekModel: "deepseek-v4-flash",
        groupingPolicy: "suggestion",
        aiComposerCollapsed: true
      }
    });
  });
  await workspace.reload();

  await workspace.getByRole("checkbox", { name: "选择 scope-0" }).click({ force: true });
  await workspace.getByRole("checkbox", { name: "选择 scope-2" }).click({ force: true });
  await workspace.getByRole("button", { name: "AI 助手", exact: true }).click();
  const composer = workspace.getByRole("region", { name: "AI 助手" });
  const selectedScope = composer.getByRole("button", { name: /标签区已选.*2 个/ });
  await expect(selectedScope).toBeEnabled();
  await selectedScope.click();
  await composer.getByRole("textbox").fill("只整理我勾选的标签");
  await composer.getByRole("button", { name: "理解指令并生成操作预览" }).click();

  await expect(workspace.getByRole("dialog", { name: "整理建议" })).toBeVisible();
  expect(capturedPlannerTabs.map((tab) => tab.title).sort()).toEqual(["scope-0", "scope-2"]);
  expect(capturedCards.map((card) => card.title).sort()).toEqual(["scope-0", "scope-2"]);
  await expect(workspace.getByText("2 条资料将调整到 1 个分组")).toBeVisible();
});

test("the Agent previews, saves, and closes exactly the checked rail tabs", async () => {
  const sourcePages = [];
  for (let index = 0; index < 3; index += 1) {
    const page = await context.newPage();
    await page.goto(`https://tabnexus.test/agent-close-${index}`);
    sourcePages.push(page);
  }
  let plannedTitles: string[] = [];
  await context.route("https://api.deepseek.com/chat/completions", async (route) => {
    const body = route.request().postDataJSON() as { messages: Array<{ content: string }> };
    const userMessage = body.messages.at(-1)?.content ?? "";
    const payload = JSON.parse(userMessage.split("Context:\n").at(-1) ?? "{}") as {
      tabs: Array<{ id: number; title: string }>;
    };
    plannedTitles = payload.tabs.map((tab) => tab.title);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({
        summary: "保存并关闭所选的两个标签",
        rationale: "只处理标签区当前勾选项。",
        actions: [{ type: "close_tabs", tabIds: payload.tabs.map((tab) => tab.id) }]
      }) } }] })
    });
  });

  const id = await extensionId();
  const workspace = await context.newPage();
  await workspace.goto(`chrome-extension://${id}/workspace.html`);
  await workspace.evaluate(async () => {
    await chrome.storage.local.set({
      "tabnexus.settings.v1": {
        locale: "zh",
        deepSeekEnabled: true,
        deepSeekApiKey: "e2e-runtime-only",
        deepSeekVerifiedAt: "2026-07-21T00:00:00.000Z",
        deepSeekModel: "deepseek-v4-flash",
        groupingPolicy: "suggestion",
        aiComposerCollapsed: true
      }
    });
  });
  await workspace.reload();

  await workspace.getByRole("checkbox", { name: "选择 agent-close-0" }).click({ force: true });
  await workspace.getByRole("checkbox", { name: "选择 agent-close-2" }).click({ force: true });
  await workspace.getByRole("button", { name: "AI 助手", exact: true }).click();
  const composer = workspace.getByRole("region", { name: "AI 助手" });
  const scope = composer.getByRole("button", { name: /标签区已选.*2 个/ });
  await scope.click();
  await composer.getByRole("textbox").fill("保存并关闭我勾选的标签");
  await composer.getByRole("button", { name: "理解指令并生成操作预览" }).click();

  const preview = workspace.getByRole("dialog", { name: "操作预览" });
  await expect(preview).toBeVisible();
  await expect(preview.getByText("先保存，再关闭 2 个标签")).toBeVisible();
  expect(plannedTitles.sort()).toEqual(["agent-close-0", "agent-close-2"]);
  await preview.getByRole("button", { name: "确认并执行" }).click();

  await expect(workspace.getByText("AI 操作已完成，标签已按预览结果处理")).toBeVisible();
  await expect(workspace.locator(".open-tab.is-missing")).toHaveCount(2);
  expect(sourcePages[0].isClosed()).toBe(true);
  expect(sourcePages[1].isClosed()).toBe(false);
  expect(sourcePages[2].isClosed()).toBe(true);
});

test("M3 Agent write-back appears live in the workspace and activity review", async () => {
  const id = await extensionId();
  const workspace = await context.newPage();
  await workspace.goto(`chrome-extension://${id}/workspace.html`);
  await expect(workspace.getByRole("heading", { name: "标签操作台" })).toBeVisible();

  const response = await workspace.evaluate(async () => chrome.runtime.sendMessage({
    type: "M3_AGENT_TOOL",
    payload: {
      tool: "write_report",
      input: { title: "Agent market report", content: "Validated findings and next steps" }
    }
  }));
  expect(response.ok).toBe(true);
  const second = await workspace.evaluate(async () => chrome.runtime.sendMessage({
    type: "M3_AGENT_TOOL",
    payload: {
      tool: "add_card",
      input: { title: "Agent supporting evidence", note: "Supporting source" }
    }
  }));
  expect(second.ok).toBe(true);
  const proposal = await workspace.evaluate(async ({ fromCardId, toCardId }) => chrome.runtime.sendMessage({
    type: "M3_AGENT_TOOL",
    payload: {
      tool: "propose_structure",
      input: { summary: "Evidence supports the report", edges: [{ fromCardId, toCardId, label: "支持" }] }
    }
  }), { fromCardId: second.data.cardId, toCardId: response.data.cardId });
  expect(proposal.ok).toBe(true);

  const latest = await workspace.evaluate(async (sinceRevision) => chrome.runtime.sendMessage({
    type: "M3_AGENT_TOOL",
    payload: { tool: "read_workspace", input: { sinceRevision } }
  }), second.data.revision);
  expect(latest.ok).toBe(true);

  const organized = await workspace.evaluate(async ({ expectedRevision, sourceCardId, reportCardId }) => chrome.runtime.sendMessage({
    type: "M3_AGENT_TOOL",
    payload: {
      tool: "edit_workspace",
      input: {
        expectedRevision,
        operationId: "e2e:organize-agent-cards",
        actions: [
          { type: "create_group", groupId: "agent_organized", name: "Agent organized", color: "#5368AC" },
          { type: "move_cards", cardIds: [sourceCardId, reportCardId], targetGroupId: "agent_organized" },
          { type: "update_card", cardId: sourceCardId, status: "adopted" },
          { type: "position_cards", positions: [{ cardId: sourceCardId, x: 260, y: 120 }, { cardId: reportCardId, x: 560, y: 120 }] }
        ]
      }
    }
  }), { expectedRevision: latest.data.revision, sourceCardId: second.data.cardId, reportCardId: response.data.cardId });
  if (!organized.ok) throw new Error(organized.error);
  expect(organized).toMatchObject({ ok: true, data: { tool: "edit_workspace", createdGroupIds: ["agent_organized"] } });

  await expect(workspace.getByRole("heading", { name: "Agent organized" })).toBeVisible();
  await expect(workspace.getByText("Agent market report")).toBeVisible();
  await expect(workspace.getByText("Agent supporting evidence")).toBeVisible();
  const activityButton = workspace.getByRole("button", { name: /查看 Agent 活动.*4 条/ });
  await expect(activityButton).toBeVisible();
  await activityButton.click();
  const activity = workspace.getByRole("dialog", { name: "Agent 活动" });
  await expect(activity.getByText("写回报告", { exact: true })).toBeVisible();
  await expect(activity.getByText("编辑工作区", { exact: true })).toBeVisible();
  await expect(activity.getByText("Agent 写回报告“Agent market report”")).toBeVisible();
  await activity.getByRole("button", { name: /审查关系建议/ }).click();
  const review = workspace.getByRole("dialog", { name: "任务结构建议" });
  await expect(review.getByText("Evidence supports the report")).toBeVisible();
  await review.getByRole("button", { name: "应用关系" }).click();
  await workspace.getByRole("button", { name: "关系图" }).click();
  await expect(workspace.locator(".flow-edge-label")).toHaveCount(1);
});

test("uses the correct Agent path for source and portable builds", async () => {
  if (PACKAGED_EXTENSION_UNDER_TEST) {
    const id = await extensionId();
    const settings = await context.newPage();
    await settings.goto(`chrome-extension://${id}/options.html`);
    await expect(settings.getByText("安装包已包含本机 Agent 接入")).toBeVisible();
    await settings.getByRole("button", { name: /Codex/ }).click();
    await expect(settings.getByRole("link", { name: "打开 Codex 设置" })).toHaveAttribute("href", "codex://settings");
    await expect(settings.getByText(/直接打开本机 Codex 设置/)).toBeVisible();
    await expect(settings.getByRole("link", { name: "查看 Agent 安装" })).toHaveCount(0);

    await settings.getByRole("button", { name: /所有 Agent/ }).click();
    await settings.getByRole("button", { name: /Cursor/ }).click();
    const cursorHref = await settings.getByRole("link", { name: "在 Cursor 中安装" }).getAttribute("href");
    expect(cursorHref).toMatch(/^https:\/\/cursor\.com\/en\/install-mcp\?/);
    const encodedConfig = new URL(cursorHref!).searchParams.get("config") ?? "";
    const cursorConfig = JSON.parse(Buffer.from(encodedConfig, "base64").toString("utf8"));
    expect(cursorConfig).toMatchObject({
      command: "npx",
      args: ["--yes", "https://github.com/KaichenCurry/TabNexus/releases/download/v1.0.2/tabnexus-mcp-runtime-1.0.2.tgz"]
    });
    expect(cursorHref).not.toContain("agent-setup");
    return;
  }

  const codexMcp = spawn(process.execPath, [resolve("agent/bridge/tabnexus-mcp.mjs")], {
    env: { ...process.env, TABNEXUS_AGENT_NAME: "Codex", TABNEXUS_BRIDGE_PORT: String(E2E_BRIDGE_PORT) },
    stdio: ["pipe", "pipe", "pipe"]
  });
  const codexResponses: any[] = [];
  createInterface({ input: codexMcp.stdout, crlfDelay: Infinity }).on("line", (line) => codexResponses.push(JSON.parse(line)));
  let cursorMcp: ReturnType<typeof spawn> | undefined;
  try {
    await expect.poll(async () => {
      try { return (await fetch(`http://127.0.0.1:${E2E_BRIDGE_PORT}/health`)).status; } catch { return 0; }
    }).toBe(503);

    const id = await extensionId();
    const settings = await context.newPage();
    await settings.goto(`chrome-extension://${id}/options.html`);
    await settings.getByRole("button", { name: /Codex/ }).click();
    await settings.getByRole("button", { name: "检测连接" }).click();
    await expect(settings.getByText("Codex 已连接", { exact: true })).toBeVisible();
    await expect(settings.getByText("Codex 已获得本机工作区访问权限。")).toBeVisible();

    cursorMcp = spawn(process.execPath, [resolve("agent/bridge/tabnexus-mcp.mjs")], {
      env: { ...process.env, TABNEXUS_AGENT_NAME: "Cursor", TABNEXUS_BRIDGE_PORT: String(E2E_BRIDGE_PORT) },
      stdio: ["pipe", "pipe", "pipe"]
    });
    const cursorResponses: any[] = [];
    createInterface({ input: cursorMcp.stdout!, crlfDelay: Infinity }).on("line", (line) => cursorResponses.push(JSON.parse(line)));
    await expect.poll(async () => {
      const health = await fetch(`http://127.0.0.1:${E2E_BRIDGE_PORT}/health`).then((response) => response.json());
      return health.agentCount;
    }).toBe(2);
    await expect(settings.getByText("2 个 Agent 已连接", { exact: true })).toBeVisible({ timeout: 8_000 });

    codexMcp.stdin.write(`${JSON.stringify({
      jsonrpc: "2.0",
      id: 80,
      method: "tools/call",
      params: { name: "read_workspace", arguments: { detail: "summary" } }
    })}\n`);
    cursorMcp.stdin!.write(`${JSON.stringify({
      jsonrpc: "2.0",
      id: 81,
      method: "tools/call",
      params: { name: "read_workspace", arguments: { detail: "summary" } }
    })}\n`);
    await expect.poll(() => codexResponses.find((response) => response.id === 80)?.result?.structuredContent?.tool).toBe("read_workspace");
    await expect.poll(() => cursorResponses.find((response) => response.id === 81)?.result?.structuredContent?.tool).toBe("read_workspace");
  } finally {
    cursorMcp?.kill();
    codexMcp.kill();
  }
});

test("maps saved cards into a persistent relationship view without browser dialogs", async () => {
  for (let index = 0; index < 2; index += 1) {
    const page = await context.newPage();
    await page.goto(`https://tabnexus.test/flow-${index}`);
  }
  const id = await extensionId();
  const workspace = await context.newPage();
  await workspace.goto(`chrome-extension://${id}/workspace.html`);

  await workspace.getByRole("button", { name: "全选" }).click();
  await workspace.getByRole("button", { name: /本地整理 2/ }).click();
  await expect(workspace.locator(".group-panel .card-row")).toHaveCount(2);
  await workspace.getByRole("button", { name: "关系图" }).click();
  await expect(workspace.locator(".flow-node")).toHaveCount(2);

  const graphNodes = workspace.locator(".react-flow__node-card");
  await expect(workspace.getByRole("button", { name: "选择资料" })).toHaveAttribute("aria-pressed", "true");
  await graphNodes.nth(0).click();
  await graphNodes.nth(1).click({ modifiers: ["Shift"] });
  await expect(workspace.getByText("已选择 2 条资料")).toBeVisible();

  const firstStyleBefore = await graphNodes.nth(0).getAttribute("style");
  const secondStyleBefore = await graphNodes.nth(1).getAttribute("style");
  const firstBox = await graphNodes.nth(0).boundingBox();
  expect(firstBox).not.toBeNull();
  await workspace.mouse.move(firstBox!.x + firstBox!.width / 2, firstBox!.y + firstBox!.height / 2);
  await workspace.mouse.down();
  await workspace.mouse.move(firstBox!.x + firstBox!.width / 2 + 54, firstBox!.y + firstBox!.height / 2 + 28, { steps: 6 });
  await workspace.mouse.up();
  await expect.poll(() => graphNodes.nth(0).getAttribute("style")).not.toBe(firstStyleBefore);
  await expect.poll(() => graphNodes.nth(1).getAttribute("style")).not.toBe(secondStyleBefore);
  const movedFirstTransform = await graphNodes.nth(0).evaluate((element) => (element as HTMLElement).style.transform);

  const viewport = workspace.locator(".react-flow__viewport");
  const viewportBefore = await viewport.getAttribute("style");
  await workspace.getByRole("button", { name: "移动画布" }).click();
  await expect(workspace.getByRole("button", { name: "移动画布" })).toHaveAttribute("aria-pressed", "true");
  const pane = await workspace.locator(".react-flow__pane").boundingBox();
  expect(pane).not.toBeNull();
  await workspace.mouse.move(pane!.x + pane!.width / 2, pane!.y + pane!.height / 2);
  await workspace.mouse.down();
  await workspace.mouse.move(pane!.x + pane!.width / 2 + 70, pane!.y + pane!.height / 2 + 36, { steps: 5 });
  await workspace.mouse.up();
  await expect.poll(() => viewport.getAttribute("style")).not.toBe(viewportBefore);
  await workspace.getByRole("button", { name: "选择资料" }).click();

  await workspace.getByRole("button", { name: "资料状态：待读" }).first().click();
  await expect(workspace.getByRole("button", { name: "资料状态：已读" })).toBeVisible();
  await workspace.getByRole("button", { name: /连接卡片/ }).click();
  await workspace.locator(".flow-node").nth(0).click({ position: { x: 12, y: 12 } });
  await workspace.locator(".flow-node").nth(1).click({ position: { x: 12, y: 12 } });
  await expect(workspace.getByRole("dialog", { name: "描述这条关系" })).toBeVisible();
  await workspace.getByRole("button", { name: "支持", exact: true }).click();
  await workspace.getByRole("button", { name: "建立关系" }).click();
  await expect(workspace.locator(".flow-edge-label")).toHaveCount(1);

  await workspace.reload();
  await expect(workspace.getByRole("button", { name: "关系图" })).toHaveClass(/active/);
  await expect(workspace.locator(".flow-node")).toHaveCount(2);
  await expect.poll(() => workspace.locator(".react-flow__node-card").nth(0).evaluate((element) => (element as HTMLElement).style.transform)).toBe(movedFirstTransform);
  await expect(workspace.locator(".flow-edge-label")).toHaveCount(1);
  await expect(workspace.getByRole("button", { name: "资料状态：已读" })).toBeVisible();
});
