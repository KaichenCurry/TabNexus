import { describe, expect, it } from "vitest";
import { buildGroupingPrompt } from "../extension/src/core/groupingPrompt";
import type { GroupingRequest } from "../extension/src/core/types";

const base: GroupingRequest = {
  locale: "zh",
  cards: [{
    id: "card",
    title: "API Reference",
    url: "https://docs.example.com/api",
    type: "web",
    hostname: "docs.example.com",
    savedAt: "2026-07-20T08:00:00.000Z",
    lastAccessedAt: "2026-07-21T09:00:00.000Z"
  }],
  existingGroups: [{ id: "topic", name: "AI 研究", cards: [] }]
};

describe("intent-led grouping prompt", () => {
  it("treats a page-type instruction as binding and rejects topic fallback", () => {
    const prompt = buildGroupingPrompt({ ...base, instruction: "按网页类型分类" });
    expect(prompt).toContain("binding classification rule");
    expect(prompt).toContain("按网页类型分类");
    expect(prompt).toContain("Do not replace the requested dimension with topic");
    expect(prompt).toContain("semantic page genre");
  });

  it("supplies temporal evidence and forbids invented dates", () => {
    const prompt = buildGroupingPrompt({ ...base, instruction: "按最近访问时间分类" });
    expect(prompt).toContain("lastAccessedAt");
    expect(prompt).toContain("Never invent a date");
    expect(prompt).toContain("unknown-time group");
  });
});
