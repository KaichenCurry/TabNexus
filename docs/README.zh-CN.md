# TabNexus

> 把堆积的浏览器标签变成可以恢复、理解，也可以交给 AI Agent 使用的工作区。

[English](../README.md) · [快速开始](#快速开始) · [MCP 能力矩阵](MCP_CAPABILITY_MATRIX.md)

![TabNexus 工作区预览](assets/tabnexus-workspace.png)

**当前版本：v0.17.0 开发者预览。** 已可通过 Chrome 开发者模式使用，暂未发布 Chrome Web Store。

## 标签太多只是表象，真正的问题是任务上下文会丢失

浏览器里的几十个标签，通常对应多个尚未完成的任务：一项产品调研、一次旅行规划、一组开发资料、几篇稍后阅读的文章。Chrome 能记住页面仍然开着，却不知道它们为什么属于同一件事、哪些已经读过、下一步应该做什么。

- 书签保存了 URL，但容易失去任务结构和进度。
- 标签分组与会话管理器擅长恢复窗口，但不负责长期知识整理。
- 知识库适合沉淀结果，却需要手动把浏览器上下文搬进去。

TabNexus 把这三段流程连在一起：从当前窗口直接保存资料，在本地工作区中整理和理解，再把相同的结构安全地交给 AI Agent 使用。

## 你真正获得什么

- **敢于关闭标签。** 页面保存后即使离开网站或关闭原标签，工作区卡片仍然存在；恢复时不会重复打开已有页面。
- **几秒恢复一项任务。** 分组、顺序、备注、阅读状态和关系图都会持久保留。
- **按自己的意图整理。** 可以要求 AI 按网页类型、访问时间、任务阶段、优先级或任意自定义规则分类。
- **让 Agent 直接使用上下文。** Codex、Claude、Cursor、VS Code 和 TRAE 可以通过本地 MCP 读取并操作相同工作区。
- **保留数据控制权。** 工作区和模型密钥保存在 Chrome 本地；没有 TabNexus 账号，也没有 TabNexus 云端。

## 三个核心能力

### 1. 从标签堆积到可恢复的工作区

在右侧标签操作台多选当前窗口页面，保存到工作区；需要时再明确选择“保存并关闭”。工作区支持多项目隔离、分组、拖拽、备注、阅读状态、筛选、Markdown/JSON 导出，以及单卡片、分组或整个工作区恢复。

### 2. 按用户意图工作的 AI 整理

选择整个工作区或右侧勾选的标签，描述你真正想要的分类方式。模型会返回分类依据、分组和每个页面的去向；应用前可以改名或重新分配。内置适配 DeepSeek、OpenAI、Claude、Kimi、Qwen 与 MiniMax，也可以在无密钥时使用本地域名分组。

相同资料可以切换到 Obsidian 风格的无限关系画布，支持拖拽、框选、缩放、画布移动、持久位置和可编辑关系线。

### 3. 人与 Agent 共用一套浏览器上下文

本地 MCP 提供 17 个工具，覆盖工作区、分组、卡片、备注、状态、顺序、关系图、标签多选、保存、恢复、导出和受保护的关闭/删除操作。所有写入都有 revision 与幂等 operation ID；危险操作必须携带用户最新消息中的明确确认原文。

## 快速开始

要求：Chrome 118+、Node.js 22+、pnpm 11。

```bash
git clone https://github.com/KaichenCurry/TabNexus.git
cd TabNexus
corepack enable
pnpm install
pnpm build
```

然后：

1. 打开 `chrome://extensions`。
2. 开启“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择项目生成的 `dist` 文件夹。
5. 固定 TabNexus，点击工具栏图标打开工作区。

## 连接 AI Agent

重新加载扩展后，进入 **设置 → 连接你的 AI 助手**。Codex、Claude Desktop、Claude Code、Cursor、VS Code 与 TRAE 使用同一套本地 MCP `0.8.0 / 17 tools` 协议。Coze 需要后续独立发布带认证的远程 MCP 网关。

详细安装与测试方法见 [Agent 客户端适配](AGENT_CLIENT_ADAPTERS.md) 和 [MCP 测试指南](MCP_TESTING.md)。

## 隐私与安全

- 不读取网页正文，不申请 `<all_urls>`、内容脚本、下载或浏览器历史权限。
- 模型密钥只保存在 `chrome.storage.local`，不会进入 MCP、导出或日志。
- AI 请求只发送执行当前操作必要的卡片元数据。
- MCP 只监听 `127.0.0.1`，固定标签永远不会被 MCP 关闭。
- 删除、关闭等危险动作要求用户明确确认，并校验确认原文。

## 参与贡献

欢迎提交问题、体验反馈、文档改进、模型适配、无障碍优化和聚焦的 Pull Request。请先阅读 [CONTRIBUTING.md](../CONTRIBUTING.md) 与 [CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md)。

TabNexus 使用 [MIT License](../LICENSE)。
