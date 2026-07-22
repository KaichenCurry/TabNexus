import type { AiProviderConfig, AiProviderId, Settings } from "./types";

export type AiProviderDefinition = {
  id: AiProviderId;
  name: string;
  shortName: string;
  mark: string;
  endpoint: string;
  protocol: "openai-compatible" | "anthropic";
  defaultModel: string;
  suggestedModels: string[];
  keyPlaceholder: string;
  accent: string;
};

export const AI_PROVIDER_IDS: AiProviderId[] = [
  "deepseek",
  "openai",
  "anthropic",
  "kimi",
  "qwen",
  "minimax"
];

export const AI_PROVIDERS: Record<AiProviderId, AiProviderDefinition> = {
  deepseek: {
    id: "deepseek",
    name: "DeepSeek",
    shortName: "DS",
    mark: "◆",
    endpoint: "https://api.deepseek.com/chat/completions",
    protocol: "openai-compatible",
    defaultModel: "deepseek-v4-flash",
    suggestedModels: ["deepseek-v4-flash", "deepseek-v4-pro"],
    keyPlaceholder: "sk-…",
    accent: "#5b5bd6"
  },
  openai: {
    id: "openai",
    name: "OpenAI",
    shortName: "OA",
    mark: "◉",
    endpoint: "https://api.openai.com/v1/chat/completions",
    protocol: "openai-compatible",
    defaultModel: "gpt-5.6-luna",
    suggestedModels: ["gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol"],
    keyPlaceholder: "sk-proj-…",
    accent: "#12997b"
  },
  anthropic: {
    id: "anthropic",
    name: "Claude",
    shortName: "CL",
    mark: "A",
    endpoint: "https://api.anthropic.com/v1/messages",
    protocol: "anthropic",
    defaultModel: "claude-sonnet-5",
    suggestedModels: ["claude-sonnet-5", "claude-sonnet-4-6", "claude-haiku-4-5"],
    keyPlaceholder: "sk-ant-…",
    accent: "#b86d49"
  },
  kimi: {
    id: "kimi",
    name: "Kimi",
    shortName: "KM",
    mark: "K",
    endpoint: "https://api.moonshot.cn/v1/chat/completions",
    protocol: "openai-compatible",
    defaultModel: "kimi-k2.6",
    suggestedModels: ["kimi-k2.6", "kimi-k2-thinking"],
    keyPlaceholder: "sk-…",
    accent: "#202633"
  },
  qwen: {
    id: "qwen",
    name: "通义千问",
    shortName: "QW",
    mark: "Q",
    endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    protocol: "openai-compatible",
    defaultModel: "qwen-plus",
    suggestedModels: ["qwen-plus", "qwen-max", "qwen-turbo"],
    keyPlaceholder: "sk-…",
    accent: "#6d54dc"
  },
  minimax: {
    id: "minimax",
    name: "MiniMax",
    shortName: "MM",
    mark: "M",
    endpoint: "https://api.minimaxi.com/v1/text/chatcompletion_v2",
    protocol: "openai-compatible",
    defaultModel: "MiniMax-M2.7",
    suggestedModels: ["MiniMax-M2.7", "MiniMax-M2.7-highspeed", "MiniMax-M2.5"],
    keyPlaceholder: "输入 MiniMax API key",
    accent: "#1677ff"
  }
};

export function createDefaultAiProviderConfigs(): Record<AiProviderId, AiProviderConfig> {
  return Object.fromEntries(AI_PROVIDER_IDS.map((id) => [id, {
    apiKey: "",
    model: AI_PROVIDERS[id].defaultModel,
    verifiedAt: ""
  }])) as Record<AiProviderId, AiProviderConfig>;
}

export function normalizeAiProviderConfigs(
  stored: Partial<Record<AiProviderId, Partial<AiProviderConfig>>> | undefined,
  legacy?: Pick<Partial<Settings>, "deepSeekApiKey" | "deepSeekModel" | "deepSeekVerifiedAt">
): Record<AiProviderId, AiProviderConfig> {
  const defaults = createDefaultAiProviderConfigs();
  const result = Object.fromEntries(AI_PROVIDER_IDS.map((id) => {
    const candidate = stored?.[id];
    const legacyDeepSeek = id === "deepseek" ? {
      apiKey: typeof legacy?.deepSeekApiKey === "string" ? legacy.deepSeekApiKey.trim() : "",
      model: defaults.deepseek.model,
      verifiedAt: typeof legacy?.deepSeekVerifiedAt === "string" ? legacy.deepSeekVerifiedAt : ""
    } : undefined;
    const fallback = legacyDeepSeek ?? defaults[id];
    return [id, {
      apiKey: typeof candidate?.apiKey === "string" ? candidate.apiKey.trim() : fallback.apiKey,
      model: typeof candidate?.model === "string" && candidate.model.trim()
        ? candidate.model.trim().slice(0, 120)
        : fallback.model,
      verifiedAt: typeof candidate?.verifiedAt === "string" ? candidate.verifiedAt : fallback.verifiedAt
    }];
  })) as Record<AiProviderId, AiProviderConfig>;
  return result;
}

export function activeAiConfig(settings: Settings): AiProviderConfig & { provider: AiProviderId } {
  const provider = AI_PROVIDER_IDS.includes(settings.aiProvider) ? settings.aiProvider : "deepseek";
  return { provider, ...settings.aiProviderConfigs[provider] };
}
