import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  root: __dirname,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "../../src"),
      "convex/react": path.resolve(__dirname, "transport.ts"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5188,
    strictPort: true,
    fs: { allow: [path.resolve(__dirname, "../../../..")] },
  },
});
