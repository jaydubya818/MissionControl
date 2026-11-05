// DEVELOPMENT smoke of the bridge against the disposable backend with a SYNTHETIC binding signed by the local test key.
// Never used for the journey: `backend.mjs reset` + `setup.mjs` wipe every row it creates before the real run.
import { sign, createPrivateKey, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { confirmStep } from './bridge.mjs';
import { KEYS, OWNER_ID, sha256 } from './common.mjs';
const canonical = v => Array.isArray(v) ? `[${v.map(canonical).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}` : JSON.stringify(v);
const request = 'SYNTHETIC development smoke request (not the journey).', planSha256 = sha256('smoke' + Date.now()), h = 'a'.repeat(64);
const binding = { schema: 'myeve-owner-confirmation/v1', profile: 'myeve.private-beta.owner/v1', ownerId: OWNER_ID, request, requestSha256: sha256(request), planSha256,
  confirmCode: planSha256.slice(0, 12), confirmedAt: Date.now(), nonce: randomUUID(), title: 'Synthetic smoke', repository: 'local/dashboard',
  works: [1, 2, 3].map(stage => ({ stage, id: randomUUID(), version: 1, generation: 1 })),
  enrollmentPins: { factoryVersion: h, executionContractSha256: h, capabilityPolicySha256: h, relayLeaseEnrollmentSha256: h, maxCostMicrousd: 650000, maxDurationSeconds: 180,
    ownerFactoryAdapter: { factoryId: 'f', sourceDigest: h, configurationDigest: h, configurationHash: h, profileHash: h, repository: 'local/dashboard', agentId: 'agt_x' } } };
const signature = sign(null, Buffer.from('myeve-owner-confirmation/v1\n' + canonical(binding)), createPrivateKey(readFileSync(KEYS + '/owner-confirmation.ed25519.pem'))).toString('base64url');
console.log(JSON.stringify(await confirmStep({ binding, signature }), (k, v) => k === 'enrollment' ? undefined : v, 1));
