import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export type SampleTab = { id: string; title: string; url: string };
export type SampleSet = { id: string; task?: string; tabs: SampleTab[] };
export type M0Input = { samples: SampleSet[] };
export type M0Group = { id: string; name: string; color: string };
export type M0Assignment = { cardId: string; groupId: string };
export type M0Proposal = { groups: M0Group[]; assignments: M0Assignment[]; summary?: string };

export function argument(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

export async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(resolve(path), "utf8")) as T;
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  const absolute = resolve(path);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function validateInput(value: M0Input): M0Input {
  if (!value || !Array.isArray(value.samples) || value.samples.length === 0) {
    throw new Error("Input must contain at least one sample set");
  }
  for (const sample of value.samples) {
    if (!sample.id || !Array.isArray(sample.tabs) || sample.tabs.length === 0) {
      throw new Error("Each sample needs an id and at least one tab");
    }
    const ids = new Set<string>();
    for (const tab of sample.tabs) {
      if (!tab.id || !tab.title || !/^https?:\/\//.test(tab.url) || ids.has(tab.id)) {
        throw new Error(`Invalid or duplicate tab in sample ${sample.id}`);
      }
      ids.add(tab.id);
    }
  }
  return value;
}

export function validateProposal(value: unknown, sample: SampleSet): M0Proposal {
  if (!value || typeof value !== "object") throw new Error(`Invalid proposal for ${sample.id}`);
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.groups) || !Array.isArray(raw.assignments)) {
    throw new Error(`Proposal for ${sample.id} is missing groups or assignments`);
  }
  const groupIds = new Set<string>();
  const groups = raw.groups.map((item) => {
    const group = item as Record<string, unknown>;
    const id = String(group?.id ?? "");
    const name = String(group?.name ?? "").trim();
    const color = String(group?.color ?? "").toUpperCase();
    if (!id || !name || groupIds.has(id) || !/^#[0-9A-F]{6}$/.test(color)) {
      throw new Error(`Invalid group in proposal for ${sample.id}`);
    }
    groupIds.add(id);
    return { id, name, color };
  });
  if (groups.length === 0) throw new Error(`Proposal for ${sample.id} contains no groups`);

  const expectedIds = new Set(sample.tabs.map((tab) => tab.id));
  const seenIds = new Set<string>();
  const assignments = raw.assignments.map((item) => {
    const assignment = item as Record<string, unknown>;
    const cardId = String(assignment?.cardId ?? "");
    const groupId = String(assignment?.groupId ?? "");
    if (!expectedIds.has(cardId) || seenIds.has(cardId) || !groupIds.has(groupId)) {
      throw new Error(`Invalid assignment in proposal for ${sample.id}`);
    }
    seenIds.add(cardId);
    return { cardId, groupId };
  });
  if (seenIds.size !== expectedIds.size) {
    throw new Error(`Proposal for ${sample.id} did not assign every tab exactly once`);
  }
  return {
    groups,
    assignments,
    summary: typeof raw.summary === "string" ? raw.summary : undefined
  };
}

export async function deepSeekCluster(apiKey: string, sample: SampleSet): Promise<M0Proposal> {
  const body = {
    model: "deepseek-v4-flash",
    thinking: { type: "disabled" },
    response_format: { type: "json_object" },
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "Group browser tabs by task intent. Return JSON only: {groups:[{id,name,color}],assignments:[{cardId,groupId}],summary}. Use unique group ids prefixed g_, non-empty concise names, and #RRGGBB colors. Assign every card exactly once."
      },
      {
        role: "user",
        content: JSON.stringify({ task: sample.task ?? "", cards: sample.tabs })
      }
    ]
  };
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let retryAllowed = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);
    try {
      const response = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey.trim()}` },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      if (!response.ok) {
        retryAllowed = response.status === 429 || response.status >= 500;
        throw new Error(`DeepSeek request failed with HTTP ${response.status}`);
      }
      const result = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = result.choices?.[0]?.message?.content;
      if (!content) throw new Error("DeepSeek returned an empty response");
      return validateProposal(JSON.parse(content), sample);
    } catch (error) {
      lastError = error;
      if (attempt === 1 || !retryAllowed) break;
      await new Promise((resolve) => setTimeout(resolve, 750));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("DeepSeek request failed");
}
