import { expect, test, chromium, type BrowserContext, type Page } from "@playwright/test";
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
  const id = await extensionId();
  const setup = await context.newPage();
  await setup.goto(`chrome-extension://${id}/workspace.html`);
  await setup.waitForTimeout(900);
  await setup.evaluate(async () => {
    await chrome.storage.local.set({
      "tabnexus.settings.v1": { locale: "zh", tutorialCompleted: true, v2ShellEnabled: true },
      "tabnexus.appState.v1": {
        schemaVersion: 1,
        activeWorkspaceId: "ws-1",
        workspaceOrder: ["ws-1"],
        workspaces: {
          "ws-1": {
            id: "ws-1",
            name: "竞品调研",
            createdAt: "2026-08-01T00:00:00.000Z",
            updatedAt: "2026-08-15T00:00:00.000Z",
            groupOrder: [],
            groups: {},
            cards: {},
            edges: [],
            v2: { goal: "理解商业模式", nextStep: "", conclusion: "" }
          }
        }
      }
    });
  });
  await setup.close();
});

test.afterEach(async () => {
  await context.close();
});

async function extensionId(): Promise<string> {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
  return new URL(worker.url()).host;
}

test("collects tabs through the v2 inbox and restores a closed page", async () => {
  const sourcePages: Page[] = [];
  for (let index = 0; index < 6; index += 1) {
    const page = await context.newPage();
    await page.goto(`https://tabnexus.test/research-${index}`);
    sourcePages.push(page);
  }

  const id = await extensionId();
  const workspace = await context.newPage();
  await workspace.goto(`chrome-extension://${id}/workspace.html?inbox=1`);

  await expect(workspace.locator(".tn-inbox-item")).toHaveCount(6);
  await workspace.locator(".tn-inbox-item input[type=checkbox]").nth(0).click();
  await workspace.locator(".tn-inbox-item input[type=checkbox]").nth(1).click();
  await workspace.locator(".tn-inbox-item input[type=checkbox]").nth(2).click();
  await expect(workspace.locator(".tn-inbox-actions .tn-primary")).toContainText("收进任务 3");
  await workspace.locator(".tn-inbox-actions .tn-primary").click();

  await expect(workspace.locator(".tn-page")).toHaveCount(3);
  await expect(workspace.getByText(/0\/3 已读/)).toBeVisible();

  // 关闭一个原标签后，从引用块 ↗ 恢复
  await sourcePages[0].close();
  await workspace.locator(".tn-page-open").first().click();
  await expect.poll(async () => context.pages().length, { timeout: 8_000 }).toBeGreaterThan(sourcePages.length + 1);
});

test("save-and-close closes originals only after saving", async () => {
  const sourcePages: Page[] = [];
  for (let index = 0; index < 3; index += 1) {
    const page = await context.newPage();
    await page.goto(`https://tabnexus.test/close-mode-${index}`);
    sourcePages.push(page);
  }
  const id = await extensionId();
  const workspace = await context.newPage();
  await workspace.goto(`chrome-extension://${id}/workspace.html?inbox=1`);

  await workspace.locator(".tn-inbox-item input[type=checkbox]").nth(0).click();
  await workspace.locator(".tn-inbox-item input[type=checkbox]").nth(1).click();
  await workspace.locator(".tn-inbox-item input[type=checkbox]").nth(2).click();
  workspace.once("dialog", (dialog) => void dialog.accept());
  await workspace.getByRole("button", { name: "保存并关闭" }).click();

  await expect.poll(async () => {
    const stored = await workspace.evaluate(async () => (await chrome.storage.local.get("tabnexus.appState.v1"))["tabnexus.appState.v1"]) as { workspaces: Record<string, { cards: Record<string, unknown> }> };
    return Object.keys(stored.workspaces["ws-1"].cards).length;
  }).toBe(3);
  await expect.poll(() => Promise.resolve(sourcePages.every((page) => page.isClosed()))).toBe(true);
});

