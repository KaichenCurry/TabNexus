export type AgentClient =
  | "codex"
  | "claude_desktop"
  | "claude_code"
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

export const MCP_BRIDGE_VERSION = "0.8.0" as const;
export const MCP_TOOL_COUNT = 17 as const;

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
    id: "claude_code",
    name: "Claude Code",
    icon: "⌘",
    availability: "local",
    officialDocs: "https://code.claude.com/docs/en/mcp"
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
    name: "TRAE Work",
    icon: "T",
    availability: "local",
    officialDocs: "https://docs.trae.ai/ide/model-context-protocol"
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
  entryPath: string,
  agentName: string,
  options: { includeType?: boolean } = {}
): StdioMcpServer {
  return {
    ...(options.includeType ? { type: "stdio" as const } : {}),
    command: "node",
    args: [entryPath],
    env: {
      TABNEXUS_AGENT_NAME: agentName,
      TABNEXUS_MCP_VERSION: MCP_BRIDGE_VERSION
    }
  };
}

export function createStandardMcpConfig(entryPath: string, agentName: string) {
  return {
    mcpServers: {
      tabnexus: createAgentServerConfig(entryPath, agentName)
    }
  };
}

export function createVsCodeMcpConfig(entryPath: string) {
  return {
    servers: {
      tabnexus: createAgentServerConfig(entryPath, "VS Code", { includeType: true })
    }
  };
}

function utf8Base64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary);
}

export function createCursorInstallUrl(entryPath: string) {
  const config = JSON.stringify(createAgentServerConfig(entryPath, "Cursor"));
  return `https://cursor.com/en/install-mcp?name=tabnexus&config=${encodeURIComponent(utf8Base64(config))}`;
}

export function createVsCodeInstallUrl(entryPath: string) {
  const config = JSON.stringify({
    name: "tabnexus",
    ...createAgentServerConfig(entryPath, "VS Code", { includeType: true })
  });
  const installTarget = `vscode:mcp/install?${encodeURIComponent(config)}`;
  return `https://insiders.vscode.dev/redirect?url=${encodeURIComponent(installTarget)}`;
}

export function createTraeInstallUrl(entryPath: string) {
  const config = JSON.stringify(createAgentServerConfig(entryPath, "TRAE Work"));
  return `trae://trae.ai-ide/mcp-import?type=stdio&name=TabNexus&config=${encodeURIComponent(utf8Base64(config))}`;
}

export function createClaudeCodeInstallPrompts(repositoryRoot: string) {
  return [
    `/plugin marketplace add ${repositoryRoot}`,
    "/plugin install tabnexus@tabnexus-local"
  ] as const;
}
