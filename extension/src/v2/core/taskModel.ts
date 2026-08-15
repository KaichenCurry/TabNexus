/*
 * TabNexus v2 数据模型与纯函数（Schema v2）。
 *
 * 原则：
 * 1. 全部纯函数、无 I/O、可单测；
 * 2. 迁移是纯拷贝——v1 数据保留原样，直到 R1.10 验收后才退役旧壳；
 * 3. MCP 契约只做加法：v1 工具名不动，适配层（R2）负责 v1↔v2 映射；
 * 4. progress 永远是派生值，不落库。
 */
import type { Card, Edge, Workspace } from "../../core/types";

export type PageStatus = "unread" | "read" | "adopted" | "excluded";
export type PageSource = "user" | "ai" | "agent";

export type Page = {
  id: string;
  title: string;
  url?: string;
  favicon?: string;
  note: string;
  status: PageStatus;
  /** 排除原因：P1"为什么不要"的一等字段，仅 status=excluded 时有意义 */
  excludedReason?: string;
  source: PageSource;
  savedAt?: string;
  /** 画布节点绑定（R3 起使用） */
  canvasNodeId?: string;
};

export type Section = {
  id: string;
  name: string;
  color?: string;
  pageIds: string[];
  collapsed?: boolean;
};

export type CanvasState = {
  version: 1;
  /** Excalidraw elements JSON（R3 起渲染） */
  elements: unknown[];
  /** v1 edges 的迁移产物（R3 映射为手绘箭头） */
  arrows: Array<{ fromPageId: string; toPageId: string; label?: string }>;
};

export type Task = {
  id: string;
  /** 任务名 = 首启问题「这次你想搞清楚什么？」的答案 */
  name: string;
  /** 一句话目标（人写 / AI 建议） */
  goal: string;
  /** 下一步（人 / AI / Agent 写） */
  nextStep: string;
  /** 当前结论（人 / AI / Agent 写） */
  conclusion: string;
  /** AI 一键总结缓存 */
  summary?: string;
  sections: Section[];
  pages: Record<string, Page>;
  canvas: CanvasState;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type SectionProgress = {
  sectionId: string;
  total: number;
  adopted: number;
  percent: number;
};

export type TaskProgress = {
  /** 计入进度的页数（排除 excluded） */
  total: number;
  /** read + adopted */
  read: number;
  adopted: number;
  excluded: number;
  /** 加权进度 0..100：unread 0% / read 50% / adopted 100% */
  percent: number;
  /** 全部已读且 ≥1 已采用 → 可交付 */
  deliverable: boolean;
  sections: SectionProgress[];
};

const STATUS_WEIGHT: Record<PageStatus, number> = {
  unread: 0,
  read: 0.5,
  adopted: 1,
  excluded: 0
};

function sectionPercent(pages: Array<Page | undefined>): number {
  const counted = pages.filter((page) => page && page.status !== "excluded");
  if (counted.length === 0) return 0;
  const sum = counted.reduce((total, page) => total + STATUS_WEIGHT[page!.status], 0);
  return Math.round((sum / counted.length) * 100);
}

/**
 * 分段式任务进度条的唯一数据来源（§7 蓝图）。
 * 段 = 章节；整体数字包含未归类页；excluded 不计分母、单独灰显。
 */
export function computeProgress(task: Pick<Task, "sections" | "pages">): TaskProgress {
  const allPages = Object.values(task.pages);
  const excluded = allPages.filter((page) => page.status === "excluded").length;
  const counted = allPages.filter((page) => page.status !== "excluded");
  const read = counted.filter((page) => page.status === "read" || page.status === "adopted").length;
  const adopted = counted.filter((page) => page.status === "adopted").length;
  const sum = counted.reduce((total, page) => total + STATUS_WEIGHT[page.status], 0);
  const percent = counted.length === 0 ? 0 : Math.round((sum / counted.length) * 100);

  const sections: SectionProgress[] = task.sections.map((section) => {
    const pages = section.pageIds.map((pageId) => task.pages[pageId]);
    const counted = pages.filter((page) => page && page.status !== "excluded");
    return {
      sectionId: section.id,
      total: counted.length,
      adopted: counted.filter((page) => page!.status === "adopted").length,
      percent: sectionPercent(pages)
    };
  });

  return {
    total: counted.length,
    read,
    adopted,
    excluded,
    percent,
    deliverable: counted.length > 0 && read === counted.length && adopted >= 1,
    sections
  };
}

/**
 * v1 Workspace → v2 Task（纯拷贝迁移，无损、可回滚）。
 * Group→Section 1:1；Card→Page 1:1（status 兼容映射，excluded 为 v2 新增态）；
 * Edge→canvas.arrows（R3 映射为 Excalidraw 箭头）。
 */
export function migrateWorkspaceToTask(workspace: Workspace, now: string = new Date().toISOString()): Task {
  const pages: Record<string, Page> = {};
  for (const [cardId, card] of Object.entries(workspace.cards)) {
    pages[cardId] = migrateCardToPage(card);
  }

  const sections: Section[] = workspace.groupOrder.map((groupId) => {
    const group = workspace.groups[groupId];
    return { id: group.id, name: group.name, color: group.color, pageIds: [...group.cardIds] };
  });

  const arrows: CanvasState["arrows"] = workspace.edges.map((edge: Edge) => ({
    fromPageId: edge.fromCardId,
    toPageId: edge.toCardId,
    label: edge.label
  }));

  const meta = workspace.v2;
  return {
    id: workspace.id,
    name: workspace.name,
    goal: meta?.goal ?? "",
    nextStep: meta?.nextStep ?? "",
    conclusion: meta?.conclusion ?? "",
    summary: meta?.summary,
    sections,
    pages,
    canvas: { version: 1, elements: [], arrows },
    archivedAt: meta?.archivedAt,
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt ?? now
  };
}

/** v1 Card → v2 Page（单张迁移，供增量路径复用） */
export function migrateCardToPage(card: Card): Page {
  return {
    id: card.id,
    title: card.title,
    url: card.url,
    favicon: card.favicon,
    note: card.note,
    status: card.status,
    excludedReason: card.excludedReason,
    source: card.source,
    savedAt: card.savedAt
  };
}

/** 判断某页是否落在任何章节（未归类） */
export function isUnassignedPage(task: Pick<Task, "sections">, pageId: string): boolean {
  return !task.sections.some((section) => section.pageIds.includes(pageId));
}
