import { displayDomain } from "./url";
import { SCHEMA_VERSION, type Locale, type Workspace } from "./types";

function markdownCard(title: string, url: string | undefined, type: string, source: string, note: string): string {
  const lines = [url ? `- [${title}](${url})` : `- ${title}`, `  - Type: ${type}`, `  - Source: ${source}`];
  if (note.trim()) lines.push(`  - Note: ${note.trim()}`);
  if (url) lines.push(`  - Domain: ${displayDomain(url)}`);
  return lines.join("\n");
}

export function exportWorkspaceMarkdown(workspace: Workspace, locale: Locale): string {
  const lines = [
    `# TabNexus Workspace: ${workspace.name}`,
    "",
    locale === "zh"
      ? "> 以下内容是按任务意图整理的浏览器上下文，可直接作为 Agent 的任务资料。"
      : "> Browser context organized by task intent, ready to use as agent context.",
    ""
  ];
  const inbox = Object.values(workspace.cards).filter((card) => card.groupId === null);
  for (const groupId of workspace.groupOrder) {
    const group = workspace.groups[groupId];
    if (!group) continue;
    lines.push(`## ${group.name}`, "");
    for (const cardId of group.cardIds) {
      const card = workspace.cards[cardId];
      if (card) lines.push(markdownCard(card.title, card.url, card.type, card.source, card.note), "");
    }
  }
  if (inbox.length) {
    lines.push(`## ${locale === "zh" ? "收件箱" : "Inbox"}`, "");
    for (const card of inbox) lines.push(markdownCard(card.title, card.url, card.type, card.source, card.note), "");
  }
  return `${lines.join("\n").trim()}\n`;
}

export function createWorkspaceExport(workspace: Workspace, exportedAt = new Date().toISOString()) {
  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt,
    workspace: structuredClone(workspace)
  };
}

export function exportWorkspaceJson(workspace: Workspace): string {
  return `${JSON.stringify(createWorkspaceExport(workspace), null, 2)}\n`;
}

export function safeExportFilename(workspace: Workspace, extension: "md" | "json"): string {
  const base = workspace.name
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "workspace";
  return `${base}.${extension}`;
}
