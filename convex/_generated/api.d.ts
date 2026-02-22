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
import type * as apiCollections from "../apiCollections.js";
import type * as approvals from "../approvals.js";
import type * as captures from "../captures.js";
import type * as codegen from "../codegen.js";
import type * as comments from "../comments.js";
import type * as contentDrops from "../contentDrops.js";
import type * as coordinator from "../coordinator.js";
import type * as crons from "../crons.js";
import type * as e2e from "../e2e.js";
import type * as execution from "../execution.js";
import type * as executionRequests from "../executionRequests.js";
import type * as executorRouter from "../executorRouter.js";
import type * as executors from "../executors.js";
import type * as flakySteps from "../flakySteps.js";
import type * as gherkin from "../gherkin.js";
import type * as github from "../github.js";
import type * as governance_approvalRecords from "../governance/approvalRecords.js";
import type * as governance_changeRecords from "../governance/changeRecords.js";
import type * as governance_deployments from "../governance/deployments.js";
import type * as governance_permissions from "../governance/permissions.js";
import type * as governance_policyEnvelopes from "../governance/policyEnvelopes.js";
import type * as governance_roleAssignments from "../governance/roleAssignments.js";
import type * as governance_roles from "../governance/roles.js";
import type * as health from "../health.js";
import type * as http from "../http.js";
import type * as hybridWorkflows from "../hybridWorkflows.js";
import type * as identity from "../identity.js";
import type * as lib_agentResolver from "../lib/agentResolver.js";
import type * as lib_armAudit from "../lib/armAudit.js";
import type * as lib_armCompat from "../lib/armCompat.js";
import type * as lib_armPolicy from "../lib/armPolicy.js";
import type * as lib_genomeHash from "../lib/genomeHash.js";
import type * as lib_getActiveTenant from "../lib/getActiveTenant.js";
import type * as lib_legacyToolPolicy from "../lib/legacyToolPolicy.js";
import type * as lib_operatorControls from "../lib/operatorControls.js";
import type * as lib_riskClassifier from "../lib/riskClassifier.js";
import type * as lib_sanitize from "../lib/sanitize.js";
import type * as lib_stateMachine from "../lib/stateMachine.js";
import type * as lib_taskEvents from "../lib/taskEvents.js";
import type * as loops from "../loops.js";
import type * as meetings from "../meetings.js";
import type * as messages from "../messages.js";
import type * as metrics from "../metrics.js";
import type * as migrations_backfillInstanceRefs from "../migrations/backfillInstanceRefs.js";
import type * as mission from "../mission.js";
import type * as monitoring from "../monitoring.js";
import type * as notifications from "../notifications.js";
import type * as operations_opEvents from "../operations/opEvents.js";
import type * as operatorControls from "../operatorControls.js";
import type * as orgAssignments from "../orgAssignments.js";
import type * as orgMembers from "../orgMembers.js";
import type * as policy from "../policy.js";
import type * as prd from "../prd.js";
import type * as projects from "../projects.js";
import type * as qcArtifacts from "../qcArtifacts.js";
import type * as qcFindings from "../qcFindings.js";
import type * as qcRulesets from "../qcRulesets.js";
import type * as qcRuns from "../qcRuns.js";
import type * as registry_agentIdentities from "../registry/agentIdentities.js";
import type * as registry_agentInstances from "../registry/agentInstances.js";
import type * as registry_agentTemplates from "../registry/agentTemplates.js";
import type * as registry_agentVersions from "../registry/agentVersions.js";
import type * as registry_environments from "../registry/environments.js";
import type * as registry_operators from "../registry/operators.js";
import type * as registry_tenants from "../registry/tenants.js";
import type * as reports from "../reports.js";
import type * as revenue from "../revenue.js";
import type * as reviews from "../reviews.js";
import type * as runs from "../runs.js";
import type * as savedViews from "../savedViews.js";
import type * as scheduledJobs from "../scheduledJobs.js";
import type * as search from "../search.js";
import type * as seed from "../seed.js";
import type * as seedMemory from "../seedMemory.js";
import type * as seedMissionControlDemo from "../seedMissionControlDemo.js";
import type * as seedOrgChart from "../seedOrgChart.js";
import type * as seedSellerFi from "../seedSellerFi.js";
import type * as sessionBootstrap from "../sessionBootstrap.js";
import type * as setupProjects from "../setupProjects.js";
import type * as setupSellerFiAgents from "../setupSellerFiAgents.js";
import type * as squad from "../squad.js";
import type * as standup from "../standup.js";
import type * as subscriptions from "../subscriptions.js";
import type * as taskRouter from "../taskRouter.js";
import type * as tasks from "../tasks.js";
import type * as telegram from "../telegram.js";
import type * as telegraph from "../telegraph.js";
import type * as testGeneration from "../testGeneration.js";
import type * as testRecordings from "../testRecordings.js";
import type * as threadManager from "../threadManager.js";
import type * as transitions from "../transitions.js";
import type * as voice from "../voice.js";
import type * as watchSubscriptions from "../watchSubscriptions.js";
import type * as webhooks from "../webhooks.js";
import type * as workflowMetrics from "../workflowMetrics.js";
import type * as workflowRuns from "../workflowRuns.js";
import type * as workflows from "../workflows.js";

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
  apiCollections: typeof apiCollections;
  approvals: typeof approvals;
  captures: typeof captures;
  codegen: typeof codegen;
  comments: typeof comments;
  contentDrops: typeof contentDrops;
  coordinator: typeof coordinator;
  crons: typeof crons;
  e2e: typeof e2e;
  execution: typeof execution;
  executionRequests: typeof executionRequests;
  executorRouter: typeof executorRouter;
  executors: typeof executors;
  flakySteps: typeof flakySteps;
  gherkin: typeof gherkin;
  github: typeof github;
  "governance/approvalRecords": typeof governance_approvalRecords;
  "governance/changeRecords": typeof governance_changeRecords;
  "governance/deployments": typeof governance_deployments;
  "governance/permissions": typeof governance_permissions;
  "governance/policyEnvelopes": typeof governance_policyEnvelopes;
  "governance/roleAssignments": typeof governance_roleAssignments;
  "governance/roles": typeof governance_roles;
  health: typeof health;
  http: typeof http;
  hybridWorkflows: typeof hybridWorkflows;
  identity: typeof identity;
  "lib/agentResolver": typeof lib_agentResolver;
  "lib/armAudit": typeof lib_armAudit;
  "lib/armCompat": typeof lib_armCompat;
  "lib/armPolicy": typeof lib_armPolicy;
  "lib/genomeHash": typeof lib_genomeHash;
  "lib/getActiveTenant": typeof lib_getActiveTenant;
  "lib/legacyToolPolicy": typeof lib_legacyToolPolicy;
  "lib/operatorControls": typeof lib_operatorControls;
  "lib/riskClassifier": typeof lib_riskClassifier;
  "lib/sanitize": typeof lib_sanitize;
  "lib/stateMachine": typeof lib_stateMachine;
  "lib/taskEvents": typeof lib_taskEvents;
  loops: typeof loops;
  meetings: typeof meetings;
  messages: typeof messages;
  metrics: typeof metrics;
  "migrations/backfillInstanceRefs": typeof migrations_backfillInstanceRefs;
  mission: typeof mission;
  monitoring: typeof monitoring;
  notifications: typeof notifications;
  "operations/opEvents": typeof operations_opEvents;
  operatorControls: typeof operatorControls;
  orgAssignments: typeof orgAssignments;
  orgMembers: typeof orgMembers;
  policy: typeof policy;
  prd: typeof prd;
  projects: typeof projects;
  qcArtifacts: typeof qcArtifacts;
  qcFindings: typeof qcFindings;
  qcRulesets: typeof qcRulesets;
  qcRuns: typeof qcRuns;
  "registry/agentIdentities": typeof registry_agentIdentities;
  "registry/agentInstances": typeof registry_agentInstances;
  "registry/agentTemplates": typeof registry_agentTemplates;
  "registry/agentVersions": typeof registry_agentVersions;
  "registry/environments": typeof registry_environments;
  "registry/operators": typeof registry_operators;
  "registry/tenants": typeof registry_tenants;
  reports: typeof reports;
  revenue: typeof revenue;
  reviews: typeof reviews;
  runs: typeof runs;
  savedViews: typeof savedViews;
  scheduledJobs: typeof scheduledJobs;
  search: typeof search;
  seed: typeof seed;
  seedMemory: typeof seedMemory;
  seedMissionControlDemo: typeof seedMissionControlDemo;
  seedOrgChart: typeof seedOrgChart;
  seedSellerFi: typeof seedSellerFi;
  sessionBootstrap: typeof sessionBootstrap;
  setupProjects: typeof setupProjects;
  setupSellerFiAgents: typeof setupSellerFiAgents;
  squad: typeof squad;
  standup: typeof standup;
  subscriptions: typeof subscriptions;
  taskRouter: typeof taskRouter;
  tasks: typeof tasks;
  telegram: typeof telegram;
  telegraph: typeof telegraph;
  testGeneration: typeof testGeneration;
  testRecordings: typeof testRecordings;
  threadManager: typeof threadManager;
  transitions: typeof transitions;
  voice: typeof voice;
  watchSubscriptions: typeof watchSubscriptions;
  webhooks: typeof webhooks;
  workflowMetrics: typeof workflowMetrics;
  workflowRuns: typeof workflowRuns;
  workflows: typeof workflows;
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
