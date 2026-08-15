import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";

export const LOCAL_SANDBOX_IMAGE =
  "alpine@sha256:a2d49ea686c2adfe3c992e47dc3b5e7fa6e6b5055609400dc2acaeb241c829f4";
export const LOCAL_SANDBOX_LABEL = "mission-control.sandbox-doctor=true";
export const LOCAL_SANDBOX_RECEIPT_SCHEMA = "local-sandbox-canary/v1";

const LOCAL_NAME_PATTERN =
  /^mc-sbx-local-[0-9]{8}t[0-9]{6}z-[a-f0-9]{8}$/;
const DOCKER_MEMORY_BYTES = 128 * 1024 * 1024;
const DOCKER_NANO_CPUS = 500_000_000;
const DOCKER_PIDS_LIMIT = 32;
const ALLOWED_CONTAINER_ENV = [
  "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
];
const REQUIRED_LIFECYCLE = [
  "REQUESTED",
  "PROVISIONING",
  "HEALTH_CHECKING",
  "READY",
  "RUNNING",
  "RESULT_READY",
  "TEARING_DOWN",
  "TERMINATED",
];

const CANARY_SCRIPT = [
  "set -eu",
  "uid=$(id -u)",
  "gid=$(id -g)",
  "test \"$uid\" = 65534",
  "test \"$gid\" = 65534",
  "awk '$2 == \"/\" && (\",\" $4 \",\") ~ /,ro,/ { found=1 } END { exit(found ? 0 : 1) }' /proc/mounts",
  "if touch /mc-root-write-test >/dev/null 2>&1; then exit 41; fi",
  "if wget -T 2 -qO- http://example.com >/dev/null 2>&1; then exit 42; fi",
  `printf '{\"schema\":\"${LOCAL_SANDBOX_RECEIPT_SCHEMA}\",\"uid\":%s,\"gid\":%s,\"rootFilesystemReadOnly\":true,\"networkBlocked\":true,\"artifactTmpfsWritable\":true}\\n' \"$uid\" \"$gid\" > /output/receipt.json`,
  "test -s /output/receipt.json",
  "attempt=0",
  "while [ ! -e /tmp/host-ack ]; do attempt=$((attempt + 1)); if [ \"$attempt\" -ge 30 ]; then exit 43; fi; sleep 1; done",
].join("; ");

export class LocalSandboxError extends Error {
  constructor(message, code = "LOCAL_SANDBOX_FAILED") {
    super(message);
    this.name = "LocalSandboxError";
    this.code = code;
  }
}

export function redactLocalRuntimeText(value) {
  return String(value ?? "")
    .replace(/\bsk-or-v1-[A-Za-z0-9_-]+/g, "[REDACTED_OPENROUTER_KEY]")
    .replace(/\bgh[pousr]_[A-Za-z0-9_]+/g, "[REDACTED_GITHUB_TOKEN]")
    .replace(/(authorization\s*[:=]\s*)([^\s,;]+)/gi, "$1[REDACTED]")
    .slice(0, 1_000);
}

export function generateLocalContainerName({
  now = new Date(),
  randomSuffix = randomBytes(4).toString("hex"),
} = {}) {
  const timestamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(".", "")
    .slice(0, 15)
    .toLowerCase();
  const name = `mc-sbx-local-${timestamp}z-${randomSuffix.toLowerCase()}`;
  return assertSafeLocalContainerName(name);
}

export function assertSafeLocalContainerName(name) {
  if (!LOCAL_NAME_PATTERN.test(String(name))) {
    throw new LocalSandboxError(
      "Refusing Docker mutation outside the exact Mission Control local-canary namespace.",
      "UNSAFE_LOCAL_CONTAINER_NAME",
    );
  }
  return name;
}

export function buildDockerCreateArguments(
  name,
  { image = LOCAL_SANDBOX_IMAGE } = {},
) {
  assertSafeLocalContainerName(name);
  if (image !== LOCAL_SANDBOX_IMAGE) {
    throw new LocalSandboxError(
      "The free local canary requires the approved immutable image digest.",
      "UNAPPROVED_LOCAL_IMAGE",
    );
  }
  return [
    "create",
    "--name",
    name,
    "--label",
    LOCAL_SANDBOX_LABEL,
    "--pull=never",
    "--network=none",
    "--read-only",
    "--user=65534:65534",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges:true",
    `--pids-limit=${DOCKER_PIDS_LIMIT}`,
    "--memory=128m",
    "--memory-swap=128m",
    "--cpus=0.5",
    "--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=16m,mode=1777",
    "--tmpfs=/output:rw,noexec,nosuid,nodev,size=1m,mode=1777",
    image,
    "/bin/sh",
    "-ec",
    CANARY_SCRIPT,
  ];
}

