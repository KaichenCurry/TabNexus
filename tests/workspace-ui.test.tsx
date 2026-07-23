import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { WorkspaceApp } from "../extension/src/workspace/WorkspaceApp";
import { OpenTabsRail } from "../extension/src/workspace/OpenTabsRail";
import { CardRow } from "../extension/src/workspace/CardRow";
import { AgentPlanModal, ProposalModal } from "../extension/src/workspace/WorkspaceModals";
import type { Card, OpenTab, Workspace } from "../extension/src/core/types";

describe("workspace UI", () => {
  beforeEach(() => localStorage.clear());

  it("shows the three-part tutorial once and keeps a permanent reopen button", async () => {
    render(<WorkspaceApp />);
    const tutorial = await screen.findByRole("dialog", { name: "先保存，再放心关闭" });
    expect(within(tutorial).getByText("基础 · 标签管理")).toBeInTheDocument();
    fireEvent.click(within(tutorial).getByRole("button", { name: /AI 整理/ }));
    expect(await screen.findByRole("dialog", { name: "按你的意图整理，不被固定分类限制" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /本地 Agent/ }));
    expect(await screen.findByRole("dialog", { name: "让 Agent 直接接着你的浏览任务做" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "不再显示" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /Agent 直接接着/ })).not.toBeInTheDocument());
    await waitFor(() => expect(localStorage.getItem("tabnexus.settings.v1")).toContain('"tutorialCompleted":true'));

    fireEvent.click(screen.getByRole("button", { name: "教程" }));
    expect(await screen.findByRole("dialog", { name: "先保存，再放心关闭" })).toBeInTheDocument();
  });

  it("uses a multi-select tab workbench, saves regular tabs, and keeps the center for groups", async () => {
    const { container } = render(<WorkspaceApp />);
    expect(await screen.findByRole("heading", { name: "标签操作台" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "分组空间已准备好" })).toBeInTheDocument();
    expect(screen.queryByText("待整理")).not.toBeInTheDocument();
    expect(container.querySelector(".inbox-panel")).toBeNull();
    await screen.findByText("Pinned research inbox");

    fireEvent.click(screen.getByRole("button", { name: "全选" }));
    expect(screen.getByText("已选择 2 个")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "选择 Pinned research inbox" })).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: /保存 2/ }));

    await waitFor(() => expect(screen.getByText("已保存 2 个标签；原标签继续留在浏览器中")).toBeInTheDocument());
    const savedRows = container.querySelectorAll(".open-tab.is-saved");
    expect(savedRows).toHaveLength(2);
    expect(container.querySelectorAll(".open-tab.is-saved.is-missing")).toHaveLength(0);
    expect(container.querySelectorAll(".card-row")).toHaveLength(0);
    for (const row of savedRows) expect(row).toHaveAttribute("draggable", "true");

    const dataTransfer = { setData: vi.fn(), getData: vi.fn(), effectAllowed: "none", dropEffect: "none" };
    fireEvent.dragStart(savedRows[0], { dataTransfer });
    expect(dataTransfer.setData).toHaveBeenCalledOnce();
    expect(JSON.parse(dataTransfer.setData.mock.calls[0][1])).toMatchObject({ kind: "card" });

    fireEvent.click(screen.getByRole("button", { name: "EN" }));
    expect(await screen.findByRole("heading", { name: "Tab workbench" })).toBeInTheDocument();
    expect(screen.getByText("Pinned")).toBeInTheDocument();
  });

  it("collapses and expands the tab workbench without losing the workspace", async () => {
    const { container } = render(<WorkspaceApp />);
    await screen.findByRole("heading", { name: "标签操作台" });

    fireEvent.click(screen.getByRole("button", { name: "收起标签操作台" }));
    await waitFor(() => expect(container.querySelector(".app-shell")).toHaveClass("rail-collapsed"));
    expect(screen.queryByRole("heading", { name: "标签操作台" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "展开标签操作台" })).toBeInTheDocument();

    await waitFor(() => expect(localStorage.getItem("tabnexus.settings.v1")).toContain('"rightRailCollapsed":true'));
    fireEvent.click(screen.getByRole("button", { name: "展开标签操作台" }));
    await waitFor(() => expect(container.querySelector(".app-shell")).not.toHaveClass("rail-collapsed"));
    expect(screen.getByRole("heading", { name: "标签操作台" })).toBeInTheDocument();
  });

  it("organizes only the checked tab directly into a real group", async () => {
    const { container } = render(<WorkspaceApp />);
    await screen.findByRole("heading", { name: "标签操作台" });
    fireEvent.click(await screen.findByRole("checkbox", { name: "选择 Perplexity AI — Funding Rounds" }));
    fireEvent.click(screen.getByRole("button", { name: /本地整理 1/ }));

    expect(await screen.findByRole("heading", { name: "crunchbase.com" })).toBeInTheDocument();
    expect(container.querySelectorAll(".group-panel")).toHaveLength(1);
    expect(container.querySelector(".group-panel .group-accent")).toBeNull();
    expect(container.querySelectorAll(".card-row")).toHaveLength(1);
    expect(container.querySelector(".card-row .favicon.fallback")).toBeNull();
    expect(container.querySelector(".inbox-panel")).toBeNull();
    expect(container.querySelectorAll(".open-tab.is-saved")).toHaveLength(1);
  });

  it("adds a source inside its group and filters the shared workspace views", async () => {
    const { container } = render(<WorkspaceApp />);
    await screen.findByRole("heading", { name: "标签操作台" });
    fireEvent.click(await screen.findByRole("checkbox", { name: "选择 Perplexity AI — Funding Rounds" }));
    fireEvent.click(screen.getByRole("button", { name: /本地整理 1/ }));

    const groupHeading = await screen.findByRole("heading", { name: "crunchbase.com" });
    const groupPanel = groupHeading.closest(".group-panel") as HTMLElement;
    fireEvent.click(within(groupPanel).getByRole("button", { name: "添加资料到此分组" }));
    const dialog = screen.getByRole("dialog", { name: "手动添加资料" });
    expect(within(dialog).getByLabelText("保存到分组")).toHaveDisplayValue("crunchbase.com");
    fireEvent.change(within(dialog).getByLabelText("资料名称"), { target: { value: "行业结论" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "添加资料" }));
    await waitFor(() => expect(container.querySelectorAll(".card-row")).toHaveLength(2));

    fireEvent.change(screen.getByLabelText("资料类型"), { target: { value: "note" } });
    await waitFor(() => expect(container.querySelectorAll(".card-row")).toHaveLength(1));
    expect(screen.getByText("显示 1 / 2")).toBeInTheDocument();
    expect(screen.getByText("行业结论")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "清除筛选" }));
    await waitFor(() => expect(container.querySelectorAll(".card-row")).toHaveLength(2));
  });

  it("explains the DeepSeek failure reason before using the local fallback", async () => {
    localStorage.setItem("tabnexus.settings.v1", JSON.stringify({
      locale: "zh",
      deepSeekEnabled: true,
      deepSeekApiKey: "runtime-only",
      deepSeekVerifiedAt: "2026-07-21T00:00:00.000Z",
      deepSeekModel: "deepseek-v4-flash",
      groupingPolicy: "suggestion"
    }));
    render(<WorkspaceApp />);
    await screen.findByRole("heading", { name: "标签操作台" });
    fireEvent.click(await screen.findByRole("checkbox", { name: "选择 Perplexity AI — Funding Rounds" }));
    fireEvent.click(screen.getByRole("button", { name: /AI 整理 1/ }));

    expect(await screen.findByText("AI 服务请求失败，已使用本地域名分组")).toBeInTheDocument();
  });

  it("makes save-and-close an explicit action on the checked tabs", async () => {
    const confirm = vi.spyOn(window, "confirm");
    render(<WorkspaceApp />);
    await screen.findByRole("heading", { name: "标签操作台" });
    await screen.findByRole("checkbox", { name: "选择 Perplexity AI — Funding Rounds" });
    fireEvent.click(screen.getByRole("button", { name: "全选" }));
    fireEvent.click(screen.getByRole("button", { name: /保存并关闭 2/ }));

    expect(screen.getByRole("dialog", { name: "保存并关闭所选标签？" })).toBeInTheDocument();
    expect(screen.getByText("已选择 2 个")).toBeInTheDocument();
    expect(confirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "关闭 2 个标签" }));
    await waitFor(() => expect(screen.getByText("已新保存 2 个，关闭 2 个；卡片继续保留")).toBeInTheDocument());
    confirm.mockRestore();
  });

  it("uses branded dialogs for naming and destructive group actions", async () => {
    const prompt = vi.spyOn(window, "prompt");
    const confirm = vi.spyOn(window, "confirm");
    const { container } = render(<WorkspaceApp />);
    await screen.findByRole("heading", { name: "标签操作台" });

    fireEvent.click(screen.getByRole("button", { name: /新建分组$/ }));
    expect(screen.getByRole("dialog", { name: "创建资料分组" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("分组名称"), { target: { value: "竞品研究" } });
    fireEvent.click(screen.getByRole("button", { name: "创建分组" }));
    expect(await screen.findByRole("heading", { name: "竞品研究" })).toBeInTheDocument();

    fireEvent.click(container.querySelector(".group-menu summary")!);
    fireEvent.click(container.querySelector(".group-menu-popover button.danger")!);
    expect(screen.getByRole("dialog", { name: "删除这个分组？" })).toBeInTheDocument();
    expect(screen.getByText("删除这个分组？其中的卡片仍会保留，并变为未分组状态。")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(screen.queryByRole("dialog", { name: "删除这个分组？" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "竞品研究" })).toBeInTheDocument();
    expect(prompt).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    prompt.mockRestore();
    confirm.mockRestore();
  });

  it("shows an intent-led AI composer and explains the DeepSeek requirement", async () => {
    render(<WorkspaceApp />);
    await screen.findByRole("heading", { name: "标签操作台" });
    expect(screen.queryByRole("region", { name: "AI 助手" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^AI 助手$/ }));
    const composer = screen.getByRole("region", { name: "AI 助手" });
    expect(within(composer).getByText("配置 AI 模型以管理工作区与标签")).toBeInTheDocument();
    expect(within(composer).getByRole("button", { name: /标签区已选.*尚未勾选/ })).toBeDisabled();
    fireEvent.click(await screen.findByRole("checkbox", { name: "选择 Perplexity AI — Funding Rounds" }));
    const selectedScope = within(composer).getByRole("button", { name: /标签区已选.*1 个/ });
    expect(selectedScope).toBeEnabled();
    fireEvent.click(selectedScope);
    expect(selectedScope).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(composer).getByRole("button", { name: "按网页类型分类" }));
    expect(within(composer).getByPlaceholderText(/告诉 AI 要如何管理/)).toHaveValue("按网页类型分类");
    fireEvent.click(within(composer).getByRole("button", { name: "理解指令并生成操作预览" }));
    expect(await screen.findByText("请先在设置中配置 AI 模型，再使用整理指令")).toBeInTheDocument();
    fireEvent.click(within(composer).getByRole("button", { name: "收起 AI 助手" }));
    expect(screen.queryByRole("region", { name: "AI 助手" })).not.toBeInTheDocument();
  });

  it("counts a selected saved-but-closed card in the Agent rail scope", async () => {
    localStorage.setItem("tabnexus.appState.v1", JSON.stringify({
      schemaVersion: 1,
      activeWorkspaceId: "ws",
      workspaceOrder: ["ws"],
      workspaces: {
        ws: {
          id: "ws",
          name: "研究",
          createdAt: "2026-07-21T00:00:00.000Z",
          updatedAt: "2026-07-21T00:00:00.000Z",
          groupOrder: [],
          groups: {},
          edges: [],
          cards: {
            closed: { id: "closed", type: "web", title: "Closed AI source", url: "https://example.com/closed-ai", note: "", status: "unread", groupId: null, source: "user" }
          }
        }
      }
    }));
    localStorage.setItem("tabnexus.settings.v1", JSON.stringify({ locale: "zh", aiComposerCollapsed: false }));
    render(<WorkspaceApp />);
    const composer = await screen.findByRole("region", { name: "AI 助手" });
    fireEvent.click(await screen.findByRole("checkbox", { name: "选择 Closed AI source" }));
    const selectedScope = within(composer).getByRole("button", { name: /标签区已选.*1 个/ });
    expect(selectedScope).toBeEnabled();
    fireEvent.click(selectedScope);
    expect(selectedScope).toHaveAttribute("aria-pressed", "true");
  });

  it("makes AI reasoning and assignments editable before applying", () => {
    const workspace: Workspace = {
      id: "ws",
      name: "研究",
      createdAt: "2026-07-21T00:00:00.000Z",
      updatedAt: "2026-07-21T00:00:00.000Z",
      groupOrder: ["existing"],
      groups: { existing: { id: "existing", name: "已有分组", color: "#33549E", cardIds: [] } },
      edges: [],
      cards: {
        card: { id: "card", type: "web", title: "资料 A", url: "https://example.com/a", favicon: "https://example.com/favicon.ico", note: "", status: "unread", groupId: null, source: "user" }
      }
    };
    const onApply = vi.fn();
    render(
      <ProposalModal
        workspace={workspace}
        locale="zh"
        proposal={{
          source: "ai",
          instruction: "按证据强弱整理",
          basis: "证据强弱",
          summary: "先区分直接证据和背景资料。",
          groups: [{ id: "new_evidence", name: "AI 分组", color: "#7A6EDC", isNew: true }],
          assignments: [{ cardId: "card", groupId: "new_evidence", reason: "标题显示它是直接证据" }]
        }}
        onApply={onApply}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText("证据强弱")).toBeInTheDocument();
    expect(screen.queryByText("按证据强弱整理")).not.toBeInTheDocument();
    expect(screen.getByText("1 条资料将调整到 1 个分组")).toBeInTheDocument();
    expect(screen.queryByText("标题显示它是直接证据")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "查看 AI 分组 中的 1 条资料" }));
    expect(screen.getByText(/标题显示它是直接证据/)).toBeInTheDocument();
    expect(document.querySelector(".proposal-card-favicon")).toHaveAttribute("src", "https://example.com/favicon.ico");
    fireEvent.change(screen.getByLabelText("重命名建议分组：AI 分组"), { target: { value: "研究证据" } });
    fireEvent.change(screen.getByLabelText("“资料 A”的目标分组"), { target: { value: "existing" } });
    fireEvent.click(screen.getByRole("button", { name: "应用整理" }));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({
      groups: [],
      assignments: [expect.objectContaining({ cardId: "card", groupId: "existing" })]
    }));
  });

  it("previews exact workspace and tab actions before the Agent executes them", () => {
    const workspace: Workspace = {
      id: "ws",
      name: "研究",
      createdAt: "2026-07-21T00:00:00.000Z",
      updatedAt: "2026-07-21T00:00:00.000Z",
      groupOrder: [],
      groups: {},
      edges: [],
      cards: {}
    };
    const onApply = vi.fn();
    render(
      <AgentPlanModal
        workspace={workspace}
        locale="zh"
        tabs={[{ id: 8, windowId: 1, title: "Research tab", url: "https://example.com", pinned: false, active: false, supported: true }]}
        plan={{
          source: "ai",
          scope: "selection",
          summary: "保存并关闭刚才勾选的标签",
          rationale: "用户明确要求处理标签区当前选择。",
          actions: [{ type: "close_tabs", tabIds: [8] }]
        }}
        onApply={onApply}
        onClose={vi.fn()}
      />
    );

    const dialog = screen.getByRole("dialog", { name: "操作预览" });
    expect(within(dialog).getByText("标签区所选项目")).toBeInTheDocument();
    expect(within(dialog).getByText("先保存，再关闭 1 个标签")).toBeInTheDocument();
    expect(within(dialog).getByText("Research tab")).toBeInTheDocument();
    expect(within(dialog).getByText(/关闭标签前会先保存/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "确认并执行" }));
    expect(onApply).toHaveBeenCalledOnce();
  });

  it("shows and clears live MCP Agent activity for the active workspace", async () => {
    localStorage.setItem("tabnexus.appState.v1", JSON.stringify({
      schemaVersion: 1,
      activeWorkspaceId: "ws",
      workspaceOrder: ["ws"],
      workspaces: {
        ws: {
          id: "ws", name: "Agent workspace", createdAt: "2026-07-21T00:00:00.000Z", updatedAt: "2026-07-21T00:00:00.000Z",
          groupOrder: [], groups: {}, cards: {}, edges: []
        }
      }
    }));
    localStorage.setItem("tabnexus.agentActivity.v1", JSON.stringify([{
      id: "activity-1",
      workspaceId: "ws",
      tool: "write_report",
      status: "success",
      createdAt: "2026-07-21T03:00:00.000Z",
      completedAt: "2026-07-21T03:00:01.000Z",
      summary: "Agent 写回报告“市场结论”"
    }]));
    render(<WorkspaceApp />);
    const activityButton = await screen.findByRole("button", { name: /查看 Agent 活动.*1 条/ });
    fireEvent.click(activityButton);
    const dialog = screen.getByRole("dialog", { name: "Agent 活动" });
    expect(within(dialog).getByText("写回报告")).toBeInTheDocument();
    expect(within(dialog).getByText("Agent 写回报告“市场结论”")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "清空记录" }));
    expect(await within(dialog).findByText("还没有 Agent 活动")).toBeInTheDocument();
  });

  it("adds manual sources, switches to the relationship map, and tracks reading progress", async () => {
    const { container } = render(<WorkspaceApp />);
    await screen.findByRole("heading", { name: "标签操作台" });

    fireEvent.click(screen.getByRole("button", { name: /添加资料$/ }));
    const firstDialog = screen.getByRole("dialog", { name: "手动添加资料" });
    fireEvent.change(within(firstDialog).getByLabelText("资料名称"), { target: { value: "核心观点" } });
    fireEvent.change(within(firstDialog).getByLabelText("网址（可选）"), { target: { value: "https://example.com/core" } });
    fireEvent.click(within(firstDialog).getByRole("button", { name: "添加资料" }));
    expect(await screen.findByRole("heading", { name: "手动资料" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /添加资料$/ }));
    const secondDialog = screen.getByRole("dialog", { name: "手动添加资料" });
    fireEvent.change(within(secondDialog).getByLabelText("资料名称"), { target: { value: "补充证据" } });
    fireEvent.change(within(secondDialog).getByLabelText("网址（可选）"), { target: { value: "https://example.com/evidence" } });
    fireEvent.click(within(secondDialog).getByRole("button", { name: "添加资料" }));
    await waitFor(() => expect(container.querySelectorAll(".card-row")).toHaveLength(2));

    fireEvent.click(screen.getByRole("button", { name: "关系图" }));
    await waitFor(() => expect(container.querySelectorAll(".flow-node")).toHaveLength(2));
    expect(container.querySelector(".mind-root-node")).toBeInTheDocument();
    expect(container.querySelectorAll(".mind-group-node")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "选择资料" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "移动画布" }));
    expect(screen.getByRole("button", { name: "移动画布" })).toHaveAttribute("aria-pressed", "true");
    const status = container.querySelector<HTMLButtonElement>(".card-status-button")!;
    fireEvent.click(status);
    await waitFor(() => expect(container.querySelector(".card-status-button")).toHaveAttribute("aria-label", "资料状态：已读"));

    fireEvent.click(screen.getByRole("button", { name: /本地建议结构/ }));
    const proposal = await screen.findByRole("dialog", { name: "任务结构建议" });
    expect(within(proposal).getByText("核心观点")).toBeInTheDocument();
    fireEvent.click(within(proposal).getByRole("button", { name: "应用关系" }));
    expect(await screen.findByRole("button", { name: /撤销结构建议/ })).toBeInTheDocument();
  });

  it("shows saved closed cards in the rail and reopens only the checked ones", async () => {
    const workspace: Workspace = {
      id: "ws",
      name: "Test",
      createdAt: "2026-07-20T00:00:00.000Z",
      updatedAt: "2026-07-20T00:00:00.000Z",
      groupOrder: [],
      groups: {},
      edges: [],
      cards: {
        closed: {
          id: "closed",
          type: "web",
          title: "Closed research",
          url: "https://example.com/closed",
          note: "",
          status: "unread",
          groupId: null,
          source: "user"
        }
      }
    };
    const onReopenSelected = vi.fn(async (_payload: { tabs: OpenTab[]; cards: Card[] }) => undefined);
    const { container } = render(
      <OpenTabsRail
        tabs={[]}
        workspace={workspace}
        locale="zh"
        aiLoading={false}
        onSaveSelected={async () => undefined}
        onOrganizeSelected={async () => undefined}
        onCloseSelected={async () => undefined}
        onReopenSelected={onReopenSelected}
        unsupportedCount={0}
      />
    );

    expect(screen.getByText("已保存但已关闭")).toBeInTheDocument();
    const closedRow = container.querySelector(".open-tab.is-missing")!;
    expect(closedRow).toHaveAttribute("draggable", "true");
    const dragTransfer = { setData: vi.fn(), getData: vi.fn(), effectAllowed: "none", dropEffect: "none" };
    fireEvent.dragStart(closedRow, { dataTransfer: dragTransfer });
    expect(JSON.parse(dragTransfer.setData.mock.calls[0][1])).toEqual({ kind: "card", cardId: "closed" });
    fireEvent.click(screen.getByRole("checkbox", { name: "选择 Closed research" }));
    fireEvent.click(screen.getByRole("button", { name: /重开 1/ }));
    await waitFor(() => expect(onReopenSelected).toHaveBeenCalledTimes(1));
    expect(onReopenSelected.mock.calls[0][0].cards[0].id).toBe("closed");
  });

  it("dims unsaved recently closed tabs and never makes them draggable", () => {
    const workspace: Workspace = {
      id: "ws",
      name: "Test",
      createdAt: "2026-07-20T00:00:00.000Z",
      updatedAt: "2026-07-20T00:00:00.000Z",
      groupOrder: [],
      groups: {},
      edges: [],
      cards: {}
    };
    const onReopenRecent = vi.fn();
    const onDismissRecent = vi.fn();
    const { container } = render(
      <OpenTabsRail
        tabs={[]}
        workspace={workspace}
        locale="zh"
        aiLoading={false}
        onSaveSelected={async () => undefined}
        onOrganizeSelected={async () => undefined}
        onCloseSelected={async () => undefined}
        onReopenSelected={async () => undefined}
        recentlyClosed={[{
          id: "recent-1",
          title: "Unsaved closed page",
          url: "https://example.com/unsaved",
          closedAt: "2026-07-20T00:00:00.000Z"
        }]}
        onReopenRecent={onReopenRecent}
        onDismissRecent={onDismissRecent}
        unsupportedCount={0}
      />
    );

    expect(screen.getByText("最近关闭 · 未保存")).toBeInTheDocument();
    const recentRow = container.querySelector(".recent-closed-item") as HTMLElement;
    expect(recentRow).toHaveAttribute("draggable", "false");
    expect(within(recentRow).queryByRole("checkbox")).not.toBeInTheDocument();
    fireEvent.click(within(recentRow).getByRole("button", { name: "重新打开" }));
    fireEvent.click(within(recentRow).getByRole("button", { name: "从最近关闭中移除" }));
    expect(onReopenRecent).toHaveBeenCalledOnce();
    expect(onDismissRecent).toHaveBeenCalledOnce();
  });

  it("opens a saved website only from the explicit arrow icon", () => {
    const onOpen = vi.fn();
    render(
      <CardRow
        card={{
          id: "safe-card",
          type: "web",
          title: "Safe source",
          url: "https://example.com/safe",
          note: "Clicking this note must not navigate",
          status: "unread",
          groupId: null,
          source: "user"
        }}
        locale="zh"
        isOpen
        onOpen={onOpen}
        onNote={() => undefined}
        onDelete={() => undefined}
        onStatusChange={() => undefined}
      />
    );

    fireEvent.click(screen.getByText("Safe source"));
    fireEvent.click(screen.getByText("example.com"));
    fireEvent.click(screen.getByText("Clicking this note must not navigate"));
    expect(onOpen).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "打开" }));
    expect(onOpen).toHaveBeenCalledOnce();
  });
});
