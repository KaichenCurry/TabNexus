import { describe, expect, it } from "vitest";
import {
  AGENT_CLIENTS,
  MCP_BRIDGE_VERSION,
  MCP_TOOL_COUNT,
  createClaudeCodeInstallPrompts,
  createCursorInstallUrl,
  createStandardMcpConfig,
  createTraeInstallUrl,
  createVsCodeInstallUrl,
  createVsCodeMcpConfig
} from "../src/core/agentClients";

const entry = "/Applications/TabNexus/bridge/tabnexus-mcp.mjs";

describe("Agent client adapters", () => {
  it("publishes one capability version for every adapter", () => {
    expect(MCP_BRIDGE_VERSION).toBe("0.8.0");
    expect(MCP_TOOL_COUNT).toBe(17);
  });

  it("keeps the seven requested clients and exposes Coze as remote-only", () => {
    expect(AGENT_CLIENTS.map((client) => client.id)).toEqual([
      "codex",
      "claude_desktop",
      "claude_code",
      "cursor",
      "vscode",
      "trae",
      "coze"
    ]);
    expect(AGENT_CLIENTS.find((client) => client.id === "coze")?.availability).toBe("remote_required");
    expect(AGENT_CLIENTS.filter((client) => client.availability === "local")).toHaveLength(6);
  });

  it("generates the standard and VS Code config shapes from one stdio entry", () => {
    expect(createStandardMcpConfig(entry, "TRAE Work")).toEqual({
      mcpServers: {
        tabnexus: {
          command: "node",
          args: [entry],
          env: { TABNEXUS_AGENT_NAME: "TRAE Work", TABNEXUS_MCP_VERSION: "0.8.0" }
        }
      }
    });
    expect(createVsCodeMcpConfig(entry)).toEqual({
      servers: {
        tabnexus: {
          type: "stdio",
          command: "node",
          args: [entry],
          env: { TABNEXUS_AGENT_NAME: "VS Code", TABNEXUS_MCP_VERSION: "0.8.0" }
        }
      }
    });
  });

  it("uses each client's official deep-link shape", () => {
    const cursorUrl = createCursorInstallUrl(entry);
    const vsCodeUrl = createVsCodeInstallUrl(entry);
    const traeUrl = createTraeInstallUrl(entry);
    expect(cursorUrl).toMatch(/^https:\/\/cursor\.com\/en\/install-mcp\?name=tabnexus&config=/);
    expect(vsCodeUrl).toMatch(/^https:\/\/insiders\.vscode\.dev\/redirect\?url=vscode%3Amcp%2Finstall%3F/);
    expect(traeUrl).toMatch(/^trae:\/\/trae\.ai-ide\/mcp-import\?type=stdio&name=TabNexus&config=/);

    const cursorConfig = JSON.parse(Buffer.from(new URL(cursorUrl).searchParams.get("config") ?? "", "base64").toString("utf8"));
    expect(cursorConfig).toMatchObject({ command: "node", args: [entry], env: { TABNEXUS_AGENT_NAME: "Cursor", TABNEXUS_MCP_VERSION: "0.8.0" } });

    const vsCodeTarget = new URL(vsCodeUrl).searchParams.get("url") ?? "";
    expect(vsCodeTarget).toMatch(/^vscode:mcp\/install\?/);
    const vsCodeConfig = JSON.parse(decodeURIComponent(vsCodeTarget.slice(vsCodeTarget.indexOf("?") + 1)));
    expect(vsCodeConfig).toMatchObject({ name: "tabnexus", type: "stdio", command: "node", args: [entry] });

    const traeConfig = JSON.parse(Buffer.from(new URL(traeUrl).searchParams.get("config") ?? "", "base64").toString("utf8"));
    expect(traeConfig).toMatchObject({ command: "node", args: [entry], env: { TABNEXUS_AGENT_NAME: "TRAE Work", TABNEXUS_MCP_VERSION: "0.8.0" } });
  });

  it("installs Claude Code through its in-chat plugin marketplace", () => {
    expect(createClaudeCodeInstallPrompts("/Users/me/TabNexus")).toEqual([
      "/plugin marketplace add /Users/me/TabNexus",
      "/plugin install tabnexus@tabnexus-local"
    ]);
  });
});
