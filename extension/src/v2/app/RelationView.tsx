import { useMemo } from "react";
import { message } from "../../i18n";
import type { Locale } from "../../core/types";
import { layoutRelations, nodeCenter } from "../core/relation";
import type { Task } from "../core/taskModel";

type Props = { task: Task; locale: Locale; onClose: () => void };

const STATUS_GLYPH: Record<string, string> = {
  unread: "○",
  read: "◐",
  adopted: "⭐",
  excluded: "✕"
};

const STATUS_STROKE: Record<string, string> = {
  unread: "var(--tn-gray-400)",
  read: "var(--tn-primary)",
  adopted: "var(--tn-success)",
  excluded: "var(--tn-gray-400)"
};

export function RelationView({ task, locale, onClose }: Props) {
  const layout = useMemo(() => layoutRelations(task), [task]);

  const openPage = (url?: string) => {
    if (!url) return;
    if (typeof chrome !== "undefined" && chrome.tabs?.create) void chrome.tabs.create({ url });
    else window.open(url, "_blank", "noopener");
  };

  return (
    <div className="tn-relation" aria-label={message(locale, "v2Canvas")}>
      <div className="tn-canvas-bar">
        <button type="button" className="tn-secondary" onClick={onClose}>← {message(locale, "v2Document")}</button>
        <span className="tn-canvas-hint">{layout.nodes.length} 个节点 · {layout.edges.length} 条关系 · 点击节点打开原页</span>
      </div>
      {layout.nodes.length === 0 ? (
        <p className="tn-canvas-loading">先收进一些页面，关系图会出现在这里。</p>
      ) : (
        <div className="tn-relation-body">
          <svg
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            width={layout.width}
            height={layout.height}
            role="img"
            aria-label="任务关系图"
          >
            <defs>
              <marker id="tn-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--tn-gray-400)" />
              </marker>
            </defs>
            {layout.edges.map((edge, index) => {
              const from = layout.nodes.find((node) => node.pageId === edge.fromPageId);
              const to = layout.nodes.find((node) => node.pageId === edge.toPageId);
              if (!from || !to) return null;
              const a = nodeCenter(from);
              const b = nodeCenter(to);
              const midX = (a.x + b.x) / 2;
              const midY = (a.y + b.y) / 2;
              return (
                <g key={`${edge.fromPageId}-${edge.toPageId}-${index}`}>
                  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--tn-gray-400)" strokeWidth={1.5} markerEnd="url(#tn-arrow)" />
                  {edge.label && (
                    <text x={midX} y={midY - 6} textAnchor="middle" className="tn-relation-label">{edge.label}</text>
                  )}
                </g>
              );
            })}
            {layout.nodes.map((node) => (
              <g key={node.pageId} className="tn-relation-node" onClick={() => openPage(node.url)}>
                <rect
                  x={node.x}
                  y={node.y}
                  width={node.width}
                  height={node.height}
                  rx={10}
                  fill="var(--tn-gray-50)"
                  stroke={STATUS_STROKE[node.status] ?? "var(--tn-gray-400)"}
                  strokeWidth={node.status === "adopted" ? 2 : 1}
                />
                <text x={node.x + 12} y={node.y + 22} className="tn-relation-glyph">{STATUS_GLYPH[node.status] ?? "○"}</text>
                <text x={node.x + 12} y={node.y + 46} className="tn-relation-title">{node.title.length > 22 ? `${node.title.slice(0, 22)}…` : node.title}</text>
              </g>
            ))}
          </svg>
        </div>
      )}
    </div>
  );
}
