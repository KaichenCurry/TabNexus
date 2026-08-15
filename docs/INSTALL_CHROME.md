# TabNexus Chrome 扩展 · 安装教程（v2.0.0）

> 两分钟装上，不需要 Node、不需要终端。

## 方式一：直接加载安装包（推荐，小白友好）

1. 下载安装包：**`TabNexus-Chrome-v2.0.0.zip`**
   → [GitHub Releases 下载](https://github.com/KaichenCurry/TabNexus/releases/tag/v2.0.0)
2. 解压 zip 得到 `TabNexus-Chrome-v2.0.0` 文件夹（**不要删掉这个文件夹**，Chrome 需要一直引用它）；
3. 打开 Chrome，地址栏输入 `chrome://extensions` 回车；
4. 右上角打开**开发者模式**开关；
5. 点左上角**「加载已解压的扩展程序」**，选择刚才解压的文件夹；
6. 完成 ✅ 工具栏出现 TabNexus 图标——点它弹出快速收集面板，点「打开任务文档」进入工作区。

## 方式二：从源码构建

需要 Node.js 22.13+ 与 pnpm 11：

```bash
git clone https://github.com/KaichenCurry/TabNexus.git
cd TabNexus
pnpm install --frozen-lockfile
pnpm build
```

然后在 `chrome://extensions` 加载生成的 `dist` 目录。

## 装好后 60 秒上手

1. 点工具栏 TabNexus 图标 →「打开任务文档」；
2. 首次打开只问一句：**「这次你想搞清楚什么？」**——输入任务名回车；
3. 点右上角「收件口」勾选当前窗口的页面 →「收进任务」→ 原标签可以放心关掉；
4. 「✦ AI 一键整理」按内容/时间/域名整理（预览→应用→可撤销）；「AI 总结」写结论区；
5. 想交给 Agent？点「让 Agent 继续」复制上下文，进 DSH/Codex 粘贴即可（DSH 用户见 [DSH 安装教程](INSTALL_DSH.md)）。

## 常见问题

| 问题 | 解法 |
|---|---|
| 页面空白 | 确认解压的是 zip 内层文件夹，且加载的是含 `manifest.json` 的那层 |
| 保存不了本地 HTML | `chrome://extensions` → TabNexus 详情 → 打开「允许访问文件网址」 |
| AI 按钮置灰 | 设置 → 选择你的 AI 服务 → 填 API Key → 验证连接 |
| 想卸载 | `chrome://extensions` → 移除；本地数据在移除时一并清除 |
