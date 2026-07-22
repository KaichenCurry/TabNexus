<div align="center">
  <img src="../extension/public/icons/icon128.png" width="88" alt="TabNexus logo" />
  <h1>TabNexus</h1>
  <p><strong>You didn't open tabs. You started a task that isn't finished yet.<br/>TabNexus turns scattered tabs into task context that both you and AI can pick up.</strong></p>
  <p>Local organization out of the box · bring your own AI API for intent-based organization · connect an MCP Agent when needed</p>

  <p>
    <a href="#why">Why</a> ·
    <a href="#what">What it is</a> ·
    <a href="#features">Full workflow</a> ·
    <a href="#ai-api">AI API</a> ·
    <a href="#agent">Agent collaboration</a> ·
    <a href="#start">2-minute start</a> ·
    <a href="../README.md">简体中文</a>
  </p>

  <p>
    <img alt="Chrome MV3" src="https://img.shields.io/badge/Chrome-Manifest_V3-4285F4?logo=googlechrome&logoColor=white" />
    <img alt="Workspace local storage" src="https://img.shields.io/badge/Workspace-local_storage-2F855A" />
    <img alt="MCP tools" src="https://img.shields.io/badge/MCP-17_tools-6750D8" />
    <img alt="CI" src="https://github.com/KaichenCurry/TabNexus/actions/workflows/ci.yml/badge.svg" />
    <img alt="MIT License" src="https://img.shields.io/badge/license-MIT-20232A" />
  </p>
</div>

<picture><img src="assets/tabnexus-after.png" alt="TabNexus turns tabs into resumable task context" /></picture>

<div align="center"><sub>Save pages as a Workspace with groups, notes, states, and relationships. Close the originals with confidence; restore them in one click.</sub></div>

