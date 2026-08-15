/*
 * TabNexus v2 AI 一键整理（任务链"整"）纯逻辑层。
 * 四模式：按内容理解（AI）/ 按时间（本地）/ 按域名（本地）/ 自定义提示词（AI）。
 * 全部纯函数；AI 调用与 UI 在组件/后台层。
 */
import { createDomainProposal } from "../../core/grouping";
import type { GroupingProposal, GroupingRequest } from "../../core/types";
import { taskToWorkspaceView } from "./taskOps";
import type { Task } from "./taskModel";

export type RegroupMode = "content" | "time" | "domain" | "custom";

/** 时间桶（本地模式）：按页的 savedAt 分 今天 / 本周 / 更早 */
function timeBucket(savedAt?: string, now: Date = new Date()): string {
  if (!savedAt) return "更早";
  const saved = new Date(savedAt);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (saved.getTime() >= startOfToday) return "今天";
  const startOfWeek = startOfToday - ((now.getDay() + 6) % 7) * 86_400_000;
  if (saved.getTime() >= startOfWeek) return "本周";
  return "更早";
}

/** 按时间归位（本地，零 AI 依赖） */
export function createTimeProposal(task: Task, pageIds: string[], now: Date = new Date()): GroupingProposal {
  const buckets: Array<{ name: string; pageIds: string[] }> = [
    { name: "今天", pageIds: [] },
    { name: "本周", pageIds: [] },
    { name: "更早", pageIds: [] }
  ];
  for (const pageId of pageIds) {
    const page = task.pages[pageId];
    if (!page) continue;
    const bucket = timeBucket(page.savedAt, now);
    buckets.find((entry) => entry.name === bucket)?.pageIds.push(pageId);
  }
  return {
    source: "local",
    groups: buckets
      .filter((bucket) => bucket.pageIds.length > 0)
      .map((bucket, index) => ({ id: `time_${index}`, name: bucket.name, color: "", isNew: true })),
    assignments: pageIds.flatMap((pageId) => {
      const page = task.pages[pageId];
      if (!page) return [];
      const bucketIndex = buckets.findIndex((bucket) => bucket.pageIds.includes(pageId));
      return bucketIndex >= 0 ? [{ cardId: pageId, groupId: `time_${bucketIndex}`, reason: buckets[bucketIndex].name }] : [];
    }),
    summary: "按保存时间划分",
    pruneEmptyGroups: true
  };
}

/** 按域名归位（本地）：经 v1 等价视图复用现有引擎 */
export function createDomainProposalV2(task: Task, locale: "zh" | "en", pageIds: string[]): GroupingProposal {
  return createDomainProposal(taskToWorkspaceView(task), locale, pageIds);
}

/** AI 模式（按内容 / 自定义提示词）的请求构造：只携带元数据 */
export function buildRegroupRequest(task: Task, locale: "zh" | "en", pageIds: string[], instruction?: string): GroupingRequest {
  const hostname = (url?: string) => {
    try { return url ? new URL(url).hostname.replace(/^www\./, "") : undefined; } catch { return undefined; }
  };
  return {
    locale,
    instruction: instruction?.trim() || undefined,
    cards: pageIds.flatMap((pageId) => {
      const page = task.pages[pageId];
      return page ? [{
        id: page.id,
        title: page.title,
        url: page.url,
        type: "web" as const,
        hostname: hostname(page.url),
        savedAt: page.savedAt
      }] : [];
    }),
    existingGroups: task.sections.map((section) => ({
      id: section.id,
      name: section.name,
      cards: section.pageIds.flatMap((pageId) => {
        const page = task.pages[pageId];
        return page ? [{
          id: page.id,
          title: page.title,
          url: page.url,
          type: "web" as const,
          hostname: hostname(page.url),
          savedAt: page.savedAt
        }] : [];
      })
    }))
  };
}
