import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TaskApp } from "../../extension/src/v2/app/TaskApp";
import type { Card, Workspace } from "../../extension/src/core/types";

function seedState(name = "评估 Perplexity", cards: Record<string, Card> = {}, v2: Workspace["v2"] = { goal: "", nextStep: "", conclusion: "" }) {
  const workspace: Workspace = {
    id: "task-1",
    name,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-15T00:00:00.000Z",
    groupOrder: ["s1"],
    groups: { s1: { id: "s1", name: "市场", color: "#E8833A", cardIds: Object.keys(cards) } },
    cards,
    edges: [],
    v2
  };
  localStorage.setItem("tabnexus.settings.v1", JSON.stringify({ locale: "zh", tutorialCompleted: true, v2ShellEnabled: true }));
  localStorage.setItem("tabnexus.appState.v1", JSON.stringify({
    schemaVersion: 1,
    activeWorkspaceId: "task-1",
    workspaceOrder: ["task-1"],
    workspaces: { "task-1": workspace }
  }));
}

function makeCard(id: string, overrides: Partial<Card> = {}): Card {
  return { id, type: "web", title: `页-${id}`, url: `https://${id}.example.com`, note: "", status: "unread", groupId: "s1", source: "user", ...overrides };
}

describe("v2 TaskApp", () => {
  beforeEach(() => localStorage.clear());

  it("renders the first-run question for an empty default-named task", async () => {
    seedState("我的工作区", {});
    render(<TaskApp />);
    expect(await screen.findByText("这次你想搞清楚什么？")).toBeInTheDocument();
    const input = screen.getByPlaceholderText("例如：评估 Perplexity 是否值得对标");
    fireEvent.change(input, { target: { value: "调研竞品定价" } });
    fireEvent.click(screen.getByRole("button", { name: "创建任务并选择相关页面" }));
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem("tabnexus.appState.v1")!);
      expect(stored.workspaces["task-1"].name).toBe("调研竞品定价");
    });
  });

  it("renders the task document: header, sections, pages, progress and conclusion", async () => {
    seedState("评估 Perplexity", {
      a: makeCard("a", { status: "read" }),
      b: makeCard("b", { status: "adopted" }),
      c: makeCard("c", { status: "excluded", excludedReason: "已过期" })
    }, { goal: "理解商业模式", nextStep: "补反例", conclusion: "值得研究" });
    render(<TaskApp />);
    expect(await screen.findByDisplayValue("评估 Perplexity")).toBeInTheDocument();
    expect(screen.getByDisplayValue("理解商业模式")).toBeInTheDocument();
    expect(screen.getByDisplayValue("补反例")).toBeInTheDocument();
    expect(screen.getAllByText("市场").length).toBeGreaterThan(0);
    expect(screen.getByText("页-a")).toBeInTheDocument();
    expect(screen.getByText("页-b")).toBeInTheDocument();
    expect(screen.getByText(/2\/2 已读/)).toBeInTheDocument();
    expect(screen.getByText(/已采用 1/)).toBeInTheDocument();
    expect(screen.getByDisplayValue("值得研究")).toBeInTheDocument();
    expect(screen.getByDisplayValue("已过期")).toBeInTheDocument();
    expect(screen.getByText("已保存 3 个页面")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "添加资料到「市场」" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开章节「市场」全部页面" })).toBeInTheDocument();
  });

  it("organizes by domain with preview and applies to sections", async () => {
    seedState("评估 Perplexity", {
      a: makeCard("a", { url: "https://x.example.com", groupId: null }),
      b: makeCard("b", { url: "https://y.example.org", groupId: null })
    }, { goal: "", nextStep: "", conclusion: "" });
    render(<TaskApp />);
    fireEvent.click(await screen.findByRole("button", { name: "智能整理" }));
    fireEvent.click(await screen.findByText("按域名", { exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "生成整理建议" }));
    expect(await screen.findByText("example.com", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("example.org", { exact: true })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "应用整理" }));
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem("tabnexus.appState.v1")!);
      const names = stored.workspaces["task-1"].groupOrder.map((id: string) => stored.workspaces["task-1"].groups[id].name);
      expect(names).toEqual(expect.arrayContaining(["example.com", "example.org"]));
    });
  });

  it("opens the export modal with markdown content", async () => {
    seedState("评估 Perplexity", { a: makeCard("a", { status: "read" }) });
    render(<TaskApp />);
    fireEvent.click(await screen.findByRole("button", { name: "更多操作" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /导出/ }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "复制" })).toBeInTheDocument();
  });
});
