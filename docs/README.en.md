<div align="center">
  <img src="../public/icons/icon128.png" width="88" alt="TabNexus logo" />
  <h1>TabNexus</h1>
  <p><strong>A web-tab workbench where you, your browser, and AI Agents share the same task context.</strong></p>
  <p>Turn the tabs you are afraid to close into work that can be saved, understood, resumed, and handed off.</p>

  <p>
    <a href="#install-now">Install</a> ·
    <a href="#your-first-five-minutes">First use</a> ·
    <a href="#three-core-layers">Core layers</a> ·
    <a href="#connect-an-ai-agent">Agent MCP</a> ·
    <a href="../README.md">简体中文</a>
  </p>
</div>

![TabNexus workspace with 12 tabs saved into three working groups](assets/tabnexus-after.png)

> [!IMPORTANT]
> **v0.17.0 is a developer preview.** A two-minute Chrome package is available—no Node, pnpm, or terminal required. A Chrome Web Store build is not available yet.

## The problem is not too many tabs. It is too much unfinished work.

A research task opens a report, three competitors, a paper, and two data sources. A production issue interrupts it with docs, logs, and GitHub threads. Later, a trip adds flights, visas, hotels, and guides to the same browser window.

Every tab becomes a promise to your future self: **“This still matters. Do not close it yet.”**

But once the titles collapse into favicon-sized hints, the browser can no longer tell you why a page was opened, which task it belongs to, what you already learned, or where to restart tomorrow. The browser remembers pages; it does not remember the work behind them.

![An illustration of tab overload](assets/tab-overload-hero.jpg)

**TabNexus does not merely hide tabs. It makes unfinished work safe to pause, clear to resume, and easy to hand off.**

## From tab overload to shared context

These are **real extension screenshots from the same run**. The same 12 sanitized pages start as loose, unsaved tabs and end as three resumable working groups. They are not static mockups.

<table>
  <thead>
    <tr>
      <th width="50%">Before: the pages exist, but the task structure does not</th>
      <th width="50%">With TabNexus: the context is saved and keeps moving</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><img src="assets/tabnexus-before.png" alt="Real TabNexus before screenshot with 12 unsaved tabs and an empty workspace" /></td>
      <td><img src="assets/tabnexus-after.png" alt="Real TabNexus after screenshot with 12 tabs organized into three working groups" /></td>
    </tr>
    <tr>
      <td>Closing a tab feels like losing both the page and the thought behind it.</td>
      <td>Save and close are explicit actions, so you close only after the state is visible.</td>
    </tr>
    <tr>
      <td>Restoring URLs still means reconstructing why each page mattered.</td>
      <td>Groups, notes, reading states, relationships, and progress return together.</td>
    </tr>
    <tr>
      <td>Every AI conversation starts by re-explaining the task and pasting links.</td>
      <td>An Agent reads the same local workspace, adds material, and writes results back.</td>
    </tr>
  </tbody>
</table>

## One context shared by three participants

TabNexus is not another bookmark manager. It lets **you, the live browser window, and AI Agents work against the same task context**. Model APIs are optional assistants: they interpret organization intent and suggest task structure, while every consequential change remains previewable and user-controlled.

```mermaid
flowchart TB
    Context["TabNexus task context<br/>pages · groups · notes · states · relationships · progress"]
    User["You<br/>set goals and confirm actions"] <--> Context
    Browser["Browser<br/>provides live window tabs"] <--> Context
    Agent["AI Agent<br/>reads, acts, and writes back"] <--> Context
    Model["Optional model APIs<br/>DeepSeek · OpenAI · Claude · Kimi · Qwen · MiniMax"] -. "organization / structure suggestions" .-> Context
```

## TabNexus in 30 seconds

```mermaid
flowchart LR
    A["Live Chrome tabs"] --> B["Select what matters"]
    B --> C["Save to a workspace"]
    C --> D{"Close the originals now?"}
    D -->|"Keep browsing"| E["Saved and still open"]
    D -->|"Pause the task"| F["Safely closed and restorable"]
    E --> G["Groups · AI · Relationship map"]
    F --> G
    G --> H["Continue yourself or hand off to an Agent"]
```

The right-side tab workbench distinguishes unsaved and open, saved and open, saved but closed, and closed without being saved. Saving and closing are separate, explicit actions. Pinned tabs are never closed in bulk.

## Install now

**No terminal or developer tools. This usually takes less than two minutes.**

