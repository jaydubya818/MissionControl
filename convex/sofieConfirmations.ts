'use node';
import { v } from 'convex/values';
import { action } from './_generated/server';
import { makeFunctionReference } from 'convex/server';
import { authenticateSofieConfirmationSubmission } from './lib/sofieConfirmationCrypto';
import { APPROVE_CONFIRMED_PERMIT, CONFIRM_PLAN } from './lib/sofieConfirmation';

/**
 * Hosted Sofie confirmation bridge entry points (server-to-server from hosted MyEve). See convex/lib/sofieConfirmation.ts.
 * Each call: submitter credential + MyEve confirmation signature are verified here; the single-use claim, identity binding, Plan re-verification
 * and every approval happen together in ONE internal mutation transaction. A refused, signature-verified confirmation is audited and burned.
 */
const envelope = v.object({ serviceId: v.string(), capability: v.string(), projectId: v.string(), repositoryId: v.string(), commandId: v.string(),
  issuedAt: v.number(), expiresAt: v.number(), payloadDigest: v.string(), signature: v.string() });
const ref = (name: string) => makeFunctionReference<'mutation'>(name);
const reason = (error: unknown) => String((error as Error)?.message ?? error).slice(0, 300);

export const confirmPlan = action({ args: { envelope, payloadJson: v.string() }, handler: async (ctx, args): Promise<any> => {
  const { confirmation, payload } = await authenticateSofieConfirmationSubmission(args, CONFIRM_PLAN);
  try { return await ctx.runMutation(ref('sofieConfirmationState:applyPlan'), { confirmation, submit: payload.submit }); }
  catch (error) { await ctx.runMutation(ref('sofieConfirmationState:recordRefusal'), { confirmation, step: 'PLAN', workId: '', reason: reason(error) }); throw error; }
} });

export const approveConfirmedPermit = action({ args: { envelope, payloadJson: v.string() }, handler: async (ctx, args): Promise<any> => {
  const { confirmation, payload } = await authenticateSofieConfirmationSubmission(args, APPROVE_CONFIRMED_PERMIT);
  if (typeof payload.requestId !== 'string' || typeof payload.workId !== 'string') throw Error('SOFIE_CONFIRMATION_REFUSED:SUBMISSION_SHAPE');
  try { return await ctx.runMutation(ref('sofieConfirmationState:applyPermit'), { confirmation, requestId: payload.requestId, workId: payload.workId }); }
  catch (error) { await ctx.runMutation(ref('sofieConfirmationState:recordRefusal'), { confirmation, step: 'PERMIT', workId: payload.workId, reason: reason(error) }); throw error; }
} });
