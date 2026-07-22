<div align="center">
  <img src="extension/public/icons/icon128.png" width="88" alt="TabNexus 图标" />
  <h1>TabNexus</h1>
  <p><strong>你开的不是标签页，是一件还没做完的事。<br/>TabNexus 把散乱 Tabs 变成你和 AI 都能接着用的任务上下文。</strong></p>
  <p>本地优先的 Chrome 扩展 · AI API 按意图整理 · 可选 MCP Agent 协作</p>

  <p>
    <a href="#why">为什么</a> ·
    <a href="#what">它是什么</a> ·
    <a href="#features">核心能力</a> ·
    <a href="#start">两分钟上手</a> ·
    <a href="#agent">连接 Agent</a> ·
    <a href="docs/README.en.md">English</a>
  </p>

  <p>
    <img alt="Chrome MV3" src="https://img.shields.io/badge/Chrome-Manifest_V3-4285F4?logo=googlechrome&logoColor=white" />
    <img alt="Workspace 本地存储" src="https://img.shields.io/badge/Workspace-local_storage-2F855A" />
    <img alt="MCP 工具" src="https://img.shields.io/badge/MCP-17_tools-6750D8" />
    <img alt="CI" src="https://github.com/KaichenCurry/TabNexus/actions/workflows/ci.yml/badge.svg" />
    <img alt="MIT License" src="https://img.shields.io/badge/license-MIT-20232A" />
  </p>
</div>

<picture><img src="docs/assets/tabnexus-after.png" alt="TabNexus 将标签整理为可继续推进的任务上下文" /></picture>

<div align="center"><sub>把网页保存成带分组、备注、状态和关系的 Workspace。原标签放心关掉，需要时一键恢复。</sub></div>

