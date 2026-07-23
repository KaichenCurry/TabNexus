# TabNexus MCP 本地测试指南

MCP 在 Codex、Claude Desktop、Cursor、VS Code 或 TRAE CN 的对话中使用。TabNexus 不会增加第二个聊天框，普通用户也不需要打开终端。扣子 Coze 入口暂时只保留远程适配状态，不能连接本机 Chrome。

```text
你在自己的 Agent 中输入自然语言
              ↓
Agent 启动 TabNexus MCP
              ↓ 仅本机 127.0.0.1
Chrome 扩展提供工作区和当前窗口标签
              ↓
Agent 读取上下文，或把资料与报告写回 TabNexus
```

设置中选择的 AI 服务只负责 TabNexus 内部的即时整理。外部 Agent 不会调用模型 API，也读不到任何模型密钥。

## 一键自动测试（开发者）

在项目目录运行：

```bash
npm run mcp:test
```

这个命令不调用 Codex、Claude、DeepSeek 或真实 Chrome，也不会产生模型费用。它会启动隔离的本地测试 broker，通过标准 MCP stdio/JSON-RPC 完整验证：

- MCP 版本、17 个工具、四个 Prompt、资源列表与标签操作台资源。
- 工作区读取、搜索、新增、批量新增、报告、关系建议、分类/布局编辑和 Workspace 生命周期。
- 标签操作台共享勾选、折叠、聚焦、最近关闭恢复、按勾选或当前窗口保存/打开/关闭。
- 工作区导出、安全设置读写、协作记录读取/确认清空，以及密钥不泄露检查。
- 固定标签保护、关闭确认、恢复记录删除确认和旧 revision 冲突。

成功时会显示 `17/17 tools` 和 `36/36 checks`。详细报告生成在：

- `tests/evals/tabnexus-mcp/capability-latest.md`
- `tests/evals/tabnexus-mcp/capability-latest.json`

也可以使用不同的 MCP 服务文件或报告目录：

```bash
node scripts/test-mcp-capabilities.mjs --server agent/bridge/tabnexus-mcp.mjs --report-dir tests/evals/tabnexus-mcp
```

## 第一次连接：只做 3 步

1. 打开 TabNexus **设置 → 连接你常用的 Agent**，选择第一个要连接的助手。需要时可以返回列表继续安装其他 Agent。
2. 点击页面里唯一的蓝色安装按钮：
   - **Codex**：点击“在 Codex 中安装”，发送自动填好的安装任务；Codex 会添加 TabNexus 插件并反馈结果。
   - **Claude Desktop**：下载安装包，双击后在 Claude 中点“安装”。
   - **Cursor**：点击“在 Cursor 中安装”，Cursor 打开后点“Install”。
   - **VS Code**：点击“在 VS Code 中安装”，VS Code 打开后点“Install”。
   - **TRAE CN**：点击“在 TRAE CN 中安装”，核对导入内容后点“确认”。
3. 在助手中新建一个对话，回到 TabNexus 点击“检测连接”，再点击“连接后试一句”复制测试问题并粘贴到新对话。

当前源码安装中，Codex 和 Claude Desktop 包已经包含连接程序；Cursor、VS Code 和 TRAE CN 的入口会使用执行 `pnpm build` 时的本地项目路径。因此请在最终保存位置完成构建，不要在构建后移动仓库。

本仓库使用 Codex 标准本地市场结构：`.agents/plugins/marketplace.json` 与 `agent/plugins/tabnexus/`。开发机只需由维护流程注册一次仓库市场；这台测试机已经完成注册，普通测试不需要再运行命令。公开发布后由插件市场接管这一步。

## 只读测试（先做这个）

在 Agent 对话中粘贴：

```text
请使用 TabNexus MCP：先列出可用资源，再读取当前工作区和标签操作台。不要修改任何内容。告诉我工作区名称、已保存卡片数、当前打开数、当前勾选数和两个 revision。
```

正确结果：

- 能看到 `tabnexus://workspaces`、`tabnexus://workspace/...`、`tabnexus://browser/current-window` 和 `tabnexus://workbench/current`。
- 工作区名称、卡片数和当前窗口可支持标签数与 TabNexus 一致。
- 返回 `wsr_...` 格式的 revision。
- TabNexus 的“Agent 活动”出现一次成功的只读记录。

## 写回测试（只读通过后）

