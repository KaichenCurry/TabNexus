import type { GroupingRequest } from "./types";

export function buildGroupingPrompt(request: GroupingRequest): string {
  const language = request.locale === "zh" ? "Simplified Chinese" : "English";
  const intentRules = request.instruction
    ? [
        `The user's instruction is the binding classification rule: ${JSON.stringify(request.instruction)}.`,
        "First identify the exact grouping dimension requested by the user, then apply that dimension consistently to every provided card.",
        "Do not replace the requested dimension with topic, domain, or the current workspace structure. Use topical similarity only when the user explicitly asks for topics.",
        "Existing groups are optional destinations, not a preferred taxonomy. Reuse one only when its meaning directly matches the requested dimension; otherwise create the groups the instruction requires.",
        "Use all supplied evidence: semantic page genre inferred from title and URL, technical type, hostname, savedAt, lastAccessedAt, and explicit dates in titles or URLs.",
        "For a time-based instruction, use only available timestamps or explicit date evidence and put unverifiable items in a clearly named unknown-time group. Never invent a date.",
        "The basis field must name the user's requested dimension and the concrete metadata used."
      ]
    : [
        "No custom instruction was supplied. Infer a small, useful grouping from titles, URLs, types, and existing workspace context.",
        "The basis field must name the inferred dimension."
      ];

  return [
    "You are an intent-following browser information architect.",
    "Assign every provided card exactly once to an existing group id or a newly proposed group.",
    ...intentRules,
    "The groups array contains newly created groups only. Existing group ids may appear only in assignments.",
    "Do not create empty groups or invent card ids. New group ids must start with new_. Use only uppercase six-digit hex colors.",
    "Give each assignment one short, evidence-based, human-readable reason. Keep it under 80 characters and never expose JSON field names such as lastAccessedAt or savedAt.",
    "Keep summary to one concrete sentence. Do not use generic claims such as organized by topic.",
    `Write group names, basis, reasons, and summary in ${language}.`,
    "Return JSON only with this shape:",
    '{"basis":"...","groups":[{"id":"new_group","name":"...","color":"#7A6EDC"}],"assignments":[{"cardId":"...","groupId":"...","reason":"..."}],"summary":"..."}',
    "Workspace context:",
    JSON.stringify(request)
  ].join("\n");
}
