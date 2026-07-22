import type { GroupingRequest, Workspace } from "./types";

function hostname(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname || undefined;
  } catch {
    return undefined;
  }
}

function cardContext(card: Workspace["cards"][string]) {
  return {
    id: card.id,
    title: card.title,
    url: card.url,
    type: card.type,
    hostname: hostname(card.url),
    savedAt: card.savedAt,
    lastAccessedAt: card.lastAccessedAt
  };
}

export function createGroupingRequest(
  workspace: Workspace,
  locale: "zh" | "en",
  selectedCardIds?: string[],
  instruction?: string
): GroupingRequest {
  const selected = selectedCardIds ? new Set(selectedCardIds) : null;
  const cards = Object.values(workspace.cards)
    .filter((card) => selected ? selected.has(card.id) : card.groupId === null)
    .map(cardContext);
  const existingGroups = workspace.groupOrder
    .map((id) => workspace.groups[id])
    .filter(Boolean)
    .map((group) => ({
      id: group.id,
      name: group.name,
      cards: group.cardIds
        .filter((cardId) => !selected?.has(cardId))
        .map((cardId) => workspace.cards[cardId])
        .filter(Boolean)
        .map(cardContext)
    }));
  return { locale, instruction: instruction?.trim() || undefined, cards, existingGroups };
}
