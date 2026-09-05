import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { HarnessRuntimeArtifactIdentity } from "@mission-control/workflow-engine";
import { FAB_RUNTIME_PIN } from "./fabRuntimePin.js";

// Resolve the exact installed package using Node's module search roots. This
// also works in the test bundler, which does not implement import.meta.resolve.
const installedRoot = (createRequire(import.meta.url).resolve.paths("@fdlc/fab") ?? [])
  .map(root => path.join(root, "@fdlc/fab"))
  .find(root => existsSync(path.join(root, "dist/index.js")));
const sha256 = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");

/** The private dependency has no runtime npm dependencies or permitted links. */
export function fabPackageClosure(root: string): string {
  const canonical = realpathSync(root);
  const entries: Array<[string, string]> = [];
  const visit = (directory: string) => {
    for (const name of readdirSync(directory).sort()) {
      const file = path.join(directory, name); const info = lstatSync(file);
      if (info.isDirectory()) visit(file);
      else if (info.isFile() && info.nlink === 1) entries.push([path.relative(canonical, file).split(path.sep).join("/"), sha256(readFileSync(file))]);
      else throw new Error("Fab runtime contains a linked or unsupported installation entry.");
    }
  };
  visit(canonical);
  entries.sort(([left], [right]) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
  return sha256(JSON.stringify({ schema: "fab-package-closure/v1", files: entries }));
}

export function verifyFabRuntime(root = installedRoot): HarnessRuntimeArtifactIdentity {
  if (!root) throw new Error("Fab private runtime package is not installed.");
  const closureSha256 = fabPackageClosure(root);
  if (closureSha256 !== FAB_RUNTIME_PIN.closureSha256) throw new Error("Fab installed runtime differs from its pinned private package.");
  return { schemaVersion: "harness-runtime-artifact/v1", kind: "EXECUTABLE", name: "fab-node-runtime",
    version: `${FAB_RUNTIME_PIN.version}+node.${process.versions.node}.${process.platform}.${process.arch}`,
    executableSha256: sha256(readFileSync(realpathSync(process.execPath))), closureSha256, imageDigest: null };
}
