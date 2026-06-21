import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Resolve the sibling sim package to its TypeScript source so the worker and the
// app share one engine without a separate build step. fs.allow is widened to the
// monorepo root so Vite can read those files in dev.
const simSrc = fileURLToPath(new URL("../sim/src/index.ts", import.meta.url));
const repoRoot = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@weltmeister/sim": simSrc,
    },
  },
  server: {
    fs: { allow: [repoRoot] },
  },
  build: {
    target: "es2022",
    sourcemap: false,
  },
});
