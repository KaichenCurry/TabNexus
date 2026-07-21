import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const manifest = JSON.parse(readFileSync("public/manifest.json", "utf8")) as Record<string, unknown>;
const pluginMarketplace = JSON.parse(readFileSync(".agents/plugins/marketplace.json", "utf8"));
const codexPlugin = JSON.parse(readFileSync("agent/plugins/tabnexus/.codex-plugin/plugin.json", "utf8"));
const codexMcp = JSON.parse(readFileSync("agent/plugins/tabnexus/.mcp.json", "utf8"));
const claudeCodeMarketplace = JSON.parse(readFileSync(".claude-plugin/marketplace.json", "utf8"));
const claudeCodePlugin = JSON.parse(readFileSync("agent/integrations/claude-code/.claude-plugin/plugin.json", "utf8"));
const claudeCodeMcp = JSON.parse(readFileSync("agent/integrations/claude-code/.mcp.json", "utf8"));

describe("MV3 manifest security surface", () => {
  it("uses the required standalone service worker architecture", () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.background).toEqual({ service_worker: "background.js", type: "module" });
    expect(manifest).not.toHaveProperty("chrome_url_overrides");
    expect(manifest).not.toHaveProperty("side_panel");
    expect(manifest.incognito).toBe("not_allowed");
  });

  it("keeps permissions and remote hosts intentionally narrow", () => {
    expect(manifest.permissions).toEqual(["tabs", "storage", "clipboardWrite"]);
    expect(manifest).not.toHaveProperty("optional_permissions");
    expect(manifest.host_permissions).toEqual([
      "https://api.deepseek.com/*",
      "https://api.openai.com/*",
      "https://api.anthropic.com/*",
      "https://api.moonshot.cn/*",
      "https://dashscope.aliyuncs.com/*",
      "https://api.minimaxi.com/*",
      "file:///*"
    ]);
    expect(manifest.content_security_policy).toEqual({
      extension_pages: "script-src 'self'; object-src 'self'; connect-src 'self' https://api.deepseek.com https://api.openai.com https://api.anthropic.com https://api.moonshot.cn https://dashscope.aliyuncs.com https://api.minimaxi.com ws://127.0.0.1:43119"
    });
    expect(JSON.stringify(manifest)).not.toContain("nativeMessaging");
    expect(JSON.stringify(manifest)).not.toContain("<all_urls>");
    expect(JSON.stringify(manifest)).not.toContain("downloads");
    expect(JSON.stringify(manifest)).not.toContain("webRequest");
    expect(manifest).not.toHaveProperty("content_scripts");
  });
});

describe("Codex plugin package", () => {
  it("uses the repository marketplace layout Codex can discover", () => {
    expect(pluginMarketplace.plugins).toContainEqual(expect.objectContaining({
      name: "tabnexus",
      source: { source: "local", path: "./agent/plugins/tabnexus" }
    }));
    expect(codexPlugin).toMatchObject({ name: "tabnexus", mcpServers: "./.mcp.json", skills: "./skills/" });
    expect(codexMcp.mcpServers.tabnexus).toMatchObject({
      command: "node",
      args: ["./server/index.mjs"],
      cwd: "."
    });
    expect(existsSync("agent/plugins/tabnexus/server/index.mjs")).toBe(true);
    expect(existsSync("agent/plugins/tabnexus/assets/icon.png")).toBe(true);
    expect(existsSync("agent/plugins/tabnexus/skills/tabnexus-mcp-evals/SKILL.md")).toBe(true);
    expect(existsSync("agent/plugins/tabnexus/skills/tabnexus-mcp-evals/scripts/run-evals.mjs")).toBe(true);
  });
});

describe("Claude Code plugin package", () => {
  it("uses the official marketplace and bundled MCP layout", () => {
    expect(claudeCodeMarketplace).toMatchObject({
      name: "tabnexus-local",
      plugins: [expect.objectContaining({ name: "tabnexus", version: "0.17.0", source: "./agent/integrations/claude-code" })]
    });
    expect(claudeCodePlugin).toMatchObject({ name: "tabnexus", version: "0.17.0" });
    expect(claudeCodeMcp.mcpServers.tabnexus).toMatchObject({
      command: "node",
      args: ["${CLAUDE_PLUGIN_ROOT}/server/index.mjs"]
    });
  });
});
