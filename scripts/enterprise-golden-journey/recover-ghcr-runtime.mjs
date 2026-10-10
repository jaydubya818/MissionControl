import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile, cp, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { lock, sha256 } from "./evidence.mjs";
const directory = resolve(process.argv[2]);
const docker = process.env.MC_GOLDEN_DOCKER || "docker";
const image =
  "ghcr.io/jaydubya818/missioncontrol-native-runtime@" + lock.runtimeImage;
await mkdir(directory, { recursive: true });
const report = {
  schema: "checkpoint-h-ghcr-runtime/v1",
  image,
  status: "IN_PROGRESS",
  rebuilt: false,
  published: false,
};
const run = (cmd, args) =>
  execFileSync(cmd, args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
try {
  try {
    run(docker, ["pull", "--platform=linux/amd64", image]);
  } catch {
    report.status = "NOT_RUN";
    report.reason =
      "Exact private GHCR image could not be pulled. CI requires packages:read and read access to missioncontrol-native-runtime for the invoking repository GITHUB_TOKEN. No package administration or write access is required.";
  }
  if (report.status !== "NOT_RUN") {
    const metadata = fileURLToPath(
      new URL("./runtime-metadata/", import.meta.url),
    );
    for (const [name, hash] of Object.entries(lock.runtimeFiles)) {
      if (name !== "image.tar")
        assert.equal(sha256(await readFile(join(metadata, name))), hash, name);
    }
    await cp(metadata, directory, { recursive: true });
    const registryEvidence = run(docker, [
      "buildx", "imagetools", "inspect", image, "--format", "{{json .Manifest}}",
    ]);
    const registryPath = join(directory, "registry-manifest.json");
    await writeFile(registryPath, registryEvidence);
    const inspect = JSON.parse(run(docker, ["image", "inspect", image]))[0];
    assert.equal(inspect.Id, lock.runtimeConfig);
    assert.equal(inspect.Os, "linux");
    assert.equal(inspect.Architecture, "amd64");
    assert.ok(inspect.RepoDigests.includes(image));
    assert.equal(
      inspect.Config.Labels["org.opencontainers.image.revision"],
      lock.runtimeSource,
    );
    const archive = join(directory, "image.tar");
    run(docker, ["save", image, "--output", archive]);
    run(process.execPath, [
      "scripts/qualification/inspect-native-successor.mjs",
      archive,
      directory,
      join(directory, "artifact"),
      registryPath,
      image,
      lock.runtimeConfig,
    ]);
    const binding = JSON.parse(
      await readFile(join(directory, "artifact/image-binding.json"), "utf8"),
    );
    assert.equal(binding.manifestDigest, lock.runtimeImage);
    assert.equal(binding.configDigest, lock.runtimeConfig);
    assert.equal(binding.sourceSha, lock.runtimeSource);
    assert.equal(binding.registryManifestVerified, true);
    assert.equal(binding.archiveBytesVerified, true);
    report.binding = binding;
    report.status = "PASS";
    await rm(archive);
  }
} catch (error) {
  report.status = "FAIL";
  report.reason = String(error.message ?? error);
}
await writeFile(
  join(directory, "recovery.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report));
if (report.status === "FAIL") process.exitCode = 1;
