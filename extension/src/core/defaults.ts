import type { Locale, Settings } from "./types";
import { createDefaultAiProviderConfigs } from "./aiProviders";

export const DEFAULT_SETTINGS: Settings = {
  locale: "zh",
  closeAfterCollect: false,
  rightRailCollapsed: false,
  aiComposerCollapsed: true,
  workspaceView: "board",
  aiEnabled: false,
  aiProvider: "deepseek",
  aiProviderConfigs: createDefaultAiProviderConfigs(),
  deepSeekEnabled: false,
  deepSeekApiKey: "",
  deepSeekModel: "deepseek-v4-flash",
  deepSeekVerifiedAt: "",
  groupingPolicy: "suggestion",
  agentBridgeEnabled: false,
  tutorialCompleted: false
};

export const GROUP_COLORS = [
  "#E8833A",
  "#7A6EDC",
  "#3379D6",
  "#3F9D6A",
  "#D6455E",
  "#20A39E",
  "#A85A32",
  "#8A93A3"
] as const;

export function defaultWorkspaceName(locale: Locale): string {
  return locale === "zh" ? "我的工作区" : "My workspace";
}

export function untitledWorkspaceName(locale: Locale): string {
  return locale === "zh" ? "未命名工作区" : "Untitled workspace";
}

export function defaultGroupName(locale: Locale): string {
  return locale === "zh" ? "新分组" : "New group";
}
