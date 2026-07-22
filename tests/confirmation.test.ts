import { describe, expect, it } from "vitest";
import { assertExplicitAgentConfirmation, hasExplicitAgentConfirmation } from "../extension/src/core/confirmation";

describe("destructive Agent confirmation", () => {
  it.each([
    "我确认删除这张卡片",
    "确认关闭这些普通标签，固定标签不要关闭",
    "我确认清空协作记录，但不要删除工作区内容",
    "I confirm deleting this card",
    "I confirm closing these tabs without saving them",
    "I confirm: save and close normal tabs, and never close pinned tabs",
    "Confirmed: clear the visible activity, but do not delete workspace content",
    "我确认把不需要的标签关闭",
    "我确认关闭不需要的标签"
  ])("accepts an affirmative confirmation with safe exclusions: %s", (text) => {
    expect(hasExplicitAgentConfirmation(true, text)).toBe(true);
  });

  it.each([
    "我不确认删除",
    "不要确认关闭",
    "我确认不删除这张卡片",
    "我确认这个请求，但不要关闭标签",
    "I do not confirm",
    "not confirmed",
    "I confirm not to delete",
    "I confirm that I do not want to proceed",
    "I confirm this deletion is not authorized",
    "I confirm I will not close these tabs",
    "I confirm this deletion isn't authorized",
    "I confirm I won't close these tabs",
    "I confirm without deleting anything",
    "I confirm I will refrain from deleting it",
    "I confirm this request does not authorize deletion",
    "I confirm I am against deleting this card",
    "I confirm except for closing these tabs",
    "我确认不会删除这张卡片",
    "我确认并非要删除这张卡片",
    "我确认无需关闭这些标签",
    "我确认反对删除工作区",
    "我确认这个请求并不意味着删除工作区",
    "我确认此请求，但反对现在关闭标签",
    "Confirmed, never close these tabs",
    "I confirm deleting this card, but cancel that",
    "I confirm deleting this card. Actually, do not proceed",
    "I confirm deleting this card, then withdraw my confirmation",
    "I confirm deleting this card, but cancel the deletion",
    "I confirm deleting this card, but stop deleting",
    "I confirm deleting this card, but abort",
    "I confirm deleting this card, but stop",
    "I confirm deleting this card, but I changed my mind",
    "I confirm deleting this card, but take it back",
    "I confirm deleting this card, but don't delete it",
    "I confirm closing these tabs, but don't close them",
    "I confirm deleting this card, but don’t delete it",
    "I confirm deleting this card; actually cancel",
    "I confirm deleting this card, but undo that",
    "I confirm deleting this card, but keep it",
    "I confirm deleting this card, but don't remove it",
    "I confirm removing this card, but don't delete it",
    "I confirm deleting this card, but I will not delete it",
    "I confirm deleting this card, but I won't delete it",
    "I confirm deleting this card, but I won’t delete it",
    "I confirm closing these tabs, but leave them open",
    "I confirm closing these tabs, but leave these tabs open",
    "I confirm closing these tabs, but don't close them because they are pinned tabs",
    "I confirm deleting this card, but actually no",
    "I confirm deleting this card; on second thought, don't",
    "I confirm deleting this card, but I take back my confirmation",
    "I confirm deletion without authorization",
    "I confirm closing these tabs without user approval",
    "I confirm deleting this card, but it is unauthorized",
    "我确认删除这张卡片，但取消这个操作",
    "我确认删除这张卡片，但取消删除",
    "我确认删除这张卡片，但取消吧",
    "我确认删除这张卡片，但我反悔了",
    "我确认删除这张卡片，但我改变主意了",
    "我确认删除这张卡片，但别删了",
    "我确认关闭这些标签，但别关了",
    "我确认删除这张卡片，但保留它",
    "我确认删除这张卡片，但不要移除它",
    "我确认删除这张卡片，但我不删了",
    "我确认关闭这些标签，不过还是不关了",
    "我确认删除这张卡片，但未经授权",
    "我确认删除这张卡片，但撤回确认",
    "我确认删除这张卡片，算了"
  ])("rejects a negated or ambiguous confirmation: %s", (text) => {
    expect(hasExplicitAgentConfirmation(true, text)).toBe(false);
  });

  it("still requires the boolean confirmation flag", () => {
    expect(hasExplicitAgentConfirmation(false, "我确认删除这张卡片")).toBe(false);
    expect(() => assertExplicitAgentConfirmation(false, "我确认删除这张卡片", "delete_workspace_items"))
      .toThrow(/confirm=true/);
  });

  it("does not reuse confirmation language for a different destructive action", () => {
    for (const wording of ["close", "closes", "closed", "closing"]) {
      expect(hasExplicitAgentConfirmation(true, `I confirm ${wording} these tabs`, "delete_workspace_items")).toBe(false);
    }
    for (const wording of ["delete", "deletes", "deleted", "deleting", "deletion"]) {
      expect(hasExplicitAgentConfirmation(true, `I confirm ${wording} this card`, "close_browser_tabs")).toBe(false);
    }
    expect(hasExplicitAgentConfirmation(true, "我确认删除这张卡片", "close_browser_tabs")).toBe(false);
    expect(hasExplicitAgentConfirmation(true, "I confirm", "delete_workspace_items")).toBe(true);
    expect(hasExplicitAgentConfirmation(true, "I confirm this request", "delete_workspace_items")).toBe(false);
    expect(hasExplicitAgentConfirmation(true, "我确认这个请求", "close_browser_tabs")).toBe(false);
  });
});
