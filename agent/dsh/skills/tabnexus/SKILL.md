---
name: tabnexus
version: 2.0.0
description: "TabNexus Tab Agent 技能：用 mcp__tabnexus__* 工具读取/整理/写回浏览器任务上下文（任务文档、章节、页面、状态、排除项、结论、进度）。当用户提到 TabNexus、我的标签、浏览器任务、继续调研、把页面收进任务、整理标签/页面、任务进度，或任何需要读/写 TabNexus 任务档案的请求时使用。"
metadata:
  requires:
    tools: ["mcp__tabnexus__read_workspace"]
---

# tabnexus (v2) — TabNexus Tab Agent 技能

**CRITICAL —— 本技能 = TabNexus 最新产品设计的 Agent 侧实现（对齐 `docs/product/BLUEPRINT.md` v2 蓝图）。改动产品设计时，必须同步更新本文件与 preset。**

---

## 0. 产品基线（2026-08-15 v2 蓝图，必背）

- **定位**：TabNexus 是浏览器与 Agent 之间的**任务上下文层**——把散落的 Tab 变成一份人和 AI 都能继续编辑的任务文档。
- **三大问题**（产品存在的理由）：① 记不住（Tab 只存 URL 不存"为什么"）② 传不走（人肉 API）③ 收不拢（保存即遗忘）。
- **核心对象（v2 术语）**：
  | 概念 | 含义 |
  |---|---|
  | 任务 Task | 一份持续生长的任务文档（= MCP 的 workspace） |
  | 页 Page | 收进任务的文件页（= MCP 的 card） |
  | 章节 Section | 用户自定义的文档结构（= MCP 的 group，自由命名、不固定） |
  | 结论 | 任务当前的答案（写回结论区） |
  | 进度 | 派生值：已读/总数 · ⭐已采用；全部已读且 ≥1 已采用 = 可交付 |
- **任务链五步**：立（这次你想搞清楚什么？）→ 收（收进任务）→ 整（✦ AI 一键整理）→ 读（勾状态写备注）→ 结（AI 总结 / 让 Agent 继续）。
- **双层结构**：日常底座（保存/恢复/删除/关闭，零 AI 依赖）是永远可用的高频层；任务文档/画布/进度条是升级层。
- **AI 一键整理四模式**：按内容理解 / 按时间 / 按域名 / 自定义提示词——每次都是"建议 → 可编辑预览 → 用户确认"，**绝不静默覆盖用户结构**。
- **Excalidraw 画布**（R3 上线）：一级视图，AI 可修改样式与关系（read_canvas / propose_canvas / edit_canvas）。
- **双形态**：Chrome 扩展 = 人的入口；DSH 插件 = Agent 的入口；共享同一份本地数据。
- **口号**：「一切皆插件 —— 那浏览器里那 50 个 Tab，也该是。」

## 1. 概念映射（MCP 契约当前仍是 v1 字段名，含义按 v2 理解）

| v2 概念 | MCP 字段 | 说明 |
|---|---|---|
| 任务 | `workspace` | 任务文档；`workspaceId` 即任务 id |
| 章节 | `group` | 自由章节，`groupId: null` = 未归类 |
| 页 | `card` | 引用块：title/url/note/status |
| 状态 | `card.status` | unread/read/adopted；v2 将新增 `excluded`（已排除 + 排除原因） |
| 目标/下一步 | （R2 前）写入任务级 note 或 report 卡片 | R2 起为独立字段 |
| 结论 | `write_report` 或 report 卡片 | 写入结论区 |
| 进度 | 派生（不落库） | 已读+已采用 / 总数（排除 excluded） |

## 2. 工具速查（17 个，调用名一律带 `mcp__tabnexus__` 前缀）

**Context Packet（用户交接时的输入）**：用户从 TabNexus 的「让 Agent 继续」复制的上下文包（Markdown）包含：任务名、目标、下一步、结论、进度（已读/⭐已采用/已排除）、章节与页（标题/URL/备注/状态/排除原因）。**它不包含网页正文与 API Key**——不要声称读过正文；需要正文时明确告知边界。收到 Packet 后先调用 `read_workspace` 对齐最新状态（Packet 可能过期，以 revision 为准）。

**读（无副作用）**
| 工具 | 要点 |
|---|---|
| `read_workspace` | 先读这个。`detail: summary` 省 token；`sinceRevision` 可跳过未变化；返回 revision 供后续写入校验 |
| `search_cards` | 跨任务搜索；支持 statuses/types/sources/groupIds 过滤 |
| `read_tab_workbench` | 读当前窗口标签操作台（收件口）与选中状态 |
| `manage_preferences` (read) | 读安全偏好 |

