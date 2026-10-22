import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { createApp } from "./src/server/app";
import { singleFileHtml } from "./scripts/singleFileHtml";

export default defineConfig(({ mode }) => {
  const web = mode === "web";
  return {
    base: web ? "./" : "/",
    publicDir: web ? false : "public",
    resolve: {
      alias: web
        ? [
            {
              find: /^\.\/createTraceWorker$/,
              replacement: fileURLToPath(
                new URL(
                  "./src/features/tracing/createInlineTraceWorker.ts",
                  import.meta.url,
                ),
              ),
            },
          ]
        : [],
    },
    plugins: [
      react(),
      tailwindcss(),
      web
        ? singleFileHtml()
        : {
            name: "coinage-local-storage",
            configureServer(server: import("vite").ViteDevServer) {
              const handle = createApp({
                dataDir: fileURLToPath(new URL("./data", import.meta.url)),
              });
              server.middlewares.use((req, res, next) => {
                if (req.url?.startsWith("/api/")) void handle(req, res);
                else next();
              });
            },
          },
    ],
    server: { host: "127.0.0.1", port: 47832 },
    build: {
      outDir: web ? "dist/web" : "dist/client",
      target: "es2022",
      ...(web
        ? {
            cssCodeSplit: false,
            assetsInlineLimit: Number.MAX_SAFE_INTEGER,
            rolldownOptions: { output: { codeSplitting: false } },
          }
        : {}),
    },
  };
});
