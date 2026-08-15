# Changelog

All notable changes to TabNexus will be documented here.

## [Unreleased]

## [2.0.0] - 2026-08-15

### 全量重构：任务上下文文档

产品从"分组看板 + 关系图 + 标签操作台"整体重构为**任务上下文文档**（设计基线见 `docs/product/BLUEPRINT.md`）：

- 任务头（目标 / 下一步 / 分段式进度条：一段=一章节、填充=阅读进度、⭐=已采用、可交付态联动）+ 首启「这次你想搞清楚什么？」；
- 自由章节 + 四态引用块（待读/已读/已采用/已排除，排除原因一等字段，备注正面显示）+ 结论区；
- 收件口（收进任务 / 保存并关闭 / 已保存折叠 / 最近关闭）+ 工具栏 Popup + ⌘K 命令面板；
- 日常底座：保存当前页 ≤2 点击、一键保存窗口、恢复、删除确认、URL 去重——零 AI 依赖；
- AI 一键整理四模式（按内容理解/按时间/按域名/自定义提示词，预览→应用→撤销）+ AI 总结（SUMMARIZE_TASK，只传元数据）；
- 简单关系图（纯 SVG：章节泳道 + 页节点 + 带标签箭头；移除 @xyflow/react，Excalidraw 方案按用户决定搁置）；
- Context Packet v2 与「让 Agent 继续」Handoff；MCP 适配：v2 元数据与 excludedReason 流入 read_workspace / edit_workspace / add_cards；
- 旧壳（WorkspaceApp/FlowCanvas/GroupPanel/OpenTabsRail 等 9 组件）整体退役，`v2ShellEnabled` 默认开启。

### DSH 插件生态 Agent（首要交付）

- `agent/dsh/`：`tabnexus-research` Agent 预设（persona + skill + mcp-client 直连，17 工具 → `mcp__tabnexus__*`）+ `tabnexus` Skill（v2 产品基线/工具速查/工作流/七条红线）+ VERIFICATION 验收指南；
- 已安装到本机 DSH（`~/.dsh/.agent-presets` 与 `~/.agents/skills`，热发现已验证）；7 项自动化验证通过（MCP 17/17、预设健康、配置 schema、包解析、skill 热加载、隔离实例预设选择器、本机真实 MCP 栈 43119）；
- README 生态口号：「一切皆插件 —— 那浏览器里那 50 个 Tab，也该是。」

### 工程修复

- 修复 v1 潜伏 bug：revision 哈希对 JSON 对象键序敏感，chrome.storage 往返后键序漂移导致 "Workspace changed" 误报（stableStringify 键序无关序列化，collaboration + background 两处）；
- 质量基线：201 项单测（30 文件）+ 6/6 打包扩展 E2E + MCP 17/17 + 36/36 检查全绿。

## [1.0.5] - 2026-07-23

### Verified Codex one-click installer

- Replaced the invalid public Codex marketplace deep link with a standalone macOS installer downloaded from the GitHub Release.
- The installer uses Codex's official bundled CLI to refresh the TabNexus Marketplace, install `tabnexus@tabnexus`, and verify that the plugin is installed and enabled before offering to open it in Codex.
- Added a headless isolated-install mode and verified the packaged DMG against a clean temporary Codex configuration.
- Added the Codex installer directly to the first-run tutorial and permanent tutorial entry, while keeping the full Agent chooser in Settings.
- Added optional Developer ID signing and notarization support to the release pipeline; unsigned local builds are explicitly marked as development artifacts.

## [1.0.4] - 2026-07-23

### Direct Agent install hotfix

- Replaced the Codex prefilled chat task with the native `codex://plugins/install/...` plugin installation flow.
- Removed every prompt and command-based Codex installation instruction from the product UI.
- Corrected the supported ByteDance client name to TRAE Work CN and switched its installer from the TRAE IDE protocol to the app's registered `solo://.../mcp-import` route.
- Added regression coverage that rejects Codex chat prompts and the TRAE IDE protocol.

## [1.0.3] - 2026-07-23

### First-run experience and Agent installation

