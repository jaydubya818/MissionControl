import { canonicalDigest, canonicalHash, canonicalJson, sha256Hex } from '@mission-control/shared';

export const LOCAL_DELEGATION_SOURCE = 'e498c31db8b749fa91b0544ecd1d1a661b971c2c';
export const LOCAL_DELEGATION_VERSION = '4c6c3a7d752df18a865fc815bc52daa8b638f6344a607f86a692f24eab3f4f95';
const SOURCE_DIGEST = '93944614be94c6d824f8640d0bda26a7822528dd0d960c02e7db474d15e7f929';
const TEMPLATE_DIGEST = 'c380a977fb40801438f00cd1a83b6e901ce3a3f0a88188934f63a8f00d5ea703';
const IMAGE = 'public.ecr.aws/docker/library/node@sha256:3d27e5c11e5786e309ec3e03f93ae536eb36e6e5eb3714d5eb3300a36157add0';
const controls = ['rootDenied', 'absent', 'noCredentials', 'caps', 'seccomp', 'noNewPrivileges', 'networkBlocked',
  'resourceLimits', 'crossWorkFilesystem', 'processTreeCleanup', 'separatePidNamespace', 'deadlineInitProtected'];
const deny = () => { throw Error('LOCAL_DELEGATION_QUALIFICATION_UNAVAILABLE'); };
const requireValue = (value: unknown) => { if (!value) deny(); };
function canonicalRecord(raw: string) {
  requireValue(typeof raw === 'string' && raw.length < 32768);
  const value = JSON.parse(raw);
  requireValue(canonicalJson(value) === raw);
  return value;
}

/** Authority comes only from the disposable backend's privileged environment.
 * Request configuration cannot create or replace a host qualification. */
export function qualifiedLocalDelegationIdentity(input: {
  sourceDigest: string; configuration: any; repositoryId: string; admission: any; admissionDigest: string; now: number;
}) {
  requireValue(process.env.MC_NATIVE_SUCCESSOR_QUALIFICATION === '1'
    && process.env.MC_ENTERPRISE_COMPATIBILITY_FIXTURES === '1');
  const configurationDigest = canonicalHash(input.configuration);
  const factoryVersion = canonicalHash({ sourceDigest: input.sourceDigest, configurationDigest });
  const raw = process.env.MC_LOCAL_DELEGATION_QUALIFICATION;
  // Preserve only the exact historical immutable composition when no successor
  // record was provisioned. A present invalid record never falls back to it.
  if (raw === undefined) {
    requireValue(factoryVersion === LOCAL_DELEGATION_VERSION);
    return { factoryVersion, configurationDigest, qualificationDigest: undefined };
  }
  try {
    requireValue(raw.length > 0 && raw.length < 65536);
    const record = JSON.parse(raw), a = input.admission;
    requireValue(record.schema === 'local-delegation-host-admission/v1'
      && record.tenantId === a.tenantId && record.projectId === a.projectId
      && record.operatorId === a.operatorId && record.repositoryId === input.repositoryId
      && record.admissionDigest === input.admissionDigest
      && Number.isSafeInteger(record.expiresAt) && record.expiresAt > input.now
      && Number.isSafeInteger(a.expiresAt) && record.expiresAt <= a.expiresAt);
    const q = record.qualification;
    requireValue(q.schema === 'golden-host-factory-qualification/v1' && q.sourceSha === LOCAL_DELEGATION_SOURCE
      && q.historicalFactoryVersion === LOCAL_DELEGATION_VERSION && q.sourceDigest === SOURCE_DIGEST
      && input.sourceDigest === SOURCE_DIGEST);
    const configuration = canonicalRecord(q.configurationCanonical);
    const runtime = canonicalRecord(q.runtimeCanonical), host = canonicalRecord(q.hostQualificationCanonical);
    requireValue(canonicalJson(configuration) === canonicalJson(input.configuration)
      && q.configurationDigest === configurationDigest && q.factoryVersion === factoryVersion);
    const template = { ...configuration, local: { ...configuration.local } };
    delete template.architecture; delete template.local.runtimeSha256; delete template.local.hostQualificationSha256;
    requireValue(canonicalHash(template) === TEMPLATE_DIGEST
      && ['amd64', 'arm64'].includes(runtime.architectureImage)
      && configuration.architecture === (runtime.architectureImage === 'amd64' ? 'x64' : 'arm64')
      && runtime.image === IMAGE
      && configuration.local.runtimeSha256 === sha256Hex(q.runtimeCanonical)
      && configuration.local.hostQualificationSha256 === sha256Hex(q.hostQualificationCanonical)
      && host.runtimeSha256 === configuration.local.runtimeSha256
      && host.policySha256 === configuration.local.policySha256
      && Object.keys(host.checks).sort().join(',') === ['uid', ...controls].sort().join(',')
      && host.checks.uid === 1000 && controls.every(key => host.checks[key] === true));
    return { factoryVersion, configurationDigest,
      qualificationDigest: canonicalDigest('local-delegation-host-admission/v1', record) };
  } catch { return deny(); }
}
