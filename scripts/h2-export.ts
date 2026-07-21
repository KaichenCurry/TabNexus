import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { argument } from "./m0-lib";

type H2Workspace = {
  name: string;
  groups: Array<{ name: string; cards: Array<{ title: string; url: string; note?: string }> }>;
};

const inputPath = resolve(argument("--input", "m0/fixtures/h2-workspace.json")!);
const outputDir = resolve(argument("--output-dir", "artifacts/m0/h2")!);
const workspace = JSON.parse(await readFile(inputPath, "utf8")) as H2Workspace;
if (!workspace.name || !Array.isArray(workspace.groups)) throw new Error("Invalid H2 workspace fixture");

const flat = `${workspace.groups.flatMap((group) => group.cards.map((card) => card.url)).join("\n")}\n`;
const structured = `${[
  `# ${workspace.name}`,
  "",
  ...workspace.groups.flatMap((group) => [
    `## ${group.name}`,
    "",
    ...group.cards.flatMap((card) => [
      `- [${card.title}](${card.url})`,
      ...(card.note ? [`  - Note: ${card.note}`] : []),
      ""
    ])
  ])
].join("\n").trim()}\n`;

await mkdir(outputDir, { recursive: true });
await writeFile(resolve(outputDir, "flat-urls.txt"), flat, "utf8");
await writeFile(resolve(outputDir, "structured-context.md"), structured, "utf8");
await writeFile(
  resolve(outputDir, "evaluation.csv"),
  "variant,agent,taskSuccess,quality1to5,turns,comments\nflat,,,,,\nstructured,,,,,\n",
  "utf8"
);
process.stdout.write(`Wrote paired H2 inputs to ${outputDir}\n`);