**写（带版本/幂等）**
| 工具 | 要点 |
|---|---|
| `add_card` / `add_cards` | 收进新页；add_cards 必须 `expectedRevision` + `operationId` |
| `edit_workspace` | 批量原子编辑：章节增删改名、移动页、更新备注/状态、边 upsert/remove。必须 `expectedRevision` + `operationId` |
| `write_report` | 把报告/结论写回任务（report 页） |
| `propose_structure` | **建议**关系结构 → 用户在 Agent 活动里审查后应用（不要直接改结构时跳过此步） |
| `manage_workspaces` | 建/切/改名/复制任务 |
| `manage_tab_workbench` | 设置收件口选中、折叠、聚焦标签、重开最近关闭 |

**破坏性（必须显式确认）**
| 工具 | 要点 |
|---|---|
| `delete_workspace_items` | `confirm: true` + `confirmationText` 必填 |
| `close_browser_tabs` | 同上；固定标签永不批量关闭；`saveBeforeClose` 默认 true（先存后关） |
| `dismiss_recent_tabs` | 同上（清最近关闭记录） |

**其它**
| 工具 | 要点 |
|---|---|
| `sync_browser_tabs` | save_tabs / open_cards / open_group / open_workspace / focus_card；`scope: workbench_selection` 用用户勾选 |
| `export_workspace` | markdown/json 导出任务档案 |
| `manage_agent_activity` | 读/清协作记录（clear 需确认） |

## 3. 标准工作流

### 3.1 接管任务（一切从这里开始）
1. `read_workspace {detail:"summary"}` —— 拿到任务名、章节、页数、状态分布、revision；
2. 复述给用户：任务目标、做到哪、还缺什么（对应"记不住"痛点）；
3. 若用户说"继续/接着干"：先查已采用与已排除，**不重复被排除页的结论**。

### 3.2 AI 一键整理（✦ 整）
1. 问用户模式：按内容理解 / 按时间 / 按域名 / 自定义提示词；
2. 生成分组建议（新章节名 + 每页归类理由）；
3. 用 `edit_workspace` 前，先向用户展示**可编辑预览**，等确认；
4. 未确认绝不改结构；应用后告知可撤销路径。

### 3.3 一键总结（结）
1. `read_workspace {detail:"full"}` 拿全部标题/备注/状态（**没有正文，不要声称读过正文**）；
2. 生成结构化摘要：目标 → 关键证据（已采用）→ 反例/排除 → 结论草稿 → 下一步；
3. 用 `write_report` 把摘要写回任务（成为结论区内容），并更新下一步。

### 3.4 补充与推进
- 补资料：`add_cards`（带 expectedRevision + operationId）；
- 推进度：`edit_workspace` 的 `update_card` 更新 status（unread→read→adopted）；
- 打开页面：`sync_browser_tabs {action:"open_cards"}` 或 focus_card；
- 关闭标签：`close_browser_tabs` 必须 `confirm:true` + `confirmationText`。

## 4. 红线（违反 = 事故）

1. **隐私**：MCP 只提供标题/URL/备注/状态——没有网页正文。禁止声称"我读了页面内容"；需要正文时明确告诉用户这是 TabNexus 边界。
2. **破坏性确认**：删除、关闭、清记录必须 `confirm: true` + 明确 `confirmationText`；用户表述含糊或否定时一律拒绝（fail closed）。
3. **版本冲突**：返回错误以 `Workspace changed` / `Preferences changed` 等开头 → 重读最新上下文后重试，不要覆盖。
4. **幂等**：每个写操作携带 `operationId`（1–120 位 `[A-Za-z0-9._:-]`）；同 operationId 重试会返回原结果，不会重复执行。
5. **尊重排除**：status 为排除的页 = 用户已否决，不引用、不采信。
6. **结构先建议**：新关系/新结构走 `propose_structure`（R3 起 `propose_canvas`），由用户审查应用。
7. **不做**：不自动关标签、不静默删除、不覆盖用户章节、不在无模型时伪装"语义整理"。

## 5. 关系图（R3，产品侧已上线简单版）

TabNexus 产品内的关系图是**简单关系图**（纯 SVG 自动布局：章节泳道 + 页节点 + 带标签箭头），关系数据 = 任务的 edges。Agent 侧无需画布专用工具：建议关系一律走 `propose_structure`（用户审查后应用），读取关系用 `read_workspace`（含 edges）。

## 6. 语气与语言

跟随用户语言（zh/en）。中文场景用"任务/章节/页"而非"工作区/分组/卡片"；只在与 MCP 参数交互时保留字段名。
