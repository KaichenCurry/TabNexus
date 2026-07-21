import { AI_PROVIDER_IDS } from "./aiProviders";
import type { AgentSafePreferences, AiProviderId, GroupingPolicy, Locale, Settings, WorkspaceView } from "./types";

export type AgentPreferencePatch = Partial<Pick<AgentSafePreferences,
  "locale" | "closeAfterCollect" | "rightRailCollapsed" | "aiComposerCollapsed" | "workspaceView" | "groupingPolicy" | "aiEnabled" | "aiProvider"
>>;

export function safeAgentPreferences(settings: Settings): AgentSafePreferences {
  return {
    locale: settings.locale,
    closeAfterCollect: settings.closeAfterCollect,
    rightRailCollapsed: settings.rightRailCollapsed,
    aiComposerCollapsed: settings.aiComposerCollapsed,
    workspaceView: settings.workspaceView,
    groupingPolicy: settings.groupingPolicy,
    aiEnabled: settings.aiEnabled,
    aiProvider: settings.aiProvider,
    providers: Object.fromEntries(AI_PROVIDER_IDS.map((provider) => {
      const config = settings.aiProviderConfigs[provider];
      return [provider, {
        configured: Boolean(config.apiKey.trim()),
        verified: Boolean(config.verifiedAt),
        model: config.model
      }];
    })) as AgentSafePreferences["providers"]
  };
}

function fnvRevision(prefix: string, value: unknown): string {
  let hash = 0x811c9dc5;
  for (const character of JSON.stringify(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${prefix}_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function agentPreferencesRevision(settings: Settings): string {
  return fnvRevision("prefr", safeAgentPreferences(settings));
}

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && allowed.includes(value as T);
}

export function applyAgentPreferencePatch(settings: Settings, patch: AgentPreferencePatch): Settings {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("preferences must be an object");
  const allowedKeys = new Set([
    "locale", "closeAfterCollect", "rightRailCollapsed", "aiComposerCollapsed",
    "workspaceView", "groupingPolicy", "aiEnabled", "aiProvider"
  ]);
  for (const key of Object.keys(patch)) {
    if (!allowedKeys.has(key)) throw new Error(`Unsupported preference: ${key}`);
  }
  const next = { ...settings };
  if (patch.locale !== undefined) {
    if (!isOneOf<Locale>(patch.locale, ["zh", "en"])) throw new Error("locale must be zh or en");
    next.locale = patch.locale;
  }
  for (const key of ["closeAfterCollect", "rightRailCollapsed", "aiComposerCollapsed", "aiEnabled"] as const) {
    if (patch[key] !== undefined) {
      if (typeof patch[key] !== "boolean") throw new Error(`${key} must be boolean`);
      next[key] = patch[key];
    }
  }
  if (patch.workspaceView !== undefined) {
    if (!isOneOf<WorkspaceView>(patch.workspaceView, ["board", "flow"])) throw new Error("workspaceView must be board or flow");
    next.workspaceView = patch.workspaceView;
  }
  if (patch.groupingPolicy !== undefined) {
    if (!isOneOf<GroupingPolicy>(patch.groupingPolicy, ["automatic", "suggestion", "domain"])) throw new Error("Invalid groupingPolicy");
    next.groupingPolicy = patch.groupingPolicy;
  }
  if (patch.aiProvider !== undefined) {
    if (!isOneOf<AiProviderId>(patch.aiProvider, AI_PROVIDER_IDS)) throw new Error("Invalid aiProvider");
    next.aiProvider = patch.aiProvider;
  }
  return next;
}
