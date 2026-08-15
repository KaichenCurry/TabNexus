# Resume Experience Template（可移植版）

这是一份用于中文简历经历整理、改写、JD 定向与审阅的 Agent 规则包。它强调事实边界、个人贡献、可验证结果，以及“问题—方法—结果”的证据链。

## 包含内容

```text
resume-experience-template-portable/
├── README.md
├── codex/
│   └── resume-experience-template/
│       ├── SKILL.md
│       ├── agents/openai.yaml
│       └── references/
│           ├── evidence-and-writing-rules.md
│           └── templates.md
└── cursor/
    └── .cursor/rules/
        └── resume-experience-template.mdc
```

## 安装到 Codex

将整个 Skill 目录复制到个人 Skills 目录：

```bash
mkdir -p ~/.codex/skills
cp -R codex/resume-experience-template ~/.codex/skills/
```

重新打开 Codex 后，可在提示词中调用：

```text
$resume-experience-template
```

也可以直接描述任务，例如：

```text
使用 resume-experience-template，把这段实习经历改成适合产品经理岗位的中文简历内容。
```

如果对方使用不同的 `CODEX_HOME`，请把 `resume-experience-template` 目录放入其实际的 `skills` 目录。

## 安装到 Cursor

### 项目级使用

在目标项目根目录执行：

```bash
mkdir -p .cursor/rules
cp cursor/.cursor/rules/resume-experience-template.mdc .cursor/rules/
```

Cursor 会根据规则描述自动判断是否应用，也可以在对话里明确引用该规则并要求优化简历。

### 全局使用

Cursor 的全局规则位置可能随版本变化。最稳妥的方式是把
`cursor/.cursor/rules/resume-experience-template.mdc` 放进常用简历项目的 `.cursor/rules/`，或将其中正文复制到 Cursor 的全局 User Rules。

## 给其他 Agent 使用

有 Skill/Rules 机制的 Agent：

1. 优先导入 `codex/resume-experience-template/` 整个目录；
2. 若只支持单文件规则，使用 `cursor/.cursor/rules/resume-experience-template.mdc`；
3. 若只支持系统提示词，删除 `.mdc` 文件顶部的 YAML frontmatter，再把剩余正文作为项目指令或系统提示词。

不要只复制 `SKILL.md` 后遗漏 `references/`。Codex 版本会按任务需要读取其中的事实校验、写作规则和输出模板；Cursor 单文件版已经把这些内容合并进正文。

## 使用示例

```text
请使用简历经历模板：
1. 不虚构数据、工具和个人贡献；
2. 先给最稳定位；
3. 输出可直接粘贴到简历里的版本；
4. 最后只列 3 个最值得补充的证据问题。

目标岗位：商业分析实习生
原始经历：……
```

## 更新方式

原始 Codex Skill 更新后：

1. 同步替换 `codex/resume-experience-template/` 下的对应文件；
2. 将主规则和两份参考文件重新合并进 Cursor `.mdc`；
3. 重新生成压缩包并执行校验。

