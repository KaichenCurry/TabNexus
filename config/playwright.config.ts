import { defineConfig } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export default defineConfig({
  testDir: resolve(projectRoot, "tests/e2e"),
  outputDir: resolve(projectRoot, ".playwright/results"),
  reporter: [["list"], ["html", { outputFolder: resolve(projectRoot, ".playwright/report"), open: "never" }]],
  timeout: 30_000,
  expect: { timeout: 8_000 },
  workers: 1,
  fullyParallel: false,
  use: {
    locale: "zh-CN",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  }
});
