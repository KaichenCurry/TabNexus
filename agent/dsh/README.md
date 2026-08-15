# TabNexus × DSH 插件生态

> **📌 独立版（零 Chrome 依赖）已发布到专用仓库：[KaichenCurry/TabNexus-DSH](https://github.com/KaichenCurry/TabNexus-DSH)（topic: dsh-plugin）。DSH 用户请优先使用独立版：装完即用，无需先装 Chrome 扩展。本目录保留扩展增强版（浏览器采集能力）与预设/技能。**

> **「一切皆插件 —— 那浏览器里那 50 个 Tab，也该是。」**
> TabNexus for DSH：把浏览器里散落的任务上下文，变成 Harness 可直接调用的插件化记忆。
> 诚邀全球 Harness 开发者共建 DSH 插件生态。

## 交付物一览

| 组件 | 形态 | 说明 |
|---|---|---|
| **`dsh-plugin-tabnexus`** | ✅ 真·DSH bundle 插件（npm 包） | host 面：挂载 MCP 客户端注册 17 个 `mcp__tabnexus__*` 工具 + 状态路由；client 面：浏览器状态徽章；`cordis.patch.yml`；`dsh plugin add` 安装 |
| `tabnexus-research` 预设 | ✅ | Tab Agent persona + skill 加载 + 工具（会话级可选增强） |
| `tabnexus` Skill | ✅ | v2 产品基线 / 17 工具速查 / 工作流 / 七条红线（`~/.agents/skills`） |

## 安装（社区标准方式）

```bash
# 本机（未发布 npm 前用路径安装；pnpm 需在 PATH）
dsh plugin --profile web add /Users/chen/Desktop/TabNexus/agent/dsh/plugin
# 重启该 profile 后生效
```

安装后：组合树出现 `# == dsh-plugin-tabnexus / - id: tabnexus`（`dsh --profile web --dump-config` 可查）；任何会话可直接使用 `mcp__tabnexus__*` 17 工具；浏览器左下角出现 TabNexus 状态徽章（轮询 `/plugins/tabnexus/status`）。

**前置条件**：Chrome 已加载 TabNexus 扩展，设置 → 连接你常用的 Agent → 启用本机 Agent 连接；Node ≥ 22.13。

## 插件结构（社区规范）

```
agent/dsh/plugin/
├── package.json          # exports["."] / ["./client"] / ["./cordis.patch.yml"] + dsh.bundle.patch + dsh.client
├── cordis.patch.yml      # insert 行：id: tabnexus, name: dsh-plugin-tabnexus
├── src/index.ts          # host 面：ctx.plugin(mcp-client) + /plugins/tabnexus/status 路由（可选能力）
├── src/client/index.ts   # client 面：vanilla DOM 状态徽章（tsdown → __ModuleLoader__ closure）
├── tsconfig.json / tsconfig.client.json / tsdown.config.ts
└── scripts/verify.mjs    # 11 项离线冒烟
```

## 怎么用（30 秒上手）

1. **前置**：Chrome 加载 TabNexus 扩展 → 扩展设置「连接你常用的 Agent」→ 启用「本机 Agent 连接」；DSH 已装插件并重启。
2. **直接对话**（任何预设；推荐「TabNexus Research」预设，Agent 会加载 tabnexus 技能）：
   - "读一下我的当前任务，告诉我做到哪了、还缺什么。"
   - "把当前窗口的这几个页面收进我的当前任务。"
   - "帮我把当前任务按背景、证据、反例整理，先给我预览。"
   - "总结这个任务，把结论写回。"
3. **UI 入口**：浏览器右上角（session log 按钮正下方）的 TabNexus 徽章——点击弹出使用面板（状态 + 可复制示例指令）；绿点=扩展已连接。
4. 调用过程以 `mcp__tabnexus__*` 工具行出现在消息流中，可点开查看详情。

## 验证记录（2026-08-15，全部实测）

| # | 验证 | 结果 |
|---|---|---|
| 1 | 离线冒烟 `node scripts/verify.mjs` | ✅ 11/11 |
| 2 | `dsh plugin --profile tabnexus-test add <path>` 安装 + bundles reconcile | ✅ |
| 3 | `--dump-config` 组合树出现插件行 | ✅ |
| 4 | **headless 会话全链路**：DSH → 插件 → mcp-client → tabnexus-mcp → broker → `read_workspace` | ✅ Agent 回复「任务『浏览器调研』共有 2 个章节、4 个页面」，broker 调用记录在案 |
| 5 | 真实 broker（43119，Codex 栈）链路连通 | ✅（扩展桥未开时报 "TabNexus is not connected"，属预期） |
| 6 | 已安装进本机 web profile（重启后生效） | ✅ bundles 含 dsh-plugin-tabnexus |

## 配置（cordis.patch.yml 覆盖）

```yaml
- id: tabnexus
  config:
    bridgePort: 43119      # 与 Chrome 扩展的 MCP 桥端口一致
    mcpCommand: node
    mcpArgs: ['/path/to/tabnexus-mcp.mjs']   # 发布版可换 npx tarball
```

## 发布 TODO

- [ ] npm 发布（`dsh-plugin` topic + README 徽章，参考 github.com/topics/dsh-plugin 生态仓库）
- [ ] 发布版 mcpArgs 改为 `npx -y <release tarball>`
- [ ] GitHub Release 附带打包产物
