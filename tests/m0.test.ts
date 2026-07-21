import { describe, expect, it } from "vitest";
import { validateInput, validateProposal } from "../scripts/m0-lib";

const input = {
  samples: [{
    id: "set-1",
    tabs: [
      { id: "a", title: "A", url: "https://example.com/a" },
      { id: "b", title: "B", url: "https://example.com/b" }
    ]
  }]
};

describe("M0 experiment contracts", () => {
  it("validates fixture and clustering output without a key", () => {
    const sample = validateInput(input).samples[0];
    expect(validateProposal({
      groups: [{ id: "g_research", name: "Research", color: "#33549E" }],
      assignments: [
        { cardId: "a", groupId: "g_research" },
        { cardId: "b", groupId: "g_research" }
      ]
    }, sample).assignments).toHaveLength(2);
  });

  it("rejects repeated or missing assignments", () => {
    const sample = input.samples[0];
    expect(() => validateProposal({
      groups: [{ id: "g", name: "Group", color: "#33549E" }],
      assignments: [
        { cardId: "a", groupId: "g" },
        { cardId: "a", groupId: "g" }
      ]
    }, sample)).toThrow();
  });
});
