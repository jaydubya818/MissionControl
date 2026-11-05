import { canonicalJson, sha256Hex } from './canonicalDigest';

export const SOFIE_APPLICATION = 'myeve-sofie-readiness-v1';
export const SOFIE_CAPABILITIES = ['enterprise.propose', 'enterprise.submit', 'enterprise.read', 'enterprise.inspect', 'enterprise.result'] as const;
export interface EnterpriseProposal {
  title: string; objective: string; workstreams: string[]; milestones: string[]; stopCondition: string; budgetMicrousd: 0;
}
export type EnterpriseRequest =
  | { operation: 'enterprise.result'; connectionId: string; missionId: string; expectedPlanDigest: string }
  | { operation: 'enterprise.inspect'; connectionId: string; intentKey: string | null; proposalId: string | null }
  | { operation: 'enterprise.propose'; connectionId: string; intentKey: string; proposal: EnterpriseProposal }
  | { operation: 'enterprise.submit'; connectionId: string; proposalId: string; proposalDigest: string }
  | { operation: 'enterprise.read'; connectionId: string; proposalId: string; missionId: string; expectedPlanDigest: string | null };
export const enterpriseDigest = (value: unknown) => `sha256:${sha256Hex(canonicalJson(value))}`;

export function assessSoftwareInitiative(input: { software: boolean; workstreams: number; enterpriseGovernance: boolean; boundedRepositoryChange: boolean }) {
  if (!Number.isInteger(input.workstreams) || input.workstreams < 0) throw Error('INVALID_WORKSTREAM_COUNT');
  if (input.software && input.enterpriseGovernance && input.workstreams >= 2) return { tier: 3, recommendation: 'PROPOSE_MISSIONCONTROL', executionAuthorized: false } as const;
  if (input.software && input.boundedRepositoryChange) return { tier: 2, recommendation: 'MYFACTORY', executionAuthorized: false } as const;
  return { tier: 1, recommendation: 'SOFIE_NATIVE', executionAuthorized: false } as const;
}

function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== keys.length || keys.some(k => !Object.prototype.hasOwnProperty.call(value, k))) throw Error('ENTERPRISE_REQUEST_INVALID');
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim() || value.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)) throw Error('ENTERPRISE_REQUEST_INVALID');
  return value;
}
function list(value: unknown, min: number, max: number): string[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) throw Error('ENTERPRISE_REQUEST_INVALID');
  return value.map(item => text(item, 160));
}
function hash(value: unknown): string {
  if (typeof value !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(value)) throw Error('ENTERPRISE_REQUEST_INVALID');
  return value;
}
export function validateEnterpriseRequest(value: unknown): EnterpriseRequest {
  const operation = (value as { operation?: unknown } | null)?.operation;
  if (operation === 'enterprise.result') {
    const r = object(value, ['operation','connectionId','missionId','expectedPlanDigest']);
    return { operation, connectionId:text(r.connectionId,200), missionId:text(r.missionId,200), expectedPlanDigest:hash(r.expectedPlanDigest) };
  }
  if (operation === 'enterprise.inspect') {
    const r = object(value, ['operation','connectionId','intentKey','proposalId']);
    if ((r.intentKey === null) === (r.proposalId === null)) throw Error('ENTERPRISE_REQUEST_INVALID');
    return { operation, connectionId: text(r.connectionId,200), intentKey:r.intentKey===null?null:text(r.intentKey,200), proposalId:r.proposalId===null?null:text(r.proposalId,200) };
  }
  if (operation === 'enterprise.propose') {
    const r = object(value, ['operation','connectionId','intentKey','proposal']);
    const p = object(r.proposal, ['title','objective','workstreams','milestones','stopCondition','budgetMicrousd']);
    if (p.budgetMicrousd !== 0) throw Error('ENTERPRISE_REQUEST_INVALID');
    return { operation, connectionId: text(r.connectionId,200), intentKey:text(r.intentKey,200), proposal: {
      title:text(p.title,160), objective:text(p.objective,4000),workstreams:list(p.workstreams,2,12),milestones:list(p.milestones,1,20),
      stopCondition:text(p.stopCondition,500),budgetMicrousd:0 } };
  }
  if (operation === 'enterprise.submit') {
    const r = object(value,['operation','connectionId','proposalId','proposalDigest']);
    return { operation,connectionId:text(r.connectionId,200),proposalId:text(r.proposalId,200),proposalDigest:hash(r.proposalDigest) };
  }
  if (operation === 'enterprise.read') {
    const r = object(value,['operation','connectionId','proposalId','missionId','expectedPlanDigest']);
    return { operation,connectionId:text(r.connectionId,200),proposalId:text(r.proposalId,200),missionId:text(r.missionId,200),expectedPlanDigest:r.expectedPlanDigest===null?null:hash(r.expectedPlanDigest) };
  }
  throw Error('ENTERPRISE_REQUEST_INVALID');
}
