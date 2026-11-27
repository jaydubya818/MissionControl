import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canonicalHash, canonicalJson, sha256Hex } from '@mission-control/shared';
import { qualifiedLocalDelegationIdentity, localDelegationCanonicalJson, LOCAL_DELEGATION_VERSION } from '../lib/localDelegationQualification';
import { verifyHostFactoryIdentity } from '../../scripts/enterprise-golden-journey/host-factory-identity.mjs';
const lock = JSON.parse(readFileSync(new URL('../../scripts/enterprise-golden-journey/source-lock.json', import.meta.url), 'utf8'));
const hosted = JSON.parse(readFileSync(new URL('./fixtures/hostFactoryQualification.json', import.meta.url), 'utf8'));
const historical = JSON.parse(readFileSync(new URL('./fixtures/nativeHybridAuthority.json', import.meta.url), 'utf8'));
let input: any, record: any;
const provision = () => vi.stubEnv('MC_LOCAL_DELEGATION_QUALIFICATION', JSON.stringify(record));
const check = () => qualifiedLocalDelegationIdentity(input);
beforeEach(() => {
  vi.stubEnv('MC_NATIVE_SUCCESSOR_QUALIFICATION', '1'); vi.stubEnv('MC_ENTERPRISE_COMPATIBILITY_FIXTURES', '1');
  input = { sourceDigest: hosted.sourceDigest, configuration: JSON.parse(hosted.configurationCanonical),
    repositoryId: 'exact-repository', admissionDigest: 'sha256:' + 'a'.repeat(64), now: 100,
    admission: { tenantId: 'tenant', projectId: 'project', operatorId: 'owner', expiresAt: 200 } };
  record = { schema: 'local-delegation-host-admission/v1', ...input.admission,
    repositoryId: input.repositoryId, admissionDigest: input.admissionDigest, qualification: structuredClone(hosted) };
  provision();
});
afterEach(() => vi.unstubAllEnvs());
describe('privileged disposable host qualification admission', () => {
  it('accepts actual hosted wire evidence while retaining historical identity', () => {
    expect(check().factoryVersion).toBe(hosted.factoryVersion);
    expect(check().qualificationDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(hosted.historicalFactoryVersion).toBe(LOCAL_DELEGATION_VERSION);
  });
  it('allows only the historical immutable composition when env is absent', () => {
    vi.stubEnv('MC_LOCAL_DELEGATION_QUALIFICATION', undefined);
    expect(check).toThrow();
    input.configuration = historical.version.executionProfileSnapshot.configuration;
    input.sourceDigest = historical.version.executionProfileSnapshot.sourceDigest;
    expect(check()).toMatchObject({ factoryVersion: LOCAL_DELEGATION_VERSION, qualificationDigest: undefined });
    for (const value of ['', '{}', 'null', 'invalid']) { vi.stubEnv('MC_LOCAL_DELEGATION_QUALIFICATION', value); expect(check).toThrow(); }
  });
  it.each(['MC_NATIVE_SUCCESSOR_QUALIFICATION', 'MC_ENTERPRISE_COMPATIBILITY_FIXTURES'])('requires %s', key => {
    vi.stubEnv(key, undefined); expect(check).toThrow();
  });
  it.each(['tenantId', 'projectId', 'operatorId', 'repositoryId', 'admissionDigest'])('denies changed %s scope', key => {
    record[key] = 'foreign'; provision(); expect(check).toThrow();
  });
  it.each([100, 99, 201, 1.5, null, '200'])('denies expired or unbounded expiry %s', expiresAt => {
    record.expiresAt = expiresAt; provision(); expect(check).toThrow();
  });
  it('rechecks admission expiry, authority digest and revocation without caching', () => {
    expect(check()).toBeTruthy(); input.admission.expiresAt = 199; expect(check).toThrow();
    input.admission.expiresAt = 200; input.admissionDigest = 'changed'; expect(check).toThrow();
    input.admissionDigest = record.admissionDigest; expect(check()).toBeTruthy();
    vi.stubEnv('MC_LOCAL_DELEGATION_QUALIFICATION', undefined); expect(check).toThrow();
  });
  it.each(['sourceSha', 'sourceDigest', 'factoryVersion', 'configurationDigest'])('rejects changed qualification %s', key => {
    record.qualification[key] = '0'.repeat(64); provision(); expect(check).toThrow();
  });
  it('request source/config cannot create authority', () => {
    input.sourceDigest = '0'.repeat(64); expect(check).toThrow();
    input.sourceDigest = hosted.sourceDigest; input.configuration.commands = ['true']; expect(check).toThrow();
  });
  it.each(['static policy', 'runtime image', 'architecture', 'host control', 'missing host control'])('rejects rehashed %s changes', fault => {
    const q = record.qualification, c = JSON.parse(q.configurationCanonical), r = JSON.parse(q.runtimeCanonical), h = JSON.parse(q.hostQualificationCanonical);
    if (fault === 'static policy') { c.local.resources.memoryMb = 512; }
    if (fault === 'runtime image') r.image = 'other';
    if (fault === 'architecture') c.architecture = 'arm64';
    if (fault === 'host control') h.checks.noCredentials = false;
    if (fault === 'missing host control') delete h.checks.noCredentials;
    q.runtimeCanonical = canonicalJson(r); c.local.runtimeSha256 = h.runtimeSha256 = canonicalHash(r);
    q.hostQualificationCanonical = canonicalJson(h); c.local.hostQualificationSha256 = canonicalHash(h);
    q.configurationCanonical = canonicalJson(c); q.configurationDigest = canonicalHash(c);
    q.factoryVersion = canonicalHash({ sourceDigest: q.sourceDigest, configurationDigest: q.configurationDigest });
    input.configuration = c; provision(); expect(check).toThrow();
  });
  it('uses MyFactory lexical wire ordering for mixed-case, underscore and digit keys', () => {
    expect(localDelegationCanonicalJson({ a: 1, Z: 2, _a: 3, '9': 4, a1: [{ b: 1, B: 2 }] }))
      .toBe('{"9":4,"Z":2,"_a":3,"a":1,"a1":[{"B":2,"b":1}]}');
    const q = record.qualification, c = JSON.parse(q.configurationCanonical), r = JSON.parse(q.runtimeCanonical), h = JSON.parse(q.hostQualificationCanonical);
    r.wireOrderProbe = { a: 1, Z: 2, _a: 3, '9': 4 };
    q.runtimeCanonical = localDelegationCanonicalJson(r); c.local.runtimeSha256 = h.runtimeSha256 = sha256Hex(q.runtimeCanonical);
    q.hostQualificationCanonical = localDelegationCanonicalJson(h); c.local.hostQualificationSha256 = sha256Hex(q.hostQualificationCanonical);
    q.configurationCanonical = localDelegationCanonicalJson(c); q.configurationDigest = sha256Hex(q.configurationCanonical);
    q.factoryVersion = sha256Hex(localDelegationCanonicalJson({ sourceDigest: q.sourceDigest, configurationDigest: q.configurationDigest }));
    input.configuration = c; provision();
    expect(check().factoryVersion).toBe(verifyHostFactoryIdentity(q, lock));
    // Shared MissionControl digest identities are deliberately unchanged.
    expect(localDelegationCanonicalJson(r)).not.toBe(canonicalJson(r));
    expect(lock.factoryVersion).toBe(LOCAL_DELEGATION_VERSION);
    expect(lock.myFactoryConfigurationTemplateDigest).toBe('c380a977fb40801438f00cd1a83b6e901ce3a3f0a88188934f63a8f00d5ea703');
  });
  it('rejects noncanonical retained wire bytes' , () => {
    record.qualification.runtimeCanonical += ' '; provision(); expect(check).toThrow();
  });
});
