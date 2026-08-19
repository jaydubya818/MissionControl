import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { standaloneRestrictedSandboxBootstrapSource } from "../apps/orchestration-server/src/standaloneRestrictedSandboxBootstrapSource.js";

const execFileAsync = promisify(execFile);
const image = process.argv[2] ?? "mc-remote-candidate:local";
const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "mc-remote-sandbox-local-"));

try {
  const imageInspection = JSON.parse((await docker(["image", "inspect", image])).stdout)[0];
  const toolchain = parseToolchain((await docker([
    "run", "--rm", "--platform", "linux/amd64", "--entrypoint", "sh", image, "-c",
    [
      "node --version",
      "codex --version",
      "cat /etc/mission-control/codex-binary.sha256",
      "cat /etc/mission-control/toolchain-inputs.sha256",
      "id -u mc-attempt",
      "id -g mc-attempt",
      "setpriv --version",
      "setsid --version",
      "nft --version",
    ].join("; "),
  ])).stdout);

  const bootstrapPath = path.join(temporaryDirectory, "restricted-bootstrap.mjs");
  const configPath = path.join(temporaryDirectory, "restricted-bootstrap.json");
  await writeFile(bootstrapPath, standaloneRestrictedSandboxBootstrapSource(), { mode: 0o444 });
  await writeFile(configPath, JSON.stringify({
    security: {
      schema: "factory-sandbox-security/v1",
      profile: "remote-sandbox/exe-dev/restricted-candidate-v1",
      qualificationOnly: true,
      image: {
        digest: `sha256:${"0".repeat(64)}`,
        provenanceReference: "local-deterministic-qualification",
        sbomDigest: `sha256:${"0".repeat(64)}`,
      },
      toolchain: {
        nodeVersion: toolchain.nodeVersion,
        codexVersion: toolchain.codexVersion,
        codexBinarySha256: `sha256:${toolchain.codexBinarySha256}`,
        toolchainInputsSha256: `sha256:${toolchain.toolchainInputsSha256}`,
      },
      execution: {
        user: "mc-attempt",
        uid: 10_001,
        gid: 10_001,
        homePath: "/var/lib/mission-control/attempt/home",
        temporaryPath: "/var/lib/mission-control/attempt/tmp",
        noNewPrivileges: true,
      },
      network: {
        enforcement: "GUEST_NFTABLES",
        providerEnforced: false,
        allowedHttpsHosts: ["openrouter.ai"],
        dnsMode: "CONTROL_PLANE_RESOLVE_ETC_HOSTS",
        denyPrivateNetworks: true,
        denyLinkLocal: true,
        denyMetadata: true,
        denyUnexpectedDns: true,
      },
    },
    expectedImage: image,
    observedProviderImage: image,
    remoteRoot: "/var/lib/mission-control/attempt",
    repositoryRoot: "/var/lib/mission-control/attempt/repository",
    executorResultPath: "/var/lib/mission-control/attempt/executor-result.json",
    proofPath: "/var/lib/mission-control/attempt/security-proof.json",
  }), { mode: 0o444 });

  const first = await qualifyFreshContainer("first");
  const second = await qualifyFreshContainer("second");
  const report = {
    schema: "mission-control-remote-sandbox-local-qualification/v1",
    observedAt: Date.now(),
    image,
    localImageId: imageInspection.Id,
    platform: imageInspection.Os + "/" + imageInspection.Architecture,
    toolchain,
    supplyChainCertified: false,
    providerEgressEnforced: false,
    credentialEnvironment: {
      present: ["OPENAI_API_KEY", "OPENAI_BASE_URL"],
      absent: [
        "OPENROUTER_MANAGEMENT_API_KEY",
        "GITHUB_TOKEN",
        "GH_TOKEN",
        "CONVEX_DEPLOY_KEY",
        "EXE_DEV_TOKEN",
        "MISSION_CONTROL_SERVICE_TOKEN",
      ],
    },
    sequentialFreshContainers: [first, second],
  };
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}

async function qualifyFreshContainer(label: string) {
  const startedAt = Date.now();
  const command = String.raw`
set -eu
test ! -e /var/lib/mission-control/attempt/previous-attempt-sentinel
mkdir -p /var/lib/mission-control/attempt/repository
printf 'current attempt\n' >/var/lib/mission-control/attempt/repository/current-attempt.txt
cp /qualification/restricted-bootstrap.mjs /var/lib/mission-control/attempt/restricted-bootstrap.mjs
cp /qualification/restricted-bootstrap.json /var/lib/mission-control/attempt/restricted-bootstrap.json
node /var/lib/mission-control/attempt/restricted-bootstrap.mjs /var/lib/mission-control/attempt/restricted-bootstrap.json >/tmp/bootstrap-output.json
setpriv --no-new-privs --reuid=10001 --regid=10001 --clear-groups -- sh -c '
  test "$OPENAI_API_KEY" = "attempt-scoped-test-only"
  test "$OPENAI_BASE_URL" = "https://openrouter.ai/api/v1"
  test -z "\${OPENROUTER_MANAGEMENT_API_KEY:-}"
  test -z "\${GITHUB_TOKEN:-}"
  test -z "\${GH_TOKEN:-}"
  test -z "\${CONVEX_DEPLOY_KEY:-}"
  test -z "\${EXE_DEV_TOKEN:-}"
  test -z "\${MISSION_CONTROL_SERVICE_TOKEN:-}"
  touch /var/lib/mission-control/attempt/repository/workspace-write-succeeds
  ! touch /etc/mission-control/forbidden-write
  ! touch /usr/forbidden-write
  test ! -e /var/lib/mission-control/attempt/previous-attempt-sentinel
'
touch /var/lib/mission-control/attempt/previous-attempt-sentinel
cat /var/lib/mission-control/attempt/security-proof.json
`;
  const result = await docker([
    "run",
    "--rm",
    "--platform", "linux/amd64",
    "--cap-add", "NET_ADMIN",
    "--env", "OPENAI_API_KEY=attempt-scoped-test-only",
    "--env", "OPENAI_BASE_URL=https://openrouter.ai/api/v1",
    "--volume", `${temporaryDirectory}:/qualification:ro`,
    "--entrypoint", "sh",
    image,
    "-c",
    command,
  ], 90_000);
  const proof = JSON.parse(result.stdout);
  return {
    label,
    durationMs: Date.now() - startedAt,
    previousAttemptArtifactAbsent: true,
    credentialNegativeChecksPassed: true,
    workspaceWriteAllowed: true,
    protectedPathsReadOnly: true,
    proof,
  };
}

function parseToolchain(stdout: string) {
  const [nodeVersion, codexVersion, codexBinarySha256, toolchainInputsSha256, uid, gid, setprivVersion, setsidVersion, nftVersion] = stdout.trim().split("\n");
  return {
    nodeVersion,
    codexVersion,
    codexBinarySha256,
    toolchainInputsSha256,
    uid: Number(uid),
    gid: Number(gid),
    setprivVersion,
    setsidVersion,
    nftVersion,
  };
}

async function docker(args: string[], timeout = 30_000) {
  return await execFileAsync("docker", args, { timeout, maxBuffer: 16 * 1024 * 1024 });
}
