import { v } from 'convex/values';
import { internalMutation } from './_generated/server';
import { approveConfirmedPermit, applyPlanConfirmation, recordConfirmationRefusal, type ConfirmationHandlers } from './lib/sofieConfirmationBridge';
import { decide, apply } from './sofieEnterprise';
import { approvePlan, savePlanDraft, submitPlan, updateDraft } from './missions';
import { assignMissionMember } from './softwareFactoryControlPlane';
import { approvePrepared } from './sofieExecutionPermitState';

// Internal only: reachable solely from convex/sofieConfirmations.ts after the submitter credential and MyEve's confirmation signature verified.
const envelope = v.object({ serviceId: v.string(), capability: v.string(), projectId: v.string(), repositoryId: v.string(), commandId: v.string(),
  issuedAt: v.number(), expiresAt: v.number(), payloadDigest: v.string(), signature: v.string() });
const confirmation = v.object({ binding: v.any(), keyId: v.string(), signature: v.string() });

/**
 * Checks a value against a registered function's own exported argument validator (Convex validates arguments only at its call boundary,
 * which a direct handler call does not cross). Unknown validator kinds are refused.
 */
export function validateArguments(schema: any, value: any, db?: { normalizeId?(table: string, id: string): unknown }, path = 'args'): void {
  const fail = (): never => { throw Error(`SOFIE_CONFIRMATION_ARGUMENT_INVALID:${path}`); };
  const plain = (x: unknown) => !!x && typeof x === 'object' && !Array.isArray(x) && Object.getPrototypeOf(x) === Object.prototype;
  switch (schema?.type) {
    case 'any': return;
    case 'string': if (typeof value !== 'string') fail(); return;
    case 'number': if (typeof value !== 'number') fail(); return;
    case 'bigint': if (typeof value !== 'bigint') fail(); return;
    case 'boolean': if (typeof value !== 'boolean') fail(); return;
    case 'null': if (value !== null) fail(); return;
    case 'literal': if (value !== schema.value) fail(); return;
    case 'id': if (typeof value !== 'string' || (db?.normalizeId && db.normalizeId(schema.tableName, value) === null)) fail(); return;
    case 'array': if (!Array.isArray(value)) fail(); value.forEach((item: unknown, i: number) => validateArguments(schema.value, item, db, `${path}[${i}]`)); return;
    case 'record': if (!plain(value)) fail();
      for (const [k, item] of Object.entries(value)) { validateArguments(schema.keys, k, db, `${path}.key`); validateArguments(schema.values.fieldType, item, db, `${path}.${k}`); } return;
    case 'object': {
      if (!plain(value)) fail();
      for (const key of Object.keys(value)) if (!Object.prototype.hasOwnProperty.call(schema.value, key) || value[key] === undefined) fail();
      for (const [key, field] of Object.entries<any>(schema.value)) {
        if (!Object.prototype.hasOwnProperty.call(value, key)) { if (!field.optional) fail(); continue; }
        validateArguments(field.fieldType, value[key], db, `${path}.${key}`);
      }
      return;
    }
    case 'union': for (const option of schema.value) { try { validateArguments(option, value, db, path); return; } catch { /* next option */ } } fail(); return;
    default: fail();
  }
}
/** The registered functions' own handlers (their wrappers included), so every existing authorization check runs unchanged, after their own
 *  argument validators. */
const handlerOf = (fn: unknown) => {
  const registered = fn as { _handler?: (ctx: any, args: any) => Promise<any>; exportArgs?: () => string };
  if (typeof registered._handler !== 'function' || typeof registered.exportArgs !== 'function') throw Error('SOFIE_CONFIRMATION_HANDLER_UNAVAILABLE');
  const schema = JSON.parse(registered.exportArgs());
  return (ctx: any, args: any) => { validateArguments(schema, args, ctx.db); return registered._handler!(ctx, args); };
};
export const existingHandlers = (): ConfirmationHandlers => ({
  decide: handlerOf(decide), submit: handlerOf(apply), updateDraft: handlerOf(updateDraft), assignMissionMember: handlerOf(assignMissionMember),
  savePlanDraft: handlerOf(savePlanDraft), submitPlan: handlerOf(submitPlan), approvePlan: handlerOf(approvePlan), approvePrepared: handlerOf(approvePrepared),
});

export const applyPlan = internalMutation({ args: { confirmation, submit: v.object({ envelope, payloadJson: v.string() }) },
  handler: (ctx, args) => applyPlanConfirmation(ctx, args, existingHandlers()) });
export const applyPermit = internalMutation({ args: { confirmation, requestId: v.string(), workId: v.string() },
  handler: (ctx, args) => approveConfirmedPermit(ctx, args, existingHandlers()) });
export const recordRefusal = internalMutation({ args: { confirmation, step: v.union(v.literal('PLAN'), v.literal('PERMIT')), workId: v.string(), reason: v.string() },
  handler: (ctx, args) => recordConfirmationRefusal(ctx, args) });
