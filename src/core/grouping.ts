import { GROUP_COLORS } from "./defaults";
import { createId } from "./id";
import { registrableDomain } from "./url";
import type { GroupingProposal, Locale, Workspace } from "./types";

export function colorForText(text: string): string {
  let hash = 0;
  for (const char of text) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return GROUP_COLORS[Math.abs(hash) % GROUP_COLORS.length];
}

export function createDomainProposal(
  workspace: Workspace,
  locale: Locale,
  selectedCardIds?: string[]
): GroupingProposal {
  const selected = selectedCardIds ? new Set(selectedCardIds) : null;
  const inboxCards = Object.values(workspace.cards).filter(
    (card) => card.url && (selected ? selected.has(card.id) : card.groupId === null)
  );
  const byDomain = new Map<string, string[]>();
  for (const card of inboxCards) {
    const domain = registrableDomain(card.url!);
    byDomain.set(domain, [...(byDomain.get(domain) ?? []), card.id]);
  }

  const groups = [] as GroupingProposal["groups"];
  const assignments = [] as GroupingProposal["assignments"];
  for (const [domain, cardIds] of byDomain) {
    const reusable = workspace.groupOrder
      .map((id) => workspace.groups[id])
      .find((group) => group?.name.toLowerCase() === domain.toLowerCase());
    const groupId = reusable?.id ?? createId("group");
    if (!reusable) {
      groups.push({
        id: groupId,
        name: domain === "local-html" ? (locale === "zh" ? "本地 HTML" : "Local HTML") : domain,
        color: colorForText(domain),
        isNew: true
      });
    }
    assignments.push(...cardIds.map((cardId) => ({
      cardId,
      groupId,
      reason: locale === "zh" ? `与 ${domain} 属于同一网站` : `Shares the ${domain} domain`
    })));
  }
  return {
    source: "domain",
    groups,
    assignments,
    basis: locale === "zh" ? "网站域名" : "Website domain",
    summary: locale === "zh" ? "AI 模型不可用，已按域名整理" : "AI model unavailable; grouped by domain"
  };
}

export function validateGroupingProposal(
  value: unknown,
  workspace: Workspace,
  expectedCardIds: string[]
): GroupingProposal {
  if (!value || typeof value !== "object") throw new Error("Invalid grouping response");
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.groups) || !Array.isArray(raw.assignments)) {
    throw new Error("Grouping response is missing arrays");
  }

  const existingGroupIds = new Set(workspace.groupOrder);
  const groups = raw.groups.map((item) => {
    if (!item || typeof item !== "object") throw new Error("Invalid group");
    const group = item as Record<string, unknown>;
    const id = String(group.id ?? "");
    const name = String(group.name ?? "").trim();
    const color = String(group.color ?? "");
    if (!id || !name || existingGroupIds.has(id) || !/^#[0-9A-F]{6}$/i.test(color)) {
      throw new Error("Invalid proposed group fields");
    }
    existingGroupIds.add(id);
    return { id, name, color, isNew: true };
  });

  const allowedCards = new Set(expectedCardIds);
  const seenCards = new Set<string>();
  const assignments = raw.assignments.map((item) => {
    if (!item || typeof item !== "object") throw new Error("Invalid assignment");
    const assignment = item as Record<string, unknown>;
    const cardId = String(assignment.cardId ?? "");
    const groupId = String(assignment.groupId ?? "");
    if (!allowedCards.has(cardId) || seenCards.has(cardId) || !existingGroupIds.has(groupId)) {
      throw new Error("Invalid assignment fields");
    }
    seenCards.add(cardId);
    return {
      cardId,
      groupId,
      reason: typeof assignment.reason === "string" ? assignment.reason.trim().slice(0, 240) : undefined
    };
  });
  if (seenCards.size !== allowedCards.size) throw new Error("Not every inbox card was assigned");
  const assignedGroups = new Set(assignments.map((assignment) => assignment.groupId));
  if (groups.some((group) => !assignedGroups.has(group.id))) {
    throw new Error("Proposed groups cannot be empty");
  }

  return {
    source: "ai",
    groups,
    assignments,
    basis: typeof raw.basis === "string" ? raw.basis.trim().slice(0, 160) : undefined,
    summary: typeof raw.summary === "string" ? raw.summary : undefined
  };
}

export function applyGroupingProposal(workspace: Workspace, proposal: GroupingProposal): Workspace {
  const groups = Object.fromEntries(
    Object.entries(workspace.groups).map(([id, group]) => [id, { ...group, cardIds: [...group.cardIds] }])
  );
  const groupOrder = [...workspace.groupOrder];
  for (const proposed of proposal.groups) {
    if (groups[proposed.id]) continue;
    groups[proposed.id] = {
      id: proposed.id,
      name: proposed.name,
      color: proposed.color,
      cardIds: []
    };
    groupOrder.push(proposed.id);
  }

  const cards = { ...workspace.cards };
  for (const assignment of proposal.assignments) {
    const card = cards[assignment.cardId];
    const target = groups[assignment.groupId];
    if (!card || !target) continue;
    if (card.groupId && groups[card.groupId]) {
      groups[card.groupId].cardIds = groups[card.groupId].cardIds.filter((id) => id !== card.id);
    }
    if (!target.cardIds.includes(card.id)) target.cardIds.push(card.id);
    cards[card.id] = { ...card, groupId: target.id };
  }
  if (!proposal.pruneEmptyGroups) return { ...workspace, groups, groupOrder, cards };
  const keptGroupOrder = groupOrder.filter((groupId) => groups[groupId]?.cardIds.length);
  const keptGroups = Object.fromEntries(keptGroupOrder.map((groupId) => [groupId, groups[groupId]]));
  return { ...workspace, groups: keptGroups, groupOrder: keptGroupOrder, cards };
}
