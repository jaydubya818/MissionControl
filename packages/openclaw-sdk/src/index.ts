/**
 * Mission Control OpenClaw SDK
 * 
 * Easy integration for OpenClaw agents with Mission Control.
 * 
 * @example
 * ```typescript
 * import { MissionControlClient } from '@mission-control/openclaw-sdk';
 * 
 * const client = new MissionControlClient({
 *   convexUrl: 'https://your-deployment.convex.cloud',
 *   projectSlug: 'my-project',
 *   agent: {
 *     name: 'MyAgent',
 *     role: 'SPECIALIST',
 *     allowedTaskTypes: ['CODE_CHANGE', 'RESEARCH'],
 *   },
 * });
 * 
 * // Register task handler
 * client.onTask('CODE_CHANGE', async (context) => {
 *   await context.postComment('Working on it...');
 *   
 *   // Do work...
 *   
 *   return {
 *     summary: 'Completed the code change',
 *     artifactIds: ['file1.ts', 'file2.ts'],
 *   };
 * });
 * 
 * // Start the agent
 * await client.start();
 * ```
 */

export { MissionControlClient } from "./client";
export * from "./types";
