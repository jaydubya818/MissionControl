import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  envDir: path.resolve(__dirname, "../.."),
  server: {
    port: 5173,
    strictPort: false,
    host: true,
  },
});
