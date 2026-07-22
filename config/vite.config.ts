import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const portableBuild = process.env.TABNEXUS_PORTABLE_BUILD === "1";
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const extensionRoot = resolve(projectRoot, "extension");

export default defineConfig({
  root: extensionRoot,
  plugins: [react()],
  publicDir: resolve(extensionRoot, "public"),
  define: {
    __TABNEXUS_LOCAL_MCP_ENTRY__: JSON.stringify(portableBuild ? "" : resolve(projectRoot, "agent/bridge/tabnexus-mcp.mjs")),
    __TABNEXUS_CODEX_MARKETPLACE__: JSON.stringify(portableBuild ? "" : resolve(projectRoot, ".agents/plugins/marketplace.json")),
    __TABNEXUS_REPO_ROOT__: JSON.stringify(portableBuild ? "" : projectRoot),
    __TABNEXUS_PORTABLE_BUILD__: JSON.stringify(portableBuild)
  },
  build: {
    outDir: resolve(projectRoot, "dist"),
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        workspace: resolve(extensionRoot, "workspace.html"),
        options: resolve(extensionRoot, "options.html"),
        background: resolve(extensionRoot, "src/background.ts")
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === "background" ? "background.js" : "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]"
      }
    }
  },
  test: {
    root: projectRoot,
    environment: "jsdom",
    setupFiles: [resolve(projectRoot, "tests/setup.ts")],
    exclude: ["tests/e2e/**", "node_modules/**", "dist/**"],
    coverage: {
      reporter: ["text", "html"]
    }
  }
});
