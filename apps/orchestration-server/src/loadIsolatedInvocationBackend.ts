import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { createHash } from "node:crypto";
import { ISOLATED_INVOCATION_EFFECTIVE_CONFIG } from "@mission-control/workflow-engine/harness-contract";
import type { IsolatedInvocationAdapter } from "./isolatedInvocationAdapter.js";

/** Verify the exact bytes before import. The data URL prevents a path replacement
 * between hashing and module loading from substituting executable code. */
export async function loadIsolatedInvocationBackend(bundlePath: string): Promise<typeof IsolatedInvocationAdapter> {
  const handle = await open(bundlePath, constants.O_RDONLY | constants.O_NOFOLLOW);
  let bytes: Buffer;
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size < 1 || stat.size > 256_000) throw new Error("Isolated backend bundle size or kind is invalid");
    const buffer = Buffer.alloc(stat.size + 1);
    let length = 0;
    while (length < buffer.length) {
      const read = await handle.read(buffer, length, buffer.length - length, length);
      if (read.bytesRead === 0) break;
      length += read.bytesRead;
    }
    if (length !== stat.size) throw new Error("Isolated backend bundle changed during read");
    bytes = buffer.subarray(0, length);
  } finally { await handle.close(); }
  const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  if (digest !== ISOLATED_INVOCATION_EFFECTIVE_CONFIG.backendImplementationDigest) {
    throw new Error("Isolated backend bundle does not match the registered implementation");
  }
  const loaded = await import(`data:text/javascript;base64,${bytes.toString("base64")}`);
  if (typeof loaded.IsolatedInvocationAdapter !== "function") throw new Error("Isolated backend export is missing");
  return loaded.IsolatedInvocationAdapter;
}
