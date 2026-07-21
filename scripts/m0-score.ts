import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { argument, writeJson } from "./m0-lib";

const inputPath = resolve(argument("--input", "artifacts/m0/review.csv")!);
const outputPath = resolve(argument("--output", "artifacts/m0/acceptance-report.json")!);
const rows = (await readFile(inputPath, "utf8")).trim().split(/\r?\n/).slice(1);

function parseCsvRow(row: string): string[] {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < row.length; index += 1) {
    const char = row[index];
    if (char === '"' && quoted && row[index + 1] === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) {
      values.push(value);
      value = "";
    } else value += char;
  }
  values.push(value);
  return values;
}

const reviews = rows.map(parseCsvRow).filter((cells) => cells.length >= 5 && cells[4].trim());
if (reviews.length === 0) throw new Error("No reviewed rows found. Fill accepted with yes/no before scoring.");
const accepted = reviews.filter((cells) => /^(yes|y|true|1|是|通过)$/i.test(cells[4].trim())).length;
const acceptanceRate = Math.round((accepted / reviews.length) * 10_000) / 100;
const groupingPolicy = acceptanceRate >= 80 ? "automatic" : acceptanceRate >= 60 ? "suggestion" : "domain";
const report = {
  scoredAt: new Date().toISOString(),
  reviewedAssignments: reviews.length,
  acceptedAssignments: accepted,
  acceptanceRate,
  groupingPolicy,
  decision:
    groupingPolicy === "automatic"
      ? "Enable automatic AI apply with one-level undo"
      : groupingPolicy === "suggestion"
        ? "Show a complete preview before apply"
        : "Keep domain grouping as the default path and iterate the prompt"
};
await writeJson(outputPath, report);
process.stdout.write(`${acceptanceRate}% accepted; recommended policy: ${groupingPolicy}\n`);