> [!IMPORTANT]
> **v0.17.0 is a developer preview.** A loadable Chrome package is available; Chrome Web Store distribution is coming. → [2-minute start](#start)

<a id="why"></a>
## 😵 Your tab bar is not clutter. It is unfinished thinking you are afraid to lose.

Your browser may be holding a task you do not dare to close.

It began with one company to research, a few options to compare, or a bug to track down. One page led to the next clue, until there were twenty tabs. You know some are background, some are evidence, some contradict each other, and several are still unread—but the browser sees only twenty URLs.

**One tab is a clue. Taken together, those tabs are a judgment taking shape.** Yet why those pages belong together, what role each one plays, and how far the task has come all live only in your head. You return the next day: the pages remain, but the train of thought is gone.

You were never afraid to lose the pages. You were afraid to lose the unfinished thinking behind them.

<picture><img src="assets/tab-overload-hero.jpg" alt="Tab overload anxiety from dozens of stacked browser tabs" /></picture>

Traditional tools such as Toby, OneTab, and Workona answer “where should these pages go?” but struggle to preserve “why did I open them?” The gap is sharper in the AI era: to hand the task over, you still copy links one by one and explain the background again—or ask Computer Use / Playwright to rediscover the browser page by page. You become the human API between your browser and AI.

This is not a failure to stay organized. The browser simply never saved the “why” behind the task.

> [!IMPORTANT]
> **TabNexus starts with one idea: stop managing tabs as tabs. Treat them as task context.**

<a id="what"></a>
## ✨ TabNexus: turn tabs into task context you can resume

TabNexus is not another folder for links. It adds a layer that has long been missing between the browser and the final result: **task context**.

A conventional tab manager ends at “I can reopen these later.” TabNexus begins with “I can return and know why I opened them, where I stopped, and what comes next.”

~~~mermaid
flowchart LR
    Intent["🎯 A goal takes shape"] --> Tabs["📑 Open tabs"]
    Tabs --> Workspace["📦 Local Workspace<br/>save · restore · organize locally"]
    Workspace --> Thinking["🧠 Task thinking<br/>cards · relationships · progress"]
    Thinking --> Output["✅ Output<br/>decision · report · next step"]
    API["✨ AI API<br/>organize by intent after setup"] -. "proposes structure" .-> Thinking
    Agent["🤖 MCP Agent<br/>optional advanced collaboration"] <-->|read · add · write back| Workspace
~~~

A Workspace is not just storage for pages. It is a living record of the task: what each page contributes, how the sources relate, and how far the work has progressed. You can stay entirely local, add an AI API when intent-aware organization helps, and hand the same context to an Agent only when the task grows into research, writing, or coding.

**These are not separate features bolted together. Saving is not the finish line, and an Agent is not the starting point. Every stage enriches the same Workspace so the next one never starts from zero.**

<a id="features"></a>
## 🧩 One context, four stages from page overload to task progress

The first two stages form a complete local workflow: preserve the task, then make the thinking visible. The AI API is an optional enhancement; MCP Agent collaboration goes one step further.

### 1️⃣ Tabs and Workspaces: stop using “leave it open” as a reminder

Select the pages that belong to one task from the current Chrome window, then **collect, group, and save** them. Once saved, close the originals: the cards remain in the local Workspace and you can restore one card, a group, or the whole Workspace anytime.

Clearing the tab bar no longer means abandoning the task. It means moving the task out of browser noise and into a place designed to preserve it.

Saving and closing are separate actions: closing a tab never deletes its card, restoring avoids already-open URLs, and pinned tabs are never bulk-closed. Multiple Workspaces, notes, drag-and-drop groups, and Markdown / JSON export remain available.

<picture><img src="assets/tabnexus-before.png" alt="Before organizing: multiple open tabs waiting to be saved" /></picture>

### 2️⃣ Task thinking: do not just arrange the tabs—make sense of the problem

Saving pages is only the first step. The harder question is: **what does each page mean inside this task?**

- Use cards and groups to separate background, evidence, options, counterexamples, and conclusions—so every tab has a role;
- Use the relationship view to expose support, contrast, dependencies, and next steps—and reveal where evidence is still missing;
- Use **To read / Read / Adopted** to track progress instead of leaving everything at “later.”

A conventional tab manager tells you where a page is stored. TabNexus helps you understand what that page contributes. When you reopen the Workspace, you recover more than pages: you return to **the exact point where your thinking stopped**.

| Card board | Flow / relationship view |
|---|---|
| <picture><img src="assets/tabnexus-workspace.png" alt="TabNexus card workspace and current-tabs workbench" /></picture> | <picture><img src="assets/tabnexus-relationship-map.png" alt="TabNexus infinite relationship map and task structure" /></picture> |

<a id="ai-api"></a>
### 3️⃣ AI API: configure your model, then organize by intent

Domain grouping tells you where a page came from. It cannot tell you why you opened it. Once AI is configured, you can say:

> “Organize this research as background, evidence, counterarguments, and conclusions.”

Your selected model interprets the role each page plays, proposes groups, and can separately suggest relationship structure. The default workflow shows a preview first; you decide whether to apply it.

> [!IMPORTANT]
> **TabNexus uses local organization by default. To use AI organization, you must first choose a provider under Settings → Choose your organizing model, enter your own valid API key and model, and enable AI. Otherwise intent-aware AI organization is unavailable, the system stays in local mode, and no external model is called.**
>
> Without an API configuration, capture, save, restore, manual and local-domain grouping, cards, relationships, and progress all remain fully available.

TabNexus currently supports DeepSeek, OpenAI, Claude, Kimi, Qwen, and MiniMax. We recommend clicking **Test connection**; success enables the model automatically. The default workflow remains **select tabs → describe intent → preview → apply**.

<picture><img src="assets/tabnexus-ai-provider-setup.png" alt="Choose an AI provider, enter an API key, and test the connection in TabNexus" /></picture>

<div align="center"><sub>Local mode is the default; configure and enable a model to use intent-aware AI organization.</sub></div>

The AI API understands and organizes the Workspace; MCP exposes that Workspace to an Agent. They work independently, or as two stages of the same workflow.

<a id="agent"></a>
### 4️⃣ Agent collaboration: stop being the human API

If saving, thinking, or AI organization is enough, your workflow can end at the previous stage. Invite an Agent only when the task needs more research, new sources, a report, or a coding workflow.

Instead of copying a dozen links into a chat and explaining the background again—or asking Computer Use / Playwright to rediscover the browser page by page—one local MCP interface gives a supported Agent the organized groups, notes, relationships, and progress.

Agents can search Workspaces, add pages or notes, update states and groups, propose relationship structure, and write reports back. Critical writes support version checks and activity logging; destructive actions such as close or delete require your approval.

**You own the goal and the judgment. TabNexus carries the context. The Agent continues where you stopped.**

| Connect common Agents | Review Agent reads and writes |
|---|---|
| <picture><img src="assets/tabnexus-agent-connect.png" alt="TabNexus Agent connection page" /></picture> | <picture><img src="assets/tabnexus-agent-activity.png" alt="TabNexus Agent activity and write-back log" /></picture> |

<a id="start"></a>
## 🚀 Install in two minutes and organize your first task

1. **Install:** download and unzip the [TabNexus Chrome package](https://github.com/KaichenCurry/TabNexus/releases/download/v0.17.0/TabNexus-Chrome-v0.17.0.zip), open <code>chrome://extensions</code>, enable **Developer mode**, and choose **Load unpacked**.
2. **Save one task:** open TabNexus, select pages that belong together, and click **Save**. You can now close the original tabs.
3. **Choose how to organize:** local organization is the default. For AI, first choose a model in Settings, enter your API key, enable it, and then describe your intent.
4. **Keep moving:** track progress on the board or relationship view; restore a card, group, or entire Workspace when needed.

That is the complete everyday workflow—**no Agent and no terminal required.**

<details>
<summary><strong>Build from source</strong></summary>

Requires Node.js 22+ and pnpm 11.

~~~bash
git clone https://github.com/KaichenCurry/TabNexus.git
cd TabNexus
corepack enable
pnpm install --frozen-lockfile
pnpm build
~~~

Then load the generated <code>dist</code> directory at <code>chrome://extensions</code>.

</details>

<a id="agent-setup"></a>
## 🔌 Connect an Agent (optional, advanced)

Open **Settings → Connect your Agents**. The local MCP exposes **17 focused tools** for Workspaces, cards, relationships, exports, and tab operations.

<details>
<summary><strong>Supported clients and technical docs</strong></summary>

| Client | Status | Setup |
|---|:---:|---|
| Codex | ✅ | Repository plugin package |
| Claude Desktop / Claude Code | ✅ | MCPB / Marketplace plugin |
| Cursor / VS Code / TRAE | ✅ | Local MCP configuration |
| Coze | Planned | Authenticated remote MCP gateway |

[Client adapters](AGENT_CLIENT_ADAPTERS.md) · [capability matrix](MCP_CAPABILITY_MATRIX.md) · [testing guide](MCP_TESTING.md)

</details>

## 🔒 Local first, with explicit boundaries

- TabNexus has no account and no hosted cloud; Workspaces and model keys stay in Chrome local storage;
- Only when you invoke AI do your instruction and the required task metadata go to the selected model provider; page bodies and card notes are not sent, and the API key is used only to authenticate that provider request;
- MCP listens on <code>127.0.0.1</code> only and never exposes model keys to Agents;
- No content scripts, <code>&lt;all_urls&gt;</code>, <code>webRequest</code>, download permission, or new-tab hijacking;
- Destructive actions require explicit approval, and exports contain no credentials.

For security issues, read the [security policy](../.github/SECURITY.md) and use GitHub private vulnerability reporting.

## 🛠️ Shipped and next

**Shipped in v0.17.0:** multi-Workspace collect / save / restore, intent-driven multi-model AI classification with editable previews, a persistent relationship canvas, a 17-tool local MCP, and a bilingual UI. The automated baseline is 106 tests, 17/17 MCP tools, and 36/36 deterministic capability checks.

**Next:** Chrome Web Store distribution, an authenticated remote MCP for cloud Agents, accessibility, and large-Workspace performance. See [implementation status](IMPLEMENTATION_STATUS.md) and the [PRD](product/PRD.md).

Stack: React · TypeScript · Vite · Vitest · Playwright · Chrome Manifest V3 · Model Context Protocol.

## 🌱 Build the context layer between browsers and Agents with us

Browser context is personal and critical. Its data boundaries should be inspectable, its Agent interface should be extensible, and its direction should be shaped by people who actually suffer from tab overload.

- 🐛 File an [Issue](https://github.com/KaichenCurry/TabNexus/issues/new/choose)
- 💬 Join [Discussions](https://github.com/KaichenCurry/TabNexus/discussions)
- 🔧 Read the [contributing guide](../.github/CONTRIBUTING.md)
- 📮 Contact: [currykchen@hotmail.com](mailto:currykchen@hotmail.com)

## 📄 License

[MIT](../LICENSE)

---

<div align="center">
  <strong>Your browser remembers what you opened.<br/>TabNexus remembers why you opened it, how far you got, and who continues next.</strong>
</div>
