import { build, version } from "esbuild";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, dirname, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";

// Build local artifacts only. This script never starts a container or grants admission.
if (version !== "0.27.0") throw new Error("Isolated runtime requires the pinned esbuild version");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const outputDirectory = resolve(process.argv[2] ?? resolve(root, "dist/isolated-invocation"));
const digest = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
await mkdir(outputDirectory, { recursive: true });
const artifacts = {};
for (const [name, entry] of Object.entries({
  bridge: "apps/orchestration-server/src/isolatedInvocationEntry.ts",
  backend: "apps/orchestration-server/src/isolatedInvocationAdapter.ts",
})) {
  const captured = new Map();
  const result = await build({ absWorkingDir: root, entryPoints: [entry], bundle: true,
    platform: "node", format: "esm", target: "node22", write: false, metafile: true, logLevel: "silent",
    plugins: [{ name: "capture-build-inputs", setup(builder) {
      builder.onLoad({ filter: /\.(?:tsx?|[cm]?js|json)$/ }, async args => {
        const bytes = await readFile(args.path);
        const source = relative(root, args.path);
        captured.set(source, { bytes, digest: digest(bytes) });
        const extension = extname(args.path).slice(1);
        return { contents: bytes, loader: extension === "ts" || extension === "tsx" || extension === "json" ? extension : "js" };
      });
    } }],
  });
  if (result.outputFiles.length !== 1) throw new Error("Runtime bundle output is ambiguous");
  const bytes = result.outputFiles[0].contents;
  const path = `${name}.mjs`;
  await writeFile(resolve(outputDirectory, path), bytes);
  const inputs = {};
  for (const source of Object.keys(result.metafile.inputs).sort()) {
    const input = captured.get(source);
    if (!input) throw new Error(`Build input was not captured: ${source}`);
    inputs[source] = input.digest;
    const snapshotPath = resolve(outputDirectory, "inputs", name, source);
    if (!snapshotPath.startsWith(resolve(outputDirectory, "inputs", name) + "/")) throw new Error("Build input escaped source snapshot");
    await mkdir(dirname(snapshotPath), { recursive: true });
    await writeFile(snapshotPath, input.bytes);
  }
  artifacts[name] = { path, digest: digest(bytes), inputs };
}
await writeFile(resolve(outputDirectory, "build.json"), JSON.stringify({
  schema: "factory-isolated-build/v1", builder: { name: "esbuild", version, platform: "node", target: "node22", format: "esm" },
  artifacts, authority: "NONE", qualification: "NOT_PERFORMED",
}, null, 2) + "\n");
console.log(JSON.stringify({ outputDirectory, bridge: artifacts.bridge.digest, backend: artifacts.backend.digest }));
