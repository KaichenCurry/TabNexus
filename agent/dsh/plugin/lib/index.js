import z from "@deepseek-ai/schemastery";
import * as mcpClient from "@deepseek-ai/dsh-mcp-client";
export const name = "tabnexus";
export const inject = [];
export const Config = z.object({
    bridgePort: z.natural().default(43119),
    mcpCommand: z.string().default("node"),
    mcpArgs: z.array(z.string()).default([
        "/Users/chen/Desktop/TabNexus/agent/bridge/tabnexus-mcp.mjs"
    ])
});
const PANEL_AGENT_ID = `dsh-panel-${Math.random().toString(36).slice(2, 10)}`;
async function brokerPost(bridgePort, path, body) {
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
        const payload = (await response.json());
        return { ok: Boolean(payload.ok), data: payload.data, error: payload.error };
    }
    catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "broker unreachable" };
    }
}
async function registerPanelAgent(bridgePort) {
    try {
        await brokerPost(bridgePort, "/agent/register", {
            agentId: PANEL_AGENT_ID,
            agentName: "DSH Panel",
            agentVersion: "0.1.0",
            toolCount: 17
        });
    }
    catch {
        // 注册失败不阻断：面板数据调用会在实际调用时报错并展示引导
    }
}
function readRequestBody(request) {
    return new Promise((resolve) => {
        const incoming = request;
        let raw = "";
        incoming.on("data", (chunk) => { raw += String(chunk); });
        incoming.on("end", () => {
            try {
                resolve(raw ? JSON.parse(raw) : {});
            }
            catch {
                resolve({});
            }
        });
    });
}
function resolveRouteHost(ctx) {
    try {
        const web = ctx.get("webServer") ?? ctx.get("httpServer");
        return web ?? undefined;
    }
    catch {
        return undefined; // headless 等无 web 服务的组合里状态路由不可用，属可选能力
    }
}
export function apply(ctx, config) {
    // 1) 挂载 MCP 客户端：工具以 mcp__tabnexus__<tool> 注册进全局工具注册表
    ctx.plugin(mcpClient, {
        transport: "stdio",
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
    const registerStatusRoute = () => {
        const host = resolveRouteHost(ctx);
        if (!host)
            return;
        ctx.effect(() => host.register({
            kind: "exact",
            path: "/plugins/tabnexus/status",
            handler: async (_request, response) => {
                const bridgePort = config.bridgePort ?? 43119;
                let status;
                try {
                    const controller = new AbortController();
                    const timer = setTimeout(() => controller.abort(), 2000);
                    const health = await fetch(`http://127.0.0.1:${bridgePort}/health`, { signal: controller.signal, cache: "no-store" });
                    clearTimeout(timer);
                    const payload = (await health.json());
                    status = {
                        ok: health.status === 200,
                        bridgePort,
                        toolCount: payload.toolCount,
                        agentCount: payload.agentCount
                    };
                }
                catch (error) {
                    status = { ok: false, bridgePort, error: error instanceof Error ? error.message : "bridge unreachable" };
                }
                response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
                response.end(JSON.stringify({ plugin: "tabnexus", version: "0.1.0", slogan: "一切皆插件 —— 那浏览器里那 50 个 Tab，也该是。", ...status }));
            }
        }), "tabnexus: status route");
    };
    registerStatusRoute();
    // 面板数据路由：拉取工作区快照（任务 + 标签操作台）
    const registerWorkspaceRoute = () => {
        const host = resolveRouteHost(ctx);
        if (!host)
            return;
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
                const body = (await readRequestBody(request));
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
    ctx.on("internal/service", (serviceName) => {
        if (serviceName === "webServer" || serviceName === "httpServer") {
            registerStatusRoute();
            registerWorkspaceRoute();
        }
    });
}
