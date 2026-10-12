import {afterEach,it,expect,vi} from 'vitest';
import {deliverInstalledControl} from '../lib/installedControlDelivery';
import {deliver} from '../sofiePermitControlDelivery';
afterEach(()=>vi.unstubAllEnvs());
it('POSTs exact packet only to the pinned origin and treats HTTP200 as delivery only',async()=>{
 const transport=vi.fn(async()=>Response.json({received:true})),packet={status:'CONTROL',control:{document:{operation:'revoke'}}};
 expect(await deliverInstalledControl(packet,'https://eve.example.test',transport)).toBe('DELIVERED');
 expect(String(transport.mock.calls[0][0])).toBe('https://eve.example.test/api/missioncontrol/control');
 expect(transport.mock.calls[0][1]).toMatchObject({method:'POST',redirect:'error',body:JSON.stringify(packet)});
});
for(const [name,transport] of Object.entries({
 'unavailable':async()=>{throw Error('NETWORK');},
 'misleading stopped response':async()=>Response.json({received:true,cleanup:'CONFIRMED'}),
 'oversized response':async()=>new Response('x'.repeat(1025)),
 'HTTP redirect':async()=>new Response('',{status:302,headers:{location:'https://other.example.test'}}),
}))it(`keeps ${name} pending`,async()=>expect(await deliverInstalledControl({},'https://eve.example.test',transport)).toBe('PENDING_BACKEND'));
it('rejects noncanonical or insecure origins before sending',async()=>{const transport=vi.fn();for(const origin of ['http://eve.example.test','https://eve.example.test/path','https://x:y@eve.example.test'])await expect(deliverInstalledControl({},origin,transport)).rejects.toThrow();expect(transport).not.toHaveBeenCalled();});
it('does no scheduling work or HTTP while installed delivery is disabled',async()=>{vi.stubEnv('MC_SOFIE_CONTROL_DELIVERY_ENABLED','false');const runMutation=vi.fn();expect(await(deliver as any)._handler({runMutation},{permitId:'permit',sequence:1})).toEqual({delivery:'DISABLED',authority:'PENDING_BACKEND'});expect(runMutation).not.toHaveBeenCalled();});
