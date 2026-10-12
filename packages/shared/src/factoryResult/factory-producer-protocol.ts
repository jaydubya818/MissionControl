import { createHash, type KeyObject } from 'node:crypto';
import { signProtocolPayload, verifyProtocolPayload } from './factory-producer-signature';

export const RESULT_PROTOCOL = 'MYFACTORY_RESULT_V1';
export const MAX_RESULT_BYTES = 12 * 1024 * 1024;
export const MAX_ARTIFACT_BYTES = 4 * 1024 * 1024;
export function canonical(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  throw new Error('Non-canonical JSON value');
}
export function sha256(bytes: string | Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }
export function digest(value: unknown): string { return sha256(canonical(value)); }
export interface CloudExecutionConfiguration {
  provider: 'vercel-sandbox'; providerVersion: string; region: 'iad1'; workerImage: string;
  networkPolicy: string; toolPolicySha256: string; contextPolicySha256: string; verificationPolicySha256: string;
  evidenceClass: 'DETERMINISTIC' | 'LIVE';
  resources: { vcpus: number; memoryMb: number; timeoutMs: number; maxArtifactBytes: number };
  skills: { name: string; sha256: string; capabilities: string[] }[];
}
export interface ExecutionConfiguration {
  model: string; executor: string; executorVersion: string; skillRevision: string;
  workerProfile: string; verificationImage: string; nodeVersion: string; platform: string; architecture: string;
  commands: string[]; allowedPaths: string[]; timeoutMs: number;
  cloud?: CloudExecutionConfiguration;
}
export interface ExecutionSnapshot {
  version: 1 | 2; inputTree?: string; factoryId: string; factoryVersion: string; sourceDigest: string;
  configurationDigest: string; configuration: ExecutionConfiguration;
  requestId: string; requestDigest: string; workOrderId: string; runId: string;
  attemptNumber: number; inputCommit: string; capturedAt: string;
}
export interface ResultArtifact {
  id: string; kind: 'git-commit' | 'git-tree' | 'patch' | 'check-log';
  producer: string; runId: string; candidateCommit: string; sha256: string; size: number; createdAt: string;
}
export interface ResultEvidence {
  id: string; producer: string; runId: string; candidateCommit: string; command: string;
  status: 'passed' | 'failed' | 'skipped' | 'unavailable'; exitCode: number | null;
  startedAt: string; finishedAt: string; logArtifactId: string;
}
export interface CloudVerificationEvidence {
  version: 1; kind: 'INDEPENDENT_CLOUD_VERIFICATION'; runId: string;
  workId: string; workGeneration: number; candidateCommit: string; candidateTree: string;
  custodySha256: string; policySha256: string; image: string;
  providerSessionId: string | null; producerSessionId: string; cleanupConfirmed: true;
  outcome: 'PASS' | 'FAIL' | 'UNKNOWN'; checks: {id:string; result:'PASS'|'FAIL'; reportSha256?:string}[];
  startedAt: string; finishedAt: string;
}
export interface ResultManifest {
  protocol: typeof RESULT_PROTOCOL; keyId: string; producer: string; operationId: string;
  execution: ExecutionSnapshot; status: 'COMPLETED' | 'FAILED' | 'CANCELLED';
  candidate: { commit: string; tree: string; base: string; patchDigest: string;
    commitArtifactId: string; treeArtifactId: string; patchArtifactId: string } | null;
  evidence: ResultEvidence[]; artifacts: ResultArtifact[]; evidenceDigest: string; artifactDigest: string;
  completedAt: string; issuedAt: string;
  verification?: CloudVerificationEvidence;
}
export interface SignedResult {
  protocol: typeof RESULT_PROTOCOL; encoded: string; signature: string; manifestDigest: string;
  artifacts: { id: string; base64: string }[];
}
export interface ResultKey {
  factoryId: string; keyId: string; publicKey: string; activeFrom: string; notAfter: string;
  retiredAt?: string; revokedAt?: string;
}
export function operationId(e: ExecutionSnapshot): string {
  return digest([RESULT_PROTOCOL, e.factoryId, e.requestId, e.workOrderId, e.runId]);
}
function requireValue(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function exact(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
  requireValue(value && typeof value === 'object' && !Array.isArray(value), 'Expected object');
  requireValue(Object.keys(value).sort().join(',') === [...keys].sort().join(','), 'Unexpected or missing result field');
}
function text(value: unknown): asserts value is string { requireValue(typeof value === 'string' && value.length > 0 && value.length <= 4000, 'Invalid text'); }
function time(value: unknown): asserts value is string { text(value); requireValue(Number.isFinite(Date.parse(value)), 'Invalid timestamp'); }
function hash(value: unknown): asserts value is string { requireValue(typeof value === 'string' && /^[a-f0-9]{64}$/.test(value), 'Invalid digest'); }
function gitHash(value: unknown): asserts value is string { requireValue(typeof value === 'string' && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value), 'Invalid Git identity'); }

