import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash, createHmac } from "node:crypto";
import { canonicalServiceCommand } from "../../packages/shared/src/serviceCommandEnvelope.ts";
import { enterpriseDigest } from "../../packages/shared/src/sofieEnterprise.ts";

export async function prepareOwnerReviewFixture(db) {
  const s = db.seed,
    checks = [],
    secret = randomBytes(32).toString("hex");
  const mutate = (name, args, client = db.owner) =>
    client.mutation(name, args, { skipQueue: true });
  db.setEnvironment("MC_SOFIE_READINESS_ENVIRONMENT_ID", s.environmentId);
  db.setEnvironment("MC_SOFIE_APPLICATION_SECRET", secret);
  db.setEnvironment("MC_SOFIE_APPLICATION_OWNER_ID", s.operatorId);
  db.setEnvironment(
    "MC_SOFIE_APPLICATION_KEY_ID",
    "owner-review-qualification",
  );
  const connection = await mutate("sofieEnterprise:connect", {
    projectId: s.projectId,
    ownerMemberId: s.memberId,
    owningTeamId: s.teamId,
    expiresAt: Date.now() + 600000,
  });
  async function command(input) {
    const payloadJson = JSON.stringify({
        ...input,
        connectionId: connection.connectionId,
      }),
      now = Date.now();
    const envelope = {
      serviceId: "myeve-sofie-readiness-v1",
      capability: input.operation,
      projectId: s.projectId,
      repositoryId: "connection:" + connection.connectionId,
      commandId: randomUUID(),
      issuedAt: now,
      expiresAt: now + 60000,
      payloadDigest:
        "sha256=" + createHash("sha256").update(payloadJson).digest("hex"),
    };
    return db.anonymous.action("sofieEnterprise:command", {
      payloadJson,
      envelope: {
        ...envelope,
        signature:
          "sha256=" +
          createHmac("sha256", secret)
            .update(canonicalServiceCommand(envelope))
            .digest("hex"),
      },
    });
  }
  let proposal, binding, missionId;
  const input = {
    operation: "enterprise.propose",
    intentKey: "checkpoint-h-linked-hr",
    proposal: {
      title: "Build an Agentic HR platform",
      objective:
        "Qualify native and delegated enterprise work with independent evidence.",
      workstreams: ["Employee core", "Recruiting", "Integration"],
      milestones: ["Review", "Execute", "Verify"],
      stopCondition: "Stop at owner acceptance. No production or publication.",
      budgetMicrousd: 0,
    },
  };
  async function propose() {
    proposal = (await command(input)).response;
    binding = {
      projectId: s.projectId,
      proposalId: proposal.proposalId,
      expectedDigest: proposal.digest,
    };
    for (const client of [db.anonymous, db.peer, db.other]) {
      await assert.rejects(() =>
        mutate("sofieOwnerReview:inspect", binding, client),
      );
      await assert.rejects(() =>
        mutate(
          "sofieEnterprise:decide",
          {
            ...binding,
            connectionId: connection.connectionId,
            decision: "AUTHORIZE_DRAFT",
          },
          client,
        ),
      );
    }
    await assert.rejects(() =>
      mutate("sofieOwnerReview:inspect", {
        ...binding,
        expectedDigest: "sha256:" + "0".repeat(64),
      }),
    );
    await assert.rejects(() =>
      command({
        operation: "enterprise.submit",
        proposalId: proposal.proposalId,
        proposalDigest: proposal.digest,
      }),
    );
    assert.equal(
      (await mutate("sofieOwnerReview:inspect", binding)).status,
      "PENDING",
    );
    checks.push(
      "anonymous-cross-owner-cross-tenant-and-wrong-digest-denied",
      "service-cannot-self-authorize",
    );
    return proposal;
  }
  async function createMission(args) {
    if (missionId)
      return {
        mission: (await db.owner.query("missions:get", { missionId })).mission,
        created: false,
      };
    await mutate("sofieEnterprise:decide", {
      ...binding,
      connectionId: connection.connectionId,
      decision: "AUTHORIZE_DRAFT",
    });
    const receipts = await Promise.all(
      Array.from({ length: 3 }, () =>
        command({
          operation: "enterprise.submit",
          proposalId: proposal.proposalId,
          proposalDigest: proposal.digest,
        }),
      ),
    );
    assert.equal(new Set(receipts.map((r) => r.response.missionId)).size, 1);
    missionId = receipts[0].response.missionId;
    const { metadata, executionEnvironment, ...draft } = args;
    await mutate("missions:updateDraft", {
      ...draft,
      missionId,
      idempotencyKey: "linked-fixture-scope",
    });
    const original = await db.owner.query("nativeFixture:inspectRecord", {
      id: missionId,
    });
    // The existing delegated fixture requires this isolated workload tag, not an authorization grant.
    await mutate("nativeFixture:fault", {
      id: missionId,
      patch: {
        metadata: {
          ...original.metadata,
          enterpriseCompatibilityFixture: true,
        },
        executionEnvironment: "LOCAL",
      },
      unset: [],
    });
    const review = await mutate("sofieOwnerReview:inspect", binding);
    assert.equal(review.missionId, missionId);
    assert.equal(review.status, "CREATED");
    checks.push(
      "concurrent-submissions-one-canonical-Mission",
      "proposal-Mission-identity-bound",
    );
    return {
      mission: (await db.owner.query("missions:get", { missionId })).mission,
      created: true,
    };
  }
  async function accept(id) {
    assert.equal(id, missionId);
    const review = await mutate("sofieOwnerReview:inspect", binding);
    assert.equal(review.result.status, "AVAILABLE");
    assert.equal(review.result.workOrders.length, 3);
    const reject = process.env.MC_OWNER_REVIEW_DECISION === "REJECT";
    const args = {
      ...binding,
      missionId,
      expectedPlanDigest: review.result.plan.planDigest,
      expectedResultDigest: review.resultDigest,
      decision: reject ? "REJECT" : "ACCEPT",
      reason: reject ? "Owner requires a revised enterprise outcome." : "",
      idempotencyKey: randomUUID(),
    };
    for (const client of [db.anonymous, db.peer, db.other])
      await assert.rejects(() =>
        mutate("sofieOwnerReview:decideResult", args, client),
      );
    for (const patch of [
      { expectedPlanDigest: "sha256:" + "0".repeat(64) },
      { expectedResultDigest: "sha256:" + "0".repeat(64) },
      { missionId: s.otherProjectId },
    ])
      await assert.rejects(() =>
        mutate("sofieOwnerReview:decideResult", { ...args, ...patch }),
      );
    await mutate("sofieOwnerReview:authorizeResultRead", {
      ...binding,
      missionId,
      expectedPlanDigest: args.expectedPlanDigest,
    });
    assert.equal(
      (
        await command({
          operation: "enterprise.result",
          missionId,
          expectedPlanDigest: args.expectedPlanDigest,
        })
      ).response.status,
      "AVAILABLE",
    );
    await assert.rejects(() =>
      mutate("sofieOwnerReview:decideResult", {
        ...args,
        decision: "REJECT",
        reason: "",
      }),
    );
    await mutate("sofieOwnerReview:authorizeResultRead", { ...binding, missionId, expectedPlanDigest: args.expectedPlanDigest });
    const readAudits = (await db.owner.query("missions:get", { missionId })).events.filter(e => e.eventType === "SOFIE_RESULT_READ_AUTHORIZED");
    assert.equal(readAudits.length, 1); assert.equal(readAudits[0].actorId, s.operatorId);
    const decisions = await Promise.all([
      mutate("sofieOwnerReview:decideResult", args),
      mutate("sofieOwnerReview:decideResult", args),
    ]);
    assert.equal(decisions.filter((r) => r.created).length, 1);
    await assert.rejects(() =>
      mutate("sofieOwnerReview:decideResult", {
        ...args,
        decision: "REJECT",
        reason: "Changed replay",
      }),
    );
    const after = await mutate("sofieOwnerReview:inspect", binding);
    assert.equal(after.result.ownerAcceptance, reject ? "PENDING" : "ACCEPTED");
    assert.equal(after.result.status, reject ? "NOT_AVAILABLE" : "AVAILABLE");
    const readback = await command({
      operation: "enterprise.result",
      missionId,
      expectedPlanDigest: args.expectedPlanDigest,
    });
    assert.equal(
      readback.response.ownerAcceptance,
      reject ? "PENDING" : "ACCEPTED",
    );
    const events = (await db.owner.query("missions:get", { missionId })).events;
    assert.equal(
      events.filter((e) => e.eventType === "OWNER_RESULT_" + args.decision)
        .length,
      1,
    );
    assert.equal(
      events.find((e) => e.eventType === "OWNER_RESULT_" + args.decision)
        .actorId,
      s.operatorId,
    );
    checks.push(
      "current-three-WorkOrder-Result-bound",
      "wrong-owner-Mission-Plan-Result-denied",
      "concurrent-owner-decision-one-audit",
      "conflicting-replay-denied",
      reject
        ? "Sofie-canonical-rejected-readback"
        : "Sofie-canonical-accepted-readback",
    );
    return {
      mission: (await db.owner.query("missions:get", { missionId })).mission,
      created: true,
    };
  }
  return {
    propose,
    createMission,
    accept,
    report: () => ({
      status: "PASS",
      checks,
      proposalId: proposal?.proposalId,
      missionId,
      authentication: "SYNTHETIC_API_FIXTURE",
      browserOwnerJourney: "NOT_RUN",
      releaseGate: "ADVISORY",
    }),
  };
}