```text
请使用 TabNexus MCP 测试写回：先读取当前工作区 revision，然后添加一张标题为“✓ MCP 已连接”的笔记卡，备注为“由本地 Agent 写入，可随时删除”，并使用 operationId manual-mcp-check-v1。完成后告诉我新增卡片 ID。
```

正确结果：

- 工作区实时出现“✓ MCP 已连接”卡片。
- “Agent 活动”出现成功记录。
- 重复发送相同指令不会生成第二张卡片，因为 `operationId` 会复用回执。
- 测试完成后可手动删除这张卡片。

## 完整整理测试

```text
请使用 TabNexus MCP 管理当前工作区：先读取最新 revision，再创建 ID 为 agent_test_group、名称为“Agent 测试”的分组；把“✓ MCP 已连接”移动进去，状态改为“已读”，并把它放到关系图坐标 x=300、y=120。所有修改放在一次 edit_workspace 调用中，不要删除任何资料。
```

正确结果：分组、归类、状态和关系图位置一次出现；Agent 不需要先创建分组、再重新读取 ID。

## 标签安全测试

先在 TabNexus 右侧手动勾选两个普通标签，然后在 Agent 中发送：

```text
读取 tabnexus://workbench/current，告诉我当前勾选的标签。保持这个勾选范围，保存到当前工作区，但不要关闭。必须使用 workbench_selection，不要猜 tabId。
```

正确结果：Agent 读到的勾选数与右侧一致，保存完成后右侧勾选自动清空；工作区出现对应卡片。

```text
请读取 TabNexus 标签操作台，勾选所有“未保存且打开”的普通标签，然后按当前勾选范围保存，不要关闭。完成后告诉我 savedCardIds、duplicateCardIds 和失败数量。
```

确认保存正确后再测试关闭：

```text
请保存后关闭刚才的两个普通标签。先列出即将关闭的 tabId；固定标签必须保留。只有在我确认后才调用 close_browser_tabs。
```

正确结果：新标签先保存为卡片，普通标签关闭，固定标签出现在 `skippedPinnedTabIds` 中并保持打开。

## 常见问题

### 一直显示“尚未连接”

确认 AI 助手正在运行，并在助手中新建对话。回到对应的连接页，点击“检测连接”。连接只发生在这台电脑上。

### Agent 显示 TabNexus 离线

保持 Chrome 运行，并至少打开一次 TabNexus 工作台或设置页。首次安装后应新建 Agent 对话，旧对话可能没有加载刚添加的 MCP 工具。

### Cursor / VS Code / TRAE 找不到连接程序

源码安装配置含有构建时的绝对项目路径。如果项目移动过，请重新运行 `pnpm build`、重新加载扩展，并回到 TabNexus 设置重新安装。未来的签名安装包会移除这项限制。

如果从旧目录布局升级，Agent 配置仍可能指向已经移除的 `bridge/tabnexus-mcp.mjs`。在仓库新位置运行 `pnpm build`，回到设置重新安装对应 Agent，再运行 `pnpm bridge:audit` 检查是否仍有旧路径。

### 为什么扣子不能点击安装

扣子当前没有公开的本地 stdio MCP 客户端，无法安全连接 Chrome 扩展的本地数据。TabNexus 会在发布带身份验证的 HTTPS MCP 网关后再开启扣子适配，不会用假按钮误导用户。

### 端口被占用

新版会自动让 Codex、Cursor、Claude 等客户端共享同一个本地 broker，不需要关闭另一个 Agent。如果仍看到“Another TabNexus Agent connection is already active”，说明至少有一个助手还在运行旧版 MCP：完全退出这些旧对话或重启对应 Agent，再重新打开对话即可。

### 可以同时连接多个 Agent 吗

可以。第一个启动的 TabNexus MCP 进程负责连接 Chrome，之后启动的 Agent 会自动注册到同一个本地 broker。设置页会显示当前连接数量，“Agent 活动”会标记每次操作来自 Codex、Cursor 或其他客户端。两个 Agent 同时写入时会按顺序执行；使用旧 revision 的后一个写入会安全失败并要求重新读取，不会覆盖前一个 Agent 的结果。

### 如何完全关闭

连接成功时，在对应的连接页中点击“断开连接”。所有共享这个本地 broker 的 AI 助手都会立即失去访问能力；工作区数据不会被删除。再到对应助手的扩展设置中卸载 TabNexus 即可。
