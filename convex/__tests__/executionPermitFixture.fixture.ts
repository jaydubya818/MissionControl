import {generateKeyPairSync,createHash} from 'node:crypto';
import {parseOwnerEnrollment,parseExecutionPermit} from '../../packages/shared/src/executionPermit';
export function permitFixture() {
 const now=1800000000000,sha='a'.repeat(64),{privateKey,publicKey}=generateKeyPairSync('ed25519');
 const keyId=createHash('sha256').update(publicKey.export({type:'spki',format:'der'})).digest('hex');
 const enrollment=parseOwnerEnrollment({schema:'mc-owner-enrollment/v1',environment:'APPROVED_NONPRODUCTION',installationId:'installation',revision:1,
 ownerId:'eve-owner',ownerSubject:'clerk-subject',missionControlOwnerId:'operator',tenantId:'tenant',projectId:'project',connectionId:'connection',issuer:'https://mc.example.test',audience:'https://eve.example.test',
 clerkIssuer:'https://clerk.example.test',clerkAudience:'convex',clerkAuthorizedParty:'https://mc.example.test',activeFrom:now-1000,expiresAt:now+600000,revokedAt:null,
 factoryVersion:sha,executionContractSha256:sha,capabilityPolicySha256:sha,maxCostMicrousd:1300000,maxDurationSeconds:180,
 permitKeys:[{keyId,publicKey:publicKey.export({type:'spki',format:'pem'}).toString(),activeFrom:now-1000,notAfter:now+600000,revokedAt:null}]});
 const document=parseExecutionPermit({schema:'mc-execution-permit/v1',permitId:'permit',issuer:enrollment.issuer,audience:enrollment.audience,issuedAt:now,expiresAt:now+300000,
 installationId:enrollment.installationId,connectionId:enrollment.connectionId,enrollmentRevision:1,ownerId:enrollment.ownerId,ownerSubject:enrollment.ownerSubject,
 missionControlOwnerId:enrollment.missionControlOwnerId,tenantId:enrollment.tenantId,projectId:enrollment.projectId,missionId:'mission',planId:'plan',planDigest:'sha256:'+sha,
 workOrderId:'workorder',workOrderRevisionId:'revision',approvalId:'approval',approvalDigest:'sha256:'+sha,work:{id:'work',version:1,generation:1,tupleSha256:sha},
 admission:{factoryVersion:sha,executionContractSha256:sha,capabilityPolicySha256:sha,maxCostMicrousd:1300000,maxDurationSeconds:180}});
 return {now,document,enrollment,privateKey:privateKey.export({type:'pkcs8',format:'pem'}).toString(),publicKey};
}
