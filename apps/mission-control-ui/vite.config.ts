import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const envDir = path.resolve(__dirname, "../..");
  const orchestrationEnv = loadEnv(mode, envDir, ["ORCHESTRATION_API_TOKEN", "MC_API_TOKEN"]);
  const orchestrationToken =
    orchestrationEnv.ORCHESTRATION_API_TOKEN?.trim()
    || orchestrationEnv.MC_API_TOKEN?.trim();
  return {
    plugins: [react(), tailwindcss()],
    envDir,
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return;
            if (id.includes("framer-motion")) return "vendor-motion";
            if (id.includes("recharts") || id.includes("d3-")) return "vendor-charts";
            if (id.includes("convex")) return "vendor-convex";
            if (id.includes("lucide-react")) return "vendor-icons";
            return "vendor";
          },
        },
      },
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      port: 5173,
      strictPort: false,
      host: true,
      fs: {
        allow: [path.resolve(__dirname, "../..")],
      },
      proxy: {
        "/gateway": {
          target: "http://localhost:4100",
          changeOrigin: true,
          ws: true,
          // The /gateway/ws upgrade is gated by the same bearer as HTTP routes;
          // the browser never holds the token, the proxy presents it.
          headers: orchestrationToken
            ? { Authorization: `Bearer ${orchestrationToken}` }
            : undefined,
        },
        "/orchestration": {
          target: "http://localhost:4100",
          changeOrigin: true,
          headers: orchestrationToken
            ? { Authorization: `Bearer ${orchestrationToken}` }
            : undefined,
        },
      },
    },
  };
});
