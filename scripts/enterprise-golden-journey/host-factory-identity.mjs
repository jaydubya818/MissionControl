import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
// Match the pinned MyFactory wire serializer (lexical key ordering).
const canonical = value => value === null || typeof value !== 'object' ? JSON.stringify(value)
  : Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']'
    : '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
const parseCanonical = raw => { const value = JSON.parse(raw); assert.equal(canonical(value), raw, 'Noncanonical identity'); return value; };

export function configurationTemplate(configuration) {
  const template = structuredClone(configuration);
  delete template.architecture;
  delete template.local.runtimeSha256;
  delete template.local.hostQualificationSha256;
  return template;
}

const controls = ['rootDenied', 'absent', 'noCredentials', 'caps', 'seccomp', 'noNewPrivileges', 'networkBlocked',
  'resourceLimits', 'crossWorkFilesystem', 'processTreeCleanup', 'separatePidNamespace', 'deadlineInitProtected'];

export function verifyHostFactoryIdentity(qualification, lock, binding, execution) {
  assert.equal(qualification.schema, 'golden-host-factory-qualification/v1');
  assert.equal(qualification.sourceSha, lock.myFactory);
  assert.equal(qualification.historicalFactoryVersion, lock.factoryVersion);
  assert.match(lock.myFactorySourceDigest, /^[a-f0-9]{64}$/);
  assert.equal(qualification.sourceDigest, lock.myFactorySourceDigest);
  const configuration = parseCanonical(qualification.configurationCanonical);
  const runtime = parseCanonical(qualification.runtimeCanonical);
  const host = parseCanonical(qualification.hostQualificationCanonical);
  const configurationDigest = hash(qualification.configurationCanonical);
  const runtimeDigest = hash(qualification.runtimeCanonical);
  const hostDigest = hash(qualification.hostQualificationCanonical);
  assert.equal(qualification.configurationDigest, configurationDigest);
  // This two-field JSON is the exact pinned MyFactory FactoryVersion wire preimage.
  const factoryVersion = hash(JSON.stringify({ configurationDigest, sourceDigest: qualification.sourceDigest }));
  assert.equal(qualification.factoryVersion, factoryVersion, 'FactoryVersion differs from qualified source/configuration');
  assert.equal(configuration.model, 'fixture/deterministic');
  assert.equal(configuration.executor, 'deterministic-qualification');
  assert.equal(configuration.platform, 'linux');
  assert.ok(['amd64', 'arm64'].includes(runtime.architectureImage), 'Unqualified image architecture');
  assert.equal(configuration.architecture, runtime.architectureImage === 'amd64' ? 'x64' : 'arm64');
  assert.equal(hash(canonical(configurationTemplate(configuration))), lock.myFactoryConfigurationTemplateDigest, 'Static factory configuration changed');
  assert.equal(configuration.verificationImage, lock.providerImage);
  const local = configuration.local;
  assert.equal(local.provider, 'local-docker');
  assert.equal(local.modelProvider, 'none');
  assert.equal(local.evidenceClass, 'DETERMINISTIC');
  assert.equal(local.image, lock.providerImage);
  assert.equal(local.runtimeSha256, runtimeDigest);
  assert.equal(local.hostQualificationSha256, hostDigest);
  assert.equal(runtime.image, lock.providerImage);
  assert.equal(host.runtimeSha256, runtimeDigest);
  assert.equal(host.policySha256, local.policySha256);
  assert.deepEqual(Object.keys(host.checks).sort(), ['uid', ...controls].sort());
  assert.equal(host.checks.uid, 1000);
  for (const control of controls) assert.equal(host.checks[control], true, `Host control failed: ${control}`);
  if (binding) {
    assert.ok(execution, 'Missing verified signed Result execution identity');
    assert.equal(binding.factoryVersion, factoryVersion);
    assert.equal(binding.executionProfileDigest, 'sha256:' + configurationDigest);
  }
  if (execution) {
    assert.equal(execution.factoryVersion, factoryVersion);
    assert.equal(execution.configurationDigest, configurationDigest);
    assert.equal(execution.sourceDigest, qualification.sourceDigest);
    assert.equal(execution.runtimeSha256, runtimeDigest);
    assert.equal(execution.hostQualificationSha256, hostDigest);
  }
  return factoryVersion;
}