function parseJson(output, action) {
  try {
    return JSON.parse(String(output).trim());
  } catch {
    throw new LocalSandboxError(
      `Docker returned invalid JSON for ${action}.`,
      "DOCKER_JSON_INVALID",
    );
  }
}

function defaultRunProcess(command, args, { timeoutMs = 30_000 } = {}) {
  return spawnSync(command, args, { encoding: "utf8", timeout: timeoutMs });
}

function assertProcessSucceeded(result, action) {
  if (result.error) {
    const timedOut = result.error.code === "ETIMEDOUT";
    throw new LocalSandboxError(
      timedOut
        ? `${action} exceeded its runtime limit.`
        : `${action} failed: ${redactLocalRuntimeText(result.error.message)}`,
      timedOut ? "LOCAL_SANDBOX_TIMEOUT" : "LOCAL_PROCESS_FAILED",
    );
  }
  if (result.status === 0) return result;
  const detail = redactLocalRuntimeText(result.stderr || result.stdout).trim();
  throw new LocalSandboxError(
    `${action} failed with exit ${result.status}${detail ? `: ${detail}` : "."}`,
    "DOCKER_COMMAND_FAILED",
  );
}

function runDocker(runProcess, args, action, options) {
  return assertProcessSucceeded(
    runProcess("docker", args, options),
    action,
  ).stdout;
}

function defaultSleep(durationMs) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, durationMs);
}

function containerExists(runProcess, name) {
  assertSafeLocalContainerName(name);
  const output = runDocker(
    runProcess,
    [
      "ps",
      "-a",
      "--filter",
      `name=^/${name}$`,
      "--format",
      "{{.Names}}",
    ],
    `inspect exact local container inventory for ${name}`,
  );
  return output
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .includes(name);
}

export function assertHardenedContainerInspection(inspection) {
  const config = inspection?.Config ?? {};
  const host = inspection?.HostConfig ?? {};
  const tmpfs = host.Tmpfs ?? {};
  const failures = [];

  if (config.User !== "65534:65534") failures.push("non-root user");
  if (JSON.stringify(config.Env ?? []) !== JSON.stringify(ALLOWED_CONTAINER_ENV)) {
    failures.push("no inherited environment");
  }
  if (Object.keys(config.ExposedPorts ?? {}).length) {
    failures.push("no exposed ports");
  }
  if (host.NetworkMode !== "none") failures.push("network=none");
  if (host.ReadonlyRootfs !== true) failures.push("read-only root filesystem");
  if (host.Privileged !== false) failures.push("unprivileged container");
  if (!host.CapDrop?.includes("ALL")) failures.push("all capabilities dropped");
  if ((host.CapAdd ?? []).length) failures.push("no added capabilities");
  if (!host.SecurityOpt?.includes("no-new-privileges:true")) {
    failures.push("no-new-privileges");
  }
  if (host.PidsLimit !== DOCKER_PIDS_LIMIT) failures.push("PID limit");
  if (host.Memory !== DOCKER_MEMORY_BYTES) failures.push("memory limit");
  if (host.MemorySwap !== DOCKER_MEMORY_BYTES) failures.push("swap limit");
  if (host.NanoCpus !== DOCKER_NANO_CPUS) failures.push("CPU limit");
  if (host.PublishAllPorts === true || Object.keys(host.PortBindings ?? {}).length) {
    failures.push("no published ports");
  }
  if ((host.Binds ?? []).length || (host.Mounts ?? []).length) {
    failures.push("no host bind mounts");
  }
  const tmpfsPaths = Object.keys(tmpfs).sort();
  if (JSON.stringify(tmpfsPaths) !== JSON.stringify(["/output", "/tmp"])) {
    failures.push("only required tmpfs mounts");
  }
  for (const path of ["/tmp", "/output"]) {
    const options = new Set(String(tmpfs[path] ?? "").split(","));
    if (!["rw", "noexec", "nosuid", "nodev"].every((option) => options.has(option))) {
      failures.push(`hardened ${path} tmpfs`);
    }
  }

  if (failures.length > 0) {
    throw new LocalSandboxError(
      `Local container failed isolation inspection: ${failures.join(", ")}.`,
      "LOCAL_ISOLATION_INSPECTION_FAILED",
    );
  }

  return {
    user: config.User,
    networkMode: host.NetworkMode,
    readOnlyRootFilesystem: host.ReadonlyRootfs,
    capabilitiesDropped: [...host.CapDrop],
    noNewPrivileges: true,
    pidsLimit: host.PidsLimit,
    memoryBytes: host.Memory,
    nanoCpus: host.NanoCpus,
    writableTmpfs: tmpfsPaths,
  };
}

