import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { canonicalDigest, factoryDelegationBindingDigest, fixtureExposure } from "@mission-control/shared";
import { startFixtureDatabase } from "./database.mjs";
import { loadPinnedPartner } from "./pinned-partner.mjs";
import { makeFixture, compatibility } from "./fixtures.mjs";
import { MyFactoryCompatibilityAdapter, verifyFixtureEnvelope, signFixtureEnvelope, mapPartnerResult } from "../../apps/orchestration-server/src/myFactoryCompatibilityAdapter.ts";

const repo = process.cwd(), checks = [];
const partner = await loadPinnedPartner(process.env.MC_MYFACTORY_COMPATIBILITY_GIT);
let db, server;
async function check(name, action) { await action(); checks.push(name); console.log(`PASS ${name}`); }
try {
  db = await startFixtureDatabase(repo);
  const s = db.seed, f = makeFixture(s, partner), scope = { projectId: s.projectId };
  const mut = (name, args, client = db.owner) => client.mutation(`factory/enterpriseCompatibility:${name}`, { ...scope, ...args }, { skipQueue: true });
  const query = (name, args, client = db.owner) => client.query(`factory/enterpriseCompatibility:${name}`, { ...scope, ...args });
  const registrationArgs = { factoryDefinitionId: s.factoryDefinitionId, config: f.config };
  await check("registry registration is durable, duplicate-safe, initially unqualified", async () => {
    const ids = await Promise.all([mut("register", registrationArgs), mut("register", registrationArgs)]);
    assert.equal(ids[0], ids[1]);
    const r = await query("getRegistry", { factoryDefinitionId: s.factoryDefinitionId });
    assert.equal(r.qualification, "UNQUALIFIED"); assert.equal(r.health, "UNKNOWN");
    await assert.rejects(mut("register", { ...registrationArgs, config: { ...f.config, capacity: 3 } }), /CONFLICT/);
    await mut("register", { factoryDefinitionId: s.nativeFactoryId, config: { ...f.config, kind: "MISSIONCONTROL_NATIVE",
      factoryId: "native-fixture", factoryVersion: "factory-v1-native-fixture", definitionVersionId: s.nativeVersionId, capabilities: ["NATIVE_EXECUTION"] } });
  });
  const base = { missionId: s.missionId, factoryDefinitionId: s.factoryDefinitionId, binding: f.binding };
  await check("registration alone grants no admission", async () => { await assert.rejects(mut("admitTrial", base), /UNAVAILABLE/); });
  await mut("initializeBudget", { missionId: s.missionId });
  const assessment = { factoryDefinitionId: s.factoryDefinitionId, expectedRevision: 1, health: "HEALTHY",
    evidenceDigest: "sha256:" + "a".repeat(64), validUntil: Date.now() + 600000, revoke: false };
  await mut("assess", assessment);
  await check("stale registry revision and unsigned owner access denied", async () => {
    await assert.rejects(mut("assess", assessment), /UNAVAILABLE/);
    await assert.rejects(query("getRegistry", { factoryDefinitionId: s.factoryDefinitionId }, db.anonymous), /UNAVAILABLE/);
    await assert.rejects(query("getRegistry", { factoryDefinitionId: s.factoryDefinitionId }, db.other), /UNAVAILABLE/);
    await assert.rejects(mut("admitTrial", { ...base, binding: { ...f.binding, tenantId: "wrong" } }), /UNAVAILABLE/);
    await assert.rejects(mut("admitTrial", { ...base, binding: { ...f.binding, factoryVersion: "f".repeat(64) } }), /UNAVAILABLE/);
  });
  await check("real database cancellation and expiry release only unsent allowances", async () => {
    for (const mode of ["cancel", "expire", "unknown-expire"]) {
      const suffix = mode === "cancel" ? "3" : mode === "expire" ? "4" : "5";
      const b = { ...f.binding, delegationId: `trial-${mode}`, budgetReservationId: `trial-${mode}`, maxSpendMicrousd: 1,
        partnerRequestId: `00000000-0000-4000-8000-00000000000${suffix}`, partnerWorkId: `00000000-0000-4000-8000-10000000000${suffix}`,
        expiresAt: Date.now() + 1500 };
      const id = await mut("admitTrial", { ...base, binding: b });
      if (mode === "cancel") await mut("cancelTrial", { trialId: id });
      else {
        if (mode === "unknown-expire") await mut("claimTrial", { trialId: id });
        await new Promise(r => setTimeout(r, 1600)); await mut("expireTrial", { trialId: id });
      }
      const row = await query("readTrial", { trialId: id });
      assert.equal(row.state, mode === "unknown-expire" ? "UNKNOWN" : "CANCELLED");
      assert.equal(fixtureExposure(await query("getBudget", { missionId: s.missionId })), mode === "unknown-expire" ? 1 : 0);
      if (mode === "unknown-expire") {
        const receipt = { trialId: id, revision: 1, state: "COMPLETED", partnerWorkOrderId: "expiry-wo", partnerRunId: "expiry-run", receiptDigest: "sha256:" + "e".repeat(64) };
        await assert.rejects(mut("observeTrial", receipt, db.anonymous), /public function|internal|not found/i);
        await mut("observeTrial", receipt);
        await mut("cancelTrial", { trialId: id });
        assert.equal((await query("readTrial", { trialId: id })).state, "COMPLETED");
        await assert.rejects(mut("observeTrial", { ...receipt, revision: 2, state: "CANCELLED" }), /UNAVAILABLE/);
        await mut("observeTrial", { ...receipt, revision: 2, settlement: { actualMicrousd: 0, cleanupConfirmed: true } });
      }
    }
  });
  let trialId;
  await check("real Convex concurrent duplicate admission reserves once", async () => {
    const admitted = await Promise.all(Array.from({ length: 8 }, () => mut("admitTrial", base)));
    assert.equal(new Set(admitted).size, 1); trialId = admitted[0];
    await assert.rejects(mut("admitTrial", { ...base, binding: { ...f.binding, delegationId: "renamed", budgetReservationId: "renamed" } }), /ALREADY_BOUND/);
    assert.equal(fixtureExposure(await query("getBudget", { missionId: s.missionId })), 80);
    await assert.rejects(mut("admitTrial", { ...base, binding: { ...f.binding, maxSpendMicrousd: 79 } }), /CONFLICT/);
  });
  await check("real Convex native and delegated last-budget contention", async () => {
    const attempts = await Promise.allSettled(["one", "two"].map(id => mut("reserveNativeFixture", { missionId: s.missionId, id,
      digest: "sha256:" + "b".repeat(64), maximumMicrousd: 20, expiresAt: Date.now() + 600000 })));
    assert.equal(attempts.filter(r => r.status === "fulfilled").length, 1);
    assert.equal(fixtureExposure(await query("getBudget", { missionId: s.missionId })), 100);
  });
  await check("cross-tenant reads, cancellation and duplicate admission denied", async () => {
    for (const name of ["readTrial"]) await assert.rejects(query(name, { trialId }, db.other), /UNAVAILABLE/);
    for (const name of ["claimTrial", "cancelTrial"]) await assert.rejects(mut(name, { trialId }, db.other), /UNAVAILABLE/);
    await assert.rejects(mut("admitTrial", base, db.other), /UNAVAILABLE/);
  });
  let peerState = "PREPARED", peerRevision = 1, calls = 0, drop = true, invalidResponse = false;
  server = createServer(async (req, res) => {
    try {
      const chunks = []; let bytes = 0;
      for await (const chunk of req) { bytes += chunk.length; if (bytes > 50000) throw Error("size"); chunks.push(chunk); }
      const signed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const operation = signed.envelope.operation;
      const incoming = verifyFixtureEnvelope(signed, f.requestKey, "REQUEST", { bindingDigest: factoryDelegationBindingDigest(f.binding), operation, requestDigest: null }, Date.now());
      let payload;
      if (operation === "ADMIT") {
        f.contract.parsePrepare(incoming.payload, f.binding, Date.now()); calls++;
        if (drop) { req.socket.destroy(); return; }
      }
      if (operation === "CANCEL") { peerState = "STOPPING"; peerRevision++; }
      payload = operation === "RESULT" ? f.signedResult : { revision: peerRevision, state: peerState, partnerWorkOrderId: "partner-wo", partnerRunId: "partner-run",
        ...(peerState === "CANCELLED" ? { settlement: { actualMicrousd: 30, cleanupConfirmed: true } } : {}) };
      const reply = signFixtureEnvelope({ ...incoming, keyId: f.responseKey.id, payload,
        requestDigest: canonicalDigest("factory-fixture-request/v1", signed) }, f.responseKey, "RESPONSE");
      if (invalidResponse) reply.signature = "0".repeat(64);
      res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(reply));
    } catch { res.writeHead(403); res.end('{"error":"DENIED"}'); }
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const endpoint = `http://127.0.0.1:${server.address().port}/compatibility`;
  const store = { read: () => query("readTrial", { trialId }), claim: () => mut("claimTrial", { trialId }),
    cancel: () => mut("cancelTrial", { trialId }), observe: observation => mut("observeTrial", { trialId, ...observation }) };
  const adapter = () => new MyFactoryCompatibilityAdapter({ endpoint, requestKey: f.requestKey, responseKey: f.responseKey, store, partner: f.contract });
  await check("pinned MyFactory parser rejects broadened and mismatched requests before send", async () => {
    await assert.rejects(adapter().admit({ ...f.request, unexpected: true }));
    await assert.rejects(adapter().admit({ ...f.request, maxSpendUsd: 1 }));
    assert.equal((await store.read()).state, "RESERVED"); assert.equal(calls, 0);
  });
  await check("concurrent adapter claims and lost acknowledgment produce one send and UNKNOWN", async () => {
    const outcomes = await Promise.all([adapter().admit(f.request), adapter().admit(f.request)]);
    assert.deepEqual(outcomes.sort(), ["ALREADY_CLAIMED", "UNKNOWN"]);
    assert.equal(calls, 1); assert.equal((await store.read()).state, "UNKNOWN");
    assert.equal(fixtureExposure(await query("getBudget", { missionId: s.missionId })), 100);
  });
  await check("database restart preserves claim, UNKNOWN and exact reservation", async () => {
    await db.restart();
    assert.equal((await store.read()).state, "UNKNOWN");
    assert.equal(await adapter().admit(f.request), "ALREADY_CLAIMED"); assert.equal(calls, 1);
    assert.equal(fixtureExposure(await query("getBudget", { missionId: s.missionId })), 100);
  });
  await check("authenticated readback reconciles original admission without another send", async () => {
    drop = false; assert.equal(await adapter().status(), "OBSERVED");
    assert.equal((await store.read()).state, "PREPARED"); assert.equal(calls, 1);
    assert.equal(await adapter().status(), "OBSERVED");
  });
  await check("invalid response authentication remains UNKNOWN without overwriting durable observation", async () => {
    invalidResponse = true; assert.equal(await adapter().status(), "UNKNOWN"); invalidResponse = false;
    assert.equal((await store.read()).state, "PREPARED");
  });
  await check("exact pinned Result verifier authenticates artifacts; PASS does not accept enterprise work", async () => {
    const result = await adapter().result();
    assert.equal(result.producerOutcome, "COMPLETED"); assert.equal(result.independentVerification, "PASS");
    assert.equal(result.enterpriseQualityGate, "NOT_EVALUATED"); assert.equal(result.humanAcceptance, "PENDING"); assert.equal(result.publication, "NOT_AUTHORIZED");
    const identity = { workOrderId: "partner-wo", runId: "partner-run" };
    assert.throws(() => mapPartnerResult({ ...f.signedResult, signature: "a".repeat(86) }, f.binding, f.contract, identity, Date.now()));
    const swapped = structuredClone(f.signedResult); swapped.artifacts[0].base64 = Buffer.from("substituted").toString("base64");
    assert.throws(() => mapPartnerResult(swapped, f.binding, f.contract, identity, Date.now()));
    for (const field of ["partnerRequestDigest", "baseTree", "verificationPolicyDigest", "executionProfileDigest", "modelPolicyDigest"])
      assert.throws(() => mapPartnerResult(f.signedResult, { ...f.binding, [field]: "mismatch" }, f.contract, identity, Date.now()));
    f.resultKeys[0].revokedAt = new Date().toISOString();
    assert.throws(() => mapPartnerResult(f.signedResult, f.binding, f.contract, identity, Date.now())); delete f.resultKeys[0].revokedAt;
  });
  await check("revocation fences new admission while stop and reconciliation remain available", async () => {
    await mut("assess", { ...assessment, expectedRevision: 2, revoke: true });
    await assert.rejects(mut("admitTrial", base), /UNAVAILABLE/);
    await assert.rejects(mut("assess", { ...assessment, expectedRevision: 3 }), /UNAVAILABLE/);
    assert.equal(await adapter().cancel(), "OBSERVED");
    assert.equal((await store.read()).state, "STOPPING");
    assert.equal(fixtureExposure(await query("getBudget", { missionId: s.missionId })), 100);
  });
  await check("observed cleanup settles once; duplicate settlement cannot free money twice", async () => {
    peerState = "CANCELLED"; peerRevision++;
    assert.equal(await adapter().status(), "OBSERVED"); assert.equal((await store.read()).closed, true);
    assert.equal(fixtureExposure(await query("getBudget", { missionId: s.missionId })), 50);
    assert.equal(await adapter().status(), "OBSERVED"); assert.equal(fixtureExposure(await query("getBudget", { missionId: s.missionId })), 50);
    peerRevision++; assert.equal(await adapter().status(), "UNKNOWN");
  });
  const result = { checkpoint: "1B", fixtureOnly: true, checks, database: "actual Convex schema and handlers on disposable local backend",
    compatibility, paidOperations: 0, productionIntegration: "NOT_RUN", endpointCalls: calls, remaining: "canonical runtime integration and independent production security qualification" };
  if (process.env.MC_COMPATIBILITY_EVIDENCE) await writeFile(resolve(process.env.MC_COMPATIBILITY_EVIDENCE), JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result));
} finally {
  if (server) { server.closeAllConnections(); server.close(); }
  if (db) await db.stop();
  await rm(partner.root, { recursive: true, force: true });
}
