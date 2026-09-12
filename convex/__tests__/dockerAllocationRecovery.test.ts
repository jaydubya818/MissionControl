import {expect,it} from 'vitest';
import {dockerRequestRecoveryMatches} from '../lib/dockerAllocationRecovery';
const digest='sha256:'+'a'.repeat(64), image='fixture/image@'+digest;
const allocation={provider:'DOCKER',resourceName:'mc-attempt-1234567890abcdef',attemptLeaseId:'lease',manifestDigest:digest,profileSnapshot:{provider:'DOCKER',machine:{image}}};
const receipt={providerResourceId:'a'.repeat(64),resourceName:allocation.resourceName,requestedAt:1,confirmedAbsentAt:2,resourceAbsent:true,allocationRecoveryProof:{schema:'factory-docker-request-recovery/v1',image,attemptLeaseId:'lease',manifestDigest:digest}};
it('accepts exact inactive-request proof with a discovered ID',()=>{expect(dockerRequestRecoveryMatches(allocation,receipt)).toBe(true);expect(dockerRequestRecoveryMatches(allocation,{...receipt,providerResourceId:'a'.repeat(64)})).toBe(true);});
it.each([{provider:'EXE_DEV'},{providerResourceId:'b'.repeat(64)},{attemptLeaseId:'other'},{manifestDigest:'sha256:'+'b'.repeat(64)},{resourceName:'mc-attempt-ffffffffffffffff'},{profileSnapshot:{provider:'DOCKER',machine:{image:'other/image@'+digest}}}])('denies a different journal binding %j',change=>expect(dockerRequestRecoveryMatches({...allocation,...change},receipt)).toBe(false));
it.each([{providerResourceId:undefined},{allocationRecoveryProof:undefined},{providerResourceId:'invalid'},{confirmedAbsentAt:0},{resourceAbsent:false}])('denies missing or malformed proof %j',change=>expect(dockerRequestRecoveryMatches(allocation,{...receipt,...change})).toBe(false));
