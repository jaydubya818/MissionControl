import { describe, expect, it } from 'vitest';
import { assessSoftwareInitiative, validateEnterpriseRequest, enterpriseDigest } from '../sofieEnterprise';
const proposal = { title:'Agentic HR platform',objective:'Recruiting and employee operations',workstreams:['Recruiting','Operations'],milestones:['Approve scope'],stopCondition:'Draft only',budgetMicrousd:0 };
const request = { operation:'enterprise.propose',connectionId:'connection-1',intentKey:'intent-1',proposal };
describe('Sofie enterprise preparation',()=>{
  it('recommends enterprise only for multi-workstream governed software',()=>expect(assessSoftwareInitiative({software:true,workstreams:4,enterpriseGovernance:true,boundedRepositoryChange:false})).toEqual({tier:3,recommendation:'PROPOSE_MISSIONCONTROL',executionAuthorized:false}));
  it('keeps bounded repository work in MyFactory',()=>expect(assessSoftwareInitiative({software:true,workstreams:1,enterpriseGovernance:false,boundedRepositoryChange:true}).tier).toBe(2));
  it('keeps direct and multi-agent coordination native without enterprise governance',()=>expect(assessSoftwareInitiative({software:true,workstreams:5,enterpriseGovernance:false,boundedRepositoryChange:false}).tier).toBe(1));
  it('does not route ordinary non-software work to MissionControl',()=>expect(assessSoftwareInitiative({software:false,workstreams:5,enterpriseGovernance:true,boundedRepositoryChange:false}).tier).toBe(1));
  it('inspects exactly one proposal selector without accepting authority',()=>{
    for(const selector of [{intentKey:'intent',proposalId:null},{intentKey:null,proposalId:'proposal'}])
      expect(validateEnterpriseRequest({operation:'enterprise.inspect',connectionId:'c',...selector}).operation).toBe('enterprise.inspect');
    for(const selector of [{intentKey:null,proposalId:null},{intentKey:'intent',proposalId:'proposal'},{intentKey:'intent',proposalId:null,authorized:true}])
      expect(()=>validateEnterpriseRequest({operation:'enterprise.inspect',connectionId:'c',...selector})).toThrow();
  });
  it('requires an exact Plan digest for completed Result reads and rejects authority fields',()=>{
    const result={operation:'enterprise.result',connectionId:'c',missionId:'m',expectedPlanDigest:'sha256:'+'1'.repeat(64)};
    expect(validateEnterpriseRequest(result)).toEqual(result);
    for(const patch of [{expectedPlanDigest:null},{ownerId:'other'},{grant:'execute'},{qualityGate:'PASS'}])expect(()=>validateEnterpriseRequest({...result,...patch})).toThrow();
  });
  it('parses an inspectable zero-authority proposal',()=>expect(validateEnterpriseRequest(request)).toEqual(request));
  it.each([
    {...request,ownerId:'spoof'}, {...request,proposal:{...proposal,budgetMicrousd:1}}, {...request,proposal:{...proposal,workstreams:['Only one']}},
    {...request,proposal:{...proposal,title:''}}, {...request,proposal:{...proposal,milestones:Array(21).fill('many')}},
    {...request,proposal:{...proposal,allowedEffects:['execute']}}, {...request,operation:'missions.start'}, {...request,operation:'factory.dispatch'},
    {...request,proposal:{...proposal,title:'x'.repeat(161)}}, {...request,connectionId:' x'}, null,
  ])('rejects authority expansion or malformed input %#',input=>expect(()=>validateEnterpriseRequest(input)).toThrow('ENTERPRISE_REQUEST_INVALID'));
  it('binds all proposal fields and connection identity',()=>{
    expect(enterpriseDigest(request)).not.toBe(enterpriseDigest({...request,connectionId:'connection-2'}));
    expect(enterpriseDigest(request)).not.toBe(enterpriseDigest({...request,proposal:{...proposal,title:'Different'}}));
  });
  it('rejects absent or invalid revision binding fields',()=>{
    expect(()=>validateEnterpriseRequest({operation:'enterprise.read',connectionId:'c',proposalId:'p',missionId:'m'})).toThrow();
    expect(()=>validateEnterpriseRequest({operation:'enterprise.submit',connectionId:'c',proposalId:'p',proposalDigest:'forged'})).toThrow();
  });
});
