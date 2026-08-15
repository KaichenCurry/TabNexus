/*
 * TabNexus v2 任务操作层：v2 动作 → v1 AppState 的纯函数映射。
 *
 * 策略（BLUEPRINT 实现注记）：存储继续使用 v1 AppState（零破坏，后台/MCP 不动），
 * v2 Task 是视图模型；本层把"任务文档"的每次编辑翻译成 v1 Workspace 变更。
 * R1.10 之后是否把 Task 落库由迁移阶段决定——本层接口不随之改变。
 */
import type { AppState, Card, CardStatus, Group, Locale, Workspace, WorkspaceV2Meta } from "../../core/types";
import {
  createEmptyWorkspace,
  createGroup,
  deleteCard,
  deleteGroup,
  moveCard,
  renameWorkspace,
  updateCardNote,
  updateCardStatus,
  updateGroup,
  updateWorkspace
} from "../../core/workspace";
import { migrateWorkspaceToTask, type PageStatus, type Task } from "./taskModel";

export const EMPTY_TASK_META: WorkspaceV2Meta = {
  goal: "",
  nextStep: "",
  conclusion: ""
};

function requireWorkspace(state: AppState, taskId: string): Workspace {
  const workspace = state.workspaces[taskId];
  if (!workspace) throw new Error(`Unknown task id: ${taskId}`);
  return workspace;
}

export function taskFromWorkspace(workspace: Workspace): Task {
  return migrateWorkspaceToTask(workspace);
}

export function activeTask(state: AppState): Task | null {
  const workspace = state.workspaces[state.activeWorkspaceId];
  return workspace ? taskFromWorkspace(workspace) : null;
}

export function listTasks(state: AppState): Task[] {
  return state.workspaceOrder.map((id) => taskFromWorkspace(state.workspaces[id]));
}

export function taskMeta(workspace: Workspace): WorkspaceV2Meta {
  return { ...EMPTY_TASK_META, ...(workspace.v2 ?? {}) };
}

export function withTaskMeta(workspace: Workspace, patch: Partial<WorkspaceV2Meta>): Workspace {
  return { ...workspace, v2: { ...taskMeta(workspace), ...patch } };
}

/** 更新任务元数据（目标/下一步/结论/摘要/归档） */
export function updateTaskMeta(state: AppState, taskId: string, patch: Partial<WorkspaceV2Meta>): AppState {
  const workspace = requireWorkspace(state, taskId);
  return updateWorkspace(state, withTaskMeta(workspace, patch));
}

/** 新建任务（侧栏 ＋）：名称为空时用未命名 */
export function createTask(state: AppState, locale: Locale, name?: string): AppState {
  const workspace = createEmptyWorkspace(locale, name?.trim() || undefined);
  return {
    ...state,
    workspaces: { ...state.workspaces, [workspace.id]: workspace },
    workspaceOrder: [...state.workspaceOrder, workspace.id],
    activeWorkspaceId: workspace.id
  };
}

/** 任务改名（任务头标题） */
export function renameTask(state: AppState, taskId: string, name: string): AppState {
  const workspace = requireWorkspace(state, taskId);
  const renamed = renameWorkspace(workspace, name);
  return renamed === workspace ? state : updateWorkspace(state, renamed);
}

/** 新建自由章节（v2 Section = v1 Group，名默认为"新章节"） */
export function createSection(state: AppState, taskId: string, locale: Locale = "zh", name?: string): AppState {
  const workspace = requireWorkspace(state, taskId);
  return updateWorkspace(state, createGroup(workspace, locale, name));
}

export function renameSection(state: AppState, taskId: string, sectionId: string, name: string): AppState {
  const workspace = requireWorkspace(state, taskId);
  return updateWorkspace(state, updateGroup(workspace, sectionId, { name }));
}

export function setSectionColor(state: AppState, taskId: string, sectionId: string, color: string): AppState {
  const workspace = requireWorkspace(state, taskId);
  return updateWorkspace(state, updateGroup(workspace, sectionId, { color }));
}

export function deleteSection(state: AppState, taskId: string, sectionId: string): AppState {
  const workspace = requireWorkspace(state, taskId);
  return updateWorkspace(state, deleteGroup(workspace, sectionId));
}

/** 移动页到章节（sectionId=null 即"未归类"）；批量走同一次 state 更新 */
export function movePagesToSection(state: AppState, taskId: string, pageIds: string[], sectionId: string | null): AppState {
  let workspace = requireWorkspace(state, taskId);
  for (const pageId of [...new Set(pageIds)]) {
    workspace = moveCard(workspace, pageId, sectionId);
  }
  return updateWorkspace(state, workspace);
}

/** 设置页状态（含排除 + 排除原因） */
export function setPageStatus(
  state: AppState,
  taskId: string,
  pageId: string,
  status: PageStatus,
  excludedReason?: string
): AppState {
  const workspace = requireWorkspace(state, taskId);
  let next = updateCardStatus(workspace, pageId, status as CardStatus);
  const card = next.cards[pageId];
  if (card) {
    next = {
      ...next,
      cards: {
        ...next.cards,
        [pageId]: { ...card, excludedReason: status === "excluded" ? excludedReason ?? card.excludedReason : undefined }
      }
    };
  }
  return updateWorkspace(state, next);
}

export function setPageNote(state: AppState, taskId: string, pageId: string, note: string): AppState {
  const workspace = requireWorkspace(state, taskId);
  return updateWorkspace(state, updateCardNote(workspace, pageId, note));
}

/** 删除页（日常底座：破坏性，调用方负责确认） */
export function deletePage(state: AppState, taskId: string, pageId: string): AppState {
  const workspace = requireWorkspace(state, taskId);
  return updateWorkspace(state, deleteCard(workspace, pageId));
}

/**
 * Task → v1 Workspace 等价视图（供 v1 引擎桥接：分组建议校验/应用、采集等）。
 * 页面类型统一映射为 "web"；v2 元数据原样回带，保证视图写回不丢任务头字段。
 */
export function taskToWorkspaceView(task: Task): Workspace {
  const groups: Record<string, Group> = {};
  for (const section of task.sections) {
    groups[section.id] = {
      id: section.id,
      name: section.name,
      color: section.color ?? "",
      cardIds: [...section.pageIds]
    };
  }
  const sectionOf = new Map<string, string | null>(
    task.sections.flatMap((section) => section.pageIds.map((pageId) => [pageId, section.id] as const))
  );
  const cards: Record<string, Card> = {};
  for (const [pageId, page] of Object.entries(task.pages)) {
    cards[pageId] = {
      id: pageId,
      type: "web",
      title: page.title,
      url: page.url,
      favicon: page.favicon,
      note: page.note,
      status: page.status,
      excludedReason: page.excludedReason,
      groupId: sectionOf.get(pageId) ?? null,
      source: page.source,
      savedAt: page.savedAt
    };
  }
  return {
    id: task.id,
    name: task.name,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    groupOrder: task.sections.map((section) => section.id),
    groups,
    cards,
    edges: task.canvas.arrows.map((arrow) => ({ fromCardId: arrow.fromPageId, toCardId: arrow.toPageId, label: arrow.label })),
    v2: {
      goal: task.goal,
      nextStep: task.nextStep,
      conclusion: task.conclusion,
      summary: task.summary,
      archivedAt: task.archivedAt
    }
  };
}
