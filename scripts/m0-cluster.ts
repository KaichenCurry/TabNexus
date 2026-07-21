import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  argument,
  deepSeekCluster,
  readJson,
  validateInput,
  writeJson,
  type M0Input
} from "./m0-lib";

const inputPath = argument("--input", "tests/fixtures/m0/sample-tabs.json")!;
const outputPath = argument("--output", "artifacts/m0/proposals.json")!;
const reviewPath = argument("--review", "artifacts/m0/review.csv")!;
const apiKey = process.env.DEEPSEEK_API_KEY?.trim();

if (!apiKey) {
  throw new Error("Set DEEPSEEK_API_KEY in the process environment; it is never read from a project file");
}

const input = validateInput(await readJson<M0Input>(inputPath));
const results = [];
const reviewRows = ["sampleId,cardId,title,proposedGroup,accepted,correctGroup,comment"];

for (const sample of input.samples) {
  const proposal = await deepSeekCluster(apiKey, sample);
  results.push({ sampleId: sample.id, proposal });
  const groups = new Map(proposal.groups.map((group) => [group.id, group.name]));
  for (const tab of sample.tabs) {
    const assignment = proposal.assignments.find((item) => item.cardId === tab.id);
    const cells = [sample.id, tab.id, tab.title, groups.get(assignment?.groupId ?? "") ?? "", "", "", ""];
    reviewRows.push(cells.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","));
  }
}

await writeJson(outputPath, {
  generatedAt: new Date().toISOString(),
  model: "deepseek-v4-flash",
  results
});
const absoluteReview = resolve(reviewPath);
await mkdir(dirname(absoluteReview), { recursive: true });
await writeFile(absoluteReview, `${reviewRows.join("\n")}\n`, "utf8");

process.stdout.write(`Wrote ${results.length} proposal set(s) to ${resolve(outputPath)}\n`);
process.stdout.write(`Review every assignment in ${absoluteReview}\n`);