export function assertValidLocalReceipt(receipt) {
  const valid =
    receipt?.schema === LOCAL_SANDBOX_RECEIPT_SCHEMA &&
    receipt?.uid === 65534 &&
    receipt?.gid === 65534 &&
    receipt?.rootFilesystemReadOnly === true &&
    receipt?.networkBlocked === true &&
    receipt?.artifactTmpfsWritable === true;
  if (!valid) {
    throw new LocalSandboxError(
      "Local canary receipt did not prove the required runtime posture.",
      "LOCAL_RECEIPT_INVALID",
    );
  }
  return receipt;
}

export function readLocalDockerReadiness({
  runProcess = defaultRunProcess,
  image = LOCAL_SANDBOX_IMAGE,
  dockerHostOverride = process.env.DOCKER_HOST,
} = {}) {
  if (image !== LOCAL_SANDBOX_IMAGE) {
    throw new LocalSandboxError(
      "Readiness requires the approved immutable local image.",
      "UNAPPROVED_LOCAL_IMAGE",
    );
  }

  const server = parseJson(
    runDocker(
      runProcess,
      ["version", "--format", "{{json .Server}}"],
      "Docker engine readiness",
    ),
    "Docker engine readiness",
  );
  const imageInspection = parseJson(
    runDocker(
      runProcess,
      ["image", "inspect", image, "--format", "{{json .}}"],
      "pinned local image readiness",
    ),
    "pinned local image readiness",
  );
  const securityOptions = parseJson(
    runDocker(
      runProcess,
      ["info", "--format", "{{json .SecurityOptions}}"],
      "Docker security readiness",
    ),
    "Docker security readiness",
  );
  const context = parseJson(
    runDocker(
      runProcess,
      ["context", "inspect", "--format", "{{json .}}"],
      "Docker context readiness",
    ),
    "Docker context readiness",
  );
  const lingering = runDocker(
    runProcess,
    [
      "ps",
      "-a",
      "--filter",
      `label=${LOCAL_SANDBOX_LABEL}`,
      "--format",
      "{{.Names}}",
    ],
    "local canary inventory",
  )
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);

  const requiredSecurityOptions = ["name=seccomp,profile=builtin", "name=cgroupns"];
  const missingSecurityOptions = requiredSecurityOptions.filter(
    (required) => !securityOptions.includes(required),
  );
  const imageMatches = imageInspection?.RepoDigests?.includes(image);
  const contextEndpoint = String(context?.Endpoints?.docker?.Host ?? "");
  const localContextEndpoint = contextEndpoint.startsWith("unix://");
  const ready =
    Boolean(server?.Version) &&
    imageMatches &&
    localContextEndpoint &&
    !dockerHostOverride &&
    missingSecurityOptions.length === 0 &&
    lingering.length === 0;

  return {
    ready,
    engineVersion: String(server?.Version ?? ""),
    engineOs: String(server?.Os ?? ""),
    engineArch: String(server?.Arch ?? ""),
    image,
    imagePresentByDigest: imageMatches,
    contextName: String(context?.Name ?? ""),
    contextEndpointType: contextEndpoint.split(":", 1)[0],
    localContextEndpoint,
    dockerHostOverridePresent: Boolean(dockerHostOverride),
    securityOptions,
    missingSecurityOptions,
    lingeringContainers: lingering,
  };
}

function lifecycleRecorder(now) {
  const events = [];
  return {
    events,
    record(state) {
      events.push({ state, at: new Date(now()).toISOString() });
    },
  };
}

export function assertCompleteLocalLifecycle(events) {
  const observed = events.map((event) => event.state);
  if (JSON.stringify(observed) !== JSON.stringify(REQUIRED_LIFECYCLE)) {
    throw new LocalSandboxError(
      `Local lifecycle was incomplete: ${observed.join(" -> ")}.`,
      "LOCAL_LIFECYCLE_INCOMPLETE",
    );
  }
  return events;
}

