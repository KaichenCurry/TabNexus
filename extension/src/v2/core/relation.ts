/*
 * TabNexus v2 简单关系图布局（纯 SVG 渲染，零依赖）。
 * 章节=纵向泳道，页=节点，关系=带标签箭头；未归类单独一列。
 * 全部纯函数，可单测；无手绘持久化——关系数据即任务 edges（v1 兼容）。
 */
import { isUnassignedPage, type Page, type Task } from "./taskModel";

export type RelationNode = {
  pageId: string;
  title: string;
  url?: string;
  status: Page["status"];
  x: number;
  y: number;
  width: number;
  height: number;
};

export type RelationEdge = {
  fromPageId: string;
  toPageId: string;
  label?: string;
};

export type RelationLayout = {
  nodes: RelationNode[];
  edges: RelationEdge[];
  width: number;
  height: number;
};

const LANE_WIDTH = 240;
const LANE_GAP = 48;
const NODE_WIDTH = 208;
const NODE_HEIGHT = 64;
const NODE_GAP = 24;
const START_X = 48;
const START_Y = 40;

export function layoutRelations(task: Task): RelationLayout {
  const nodes: RelationNode[] = [];
  let laneIndex = 0;
  let maxHeight = 0;

  const placeLane = (pageIds: string[]) => {
    if (pageIds.length === 0) return;
    const laneX = START_X + laneIndex * (LANE_WIDTH + LANE_GAP);
    pageIds.forEach((pageId, rowIndex) => {
      const page = task.pages[pageId];
      if (!page) return;
      nodes.push({
        pageId,
        title: page.title,
        url: page.url,
        status: page.status,
        x: laneX,
        y: START_Y + rowIndex * (NODE_HEIGHT + NODE_GAP),
        width: NODE_WIDTH,
        height: NODE_HEIGHT
      });
    });
    const laneHeight = START_Y + pageIds.length * (NODE_HEIGHT + NODE_GAP);
    if (laneHeight > maxHeight) maxHeight = laneHeight;
    laneIndex += 1;
  };

  for (const section of task.sections) placeLane(section.pageIds);
  placeLane(Object.values(task.pages).filter((page) => isUnassignedPage(task, page.id)).map((page) => page.id));

  const edges: RelationEdge[] = task.canvas.arrows
    .filter((arrow) => task.pages[arrow.fromPageId] && task.pages[arrow.toPageId])
    .map((arrow) => ({ fromPageId: arrow.fromPageId, toPageId: arrow.toPageId, label: arrow.label }));

  return {
    nodes,
    edges,
    width: Math.max(480, laneIndex * (LANE_WIDTH + LANE_GAP) + LANE_WIDTH + START_X),
    height: Math.max(320, maxHeight)
  };
}

export function nodeCenter(node: RelationNode): { x: number; y: number } {
  return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
}
