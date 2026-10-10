import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  capabilityRegistry, createRegistry, resolveCapabilities,
} from '../src/index.ts';

const now = 1_800_000_000_000;
function snapshot(overrides = {}) {
  return {
    registryVersion: capabilityRegistry.version,
    scope: { ownerId: 'owner-1', organizationId: 'org-1', installationId: 'dev-1', environment: 'qualification' },
    revision: 4, observedAt: now - 100, expiresAt: now + 60_000,
    preferences: {}, ordinaryDefaults: {}, facts: {},
    platformOwnerPolicy: {
      id: 'policy-1', revision: 1, ownerId: 'owner-1', organizationId: 'org-1',
      installationId: 'dev-1', environment: 'qualification', status: 'ACTIVE',
      administrationRecordId: 'admin-record-1', membershipRecordId: 'membership-1',
      installationRecordId: 'installation-record-1', auditRecordId: 'audit-1',
      expiresAt: now + 60_000,
    },
    ...overrides,
  };
}
function resolve(value) {
  return Object.fromEntries(resolveCapabilities(capabilityRegistry, value, now).map(item => [item.id, item]));
}
function readyFacts() {
  return Object.fromEntries(capabilityRegistry.capabilities.map(capability => [capability.id, {
    supported: true, deployed: true, entitled: true, administrator: 'ALLOW',
    setup: Object.fromEntries(capability.setupRequirements.map(key => [key, true])),
    qualification: Object.fromEntries(capability.qualificationRequirements.map(key => [key, 'QUALIFIED'])),
    lifecycle: 'ACTIVE',
    ...(capability.id === 'deepagents' ? { selectedAlternative: 'sofie.local-harness' } : {}),
  }]));
}
function authority(overrides = {}) {
  return {
    ownerId: 'owner-1', organizationId: 'org-1', installationId: 'dev-1', environment: 'qualification',
    workId: 'work-1', workVersion: 1, workGeneration: 2, agentId: 'agent-1',
    policyRevision: 4, grantRevision: 3, currentGrantRevision: 3,
    capabilities: capabilityRegistry.capabilities.map(item => item.id),
    permissions: [...new Set(capabilityRegistry.capabilities.flatMap(item => item.requiredPermissions))],
    status: 'ACTIVE', approval: 'APPROVED', expiresAt: now + 30_000,
    budget: { limitMicros: 0, reservedMicros: 0, spentMicros: 0, requestedMicros: 0, exposure: 'KNOWN' },
    ...overrides,
  };
}
function executionSnapshot(overrides = {}) {
  return snapshot({ facts: readyFacts(), authority: authority(),
    requestedWork: { workId: 'work-1', workVersion: 1, workGeneration: 2, agentId: 'agent-1' }, ...overrides });
}

test('all requested capabilities and categories have versioned descriptors', () => {
  const required = ['sofie.chat', 'sofie.native', 'sofie.local-harness', 'sofie.cloud-harness',
    'deepagents', 'agents.persistent', 'agents.subagents', 'role-packs', 'myskills', 'memory',
    'computer', 'routines', 'email', 'connected-apps', 'relay', 'myfactory', 'missioncontrol',
    'myapps', 'files', 'goals', 'tasks', 'work', 'inbox', 'proof-of-work', 'publication', 'diagnostics'];
  const ids = capabilityRegistry.capabilities.map(item => item.id);
  assert.ok(required.every(id => ids.includes(id)));
  assert.equal(new Set(capabilityRegistry.capabilities.map(item => item.group)).size, 7);
  for (const descriptor of capabilityRegistry.capabilities) {
    for (const field of ['id', 'version', 'owningSystem', 'description', 'revocationBehavior']) assert.ok(descriptor[field]);
    for (const field of ['dependencies', 'environments', 'requiredPermissions', 'setupRequirements', 'qualificationRequirements']) assert.ok(Array.isArray(descriptor[field]));
  }
});

test('platform-owner defaults enable every preference while missing facts deny execution', () => {
  for (const item of Object.values(resolve(snapshot()))) {
    assert.equal(item.preference, 'ENABLED');
    assert.equal(item.preferenceSource, 'PLATFORM_OWNER_POLICY');
    assert.equal(item.admissionEligible, false);
    assert.equal(item.authority, 'NOT_GRANTED');
  }
});