export function runLocalDockerCanary({
  runProcess = defaultRunProcess,
  name = generateLocalContainerName(),
  image = LOCAL_SANDBOX_IMAGE,
  timeoutMs = 15_000,
  now = Date.now,
  sleep = defaultSleep,
} = {}) {
  assertSafeLocalContainerName(name);
  const readiness = readLocalDockerReadiness({ runProcess, image });
  if (!readiness.ready) {
    throw new LocalSandboxError(
      "Local Docker sandbox readiness is blocked.",
      "LOCAL_SANDBOX_NOT_READY",
    );
  }

  const recorder = lifecycleRecorder(now);
  let createdContainerId;
  let primaryError;
  let cleanupError;
  let result;

  recorder.record("REQUESTED");
  try {
    recorder.record("PROVISIONING");
    createdContainerId = runDocker(
      runProcess,
      buildDockerCreateArguments(name, { image }),
      `create local canary ${name}`,
    ).trim();
    if (!createdContainerId) {
      throw new LocalSandboxError(
        `Docker did not return an identity for local canary ${name}.`,
        "LOCAL_CONTAINER_ID_MISSING",
      );
    }

    recorder.record("HEALTH_CHECKING");
    const inspectionPayload = parseJson(
      runDocker(
        runProcess,
        ["inspect", name],
        `inspect local canary ${name}`,
      ),
      `inspect local canary ${name}`,
    );
    if (inspectionPayload?.[0]?.Id !== createdContainerId) {
      throw new LocalSandboxError(
        `Local canary ${name} did not match its created Docker identity.`,
        "LOCAL_CONTAINER_ID_MISMATCH",
      );
    }
    const inspection = assertHardenedContainerInspection(inspectionPayload?.[0]);
    recorder.record("READY");

    runDocker(runProcess, ["start", name], `start local canary ${name}`);
    recorder.record("RUNNING");

    const receiptDeadline = now() + timeoutMs;
    let receiptReady = false;
    while (now() < receiptDeadline) {
      const probe = runProcess(
        "docker",
        ["exec", name, "test", "-s", "/output/receipt.json"],
        { timeoutMs: 2_000 },
      );
      if (!probe.error && probe.status === 0) {
        receiptReady = true;
        break;
      }
      sleep(100);
    }
    if (!receiptReady) {
      throw new LocalSandboxError(
        `Local canary ${name} did not produce a receipt before its deadline.`,
        "LOCAL_SANDBOX_TIMEOUT",
      );
    }

    const receipt = assertValidLocalReceipt(
      parseJson(
        runDocker(
          runProcess,
          ["exec", name, "cat", "/output/receipt.json"],
          `extract local canary receipt for ${name}`,
        ),
        "local canary receipt",
      ),
    );
    recorder.record("RESULT_READY");

    runDocker(
      runProcess,
      ["exec", "--user=65534:65534", name, "touch", "/tmp/host-ack"],
      `acknowledge local canary receipt for ${name}`,
    );
    const exitCode = Number(
      runDocker(
        runProcess,
        ["wait", name],
        `wait for local canary ${name}`,
        { timeoutMs },
      ).trim(),
    );
    if (exitCode !== 0) {
      const logs = runDocker(
        runProcess,
        ["logs", name],
        `read failed local canary logs for ${name}`,
      );
      throw new LocalSandboxError(
        `Local canary exited ${exitCode}${logs.trim() ? `: ${redactLocalRuntimeText(logs)}` : "."}`,
        "LOCAL_CANARY_WORKLOAD_FAILED",
      );
    }
    result = { name, image, readiness, inspection, receipt };
  } catch (error) {
    primaryError = error;
  } finally {
    recorder.record("TEARING_DOWN");
    try {
      if (createdContainerId) {
        if (containerExists(runProcess, name)) {
          runDocker(
            runProcess,
            ["rm", "-f", createdContainerId],
            `remove exact local canary ${name}`,
          );
        }
        if (containerExists(runProcess, name)) {
          throw new LocalSandboxError(
            `Local canary ${name} remains after cleanup.`,
            "LOCAL_CANARY_ORPHANED",
          );
        }
      }
      recorder.record("TERMINATED");
    } catch (error) {
      cleanupError = error;
    }
  }

  if (cleanupError) {
    throw new AggregateError(
      primaryError ? [primaryError, cleanupError] : [cleanupError],
      `Local canary cleanup was not verified for exact container ${name}.`,
    );
  }
  if (primaryError) throw primaryError;

  return {
    ...result,
    lifecycle: assertCompleteLocalLifecycle(recorder.events),
    cleanupVerified: true,
  };
}
