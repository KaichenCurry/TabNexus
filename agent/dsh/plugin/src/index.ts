/*
 * TabNexus DSH 插件（host 面）。
 *
 * 一行插件做三件事：
 *   1. 挂载 @deepseek-ai/dsh-mcp-client，把 17 个 TabNexus 工具注册为 mcp__tabnexus__*；
 *   2. 注册状态路由 /plugins/tabnexus/status（浏览器 client 面轮询的数据通道）；
 *   3. 全部副作用 effect-owned（HMR 安全）。
 */
import type { Context } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import * as mcpClient from "@deepseek-ai/dsh-mcp-client";

export const name = "tabnexus";

export const inject: string[] = [];

export interface Config {
  /** TabNexus MCP bridge 端口（Chrome 扩展同端口），默认 43119 */
  bridgePort?: number;
  /** 启动 tabnexus-mcp 的命令，默认 node */
  mcpCommand?: string;
  /** tabnexus-mcp 启动参数，默认指向仓库桥接脚本 */
  mcpArgs?: string[];
}

export const Config: z<Config> = z.object({
  bridgePort: z.natural().default(43119),
  mcpCommand: z.string().default("npx"),
  mcpArgs: z.array(z.string()).default([
    "-y",
    "https://github.com/KaichenCurry/TabNexus/releases/download/v2.0.0/tabnexus-mcp-runtime-2.0.0.tgz"
  ])
});

/** 状态路由的最小宿主接口（rc 通道键名过渡：webServer 优先、httpServer 回退） */
interface RouteHost {
  register(spec: {
    kind: "exact" | "prefix";
    path: string;
    handler: (request: unknown, response: { writeHead: (status: number, headers: Record<string, string>) => void; end: (body: string) => void }) => void | Promise<void>;
  }): () => void;
}

const PANEL_AGENT_ID = `dsh-panel-${Math.random().toString(36).slice(2, 10)}`;

async function brokerPost(bridgePort: number, path: string, body: unknown): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const response = await fetch(`http://127.0.0.1:${bridgePort}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    clearTimeout(timer);
    const payload = (await response.json()) as { ok?: boolean; data?: unknown; error?: string };
    return { ok: Boolean(payload.ok), data: payload.data, error: payload.error };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "broker unreachable" };
  }
}

async function registerPanelAgent(bridgePort: number): Promise<void> {
  try {
    await brokerPost(bridgePort, "/agent/register", {
      agentId: PANEL_AGENT_ID,
      agentName: "DSH Panel",
      agentVersion: "0.1.0",
      toolCount: 17
    });
  } catch {
    // 注册失败不阻断：面板数据调用会在实际调用时报错并展示引导
  }
}

function readRequestBody(request: unknown): Promise<unknown> {
  return new Promise((resolve) => {
    const incoming = request as { on: (event: string, callback: (...args: never[]) => void) => void };
    let raw = "";
    incoming.on("data", (chunk: never) => { raw += String(chunk); });
    incoming.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); }
    });
  });
}

function resolveRouteHost(ctx: Context): RouteHost | undefined {
  try {
    const web = ctx.get("webServer") ?? ctx.get("httpServer");
    return (web as RouteHost | undefined) ?? undefined;
  } catch {
    return undefined; // headless 等无 web 服务的组合里状态路由不可用，属可选能力
  }
}

export function apply(ctx: Context, config: Config): void {
  // 1) 挂载 MCP 客户端：工具以 mcp__tabnexus__<tool> 注册进全局工具注册表
  ctx.plugin(mcpClient, {
    transport: "stdio" as const,
    serverName: "tabnexus",
    command: config.mcpCommand ?? "node",
    args: config.mcpArgs ?? [],
    env: {
      TABNEXUS_AGENT_NAME: "DSH",
      TABNEXUS_BRIDGE_PORT: String(config.bridgePort ?? 43119)
    },
    cwd: "/Users/chen/Desktop/TabNexus",
    toolCallTimeoutMs: 60000,
    failOnStartupError: true
  });

  // 2) 状态路由（首次注册失败时等 service 到位后补注册）
  const registerStatusRoute = (): void => {
    const host = resolveRouteHost(ctx);
    if (!host) return;
    ctx.effect(() => host.register({
      kind: "exact",
      path: "/plugins/tabnexus/status",
      handler: async (_request, response) => {
        const bridgePort = config.bridgePort ?? 43119;
        let status: { ok: boolean; bridgePort: number; toolCount?: number; agentCount?: number; error?: string };
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 2000);
          const health = await fetch(`http://127.0.0.1:${bridgePort}/health`, { signal: controller.signal, cache: "no-store" });
          clearTimeout(timer);
          const payload = (await health.json()) as { toolCount?: number; agentCount?: number };
          status = {
            ok: health.status === 200,
            bridgePort,
            toolCount: payload.toolCount,
            agentCount: payload.agentCount
          };
        } catch (error) {
          status = { ok: false, bridgePort, error: error instanceof Error ? error.message : "bridge unreachable" };
        }
        response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
        response.end(JSON.stringify({ plugin: "tabnexus", version: "0.1.0", slogan: "一切皆插件 —— 那浏览器里那 50 个 Tab，也该是。", ...status }));
      }
    }), "tabnexus: status route");
  };
  registerStatusRoute();

  // 面板数据路由：拉取工作区快照（任务 + 标签操作台）
  const registerWorkspaceRoute = (): void => {
    const host = resolveRouteHost(ctx);
    if (!host) return;
    ctx.effect(() => host.register({
      kind: "exact",
      path: "/plugins/tabnexus/workspace",
      handler: async (_request, response) => {
        const bridgePort = config.bridgePort ?? 43119;
        const [workspace, workbench] = await Promise.all([
          brokerPost(bridgePort, "/agent/call", { tool: "read_workspace", args: { detail: "full" } }),
          brokerPost(bridgePort, "/agent/call", { tool: "read_tab_workbench", args: {} })
        ]);
        response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
        response.end(JSON.stringify({ workspace, workbench }));
      }
    }), "tabnexus: workspace route");

    // 通用动作代理：面板任意写操作（move/status/collect/close）转发给 broker
    ctx.effect(() => host.register({
      kind: "exact",
      path: "/plugins/tabnexus/action",
      handler: async (request, response) => {
        const body = (await readRequestBody(request)) as { tool?: string; input?: Record<string, unknown> };
        const bridgePort = config.bridgePort ?? 43119;
        if (!body.tool || !body.input) {
          response.writeHead(400, { "content-type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ ok: false, error: "tool and input required" }));
          return;
        }
        const result = await brokerPost(bridgePort, "/agent/call", { tool: body.tool, args: body.input });
        response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
        response.end(JSON.stringify(result));
      }
    }), "tabnexus: action route");
  };
  registerWorkspaceRoute();
  void registerPanelAgent(config.bridgePort ?? 43119);
  ctx.on("internal/service", (serviceName: unknown) => {
    if (serviceName === "webServer" || serviceName === "httpServer") {
      registerStatusRoute();
      registerWorkspaceRoute();
    }
  });
}
