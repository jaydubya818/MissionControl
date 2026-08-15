import { describe, expect, it } from "vitest";
import {
  assertCompleteLocalLifecycle,
  assertHardenedContainerInspection,
  assertSafeLocalContainerName,
  assertValidLocalReceipt,
  buildDockerCreateArguments,
  generateLocalContainerName,
  LOCAL_SANDBOX_IMAGE,
  LOCAL_SANDBOX_RECEIPT_SCHEMA,
  readLocalDockerReadiness,
  redactLocalRuntimeText,
  runLocalDockerCanary,
} from "./local-docker-sandbox.mjs";

const CONTAINER_NAME = "mc-sbx-local-20260812t120000z-a1b2c3d4";

function validInspection() {
  return {
    Id: "container-id",
    Config: {
      User: "65534:65534",
      Env: ["PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"],
      ExposedPorts: null,
    },
    HostConfig: {
      NetworkMode: "none",
      ReadonlyRootfs: true,
      Privileged: false,
      CapDrop: ["ALL"],
      CapAdd: null,
      SecurityOpt: ["no-new-privileges:true"],
      PidsLimit: 32,
      Memory: 134_217_728,
      MemorySwap: 134_217_728,
      NanoCpus: 500_000_000,
      PublishAllPorts: false,
      PortBindings: {},
      Binds: null,
      Mounts: [],
      Tmpfs: {
        "/tmp": "rw,noexec,nosuid,nodev,size=16m,mode=1777",
        "/output": "rw,noexec,nosuid,nodev,size=1m,mode=1777",
      },
    },
  };
}

function validReceipt() {
  return {
    schema: LOCAL_SANDBOX_RECEIPT_SCHEMA,
    uid: 65534,
    gid: 65534,
    rootFilesystemReadOnly: true,
    networkBlocked: true,
    artifactTmpfsWritable: true,
  };
}

function result({ status = 0, stdout = "", stderr = "", error } = {}) {
  return { status, stdout, stderr, error };
}

function createFakeDocker({
  wait = "0",
  invalidInspection = false,
  createConflict = false,
} = {}) {
  const state = { exists: false, commands: [], removed: false };
  const runProcess = (command, args) => {
    state.commands.push([command, ...args]);
    if (command !== "docker") return result({ status: 127 });

    if (args[0] === "version") {
      return result({
        stdout: JSON.stringify({
          Version: "29.2.0",
          Os: "linux",
          Arch: "arm64",
        }),
      });
    }
    if (args[0] === "image" && args[1] === "inspect") {
      return result({ stdout: JSON.stringify({ RepoDigests: [LOCAL_SANDBOX_IMAGE] }) });
    }
    if (args[0] === "info") {
      return result({
        stdout: JSON.stringify([
          "name=seccomp,profile=builtin",
          "name=cgroupns",
        ]),
      });
    }
    if (args[0] === "context") {
      return result({
        stdout: JSON.stringify({
          Name: "desktop-linux",
          Endpoints: { docker: { Host: "unix:///fixture/docker.sock" } },
        }),
      });
    }
    if (args[0] === "ps") {
      const isLabelInventory = args.some((entry) =>
        entry === "label=mission-control.sandbox-doctor=true"
      );
      return result({
        stdout: state.exists && !isLabelInventory ? `${CONTAINER_NAME}\n` : "",
      });
    }
    if (args[0] === "create") {
      state.exists = true;
      if (createConflict) {
        return result({ status: 1, stderr: "name already in use" });
      }
      return result({ stdout: "container-id\n" });
    }
    if (args[0] === "inspect") {
      const inspection = validInspection();
      if (invalidInspection) inspection.HostConfig.NetworkMode = "bridge";
      return result({ stdout: JSON.stringify([inspection]) });
    }
    if (args[0] === "start") return result({ stdout: `${CONTAINER_NAME}\n` });
    if (args[0] === "exec") {
      if (args.includes("cat")) {
        return result({ stdout: JSON.stringify(validReceipt()) });
      }
      return result();
    }
    if (args[0] === "wait") {
      if (wait === "timeout") {
        const error = new Error("timed out");
        error.code = "ETIMEDOUT";
        return result({ status: null, error });
      }
      return result({ stdout: `${wait}\n` });
    }
    if (args[0] === "logs") return result({ stdout: "fixture failure" });
    if (args[0] === "rm") {
      state.exists = false;
      state.removed = true;
      return result({ stdout: `${CONTAINER_NAME}\n` });
    }
    return result({ status: 2, stderr: `unexpected command ${args.join(" ")}` });
  };
  return { runProcess, state };
}

