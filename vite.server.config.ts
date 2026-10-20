import { defineConfig } from "vite";

export default defineConfig({
  build: {
    ssr: "src/server/index.ts",
    outDir: "dist/server",
    rollupOptions: { output: { entryFileNames: "index.mjs" } },
  },
});