- Added a three-step first-run tutorial for tab management, intent-based AI organization, and local Agent collaboration, plus a permanent workspace tutorial entry.
- Replaced the broken Codex general-settings link with a prefilled Codex installation task that adds the TabNexus marketplace and plugin.
- Switched the TRAE installer to the official `trae-cn://` MCP import scheme and labeled the supported client as TRAE CN.
- Removed Claude Code from the in-product client picker for now while retaining Claude Desktop, Cursor, VS Code, Codex, and TRAE CN.
- Simplified AI provider setup to API key plus organization policy; compatible provider models are selected internally.

## [1.0.2] - 2026-07-23

### Agent installation hotfix

- Removed the portable-build branch that sent Codex, Cursor, VS Code, Claude Code, and TRAE users to a generic GitHub anchor.
- Added release-pinned MCP launch configuration so supported clients can install TabNexus without a source checkout or a machine-specific path.
- Packaged the MCP bridge as a 13 KB dependency-free runtime archive, avoiding a full repository checkout and development dependency installation on first connect.
- Wired Cursor, VS Code, and TRAE to their client-specific install flows; kept the packaged Claude Desktop extension; made Codex open its local settings with the launch command already copied.
- Added portable-package regression coverage and bumped extension, Agent integration, documentation, and release artifacts to v1.0.2.

## [0.17.1] - 2026-07-22

### Reliability and safety

- Updated MiniMax and Kimi to their current chat-completion contracts and disabled unnecessary thinking for short structured requests where providers support it.
- Hardened destructive Agent confirmations so negated or ambiguous phrases fail closed.
- Corrected the AI metadata disclosure, documented the localhost process trust boundary, and added explicit portable-package Agent setup messaging.
- Added packaged-extension Chromium E2E coverage to CI and aligned the documented Node.js requirement with locked dependencies.

### Validation

- 189 automated tests, 8 packaged-extension browser scenarios, 17/17 MCP tools, and 36/36 deterministic capability checks.

### Documentation and repository experience

- Made Chinese the primary project language with English as an optional guide.
- Rebuilt the README around the multi-tab pain, an explicit installation path, first-use guidance, benefit-led product storytelling, real sanitized UI screenshots, and visual workflows.
- Embedded real, sanitized product screenshots directly into the three core capability stories; tightened section titles, introduced restrained emoji wayfinding, and added a direct contribution contact.
- Reframed the product around one shared task context across the user, browser, and AI Agents; added real before-and-after screenshots from the same sanitized 12-tab run.
- Added a portable Chrome package and reduced first-time installation to download, unzip, and load—no Node or pnpm required.
- Consolidated the MCP bridge, integrations, and plugins under `agent/`; moved E2E, fixtures, and evaluation data under `tests/`; archived the original PRD under `docs/product/`.
- Moved GitHub community health documents under `.github/` while preserving their standard discovery locations.

## [0.17.0] - 2026-07-22

First public developer preview.

### Highlights

- Local-first Chrome MV3 workspace with multi-window tab collection, clear saved/open/closed states, deduplication, notes, reading status, filters, exports, and safe restore.
- Intent-first AI organization with editable proposals and adapters for DeepSeek, OpenAI, Claude, Kimi, Qwen, and MiniMax.
- Obsidian-inspired infinite relationship canvas with persistent positions and editable edges.
- Local multi-Agent MCP `0.8.0` with 17 workspace and tab-workbench tools, version-safe concurrent writes, idempotent retries, activity attribution, and guarded destructive actions.
- Codex, Claude Desktop, Claude Code, Cursor, VS Code, and TRAE source-install adapters.
- Chinese and English product interfaces.

### Validation

- 106 automated tests.
- 17/17 MCP tools and 36/36 deterministic capability checks.
- Curated 600-query MCP evaluation dataset with BO3 safety evaluation support.

### Known limitations

- Developer-mode source installation only; Chrome Web Store distribution is not available yet.
- Cursor, VS Code, and TRAE source installs depend on the local checkout path used during the build.
- Coze requires a future authenticated remote MCP gateway.
- Cloud sync, accounts, and team collaboration are intentionally out of scope for this preview.
