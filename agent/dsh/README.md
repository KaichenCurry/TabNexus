# TabNexus × DSH 插件生态

> 一切皆插件——DSH 也可以有自己的 Tab 管理器。

DSH 正式运行版已迁移到独立仓库：[KaichenCurry/TabNexus-DSH](https://github.com/KaichenCurry/TabNexus-DSH)。

## v0.3 产品边界

DSH 本身已经是 AI Agent，因此 TabNexus-DSH 不再重复接入 Agent。它是一个纯 UI、本地优先的小插件，只保留：

- 任务创建、切换、重命名、目标与进度；
- 分类创建、重命名、删除与网页移动；
- 网页标题、URL、备注和“待处理 / 进行中 / 已完成”；
- “分类 / 流程”双视图，其中流程只是三段式轻量展示；
- DSH 官方 `shell.overlay` 入口、玻璃 Dock、展开工作区和窄屏抽屉。

明确不包含：MCP、Agent 工具、Host API、SSE、会话绑定、Skill/preset 注入、Chrome 实时标签读取或关闭。

## 安装

```bash
curl -LO https://github.com/KaichenCurry/TabNexus-DSH/releases/download/v0.3.0/dsh-plugin-tabnexus-0.3.0.tgz
dsh plugin --profile web add ./dsh-plugin-tabnexus-0.3.0.tgz
```

重启 DSH Web 服务并刷新 `http://127.0.0.1:3080/`。桌面端使用同一套 Client，无需额外安装。

## 数据与边界

- 数据保存在 Web Client 的 `localStorage`，键为 `tabnexus:dsh:workspace:v3`。
- 只允许 `http://` 和 `https://` 网页。
- Chrome 扩展与 DSH 插件当前独立使用；同步能力以后再做。
- 本目录的旧 `plugin/`、Skill 与 preset 是历史实验资料，不属于 v0.3 发布包；发布以独立仓库为准。

## 开发与验证

```bash
cd /Users/chen/Desktop/TabNexus-DSH
npm install --legacy-peer-deps
npm run typecheck
npm test
npm run pack:check
```

完整安装、兼容矩阵和架构说明见独立仓库 README。
