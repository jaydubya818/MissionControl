/**
 * Dependency-free bootstrap uploaded to the trusted root side of an exe.dev VM.
 * It verifies the frozen toolchain, prepares a non-root Attempt workspace, and
 * applies an nftables policy to the untrusted execution UID before Codex starts.
 */
export function standaloneRestrictedSandboxBootstrapSource() {
  return String.raw`
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lookup } from "node:dns/promises";
import { mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, statSync, lstatSync, lchownSync, unlinkSync, writeFileSync, chmodSync, chownSync } from "node:fs";
import { isIP } from "node:net";
import https from "node:https";
import net from "node:net";
import { dirname } from "node:path";

const sha256 = (value) => "sha256:" + createHash("sha256").update(value).digest("hex");
const fileSha256 = (file) => sha256(readFileSync(file));
const command = (executable, args) => execFileSync(executable, args, { encoding: "utf8", timeout: 15000 }).trim();
const atomicWrite = (file, content) => {
  mkdirSync(dirname(file), { recursive: true, mode: 448 });
  const temporary = file + ".tmp-" + process.pid;
  try {
    writeFileSync(temporary, content, { mode: 384, flag: "wx" });
    renameSync(temporary, file);
  } finally {
    try { unlinkSync(temporary); } catch {}
  }
};

const connectBlocked = (host, port) => new Promise((resolve) => {
  const socket = net.connect({ host, port });
  const finish = (blocked) => { socket.destroy(); resolve(blocked); };
  socket.setTimeout(1500, () => finish(true));
  socket.once("connect", () => finish(false));
  socket.once("error", () => finish(true));
});
const connectReachable = (host, port) => new Promise((resolve) => {
  const socket = net.connect({ host, port });
  const finish = (reachable) => { socket.destroy(); resolve(reachable); };
  socket.setTimeout(3000, () => finish(false));
  socket.once("connect", () => finish(true));
  socket.once("error", () => finish(false));
});
const unexpectedDnsBlocked = async () => {
  try {
    await Promise.race([
      lookup("example.com"),
      new Promise((_, reject) => setTimeout(() => reject(new Error("DNS lookup timed out.")), 2000)),
    ]);
    return false;
  } catch {
    return true;
  }
};
const approvedReachable = (host) => new Promise((resolve) => {
  const request = https.request({ hostname: host, port: 443, path: "/api/v1/models", method: "HEAD", timeout: 5000 }, (response) => {
    response.resume();
    resolve(Number.isSafeInteger(response.statusCode));
  });
  request.once("timeout", () => { request.destroy(); resolve(false); });
  request.once("error", () => resolve(false));
  request.end();
});

if (process.argv[2] === "--probe") {
  const probe = JSON.parse(process.env.MC_NETWORK_PROBE ?? "{}");
  const result = {
    approvedEndpointReachable: await approvedReachable(probe.approvedHost),
    arbitraryExternalBlocked: await connectBlocked(probe.controlExternalIp, 443),
    privateNetworkBlocked: await connectBlocked("10.0.0.1", 80),
    metadataBlocked: await connectBlocked("169.254.169.254", 80),
    unexpectedDnsBlocked: await unexpectedDnsBlocked(),
  };
  process.stdout.write(JSON.stringify(result));
  process.exit(Object.values(result).every(Boolean) ? 0 : 1);
}

const publicIpv4 = (address) => {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b, c] = parts;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)))) return false;
  if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
};
const publicIpv6 = (address) => {
  const normalized = address.toLowerCase().split("%")[0];
  if (normalized.startsWith("::ffff:")) return publicIpv4(normalized.slice(7));
  return normalized !== "::" && normalized !== "::1"
    && !normalized.startsWith("fc") && !normalized.startsWith("fd")
    && !/^fe[89ab]/.test(normalized) && !normalized.startsWith("ff")
    && !normalized.startsWith("2001:db8:");
};
const assertPublicAddress = (address) => {
  const family = isIP(address);
  if ((family === 4 && !publicIpv4(address)) || (family === 6 && !publicIpv6(address)) || family === 0) {
    throw new Error("Approved egress hostname resolved to a non-public address.");
  }
};

const config = JSON.parse(readFileSync(process.argv[2], "utf8"));
const security = config.security;
if (process.getuid?.() !== 0 || security?.schema !== "factory-sandbox-security/v1"
  || security.profile !== "remote-sandbox/exe-dev/restricted-candidate-v1"
  || security.qualificationOnly !== true || security.network?.enforcement !== "GUEST_NFTABLES"
  || security.network?.providerEnforced !== false || JSON.stringify(security.network.allowedHttpsHosts) !== JSON.stringify(["openrouter.ai"])) {
  throw new Error("Restricted sandbox bootstrap configuration is invalid.");
}
if (config.expectedImage !== config.observedProviderImage) throw new Error("Provider image identity does not match the frozen digest reference.");

const nativeCodex = "/opt/mission-control/codex/node_modules/@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/bin/codex";
const observedToolchain = {
  nodeVersion: command("node", ["--version"]),
  codexVersion: command("codex", ["--version"]),
  codexBinarySha256: fileSha256(nativeCodex),
  toolchainInputsSha256: fileSha256("/etc/mission-control/toolchain-inputs.json"),
  executionUid: Number(command("id", ["-u", security.execution.user])),
  executionGid: Number(command("id", ["-g", security.execution.user])),
};
for (const field of ["nodeVersion", "codexVersion", "codexBinarySha256", "toolchainInputsSha256"]) {
  if (observedToolchain[field] !== security.toolchain[field]) throw new Error("Observed " + field + " does not match the frozen toolchain.");
}
if (observedToolchain.executionUid !== security.execution.uid || observedToolchain.executionGid !== security.execution.gid) {
  throw new Error("Observed execution identity does not match the frozen toolchain.");
}
command("nft", ["--version"]);
command("setpriv", ["--version"]);

const remoteRoot = realpathSync(config.remoteRoot);
const repositoryRoot = realpathSync(config.repositoryRoot);
if (remoteRoot !== "/var/lib/mission-control/attempt"
  || repositoryRoot !== remoteRoot + "/repository"
  || config.executorResultPath !== remoteRoot + "/executor-result.json"
  || (config.outputSchemaPath && config.outputSchemaPath !== remoteRoot + "/factory-result.schema.json")
  || config.proofPath !== remoteRoot + "/security-proof.json") {
  throw new Error("Restricted sandbox workspace path is invalid.");
}
let ownershipEntryCount = 0;
const chownTreeWithoutFollowingLinks = (entryPath) => {
  ownershipEntryCount += 1;
  if (ownershipEntryCount > 100000) throw new Error("Restricted sandbox repository contains too many entries.");
  const entry = lstatSync(entryPath);
  lchownSync(entryPath, security.execution.uid, security.execution.gid);
  if (entry.isDirectory() && !entry.isSymbolicLink()) {
    for (const child of readdirSync(entryPath)) chownTreeWithoutFollowingLinks(entryPath + "/" + child);
  }
};
chownTreeWithoutFollowingLinks(repositoryRoot);
chmodSync(remoteRoot, 0o711);
for (const directory of [security.execution.homePath, security.execution.temporaryPath]) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chownSync(directory, security.execution.uid, security.execution.gid);
  chmodSync(directory, 0o700);
}
if (config.executorResultPath) {
  writeFileSync(config.executorResultPath, "", { mode: 0o600 });
  chownSync(config.executorResultPath, security.execution.uid, security.execution.gid);
}
if (config.outputSchemaPath) chmodSync(config.outputSchemaPath, 0o444);

const addresses = [];
for (const host of security.network.allowedHttpsHosts) {
  const records = await lookup(host, { all: true, verbatim: true });
  if (records.length === 0) throw new Error("Approved egress hostname did not resolve.");
  for (const record of records) {
    assertPublicAddress(record.address);
    addresses.push({ host, address: record.address, family: record.family });
  }
}
const uniqueAddresses = [...new Map(addresses.map((entry) => [entry.address, entry])).values()]
  .sort((left, right) => left.address.localeCompare(right.address));
const controlExternalIp = "1.1.1.1";
const controlExternalEndpointReachable = await connectReachable(controlExternalIp, 443);
if (!controlExternalEndpointReachable) throw new Error("Network policy control endpoint was not reachable before enforcement.");
const hostsText = readFileSync("/etc/hosts", "utf8")
  .replace(/\n?# BEGIN MISSION CONTROL EGRESS[\s\S]*?# END MISSION CONTROL EGRESS\n?/g, "\n")
  .trimEnd();
const hostEntries = uniqueAddresses.map((entry) => entry.address + " " + entry.host).join("\n");
writeFileSync("/etc/hosts", hostsText + "\n# BEGIN MISSION CONTROL EGRESS\n" + hostEntries + "\n# END MISSION CONTROL EGRESS\n");

try { execFileSync("nft", ["delete", "table", "inet", "mission_control_egress"], { stdio: "ignore" }); } catch {}
const allowRules = uniqueAddresses.map((entry) => entry.family === 4
  ? "    meta skuid " + security.execution.uid + " ip daddr " + entry.address + " tcp dport 443 accept"
  : "    meta skuid " + security.execution.uid + " ip6 daddr " + entry.address + " tcp dport 443 accept").join("\n");
const rules = [
  "table inet mission_control_egress {",
  "  chain output {",
  "    type filter hook output priority filter; policy accept;",
  "    meta skuid " + security.execution.uid + " ct state established,related accept",
  allowRules,
  "    meta skuid " + security.execution.uid + " counter reject with icmpx type admin-prohibited",
  "  }",
  "}",
  "",
].join("\n");
execFileSync("nft", ["-f", "-"], { input: rules, timeout: 15000 });
command("nft", ["list", "table", "inet", "mission_control_egress"]);

const probeEnvironment = {
  PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
  HOME: security.execution.homePath,
  TMPDIR: security.execution.temporaryPath,
  MC_NETWORK_PROBE: JSON.stringify({ approvedHost: security.network.allowedHttpsHosts[0], controlExternalIp }),
};
const probe = JSON.parse(execFileSync("setpriv", [
  "--no-new-privs",
  "--reuid=" + security.execution.uid,
  "--regid=" + security.execution.gid,
  "--clear-groups",
  "--",
  process.execPath,
  process.argv[1],
  "--probe",
], { encoding: "utf8", env: probeEnvironment, timeout: 20000 }));

const protectedPathsReadOnly = execFileSync("setpriv", [
  "--no-new-privs",
  "--reuid=" + security.execution.uid,
  "--regid=" + security.execution.gid,
  "--clear-groups",
  "--",
  "sh",
  "-c",
  "test ! -w /etc && test ! -w /usr && test ! -w /var/lib/mission-control",
], { timeout: 10000 }).length === 0;
const repositoryStat = statSync(repositoryRoot);
const proof = {
  schema: "factory-sandbox-security-proof/v1",
  profile: security.profile,
  observedAt: Date.now(),
  toolchain: observedToolchain,
  filesystem: {
    repositoryOwnerUid: repositoryStat.uid,
    repositoryOwnerGid: repositoryStat.gid,
    protectedPathsReadOnly,
  },
  network: {
    enforcement: "GUEST_NFTABLES",
    providerEnforced: false,
    policyDigest: sha256(rules),
    allowedHttpsHosts: security.network.allowedHttpsHosts,
    resolvedAddresses: uniqueAddresses.map((entry) => entry.address),
    controlExternalEndpointReachable,
    ...probe,
  },
};
if (proof.filesystem.repositoryOwnerUid !== security.execution.uid
  || proof.filesystem.repositoryOwnerGid !== security.execution.gid
  || !proof.filesystem.protectedPathsReadOnly
  || !Object.values(probe).every(Boolean)) {
  throw new Error("Restricted sandbox bootstrap proof did not pass every fail-closed check.");
}
atomicWrite(config.proofPath, JSON.stringify(proof));
process.stdout.write(JSON.stringify(proof));
`.trim();
}
