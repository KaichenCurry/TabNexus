let fallbackCounter = 0;

export function createId(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.();
  if (random) return `${prefix}_${random}`;
  fallbackCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${fallbackCounter.toString(36)}`;
}
