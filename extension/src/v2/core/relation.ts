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

export type RelationLane = {
  id: string;
  name: string;
  color?: string;
  count: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type RelationLayout = {
  nodes: RelationNode[];
  edges: RelationEdge[];
  lanes: RelationLane[];
  width: number;
  height: number;
};

const LANE_WIDTH = 264;
const LANE_GAP = 24;
const NODE_WIDTH = 224;
const NODE_HEIGHT = 64;
const NODE_GAP = 16;
const START_X = 24;
const START_Y = 24;
const LANE_HEADER = 56;
const LANE_PADDING = 20;

export function layoutRelations(task: Task): RelationLayout {
  const nodes: RelationNode[] = [];
  const lanes: RelationLane[] = [];
  let laneIndex = 0;
  let maxLaneHeight = 0;

  const placeLane = (id: string, name: string, color: string | undefined, pageIds: string[]) => {
    if (pageIds.length === 0) return;
    const laneX = START_X + laneIndex * (LANE_WIDTH + LANE_GAP);
    const laneHeight = LANE_HEADER + LANE_PADDING + pageIds.length * NODE_HEIGHT + Math.max(0, pageIds.length - 1) * NODE_GAP + LANE_PADDING;
    lanes.push({ id, name, color, count: pageIds.length, x: laneX, y: START_Y, width: LANE_WIDTH, height: laneHeight });
    pageIds.forEach((pageId, rowIndex) => {
      const page = task.pages[pageId];
      if (!page) return;
      nodes.push({
        pageId,
        title: page.title,
        url: page.url,
        status: page.status,
        x: laneX + LANE_PADDING,
        y: START_Y + LANE_HEADER + LANE_PADDING + rowIndex * (NODE_HEIGHT + NODE_GAP),
        width: NODE_WIDTH,
        height: NODE_HEIGHT
      });
    });
    if (laneHeight > maxLaneHeight) maxLaneHeight = laneHeight;
    laneIndex += 1;
  };

  for (const section of task.sections) placeLane(section.id, section.name, section.color, section.pageIds);
  placeLane("__unassigned", "未归类", undefined, Object.values(task.pages).filter((page) => isUnassignedPage(task, page.id)).map((page) => page.id));

  const edges: RelationEdge[] = task.canvas.arrows
    .filter((arrow) => task.pages[arrow.fromPageId] && task.pages[arrow.toPageId])
    .map((arrow) => ({ fromPageId: arrow.fromPageId, toPageId: arrow.toPageId, label: arrow.label }));

  return {
    nodes,
    edges,
    lanes,
    width: Math.max(640, START_X * 2 + laneIndex * LANE_WIDTH + Math.max(0, laneIndex - 1) * LANE_GAP),
    height: Math.max(400, START_Y * 2 + maxLaneHeight)
  };
}

export function nodeCenter(node: RelationNode): { x: number; y: number } {
  return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
}
