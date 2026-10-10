import { spawn, execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile, copyFile, symlink, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { ConvexHttpClient } from "convex/browser";

export async function startFixtureDatabase(repo, { canonicalAccounting = false, nativeExecution = false } = {}) {
  const binary = process.env.MC_COMPATIBILITY_CONVEX_BINARY;
  if (!binary) throw Error("MC_COMPATIBILITY_CONVEX_BINARY must identify a local Convex backend binary");
  const root = await mkdtemp(join(tmpdir(), "mc-enterprise-1b-"));
  const name = "enterprise-compatibility-fixture", secret = randomBytes(32).toString("hex");
  const key = execFileSync(binary, ["keygen", "admin-key", "--instance-name", name, "--instance-secret", secret], { encoding: "utf8" }).trim();
  const port = Number(process.env.MC_COMPATIBILITY_PORT ?? 3390);
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65533) throw Error("Invalid local fixture port");
  const url = `http://127.0.0.1:${port}`;
  let backend;
  let backendLog = "";
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, CONVEX_TELEMETRY_DISABLED: "1",
    CONVEX_SELF_HOSTED_URL: url, CONVEX_SELF_HOSTED_ADMIN_KEY: key };
  async function start() {
    backend = spawn(binary, ["--interface", "127.0.0.1", "--port", String(port), "--site-proxy-port", String(port + 1),
      "--instance-name", name, "--instance-secret", secret, "--disable-beacon", "--local-storage", join(root, "storage"), join(root, "db.sqlite3")],
      { env, stdio: ["ignore", "ignore", "pipe"] });
    backend.stderr.on("data", chunk => { backendLog = (backendLog + chunk.toString()).slice(-6000); });
    for (let i = 0; i < 100; i++) {
      if (backend.exitCode !== null || backend.signalCode !== null) throw Error(`Disposable backend failed: ${backendLog.replaceAll(secret, "[ephemeral-secret]")}`);
      try { if ((await fetch(`${url}/version`)).ok) return; } catch {}
      await new Promise(r => setTimeout(r, 100));
    }
    throw Error("Disposable backend startup timeout");
  }
  async function stop() { if (backend && backend.exitCode === null && backend.signalCode === null) { backend.kill("SIGTERM"); await once(backend, "exit"); } }
  const copied = new Set();
  async function copyClosure(relative) {
    if (copied.has(relative)) return; copied.add(relative);
    const source = join(repo, relative), target = join(root, relative);
    await mkdir(dirname(target), { recursive: true }); await copyFile(source, target);
    const text = await readFile(source, "utf8");
    for (const match of text.matchAll(/(?:from|import)\s*["'](\.[^"']+)["']/g)) {
      let file = resolve(dirname(source), match[1]);
      let chosen;
      for (const candidate of [file, `${file}.ts`, `${file}.js`, file.replace(/\.js$/, ".ts"), `${file}.d.ts`]) {
        try { await readFile(candidate); chosen = candidate; break; } catch {}
      }
      if (chosen) await copyClosure(chosen.slice(repo.length + 1));
    }
  }
  try {
    await mkdir(join(root, "convex"));
    await symlink(join(repo, "node_modules"), join(root, "node_modules"));
    await writeFile(join(root, "package.json"), '{"type":"module","dependencies":{"convex":"1.42.3"}}');
    await writeFile(join(root, "convex.json"), '{}');
    await copyClosure("convex/schema.ts");
    await copyClosure("convex/factory/enterpriseCompatibility.ts");
    await copyFile(join(repo, "scripts/enterprise-compatibility/seed.js"), join(root, "convex/fixtureSeed.js"));
    if (nativeExecution) {
      // Include canonical dynamic internal references used by real workers and
      // scheduled verification. No recurring jobs, HTTP ingress or external auth.
      await cp(join(repo, "convex"), join(root, "convex"), { recursive: true, filter: source =>
        !source.includes("/__tests__") && !/\/(crons|http|auth.config)\.[jt]s$/.test(source) });
      await copyClosure("convex/lib/serviceCommandAuth.ts");
      await copyClosure("convex/lib/factoryMemory.ts");
      await copyFile(join(repo, "scripts/qualification/native-fixture.js"), join(root, "convex/nativeFixture.js"));
    }
    if (canonicalAccounting) {
      await copyClosure("convex/lib/offlineAttemptBudget.ts");
      await copyClosure("convex/lib/companyAccess.ts");
      await copyFile(join(repo, "scripts/enterprise-compatibility/accounting-fixture.js"), join(root, "convex/accountingFixture.js"));
    }
    await start();
    const cli = join(repo, "node_modules/convex/bin/main.js");
    try {
      execFileSync(process.execPath, [cli, "dev", "--once", "--typecheck", "disable", "--url", url, "--admin-key", key],
        { cwd: root, env, encoding: "utf8", timeout: 60000, stdio: "pipe" });
      execFileSync(process.execPath, [cli, "env", "set", "MC_ENTERPRISE_COMPATIBILITY_FIXTURES", "1", "--url", url, "--admin-key", key],
        { cwd: root, env, encoding: "utf8", timeout: 20000, stdio: "pipe" });
      if (canonicalAccounting) execFileSync(process.execPath, [cli, "env", "set", "MC_ENTERPRISE_CANONICAL_ACCOUNTING", "1", "--url", url, "--admin-key", key],
        { cwd: root, env, encoding: "utf8", timeout: 20000, stdio: "pipe" });
      if (nativeExecution) execFileSync(process.execPath, [cli, "env", "set", "MC_NATIVE_SUCCESSOR_QUALIFICATION", "1", "--url", url, "--admin-key", key],
        { cwd: root, env, encoding: "utf8", timeout: 20000, stdio: "pipe" });
    } catch (error) { throw Error(String(error.stderr ?? error).replaceAll(key, "[ephemeral-key]")); }
    function client(subject) {
      const c = new ConvexHttpClient(url);
      c.setAdminAuth(key, { subject, issuer: "https://fixture.example.test", email: `${subject}@example.test` });
      return c;
    }
    const owner = client(nativeExecution ? "user_SyntheticHandoffQualification" : "fixture-owner"), other = client("fixture-other");
    const seed = await owner.mutation(nativeExecution ? "nativeFixture:seed" : "fixtureSeed:seed", {});
    return { root, seed, owner, other, peer: client("fixture-peer"), anonymous: new ConvexHttpClient(url), stop,
      ...(nativeExecution ? { client, setEnvironment(name, value) {
        if (!["MC_LOCAL_REPOSITORY_ADMISSION", "MC_OFFLINE_QUALIFICATION_ENVIRONMENT_ID", "MISSION_CONTROL_SERVICE_ID", "MISSION_CONTROL_SERVICE_COMMAND_SECRET"].includes(name)) throw Error("Unapproved native fixture environment field");
        try { execFileSync(process.execPath, [cli, "env", "set", name, value, "--url", url, "--admin-key", key],
          { cwd: root, env, encoding: "utf8", timeout: 20000, stdio: "pipe" }); }
        catch { throw Error(`Disposable environment setup failed: ${name}`); }
      } } : {}),
      restart: async () => { await stop(); await start(); }, copied: [...copied] };
  } catch (error) { await stop(); throw error; }
}