test("collects pages directly into the chosen context section", async () => {
  for (const slug of ["section-source-a", "section-source-b"]) {
    const source = await context.newPage();
    await source.goto(`https://tabnexus.test/${slug}`);
  }
  const id = await extensionId();
  const workspace = await context.newPage();
  await workspace.goto(`chrome-extension://${id}/workspace.html`);
  await workspace.evaluate(async () => {
    const state = (await chrome.storage.local.get("tabnexus.appState.v1"))["tabnexus.appState.v1"] as any;
    state.workspaces["ws-1"].groupOrder = ["research"];
    state.workspaces["ws-1"].groups = {
      research: { id: "research", name: "研究资料", color: "#3379D6", cardIds: [] }
    };
    await chrome.storage.local.set({ "tabnexus.appState.v1": state });
  });
  await workspace.reload();

  await workspace.getByRole("button", { name: "添加资料到「研究资料」" }).click();
  await expect(workspace.locator(".tn-inbox-header strong")).toHaveText("收进「研究资料」");
  await expect(workspace.locator(".tn-inbox-item")).toHaveCount(2);
  await workspace.locator(".tn-inbox-item input[type=checkbox]").nth(0).click();
  await workspace.locator(".tn-inbox-item input[type=checkbox]").nth(1).click();
  await expect(workspace.locator(".tn-inbox-actions .tn-primary")).toContainText("收进「研究资料」 2");
  await workspace.locator(".tn-inbox-actions .tn-primary").click();

  await expect(workspace.locator("#section-research .tn-page")).toHaveCount(2);
  const assignment = await workspace.evaluate(async () => {
    const state = (await chrome.storage.local.get("tabnexus.appState.v1"))["tabnexus.appState.v1"] as any;
    const task = state.workspaces["ws-1"];
    return {
      sectionIds: task.groups.research.cardIds,
      cardSections: Object.values(task.cards).map((card: any) => card.groupId)
    };
  });
  expect(assignment.sectionIds).toHaveLength(2);
  expect(assignment.cardSections).toEqual(["research", "research"]);
});

test("compact workspace removes conclusion UI and jumps to API and MCP setup", async () => {
  const id = await extensionId();
  const workspace = await context.newPage();
  await workspace.goto(`chrome-extension://${id}/workspace.html`);

  await expect(workspace.getByText("当前结论", { exact: true })).toHaveCount(0);
  await expect(workspace.getByRole("button", { name: "AI 总结" })).toHaveCount(0);

  await workspace.getByRole("button", { name: "更多操作" }).click();
  const aiPagePromise = context.waitForEvent("page");
  await workspace.getByRole("menuitem", { name: /AI \/ API 配置/ }).click();
  const aiPage = await aiPagePromise;
  await aiPage.waitForLoadState("domcontentloaded");
  await expect(aiPage).toHaveURL(new RegExp(`chrome-extension://${id}/options\\.html#ai$`));
  await expect(aiPage.getByRole("heading", { name: "选择你的 AI 服务" })).toBeVisible();

  await workspace.getByRole("button", { name: "更多操作" }).click();
  const agentPagePromise = context.waitForEvent("page");
  await workspace.getByRole("menuitem", { name: /Agent \/ MCP 接入/ }).click();
  const agentPage = await agentPagePromise;
  await agentPage.waitForLoadState("domcontentloaded");
  await expect(agentPage).toHaveURL(new RegExp(`chrome-extension://${id}/options\\.html#agent$`));
  await expect(agentPage.getByRole("heading", { name: "连接你常用的 Agent" })).toBeVisible();
});

test("AI organize by content moves only unassigned pages into real sections", async () => {
  for (let index = 0; index < 3; index += 1) {
    const page = await context.newPage();
    await page.goto(`https://tabnexus.test/ai-${index}`);
  }
  let capturedCards: Array<{ title: string }> = [];
  await context.route("https://api.deepseek.com/chat/completions", async (route) => {
    const body = route.request().postDataJSON() as { messages: Array<{ content: string }> };
    const userMessage = body.messages.at(-1)?.content ?? "";
    const payload = JSON.parse(userMessage.split("Workspace context:\n").at(-1) ?? "{}") as {
      cards: Array<{ id: string; title: string }>;
    };
    capturedCards = payload.cards;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          basis: "Meaning-based",
          groups: [{ id: "new_group", name: "语义分组", color: "#7A6EDC" }],
          assignments: payload.cards.map((card) => ({ cardId: card.id, groupId: "new_group", reason: "同类资料" })),
          summary: "按语义归类"
        }) } }]
      })
    });
  });

  const id = await extensionId();
  const workspace = await context.newPage();
  await workspace.goto(`chrome-extension://${id}/workspace.html?inbox=1`);

  // 按内容理解需要 AI 配置
  await workspace.evaluate(async () => {
    await chrome.storage.local.set({
      "tabnexus.settings.v1": {
        locale: "zh", tutorialCompleted: true, v2ShellEnabled: true,
        aiEnabled: true, aiProvider: "deepseek",
        aiProviderConfigs: { deepseek: { apiKey: "e2e-runtime-only", model: "deepseek-v4-flash", verifiedAt: "2026-08-15T00:00:00.000Z" } }
      }
    });
  });
  await workspace.reload();
  await workspace.waitForTimeout(900);

  await workspace.locator(".tn-inbox-item input[type=checkbox]").nth(0).click();
  await workspace.locator(".tn-inbox-item input[type=checkbox]").nth(1).click();
  await workspace.locator(".tn-inbox-item input[type=checkbox]").nth(2).click();
  await workspace.locator(".tn-inbox-actions .tn-primary").click();
  await expect(workspace.locator(".tn-page")).toHaveCount(3);

  await workspace.getByRole("button", { name: "智能整理" }).click();
  await workspace.getByText("按内容理解", { exact: true }).click();
  await workspace.getByRole("button", { name: "生成整理建议" }).click();
  await expect(workspace.locator(".tn-proposal-group")).toHaveCount(1);
  expect(capturedCards.map((card) => card.title).sort()).toEqual(["ai-0", "ai-1", "ai-2"]);
  await workspace.getByRole("button", { name: "应用整理" }).click();

  await expect(workspace.getByRole("heading", { name: "语义分组", exact: true })).toBeVisible();
  await expect(workspace.locator(".tn-section .tn-page")).toHaveCount(3);
});

