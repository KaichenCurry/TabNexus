<div align="center">
  <img src="../extension/public/icons/icon128.png" width="88" alt="TabNexus logo" />
  <h1>TabNexus</h1>
  <p><strong>You didn't open tabs. You started a task that isn't finished yet.<br/>TabNexus turns scattered tabs into task context that both you and AI can pick up.</strong></p>
  <p>Local-first Chrome extension · intent-driven AI API · optional MCP Agent collaboration</p>

  <p>
    <a href="#why">Why</a> ·
    <a href="#what">What it is</a> ·
    <a href="#features">Core capabilities</a> ·
    <a href="#start">2-minute start</a> ·
    <a href="#agent">Connect an Agent</a> ·
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
## 😵 You are not afraid to close tabs. You are afraid to lose the unfinished task.

The last time you had 20 tabs open, you probably were not wandering. You were **researching a company, comparing options, or hunting down a bug**. Every page was a reference for the same goal:

~~~mermaid
flowchart LR
    Intent["🎯 Intent<br/>research a company"] --> Tabs["📑 Tabs<br/>product · filings · competitors · reviews"]
    Tabs --> Context["🧠 Context<br/>evidence · notes · links · progress"]
    Context --> Output["✅ Output<br/>judgment · report · decision"]
~~~

The browser remembers what you opened, but not why, which pages are evidence, or how far the task has come. You are not afraid of losing a URL. You are afraid of **losing your train of thought with it**.

<picture><img src="assets/tab-overload-hero.jpg" alt="Tab overload anxiety from dozens of stacked browser tabs" /></picture>

Traditional tab tools such as Toby, OneTab, and Workona proved the need to save and group pages, but they still struggle to preserve task intent, relationships, and progress. The AI era adds more tabs, while handing them to AI still means copy-pasting links and repeating context—or asking Computer Use / Playwright to operate page by page, which is typically slower and more token-heavy for this kind of context transfer.

**TabNexus starts from one idea: stop managing tabs as tabs. Manage them as task context.**

<a id="what"></a>
## ✨ TabNexus turns tabs into context you can continue

TabNexus is a Chrome extension. It captures a messy browsing session inside a persistent **Workspace**, so you, the browser, and AI can operate on the same context:

~~~mermaid
flowchart TB
    Context["📦 Workspace<br/>pages · groups · notes · states · relationships"]
    User["👤 You<br/>set goals · approve changes"] <--> Context
    Browser["🌐 Chrome<br/>collect · close · restore"] <--> Context
    API["✨ AI API (default)<br/>classify by intent"] <--> Context
    Agent["🤖 MCP Agent (optional)<br/>read · add · write back"] <--> Context
~~~

| Approach | What it does | What is still missing |
|---|---|---|
| Bookmarks / tab managers | Save pages and restore windows | Task intent, structure, and progress |
| Domain-based grouping | Knows where pages came from | Knows why you opened them |
| Copy-paste / browser automation | Gives pages to AI | Efficient, complete, reusable context |
| **TabNexus** | **Organizes by intent, then continues through one interface** | **You set the goal and review key changes** |

There are two independent AI paths: one for everyday organizing, one for advanced collaboration.

| Path | Best for | What it does |
|---|---|---|
| **AI API (default path)** | Anyone who wants tabs organized quickly | Connect DeepSeek or another model inside the Workspace; classify with your own query and intent, preview first, then apply |
| **MCP Agent (optional, advanced)** | People continuing research, writing, or coding | Let MCP-capable Agents read context, add sources, write reports back, and propose task structure |

It is built for researchers, product managers, developers, and anyone trapped beneath dozens of tabs they do not dare close.

<a id="features"></a>
## 🧩 One context, three layers

### 1️⃣ Tabs and Workspaces: save first, then clear the tab bar

Select the pages that belong to one task from the current Chrome window, then **collect, group, and save** them. Once saved, close the originals: the cards remain in the local Workspace and you can restore one card, a group, or the whole Workspace anytime.

- Saving and closing are separate actions; closing a tab never deletes its card;
- Multiple Workspaces, drag-and-drop groups, notes, deduplication, and Markdown / JSON export;
- Already-open URLs are not duplicated on restore, and pinned tabs are never bulk-closed.

<picture><img src="assets/tabnexus-before.png" alt="Before organizing: multiple open tabs waiting to be saved" /></picture>

### 2️⃣ Task thinking: cards, relationships, and progress

The **card board** is for grouping, notes, and moving items through “to read / read / adopted.” The **flow / relationship view** turns evidence, conclusions, dependencies, and next steps into a structure. Positions and links persist, so your thinking is where you left it.

This is also the main AI API entry point. Ask for “market / product / tech / finance” or “problem → options → decision.” AI explains and previews the change; you decide whether to apply it. DeepSeek, OpenAI, Claude, Kimi, Qwen, and MiniMax are supported. Without a key, drag manually or use local domain grouping.

| Card board | Flow / relationship view |
|---|---|
| <picture><img src="assets/tabnexus-workspace.png" alt="TabNexus card workspace and current-tabs workbench" /></picture> | <picture><img src="assets/tabnexus-relationship-map.png" alt="TabNexus infinite relationship map and task structure" /></picture> |

### 3️⃣ Agent collaboration: stop being the human API

When the task needs more research, new sources, or a report, an Agent can receive the already-organized groups, notes, relationships, and progress through the local MCP. No copying a dozen links; no driving the browser page by page.

Agents can search Workspaces, add pages or notes, update states and groups, propose relationship structure, and write reports back. Critical writes support version checks and activity logging; destructive actions such as close or delete require your approval.

| Connect common Agents | Review Agent reads and writes |
|---|---|
| <picture><img src="assets/tabnexus-agent-connect.png" alt="TabNexus Agent connection page" /></picture> | <picture><img src="assets/tabnexus-agent-activity.png" alt="TabNexus Agent activity and write-back log" /></picture> |

<a id="start"></a>
## 🚀 Install in two minutes and organize your first task

1. **Install:** download and unzip the [TabNexus Chrome package](https://github.com/KaichenCurry/TabNexus/releases/download/v0.17.0/TabNexus-Chrome-v0.17.0.zip), open <code>chrome://extensions</code>, enable **Developer mode**, and choose **Load unpacked**.
2. **Save one task:** open TabNexus, select pages that belong together, and click **Save**. You can now close the original tabs.
3. **Organize by intent:** drag manually, or add a model API key in Settings and ask the assistant to “classify by my research goal.”
4. **Keep moving:** track progress on the board or relationship view; restore a card, group, or entire Workspace when needed.

That is the complete everyday workflow—**no Agent and no terminal required**.

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

<a id="agent"></a>
## 🤖 Let an Agent take over when you need one

The everyday workflow ends above. When research, writing, or coding needs to continue, open **Settings → Connect your Agents**. The local MCP exposes **17 focused tools** for Workspaces, cards, relationships, exports, and tab operations.

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
- Only when you invoke AI does the minimum required card metadata go to the selected model provider; notes and model keys are never sent;
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