> [!IMPORTANT]
> **当前为 v0.17.0 开发者预览版。** 已提供可直接加载的 Chrome 安装包，Chrome Web Store 版本尚未发布。→ [两分钟上手](#start)

<a id="why"></a>
## 😵 你不敢关的不是 Tab，而是没做完的任务

上一次打开 20 个标签页时，你大概不是在闲逛，而是在**调研一家公司、比较几个方案，或排查一个 Bug**。每张网页都是同一个目标的参考：

~~~mermaid
flowchart LR
    Intent["🎯 意图<br/>调研一家公司"] --> Tabs["📑 Tabs<br/>产品 · 财报 · 竞品 · 评论"]
    Tabs --> Context["🧠 上下文<br/>证据 · 备注 · 关系 · 进度"]
    Context --> Output["✅ 产出<br/>判断 · 报告 · 决策"]
~~~

浏览器记得你打开了什么，却不知道你为什么打开、哪些是证据、任务进行到哪一步。你怕的不是丢掉 URL，而是**连当时的思路一起丢掉**。

<picture><img src="docs/assets/tab-overload-hero.jpg" alt="大量浏览器标签堆积造成的多 Tab 焦虑" /></picture>

Toby、OneTab、Workona 等传统 Tab 工具验证了保存与分组的需求，但仍很难保留任务意图、关系和进度。到了 AI 时代，标签更多了；想把资料交给 AI，你还要逐条复制链接、重讲背景，或让 Computer Use / Playwright 逐页操作——在这类上下文传递中通常更慢，也会消耗更多 token。

**TabNexus 的出发点只有一句：别再把 Tab 当 Tab 管，把它当任务上下文。**

<a id="what"></a>
## ✨ TabNexus：把 Tabs 变成可继续的任务上下文

TabNexus 是一个 Chrome 扩展。它把一次散乱的浏览器会话收进持久的 **Workspace**，让你、浏览器和 AI 操作同一份上下文：

~~~mermaid
flowchart TB
    Context["📦 Workspace<br/>网页 · 分组 · 备注 · 状态 · 关系"]
    User["👤 你<br/>设定目标 · 确认变更"] <--> Context
    Browser["🌐 Chrome<br/>采集 · 关闭 · 恢复"] <--> Context
    API["✨ AI API（默认）<br/>按意图分类"] <--> Context
    Agent["🤖 MCP Agent（可选）<br/>读取 · 补充 · 写回"] <--> Context
~~~

| 方式 | 能做到 | 仍然缺少 |
|---|---|---|
| 书签 / Tab Manager | 保存页面、恢复窗口 | 任务意图、结构和进度 |
| 按域名自动分组 | 知道页面来自哪里 | 知道你为什么打开它 |
| 复制链接 / 浏览器自动操作 | 把网页交给 AI | 高效、完整、可复用的上下文 |
| **TabNexus** | **按意图整理，再通过一个接口继续** | **你只需定目标并审核关键变更** |

AI 有两条独立路径，先满足普通用户，再服务进阶协作：

| 路径 | 适合谁 | 作用 |
|---|---|---|
| **AI API（默认路径）** | 想快速整理标签的每个人 | 在 Workspace 内接入 DeepSeek 等模型，用自己的 Query 和意图分类；先预览，再应用 |
| **MCP Agent（可选进阶）** | 需要继续研究、写作或编码的人 | 让支持 MCP 的 Agent 读取上下文、补充资料、写回报告并建议任务结构 |

它适合研究者、产品经理、开发者，以及所有被几十个“不敢关”的标签困住的人。

<a id="features"></a>
## 🧩 同一份上下文，三层能力

### 1️⃣ 标签与 Workspace：保存之后，放心清空标签栏

从当前 Chrome 窗口勾选同一任务的网页，完成**采集、分组、保存**。保存后可以关闭原标签：卡片仍在本地 Workspace 中，随时恢复一张、一个分组或整个工作区。

- 保存与关闭是两个明确动作，关闭标签不会删除卡片；
- 支持多 Workspace、拖拽分组、备注、去重和 Markdown / JSON 导出；
- 已打开的 URL 不会重复恢复，固定标签不会被批量关闭。

<picture><img src="docs/assets/tabnexus-before.png" alt="整理前：当前窗口中待保存的多个标签" /></picture>

### 2️⃣ 任务思路：卡片、关系与进度

**卡片看板**用来分组、写备注和推进“待读 / 已读 / 已采用”；**流程 / 关系图**把证据、结论、依赖和下一步连成结构。位置与连线持续保存，下次回来，思路还在原地。

这里也是 AI API 的主入口。你可以说“按市场 / 产品 / 技术 / 财务分类”，也可以说“按发现问题 → 比较方案 → 得出结论组织”。AI 先给出依据和变更预览，由你确认后生效。支持 DeepSeek、OpenAI、Claude、Kimi、通义千问和 MiniMax；没有 Key 也可拖拽或使用本地域名分组。

| 卡片看板 | 流程 / 关系图 |
|---|---|
| <picture><img src="docs/assets/tabnexus-workspace.png" alt="TabNexus 卡片工作区与当前标签操作台" /></picture> | <picture><img src="docs/assets/tabnexus-relationship-map.png" alt="TabNexus 无限关系图与任务结构" /></picture> |

### 3️⃣ Agent 协作：停止充当“人肉 API”

当任务需要继续调研、补资料或写报告时，Agent 通过本地 MCP 一次拿到已经整理好的分组、备注、关系和进度，不必让你复制十几个链接，也不必逐页操作浏览器。

Agent 可以搜索 Workspace、添加网页或笔记、更新状态与分组、建议关系结构并写回报告。关键写入支持版本校验并记录活动，关闭或删除等破坏性操作必须由你确认。

| 连接常用 Agent | 查看 Agent 的读取与写回 |
|---|---|
| <picture><img src="docs/assets/tabnexus-agent-connect.png" alt="TabNexus 的 Agent 连接页面" /></picture> | <picture><img src="docs/assets/tabnexus-agent-activity.png" alt="TabNexus Agent 活动与写回记录" /></picture> |

<a id="start"></a>
## 🚀 两分钟安装，并完成第一次整理

1. **安装扩展：** 下载并解压 [TabNexus Chrome 安装包](https://github.com/KaichenCurry/TabNexus/releases/download/v0.17.0/TabNexus-Chrome-v0.17.0.zip)，打开 <code>chrome://extensions</code>，开启**开发者模式**并选择**加载已解压的扩展程序**。
2. **保存一个任务：** 打开 TabNexus，勾选属于同一任务的网页并点击**保存**。现在可以放心关闭原标签。
3. **按意图整理：** 直接拖拽，或在设置中填入模型 API Key，让 AI 助手“按照我的调研目标分类”。
4. **继续推进：** 在看板或关系图中标记进度，需要时恢复卡片、分组或整个 Workspace。

到这里已经可以完整使用 TabNexus——**不需要 Agent，也不需要终端**。

<details>
<summary><strong>从源码构建</strong></summary>

需要 Node.js 22+ 与 pnpm 11。

~~~bash
git clone https://github.com/KaichenCurry/TabNexus.git
cd TabNexus
corepack enable
pnpm install --frozen-lockfile
pnpm build
~~~

然后在 <code>chrome://extensions</code> 中加载生成的 <code>dist</code> 目录。

</details>

<a id="agent"></a>
## 🤖 需要时，再让 Agent 接手

基础整理到上一步就结束；有持续研究、写作或编码需求时，再打开**设置 → 连接你常用的 Agent**。本地 MCP 提供 **17 个聚焦工具**，覆盖 Workspace、卡片、关系图、导出与标签操作。

<details>
<summary><strong>已支持的客户端与技术文档</strong></summary>

| 客户端 | 状态 | 接入方式 |
|---|:---:|---|
| Codex | ✅ | 仓库插件包 |
| Claude Desktop / Claude Code | ✅ | MCPB / Marketplace 插件 |
| Cursor / VS Code / TRAE | ✅ | 本地 MCP 配置 |
| 扣子 Coze | 规划中 | 鉴权远程 MCP 网关 |

[客户端适配说明](docs/AGENT_CLIENT_ADAPTERS.md) · [能力矩阵](docs/MCP_CAPABILITY_MATRIX.md) · [测试指南](docs/MCP_TESTING.md)

</details>

## 🔒 本地优先，边界清晰

- TabNexus 无账号、无自建云端；Workspace 和模型 Key 保存在 Chrome 本地存储；
- 只有主动调用 AI 时，必要的卡片元数据才会发往所选模型服务，备注和模型 Key 不会发送；
- MCP 只监听 <code>127.0.0.1</code>，不会向 Agent 暴露模型 Key；
- 不使用内容脚本、<code>&lt;all_urls&gt;</code>、<code>webRequest</code>、下载权限或新标签页劫持；
- 关闭、删除等破坏性操作需要明确确认，导出不含凭据。

发现安全问题请阅读[安全策略](.github/SECURITY.md)，并使用 GitHub 私密漏洞报告。

## 🛠️ 已实现与下一步

**v0.17.0 已实现：**多 Workspace 的采集 / 保存 / 恢复闭环、按意图的多模型 AI 分类与可编辑预览、持久化关系画布、17 工具本地 MCP、中英双语界面。自动化基线为 106 项测试、17/17 MCP 工具、36/36 确定性能力检查。

**接下来：**Chrome Web Store 上架、面向云端 Agent 的鉴权远程 MCP、无障碍与大型 Workspace 性能。详见[实现状态](docs/IMPLEMENTATION_STATUS.md)和 [PRD](docs/product/PRD.md)。

技术栈：React · TypeScript · Vite · Vitest · Playwright · Chrome Manifest V3 · Model Context Protocol。

## 🌱 一起构建浏览器与 Agent 之间的上下文层

浏览器上下文既私人又关键，所以数据边界应该可检查、Agent 接口应该可扩展，产品方向也应该由真正被标签困扰的人共同塑造。

- 🐛 提交 [Issue](https://github.com/KaichenCurry/TabNexus/issues/new/choose)
- 💬 加入 [Discussions](https://github.com/KaichenCurry/TabNexus/discussions)
- 🔧 阅读[贡献指南](.github/CONTRIBUTING.md)
- 📮 联系：[currykchen@hotmail.com](mailto:currykchen@hotmail.com)

## 📄 License

[MIT](LICENSE)

---

<div align="center">
  <strong>浏览器记得你打开了什么。<br/>TabNexus 记得你为什么打开、做到了哪里，以及接下来由谁继续。</strong>
</div>
