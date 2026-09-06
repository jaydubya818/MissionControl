import { describe, it, expect } from "vitest";
import { parseLocalRepositoryAdmission, assertLocalRepositoryScope, localRepositoryAdmissionDigest,
  assertRepositoryPublicationAllowed, assertLocalRepositoryHost, type LocalRepositoryAdmission } from "../lib/localRepositoryAdmission";
import { evaluateFactoryDispatchPreflight, evaluateLocalQualificationDispatchPreflight } from "../lib/factoryDispatch";
const now = 1000;
const admission: LocalRepositoryAdmission = {
  schema: "local-synthetic-repository-admission/v1", mode: "LOCAL_SYNTHETIC_QUALIFICATION", program: "unpublished-handoff-fixture/v1",
  tenantId: "tenant", projectId: "project", engagementId: "project", operatorId: "operator", environmentId: "environment",
  hostId: "host", fixtureId: "fixture", root: `/private/tmp/mc-local-qualification-${"a".repeat(32)}/repository`,
  baselineCommit: "b".repeat(40), baselineTree: "c".repeat(40), fixtureContentDigest: `sha256:${"d".repeat(64)}`,
  expiresAt: 10000, publicationAuthority: "NONE", productionAuthority: "NONE",
};
const metadata = { schema: admission.program, synthetic: true, productionAuthority: false };
function scope() { return { admission, actorId: "operator",
  project: { _id: "project", tenantId: "tenant", slug: "synthetic-unpublished-handoff", metadata },
  tenant: { _id: "tenant", active: true, slug: "synthetic-handoff-qualification", metadata },
  operator: { _id: "operator", tenantId: "tenant", active: true, authId: "user_SyntheticHandoffQualification", metadata },
  environment: { _id: "environment", tenantId: "tenant", type: "dev", metadata: {
    schema: "factory-qualification-environment/v1", synthetic: true, projectId: "project" } },
}; }
describe("local repository admission contract controls (not execution evidence)", () => {
  it("requires the exact configured shape and approved synthetic scope", () => {
    expect(parseLocalRepositoryAdmission(JSON.stringify(admission), now)).toEqual(admission);
    expect(assertLocalRepositoryScope(scope())).toEqual(localRepositoryAdmissionDigest(admission));
  });
  it.each([undefined, "{}", JSON.stringify({ ...admission, expiresAt: now }), JSON.stringify({ ...admission, mode: "GITHUB" }),
    JSON.stringify({ ...admission, engagementId: "other" }), JSON.stringify({ ...admission, publicationAuthority: "PASS" }),
    JSON.stringify({ ...admission, productionAuthority: "PASS" }), JSON.stringify({ ...admission, bypass: true })])("rejects unadmitted configuration %s", value => {
    expect(() => parseLocalRepositoryAdmission(value, now)).toThrow();
  });
  it.each(["/Users/operator", "/private/tmp/source", admission.root + "/../repository", "/tmp/" + admission.root.slice(13), "/Users/operator/MissionControl"])("rejects arbitrary or escaped root %s", root => {
    expect(() => parseLocalRepositoryAdmission(JSON.stringify({ ...admission, root }), now)).toThrow();
  });
  it.each(["PRODUCTION", "production", "staging"])("denies environment %s", type => {
    const s = scope(); s.environment.type = type; expect(() => assertLocalRepositoryScope(s)).toThrow();
  });
  it("rejects wrong operator, workspace and engagement independently", () => {
    expect(() => assertLocalRepositoryScope({ ...scope(), actorId: "other" })).toThrow();
    const s = scope(); s.project._id = "other"; expect(() => assertLocalRepositoryScope(s)).toThrow();
    expect(() => parseLocalRepositoryAdmission(JSON.stringify({ ...admission, engagementId: "other" }), now)).toThrow();
  });
  it.each(["publication", "PR", "merge", "release", "production"])("never grants %s", () => {
    expect(() => assertRepositoryPublicationAllowed({ provider: "LOCAL", repositoryMode: admission.mode })).toThrow();
    expect(() => assertRepositoryPublicationAllowed({ provider: "GITHUB", repositoryMode: admission.mode })).toThrow();
    expect(() => assertRepositoryPublicationAllowed({ provider: "GITHUB" })).not.toThrow();
  });
  it("rejects mutated admission even with the previous digest", () => {
    const s: any = scope(); s.environment.metadata.repositoryId = "repo";
    s.repository = { _id: "repo", provider: "LOCAL", repositoryMode: admission.mode, projectId: "project", tenantId: "tenant",
      repository: "local-qualification/fixture", localAdmission: admission, localAdmissionDigest: localRepositoryAdmissionDigest(admission) };
    expect(() => assertLocalRepositoryScope(s)).not.toThrow();
    s.repository.localAdmission = { ...admission, baselineCommit: "e".repeat(40) };
    expect(() => assertLocalRepositoryScope(s)).toThrow();
  });
  it("requires fresh exact host observation", () => {
    const digest = localRepositoryAdmissionDigest(admission);
    const host = { projectId: "project", hostId: "host", checkoutRoot: admission.root, status: "READY", dirty: false,
      baseCommit: admission.baselineCommit, localQualificationObservation: { admissionDigest: digest, root: admission.root,
        baselineCommit: admission.baselineCommit, baselineTree: admission.baselineTree, fixtureContentDigest: admission.fixtureContentDigest,
        noRemotes: true, observedAt: now } };
    expect(() => assertLocalRepositoryHost(admission, digest, host, now)).not.toThrow();
    expect(() => assertLocalRepositoryHost(admission, digest, host, now + 60001)).toThrow();
    expect(() => assertLocalRepositoryHost(admission, digest, { ...host, baseCommit: "e".repeat(40) }, now)).toThrow();
    for (const observedAt of [Number.NaN, Number.POSITIVE_INFINITY, -1, 1.5]) {
      expect(() => assertLocalRepositoryHost(admission, digest, {
        ...host,
        localQualificationObservation: { ...host.localQualificationObservation, observedAt },
      }, now)).toThrow();
    }
  });
  it("keeps GitHub admission fail-closed and requires every common local gate", () => {
    const ready: any = Object.fromEntries(["factoryRequired", "versionProvided", "definitionActive", "versionIsActive", "assessmentPasses",
      "assessmentCurrent", "digestMatches", "repositoryReady", "repositoryPolicyReady", "remoteEgressPolicyReady", "workflowMatches",
      "workflowContractReady", "executorReady", "executionProfileReady", "codeScopesReady", "agentManifestsReady", "policyReady", "verifiersReady",
      "hostReady", "budgetReady", "recoveryReady", "worktreeProvided"].map(key => [key, true]));
    const digest = localRepositoryAdmissionDigest(admission);
    ready.repositoryAdmission = { mode: admission.mode, digest, frozenDigest: digest, current: true, publicationAuthority: "NONE", productionAuthority: "NONE" };
    expect(evaluateFactoryDispatchPreflight({ ...ready, githubReady: false }).ok).toBe(false);
    expect(evaluateLocalQualificationDispatchPreflight(ready).ok).toBe(true);
    for (const key of Object.keys(ready).filter(key => key !== "repositoryAdmission" && key !== "factoryRequired")) {
      expect(evaluateLocalQualificationDispatchPreflight({ ...ready, [key]: false }).ok, key).toBe(false);
    }
  });
});