function validateCloudConfiguration(c: Record<string,unknown>): void {
  requireValue(c.workerProfile==='container'&&c.platform==='linux'&&c.architecture==='x64', 'Cloud runtime mismatch');
  const cloud=c.cloud;
  exact(cloud,['provider','providerVersion','region','workerImage','networkPolicy','toolPolicySha256','contextPolicySha256','verificationPolicySha256','evidenceClass','resources','skills']);
  requireValue(cloud.provider==='vercel-sandbox'&&cloud.region==='iad1', 'Unqualified cloud provider');
  text(cloud.providerVersion);text(cloud.networkPolicy);
  const immutable=(value:unknown)=>typeof value==='string'&&/^[a-zA-Z0-9./:_-]+@sha256:[a-f0-9]{64}$/.test(value);
  requireValue(immutable(cloud.workerImage)&&immutable(c.verificationImage), 'Immutable cloud image required');
  for(const key of ['toolPolicySha256','contextPolicySha256','verificationPolicySha256'])hash(cloud[key]);
  requireValue(['DETERMINISTIC','LIVE'].includes(String(cloud.evidenceClass)), 'Cloud evidence class required');
  exact(cloud.resources,['vcpus','memoryMb','timeoutMs','maxArtifactBytes']);
  for(const value of Object.values(cloud.resources))requireValue(Number.isSafeInteger(value)&&Number(value)>0, 'Bounded cloud resource required');
  requireValue(cloud.resources.vcpus===1&&Number(cloud.resources.memoryMb)<=2048&&Number(cloud.resources.timeoutMs)<=600000&&cloud.resources.timeoutMs===c.timeoutMs&&Number(cloud.resources.maxArtifactBytes)<=MAX_RESULT_BYTES, 'Cloud envelope exceeded');
  requireValue(Array.isArray(cloud.skills)&&cloud.skills.length<=20, 'Bounded cloud skills required');
  const names=new Set();
  for(const skill of cloud.skills){
    exact(skill,['name','sha256','capabilities']);text(skill.name);hash(skill.sha256);
    requireValue(!names.has(skill.name),'Duplicate cloud skill');names.add(skill.name);
    requireValue(Array.isArray(skill.capabilities)&&skill.capabilities.length<=20,'Bounded skill capabilities required');skill.capabilities.forEach(text);
  }
}

