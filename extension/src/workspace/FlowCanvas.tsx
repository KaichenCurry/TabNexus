import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  MiniMap,
  MarkerType,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  applyNodeChanges,
  getBezierPath,
  useReactFlow,
  useViewport,
  type Edge as CanvasEdge,
  type EdgeProps,
  type Node as CanvasNode,
  type NodeChange,
  type NodeProps
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { displayDomain } from "../core/url";
import { workspaceCardOrder } from "../core/workspace";
import type { Card, CardStatus, Edge, Locale, Workspace } from "../core/types";
import { message } from "../i18n";
import { CardStatusButton } from "./CardStatusButton";

const ROOT_WIDTH = 180;
const ROOT_HEIGHT = 70;
const GROUP_WIDTH = 158;
const GROUP_HEIGHT = 52;
const CARD_WIDTH = 196;
const CARD_HEIGHT = 82;
const CARD_GAP = 18;
const CARD_STRIDE = CARD_HEIGHT + CARD_GAP;
const BRANCH_GAP = 52;
const ROOT_GROUP_GAP = 46;
const GROUP_CARD_GAP = 30;

type FlowPosition = { x: number; y: number };
type InteractionMode = "select" | "pan";
type MindBranch = {
  key: string;
  groupId: string | null;
  name: string;
  color: string;
  cards: Card[];
  side: "left" | "right";
  blockHeight: number;
  groupPosition: FlowPosition;
};

type RootNodeData = {
  workspaceName: string;
  caption: string;
};
type GroupNodeData = {
  groupId: string | null;
  name: string;
  color: string;
  count: number;
  side: MindBranch["side"];
  addLabel: string;
  onAddSource: (groupId: string) => void;
};
type CardNodeData = {
  card: Card;
  locale: Locale;
  groupName: string;
  color: string;
  openLabel: string;
  onOpen: (card: Card) => void;
  onStatusChange: (cardId: string, status: CardStatus) => void;
};
type SemanticEdgeData = {
  workspaceEdge: Edge;
  label: string;
  removeLabel: string;
  onRemove: (edge: Edge) => void;
};

type RootNode = CanvasNode<RootNodeData, "root">;
type GroupNode = CanvasNode<GroupNodeData, "group">;
type CardNode = CanvasNode<CardNodeData, "card">;
type MindNode = RootNode | GroupNode | CardNode;
type SemanticCanvasEdge = CanvasEdge<SemanticEdgeData, "semantic">;

function RootNodeView({ data }: NodeProps<RootNode>) {
  return (
    <div className="mind-root-node">
      <Handle type="source" id="root-left" position={Position.Left} />
      <Handle type="source" id="root-right" position={Position.Right} />
      <span className="mind-root-mark" aria-hidden="true"><i /><i /><i /></span>
      <div><strong>{data.workspaceName}</strong><small>{data.caption}</small></div>
    </div>
  );
}

function GroupNodeView({ data }: NodeProps<GroupNode>) {
  const rootSide = data.side === "right" ? Position.Left : Position.Right;
  const cardSide = data.side === "right" ? Position.Right : Position.Left;
  return (
    <div className={`mind-group-node side-${data.side}`} style={{ "--branch-color": data.color } as CSSProperties}>
      <Handle type="target" id="group-root" position={rootSide} />
      <Handle type="source" id="group-cards" position={cardSide} />
      <span className="mind-group-dot" aria-hidden="true" />
      <div><strong>{data.name}</strong><small>{data.count}</small></div>
      {data.groupId && (
        <button
          type="button"
          className="nodrag nopan"
          onClick={() => data.onAddSource(data.groupId!)}
          title={data.addLabel}
          aria-label={`${data.addLabel} · ${data.name}`}
        >＋</button>
      )}
    </div>
  );
}

function CardNodeView({ data, selected }: NodeProps<CardNode>) {
  const { card } = data;
  return (
    <article className={`flow-node mind-card-node ${selected ? "is-selected" : ""}`} style={{ "--node-color": data.color } as CSSProperties}>
      <Handle type="target" id="card-left" position={Position.Left} />
      <Handle type="target" id="card-right" position={Position.Right} />
      <Handle type="source" id="semantic-source" position={Position.Right} />
      <div className="mind-card-main">
        {card.favicon
          ? <img className="flow-node-favicon" src={card.favicon} alt="" />
          : <span className="flow-node-type">{card.type.toUpperCase()}</span>}
        <div className="flow-node-copy">
          <div className="flow-node-title">{card.title}</div>
          <span>{displayDomain(card.url) || card.type.toUpperCase()}</span>
        </div>
        {card.url && (
          <button
            type="button"
            className="flow-node-open nodrag nopan"
            onClick={(event) => { event.stopPropagation(); data.onOpen(card); }}
            title={data.openLabel}
            aria-label={data.openLabel}
          >↗</button>
        )}
        <span className="flow-node-handle" aria-hidden="true">⠿</span>
      </div>
      <div className="flow-node-footer">
        <span>{data.groupName} · {card.type.toUpperCase()}</span>
        <span className="mind-status-wrap nodrag nopan" onClick={(event) => event.stopPropagation()}>
          <CardStatusButton
            status={card.status}
            locale={data.locale}
            onChange={(status) => data.onStatusChange(card.id, status)}
          />
        </span>
      </div>
    </article>
  );
}

