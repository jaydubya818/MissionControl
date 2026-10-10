import assert from 'node:assert/strict';
import { evaluateMissionSpecQuality } from '../../convex/lib/missionSpec.js';

export async function finalizeHybridSpec({ mutate, step, projectId, missionId, repositoryId, scopeId }: any) {
  const constitution = { summary: 'Isolated execution requires exact intent, independent verification and authoritative settlement.',
    principles: [{ id: 'PRINCIPLE-001', title: 'Evidence before acceptance', description: 'Execution success alone never establishes acceptance.', category: 'TESTING' }],
    requiredSpecSections: ['NON_GOALS', 'CONSTRAINTS', 'RISKS', 'SOURCES'],
    checklistItems: [{ id: 'CHECK-001', title: 'Independent verification', description: 'Each candidate has a separate verifier and exact immutable evidence.',
      classification: 'EVIDENCE_BEARING_VERIFICATION', required: true }] };
  const spec: any = {
    problem: 'Native and delegated execution lack a composed deterministic Mission qualification.',
    outcome: 'One Mission accepts three independently verified WorkOrders with exact provenance and settled allowances.',
    measurableOutcomes: [{ id: 'OUTCOME-001', description: 'Complete the bounded hybrid Mission', metric: 'Accepted and settled WorkOrders', target: '3' }],
    personas: [{ id: 'PERSONA-001', name: 'Mission owner', needs: 'Exact execution and accounting evidence' }],
    userStories: [{ id: 'STORY-001', personaId: 'PERSONA-001', title: 'Qualify composed execution', outcome: 'Inspect three immutable candidate proofs and authoritative settlements.', priority: 'P0',
      scenarios: [{ id: 'SCENARIO-001', given: 'Approved native and delegated scope', when: 'Each producer and separate verifier execute', then: 'Only current evidence and settled allowances permit acceptance.' }] }],
    requirements: [{ id: 'REQ-001', title: 'Composed deterministic proof', description: 'Execute native, delegated, and downstream integration WorkOrders with separate verification and exact accounting settlement.', priority: 'MUST', sourceStoryIds: ['STORY-001'] }],
    nonFunctionalRequirements: [],
    acceptanceExpectations: [{ id: 'AC-001', title: 'Exact hybrid Mission', description: 'All three WorkOrders have immutable candidates, independent verification, current enterprise gates and zero outstanding proven exposure.', requirementIds: ['REQ-001'], verificationExpectationIds: ['VERIFY-001'] }],
    verificationExpectations: [{ id: 'VERIFY-001', title: 'Independent candidate verification', description: 'Run separate deterministic verifiers against exact candidate bytes or protected MyFactory checks.', method: 'TEST', category: 'CONTRACT_TEST', evidenceCategory: 'TEST_RESULT', acceptanceExpectationIds: ['AC-001'], checklistItemIds: ['CHECK-001'], mandatory: true }],
    definitionOfDone: [{ id: 'DOD-001', description: 'Three accepted WorkOrders, two predecessor handoffs and downstream proof, with settled authoritative allowances.', acceptanceExpectationIds: ['AC-001'] }],
    constraints: [{ id: 'CONSTRAINT-001', description: 'Only the exact admitted synthetic repository and pinned local runtimes may execute.' }],
    nonGoals: [{ id: 'NONGOAL-001', description: 'Publication, deployment, paid inference, or external-alpha changes.' }],
    risks: [{ id: 'RISK-001', description: 'Execution success could be mistaken for enterprise acceptance.', severity: 'HIGH', mitigation: 'Evaluate canonical enterprise gates separately from execution.' }],
    edgeCases: [{ id: 'EDGE-001', description: 'An execution acknowledgement is lost.', expectedBehavior: 'Recover durable state without redispatch.' }],
    repositoryScope: { repositoryId, codeScopeIds: [scopeId] },
    sources: [{ id: 'SOURCE-001', kind: 'DOC', label: 'Approved successor qualification', location: 'docs/enterprise-factory/NATIVE_SUCCESSOR_PLAN.md' }],
    clarifications: [], checklistDispositions: [{ checklistItemId: 'CHECK-001', classification: 'EVIDENCE_BEARING_VERIFICATION', disposition: 'SATISFIED', reason: 'VERIFY-001 requires exact independent candidate evidence.' }],
  };
  const quality = evaluateMissionSpecQuality({ spec, constitution: constitution as any });
  assert.equal(quality.result, 'PASS', JSON.stringify(quality));
  await mutate('featureFlags:setFlag', { projectId, key: 'missions.spec-intake-v1', enabled: true });
  await step('hybridConstitution', () => mutate('missionSpecs:createConstitutionRevision', { projectId, title: 'Isolated hybrid execution qualification',
    content: constitution, activate: true, idempotencyKey: 'hybrid-constitution' }));
  const saved = await step('hybridSpec', () => mutate('missionSpecs:saveMissionSpecRevision', { projectId, missionId, content: spec, idempotencyKey: 'hybrid-spec' }));
  const evaluated = await step('hybridSpecEvaluation', () => mutate('missionSpecs:evaluateMissionSpecRevision', { projectId, missionId, revisionId: saved.revision._id, idempotencyKey: 'hybrid-spec-evaluation' }));
  assert.equal(evaluated.evaluation.result, 'PASS');
  await step('hybridSpecFinalization', () => mutate('missionSpecs:finalizeMissionSpecRevision', { projectId, missionId, revisionId: saved.revision._id,
    evaluationId: evaluated.evaluation._id, rationale: 'Exact isolated three-WorkOrder qualification scope.', idempotencyKey: 'hybrid-spec-finalization' }));
}
