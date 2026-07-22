import { describe, expect, it } from "vitest";
import {
  AI_PROVIDERS,
  aiCompletionTokenBudget,
  aiRequestTimeoutMs,
  kimiSupportsDisabledThinking
} from "../extension/src/core/aiProviders";

describe("AI provider runtime contracts", () => {
  it("uses current recommended Kimi models without suggesting the fixed thinking model", () => {
    expect(AI_PROVIDERS.kimi.suggestedModels).toEqual(["kimi-k2.6", "kimi-k2.5"]);
    expect(kimiSupportsDisabledThinking("kimi-k2.6")).toBe(true);
    expect(kimiSupportsDisabledThinking("kimi-k2-thinking")).toBe(false);
  });

  it("preserves MiniMax business budgets while protecting short validation requests", () => {
    expect(aiCompletionTokenBudget("minimax", "MiniMax-M2.7", 64)).toBe(1_024);
    expect(aiCompletionTokenBudget("minimax", "MiniMax-M2.7", 4_000)).toBe(4_000);
    expect(aiCompletionTokenBudget("kimi", "kimi-k2-thinking", 64)).toBe(16_000);
    expect(aiCompletionTokenBudget("kimi", "kimi-k2.6", 64)).toBe(64);
  });

  it("allows thinking providers enough time without slowing ordinary requests", () => {
    expect(aiRequestTimeoutMs("deepseek", "deepseek-v4-flash", 4_000)).toBe(25_000);
    expect(aiRequestTimeoutMs("kimi", "kimi-k2-thinking", 64)).toBe(90_000);
    expect(aiRequestTimeoutMs("minimax", "MiniMax-M2.7", 4_000)).toBeGreaterThanOrEqual(100_000);
    expect(aiRequestTimeoutMs("minimax", "MiniMax-M2.7", 4_000)).toBeLessThanOrEqual(120_000);
  });
});