function SemanticEdgeView({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd }: EdgeProps<SemanticCanvasEdge>) {
  const horizontalDistance = Math.abs(targetX - sourceX);
  const defaultRoute = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const lift = Math.min(120, Math.max(54, horizontalDistance * .14));
  const controlY = Math.min(sourceY, targetY) - lift;
  const path = horizontalDistance > 260
    ? `M ${sourceX} ${sourceY} C ${sourceX + (targetX - sourceX) * .28} ${controlY}, ${targetX - (targetX - sourceX) * .28} ${controlY}, ${targetX} ${targetY}`
    : defaultRoute[0];
  const labelX = horizontalDistance > 260 ? (sourceX + targetX) / 2 : defaultRoute[1];
  const labelY = horizontalDistance > 260 ? (sourceY + targetY) * .125 + controlY * .75 : defaultRoute[2];
  if (!data) return <BaseEdge id={id} path={path} markerEnd={markerEnd} />;
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} />
      <EdgeLabelRenderer>
        <button
          type="button"
          className="flow-edge-label nodrag nopan"
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)` }}
          title={`${data.label} · ${data.removeLabel}`}
          onClick={() => data.onRemove(data.workspaceEdge)}
        >{data.label}<span>×</span></button>
      </EdgeLabelRenderer>
    </>
  );
}

const nodeTypes = { root: RootNodeView, group: GroupNodeView, card: CardNodeView };
const edgeTypes = { semantic: SemanticEdgeView };

function CanvasPanels({
  mode,
  locale,
  selectedCount,
  onModeChange,
  onAutoArrange
}: {
  mode: InteractionMode;
  locale: Locale;
  selectedCount: number;
  onModeChange: (mode: InteractionMode) => void;
  onAutoArrange: () => void;
}) {
  const { zoomIn, zoomOut, fitView } = useReactFlow<MindNode, CanvasEdge>();
  const { zoom } = useViewport();
  const t = (key: Parameters<typeof message>[1], vars?: Record<string, string | number>) => message(locale, key, vars);
  return (
    <>
      <Panel position="top-left" className="flow-tool-panel">
        <div className="flow-tool-switch" role="group" aria-label={t("canvasTools")}>
          <button type="button" className={mode === "select" ? "active" : ""} onClick={() => onModeChange("select")} aria-pressed={mode === "select"} title={t("selectTool")}>
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4.3 2.7 15.8 9l-5.1 1.6-2.2 4.8L4.3 2.7Z" /></svg>
          </button>
          <button type="button" className={mode === "pan" ? "active" : ""} onClick={() => onModeChange("pan")} aria-pressed={mode === "pan"} title={t("panTool")}>
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7.1 9.5V5.1a1.2 1.2 0 0 1 2.4 0v3.2-4a1.2 1.2 0 0 1 2.4 0v4-2.6a1.2 1.2 0 0 1 2.4 0v3-1.4a1.2 1.2 0 0 1 2.4 0v4.4c0 3.4-2.1 5.6-5.5 5.6H9.8c-1.6 0-2.8-.6-3.8-1.8l-2.6-3.2a1.2 1.2 0 0 1 1.8-1.6l1.9 1.7V9.5Z" /></svg>
          </button>
        </div>
        <span className="flow-tool-caption">{t(mode === "select" ? "selectToolHint" : "panToolHint")}</span>
      </Panel>
      {selectedCount > 0 && <Panel position="top-center" className="flow-selection-count">{t("canvasSelected", { count: selectedCount })}</Panel>}
      <Panel position="bottom-right" className="flow-canvas-controls">
        <button type="button" onClick={() => void zoomOut({ duration: 160 })} aria-label={t("zoomOut")}>−</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => void zoomIn({ duration: 160 })} aria-label={t("zoomIn")}>＋</button>
        <i />
        <button type="button" onClick={() => void fitView({ padding: .1, duration: 220, minZoom: .38, maxZoom: 1.1 })} aria-label={t("fitCanvas")} title={t("fitCanvas")}>⌗</button>
        <button type="button" className="auto-layout-button" onClick={() => { onAutoArrange(); window.setTimeout(() => void fitView({ padding: .08, duration: 220, minZoom: .66, maxZoom: 1.1 }), 20); }}>↺ {t("autoArrange")}</button>
      </Panel>
    </>
  );
}

function FlowCanvasInner({
  workspace,
  cards,
  locale,
  aiLoading,
  aiEnabled,
  onAutoArrange,
  onStatusChange,
  onOpenCard,
  onConnect,
  onRemoveEdge,
  onSuggestStructure,
  onAddSourceToGroup
}: {
  workspace: Workspace;
  cards: Card[];
  locale: Locale;
  aiLoading: boolean;
  aiEnabled: boolean;
  onAutoArrange: (positions: Record<string, FlowPosition>) => void;
  onStatusChange: (cardId: string, status: CardStatus) => void;
  onOpenCard: (card: Card) => void;
  onConnect: (fromCardId: string, toCardId: string) => void;
  onRemoveEdge: (edge: Edge) => void;
  onSuggestStructure: () => void;
  onAddSourceToGroup: (groupId: string) => void;
}) {
  const [linkMode, setLinkMode] = useState(false);
  const [linkStartId, setLinkStartId] = useState<string | null>(null);
  const [interactionMode, setInteractionMode] = useState<InteractionMode>("select");
  const [canvasNodes, setCanvasNodes] = useState<MindNode[]>([]);
  const t = (key: Parameters<typeof message>[1], vars?: Record<string, string | number>) => message(locale, key, vars);
  const visibleIds = useMemo(() => new Set(cards.map((card) => card.id)), [cards]);
  const orderedCards = useMemo(() => {
    const visible = new Set(cards.map((card) => card.id));
    return workspaceCardOrder(workspace).filter((card) => visible.has(card.id));
  }, [cards, workspace]);

  const mindLayout = useMemo(() => {
    const groupedCards = new Map<string | null, Card[]>();
    for (const card of orderedCards) {
      const groupId = card.groupId && workspace.groups[card.groupId] ? card.groupId : null;
      groupedCards.set(groupId, [...(groupedCards.get(groupId) ?? []), card]);
    }
    const raw: Array<Omit<MindBranch, "side" | "groupPosition">> = workspace.groupOrder.flatMap((groupId) => {
      const group = workspace.groups[groupId];
      const branchCards = groupedCards.get(groupId) ?? [];
      if (!group || branchCards.length === 0) return [];
      return [{ key: groupId, groupId, name: group.name, color: group.color, cards: branchCards, blockHeight: Math.max(GROUP_HEIGHT, branchCards.length * CARD_STRIDE - CARD_GAP) }];
    });
    const ungrouped = groupedCards.get(null) ?? [];
    if (ungrouped.length) raw.push({ key: "ungrouped", groupId: null, name: locale === "zh" ? "未分组" : "Ungrouped", color: "#8A93A3", cards: ungrouped, blockHeight: Math.max(GROUP_HEIGHT, ungrouped.length * CARD_STRIDE - CARD_GAP) });

    let leftWeight = 0;
    let rightWeight = 0;
    const withSides = raw.map((branch, index) => {
      const side: MindBranch["side"] = index === 0 || rightWeight <= leftWeight ? "right" : "left";
      if (side === "right") rightWeight += branch.blockHeight + BRANCH_GAP;
      else leftWeight += branch.blockHeight + BRANCH_GAP;
      return { ...branch, side };
    });
    const totalFor = (side: MindBranch["side"]) => {
      const branches = withSides.filter((branch) => branch.side === side);
      return Math.max(0, branches.reduce((sum, branch) => sum + branch.blockHeight, 0) + Math.max(0, branches.length - 1) * BRANCH_GAP);
    };
    const cursors = { left: -totalFor("left") / 2, right: -totalFor("right") / 2 };
    const rootPosition = { x: -ROOT_WIDTH / 2, y: -ROOT_HEIGHT / 2 };
    const defaultPositions = new Map<string, FlowPosition>();
    const branches = withSides.map<MindBranch>((branch) => {
      const branchTop = cursors[branch.side];
      cursors[branch.side] += branch.blockHeight + BRANCH_GAP;
      const groupPosition = {
        x: branch.side === "right" ? ROOT_WIDTH / 2 + ROOT_GROUP_GAP : -ROOT_WIDTH / 2 - ROOT_GROUP_GAP - GROUP_WIDTH,
        y: branchTop + (branch.blockHeight - GROUP_HEIGHT) / 2
      };
      branch.cards.forEach((card, index) => defaultPositions.set(card.id, {
        x: branch.side === "right" ? groupPosition.x + GROUP_WIDTH + GROUP_CARD_GAP : groupPosition.x - GROUP_CARD_GAP - CARD_WIDTH,
        y: branchTop + index * CARD_STRIDE
      }));
      return { ...branch, groupPosition };
    });
    return { branches, defaultPositions, rootPosition };
  }, [locale, orderedCards, workspace.groupOrder, workspace.groups]);

  const computedNodes = useMemo<MindNode[]>(() => {
    const root: RootNode = {
      id: "workspace-root",
      type: "root",
      position: mindLayout.rootPosition,
      data: { workspaceName: workspace.name, caption: t("mindRootCaption", { groups: mindLayout.branches.length, cards: orderedCards.length }) },
      draggable: false,
      selectable: false,
      style: { width: ROOT_WIDTH, height: ROOT_HEIGHT }
    };
    const groups: GroupNode[] = mindLayout.branches.map((branch) => ({
      id: `group:${branch.key}`,
      type: "group",
      position: branch.groupPosition,
      data: { groupId: branch.groupId, name: branch.name, color: branch.color, count: branch.cards.length, side: branch.side, addLabel: t("addSourceToGroup"), onAddSource: onAddSourceToGroup },
      draggable: false,
      selectable: false,
      style: { width: GROUP_WIDTH, height: GROUP_HEIGHT }
    }));
    const cardNodes: CardNode[] = orderedCards.map((card) => {
      const group = card.groupId ? workspace.groups[card.groupId] : undefined;
      return {
        id: `card:${card.id}`,
        type: "card",
        position: card.flowLayout === "mind" && card.flow ? card.flow : mindLayout.defaultPositions.get(card.id) ?? { x: 0, y: 0 },
        data: {
          card,
          locale,
          groupName: group?.name ?? (locale === "zh" ? "未分组" : "Ungrouped"),
          color: group?.color ?? "#8A93A3",
          openLabel: t("open"),
          onOpen: onOpenCard,
          onStatusChange
        },
        style: { width: CARD_WIDTH, height: CARD_HEIGHT }
      };
    });
    return [root, ...groups, ...cardNodes];
  }, [locale, mindLayout, onAddSourceToGroup, onOpenCard, onStatusChange, orderedCards, workspace.groups, workspace.name]);

  useEffect(() => {
    setCanvasNodes((current) => {
      const selectedIds = new Set(current.filter((node) => node.selected).map((node) => node.id));
      return computedNodes.map((node) => ({ ...node, selected: selectedIds.has(node.id) }));
    });
  }, [computedNodes]);

  const flowEdges = useMemo<CanvasEdge[]>(() => {
    const hierarchy: CanvasEdge[] = mindLayout.branches.flatMap((branch) => {
      const sideHandle = branch.side === "right" ? "root-right" : "root-left";
      const groupId = `group:${branch.key}`;
      return [
        {
          id: `root:${branch.key}`,
          source: "workspace-root",
          sourceHandle: sideHandle,
          target: groupId,
          targetHandle: "group-root",
          type: "default",
          selectable: false,
          style: { stroke: branch.color, strokeWidth: 2.3, opacity: .56 }
        },
        ...branch.cards.map<CanvasEdge>((card) => ({
          id: `group:${branch.key}:${card.id}`,
          source: groupId,
          sourceHandle: "group-cards",
          target: `card:${card.id}`,
          targetHandle: branch.side === "right" ? "card-left" : "card-right",
          type: "default",
          selectable: false,
          style: { stroke: branch.color, strokeWidth: 1.7, opacity: .42 }
        }))
      ];
    });
    const semantic: SemanticCanvasEdge[] = workspace.edges
      .filter((edge) => visibleIds.has(edge.fromCardId) && visibleIds.has(edge.toCardId))
      .map((edge) => ({
        id: `semantic:${edge.fromCardId}:${edge.toCardId}`,
        source: `card:${edge.fromCardId}`,
        sourceHandle: "semantic-source",
        target: `card:${edge.toCardId}`,
        targetHandle: "card-left",
        type: "semantic",
        selectable: false,
        markerEnd: { type: MarkerType.ArrowClosed, color: "#7087ae" },
        style: { stroke: "#7087ae", strokeWidth: 1.7 },
        data: { workspaceEdge: edge, label: edge.label || t("relationDefault"), removeLabel: t("removeRelation"), onRemove: onRemoveEdge }
      }));
    return [...hierarchy, ...semantic];
  }, [mindLayout.branches, onRemoveEdge, visibleIds, workspace.edges]);

  const handleNodeClick = (_event: ReactMouseEvent, node: MindNode) => {
    if (!linkMode || node.type !== "card") return;
    const cardId = node.data.card.id;
    if (!linkStartId) setLinkStartId(cardId);
    else if (linkStartId === cardId) setLinkStartId(null);
    else {
      onConnect(linkStartId, cardId);
      setLinkStartId(null);
    }
  };

  if (orderedCards.length === 0) {
    const filteredEmpty = Object.keys(workspace.cards).length > 0;
    return (
      <section className="flow-empty">
        <span className="flow-empty-icon" aria-hidden="true">⌁</span>
        <h2>{t(filteredEmpty ? "filterEmptyTitle" : "flowEmptyTitle")}</h2>
        <p>{t(filteredEmpty ? "filterEmptyBody" : "flowEmptyBody")}</p>
      </section>
    );
  }

  const selectedCount = canvasNodes.filter((node) => node.type === "card" && node.selected).length;
  const autoArrange = () => {
    const positions = Object.fromEntries(mindLayout.defaultPositions);
    setCanvasNodes((current) => current.map((node) => node.type === "card" && positions[node.data.card.id] ? { ...node, position: positions[node.data.card.id] } : node));
    onAutoArrange(positions);
  };

  return (
    <section className="flow-workspace mind-workspace">
      <header className="flow-toolbar">
        <div className="flow-toolbar-copy">
          <div className="flow-toolbar-title">
            <strong>{t("flowView")}</strong>
            <span className={`flow-ai-state ${aiEnabled ? "connected" : "local"}`}><i />{t(aiEnabled ? "flowAiConnected" : "flowAiLocal")}</span>
          </div>
          <p>{linkStartId ? t("connectingFrom", { title: workspace.cards[linkStartId]?.title ?? "" }) : t("flowIntro")}</p>
        </div>
        <div className="flow-actions">
          <button type="button" className={`button ${linkMode ? "connect-active" : "secondary"}`} onClick={() => { setLinkMode((current) => !current); setLinkStartId(null); }}>
            {linkMode ? `× ${t("cancelConnect")}` : `⌁ ${t("connectCards")}`}
          </button>
          <button type="button" className="button ai" disabled={aiLoading || orderedCards.length < 2} onClick={onSuggestStructure}>
            ✦ {aiLoading ? t("structureLoading") : t(aiEnabled ? "suggestStructure" : "localSuggestStructure")}
          </button>
        </div>
      </header>
      <div className={`flow-scroll infinite-canvas mode-${interactionMode} ${linkMode ? "is-linking" : ""}`}>
        <ReactFlow<MindNode, CanvasEdge>
          nodes={canvasNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={(changes: NodeChange<MindNode>[]) => setCanvasNodes((current) => applyNodeChanges(changes, current))}
          onNodeClick={handleNodeClick}
          onPaneClick={() => linkMode && setLinkStartId(null)}
          onNodeDragStop={(_event, node, draggedNodes) => {
            const moved = draggedNodes.length ? draggedNodes : [node];
            onAutoArrange(Object.fromEntries(moved.filter((item) => item.type === "card").map((item) => [item.data.card.id, item.position])));
          }}
          fitView
          fitViewOptions={{ padding: .08, minZoom: .66, maxZoom: 1.05 }}
          minZoom={.25}
          maxZoom={2}
          selectionMode={SelectionMode.Partial}
          selectionOnDrag={interactionMode === "select" && !linkMode}
          panOnDrag={interactionMode === "pan" ? true : [1, 2]}
          nodesDraggable={!linkMode}
          nodesConnectable={false}
          nodesFocusable
          zoomOnScroll
          zoomOnPinch
          zoomOnDoubleClick={false}
          multiSelectionKeyCode="Shift"
          deleteKeyCode={null}
          autoPanOnNodeDrag
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} color="#c9ced7" />
          <MiniMap position="bottom-left" pannable zoomable className="flow-minimap" nodeStrokeWidth={2} nodeColor={(node) => node.type === "root" ? "#4f5da1" : node.type === "group" ? (node.data as GroupNodeData).color : "#ffffff"} maskColor="rgba(243,245,248,.76)" />
          <CanvasPanels mode={interactionMode} locale={locale} selectedCount={selectedCount} onModeChange={setInteractionMode} onAutoArrange={autoArrange} />
        </ReactFlow>
      </div>
    </section>
  );
}

export function FlowCanvas(props: Parameters<typeof FlowCanvasInner>[0]) {
  return <ReactFlowProvider><FlowCanvasInner {...props} /></ReactFlowProvider>;
}
