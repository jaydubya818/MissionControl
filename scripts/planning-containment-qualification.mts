import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  CODEX_WORKSPACE_PERMISSION_CONFIG,
  CODEX_WORKSPACE_PERMISSION_PROFILE,
  CodexV1ExecutorAdapter,
  codexChildEnvironment,
} from "../apps/orchestration-server/src/codexExecutorAdapter.js";

const execFileAsync = promisify(execFile);
const root = await mkdtemp(path.join(tmpdir(), "mc-planning-containment-qualification-"));
const workspace = path.join(root, "workspace");
const allowedFile = path.join(workspace, "README.md");
const secretFile = path.join(workspace, ".env");
const outsideFile = path.join(root, "outside.txt");
const forbiddenWrite = path.join(workspace, "forbidden-write.txt");

try {
  await mkdir(workspace);
  await writeFile(allowedFile, "repository evidence\n");
  await writeFile(secretFile, "PLANNING_SECRET=denied\n");
  await writeFile(outsideFile, "unrelated host file\n");
  await execFileAsync("git", ["init", "-q", workspace]);
  await execFileAsync("git", ["-C", workspace, "config", "user.name", "Containment Fixture"]);
  await execFileAsync("git", ["-C", workspace, "config", "user.email", "containment@example.invalid"]);
  await execFileAsync("git", ["-C", workspace, "add", "README.md"]);
  await execFileAsync("git", ["-C", workspace, "commit", "-qm", "baseline"]);
  await execFileAsync("git", ["-C", workspace, "remote", "add", "forbidden", "https://example.com/mission-control.git"]);

  const profileOverrides = CODEX_WORKSPACE_PERMISSION_CONFIG.filter((value) => !value.startsWith("default_permissions="));
  await execFileAsync("codex", [
    "sandbox",
    "-P",
    CODEX_WORKSPACE_PERMISSION_PROFILE,
    ...profileOverrides.flatMap((value) => ["-c", value]),
    "-C",
    workspace,
    "--",
    "/bin/sh",
    "-c",
    [
      'test -r "$1"',
      '! test -r "$2"',
      '! test -r "$3"',
      '! touch "$4" 2>/dev/null',
      '! git -C "$5" commit --allow-empty -m forbidden >/dev/null 2>&1',
      '! git -C "$5" push forbidden HEAD:main >/dev/null 2>&1',
      '! /usr/bin/curl --max-time 3 --silent --show-error https://example.com >/dev/null 2>&1',
    ].join(" && "),
    "mission-planning-containment",
    allowedFile,
    outsideFile,
    secretFile,
    forbiddenWrite,
    workspace,
  ], {
    timeout: 15_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" },
  });

  const adapter = new CodexV1ExecutorAdapter();
  const authority = adapter.capabilities().authority;
  if (Object.values(authority).some((value) => value !== "NONE")) {
    throw new Error("Planning harness unexpectedly advertises governance authority.");
  }
  const childEnvironment = codexChildEnvironment({
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    CODEX_HOME: process.env.CODEX_HOME,
    MISSION_CONTROL_SERVICE_COMMAND_SECRET: "denied",
    GITHUB_APP_PRIVATE_KEY: "denied", // secret-scan: allow-fixture
    CONVEX_SERVICE_AUTH_TOKEN: "denied",
  });
  for (const name of ["MISSION_CONTROL_SERVICE_COMMAND_SECRET", "GITHUB_APP_PRIVATE_KEY", "CONVEX_SERVICE_AUTH_TOKEN"]) {
    if (childEnvironment[name]) throw new Error(`${name} leaked into the planner process environment.`);
  }

  process.stdout.write(`${JSON.stringify({
    schema: "mission-planning-containment-qualification/v1",
    status: "PASS",
    permissionProfile: CODEX_WORKSPACE_PERMISSION_PROFILE,
    checks: {
      repositoryRead: "ALLOWED",
      unrelatedHostRead: "DENIED",
      repositorySecretRead: "DENIED",
      repositoryWrite: "DENIED",
      gitCommit: "DENIED",
      gitPushPublication: "DENIED",
      networkEgress: "DENIED",
      governanceAuthority: authority,
      controlPlaneCredentials: "ABSENT",
    },
  }, null, 2)}\n`);
} finally {
  await rm(root, { recursive: true, force: true });
}