test('enabled but unqualified capabilities disclose the exact limitation', () => {
  const facts = readyFacts();
  facts.missioncontrol.qualification = {};
  const item = resolve(snapshot({ facts })).missioncontrol;
  assert.equal(item.preference, 'ENABLED');
  assert.equal(item.readiness, 'QUALIFICATION_REQUIRED');
  assert.equal(item.label, 'ENABLED — SETUP OR QUALIFICATION REQUIRED');
  assert.equal(item.admissionEligible, false);
});

test('disabling MissionControl leaves MyFactory and Sofie Native enabled', () => {
  const items = resolve(snapshot({ preferences: { missioncontrol: 'DISABLED' } }));
  assert.equal(items.missioncontrol.preference, 'DISABLED');
  assert.equal(items.myfactory.preference, 'ENABLED');
  assert.equal(items['sofie.native'].preference, 'ENABLED');
  assert.equal(resolve(snapshot({ preferences: { missioncontrol: 'ENABLED' } })).missioncontrol.preference, 'ENABLED');
});

test('ordinary owners have no default enterprise execution and can configure preferences', () => {
  const items = resolve(snapshot({ platformOwnerPolicy: undefined, preferences: { memory: 'ENABLED', myfactory: 'ENABLED', myskills: 'ENABLED', computer: 'ENABLED', 'agents.persistent': 'ENABLED' } }));
  assert.equal(items.missioncontrol.preference, 'DISABLED');
  for (const id of ['memory', 'myfactory', 'myskills', 'computer', 'agents.persistent']) assert.equal(items[id].preference, 'ENABLED');
  assert.ok(Object.values(items).every(item => !item.admissionEligible));
});

for (const [field, value] of Object.entries({ ownerId: 'other', organizationId: 'other', installationId: 'other',
  environment: 'development', status: 'REVOKED', expiresAt: now, administrationRecordId: '', membershipRecordId: '', installationRecordId: '', auditRecordId: '' })) {
  test(`platform defaults reject mismatched or missing policy evidence: ${field}`, () => {
    const valueSnapshot = snapshot();
    valueSnapshot.platformOwnerPolicy[field] = value;
    assert.equal(resolve(valueSnapshot).missioncontrol.preference, 'DISABLED');
  });
}
test('platform-owner override never applies in production', () => {
  const value = snapshot();
  value.scope.environment = 'production';
  value.platformOwnerPolicy.environment = 'production';
  assert.equal(resolve(value).missioncontrol.preference, 'DISABLED');
});

for (const [field, value] of Object.entries({ supported: false, deployed: false, entitled: false, administrator: 'DENY' })) {
  test(`platform-owner preference cannot override ${field}`, () => {
    const facts = readyFacts(); facts.missioncontrol[field] = value;
    const item = resolve(executionSnapshot({ facts })).missioncontrol;
    assert.equal(item.preference, 'ENABLED');
    assert.equal(item.admissionEligible, false);
    assert.equal(item.availability, 'UNAVAILABLE');
  });
}

test('fully qualified exact Work is eligible but resolver returns no executable credential', () => {
  const item = resolve(executionSnapshot()).missioncontrol;
  assert.equal(item.admissionEligible, true);
  assert.equal(item.authority, 'AUTHORIZED');
  assert.equal(item.policyRevision, 4);
  assert.equal('token' in item, false);
});

test('enabling a parent cannot enable or authorize its dependencies', () => {
  const value = executionSnapshot({ preferences: { 'sofie.local-harness': 'DISABLED', 'sofie.cloud-harness': 'DISABLED' } });
  const item = resolve(value).deepagents;
  assert.equal(item.preference, 'ENABLED');
  assert.equal(item.admissionEligible, false);
  assert.ok(item.reasons.some(reason => reason.startsWith('DEPENDENCY:')));
});

for (const [field, value] of Object.entries({ ownerId: 'other', organizationId: 'other', installationId: 'other',
  environment: 'production', workId: 'other', workVersion: 2, workGeneration: 1, agentId: 'other',
  policyRevision: 3, grantRevision: 2, status: 'REVOKED', expiresAt: now, permissions: [], capabilities: [] })) {
  test(`authority is bounded by current scoped Work: ${field}`, () => {
    assert.equal(resolve(executionSnapshot({ authority: authority({ [field]: value }) })).missioncontrol.admissionEligible, false);
  });
}

