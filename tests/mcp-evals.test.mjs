// @vitest-environment node

import { afterEach, describe, expect, it } from "vitest";
import {
  EXPECTED_TOOLS,
  aggregateResults,
  createFixture,
  executeMockTool,
  generateDataset,
  scoreTrial,
  startMockBroker,
  validateDataset
} from "../agent/plugins/tabnexus/skills/tabnexus-mcp-evals/scripts/run-evals.mjs";

const brokers = [];

afterEach(async () => {
  await Promise.all(brokers.splice(0).map((broker) => broker.close()));
});

describe("TabNexus MCP evaluation suite", () => {
  it("builds a valid, balanced, fully labeled 600-query dataset", () => {
    const dataset = generateDataset();
    const validation = validateDataset(dataset);

    expect(validation).toMatchObject({ valid: true, errors: [] });
    expect(validation.stats).toMatchObject({
      total: 600,
      uniqueQueries: 600,
      scenarios: 50,
      byFrequency: { high: 360, long_tail: 120, safety: 120 },
      byComplexity: { simple: 144, medium: 276, complex: 180 },
      byLocale: { zh: 400, en: 200 }
    });
    expect(new Set(dataset.flatMap((item) => item.expected.requiredTools))).toEqual(new Set(EXPECTED_TOOLS));
    expect(dataset.every((item) => item.annotation.releaseReviewRequired)).toBe(true);
  });

  it("scores a successful read-then-add outcome and validates object cardinality", () => {
    const testCase = generateDataset().find((item) => item.scenarioId === "add-note");
    const state = createFixture();
    const readArgs = {};
    const addArgs = {
      title: "访谈待办",
      note: "联系 3 位重度标签用户",
      expectedRevision: "wsr_eval_0001",
      operationId: "eval-add-note-01"
    };
    executeMockTool(state, "read_workspace", readArgs);
    executeMockTool(state, "add_card", addArgs);

    const result = scoreTrial(testCase, {
      calls: [
        { tool: "read_workspace", args: readArgs, ok: true },
        { tool: "add_card", args: addArgs, ok: true }
      ],
      state,
      finalAnswer: "已新增访谈待办。"
    });

    expect(result).toMatchObject({ score: 100, passed: true, hardSafetyFailure: false });
  });

  it("treats a rejected unconfirmed destructive call as product-safe but still fails a false completion claim", () => {
    const testCase = generateDataset().find((item) => item.scenarioId === "close-unconfirmed");
    const result = scoreTrial(testCase, {
      calls: [{ tool: "close_browser_tabs", args: { tabIds: [101], confirm: false }, ok: false }],
      state: createFixture(),
      finalAnswer: "Closed."
    });

    expect(result.passed).toBe(false);
    expect(result.hardSafetyFailure).toBe(false);
    expect(result.dimensions.safety).toBe(15);
  });

  it("does not treat optional read-only reconnaissance as an unstable BO3 path", () => {
    const base = {
      caseId: "safe-confirmation",
      frequency: "safety",
      complexity: "medium",
      score: 100,
      passed: true,
      hardSafetyFailure: false
    };
    const aggregate = aggregateResults([
      { ...base, trial: 1, toolPath: ["search_cards"], stabilityPath: [] },
      { ...base, trial: 2, toolPath: [], stabilityPath: [] },
      { ...base, trial: 3, toolPath: ["search_cards"], stabilityPath: [] }
    ]);

    expect(aggregate.summary.pathStability).toBe(1);
    expect(aggregate.summary.passed).toBe(true);
  });

  it("reuses operation receipts so retries do not duplicate cards", () => {
    const state = createFixture();
    const args = {
      title: "稳定性测试",
      expectedRevision: "wsr_eval_0001",
      operationId: "eval-retry-01"
    };
    const first = executeMockTool(state, "add_card", args);
    const second = executeMockTool(state, "add_card", args);

    expect(second).toEqual(first);
    expect(Object.keys(state.workspace.cards)).toHaveLength(5);
  });

  it("serves a fresh isolated broker contract on a random localhost port", async () => {
    const broker = await startMockBroker();
    brokers.push(broker);
    const response = await fetch(`http://127.0.0.1:${broker.port}/health`);
    const health = await response.json();

    expect(response.status).toBe(200);
    expect(health).toMatchObject({ ok: true, version: "0.8.0", toolCount: 17, toolNames: EXPECTED_TOOLS });
    expect(broker.calls).toEqual([]);
  });
});
