# TabNexus v2 行动清单（ACTION-ITEMS）

> 依据：[BLUEPRINT.md](BLUEPRINT.md)（唯一执行基线）· 2026-08-15
> 用法：每完成一项打 ✅ 并记录验收结果；任何新增需求先回 BLUEPRINT 对齐。

---

## UI 设计升级（2026-08-15 追加，Chrome 扩展）

| # | 升级 | 状态 |
|---|---|---|
| U1 | 分段式进度条：段=章节（色=章节色、宽∝页数、填充∝阅读进度）、点击段滚动跳转到章节 | ✅ |
| U2 | 章节卡片：色点 + 折叠/展开（▾/▸） | ✅ |
| U3 | 页面引用块：favicon（无图标时首字母兜底）+ 四态状态胶囊配色 + 标题点击打开原页 | ✅ |
| U4 | 侧栏：＋新任务（createTask） | ✅ |
| U5 | 验证：201 单测 + 6 E2E + 零页面错误 + 字号令牌纪律（正文最小 12px） | ✅ |

## GitHub 更新

- 已推送 `codex/codex-installer-v1.0.5`（1270610）；`main` 受分支保护，走 [PR #24](https://github.com/KaichenCurry/TabNexus/pull/24)（已包含全部最新提交，可审查合并）。

## 总览

| 阶段 | 目标 | 预估 | 状态 |
|---|---|---|---|
| R0 地基 | 设计令牌 + v2 术语 + Schema v2 数据层 | 2–3 天 | 🔵 进行中 |
| R1 任务文档 | 新外壳：首启/任务头/章节/引用块/结论/Inbox/Popup/⌘K + 迁移 | 1–2 周 | ⚪ |
| R2 Agent 闭环 | Context Packet v2 + MCP 适配 + Handoff + 写回 + Timeline | 5–7 天 | ⚪ |
| R3 画布 | Excalidraw 一级视图 + AI 整理画布 + MCP 画布 3 工具 | 1–2 周 | ⚪ |
| R4 DSH 生态 | L1 直连 → L2 Skill/Preset → L3 Cordis 插件包 | L1=1–2 天 | 🔵 L1 进行中 |

**并行策略**：R4-L1 与 R0 同步开工；R1→R2→R3 严格按序。

---

## R0 地基（进行中）

| # | 任务 | 产出 | 验收 |
|---|---|---|---|
| R0.1 | 设计令牌收敛 | `v2/tokens.css`（主色 1 + 灰阶 5 + 字号 5 + 圆角 3 + 间距 4px 栅格） | 新组件只允许引用令牌 |
| R0.2 | v2 术语 | i18n 新增键：AI 一键整理 / 收件口 / 画布 / AI 总结 / 让 Agent 继续 / 收进任务 / 已排除等 | v2 界面零旧术语；旧键在旧壳退役时删除 |
| R0.3 | Schema v2 数据层 | `v2/core/taskModel.ts`：Task/Section/Page 类型 + `computeProgress` + `migrateWorkspaceToTask`（纯函数） | 单测覆盖：进度聚合、迁移、回滚 |
| R0.4 | 测试保持绿 | 每步跑 `pnpm check` | 189 测试 + typecheck 全绿 |

**执行注记**：旧壳将在 R1 整体退役，因此 R0 不做旧 UI 的修补（避免无效工作）；R0 只产出会进入 v2 的地基。

---

## R1 任务文档（进行中）

| # | 任务 | 状态 |
|---|---|---|
| R1.1 | ✅ `src/v2/` 骨架：TaskApp（编排）+ TaskHeader/ProgressBar/SectionList/PageBlock/ConclusionBlock/FirstRun | 完成 |
| R1.2 | ✅ 空状态首启「这次你想搞清楚什么？」 | 完成 |
| R1.3 | ✅ 任务头 + 分段式进度条（派生 computeProgress，可交付态高亮） | 完成 |
| R1.4 | ✅ 自由章节 + Page 引用块（四态勾选/备注正面/排除原因/移动章节） | 完成 |
| R1.5 | ✅ 结论区（AI 总结按钮 R2 接线） | 完成 |
| R1.6 | ✅ Inbox Drawer（收进任务 N / 保存并关闭 / 已保存折叠 / 最近关闭恢复） | 完成 |
| R1.7 | ✅ 工具栏 Popup（保存当前页 / 选择窗口页面 / 打开任务文档，manifest default_popup） | 完成 |
| R1.8 | ✅ ⌘K 命令面板（任务切换/新建章节） | 完成 |
| R1.9 | ✅ 日常底座接入（采集/保存并关闭/固定标签保护/恢复/删除确认/最近关闭/去重） | 完成 |
| R1.10 | ✅ 旧壳退役（删除 WorkspaceApp/FlowCanvas/GroupPanel/OpenTabsRail/CardRow/CardStatusButton/WorkspaceModals/TutorialDialog/drag 共 9 文件 + workspace-ui.test）+ `v2ShellEnabled` 默认翻转 + E2E 重写为 v2 场景（6 场景） | 完成 |
| R1.11 | ✅ 测试同步：196 单测（28 文件）+ 6/6 E2E 全绿；修复 v1 潜伏 bug——revision 哈希对对象键序敏感，chrome.storage 往返后键序漂移导致"Workspace changed"误报（stableStringify 修复，collaboration + background 两处） | 完成 |

**已验证据（2026-08-15）**：v2 外壳经 Playwright 实测——文档态渲染正确（章节/未归类/结论齐全）；首启态正确；**字号恰好 5 档（12/13/14/16/20）对比旧壳 30 种**；色板全部来自令牌（对比旧壳 40+ 组合）；零页面错误；数据层 12/12 单测 + 全量 `pnpm check` 绿。截图在 `artifacts/ux-audit-v2/`。

**R1.9.5 追加完成（任务链"整/结"闭环，2026-08-15）**：
- ✅ AI 一键整理四模式（按内容理解/按时间/按域名/自定义提示词）+ 预览 + 应用 + 撤销——功能 e2e 实测通过（按时间预览「今天 2/本周 1/更早 1」→ 应用生成 3 章节 → 撤销归零；按域名正确归组）；
- ✅ 导出弹窗（Markdown/JSON 复制/下载）；
- ✅ AI 总结（新后台请求 SUMMARIZE_TASK，只传元数据；结论区一键总结写回 summary/conclusion/nextStep）；
- 验证脚本：`scripts/verify-organize.mjs`（可重复回归）。

---

## R2 Agent 闭环（✅ 完成）

| # | 任务 | 状态 |
|---|---|---|
| R2.1 | ✅ Context Packet v2（`v2/core/contextPacket.ts`：任务元数据/进度/章节页/未归类 + excludes 声明；Markdown 渲染；2 项单测） | 完成 |
| R2.2 | ✅ MCP 适配层：`read_workspace` 摘要新增 `v2` 元数据（目标/下一步/结论）与 `excludedReason`；`edit_workspace.update_card` 与 `add_cards` 接受 `excluded` 状态 + 排除原因写入 | 完成 |
| R2.3 | ✅ Agent Handoff 面板（「让 Agent 继续」：上下文预览/复制/打开 DSH；提供与不提供清单明示；有页面才可用） | 完成 |
| R2.4 | ✅ SKILL.md 同步 Context Packet 章节（Agent 侧对齐；已同步到 ~/.agents/skills） | 完成 |

**验证据（2026-08-15）**：功能 e2e（`scripts/verify-handoff.mjs`）——Handoff 面板含排除原因/进度/隐私声明；`read_workspace` 摘要返回 v2 元数据与 excludedReason；`update_card` 写入排除原因后存储状态正确。198 单测 + 6 E2E 全绿。

---

## R3 关系图（✅ 完成，2026-08-15 修订：不做 Excalidraw，改为简单关系图）

用户拍板修订：**先不做 Excalidraw 画布，只做简单的关系图**。

| # | 任务 | 状态 |
|---|---|---|
| R3.1 | ✅ 简单关系图（纯 SVG 零依赖）：章节泳道 + 页节点（状态字形/描边）+ 带标签箭头；关系数据 = 任务 edges（v1 兼容）；点击节点打开原页 | 完成 |
| R3.2 | ✅ 布局纯函数 `v2/core/relation.ts`（3 项单测：泳道/边/空任务） | 完成 |
| R3.3 | ✅ 功能验证 `scripts/verify-relation.mjs`：3 节点 2 边渲染、标签正确、点击开原页、截图 06-v2-relation.png | 完成 |
| R3.4 | ⏸️ 搁置：AI 整理画布 / MCP 画布 3 工具（用户改简单关系图后暂不需要；关系建议走现有 `propose_structure`） | 搁置 |

**说明**：已卸载 @excalidraw/excalidraw + pako；manifest 保持最小权限（无 unlimitedStorage）；SKILL.md 已同步（Agent 建议关系一律走 propose_structure）。

---

## R4 DSH 生态（✅ 真·DSH 插件已交付并实证）

| # | 任务 | 依赖 |
|---|---|---|
| R4.1 | ✅ **L1 MCP 直连**：`mcp:test` 17/17、36/36；`docs/DSH_PLUGIN.md`（schema 已按本机源码校正） | 无 |
| R4.2 | ✅ **插件生态 Agent**：`agent/dsh/` —— preset（persona+skill+mcp-client，对齐 v2 蓝图）+ `skills/tabnexus/SKILL.md`（v2 产品基线/17 工具/工作流/红线）+ README；已安装到 `~/.dsh/.agent-presets/tabnexus-research` 与 `~/.agents/skills/tabnexus` | R4.1 |
| R4.3 | ✅ **真·DSH 插件 `dsh-plugin-tabnexus`**（社区规范：npm 包 host+client 双面 / cordis.patch.yml / dsh.bundle 元数据 / `dsh plugin add` 安装）——11 项离线冒烟 + dump-config 组合树 + **headless 会话全链路实证**（Agent 调用 read_workspace 正确答出「浏览器调研 · 2 章节 4 页面」）；已装入本机 web profile（重启生效） | R4.2 |
| R4.4 | ⚪ npm 发布（dsh-plugin topic / 徽章 / 发布版 npx tarball mcpArgs） | R4.3 |
| R4.5 | ✅ 预设与 Skill 保留为会话级增强（persona/工作流/红线） | R4.2 |
| R4.6 | ✅ README 徽章（DSH 插件生态）+「一切皆插件 —— 那浏览器里那 50 个 Tab，也该是。」 | R4.1 |

**验证证据（2026-08-15）**：① 预设发现 `scanRoot` → `broken: null`、元数据正确；② mcp-client 配置（dogfood + 发布版）通过真实 `dsh-mcp-client` Config schema 校验，reconnect 默认自动补齐；③ 组合引用的 5 个包在 web profile node_modules 全部可解析；④ web 组合含 `agent-presets`（预设选择器路径有效）；⑤ **运行中的 DSH 会话已热发现 `tabnexus` skill（本会话技能目录实时出现）**；⑥ headless 不含预设栈（预设属 web 层），故会话级挂载需在 Web GUI 验收。

---

## 贯穿全程

- **红线**：隐私边界（不发正文/Key）· 破坏性确认 + revision/幂等 · MCP 契约只做加法 · 双语 + `pnpm check` 全绿。
- **旧资产退役清单**（R1.10/R3.6 执行）：WorkspaceApp / FlowCanvas / GroupPanel / OpenTabsRail / @xyflow/react。
- **引擎复用清单**（永不重写）：采集、URL 标准化去重、save/close/reopen、固定标签保护、storage、AI Provider 请求层、MCP bridge、revision/幂等/确认/活动记录、发布脚本、测试基建。
- **成功指标**：北极星=每周完成的任务数；P1 7 日回访 ≥40%；P2 交接 ≤10s；P3 完成率 ≥30%。
