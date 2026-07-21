import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const portableBuild = process.env.TABNEXUS_PORTABLE_BUILD === "1";

export default defineConfig({
  plugins: [react()],
  define: {
    __TABNEXUS_LOCAL_MCP_ENTRY__: JSON.stringify(portableBuild ? "" : resolve(__dirname, "agent/bridge/tabnexus-mcp.mjs")),
    __TABNEXUS_CODEX_MARKETPLACE__: JSON.stringify(portableBuild ? "" : resolve(__dirname, ".agents/plugins/marketplace.json")),
    __TABNEXUS_REPO_ROOT__: JSON.stringify(portableBuild ? "" : resolve(__dirname)),
    __TABNEXUS_PORTABLE_BUILD__: JSON.stringify(portableBuild)
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        workspace: resolve(__dirname, "workspace.html"),
        options: resolve(__dirname, "options.html"),
        background: resolve(__dirname, "src/background.ts")
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
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    exclude: ["tests/e2e/**", "node_modules/**", "dist/**"],
    coverage: {
      reporter: ["text", "html"]
    }
  }
});