test("M3 Agent write-back appears live in the v2 document", async () => {
  const id = await extensionId();
  const workspace = await context.newPage();
  await workspace.goto(`chrome-extension://${id}/workspace.html`);
  await expect(workspace.locator(".tn-task-title")).toBeVisible();

  const report = await workspace.evaluate(async () => chrome.runtime.sendMessage({
    type: "M3_AGENT_TOOL",
    payload: { tool: "write_report", input: { title: "Agent market report", content: "Validated findings and next steps" } }
  }));
  expect(report.ok).toBe(true);

  const organized = await workspace.evaluate(async (reportRevision) => chrome.runtime.sendMessage({
    type: "M3_AGENT_TOOL",
    payload: {
      tool: "edit_workspace",
      input: {
        expectedRevision: reportRevision,
        operationId: "e2e:organize-agent-cards",
        actions: [
          { type: "create_group", groupId: "agent_organized", name: "Agent organized", color: "#5368AC" }
        ]
      }
    }
  }), (report.data as { revision: string }).revision);
  if (!organized.ok) throw new Error(organized.error);

  await expect(workspace.getByText("Agent market report")).toBeVisible();
  await expect(workspace.locator(".tn-section-heading").getByText("Agent organized", { exact: true })).toBeVisible();
});

test("uses the correct Agent path for source and portable builds", async () => {
  if (PACKAGED_EXTENSION_UNDER_TEST) {
    const id = await extensionId();
    const settings = await context.newPage();
    await settings.goto(`chrome-extension://${id}/options.html`);
    await expect(settings.getByText("安装包已包含本机 Agent 接入")).toBeVisible();
    await settings.getByRole("button", { name: /Codex/ }).click();
    const codexHref = await settings.getByRole("link", { name: "下载 Codex 安装器" }).getAttribute("href");
    expect(codexHref).toBe("https://github.com/KaichenCurry/TabNexus/releases/download/v1.0.5/TabNexus-Codex-Setup-v1.0.5.dmg");
    await expect(settings.getByText(/自动添加插件源、安装 TabNexus/)).toBeVisible();
    await expect(settings.getByRole("link", { name: "已经安装？在 Codex 中打开" })).toHaveAttribute("href", "codex://plugins/tabnexus@tabnexus?source=manage");
    return;
  }

  const codexMcp = spawn(process.execPath, [resolve("agent/bridge/tabnexus-mcp.mjs")], {
    env: { ...process.env, TABNEXUS_AGENT_NAME: "Codex", TABNEXUS_BRIDGE_PORT: String(E2E_BRIDGE_PORT) },
    stdio: ["pipe", "pipe", "pipe"]
  });
  const codexResponses: any[] = [];
  createInterface({ input: codexMcp.stdout, crlfDelay: Infinity }).on("line", (line) => codexResponses.push(JSON.parse(line)));
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

    codexMcp.stdin.write(`${JSON.stringify({
      jsonrpc: "2.0",
      id: 80,
      method: "tools/call",
      params: { name: "read_workspace", arguments: { detail: "summary" } }
    })}\n`);
    await expect.poll(() => codexResponses.find((response) => response.id === 80)?.result?.structuredContent?.tool).toBe("read_workspace");
  } finally {
    codexMcp.kill();
  }
});