export function validateManifest(value: unknown): asserts value is ResultManifest {
  const hasVerification=!!value&&typeof value==='object'&&Object.prototype.hasOwnProperty.call(value,'verification');
  exact(value, ['protocol','keyId','producer','operationId','execution','status','candidate','evidence','artifacts','evidenceDigest','artifactDigest','completedAt','issuedAt',...(hasVerification?['verification']:[])]);
  requireValue(value.protocol === RESULT_PROTOCOL, 'Unknown result protocol');
  text(value.keyId); text(value.producer); hash(value.operationId); hash(value.evidenceDigest); hash(value.artifactDigest);
  time(value.completedAt); time(value.issuedAt);
  requireValue(Date.parse(value.completedAt) <= Date.parse(value.issuedAt), 'Completion after issuance');
  requireValue(['COMPLETED','FAILED','CANCELLED'].includes(String(value.status)), 'Nonterminal result');
  const e = value.execution;
  exact(e, ['version','factoryId','factoryVersion','sourceDigest','configurationDigest','configuration','requestId','requestDigest','workOrderId','runId','attemptNumber','inputCommit','capturedAt',...((e as Record<string,unknown>)?.version===2?['inputTree']:[])]);
  requireValue((e.version === 1 || e.version === 2) && e.factoryId === value.producer, 'Producer mismatch');
  if(e.version===2)gitHash(e.inputTree);
  for (const key of ['factoryId','requestId','workOrderId','runId']) text(e[key]);
  for (const key of ['factoryVersion','sourceDigest','configurationDigest','requestDigest']) hash(e[key]);
  gitHash(e.inputCommit); time(e.capturedAt);
  requireValue(Number.isSafeInteger(e.attemptNumber) && Number(e.attemptNumber) > 0, 'Invalid attempt');
  requireValue(Date.parse(e.capturedAt) <= Date.parse(value.completedAt), 'Completion before admission');
  const c = e.configuration;
  exact(c, ['model','executor','executorVersion','skillRevision','workerProfile','verificationImage','nodeVersion','platform','architecture','commands','allowedPaths','timeoutMs',...(e.version===2?['cloud']:[])]);
  if(e.version===2)validateCloudConfiguration(c);
  for (const key of ['model','executor','executorVersion','skillRevision','workerProfile','verificationImage','nodeVersion','platform','architecture']) text(c[key]);
  for (const key of ['commands','allowedPaths']) {
    const list = c[key]; requireValue(Array.isArray(list) && list.length > 0 && list.length <= 100, 'Invalid configuration list'); list.forEach(text);
  }
  requireValue(Number.isSafeInteger(c.timeoutMs) && Number(c.timeoutMs) > 0, 'Invalid timeout');
  requireValue(digest(c) === e.configurationDigest && digest({sourceDigest:e.sourceDigest, configurationDigest:e.configurationDigest}) === e.factoryVersion, 'Execution version mismatch');
  requireValue(operationId(e as unknown as ExecutionSnapshot) === value.operationId, 'Operation mismatch');
  requireValue(Array.isArray(value.artifacts) && value.artifacts.length <= 103, 'Invalid artifacts');
  const ids = new Set();
  for (const a of value.artifacts) {
    exact(a, ['id','kind','producer','runId','candidateCommit','sha256','size','createdAt']);
    text(a.id); hash(a.sha256); gitHash(a.candidateCommit); time(a.createdAt);
    requireValue(Date.parse(a.createdAt) >= Date.parse(e.capturedAt as string) && Date.parse(a.createdAt) <= Date.parse(value.completedAt as string), 'Artifact chronology mismatch');
    requireValue(!ids.has(a.id), 'Duplicate artifact'); ids.add(a.id);
    requireValue(['git-commit','git-tree','patch','check-log'].includes(String(a.kind)), 'Unknown artifact kind');
    requireValue(a.producer === value.producer && a.runId === e.runId, 'Artifact provenance mismatch');
    requireValue(Number.isSafeInteger(a.size) && Number(a.size) >= 0 && Number(a.size) <= MAX_ARTIFACT_BYTES, 'Artifact size limit');
  }
  requireValue(Array.isArray(value.evidence) && value.evidence.length <= 100, 'Invalid evidence');
  const evidenceIds = new Set(), logIds = new Set();
  for (const check of value.evidence) {
    exact(check, ['id','producer','runId','candidateCommit','command','status','exitCode','startedAt','finishedAt','logArtifactId']);
    text(check.id); text(check.command); gitHash(check.candidateCommit); time(check.startedAt); time(check.finishedAt);
    requireValue(!evidenceIds.has(check.id) && !logIds.has(check.logArtifactId), 'Duplicate evidence'); evidenceIds.add(check.id); logIds.add(check.logArtifactId);
    requireValue(check.producer === value.producer && check.runId === e.runId, 'Evidence provenance mismatch');
    requireValue(['passed','failed','skipped','unavailable'].includes(String(check.status)), 'Unknown check status');
    requireValue(check.exitCode === null || Number.isSafeInteger(check.exitCode), 'Invalid check exit');
    requireValue(check.status !== 'passed' || check.exitCode === 0, 'Contradictory check');
    requireValue(Date.parse(check.startedAt) >= Date.parse(e.capturedAt as string) && Date.parse(check.startedAt) <= Date.parse(check.finishedAt) && Date.parse(check.finishedAt) <= Date.parse(value.completedAt as string), 'Invalid check chronology');
    const log = value.artifacts.find(a => a.id === check.logArtifactId);
    requireValue(log?.kind === 'check-log' && log.candidateCommit === check.candidateCommit, 'Unbound check log');
  }
  if (value.candidate !== null) {
    const candidate = value.candidate;
    exact(candidate, ['commit','tree','base','patchDigest','commitArtifactId','treeArtifactId','patchArtifactId']);
    gitHash(candidate.commit); gitHash(candidate.tree); gitHash(candidate.base); hash(candidate.patchDigest);
    requireValue(candidate.base === e.inputCommit, 'Wrong candidate base');
    for (const [key, kind] of [['commitArtifactId','git-commit'],['treeArtifactId','git-tree'],['patchArtifactId','patch']]) {
      const a = value.artifacts.find(a => a.id === candidate[key]);
      requireValue(a?.kind === kind && a.candidateCommit === candidate.commit, 'Missing candidate artifact');
      if (kind === 'patch') requireValue(a.sha256 === candidate.patchDigest, 'Patch digest mismatch');
    }
    requireValue(value.artifacts.every(a => a.candidateCommit === candidate.commit) && value.evidence.every(c => c.candidateCommit === candidate.commit), 'Cross-candidate data');
    requireValue(value.artifacts.length === value.evidence.length + 3, 'Unbound artifact');
  } else requireValue(value.artifacts.length === 0 && value.evidence.length === 0, 'Artifacts without candidate');
  if (value.status === 'COMPLETED') {
    requireValue(value.candidate !== null && value.evidence.length > 0 && value.evidence.every(c => c.status === 'passed'), 'Incomplete success');
    requireValue(canonical(value.evidence.map(c => c.command)) === canonical(c.commands), 'Missing required checks');
  }
  if(hasVerification){
    requireValue(e.version===2&&value.candidate!==null,'Cloud verification requires a cloud candidate');
    const candidate=value.candidate as Record<string,unknown>,cloud=c.cloud as Record<string,unknown>;
    const v=value.verification;
    exact(v,['version','kind','runId','workId','workGeneration','candidateCommit','candidateTree','custodySha256','policySha256','image','providerSessionId','producerSessionId','cleanupConfirmed','outcome','checks','startedAt','finishedAt']);
    requireValue(v.version===1&&v.kind==='INDEPENDENT_CLOUD_VERIFICATION'&&v.runId===e.runId,'Verifier provenance mismatch');
    text(v.workId);requireValue(Number.isSafeInteger(v.workGeneration)&&Number(v.workGeneration)>0,'Verifier Work generation');
    requireValue(v.candidateCommit===candidate.commit&&v.candidateTree===candidate.tree,'Verifier candidate mismatch');
    hash(v.custodySha256);hash(v.policySha256);
    requireValue(v.policySha256===cloud.verificationPolicySha256&&v.image===c.verificationImage,'Verifier policy mismatch');
    requireValue(v.cleanupConfirmed===true&&/^sbx_[A-Za-z0-9_-]+$/.test(String(v.producerSessionId)),'Verifier cleanup binding');
    requireValue(v.providerSessionId!==v.producerSessionId&&(v.providerSessionId===null||/^sbx_[A-Za-z0-9_-]+$/.test(String(v.providerSessionId))),'Verifier isolation mismatch');
    requireValue(['PASS','FAIL','UNKNOWN'].includes(String(v.outcome))&&Array.isArray(v.checks)&&v.checks.length<=20,'Verifier outcome');
    const ids=new Set();
    for(const check of v.checks){exact(check,['id','result',...(Object.prototype.hasOwnProperty.call(check,'reportSha256')?['reportSha256']:[])]);if(Object.prototype.hasOwnProperty.call(check,'reportSha256'))hash(check.reportSha256);text(check.id);requireValue(!ids.has(check.id)&&['PASS','FAIL'].includes(String(check.result)),'Verifier check');ids.add(check.id);}
    requireValue(v.outcome==='UNKNOWN'||(v.providerSessionId!==null&&v.checks.length>0&&((v.outcome==='PASS')===v.checks.every(check=>check.result==='PASS'))),'Contradictory verifier outcome');
    time(v.startedAt);time(v.finishedAt);
    requireValue(Date.parse(v.startedAt)>=Date.parse(e.capturedAt)&&Date.parse(v.startedAt)<=Date.parse(v.finishedAt)&&Date.parse(v.finishedAt)<=Date.parse(value.completedAt),'Verifier chronology mismatch');
  }
  requireValue(digest(value.evidence) === value.evidenceDigest && digest(value.artifacts) === value.artifactDigest, 'Manifest digest mismatch');
}

