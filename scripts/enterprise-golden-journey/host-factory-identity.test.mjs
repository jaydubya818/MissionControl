import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { verifyHostFactoryIdentity } from './host-factory-identity.mjs';
const lock = JSON.parse(readFileSync(new URL('./source-lock.json', import.meta.url)));
const canonical = value => value === null || typeof value !== 'object' ? JSON.stringify(value)
  : Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']'
    : '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
const hash = value => createHash('sha256').update(value).digest('hex');
// Independently derived from exact e498c31 fixture, provider implementation, and protected verifier policy.
const template = {"allowedPaths":["fixtures/cloud-work/project-slug/slug.mjs"],"commands":["node --test fixtures/cloud-work/project-slug/slug.test.mjs"],"executor":"deterministic-qualification","executorVersion":"1","local":{"evidenceClass":"DETERMINISTIC","harnessSha256":"f1e7714288cf5c091300f6b9a418a8f721a1f0562600a1ff36f7c8c54551ce66","image":"public.ecr.aws/docker/library/node@sha256:3d27e5c11e5786e309ec3e03f93ae536eb36e6e5eb3714d5eb3300a36157add0","implementationSha256":"b5f2f85d4b1830ec9a4b038247e1927e9274d135853d028bf7054a35dc3ba62d","modelProvider":"none","policySha256":"6b5419dd57095b9f639ad09d88c1183da18c7353bb45e0a8c97f3593290383b0","provider":"local-docker","providerVersion":"1","resources":{"maxArtifactBytes":256000,"memoryMb":256,"pids":64,"timeoutMs":180000,"vcpus":1},"verificationPolicySha256":"8e4df86832ee72ebfc49983382359097f7ceae2a191de4511288277cf8505e4c"},"model":"fixture/deterministic","nodeVersion":"24","platform":"linux","skillRevision":"none","timeoutMs":180000,"verificationImage":"public.ecr.aws/docker/library/node@sha256:3d27e5c11e5786e309ec3e03f93ae536eb36e6e5eb3714d5eb3300a36157add0","workerProfile":"container"};
const controls = ['rootDenied', 'absent', 'noCredentials', 'caps', 'seccomp', 'noNewPrivileges', 'networkBlocked',
  'resourceLimits', 'crossWorkFilesystem', 'processTreeCleanup', 'separatePidNamespace', 'deadlineInitProtected'];
function fixture(architectureImage = 'amd64', mutate = () => {}) {
  const configuration = { ...structuredClone(template), architecture: architectureImage === 'amd64' ? 'x64' : 'arm64' };
  const runtime = { image: lock.providerImage, architectureImage, engine: 'fixture-engine', kernel: 'fixture-kernel' };
  const host = { checks: { uid: 1000, ...Object.fromEntries(controls.map(key => [key, true])) }, policySha256: configuration.local.policySha256 };
  const q = { schema: 'golden-host-factory-qualification/v1', sourceSha: lock.myFactory,
    historicalFactoryVersion: lock.factoryVersion, sourceDigest: lock.myFactorySourceDigest };
  mutate({ configuration, runtime, host, q });
  q.runtimeCanonical = canonical(runtime); host.runtimeSha256 = hash(q.runtimeCanonical);
  q.hostQualificationCanonical = canonical(host);
  configuration.local.runtimeSha256 = hash(q.runtimeCanonical);
  configuration.local.hostQualificationSha256 = hash(q.hostQualificationCanonical);
  q.configurationCanonical = canonical(configuration); q.configurationDigest = hash(q.configurationCanonical);
  q.factoryVersion = hash(canonical({ sourceDigest: q.sourceDigest, configurationDigest: q.configurationDigest }));
  const binding = { factoryVersion: q.factoryVersion, executionProfileDigest: 'sha256:' + q.configurationDigest };
  const execution = { factoryVersion: q.factoryVersion, sourceDigest: q.sourceDigest, configurationDigest: q.configurationDigest,
    runtimeSha256: configuration.local.runtimeSha256, hostQualificationSha256: configuration.local.hostQualificationSha256 };
  return { q, binding, execution };
}
const verify = ({ q, binding, execution }) => verifyHostFactoryIdentity(q, lock, binding, execution);
describe('exact host-qualified FactoryVersion', () => {
  it('preserves historical pin and independently derives different exact host versions', () => {
    expect(lock.factoryVersion).toBe('4c6c3a7d752df18a865fc815bc52daa8b638f6344a607f86a692f24eab3f4f95');
    expect(hash(canonical(template))).toBe(lock.myFactoryConfigurationTemplateDigest);
    const amd64 = fixture(), arm64 = fixture('arm64');
    expect(verify(amd64)).toBe(amd64.q.factoryVersion); expect(verify(arm64)).toBe(arm64.q.factoryVersion);
    expect(amd64.q.factoryVersion).not.toBe(arm64.q.factoryVersion);
  });
  it.each([
    ['source SHA', x => { x.q.sourceSha = '0'.repeat(40); }],
    ['source digest', x => { x.q.sourceDigest = '0'.repeat(64); }],
    ['policy', x => { x.configuration.local.policySha256 = '0'.repeat(64); x.host.policySha256 = '0'.repeat(64); }],
    ['resource budget', x => { x.configuration.local.resources.memoryMb = 512; }],
    ['protected command', x => { x.configuration.commands = ['true']; }],
    ['implementation', x => { x.configuration.local.implementationSha256 = '0'.repeat(64); }],
    ['architecture mismatch', x => { x.configuration.architecture = 'arm64'; }],
    ['unknown architecture', x => { x.runtime.architectureImage = 'ppc64'; }],
    ['wrong image', x => { x.runtime.image = 'other'; }],
    ['wrong user', x => { x.host.checks.uid = 0; }],
    ['missing control', x => { delete x.host.checks.noCredentials; }],
    ['extra control', x => { x.host.checks.selfAttested = true; }],
  ])('rejects rehashed %s changes', (_name, mutate) => { expect(() => verify(fixture('amd64', mutate))).toThrow(); });
  it.each(controls)('requires live host control %s', key => {
    expect(() => verify(fixture('amd64', x => { x.host.checks[key] = false; }))).toThrow();
  });
  it.each(['factoryVersion', 'configurationDigest', 'sourceDigest', 'runtimeSha256', 'hostQualificationSha256'])('rejects signed Result %s mismatch', key => {
    const f = fixture(); f.execution[key] = '0'.repeat(64); expect(() => verify(f)).toThrow();
  });
  it('rejects wrong binding, missing Result, and historical version replay', () => {
    for (const key of ['factoryVersion', 'executionProfileDigest']) { const f = fixture(); f.binding[key] = lock.factoryVersion; expect(() => verify(f)).toThrow(); }
    const f = fixture(); delete f.execution; expect(() => verify(f)).toThrow(/Missing verified signed Result/);
  });
  it.each(['configurationCanonical', 'runtimeCanonical', 'hostQualificationCanonical'])('rejects noncanonical %s bytes', key => {
    const f = fixture(); f.q[key] = JSON.stringify(JSON.parse(f.q[key]), null, 2); expect(() => verify(f)).toThrow(/Noncanonical/);
  });
});
