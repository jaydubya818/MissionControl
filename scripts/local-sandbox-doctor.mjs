#!/usr/bin/env node

import {
  readLocalDockerReadiness,
  redactLocalRuntimeText,
  runLocalDockerCanary,
} from "./lib/local-docker-sandbox.mjs";

function parseArguments(argv) {
  let canary = false;
  let json = false;
  let help = false;
  let repeat = 1;

  for (const argument of argv) {
    if (argument === "--canary") canary = true;
    else if (argument === "--json") json = true;
    else if (argument === "--help") help = true;
    else if (argument.startsWith("--repeat=")) {
      repeat = Number(argument.slice("--repeat=".length));
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (!Number.isInteger(repeat) || repeat < 1 || repeat > 10) {
    throw new Error("--repeat must be an integer from 1 through 10.");
  }
  if (!canary && repeat !== 1) {
    throw new Error("--repeat requires --canary.");
  }
  return { canary, json, help, repeat };
}

function printHelp() {
  process.stdout.write(`Mission Control free local-sandbox doctor

Usage:
  node scripts/local-sandbox-doctor.mjs [--json]
  node scripts/local-sandbox-doctor.mjs --canary [--repeat=3] [--json]

The canary uses only the installed Docker engine and a cached immutable image.
It performs no image pull, external API call, repository clone, model call, or
public-port operation. Local containers do not prove remote-machine autonomy.
`);
}

function summarize(result) {
  process.stdout.write("Free local sandbox doctor\n");
  process.stdout.write(`  Ready: ${result.readiness.ready ? "yes" : "no"}\n`);
  process.stdout.write(`  Engine: ${result.readiness.engineVersion}\n`);
  process.stdout.write(`  Image pinned: ${result.readiness.imagePresentByDigest ? "yes" : "no"}\n`);
  process.stdout.write(
    `  Lingering canaries: ${result.readiness.lingeringContainers.length}\n`,
  );
  for (const canary of result.canaries) {
    process.stdout.write(`  Canary: ${canary.name}\n`);
    process.stdout.write(`    Network blocked: ${canary.receipt.networkBlocked}\n`);
    process.stdout.write(`    Read-only root: ${canary.receipt.rootFilesystemReadOnly}\n`);
    process.stdout.write(`    Cleanup verified: ${canary.cleanupVerified}\n`);
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const readiness = readLocalDockerReadiness();
  if (!readiness.ready) {
    const error = new Error("Local Docker sandbox readiness is blocked.");
    error.code = "LOCAL_SANDBOX_NOT_READY";
    error.readiness = readiness;
    throw error;
  }

  const canaries = [];
  if (options.canary) {
    for (let index = 0; index < options.repeat; index += 1) {
      canaries.push(runLocalDockerCanary());
    }
  }
  const result = { status: "ready", readiness, canaries };
  if (options.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else summarize(result);
}

main().catch((error) => {
  const nested = error instanceof AggregateError ? error.errors : [error];
  const payload = {
    status: "blocked",
    codes: nested.map((candidate) => candidate?.code).filter(Boolean),
    message: redactLocalRuntimeText(
      error instanceof AggregateError
        ? nested.map((candidate) => candidate?.message).filter(Boolean).join(" | ")
        : error.message,
    ),
    readiness: error.readiness,
  };
  if (process.argv.includes("--json")) {
    process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else {
    process.stderr.write(`Free local sandbox doctor blocked: ${payload.message}\n`);
  }
  process.exitCode = 1;
});
