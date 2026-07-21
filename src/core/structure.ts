import type { Edge, Locale, StructureProposal, StructureRequest, Workspace } from "./types";

export function createStructureRequest(workspace: Workspace, locale: Locale): StructureRequest {
  return {
    locale,
    cards: Object.values(workspace.cards).map((card) => ({
      id: card.id,
      title: card.title,
      url: card.url,
      groupId: card.groupId,
      groupName: card.groupId ? workspace.groups[card.groupId]?.name : undefined
    })),
    existingEdges: workspace.edges
  };
}

export function validateStructureProposal(value: unknown, workspace: Workspace): StructureProposal {
  if (!value || typeof value !== "object") throw new Error("Invalid structure proposal");
  const proposal = value as { edges?: unknown; summary?: unknown };
  if (!Array.isArray(proposal.edges)) throw new Error("Invalid structure edges");
  const seen = new Set<string>();
  const edges: Edge[] = proposal.edges.map((item) => {
    if (!item || typeof item !== "object") throw new Error("Invalid edge");
    const edge = item as Partial<Edge>;
    if (
      typeof edge.fromCardId !== "string" ||
      typeof edge.toCardId !== "string" ||
      edge.fromCardId === edge.toCardId ||
      !workspace.cards[edge.fromCardId] ||
      !workspace.cards[edge.toCardId] ||
      (edge.label !== undefined && typeof edge.label !== "string")
    ) throw new Error("Invalid edge reference");
    const key = `${edge.fromCardId}:${edge.toCardId}`;
    if (seen.has(key)) throw new Error("Duplicate edge");
    seen.add(key);
    return {
      fromCardId: edge.fromCardId,
      toCardId: edge.toCardId,
      label: edge.label?.trim().slice(0, 40) || undefined
    };
  });
  return {
    source: "ai",
    edges,
    summary: typeof proposal.summary === "string" ? proposal.summary.slice(0, 300) : undefined
  };
}

export function createLocalStructureProposal(workspace: Workspace, locale: Locale): StructureProposal {
  const edges: Edge[] = [];
  const nonEmptyGroups: string[][] = [];
  for (const groupId of workspace.groupOrder) {
    const cardIds = workspace.groups[groupId]?.cardIds.filter((id) => workspace.cards[id]) ?? [];
    if (cardIds.length) nonEmptyGroups.push(cardIds);
    for (let index = 0; index < cardIds.length - 1; index += 1) {
      edges.push({
        fromCardId: cardIds[index],
        toCardId: cardIds[index + 1],
        label: locale === "zh" ? "相关" : "related"
      });
    }
  }
  for (let index = 0; index < nonEmptyGroups.length - 1; index += 1) {
    const current = nonEmptyGroups[index];
    const next = nonEmptyGroups[index + 1];
    edges.push({
      fromCardId: current[current.length - 1],
      toCardId: next[0],
      label: locale === "zh" ? "下一步" : "next step"
    });
  }
  return {
    source: "local",
    edges,
    summary: locale === "zh"
      ? "AI 模型暂不可用，已按现有分组顺序生成本地关系建议。"
      : "The AI model is unavailable, so this suggestion follows the current group order."
  };
}

export function applyStructureProposal(workspace: Workspace, proposal: StructureProposal): Workspace {
  const edgeMap = new Map(workspace.edges.map((edge) => [`${edge.fromCardId}:${edge.toCardId}`, edge]));
  for (const edge of proposal.edges) edgeMap.set(`${edge.fromCardId}:${edge.toCardId}`, edge);
  return { ...workspace, edges: [...edgeMap.values()] };
}
