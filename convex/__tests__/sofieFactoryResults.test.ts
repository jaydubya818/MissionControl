import {afterEach,it,expect,vi} from 'vitest';
import {refresh} from '../sofieFactoryResults';
import {factoryReadbackFixture} from './installedFactoryReadbackFixture';
import {resultSignature} from '../lib/installedFactoryResult';
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();vi.restoreAllMocks();});
it('owner action fetches only pinned readback origin and retains independently verified observation',async()=>{
 const f=factoryReadbackFixture();vi.spyOn(Date,'now').mockReturnValue(f.now);
 vi.stubEnv('MC_SOFIE_CONNECTION_SECRETS',JSON.stringify({[f.permit.connectionId]:{keyId:'service',secret:f.secret}}));
 const runMutation=vi.fn().mockResolvedValueOnce({document:f.permit,enrollment:{audience:f.permit.audience},keyId:'service',pins:f.pins,pinsDigest:'pin-identity',serviceKeyDigest:'service-identity'}).mockImplementationOnce(async(_ref,args)=>args.observation);
 const fetch=vi.fn(async(url,options)=>{
  expect(String(url)).toBe(f.permit.audience+'/api/missioncontrol/result');expect(options.redirect).toBe('error');expect(options.method).toBe('POST');
  const request=JSON.parse(options.body);expect(request.signature).toBe(resultSignature(request.document,'mc-result-request/v1',f.secret));
  const document={...f.document,commandId:request.document.commandId,challenge:request.document.challenge};
  return Response.json({document,signature:resultSignature(document,'mc-result-readback/v1',f.secret)});
 });vi.stubGlobal('fetch',fetch);
 const result=await (refresh as any)._handler({auth:{getUserIdentity:async()=>({subject:'owner'})},runMutation},{permitId:f.permit.permitId});
 expect(result.status).toBe('VERIFIED_SETTLED');expect(result.enterpriseQualityGate).toBe('NOT_ESTABLISHED');expect(runMutation).toHaveBeenCalledTimes(2);
 expect(runMutation.mock.calls[1][1]).toMatchObject({pinsDigest:'pin-identity',serviceKeyDigest:'service-identity'});
});
it('does not make an external request without authenticated owner and current state',async()=>{
 const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
 await expect((refresh as any)._handler({auth:{getUserIdentity:async()=>null},runMutation:vi.fn()},{permitId:'permit'})).rejects.toThrow();
 await expect((refresh as any)._handler({auth:{getUserIdentity:async()=>({subject:'foreign'})},runMutation:vi.fn().mockRejectedValue(Error('OWNER_DENIED'))},{permitId:'permit'})).rejects.toThrow('OWNER_DENIED');
 expect(fetch).not.toHaveBeenCalled();
});

it('owner Result action resolves the exact stored admission before retaining reported settlement',async()=>{
 const {ownerResultFixture}=await import('./ownerFactoryReadbackFixture');
 const f=ownerResultFixture();vi.spyOn(Date,'now').mockReturnValue(f.now);
 vi.stubEnv('MC_SOFIE_CONNECTION_SECRETS',JSON.stringify({[f.permit.connectionId]:{keyId:'service',secret:f.secret}}));
 const state={document:f.permit,enrollment:{...f.admissionEvidence.enrollment,audience:f.permit.audience},keyId:'service',pins:f.pins,pinsDigest:'pins',serviceKeyDigest:'service',enrollmentDigest:'enrollment'};
 const runMutation=vi.fn().mockResolvedValueOnce(state).mockResolvedValueOnce({...state,admissionDocument:f.admissionEvidence.document}).mockImplementationOnce(async(_ref,args)=>args.observation);
 vi.stubGlobal('fetch',vi.fn(async(_url,options)=>{const request=JSON.parse(options.body).document;const document={...f.document,commandId:request.commandId,challenge:request.challenge};return Response.json({document,signature:resultSignature(document,'mc-result-readback/v1',f.secret)});}));
 const result=await (refresh as any)._handler({auth:{getUserIdentity:async()=>({subject:'owner'})},runMutation},{permitId:f.permit.permitId});
 expect(result.status).toBe('RESULT_VERIFIED_SETTLEMENT_REPORTED');expect(runMutation).toHaveBeenCalledTimes(3);
 expect(runMutation.mock.calls[1][1]).toEqual({permitId:f.permit.permitId,admissionCommandId:f.document.admission.binding.commandId});
 expect(runMutation.mock.calls[2][1]).toMatchObject({enrollmentDigest:'enrollment',observation:{admissionBinding:{commandId:f.document.admission.binding.commandId}}});
});
