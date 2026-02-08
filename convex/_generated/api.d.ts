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
import type * as agentLearning from "../agentLearning.js";
import type * as agents from "../agents.js";
import type * as alerts from "../alerts.js";
import type * as approvals from "../approvals.js";
import type * as captures from "../captures.js";
import type * as comments from "../comments.js";
import type * as coordinator from "../coordinator.js";
import type * as crons from "../crons.js";
import type * as executionRequests from "../executionRequests.js";
import type * as executorRouter from "../executorRouter.js";
import type * as executors from "../executors.js";
import type * as github from "../github.js";
import type * as health from "../health.js";
import type * as lib_riskClassifier from "../lib/riskClassifier.js";
import type * as lib_stateMachine from "../lib/stateMachine.js";
import type * as loops from "../loops.js";
import type * as messages from "../messages.js";
import type * as monitoring from "../monitoring.js";
import type * as notifications from "../notifications.js";
import type * as orgMembers from "../orgMembers.js";
import type * as policy from "../policy.js";
import type * as projects from "../projects.js";
import type * as reports from "../reports.js";
import type * as reviews from "../reviews.js";
import type * as runs from "../runs.js";
import type * as search from "../search.js";
import type * as seed from "../seed.js";
import type * as seedMemory from "../seedMemory.js";
import type * as seedOrgChart from "../seedOrgChart.js";
import type * as seedSellerFi from "../seedSellerFi.js";
import type * as setupProjects from "../setupProjects.js";
import type * as setupSellerFiAgents from "../setupSellerFiAgents.js";
import type * as standup from "../standup.js";
import type * as subscriptions from "../subscriptions.js";
import type * as taskRouter from "../taskRouter.js";
import type * as tasks from "../tasks.js";
import type * as telegram from "../telegram.js";
import type * as threadManager from "../threadManager.js";
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
  agentLearning: typeof agentLearning;
  agents: typeof agents;
  alerts: typeof alerts;
  approvals: typeof approvals;
  captures: typeof captures;
  comments: typeof comments;
  coordinator: typeof coordinator;
  crons: typeof crons;
  executionRequests: typeof executionRequests;
  executorRouter: typeof executorRouter;
  executors: typeof executors;
  github: typeof github;
  health: typeof health;
  "lib/riskClassifier": typeof lib_riskClassifier;
  "lib/stateMachine": typeof lib_stateMachine;
  loops: typeof loops;
  messages: typeof messages;
  monitoring: typeof monitoring;
  notifications: typeof notifications;
  orgMembers: typeof orgMembers;
  policy: typeof policy;
  projects: typeof projects;
  reports: typeof reports;
  reviews: typeof reviews;
  runs: typeof runs;
  search: typeof search;
  seed: typeof seed;
  seedMemory: typeof seedMemory;
  seedOrgChart: typeof seedOrgChart;
  seedSellerFi: typeof seedSellerFi;
  setupProjects: typeof setupProjects;
  setupSellerFiAgents: typeof setupSellerFiAgents;
  standup: typeof standup;
  subscriptions: typeof subscriptions;
  taskRouter: typeof taskRouter;
  tasks: typeof tasks;
  telegram: typeof telegram;
  threadManager: typeof threadManager;
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