describe("free local Docker sandbox", () => {
  it("generates only the exact local-canary namespace", () => {
    expect(
      generateLocalContainerName({
        now: new Date("2026-08-12T12:00:00.000Z"),
        randomSuffix: "A1B2C3D4",
      }),
    ).toBe(CONTAINER_NAME);
    expect(() => assertSafeLocalContainerName("*"))
      .toThrow("exact Mission Control local-canary namespace");
  });

  it("creates a pinned, offline, non-root, bounded container", () => {
    const args = buildDockerCreateArguments(CONTAINER_NAME);

    expect(args).toContain("--pull=never");
    expect(args).toContain("--network=none");
    expect(args).toContain("--read-only");
    expect(args).toContain("--user=65534:65534");
    expect(args).toContain("--cap-drop=ALL");
    expect(args).toContain("--security-opt=no-new-privileges:true");
    expect(args).toContain("--pids-limit=32");
    expect(args).toContain("--memory=128m");
    expect(args).toContain("--cpus=0.5");
    expect(args).toContain(LOCAL_SANDBOX_IMAGE);
    expect(args.some((entry) => entry.startsWith("--env"))).toBe(false);
    expect(args.some((entry) => entry === "--privileged")).toBe(false);
    expect(args.some((entry) => entry === "--volume" || entry === "-v")).toBe(false);
    expect(args.some((entry) => entry === "--mount")).toBe(false);
    expect(args.some((entry) => entry.startsWith("--publish"))).toBe(false);
    expect(() =>
      buildDockerCreateArguments(CONTAINER_NAME, { image: "alpine:latest" }),
    ).toThrow("immutable image digest");
  });

  it("independently validates Docker isolation inspection", () => {
    expect(assertHardenedContainerInspection(validInspection())).toMatchObject({
      user: "65534:65534",
      networkMode: "none",
      readOnlyRootFilesystem: true,
      pidsLimit: 32,
      memoryBytes: 134_217_728,
    });

    const unsafe = validInspection();
    unsafe.HostConfig.NetworkMode = "bridge";
    unsafe.HostConfig.ReadonlyRootfs = false;
    unsafe.Config.Env.push("OPENROUTER_API_KEY=must-not-pass");
    unsafe.HostConfig.CapAdd = ["NET_ADMIN"];
    expect(() => assertHardenedContainerInspection(unsafe))
      .toThrow("no inherited environment, network=none, read-only root filesystem");
  });

  it("accepts only a complete runtime receipt", () => {
    expect(assertValidLocalReceipt(validReceipt())).toEqual(validReceipt());
    expect(() =>
      assertValidLocalReceipt({ ...validReceipt(), networkBlocked: false }),
    ).toThrow("did not prove the required runtime posture");
  });

  it("requires the complete lifecycle order", () => {
    const states = [
      "REQUESTED",
      "PROVISIONING",
      "HEALTH_CHECKING",
      "READY",
      "RUNNING",
      "RESULT_READY",
      "TEARING_DOWN",
      "TERMINATED",
    ].map((state) => ({ state, at: "2026-08-12T12:00:00.000Z" }));
    expect(assertCompleteLocalLifecycle(states)).toEqual(states);
    expect(() => assertCompleteLocalLifecycle(states.slice(0, -1)))
      .toThrow("Local lifecycle was incomplete");
  });

  it("fails readiness when the pinned image or security options are absent", () => {
    const fake = createFakeDocker();
    expect(readLocalDockerReadiness({ runProcess: fake.runProcess })).toMatchObject({
      ready: true,
      imagePresentByDigest: true,
      localContextEndpoint: true,
      dockerHostOverridePresent: false,
      lingeringContainers: [],
    });

    const missingSecurity = (command, args) => {
      if (args[0] === "info") return result({ stdout: JSON.stringify([]) });
      return fake.runProcess(command, args);
    };
    expect(readLocalDockerReadiness({ runProcess: missingSecurity })).toMatchObject({
      ready: false,
      missingSecurityOptions: [
        "name=seccomp,profile=builtin",
        "name=cgroupns",
      ],
    });
    expect(
      readLocalDockerReadiness({
        runProcess: fake.runProcess,
        dockerHostOverride: "tcp://remote-docker.example:2376",
      }),
    ).toMatchObject({
      ready: false,
      dockerHostOverridePresent: true,
    });
  });

  it("completes the full lifecycle and removes the exact container", () => {
    const fake = createFakeDocker();
    const canary = runLocalDockerCanary({
      runProcess: fake.runProcess,
      name: CONTAINER_NAME,
      now: () => Date.parse("2026-08-12T12:00:00.000Z"),
    });

    expect(canary.receipt).toEqual(validReceipt());
    expect(canary.cleanupVerified).toBe(true);
    expect(canary.lifecycle.map((event) => event.state)).toEqual([
      "REQUESTED",
      "PROVISIONING",
      "HEALTH_CHECKING",
      "READY",
      "RUNNING",
      "RESULT_READY",
      "TEARING_DOWN",
      "TERMINATED",
    ]);
    expect(fake.state.removed).toBe(true);
    expect(fake.state.exists).toBe(false);
  });

  it("removes the exact container after runtime timeout", () => {
    const fake = createFakeDocker({ wait: "timeout" });
    expect(() =>
      runLocalDockerCanary({
        runProcess: fake.runProcess,
        name: CONTAINER_NAME,
      }),
    ).toThrow("exceeded its runtime limit");
    expect(fake.state.removed).toBe(true);
    expect(fake.state.exists).toBe(false);
  });

  it("removes the exact container after isolation inspection failure", () => {
    const fake = createFakeDocker({ invalidInspection: true });
    expect(() =>
      runLocalDockerCanary({
        runProcess: fake.runProcess,
        name: CONTAINER_NAME,
      }),
    ).toThrow("failed isolation inspection");
    expect(fake.state.removed).toBe(true);
    expect(fake.state.exists).toBe(false);
  });

  it("does not delete a pre-existing container when create reports a conflict", () => {
    const fake = createFakeDocker({ createConflict: true });
    expect(() =>
      runLocalDockerCanary({
        runProcess: fake.runProcess,
        name: CONTAINER_NAME,
      }),
    ).toThrow("name already in use");
    expect(fake.state.removed).toBe(false);
    expect(fake.state.exists).toBe(true);
  });

  it("redacts credential-shaped runtime output", () => {
    const text = redactLocalRuntimeText(
      "sk-or-v1-secret ghp_secret Authorization:BearerSecret",
    );
    expect(text).not.toContain("sk-or-v1-secret");
    expect(text).not.toContain("ghp_secret");
    expect(text).not.toContain("BearerSecret");
  });
});
