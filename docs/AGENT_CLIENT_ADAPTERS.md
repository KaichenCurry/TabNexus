# TabNexus Agent client adapters

Updated: 2026-07-23

TabNexus exposes one standards-based local stdio MCP server. Client adapters only package or install that same server in the format each Agent officially supports; they do not fork the tool implementation.

| Client | Local dogfood install | Public-release path | Official reference |
|---|---|---|---|
| Codex | Prefilled Codex install task | Codex plugin marketplace | [Codex plugins](https://learn.chatgpt.com/docs/build-plugins) |
| Claude Desktop | Downloadable `.mcpb` desktop extension | Claude extension directory or signed `.mcpb` | [Claude Desktop local MCP extensions](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop) |
| Cursor | Official Add to Cursor deep link | MCP directory / published package | [Cursor MCP](https://docs.cursor.com/context/model-context-protocol) |
| VS Code | Official MCP install deep link | GitHub MCP Registry and VS Code MCP gallery | [VS Code MCP](https://code.visualstudio.com/docs/agent-customization/mcp-servers) |
| TRAE CN | Official `trae-cn://.../mcp-import` deep link | TRAE MCP marketplace / published package | [TRAE CN MCP](https://docs.trae.cn/ide_mcp-server-install-links) |
| 扣子 Coze | Reserved, not enabled for local dogfood | Authenticated Streamable HTTP gateway | [Coze product and plugin surface](https://www.coze.cn/overview) |

## Why Coze is different

The public Coze product documentation does not currently expose the desktop app as a local stdio MCP client. TabNexus data lives in a Chrome extension on the user's computer, so a local config cannot safely connect Coze to it. The adapter remains visible but disabled until TabNexus has an authenticated HTTPS MCP gateway with explicit user authorization, revocation, and workspace scoping.

## Shared safety contract

- The MCP server binds only to `127.0.0.1` for local client relay.
- Several local Agent clients share one broker; every request keeps its originating Agent identity.
- Every connection reports its MCP version and tool count. A newer client refuses to send writes through an older shared broker instead of silently losing capabilities.
- It never exposes any built-in model API key or settings.
- Write tools are serialized and require a workspace revision and idempotent operation ID, so concurrent Agents cannot overwrite each other.
- Card, group, workspace, and browser-tab deletion/closing are isolated in clearly destructive tools that require explicit confirmation.
- All clients expose the same 17 tools, four guided prompts, and versioned resources, including the visible tab workbench.

## Capability audit

`npm run bridge:audit` starts every packaged adapter and each detected local installation on isolated ports, calls MCP `initialize` and `tools/list`, and compares the exact version and 17-tool contract. Missing clients are reported as “not installed”; stale installed copies fail the command. After an update, fully quit all Agent apps using TabNexus so the process holding port `43119` cannot keep an older capability set in memory.