function verifyArtifactBytes(m: ResultManifest, artifacts: SignedResult['artifacts']): void {
  requireValue(Array.isArray(artifacts) && artifacts.length === m.artifacts.length, 'Missing artifact bytes');
  const bytes = new Map<string, Buffer>();
  for (const a of artifacts) {
    exact(a, ['id','base64']); text(a.id);
    requireValue(typeof a.base64 === 'string' && a.base64.length <= Math.ceil(MAX_ARTIFACT_BYTES / 3) * 4, 'Artifact size limit');
    const content = Buffer.from(a.base64, 'base64');
    requireValue(content.toString('base64') === a.base64 && !bytes.has(a.id), 'Invalid artifact encoding or duplicate');
    const meta = m.artifacts.find(item => item.id === a.id);
    requireValue(meta && meta.size === content.length && meta.sha256 === sha256(content), 'Artifact digest mismatch');
    bytes.set(a.id, content);
  }
  const c = m.candidate;
  if (c) {
    const commit = bytes.get(c.commitArtifactId)!, tree = bytes.get(c.treeArtifactId)!;
    const objectId = (type: string, b: Buffer, id: string) => createHash(id.length === 40 ? 'sha1' : 'sha256').update(`${type} ${b.length}\0`).update(b).digest('hex');
    requireValue(objectId('commit',commit,c.commit) === c.commit && objectId('tree',tree,c.tree) === c.tree, 'Git object digest mismatch');
    const headers = commit.toString('utf8').split('\n\n')[0].split('\n');
    requireValue(headers[0] === `tree ${c.tree}` && headers.filter(h => h.startsWith('parent ')).join('\n') === `parent ${c.base}`, 'Candidate tree/base mismatch');
  }
}
export function signResult(manifest: ResultManifest, artifacts: SignedResult['artifacts'], privateKey: string | KeyObject): SignedResult {
  validateManifest(manifest); verifyArtifactBytes(manifest, artifacts);
  const encoded = Buffer.from(canonical(manifest)).toString('base64url');
  const result: SignedResult = {protocol:RESULT_PROTOCOL, encoded, signature:signProtocolPayload(RESULT_PROTOCOL,encoded,privateKey), manifestDigest:digest(manifest), artifacts};
  requireValue(Buffer.byteLength(JSON.stringify(result)) <= MAX_RESULT_BYTES, 'Result size limit'); return result;
}
export function verifyResult(input: unknown, options: {
  keys: ResultKey[]; factoryId: string; requestId: string; workOrderId: string; runId: string;
  factoryVersion: string; now?: number; historical?: boolean;
}): {manifest: ResultManifest; keyValidForCurrentUse: boolean} {
  requireValue(Buffer.byteLength(JSON.stringify(input) ?? '') <= MAX_RESULT_BYTES, 'Result size limit');
  exact(input, ['protocol','encoded','signature','manifestDigest','artifacts']);
  requireValue(input.protocol === RESULT_PROTOCOL && typeof input.encoded === 'string' && typeof input.signature === 'string', 'Unknown result protocol');
  const raw = Buffer.from(input.encoded,'base64url').toString('utf8'); const manifest: unknown = JSON.parse(raw); validateManifest(manifest);
  requireValue(canonical(manifest) === raw && Buffer.from(raw).toString('base64url') === input.encoded, 'Noncanonical result');
  const keys = options.keys.filter(k => k.factoryId === options.factoryId && k.keyId === manifest.keyId);
  requireValue(keys.length === 1, 'Unknown or ambiguous key'); const key = keys[0];
  requireValue(verifyProtocolPayload(RESULT_PROTOCOL,input.encoded,input.signature,key.publicKey), 'Invalid signature');
  requireValue(manifest.producer === options.factoryId && manifest.execution.requestId === options.requestId && manifest.execution.workOrderId === options.workOrderId && manifest.execution.runId === options.runId && manifest.execution.factoryVersion === options.factoryVersion, 'Result correlation mismatch');
  const now = options.now ?? Date.now(), issued = Date.parse(manifest.issuedAt);
  time(key.activeFrom); time(key.notAfter); if (key.retiredAt) time(key.retiredAt); if (key.revokedAt) time(key.revokedAt);
  requireValue(issued >= Date.parse(key.activeFrom) && issued <= Date.parse(key.notAfter) && issued <= now, 'Key validity window');
  requireValue(!key.retiredAt || issued < Date.parse(key.retiredAt), 'Issued after retirement');
  const current = !key.revokedAt && !key.retiredAt && now <= Date.parse(key.notAfter);
  requireValue(options.historical || current, 'Key revoked, retired or expired for current admission');
  requireValue(digest(manifest) === input.manifestDigest, 'Result manifest digest mismatch');
  verifyArtifactBytes(manifest,input.artifacts as SignedResult['artifacts']);
  return {manifest, keyValidForCurrentUse:!options.historical && current};
}
/** Both inputs must have passed verifyResult; comparison never grants authority. */
export function compareResults(previous: SignedResult, next: SignedResult): 'DUPLICATE' | 'DIFFERENT_OPERATION' {
  const a = JSON.parse(Buffer.from(previous.encoded,'base64url').toString('utf8')) as ResultManifest;
  const b = JSON.parse(Buffer.from(next.encoded,'base64url').toString('utf8')) as ResultManifest;
  if (a.operationId !== b.operationId) return 'DIFFERENT_OPERATION';
  if (previous.manifestDigest !== next.manifestDigest) throw new Error('Conflicting result operation');
  return 'DUPLICATE';
}
