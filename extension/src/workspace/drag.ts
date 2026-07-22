export const TABNEXUS_DRAG_TYPE = "application/x-tabnexus";

export type DragPayload =
  | { kind: "open-tab"; tabId: number }
  | { kind: "card"; cardId: string };

export function setDragPayload(event: React.DragEvent, payload: DragPayload): void {
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData(TABNEXUS_DRAG_TYPE, JSON.stringify(payload));
}

export function readDragPayload(event: React.DragEvent): DragPayload | null {
  try {
    return JSON.parse(event.dataTransfer.getData(TABNEXUS_DRAG_TYPE)) as DragPayload;
  } catch {
    return null;
  }
}