test('pending approval remains pending and grants no admission', () => {
  const item = resolve(executionSnapshot({ authority: authority({ approval: 'PENDING_APPROVAL' }) })).missioncontrol;
  assert.equal(item.authority, 'PENDING_APPROVAL');
  assert.equal(item.admissionEligible, false);
});
test('missing credentials and failed qualification do not become operational', () => {
  const facts = readyFacts(); facts.missioncontrol.setup = {}; facts.myapps.qualification = {};
  const items = resolve(executionSnapshot({ facts }));
  assert.equal(items.missioncontrol.readiness, 'SETUP_REQUIRED');
  assert.equal(items.myapps.readiness, 'QUALIFICATION_REQUIRED');
  assert.equal(items.missioncontrol.admissionEligible, false);
});
for (const state of ['PAUSED', 'REVOKED']) {
  test(`${state} blocks even approved exact Work`, () => {
    const facts = readyFacts(); facts.missioncontrol.lifecycle = state;
    const item = resolve(executionSnapshot({ facts })).missioncontrol;
    assert.equal(item.lifecycle, state);
    assert.equal(item.admissionEligible, false);
  });
}

for (const budget of [
  { limitMicros: 10, reservedMicros: 5, spentMicros: 5, requestedMicros: 1, exposure: 'KNOWN' },
  { limitMicros: 10, reservedMicros: 0, spentMicros: 0, requestedMicros: 0, exposure: 'UNKNOWN' },
  { limitMicros: 10, reservedMicros: 0, spentMicros: -1, requestedMicros: 0, exposure: 'KNOWN' },
  { limitMicros: Infinity, reservedMicros: 0, spentMicros: 0, requestedMicros: 0, exposure: 'KNOWN' },
]) test('invalid, unknown or exceeded budget denies admission', () => {
  assert.equal(resolve(executionSnapshot({ authority: authority({ budget }) })).missioncontrol.admissionEligible, false);
});

test('subagent authority must be a current subset of its parent Work', () => {
  const child = authority({ agentId: 'child', parentAgentId: 'agent-1' });
  const requestedWork = { workId: 'work-1', workVersion: 1, workGeneration: 2, agentId: 'child' };
  assert.equal(resolve(executionSnapshot({ authority: child, requestedWork })).missioncontrol.admissionEligible, false);
  assert.equal(resolve(executionSnapshot({ authority: child, requestedWork, parentAuthority: authority() })).missioncontrol.admissionEligible, true);
  for (const change of [{ capabilities: ['sofie.chat'] }, { status: 'REVOKED' }, { currentGrantRevision: 4 }, { workGeneration: 1 }, { ownerId: 'other' }, { expiresAt: now - 1 }]) {
    assert.equal(resolve(executionSnapshot({ authority: child, requestedWork, parentAuthority: authority(change) })).missioncontrol.admissionEligible, false);
  }
});

for (const patch of [{ expiresAt: now }, { observedAt: now + 1 }, { registryVersion: 'unknown' }, { revision: 0 }]) {
  test('stale or inconsistent snapshots fail closed', () => {
    assert.ok(Object.values(resolve(executionSnapshot(patch))).every(item => !item.admissionEligible));
  });
}
test('registry validates unknown dependencies, cycles, duplicates, and version identity', () => {
  const descriptor = capabilityRegistry.capabilities.find(item => item.id === 'memory');
  assert.throws(() => createRegistry('1', [{ ...descriptor, dependencies: ['missing'] }]));
  assert.throws(() => createRegistry('1', [{ ...descriptor, dependencies: ['memory'] }]));
  assert.throws(() => createRegistry('1', [descriptor, descriptor]));
  assert.throws(() => createRegistry('', [descriptor]));
  const future = { ...descriptor, id: 'future.capability', dependencies: [] };
  const registry = createRegistry('2', [descriptor, future]);
  assert.equal(registry.capabilities.length, 2);
  assert.ok(Object.isFrozen(registry.capabilities[0]));
  assert.ok(Object.isFrozen(registry.capabilities[0].requiredPermissions));
});
test('resolution is deterministic and never mutates the input', () => {
  const value = executionSnapshot();
  const before = JSON.stringify(value);
  assert.deepEqual(resolve(value), resolve(value));
  assert.equal(JSON.stringify(value), before);
});

