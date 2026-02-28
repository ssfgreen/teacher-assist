import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: {
    // Workspace editor is lazy-loaded and intentionally large due to Milkdown/ProseMirror.
    // Keep warning signal meaningful for eagerly loaded chunks while avoiding noise here.
    chunkSizeWarningLimit: 1400,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return;
          }

          if (id.includes("react-dom") || id.includes("/react/")) {
            return "react";
          }

          const packageMatch = id.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/);
          const packageName = packageMatch?.[1];
          if (!packageName) {
            return;
          }

          if (
            packageName === "react-markdown" ||
            packageName.startsWith("remark-") ||
            packageName.startsWith("rehype-") ||
            packageName === "micromark" ||
            packageName === "unified"
          ) {
            return "markdown";
          }

          if (packageName === "@milkdown/crepe") {
            return "milkdown-crepe";
          }

          if (packageName.startsWith("@milkdown/")) {
            return `milkdown-${packageName.split("/")[1]}`;
          }

          if (packageName.startsWith("prosemirror-")) {
            return `prosemirror-${packageName.replace("prosemirror-", "")}`;
          }
        },
      },
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
  },
});
