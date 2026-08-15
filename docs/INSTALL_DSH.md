# TabNexus DSH 插件 · 安装教程

> **「一切皆插件 —— 那浏览器里那 50 个 Tab，也该是。」**
> 装上后，你的任何 DSH 会话都拥有 17 个 `mcp__tabnexus__*` 工具，并在界面右上角出现 TabNexus 工作区面板。

## 前置条件（一次性）

1. 已安装 [TabNexus Chrome 扩展](INSTALL_CHROME.md)（v2.0.0）；
2. 扩展内：设置 → 连接你常用的 Agent → 启用**「本机 Agent 连接」**；
3. 本机 Node.js ≥ 22.13（DSH 本身已带）。

## 方式一：Release 包安装（推荐）

```bash
# 下载并安装（pnpm 需要在 PATH；DSH 用 dsh plugin 命令）
curl -LO https://github.com/KaichenCurry/TabNexus/releases/download/v2.0.0/dsh-plugin-tabnexus-0.1.0.tgz
dsh plugin --profile web add ./dsh-plugin-tabnexus-0.1.0.tgz
```

然后 **重启 DSH**（退出 `dsh web` 重新启动；浏览器页面 Cmd+Shift+R 强刷）。

> 插件默认通过 `npx -y <tabnexus-mcp-runtime-2.0.0.tgz>` 启动桥接，无需源码、无需本机路径。

## 方式二：源码目录安装（开发者）

```bash
git clone https://github.com/KaichenCurry/TabNexus.git
cd TabNexus/agent/dsh/plugin
npm install --ignore-scripts && npm run build   # 或 pnpm install && pnpm build
dsh plugin --profile web add "$(pwd)"
```

重启 DSH 生效。

## 验证安装

1. DSH 页面右上角（session log 按钮正下方）出现 **TabNexus 工作区** 徽章；
2. 点击徽章 → 工作区面板打开（任务/章节/页面/状态/移动/收件口），绿点=扩展已连接；
3. 任意会话里说：**"读一下我的当前任务，告诉我做到哪了、还缺什么。"**——回复即来自你的真实浏览器任务。

## 可选增强：Agent 预设与技能

让 Agent 更懂怎么用（先读后写、尊重排除项、破坏性确认等行为准则）：

```bash
# 预设：~/.dsh/.agent-presets/tabnexus-research/
mkdir -p ~/.dsh/.agent-presets/tabnexus-research
cp <repo>/agent/dsh/preset/tabnexus-research/* ~/.dsh/.agent-presets/tabnexus-research/
# 技能：~/.agents/skills/tabnexus/SKILL.md
mkdir -p ~/.agents/skills/tabnexus
cp <repo>/agent/dsh/skills/tabnexus/SKILL.md ~/.agents/skills/tabnexus/
```

之后新建会话时在预设选择器选 **「TabNexus Research」**。

## 常见问题

| 问题 | 解法 |
|---|---|
| 工具报 "TabNexus is not connected" | 打开扩展一次，并在扩展设置启用「本机 Agent 连接」 |
| 面板空白/加载失败 | 面板右上角「刷新」；确认扩展已启用桥接 |
| 设置里看不到插件 | `dsh plugin add` 后必须**重启 DSH** |
| 徽章挡住按钮 | 徽章/面板均不拦截点击（pointer-events 透明），可放心 |
