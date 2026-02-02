/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as activities from "../activities.js";
import type * as agentDocuments from "../agentDocuments.js";
import type * as agents from "../agents.js";
import type * as alerts from "../alerts.js";
import type * as approvals from "../approvals.js";
import type * as comments from "../comments.js";
import type * as crons from "../crons.js";
import type * as executionRequests from "../executionRequests.js";
import type * as executorRouter from "../executorRouter.js";
import type * as health from "../health.js";
import type * as lib_stateMachine from "../lib/stateMachine.js";
import type * as loops from "../loops.js";
import type * as messages from "../messages.js";
import type * as monitoring from "../monitoring.js";
import type * as notifications from "../notifications.js";
import type * as policy from "../policy.js";
import type * as projects from "../projects.js";
import type * as runs from "../runs.js";
import type * as search from "../search.js";
import type * as seed from "../seed.js";
import type * as standup from "../standup.js";
import type * as subscriptions from "../subscriptions.js";
import type * as taskRouter from "../taskRouter.js";
import type * as tasks from "../tasks.js";
import type * as telegram from "../telegram.js";
import type * as transitions from "../transitions.js";
import type * as webhooks from "../webhooks.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  activities: typeof activities;
  agentDocuments: typeof agentDocuments;
  agents: typeof agents;
  alerts: typeof alerts;
  approvals: typeof approvals;
  comments: typeof comments;
  crons: typeof crons;
  executionRequests: typeof executionRequests;
  executorRouter: typeof executorRouter;
  health: typeof health;
  "lib/stateMachine": typeof lib_stateMachine;
  loops: typeof loops;
  messages: typeof messages;
  monitoring: typeof monitoring;
  notifications: typeof notifications;
  policy: typeof policy;
  projects: typeof projects;
  runs: typeof runs;
  search: typeof search;
  seed: typeof seed;
  standup: typeof standup;
  subscriptions: typeof subscriptions;
  taskRouter: typeof taskRouter;
  tasks: typeof tasks;
  telegram: typeof telegram;
  transitions: typeof transitions;
  webhooks: typeof webhooks;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
