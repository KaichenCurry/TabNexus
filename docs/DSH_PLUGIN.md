# TabNexus × DSH 插件生态接入指南（R4）

> 依据：[BLUEPRINT.md](product/BLUEPRINT.md) §11 · 2026-08-15
> 口号：**「一切皆插件 —— 那浏览器里那 50 个 Tab，也该是。」**
> 诚邀全球 Harness 开发者共建 DSH 插件生态。

---

## Layer 1 · MCP 直连（进行中）

### 1.1 已验证事实 ✅（2026-08-15 实测）

- `pnpm mcp:test`：**17/17 工具、36/36 确定性检查全部通过**（stdio JSON-RPC）；
- DSH 的 `dsh-mcp-client`（本机 `@deepseek-ai/dsh@0.1.0-rc.6` 源码核验）官方描述：
  *"connects to MCP servers and registers their tools on ctx.tools"*，支持 stdio / Streamable HTTP；
- 工具会注册为 **`mcp__tabnexus__<toolName>`**（如 `mcp__tabnexus__read_workspace`）；
- 配置字段已按源码 schema 校正（下附）。

### 1.2 前置条件

1. Chrome 已加载 TabNexus 扩展（`dist/` 或安装包）；
2. 扩展 设置 → 连接你常用的 Agent → 启用**本机 Agent 连接**；
3. 本机 Node.js ≥ 22.13（现有运行环境已满足）。

### 1.3 DSH 配置（字段已按官方 schema 校正，照抄即可）

```yaml
# dsh 的 cordis 配置（多实例：插件名恒为 mcp-client，#tabnexus 是实例名）
plugins:
  mcp-client#tabnexus:
    transport: stdio
    serverName: tabnexus          # 必填，[A-Za-z0-9_-]{1,32}
    command: npx                  # 开发期也可用 node + 绝对路径（见下）
    args: ['-y', 'https://github.com/KaichenCurry/TabNexus/releases/download/v1.0.5/tabnexus-mcp-runtime-1.0.5.tgz']
    env: {}
    cwd: .
    toolCallTimeoutMs: 60000
    failOnStartupError: true      # 首次连接/工具同步失败即加载失败（dsh 约定）
    # reconnect 可省略：默认启用，1s 起指数倍增，10 次上限
```

**本地开发版**（直接用仓库源码，免发布）：

```yaml
    command: node
    args: ['/Users/chen/Desktop/TabNexus/agent/bridge/tabnexus-mcp.mjs']
    env:
      TABNEXUS_AGENT_NAME: DSH
```

### 1.4 验证步骤

1. 在 dsh 会话中调用 `mcp__tabnexus__read_workspace`（detail: summary）；
2. 预期返回：当前任务/工作区的章节、页面、状态与 revision；
3. 尝试 `mcp__tabnexus__add_card` 后确认 Chrome 扩展界面实时出现新卡片。

---

## Layer 2 · Skill + Research Preset（待 R2 后）

`tabnexus-research` 预设要点（详见 BLUEPRINT §11）：

- 先读任务上下文；尊重已排除 Page；不重复用户否定的方向；
- 产出写回任务文档（结论/下一步/Page/Artifact）；
- 结构修改先预览；关闭浏览器标签等副作用必须确认；
- 不含 shell 等危险工具。

## Layer 3 · 正式 Cordis 插件包（待 DSH 接口稳定）

服务定义 / 提供方 / 消费方三角色拆分，工程约定见 BLUEPRINT §11 与 dsh 官方 CONTRIBUTING。

---

## 生态事实来源

- [iThome：DeepSeek Harness 公测，同步开放插件生态](https://www.ithome.com/0/989/446.htm)
- [InfoQ：模型、工具、Agent Loop 全是插件](https://www.infoq.cn/article/de9AljWc4ej2WKAyW8dD)
- [Oh-My-DSH 社区插件目录](https://github.com/like-study1/Oh-My-DSH)
- 仓库：github.com/deepseek-ai/deepseek-harness · npm：@deepseek-ai/dsh
