/*
 * TabNexus v2 Context Packet（交给 Agent 的上下文包）。
 * 隐私边界：只含任务元数据（标题/URL/备注/状态/排除原因/目标/结论），永不包含网页正文与 API Key。
 */
import { computeProgress, type Page, type Task } from "./taskModel";

export type ContextPacketPage = {
  id: string;
  title: string;
  url?: string;
  note: string;
  status: Page["status"];
  excludedReason?: string;
  source: Page["source"];
};

export type ContextPacket = {
  version: 2;
  task: {
    id: string;
    name: string;
    goal: string;
    nextStep: string;
    conclusion: string;
    archivedAt?: string;
  };
  progress: {
    total: number;
    read: number;
    adopted: number;
    excluded: number;
    deliverable: boolean;
  };
  sections: Array<{ id: string; name: string; pages: ContextPacketPage[] }>;
  unassigned: ContextPacketPage[];
  /** 不提供：网页正文、API Key、未选中的其他任务 */
  excludes: ["page-bodies", "api-keys", "other-tasks"];
};

function toPacketPage(page: Page): ContextPacketPage {
  return {
    id: page.id,
    title: page.title,
    url: page.url,
    note: page.note,
    status: page.status,
    excludedReason: page.excludedReason,
    source: page.source
  };
}

export function buildContextPacket(task: Task): ContextPacket {
  const progress = computeProgress(task);
  const inSection = new Set(task.sections.flatMap((section) => section.pageIds));
  return {
    version: 2,
    task: {
      id: task.id,
      name: task.name,
      goal: task.goal,
      nextStep: task.nextStep,
      conclusion: task.conclusion,
      archivedAt: task.archivedAt
    },
    progress: {
      total: progress.total,
      read: progress.read,
      adopted: progress.adopted,
      excluded: progress.excluded,
      deliverable: progress.deliverable
    },
    sections: task.sections.map((section) => ({
      id: section.id,
      name: section.name,
      pages: section.pageIds.flatMap((pageId) => {
        const page = task.pages[pageId];
        return page ? [toPacketPage(page)] : [];
      })
    })),
    unassigned: Object.values(task.pages)
      .filter((page) => !inSection.has(page.id))
      .map(toPacketPage),
    excludes: ["page-bodies", "api-keys", "other-tasks"]
  };
}

/** Markdown 渲染（复制进 DSH / Codex 等 Agent 的上下文） */
export function renderContextPacketMarkdown(packet: ContextPacket, locale: "zh" | "en"): string {
  const t = packet.task;
  const progressLine = locale === "zh"
    ? `已读 ${packet.progress.read}/${packet.progress.total} · ⭐已采用 ${packet.progress.adopted} · 已排除 ${packet.progress.excluded}`
    : `Read ${packet.progress.read}/${packet.progress.total} · ⭐ adopted ${packet.progress.adopted} · excluded ${packet.progress.excluded}`;
  const lines = [
    `# ${t.name}`,
    "",
    `${locale === "zh" ? "目标" : "Goal"}: ${t.goal || "—"}`,
    `${locale === "zh" ? "下一步" : "Next step"}: ${t.nextStep || "—"}`,
    `${locale === "zh" ? "当前结论" : "Conclusion"}: ${t.conclusion || "—"}`,
    "",
    progressLine,
    ""
  ];
  for (const section of packet.sections) {
    lines.push(`## ${section.name}`);
    for (const page of section.pages) {
      lines.push(`- [${statusGlyph(page.status)}] ${page.title}${page.url ? ` (${page.url})` : ""}${page.note ? ` — ${page.note}` : ""}${page.excludedReason ? ` [排除: ${page.excludedReason}]` : ""}`);
    }
    lines.push("");
  }
  if (packet.unassigned.length > 0) {
    lines.push(`## ${locale === "zh" ? "未归类" : "Unassigned"}`);
    for (const page of packet.unassigned) {
      lines.push(`- [${statusGlyph(page.status)}] ${page.title}${page.url ? ` (${page.url})` : ""}${page.note ? ` — ${page.note}` : ""}`);
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

function statusGlyph(status: Page["status"]): string {
  switch (status) {
    case "adopted": return "⭐";
    case "read": return "◐";
    case "excluded": return "✕";
    default: return "○";
  }
}