test('administrator approval is visible separately from exact Work approval', () => {
  const facts = readyFacts(); facts.missioncontrol.administrator = 'PENDING_APPROVAL';
  const item = resolve(executionSnapshot({ facts })).missioncontrol;
  assert.equal(item.administrator, 'PENDING_APPROVAL');
  assert.equal(item.label, 'PENDING_APPROVAL');
  assert.equal(item.admissionEligible, false);
});
test('ordinary preference and default configuration cannot overcome administrator denial', () => {
  const facts = readyFacts(); facts.myfactory.administrator = 'DENY';
  const item = resolve(executionSnapshot({ platformOwnerPolicy: undefined,
    ordinaryDefaults: { work: 'ENABLED', myfactory: 'ENABLED' }, preferences: { myfactory: 'ENABLED' }, facts })).myfactory;
  assert.equal(item.preference, 'ENABLED');
  assert.equal(item.administrator, 'DENY');
  assert.equal(item.admissionEligible, false);
});
test('dependency authority cannot be inferred from authority on its parent capability', () => {
  const item = resolve(executionSnapshot({ authority: authority({ capabilities: ['missioncontrol'] }) })).missioncontrol;
  assert.equal(item.admissionEligible, false);
  assert.ok(item.reasons.includes('DEPENDENCY_AUTHORITY:work'));
});
test('DeepAgents requires explicit route selection and the selected harness authority', () => {
  const facts = readyFacts(); delete facts.deepagents.selectedAlternative;
  assert.equal(resolve(executionSnapshot({ facts })).deepagents.admissionEligible, false);
  facts.deepagents.selectedAlternative = 'sofie.cloud-harness';
  const grant = authority({ capabilities: authority().capabilities.filter(id => id !== 'sofie.cloud-harness') });
  assert.equal(resolve(executionSnapshot({ facts, authority: grant })).deepagents.admissionEligible, false);
  facts.deepagents.selectedAlternative = 'sofie.local-harness';
  assert.equal(resolve(executionSnapshot({ facts, authority: grant })).deepagents.admissionEligible, true);
});
test('child lifetime and budget cannot exceed the current parent bounds', () => {
  const requestedWork = { workId: 'work-1', workVersion: 1, workGeneration: 2, agentId: 'child' };
  for (const patch of [
    { expiresAt: now + 30_001 },
    { budget: { limitMicros: 1, reservedMicros: 0, spentMicros: 0, requestedMicros: 0, exposure: 'KNOWN' } },
  ]) {
    const child = authority({ agentId: 'child', parentAgentId: 'agent-1', ...patch });
    assert.equal(resolve(executionSnapshot({ authority: child, requestedWork, parentAuthority: authority() })).missioncontrol.admissionEligible, false);
  }
});
test('nested delegation fails closed until all ancestors can be proven current', () => {
  const child = authority({ agentId: 'child', parentAgentId: 'agent-1' });
  const requestedWork = { workId: 'work-1', workVersion: 1, workGeneration: 2, agentId: 'child' };
  const parent = authority({ parentAgentId: 'grandparent' });
  assert.equal(resolve(executionSnapshot({ authority: child, requestedWork, parentAuthority: parent })).missioncontrol.admissionEligible, false);
});
test('new registry capabilities inherit platform preference but require fresh evidence', () => {
  const descriptor = capabilityRegistry.capabilities.find(item => item.id === 'memory');
  const registry = createRegistry('2', [...capabilityRegistry.capabilities, { ...descriptor, id: 'future.capability' }]);
  const item = resolveCapabilities(registry, snapshot({ registryVersion: '2', facts: readyFacts() }), now).at(-1);
  assert.equal(item.preference, 'ENABLED');
  assert.equal(item.admissionEligible, false);
});
test('revocation and pause remain visible when setup is also incomplete', () => {
  for (const lifecycle of ['REVOKED', 'PAUSED']) {
    const facts = readyFacts(); facts.missioncontrol.lifecycle = lifecycle; facts.missioncontrol.setup = {};
    const item = resolve(executionSnapshot({ facts })).missioncontrol;
    assert.equal(item.label, lifecycle);
    assert.equal(item.readiness, 'SETUP_REQUIRED');
    assert.equal(item.admissionEligible, false);
  }
});
