export type AgentClient =
  | "codex"
  | "claude_desktop"
  | "cursor"
  | "vscode"
  | "trae"
  | "coze";

export type AgentClientAvailability = "local" | "remote_required";

export type AgentClientDefinition = {
  id: AgentClient;
  name: string;
  icon: string;
  availability: AgentClientAvailability;
  officialDocs: string;
};

export type StdioMcpServer = {
  type?: "stdio";
  command: string;
  args: string[];
  env: Record<string, string>;
};

export type AgentServerSource = string | {
  kind: "release";
  version: string;
};

export const MCP_BRIDGE_VERSION = "0.8.0" as const;
export const MCP_TOOL_COUNT = 17 as const;
export const TABNEXUS_RELEASE_VERSION = "1.0.3" as const;
export const TABNEXUS_GITHUB_REPOSITORY = "KaichenCurry/TabNexus" as const;
export const TABNEXUS_CODEX_MARKETPLACE = "tabnexus" as const;

export function createReleasePackageUrl(version: string = TABNEXUS_RELEASE_VERSION) {
  return `https://github.com/${TABNEXUS_GITHUB_REPOSITORY}/releases/download/v${version}/tabnexus-mcp-runtime-${version}.tgz`;
}

export const AGENT_CLIENTS: readonly AgentClientDefinition[] = [
  {
    id: "codex",
    name: "Codex",
    icon: "C",
    availability: "local",
    officialDocs: "https://learn.chatgpt.com/docs/extend/mcp"
  },
  {
    id: "claude_desktop",
    name: "Claude Desktop",
    icon: "A",
    availability: "local",
    officialDocs: "https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop"
  },
  {
    id: "cursor",
    name: "Cursor",
    icon: "⌁",
    availability: "local",
    officialDocs: "https://docs.cursor.com/context/model-context-protocol"
  },
  {
    id: "vscode",
    name: "VS Code",
    icon: "V",
    availability: "local",
    officialDocs: "https://code.visualstudio.com/docs/agent-customization/mcp-servers"
  },
  {
    id: "trae",
    name: "TRAE CN",
    icon: "T",
    availability: "local",
    officialDocs: "https://docs.trae.cn/ide_mcp-server-install-links"
  },
  {
    id: "coze",
    name: "扣子 Coze",
    icon: "扣",
    availability: "remote_required",
    officialDocs: "https://www.coze.cn/overview"
  }
] as const;

export function createAgentServerConfig(
  source: AgentServerSource,
  agentName: string,
  options: { includeType?: boolean } = {}
): StdioMcpServer {
  const launcher = typeof source === "string"
    ? { command: "node", args: [source] }
    : {
        command: "npx",
        args: ["--yes", createReleasePackageUrl(source.version)]
      };
  return {
    ...(options.includeType ? { type: "stdio" as const } : {}),
    ...launcher,
    env: {
      TABNEXUS_AGENT_NAME: agentName,
      TABNEXUS_MCP_VERSION: MCP_BRIDGE_VERSION
    }
  };
}

export function createStandardMcpConfig(source: AgentServerSource, agentName: string) {
  return {
    mcpServers: {
      tabnexus: createAgentServerConfig(source, agentName)
    }
  };
}

export function createVsCodeMcpConfig(source: AgentServerSource) {
  return {
    servers: {
      tabnexus: createAgentServerConfig(source, "VS Code", { includeType: true })
    }
  };
}

function utf8Base64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary);
}

export function createCursorInstallUrl(source: AgentServerSource) {
  const config = JSON.stringify(createAgentServerConfig(source, "Cursor"));
  return `https://cursor.com/en/install-mcp?name=tabnexus&config=${encodeURIComponent(utf8Base64(config))}`;
}

export function createVsCodeInstallUrl(source: AgentServerSource) {
  const config = JSON.stringify({
    name: "tabnexus",
    ...createAgentServerConfig(source, "VS Code", { includeType: true })
  });
  const installTarget = `vscode:mcp/install?${encodeURIComponent(config)}`;
  return `https://insiders.vscode.dev/redirect?url=${encodeURIComponent(installTarget)}`;
}

export function createTraeInstallUrl(source: AgentServerSource) {
  const config = JSON.stringify(createAgentServerConfig(source, "TRAE CN"));
  return `trae-cn://trae.ai-ide/mcp-import?type=stdio&name=TabNexus&config=${encodeURIComponent(utf8Base64(config))}`;
}

export function createCodexInstallPrompt(version: string = TABNEXUS_RELEASE_VERSION) {
  return [
    "请帮我安装 TabNexus Codex 插件，并完成以下操作：",
    `1. 运行 codex plugin marketplace add ${TABNEXUS_GITHUB_REPOSITORY} --ref v${version}`,
    `2. 运行 codex plugin add tabnexus@${TABNEXUS_CODEX_MARKETPLACE}`,
    "3. 验证插件已出现在 Codex 的 Plugins 中，并告诉我安装结果。",
    "这是我主动请求的本机插件安装；如需执行命令，请直接执行。"
  ].join("\n");
}

export function createCodexInstallUrl(version: string = TABNEXUS_RELEASE_VERSION) {
  return `codex://threads/new?prompt=${encodeURIComponent(createCodexInstallPrompt(version))}`;
}

export function createReleaseServerSource(version: string = TABNEXUS_RELEASE_VERSION): AgentServerSource {
  return { kind: "release", version };
}

export function createCodexLauncherCommand(version: string = TABNEXUS_RELEASE_VERSION) {
  return `npx --yes ${createReleasePackageUrl(version)}`;
}
