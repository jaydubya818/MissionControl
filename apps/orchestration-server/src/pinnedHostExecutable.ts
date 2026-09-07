import { constants } from "node:fs";
import { open, mkdtemp, rm, chmod } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Pin the verified bytes in an owner-only directory outside all workload
 * mounts. Replacing the supplied installation path cannot change execution.
 * The host principal is trusted; isolated workloads have no access here. */
export async function pinHostExecutable(source: string, expectedSha256: string) {
  if (!/^[a-f0-9]{64}$/.test(expectedSha256)) throw new Error("Invalid host artifact digest.");
  const input = await open(source, constants.O_RDONLY | constants.O_NOFOLLOW);
  let directory: string | undefined;
  try {
    const stat = await input.stat();
    if (!stat.isFile() || stat.size < 1 || stat.size > 256_000_000) throw new Error("Invalid host executable.");
    const bytes = await input.readFile();
    if (bytes.length !== stat.size || createHash("sha256").update(bytes).digest("hex") !== expectedSha256) {
      throw new Error("Host executable does not match admitted bytes.");
    }
    directory = await mkdtemp(join(tmpdir(), "mc-pinned-executable-"));
    const executable = join(directory, "runtime");
    const output = await open(executable, "wx", 0o500);
    try { await output.writeFile(bytes); await output.sync(); } finally { await output.close(); }
    await chmod(directory, 0o500);
    const pinnedDirectory = directory;
    let disposal: Promise<void> | undefined;
    return { executable, digest: expectedSha256, dispose() {
      return disposal ??= (async () => {
        await chmod(pinnedDirectory, 0o700);
        await rm(pinnedDirectory, { recursive: true, force: true });
      })();
    } };
  } catch (error) {
    if (directory) { await chmod(directory, 0o700); await rm(directory, { recursive: true, force: true }); }
    throw error;
  } finally { await input.close(); }
}
