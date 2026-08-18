import { useMemo } from "react";
import { message } from "../../i18n";
import type { Locale } from "../../core/types";
import { layoutRelations, nodeCenter } from "../core/relation";
import type { Task } from "../core/taskModel";

type Props = { task: Task; locale: Locale };

const STATUS_GLYPH: Record<string, string> = {
  unread: "待读",
  read: "已读",
  adopted: "采用",
  excluded: "排除"
};

const STATUS_STROKE: Record<string, string> = {
  unread: "var(--tn-gray-400)",
  read: "var(--tn-primary)",
  adopted: "var(--tn-success)",
  excluded: "var(--tn-gray-400)"
};

export function RelationView({ task, locale }: Props) {
  const layout = useMemo(() => layoutRelations(task), [task]);

  const openPage = (url?: string) => {
    if (!url) return;
    if (typeof chrome !== "undefined" && chrome.tabs?.create) void chrome.tabs.create({ url });
    else window.open(url, "_blank", "noopener");
  };

  return (
    <div className="tn-relation" aria-label={message(locale, "v2Canvas")}>
      <div className="tn-canvas-bar">
        <span>
          <strong>{locale === "zh" ? "上下文关系" : "Context relationships"}</strong>
          <small>{locale === "zh" ? "章节是范围，连线表达证据之间的关系" : "Sections provide scope; links explain how evidence relates"}</small>
        </span>
        <span className="tn-canvas-hint">{layout.nodes.length} {locale === "zh" ? "个页面" : "pages"} · {layout.edges.length} {locale === "zh" ? "条关系" : "links"}</span>
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
            {layout.lanes.map((lane) => (
              <g key={lane.id} className="tn-relation-lane">
                <rect x={lane.x} y={lane.y} width={lane.width} height={lane.height} rx={14} />
                <rect className="tn-relation-lane-color" x={lane.x} y={lane.y} width={4} height={lane.height} rx={2} fill={lane.color ?? "var(--tn-gray-300)"} />
                <text x={lane.x + 20} y={lane.y + 28} className="tn-relation-lane-title">{lane.name}</text>
                <text x={lane.x + 20} y={lane.y + 46} className="tn-relation-lane-count">{lane.count} {locale === "zh" ? "个页面" : "pages"}</text>
              </g>
            ))}
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
                  <path d={`M ${a.x} ${a.y} C ${midX} ${a.y}, ${midX} ${b.y}, ${b.x} ${b.y}`} className="tn-relation-edge" markerEnd="url(#tn-arrow)" />
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
                  fill="var(--tn-surface)"
                  stroke={STATUS_STROKE[node.status] ?? "var(--tn-gray-400)"}
                  strokeWidth={node.status === "adopted" ? 2 : 1}
                />
                <text x={node.x + 12} y={node.y + 20} className={`tn-relation-glyph status-${node.status}`}>{STATUS_GLYPH[node.status] ?? "待读"}</text>
                <text x={node.x + 12} y={node.y + 45} className="tn-relation-title">{node.title.length > 24 ? `${node.title.slice(0, 24)}…` : node.title}</text>
              </g>
            ))}
          </svg>
        </div>
      )}
    </div>
  );
}
