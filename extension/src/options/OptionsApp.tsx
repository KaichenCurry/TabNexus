import { useEffect, useState, type CSSProperties } from "react";
import { Logo } from "../components/Logo";
import {
  AGENT_CLIENTS,
  MCP_BRIDGE_VERSION,
  MCP_TOOL_COUNT,
  createClaudeCodeInstallPrompts,
  createCodexLauncherCommand,
  createCursorInstallUrl,
  createReleaseServerSource,
  createStandardMcpConfig,
  createTraeInstallUrl,
  createVsCodeInstallUrl,
  createVsCodeMcpConfig,
  type AgentClient
} from "../core/agentClients";
import { AI_PROVIDERS, AI_PROVIDER_IDS } from "../core/aiProviders";
import { isFileAccessAllowed, isExtensionRuntime, openExtensionDetails, sendBackgroundRequest } from "../core/platform";
import { loadSettings, saveSettings } from "../core/storage";
import type { AiProviderConfig, AiProviderId, BridgeConnectionStatus, DeepSeekErrorCode, GroupingPolicy, Settings } from "../core/types";

export function OptionsApp() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saved">("idle");
  const [keyState, setKeyState] = useState<"idle" | "testing" | "valid" | "invalid">("idle");
  const [keyMessage, setKeyMessage] = useState("");
  const [fileAccess, setFileAccess] = useState(false);
  const [bridgeStatus, setBridgeStatus] = useState<BridgeConnectionStatus>({
    state: "disconnected",
    transport: "agent_websocket",
    endpoint: "ws://127.0.0.1:43119/tabnexus"
  });
  const [bridgeBusy, setBridgeBusy] = useState(false);
  const [bridgeMessage, setBridgeMessage] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<AgentClient | null>(null);
  const [installStarted, setInstallStarted] = useState(false);

  useEffect(() => {
    void loadSettings().then(setSettings);
    void isFileAccessAllowed().then(setFileAccess);
    if (isExtensionRuntime) {
      void sendBackgroundRequest<BridgeConnectionStatus>({ type: "M3_BRIDGE_STATUS" }).then((response) => {
        if (response.ok) setBridgeStatus(response.data);
      });
    }
  }, []);

  useEffect(() => {
    if (!isExtensionRuntime || !settings?.agentBridgeEnabled) return;
    const refresh = () => {
      const type = bridgeStatus.state === "connected" ? "M3_BRIDGE_STATUS" : "M3_BRIDGE_CONNECT";
      void sendBackgroundRequest<BridgeConnectionStatus>({ type }).then((response) => {
        if (response.ok) setBridgeStatus(response.data);
      });
    };
    refresh();
    const timer = globalThis.setInterval(() => {
      refresh();
    }, 4_000);
    return () => globalThis.clearInterval(timer);
  }, [settings?.agentBridgeEnabled, bridgeStatus.state]);

  if (!settings) return <div className="loading-screen"><Logo /><p>Loading settings…</p></div>;
  const zh = settings.locale === "zh";
  const text = (cn: string, en: string) => zh ? cn : en;
  const activeProvider = AI_PROVIDERS[settings.aiProvider];
  const activeProviderConfig = settings.aiProviderConfigs[settings.aiProvider];
  const connectionError = (code: DeepSeekErrorCode | undefined, detail: string) => {
    switch (code) {
      case "timeout": return text("请求超时，请检查网络后重试", "Request timed out. Check your network and try again");
      case "network": return text(`无法连接 ${activeProvider.name}，请检查网络或代理设置`, `Unable to reach ${activeProvider.name}. Check your network or proxy`);
      case "auth": return text("API key 无效或已被撤销", "The API key is invalid or revoked");
      case "balance": return text(`${activeProvider.name} 账户余额不足`, `The ${activeProvider.name} account has insufficient balance`);
      case "rate_limit": return text("请求过于频繁，请稍后重试", "Too many requests. Try again shortly");
      case "server": return text(`${activeProvider.name} 服务暂时异常，请稍后重试`, `${activeProvider.name} is temporarily unavailable`);
      case "model": return text(`当前账户无法使用 ${activeProviderConfig.model}`, `${activeProviderConfig.model} is unavailable for this account`);
      case "invalid_request": return text(`${activeProvider.name} 拒绝了请求参数，请检查模型名称`, `${activeProvider.name} rejected the request. Check the model name`);
      case "invalid_response": return text(`${activeProvider.name} 返回了无法解析的结果，请重试`, `${activeProvider.name} returned an invalid response. Try again`);
      default: return detail || text("连接失败，请重试", "Connection failed. Try again");
    }
  };
  const aiReady = Boolean(settings.aiEnabled && activeProviderConfig.apiKey.trim());
  const aiVerified = Boolean(activeProviderConfig.verifiedAt);

  const update = async (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    await saveSettings(next);
    setSaveState("saved");
    window.setTimeout(() => setSaveState("idle"), 1_500);
  };

  const updateProviderConfig = async (provider: AiProviderId, patch: Partial<AiProviderConfig>) => {
    const nextConfig = { ...settings.aiProviderConfigs[provider], ...patch };
    const invalidatesVerification = "apiKey" in patch || "model" in patch || patch.verifiedAt === "";
    const legacyPatch = provider === "deepseek" ? {
      deepSeekApiKey: nextConfig.apiKey,
      deepSeekModel: "deepseek-v4-flash" as const,
      deepSeekVerifiedAt: nextConfig.verifiedAt,
      deepSeekEnabled: invalidatesVerification ? false : settings.aiEnabled
    } : {};
    await update({
      aiProviderConfigs: { ...settings.aiProviderConfigs, [provider]: nextConfig },
      ...(invalidatesVerification ? { aiEnabled: false } : {}),
      ...legacyPatch
    });
  };

  const selectProvider = async (provider: AiProviderId) => {
    setKeyState("idle");
    setKeyMessage("");
    await update({ aiProvider: provider, aiEnabled: false, deepSeekEnabled: false });
  };

  const testKey = async () => {
    const normalizedKey = activeProviderConfig.apiKey.trim();
    if (!normalizedKey) {
      setKeyState("invalid");
      setKeyMessage(text("请输入 API key", "Enter an API key"));
      return;
    }
    setKeyState("testing");
    setKeyMessage("");
    const response = await sendBackgroundRequest<{ model: string }>({
      type: "VALIDATE_KEY",
      provider: settings.aiProvider,
      apiKey: normalizedKey,
      model: activeProviderConfig.model
    });
    setKeyState(response.ok ? "valid" : "invalid");
    if (response.ok) {
      setKeyMessage(text(`真实 JSON 请求成功，${activeProvider.name} 已启用`, `Live JSON request succeeded. ${activeProvider.name} is enabled`));
      const verifiedAt = new Date().toISOString();
      await update({
        aiProviderConfigs: {
          ...settings.aiProviderConfigs,
          [settings.aiProvider]: { ...activeProviderConfig, apiKey: normalizedKey, verifiedAt }
        },
        aiEnabled: true,
        deepSeekApiKey: settings.aiProvider === "deepseek" ? normalizedKey : settings.deepSeekApiKey,
        deepSeekVerifiedAt: settings.aiProvider === "deepseek" ? verifiedAt : settings.deepSeekVerifiedAt,
        deepSeekEnabled: settings.aiProvider === "deepseek"
      });
    } else {
      setKeyMessage(connectionError(response.code, response.error));
      await update({
        aiProviderConfigs: {
          ...settings.aiProviderConfigs,
          [settings.aiProvider]: { ...activeProviderConfig, verifiedAt: "" }
        },
        aiEnabled: false,
        deepSeekVerifiedAt: settings.aiProvider === "deepseek" ? "" : settings.deepSeekVerifiedAt,
        deepSeekEnabled: false
      });
    }
  };

  const selectedClient = selectedAgent ? AGENT_CLIENTS.find((client) => client.id === selectedAgent) ?? null : null;
  const agentServerSource = __TABNEXUS_PORTABLE_BUILD__
    ? createReleaseServerSource()
    : __TABNEXUS_LOCAL_MCP_ENTRY__;
  const standardClientConfig = JSON.stringify(createStandardMcpConfig(agentServerSource, "TRAE Work"), null, 2);
  const vsCodeClientConfig = JSON.stringify(createVsCodeMcpConfig(agentServerSource), null, 2);
  const cursorInstallUrl = createCursorInstallUrl(agentServerSource);
  const vsCodeInstallUrl = createVsCodeInstallUrl(agentServerSource);
  const traeInstallUrl = createTraeInstallUrl(agentServerSource);
  const claudeCodePrompts = createClaudeCodeInstallPrompts(__TABNEXUS_PORTABLE_BUILD__ ? "KaichenCurry/TabNexus" : __TABNEXUS_REPO_ROOT__);
  const codexInstallUrl = __TABNEXUS_PORTABLE_BUILD__
    ? "codex://settings"
    : `codex://plugins/tabnexus?marketplacePath=${encodeURIComponent(__TABNEXUS_CODEX_MARKETPLACE__)}`;
  const codexLauncherCommand = createCodexLauncherCommand();
  const claudeBundleUrl = isExtensionRuntime
    ? chrome.runtime.getURL("agent/tabnexus-claude.mcpb")
    : "/agent/tabnexus-claude.mcpb";
  const readOnlyTestPrompt = text(
    "请使用 TabNexus MCP：先列出可用资源，再读取当前工作区和当前窗口标签。不要修改任何内容。告诉我工作区名称、已保存卡片数、当前支持的标签数和 revision。",
    "Use the TabNexus MCP: list available resources, then read the current workspace and current-window tabs. Do not change anything. Tell me the workspace name, saved-card count, supported-tab count, and revision."
  );
  const bridgeErrorText = (error: BridgeConnectionStatus["error"]) => {
    if (error === "agent_offline") return text("尚未检测到 Agent。请先在下方选择并启动一个 Agent。", "No Agent detected yet. Choose and start one below.");
    if (error === "port_conflict") return text("检测到旧版单连接服务，请重启已打开的 Agent 后重试", "A legacy single-client bridge is running. Restart open Agents and try again");
    if (error === "host_disconnected") return text("Agent 已退出，重新打开后会自动连接", "The Agent quit. It reconnects after you reopen it");
    if (error === "unsupported") return text("当前 Chrome 版本不支持本地 Agent 连接", "This Chrome version cannot connect to a local Agent");
    return text("暂时无法连接 Agent", "Unable to connect to the Agent right now");
  };
  const connectBridge = async () => {
    if (!isExtensionRuntime) {
      setBridgeMessage(text("请在 Chrome 扩展中检测 Agent", "Detect the Agent from the Chrome extension"));
      return;
    }
    setBridgeBusy(true);
    setBridgeMessage("");
    try {
      await update({ agentBridgeEnabled: true });
      setBridgeStatus({ state: "connecting", transport: "agent_websocket", endpoint: "ws://127.0.0.1:43119/tabnexus" });
      const response = await sendBackgroundRequest<BridgeConnectionStatus>({ type: "M3_BRIDGE_CONNECT" });
      if (!response.ok) {
        setBridgeMessage(response.error);
        return;
      }
      setBridgeStatus(response.data);
      setBridgeMessage(response.data.state === "connected"
        ? text(`${response.data.agentName ?? "Agent"} 已连接。现在可以直接在 Agent 对话中使用 TabNexus。`, `${response.data.agentName ?? "Agent"} is connected. Use TabNexus directly in the Agent chat.`)
        : bridgeErrorText(response.data.error));
    } finally {
      setBridgeBusy(false);
    }
  };
  const disconnectBridge = async () => {
    if (!isExtensionRuntime) return;
    setBridgeBusy(true);
    try {
      const response = await sendBackgroundRequest<BridgeConnectionStatus>({ type: "M3_BRIDGE_DISCONNECT" });
      if (response.ok) setBridgeStatus(response.data);
      await update({ agentBridgeEnabled: false });
      setBridgeMessage(text("已停止接受本机 Agent 连接", "Local Agent connections are turned off"));
    } finally {
      setBridgeBusy(false);
    }
  };
  const copyBridgeValue = async (value: string, label: "codex" | "trae" | "vscode" | "claude_code_1" | "claude_code_2" | "read") => {
    await navigator.clipboard.writeText(value);
    const messages = {
      codex: text("Codex 启动命令已复制。设置打开后进入 MCP Servers，新增 TabNexus 并粘贴即可。", "The Codex launch command is copied. In Settings, open MCP Servers, add TabNexus, and paste it."),
      trae: text("TRAE 配置已复制。打开 MCP 管理页，选择手动添加并粘贴。", "TRAE config copied. Open MCP management, choose manual setup, and paste it."),
      vscode: text("VS Code 配置已复制。若一键安装未打开，可粘贴到 MCP 用户配置。", "VS Code config copied. If one-click install did not open, paste it into the MCP user configuration."),
      claude_code_1: text("第 1 句已复制。粘贴到 Claude Code 对话并发送，然后再复制第 2 句。", "Step 1 copied. Paste it into Claude Code and send it, then copy step 2."),
      claude_code_2: text("第 2 句已复制。粘贴并发送，安装完成后新建对话。", "Step 2 copied. Paste and send it, then start a new chat after installation."),
      read: text("测试问题已复制。回到 AI 助手，新建对话并粘贴。", "Test question copied. Return to your AI assistant, start a new chat, and paste it.")
    };
    setBridgeMessage(messages[label]);
  };
  const prepareAgentConnection = async () => {
    setInstallStarted(true);
    if (!settings.agentBridgeEnabled) await update({ agentBridgeEnabled: true });
  };
  const copyTraeSetup = async () => {
    await prepareAgentConnection();
    await copyBridgeValue(standardClientConfig, "trae");
  };
  const prepareCodexConnection = async () => {
    await prepareAgentConnection();
    if (__TABNEXUS_PORTABLE_BUILD__) await copyBridgeValue(codexLauncherCommand, "codex");
  };

  const clientDescription = (client: AgentClient) => ({
    codex: text("OpenAI 桌面端 / CLI", "OpenAI desktop / CLI"),
    claude_desktop: text("桌面扩展包", "Desktop extension"),
    claude_code: text("Claude 编程 Agent", "Claude coding agent"),
    cursor: text("代码编辑器", "Code editor"),
    vscode: text("GitHub Copilot Agent", "GitHub Copilot Agent"),
    trae: text("IDE / SOLO", "IDE / SOLO"),
    coze: text("远程连接 · 待发布", "Remote connector · upcoming")
  })[client];

  const setupDescription = (client: AgentClient) => ({
    codex: __TABNEXUS_PORTABLE_BUILD__
      ? text("会直接打开本机 Codex 设置，并复制 TabNexus 启动命令；在 MCP Servers 中新增并粘贴即可。", "This opens local Codex Settings and copies the TabNexus launch command. Add it under MCP Servers and paste.")
      : text("Codex 打开后点击“安装”。", "When Codex opens, click Install."),
    claude_desktop: text("下载后双击 .mcpb 文件，再在 Claude 中确认安装。", "Double-click the downloaded .mcpb file, then confirm in Claude."),
    claude_code: text("不用退出 Claude Code。把下面两句依次粘贴到当前对话并发送。", "Stay in Claude Code. Paste and send the two prompts below, one at a time."),
    cursor: text("Cursor 打开安装页后点击“Install”。", "When Cursor opens the install page, click Install."),
    vscode: text("VS Code 打开 MCP 安装页后点击“Install”。", "When VS Code opens the MCP install page, click Install."),
    trae: text("TRAE 打开导入窗口后核对配置，再点击“添加”。", "Review the configuration in TRAE, then click Add."),
    coze: text("扣子目前没有官方本地 stdio MCP 客户端，不能直接读取这台电脑上的 Chrome 工作区。", "Coze currently has no official local stdio MCP client, so it cannot directly read this computer's Chrome workspace.")
  })[client];

  const installMethodLabel = (client: AgentClient) => ({
    codex: __TABNEXUS_PORTABLE_BUILD__ ? text("打开设置", "Open settings") : text("一键安装", "One-click"),
    claude_desktop: text("扩展包", "Extension package"),
    claude_code: text("对话内安装", "Install in chat"),
    cursor: text("一键安装", "One-click"),
    vscode: text("一键安装", "One-click"),
    trae: text("一键导入", "One-click import"),
    coze: text("即将支持", "Coming soon")
  })[client];

  const connectedAgentNames = bridgeStatus.agentNames?.length
    ? bridgeStatus.agentNames
    : bridgeStatus.agentName ? [bridgeStatus.agentName] : [];
  const selectedAgentConnectionNames = selectedAgent ? ({
    codex: ["Codex"],
    claude_desktop: ["Claude", "Claude Desktop"],
    claude_code: ["Claude Code"],
    cursor: ["Cursor"],
    vscode: ["VS Code"],
    trae: ["TRAE Work", "TRAE"],
    coze: ["扣子 Coze", "Coze"]
  } satisfies Record<AgentClient, string[]>)[selectedAgent] : [];
  const selectedAgentConnected = bridgeStatus.state === "connected" && selectedAgentConnectionNames.some((name) => connectedAgentNames.includes(name));
  const bridgeNeedsUpdate = bridgeStatus.state === "connected" && bridgeStatus.hostVersion !== MCP_BRIDGE_VERSION;

  const backToWorkspace = () => {
    if (isExtensionRuntime) globalThis.location.href = chrome.runtime.getURL("workspace.html");
    else globalThis.location.href = "/workspace.html";
  };

  return (
    <div className="options-page">
      <header className="options-header">
        <Logo />
        <button className="button secondary" type="button" onClick={backToWorkspace}>← {text("返回工作台", "Back to workspace")}</button>
      </header>
      <main className="options-content">
        <div className="options-title">
          <div><span className="rail-eyebrow">TABNEXUS</span><h1>{text("设置", "Settings")}</h1></div>
          {saveState === "saved" && <span className="saved-badge">✓ {text("已保存", "Saved")}</span>}
        </div>

        <section className="settings-card">
          <div className="setting-copy">
            <h2>{text("界面语言", "Interface language")}</h2>
            <p>{text("工作台与设置文案会立即切换。", "Workspace and settings copy switches immediately.")}</p>
          </div>
          <div className="locale-switch large">
            <button className={zh ? "active" : ""} type="button" onClick={() => void update({ locale: "zh" })}>中文</button>
            <button className={!zh ? "active" : ""} type="button" onClick={() => void update({ locale: "en" })}>English</button>
          </div>
        </section>

        <div className="settings-section-heading">
          <span>01 · {text("工作台智能", "WORKSPACE AI")}</span>
          <h2>{text("选择你的整理模型", "Choose your organizing model")}</h2>
          <p>{text("用于标签分类、整理指令和关系建议；与下方的外部 Agent 连接互不影响。", "Powers tab grouping, organizing instructions, and relationship suggestions; independent from external Agent connections below.")}</p>
        </div>

        <section className="settings-card vertical ai-provider-settings-card">
          <div className="provider-selector" aria-label={text("AI 供应商", "AI providers")}>
            {AI_PROVIDER_IDS.map((providerId) => {
              const provider = AI_PROVIDERS[providerId];
              const configured = Boolean(settings.aiProviderConfigs[providerId].apiKey);
              const selected = settings.aiProvider === providerId;
              return (
                <button
                  key={providerId}
                  className={`provider-option ${selected ? "selected" : ""}`}
                  style={{ "--provider-accent": provider.accent } as CSSProperties}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => void selectProvider(providerId)}
                >
                  <span className="provider-mark">{provider.mark}</span>
                  <span><strong>{provider.name}</strong><small>{configured ? text("已保存密钥", "Key saved") : provider.defaultModel}</small></span>
                  <i aria-hidden="true">{selected ? "✓" : ""}</i>
                </button>
              );
            })}
          </div>

          <div className="provider-config-shell">
            <div className="provider-config-header">
              <div className="provider-config-identity">
                <span className="provider-mark large" style={{ "--provider-accent": activeProvider.accent } as CSSProperties}>{activeProvider.mark}</span>
                <div>
                  <small>{text("当前整理模型", "ACTIVE ORGANIZING MODEL")}</small>
                  <div className="setting-heading-with-state">
                    <h3>{activeProvider.name}</h3>
                    <span className={`ai-config-state ${aiReady && aiVerified ? "connected" : aiReady ? "configured" : "local"}`}>
                      <i />{aiReady
                        ? aiVerified
                          ? text("已验证并启用", "Verified & enabled")
                          : text("已配置 · 建议验证", "Configured · test recommended")
                        : aiVerified
                          ? text("已验证 · 已关闭", "Verified · disabled")
                          : text("未验证 · 本地模式", "Unverified · local mode")}
                    </span>
                  </div>
                </div>
              </div>
              <label className="switch" title={!activeProviderConfig.apiKey.trim() ? text("请先输入密钥", "Enter a key first") : undefined}>
                <input
                  type="checkbox"
                  checked={settings.aiEnabled}
                  disabled={!activeProviderConfig.apiKey.trim()}
                  onChange={(event) => void update({
                    aiEnabled: event.target.checked,
                    deepSeekEnabled: settings.aiProvider === "deepseek" && event.target.checked
                  })}
                />
                <span />
              </label>
            </div>

            <div className="provider-config-grid">
              <label className="field provider-key-field">
                <span>{activeProvider.name} API key</span>
                <div className="key-row">
                  <input
                    type="password"
                    value={activeProviderConfig.apiKey}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={activeProvider.keyPlaceholder}
                    onChange={(event) => {
                      setKeyState("idle");
                      setKeyMessage("");
                      const apiKey = event.target.value;
                      void update({
                        aiProviderConfigs: {
                          ...settings.aiProviderConfigs,
                          [settings.aiProvider]: { ...activeProviderConfig, apiKey, verifiedAt: "" }
                        },
                        aiEnabled: false,
                        deepSeekApiKey: settings.aiProvider === "deepseek" ? apiKey : settings.deepSeekApiKey,
                        deepSeekVerifiedAt: settings.aiProvider === "deepseek" ? "" : settings.deepSeekVerifiedAt,
                        deepSeekEnabled: false
                      });
                    }}
                  />
                  <button className="button primary provider-test-button" type="button" disabled={keyState === "testing"} onClick={() => void testKey()}>
                    {keyState === "testing" ? text("验证中…", "Testing…") : text("验证连接", "Test connection")}
                  </button>
                </div>
                {keyState !== "idle" && <small className={keyState === "valid" ? "field-success" : keyState === "invalid" ? "field-error" : ""}>{keyMessage}</small>}
              </label>
              <label className="field">
                <span>{text("模型", "Model")}</span>
                <input
                  list={`${settings.aiProvider}-models`}
                  value={activeProviderConfig.model}
                  spellCheck={false}
                  onChange={(event) => void updateProviderConfig(settings.aiProvider, { model: event.target.value, verifiedAt: "" })}
                />
                <datalist id={`${settings.aiProvider}-models`}>
                  {activeProvider.suggestedModels.map((model) => <option key={model} value={model} />)}
                </datalist>
              </label>
              <label className="field">
                <span>{text("应用方式", "Apply changes")}</span>
                <select value={settings.groupingPolicy} onChange={(event) => void update({ groupingPolicy: event.target.value as GroupingPolicy })}>
                  <option value="suggestion">{text("先看预览，再确认", "Preview before applying")}</option>
                  <option value="automatic">{text("自动应用，可撤销", "Automatic, undoable")}</option>
                  <option value="domain">{text("只用本地域名分组", "Local domain grouping only")}</option>
                </select>
              </label>
            </div>

            <div className="provider-config-footer">
              <span>✓</span>
              <p><strong>{text("只在你主动整理时调用", "Called only when you organize")}</strong>{text("仅发送本次整理所需的任务元数据（如 ID、标题、URL、类型、分组、进度和时间）；不发送网页正文或卡片备注。密钥保存在本机扩展存储中，并非操作系统级加密。", "Only task metadata required for this organization (such as IDs, titles, URLs, types, groups, progress, and timestamps) is sent; page bodies and card notes are not. Keys stay in local extension storage and are not OS-level encrypted.")}</p>
              <span className="provider-flow-hint">{text("选择标签 → 描述意图 → 预览 → 应用", "Select tabs → Describe intent → Preview → Apply")}</span>
            </div>
          </div>
        </section>

        <div className="settings-section-heading agent-section-heading">
          <span>02 · {text("外部协作", "AGENT COLLABORATION")}</span>
          <h2>{text("连接你常用的 Agent", "Connect your everyday Agent")}</h2>
          <p>{text("让 Codex、Claude、Cursor 等搜索和管理多工作区、整理资料、调整关系图，并安全保存或重开浏览器标签；无需使用上方的模型 API。", "Let Codex, Claude, Cursor, and others search and manage workspaces, organize sources, arrange relationship maps, and safely save or reopen browser tabs; no model API above is required.")}</p>
        </div>

        <section className="settings-card vertical bridge-settings-card">
          <div className="setting-copy">
            <div className="setting-title-line">
              <span className="bridge-symbol" aria-hidden="true">↗</span>
              <div>
                <div className="setting-heading-with-state">
                  <h2>{text("本机 Agent 连接", "Local Agent connection")}</h2>
                  <span className={`bridge-config-state ${bridgeNeedsUpdate ? "outdated" : bridgeStatus.state === "error" ? "disconnected" : bridgeStatus.state}`}>
                    <i />{bridgeStatus.state === "connected"
                      ? bridgeNeedsUpdate
                        ? text(`MCP ${bridgeStatus.hostVersion ?? "旧版"} · 需要更新`, `MCP ${bridgeStatus.hostVersion ?? "old"} · Update required`)
                        : bridgeStatus.agentCount && bridgeStatus.agentCount > 1
                        ? text(`${bridgeStatus.agentCount} 个 Agent 已连接`, `${bridgeStatus.agentCount} Agents connected`)
                        : text("1 个 Agent 已连接", "1 Agent connected")
                      : bridgeStatus.state === "connecting"
                        ? text("正在检测", "Detecting")
                        : text("尚未连接", "Not connected")}
                  </span>
                </div>
                <p>{text("可同时连接多个本机 Agent；支持工作区、分组、卡片、关系图和当前窗口标签管理。", "Connect multiple local Agents at once, with workspace, group, card, relationship-map, and current-window tab management.")}</p>
              </div>
            </div>
          </div>

          {bridgeNeedsUpdate && <div className="bridge-update-notice" role="alert">
            <span aria-hidden="true">↻</span>
            <div>
              <strong>{text("Agent 仍在运行旧版 MCP", "An Agent is still running an older MCP")}</strong>
              <p>{text(
                `当前共享连接是 ${bridgeStatus.hostVersion ?? "未知版本"}，完整的 ${MCP_TOOL_COUNT} 项能力需要 ${MCP_BRIDGE_VERSION}。重新安装后，请完全退出所有正在使用 TabNexus 的 Agent，再重新打开。`,
                `The shared bridge is ${bridgeStatus.hostVersion ?? "unknown"}; all ${MCP_TOOL_COUNT} capabilities require ${MCP_BRIDGE_VERSION}. Reinstall, fully quit every Agent using TabNexus, then reopen them.`
              )}</p>
            </div>
          </div>}

          {!selectedAgent ? (
            <div className="agent-picker">
              {__TABNEXUS_PORTABLE_BUILD__ && <div className="bridge-update-notice" role="note">
                <span aria-hidden="true">✓</span>
                <div>
                  <strong>{text("安装包已包含本机 Agent 接入", "Local Agent setup is included")}</strong>
                  <p>{text("选择下方应用即可打开对应安装入口；无需下载源码，也不会再跳转到 GitHub 教程。", "Choose an app below to open its installer. No source checkout and no GitHub tutorial detour.")}</p>
                </div>
              </div>}
              <div className="agent-picker-toolbar">
                <div>
                  <strong>{text("选择要连接的应用", "Choose an app to connect")}</strong>
                  <span>{text("点击后只显示该应用的最快安装步骤。", "Open the shortest supported setup for that app.")}</span>
                </div>
                {connectedAgentNames.length > 0 && <div className="connected-agent-summary">
                  <span>{text("当前在线", "ONLINE NOW")}</span>
                  <div>{connectedAgentNames.map((name) => <b key={name}><i />{name}</b>)}</div>
                </div>}
              </div>
              <div className="agent-app-group">
                <div className="agent-app-group-title"><span>{text("桌面与 IDE", "DESKTOP & IDE")}</span><b>{text("6 个可用", "6 available")}</b></div>
                <div className="agent-client-grid">
                  {AGENT_CLIENTS.filter(({ availability }) => availability === "local").map(({ id, icon, name, availability }) => (
                    <button
                      className={`agent-client-card ${id}`}
                      type="button"
                      key={id}
                      onClick={() => { setSelectedAgent(id); setInstallStarted(false); setBridgeMessage(""); }}
                    >
                      <span className="agent-client-logo" aria-hidden="true">{icon}</span>
                      <span><strong>{name}</strong><small>{clientDescription(id)}</small></span>
                      <span className={`agent-method-chip ${availability}`}>{installMethodLabel(id)}</span>
                      <b className="agent-card-chevron" aria-hidden="true">›</b>
                    </button>
                  ))}
                </div>
              </div>
              <div className="agent-app-group cloud">
                <div className="agent-app-group-title"><span>{text("云端 Agent", "CLOUD AGENT")}</span><b>{text("规划中", "Planned")}</b></div>
                {AGENT_CLIENTS.filter(({ availability }) => availability === "remote_required").map(({ id, icon, name, availability }) => (
                  <button
                    className={`agent-client-card agent-cloud-card ${id}`}
                    type="button"
                    key={id}
                    onClick={() => { setSelectedAgent(id); setInstallStarted(false); setBridgeMessage(""); }}
                  >
                    <span className="agent-client-logo" aria-hidden="true">{icon}</span>
                    <span><strong>{name}</strong><small>{clientDescription(id)}</small></span>
                    <span className={`agent-method-chip ${availability}`}>{installMethodLabel(id)}</span>
                    <b className="agent-card-chevron" aria-hidden="true">›</b>
                  </button>
                ))}
              </div>
              <div className="bridge-safety-line"><span aria-hidden="true">✓</span>{text("本地连接 · 无需终端 · 工作区不会经过 TabNexus 云端", "Local connection · No terminal · Workspace data never passes through a TabNexus cloud")}</div>
            </div>
          ) : selectedClient ? (
            <div className={`agent-setup-panel ${selectedAgent}`}>
              <div className="agent-setup-nav">
                <button className="agent-setup-back" type="button" onClick={() => { setSelectedAgent(null); setInstallStarted(false); setBridgeMessage(""); }}>← {text("所有 Agent", "All Agents")}</button>
                <a href={selectedClient.officialDocs} target="_blank" rel="noreferrer">{text("官方接入说明", "Official setup guide")} ↗</a>
              </div>
              <div className="agent-setup-title">
                <span className="agent-client-logo" aria-hidden="true">{selectedClient.icon}</span>
                <div>
                  <small>{text("连接应用", "CONNECT APP")}</small>
                  <strong>{text("把 TabNexus 添加到", "Add TabNexus to")} {selectedClient.name}</strong>
                  <span>{selectedClient.availability === "local"
                    ? text("只需安装一次，以后打开 Agent 就会自动连接。", "Install once. TabNexus reconnects whenever the Agent opens.")
                    : text("已保留适配入口，需远程网关发布后启用。", "Adapter reserved; it activates after the remote gateway is published.")}</span>
                </div>
                <span className={`agent-method-chip ${selectedClient.availability}`}>{installMethodLabel(selectedAgent)}</span>
              </div>

              {selectedAgent === "coze" ? (
                <div className="agent-remote-panel">
                  <span className="agent-remote-icon" aria-hidden="true">↗</span>
                  <div>
                    <span className="agent-card-kicker">{text("远程连接", "REMOTE CONNECTION")}</span>
                    <strong>{text("为什么现在不能直接连接", "Why direct connection is unavailable")}</strong>
                    <p>{setupDescription("coze")}</p>
                    <p>{text("本地工作区不会为适配而上传。待安全的 HTTPS MCP 网关发布后，这里会升级为一键连接。", "Local workspaces will not be uploaded as a workaround. This becomes one-click after the secure HTTPS MCP gateway ships.")}</p>
                    <a className="button secondary agent-install-button" href={selectedClient.officialDocs} target="_blank" rel="noreferrer">{text("了解扣子 MCP", "Explore Coze MCP")}</a>
                  </div>
                </div>
              ) : <>
                <div className={`agent-connect-progress ${selectedAgentConnected ? "complete" : installStarted ? "started" : ""}`} aria-label={text("连接进度", "Connection progress")}>
                  <div className={selectedAgentConnected || installStarted ? "done" : "active"}><span>{selectedAgentConnected || installStarted ? "✓" : "1"}</span><div><b>{text("安装", "Install")}</b><small>{text("添加 TabNexus", "Add TabNexus")}</small></div></div>
                  <i />
                  <div className={selectedAgentConnected ? "done" : installStarted ? "active" : ""}><span>{selectedAgentConnected ? "✓" : "2"}</span><div><b>{text("连接", "Connect")}</b><small>{text("保持 Agent 打开", "Keep Agent open")}</small></div></div>
                  <i />
                  <div className={selectedAgentConnected ? "done" : ""}><span>{selectedAgentConnected ? "✓" : "3"}</span><div><b>{text("开始使用", "Start using")}</b><small>{text("在对话中调用", "Use it in chat")}</small></div></div>
                </div>

                <div className="agent-connect-grid">
                  <div className="agent-connect-action-card">
                    <span className="agent-card-kicker">{installStarted ? text("安装已打开", "INSTALLER OPENED") : text("下一步", "NEXT")}</span>
                    <strong>{selectedAgent === "claude_code" ? text("把两条指令发给 Claude Code", "Send two prompts to Claude Code") : text(`在 ${selectedClient.name} 中安装`, `Install in ${selectedClient.name}`)}</strong>
                    <p>{setupDescription(selectedAgent)}</p>
                    {selectedAgent === "codex" && <a className="button primary agent-install-button" href={codexInstallUrl} onClick={() => void prepareCodexConnection()}>{bridgeNeedsUpdate
                      ? text("更新 Codex 连接", "Update Codex connection")
                      : __TABNEXUS_PORTABLE_BUILD__
                        ? text("打开 Codex 设置", "Open Codex settings")
                        : text("在 Codex 中安装", "Install in Codex")}</a>}
                    {selectedAgent === "claude_desktop" && <a className="button primary agent-install-button" href={claudeBundleUrl} download="TabNexus.mcpb" onClick={() => void prepareAgentConnection()}>{bridgeNeedsUpdate ? text("下载新版 Claude 扩展", "Download updated Claude extension") : text("下载 Claude 扩展包", "Download Claude extension")}</a>}
                    {selectedAgent === "claude_code" && <div className="agent-prompt-install">
                      <button type="button" onClick={() => void prepareAgentConnection().then(() => copyBridgeValue(claudeCodePrompts[0], "claude_code_1"))}><span>1</span><code>{claudeCodePrompts[0]}</code><b>{text("复制", "Copy")}</b></button>
                      <button type="button" onClick={() => void prepareAgentConnection().then(() => copyBridgeValue(claudeCodePrompts[1], "claude_code_2"))}><span>2</span><code>{claudeCodePrompts[1]}</code><b>{text("复制", "Copy")}</b></button>
                    </div>}
                    {selectedAgent === "cursor" && <a className="button primary agent-install-button" href={cursorInstallUrl} target="_blank" rel="noreferrer" onClick={() => void prepareAgentConnection()}>{text("在 Cursor 中安装", "Install in Cursor")}</a>}
                    {selectedAgent === "vscode" && <div className="agent-install-actions">
                      <a className="button primary agent-install-button" href={vsCodeInstallUrl} target="_blank" rel="noreferrer" onClick={() => void prepareAgentConnection()}>{text("在 VS Code 中安装", "Install in VS Code")}</a>
                      <button className="text-button" type="button" onClick={() => void prepareAgentConnection().then(() => copyBridgeValue(vsCodeClientConfig, "vscode"))}>{text("复制配置", "Copy config")}</button>
                    </div>}
                    {selectedAgent === "trae" && <div className="agent-install-actions">
                      <a className="button primary agent-install-button" href={traeInstallUrl} onClick={() => void prepareAgentConnection()}>{text("在 TRAE 中安装", "Install in TRAE")}</a>
                      <button className="text-button" type="button" onClick={() => void copyTraeSetup()}>{text("无法打开？复制配置", "Copy config instead")}</button>
                    </div>}
                  </div>

                  <div className={`agent-connect-status-card ${selectedAgentConnected ? "connected" : installStarted ? "listening" : ""}`}>
                    <span className="agent-card-kicker">{text("连接状态", "CONNECTION")}</span>
                    <div className="agent-status-title"><i /><strong>{selectedAgentConnected
                      ? text(`${selectedClient.name} 已连接`, `${selectedClient.name} connected`)
                      : installStarted
                        ? text(`正在等待 ${selectedClient.name}`, `Waiting for ${selectedClient.name}`)
                        : text("安装后自动连接", "Connects after install")}</strong></div>
                    <p>{selectedAgentConnected
                      ? connectedAgentNames.length > 1
                        ? text(`当前同时连接：${connectedAgentNames.join("、")}。`, `Connected now: ${connectedAgentNames.join(", ")}.`)
                        : text(`${selectedClient.name} 已获得本机工作区访问权限。`, `${selectedClient.name} can now access this local workspace.`)
                      : installStarted
                        ? text(`保持 ${selectedClient.name} 打开，TabNexus 会自动发现它。`, `Keep ${selectedClient.name} open and TabNexus will detect it automatically.`)
                        : text("完成左侧安装并打开 Agent，通常几秒内即可连接。", "Complete the install and open the Agent. Detection usually takes a few seconds.")}</p>
                    {selectedAgentConnected
                      ? <button className="text-button" type="button" disabled={bridgeBusy} onClick={() => void disconnectBridge()}>{text("断开连接", "Disconnect")}</button>
                      : <button className="button secondary" type="button" disabled={bridgeBusy} onClick={() => void connectBridge()}>{bridgeBusy ? text("检测中…", "Checking…") : text("检测连接", "Check connection")}</button>}
                    {bridgeMessage && <p className="bridge-message" role="status">{bridgeMessage}</p>}
                  </div>
                </div>

                <button type="button" className="agent-test-prompt" onClick={() => void copyBridgeValue(readOnlyTestPrompt, "read")}>
                  <span className="agent-try-icon" aria-hidden="true">✦</span>
                  <div>
                    <small>{text("连接后试一句", "TRY IT AFTER CONNECTING")}</small>
                    <span>“{text("读取我的 TabNexus 工作区和当前标签，不要修改内容。", "Read my TabNexus workspace and current tabs. Do not change anything.")}”</span>
                  </div>
                  <b>{text("复制问题", "Copy prompt")}</b>
                </button>
              </>}
              {selectedAgent !== "coze" && <div className="bridge-safety-line"><span aria-hidden="true">✓</span>{text("模型密钥永远不可读；关闭标签或删除资料必须明确确认，固定标签永远不会被关闭。", "Model keys are never readable. Closing tabs or deleting data requires explicit confirmation, and pinned tabs are never closed.")}</div>}
            </div>
          ) : null}
        </section>

        <section className="settings-card">
          <div className="setting-copy">
            <h2>{text("本地 HTML", "Local HTML")}</h2>
            <p>{text("恢复 file:// 标签需要在 Chrome 扩展详情中开启文件网址访问。", "Restoring file:// tabs requires file URL access in Chrome extension details.")}</p>
          </div>
          <div className="file-access-actions">
            <span className={`access-badge ${fileAccess ? "enabled" : ""}`}>{fileAccess ? text("已开启", "Enabled") : text("未开启", "Disabled")}</span>
            <button className="button secondary" type="button" onClick={() => void openExtensionDetails()}>{text("打开扩展详情", "Open extension details")}</button>
            <button className="text-button" type="button" onClick={() => void isFileAccessAllowed().then(setFileAccess)}>{text("重新检查", "Check again")}</button>
          </div>
        </section>
      </main>
    </div>
  );
}
