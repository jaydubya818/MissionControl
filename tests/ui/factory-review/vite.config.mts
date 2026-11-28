import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const fixture = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(fixture, "../../..");
const requireUi = createRequire(path.join(repository, "apps/mission-control-ui/package.json"));
const react = (await import(pathToFileURL(requireUi.resolve("@vitejs/plugin-react")).href)).default;
const tailwindcss = (await import(pathToFileURL(requireUi.resolve("@tailwindcss/vite")).href)).default;

export default {
  root: fixture,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: /^convex\/react$/, replacement: path.join(fixture, "convex-fixture.ts") },
      { find: "@", replacement: path.join(repository, "apps/mission-control-ui/src") },
      ...["react", "react/jsx-runtime", "react/jsx-dev-runtime", "react-dom", "react-dom/client"].map((name) => ({
        find: new RegExp(`^${name.replaceAll("/", "\\/")}$`), replacement: requireUi.resolve(name),
      })),
    ],
  },
  server: { host: "127.0.0.1", port: 5197, strictPort: true, fs: { allow: [repository] } },
};