1. **[Download the TabNexus Chrome package](https://github.com/KaichenCurry/TabNexus/releases/download/v0.17.0/TabNexus-Chrome-v0.17.0.zip)** and unzip it.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select the extracted `TabNexus-Chrome-v0.17.0` folder.
4. Pin TabNexus and click its toolbar icon.

```mermaid
flowchart LR
    A["Download package"] --> B["Unzip"] --> C["Load folder in Chrome"] --> D["Click the extension icon"]
```

To update, download the new package, remove the old unpacked extension, and load the new folder. For local `file://...html` pages, enable **Allow access to file URLs** in the extension details.

<details>
<summary><strong>Developers: build from source</strong></summary>

```bash
git clone https://github.com/KaichenCurry/TabNexus.git
cd TabNexus
corepack enable
pnpm install --frozen-lockfile
pnpm build
```

Load the generated `dist` folder. The source build is intended for development, tests, and local Agent connections such as Codex, Cursor, VS Code, and TRAE.
</details>

## Your first five minutes

1. **Select, rather than capture everything.** Check the tabs that belong to the task; Select all skips pinned tabs by default.
2. **Save them.** They enter the active workspace while the original pages remain open by default.
3. **Close only when you choose.** Closing a browser tab does not delete its workspace card.
4. **Build the structure.** Drag cards into groups, describe a grouping rule to AI, or use the relationship map.
5. **Resume without duplicates.** Open one card, one group, or the whole workspace; URLs already open are skipped.

## Three core layers

### 1. Multi-tab and Workspace management

Select the live tabs that belong to a task, capture and group them, then explicitly decide whether to close the originals. Workspaces stay isolated, saved state remains visible, and restore skips URLs that are already open.

Organize manually or ask an optional provider such as DeepSeek to classify by page type, recent access time, task stage, priority, or your own instruction. Local domain grouping still works without a key.

**The outcome is not merely a cleaner tab strip. It is knowing the task is safe to pause and easy to resume.**

![The real TabNexus AI command surface for the whole workspace or selected live tabs](assets/tabnexus-ai-organize.png)

### 2. Task-thinking management

The same material can switch between a card board and an infinite relationship canvas. The board is for grouping, notes, and reading states; the canvas is for evidence, conclusions, dependencies, next steps, and persistent progress.

AI acts as a structure assistant here: it can propose groups, relationships, and task stages from your goal. TabNexus shows the rationale and change preview first, and you can redirect individual pages before applying anything.

**You are no longer managing a URL list. You are managing visible reasoning, relationships, and progress.**

![The real TabNexus infinite relationship canvas](assets/tabnexus-relationship-map.png)

### 3. Agent collaboration interface

Through MCP, TabNexus becomes a local context layer for Codex, Claude, Cursor, VS Code, and TRAE. An Agent can read the current task and browser tabs, search the workspace, add sources, change groups and relationship layouts, write back reports and task-structure suggestions, and safely save, close, or restore pages behind confirmation guards.

**You stop re-explaining the background, links, and latest progress. The Agent picks up the same continuously updated workspace.**

![The real TabNexus Agent connection settings](assets/tabnexus-agent-connect.png)

## Connect an AI Agent

| Client | Local support | Integration |
|---|---:|---|
| Codex | ✅ | Repository plugin package |
| Claude Desktop | ✅ | Self-contained `.mcpb` bundle |
| Claude Code | ✅ | Repository marketplace plugin |
| Cursor | ✅ | Standard local MCP configuration |
| VS Code / Copilot Agent | ✅ | VS Code MCP configuration |
| TRAE Work | ✅ | Standard local MCP configuration |
| Coze | Planned | Requires an authenticated remote MCP gateway |

The local MCP exposes **17 tools** across workspaces, groups, cards, relationship layout, tab selection, capture, restore, export, and guarded destructive actions. Multiple Agents can connect at the same time; revision checks and idempotent operation IDs prevent stale sessions from silently overwriting newer work.

After loading the extension, open **Settings → Connect your Agent**. See the [client adapter guide](AGENT_CLIENT_ADAPTERS.md), [capability matrix](MCP_CAPABILITY_MATRIX.md), and [testing guide](MCP_TESTING.md).

## Privacy and security

- Local-first storage; no TabNexus account or cloud database.
- No content scripts, `<all_urls>`, `webRequest`, `downloads`, or new-tab override.
- AI sends only the minimum card IDs, titles, and URLs required for the operation—never notes or provider keys.
- MCP listens only on `127.0.0.1` and never exposes provider keys.
- Exports exclude settings, credentials, and ephemeral Chrome tab IDs.
- Pinned tabs may be saved explicitly but cannot be closed through bulk actions or MCP.

Read the [security policy](../.github/SECURITY.md) before reporting a vulnerability. Never place a real provider key in an issue, screenshot, fixture, or export.

## Development

```bash
pnpm dev                  # preview the real UI with synthetic tabs
pnpm typecheck
pnpm test                 # unit, component, manifest, and Chrome API tests
pnpm test:e2e             # extension E2E in Chrome for Testing
pnpm check                # typecheck, tests, MCP contract, and production build
pnpm mcp:test             # exercise all 17 tools through a real stdio process
pnpm eval:mcp:validate    # validate the curated 600-query MCP dataset
```

Current automated baseline: **106 tests, 17/17 MCP tools, and 36/36 deterministic capability checks**.

<details>
<summary><strong>Repository layout</strong></summary>

```text
agent/   MCP bridge, client adapters, and Agent plugins
docs/    product, implementation, testing, and public documentation
public/  Chrome manifest, icons, and release assets
scripts/ build, install, audit, and evaluation scripts
src/     React workspace, settings, data, and Chrome service logic
tests/   unit, component, E2E, fixtures, and MCP evaluation data
```

The repository root keeps only build configuration, licensing, changelog, and project entry files. The historical PRD is archived at [`docs/product/PRD.md`](product/PRD.md).
</details>

## Architecture

```mermaid
flowchart LR
    Chrome["Current Chrome tabs"] --> Extension["TabNexus MV3 extension"]
    Extension --> Storage["chrome.storage.local"]
    Extension --> Provider["Optional model API"]
    Agent["Codex · Claude · Cursor · VS Code · TRAE"] --> MCP["Local MCP server<br/>127.0.0.1"]
    MCP <--> Extension
```

Stack: React, TypeScript, Vite, Vitest, Playwright, Chrome Manifest V3, and Model Context Protocol. All runtime code and fonts ship with the extension; no remote-hosted code is executed.

## Contributing

Issues, product feedback, documentation improvements, provider adapters, accessibility fixes, and focused pull requests are welcome. Start with the [contributing guide](../.github/CONTRIBUTING.md) and follow the [Code of Conduct](../.github/CODE_OF_CONDUCT.md).

## License

TabNexus is available under the [MIT License](../LICENSE).

---

<div align="center">
  <strong>Your browser remembers the pages. TabNexus remembers why you opened them and what comes next.</strong>
</div>
