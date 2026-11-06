import { v } from 'convex/values';
import { internalMutation } from './_generated/server';
import { installOwnerEnrollment, linkMemberSubject } from './lib/sofieOperatorSetup';

/** Deployment-admin only (internal): private-beta operator setup for hosted Sofie. See lib/sofieOperatorSetup.ts. */
export const linkMember = internalMutation({
  args: { actorOperatorId: v.id('operators'), memberId: v.id('orgMembers'), subject: v.string() },
  handler: (ctx, args) => linkMemberSubject(ctx, args),
});
export const installEnrollment = internalMutation({
  args: { actorOperatorId: v.id('operators'), connectionId: v.id('enterpriseAppConnections'), enrollment: v.any() },
  handler: (ctx, args) => installOwnerEnrollment(ctx, args),
});
