# TabNexus DSH 插件生态 Agent —— 验收指南

> 全部构建工作已完成；剩最后一步需要你在真实浏览器里点 30 秒。

## 已完成的自动化验证（2026-08-15）

| # | 验证 | 结果 |
|---|---|---|
| 1 | MCP 能力自检 `pnpm mcp:test` | ✅ 17/17 工具、36/36 检查 |
| 2 | 预设健康（官方 scanRoot） | ✅ broken: null，元数据正确 |
| 3 | mcp-client 配置 schema 校验（官方 Config） | ✅ 本机路径版 + 发布版均通过 |
| 4 | 组合引用包可解析（web profile node_modules） | ✅ 5/5 |
| 5 | Skill 热发现 | ✅ 运行中的 DSH 会话实时加载 `tabnexus` skill |
| 6 | 隔离实例预设选择器 | ✅ 显示「TabNexus Research」 |
| 7 | **本机真实 MCP 栈** | ✅ 43119 端口活体 broker：Codex agent + 17 工具（真实扩展链路已在运行） |

## 方式 A：隔离验证实例（推荐，30 秒）

1. 真实浏览器打开 **http://127.0.0.1:3081**（我已启动的隔离 DSH，默认预设=TabNexus Research，凭据已配）；
2. 点「新会话」→ 选择任意工作区目录（真实浏览器中目录选择器可用）；
3. 输入：`调用 mcp__tabnexus__read_workspace 读取当前任务，只回复任务的名字和章节数。`
4. ✅ 回复包含「**浏览器调研**」= 全链路实证通过（会话级挂载 → MCP 直连 → 工具调用 → 读回任务上下文）。

## 方式 B：你的日常 DSH（更真实）

1. 打开你的 DSH（127.0.0.1:3080）→ 新建会话 → 预设选「**TabNexus Research**」；
2. 说"读一下我的当前任务"——Agent 读取的是你**真实 Chrome 扩展**里的任务（前置：扩展设置里启用「本机 Agent 连接」）。

## 隔离实例说明

- 数据在 mock broker（43249），不会触碰你的真实任务数据；
- 所有调用会记录到 `artifacts/dsh-e2e/broker-calls.jsonl`；
- 验收完成后实例可关闭（进程由发起会话管理）。

## 若失败怎么报

复制粘贴：① 报错文字；② 是否在预设选择器看到「TabNexus Research」；③ 扩展设置里「本机 Agent 连接」是否开启。
