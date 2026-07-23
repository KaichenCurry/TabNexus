import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { OptionsApp } from "../extension/src/options/OptionsApp";

describe("settings UI", () => {
  beforeEach(() => localStorage.clear());

  it("masks the API key field and persists the English locale", async () => {
    render(<OptionsApp />);
    const input = await screen.findByPlaceholderText("sk-…");
    expect(input).toHaveAttribute("type", "password");
    expect(screen.getByRole("checkbox")).toBeDisabled();
    expect(screen.getByText("未验证 · 本地模式")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "选择你的 AI 服务" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "连接你常用的 Agent" })).toBeInTheDocument();
    expect(screen.getByText(/仅发送本次整理所需的任务元数据/)).toBeInTheDocument();
    expect(screen.getByText(/不发送网页正文或卡片备注/)).toBeInTheDocument();
    expect(screen.getByText("选择要连接的应用")).toBeInTheDocument();
    expect(screen.getByText("5 个可用")).toBeInTheDocument();
    expect(screen.getByText("OpenAI")).toBeInTheDocument();
    expect(screen.getByText("Claude")).toBeInTheDocument();
    expect(screen.getByText("Kimi")).toBeInTheDocument();
    expect(screen.getByText("通义千问")).toBeInTheDocument();
    expect(screen.getByText("MiniMax")).toBeInTheDocument();
    expect(screen.queryByText(/install-native-host/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Codex/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Claude Desktop/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Claude Code/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cursor/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /VS Code/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /TRAE Work/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /扣子 Coze/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "在 Codex 中安装" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Codex/ }));
    expect(screen.getByText("把 TabNexus 添加到 Codex")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "在 Codex 中安装" })).toHaveAttribute("href", expect.stringMatching(/^codex:\/\/plugins\/tabnexus\?/));
    expect(screen.getByRole("button", { name: "检测连接" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /读取我的 TabNexus 工作区/ })).toBeInTheDocument();
    expect(screen.queryByText("下载 TabNexus 安装包")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "检测连接" }));
    expect(await screen.findByText("请在 Chrome 扩展中检测 Agent")).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "local-runtime-value" } });
    fireEvent.click(screen.getByRole("button", { name: "English" }));
    expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByText(/page bodies and card notes are not/)).toBeInTheDocument();
    expect(screen.getByText(/not OS-level encrypted/)).toBeInTheDocument();
  });

  it("shows official install flows and does not pretend Coze can access local Chrome", async () => {
    render(<OptionsApp />);
    await screen.findByRole("heading", { name: "连接你常用的 Agent" });

    fireEvent.click(screen.getByRole("button", { name: /VS Code/ }));
    expect(screen.getByRole("link", { name: "在 VS Code 中安装" })).toHaveAttribute("href", expect.stringMatching(/^https:\/\/insiders\.vscode\.dev\/redirect/));
    fireEvent.click(screen.getByRole("button", { name: /所有 Agent/ }));

    fireEvent.click(screen.getByRole("button", { name: /TRAE Work/ }));
    expect(screen.getByRole("link", { name: "在 TRAE CN 中安装" })).toHaveAttribute("href", expect.stringMatching(/^trae-cn:\/\//));
    fireEvent.click(screen.getByRole("button", { name: /所有 Agent/ }));

    fireEvent.click(screen.getByRole("button", { name: /扣子 Coze/ }));
    expect(screen.getByText("为什么现在不能直接连接")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "检测连接" })).not.toBeInTheDocument();
  });

  it("keeps independent API keys while models stay internal", async () => {
    render(<OptionsApp />);
    const providers = await screen.findByLabelText("AI 供应商");
    fireEvent.click(within(providers).getByText("OpenAI").closest("button")!);
    const openAiKey = await screen.findByPlaceholderText("sk-proj-…");
    expect(screen.queryByText("gpt-5.6-luna")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("模型")).not.toBeInTheDocument();
    fireEvent.change(openAiKey, { target: { value: "openai-local-key" } });
    fireEvent.click(within(providers).getByText("DeepSeek").closest("button")!);
    expect(await screen.findByPlaceholderText("sk-…")).toHaveValue("");
    fireEvent.click(within(providers).getByText("OpenAI").closest("button")!);
    expect(await screen.findByPlaceholderText("sk-proj-…")).toHaveValue("openai-local-key");
  });
});
