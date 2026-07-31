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
import type * as agentHiring from "../agentHiring.js";
import type * as agentLearning from "../agentLearning.js";
import type * as agents from "../agents.js";
import type * as alertRules from "../alertRules.js";
import type * as alerts from "../alerts.js";
import type * as analytics from "../analytics.js";
import type * as apiCollections from "../apiCollections.js";
import type * as approvals from "../approvals.js";
import type * as captures from "../captures.js";
import type * as codegen from "../codegen.js";
import type * as comments from "../comments.js";
import type * as contentDrops from "../contentDrops.js";
import type * as context_activation from "../context/activation.js";
import type * as context_analyzeGithubRepo from "../context/analyzeGithubRepo.js";
import type * as context_changeRisk from "../context/changeRisk.js";
import type * as context_evals from "../context/evals.js";
import type * as context_importSkills from "../context/importSkills.js";
import type * as context_manifests from "../context/manifests.js";
import type * as context_packageFiles from "../context/packageFiles.js";
import type * as context_packages from "../context/packages.js";
import type * as context_verifiers from "../context/verifiers.js";
import type * as coordinator from "../coordinator.js";
import type * as costEvents from "../costEvents.js";
import type * as crons from "../crons.js";
import type * as e2e from "../e2e.js";
import type * as eos_projections from "../eos/projections.js";
import type * as execution from "../execution.js";
import type * as executionRequests from "../executionRequests.js";
import type * as executorRouter from "../executorRouter.js";
import type * as executors from "../executors.js";
import type * as factory_agentFleet from "../factory/agentFleet.js";
import type * as factory_codeReviewWizard from "../factory/codeReviewWizard.js";
import type * as factory_githubCi from "../factory/githubCi.js";
import type * as factory_health from "../factory/health.js";
import type * as factory_metaLoop from "../factory/metaLoop.js";
import type * as factory_piBridge from "../factory/piBridge.js";
import type * as factory_prChecks from "../factory/prChecks.js";
import type * as factory_repetitiveTasks from "../factory/repetitiveTasks.js";
import type * as factory_workflows from "../factory/workflows.js";
import type * as featureFlags from "../featureFlags.js";
import type * as flakySteps from "../flakySteps.js";
import type * as gatewayConnection from "../gatewayConnection.js";
import type * as gherkin from "../gherkin.js";
import type * as github from "../github.js";
import type * as goals from "../goals.js";
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
import type * as knowledge from "../knowledge.js";
import type * as knowledgeGraph from "../knowledgeGraph.js";
import type * as lib_agentResolver from "../lib/agentResolver.js";
import type * as lib_armAudit from "../lib/armAudit.js";
import type * as lib_armCompat from "../lib/armCompat.js";
import type * as lib_armPolicy from "../lib/armPolicy.js";
import type * as lib_contextActivation from "../lib/contextActivation.js";
import type * as lib_contextEvals from "../lib/contextEvals.js";
import type * as lib_contextManifests from "../lib/contextManifests.js";
import type * as lib_contextPackages from "../lib/contextPackages.js";
import type * as lib_contextRegistryGate from "../lib/contextRegistryGate.js";
import type * as lib_demoSeedExtensions from "../lib/demoSeedExtensions.js";
import type * as lib_evalFrameworkGate from "../lib/evalFrameworkGate.js";
import type * as lib_factoryHealth from "../lib/factoryHealth.js";
import type * as lib_factoryOverview from "../lib/factoryOverview.js";
import type * as lib_factoryProjectSeed from "../lib/factoryProjectSeed.js";
import type * as lib_fileTree from "../lib/fileTree.js";
import type * as lib_flags from "../lib/flags.js";
import type * as lib_genomeHash from "../lib/genomeHash.js";
import type * as lib_getActiveTenant from "../lib/getActiveTenant.js";
import type * as lib_githubCiIngest from "../lib/githubCiIngest.js";
import type * as lib_githubRepoSkills from "../lib/githubRepoSkills.js";
import type * as lib_harnessPrChecks from "../lib/harnessPrChecks.js";
import type * as lib_knowledgeGraph from "../lib/knowledgeGraph.js";
import type * as lib_legacyToolPolicy from "../lib/legacyToolPolicy.js";
import type * as lib_loopEngineering from "../lib/loopEngineering.js";
import type * as lib_mergeGates from "../lib/mergeGates.js";
import type * as lib_missionGovernance from "../lib/missionGovernance.js";
import type * as lib_modelRouting from "../lib/modelRouting.js";
import type * as lib_operatorControls from "../lib/operatorControls.js";
import type * as lib_outputValidation from "../lib/outputValidation.js";
import type * as lib_piBridgeEnvelope from "../lib/piBridgeEnvelope.js";
import type * as lib_prdParser from "../lib/prdParser.js";
import type * as lib_repetitiveTasks from "../lib/repetitiveTasks.js";
import type * as lib_riskClassifier from "../lib/riskClassifier.js";
import type * as lib_runInspector from "../lib/runInspector.js";
import type * as lib_sanitize from "../lib/sanitize.js";
import type * as lib_stateMachine from "../lib/stateMachine.js";
import type * as lib_taskEvents from "../lib/taskEvents.js";
import type * as lib_workOrderCompat from "../lib/workOrderCompat.js";
import type * as lib_workOrderDispatch from "../lib/workOrderDispatch.js";
import type * as lib_workOrderGovernance from "../lib/workOrderGovernance.js";
import type * as lib_workOrderParentSync from "../lib/workOrderParentSync.js";
import type * as lib_workOrderRevision from "../lib/workOrderRevision.js";
import type * as lib_workOrders from "../lib/workOrders.js";
import type * as lib_workflowObservability from "../lib/workflowObservability.js";
import type * as lib_workflowRunState from "../lib/workflowRunState.js";
import type * as lib_workflowTaskGuards from "../lib/workflowTaskGuards.js";
import type * as lib_workspaceBindings from "../lib/workspaceBindings.js";
import type * as loopEngineering from "../loopEngineering.js";
import type * as loops from "../loops.js";
import type * as meetings from "../meetings.js";
import type * as memoryLifecycle from "../memoryLifecycle.js";
import type * as messages from "../messages.js";
import type * as metrics from "../metrics.js";
import type * as migrations_backfillInstanceRefs from "../migrations/backfillInstanceRefs.js";
import type * as mission from "../mission.js";
import type * as missionChat from "../missionChat.js";
import type * as missions from "../missions.js";
import type * as modelCatalog from "../modelCatalog.js";
import type * as modelRoutingDecisions from "../modelRoutingDecisions.js";
import type * as modelRoutingPolicies from "../modelRoutingPolicies.js";
import type * as monitoring from "../monitoring.js";
import type * as notifications from "../notifications.js";
import type * as openclawDiscovery from "../openclawDiscovery.js";
import type * as operations_opEvents from "../operations/opEvents.js";
import type * as operatorControls from "../operatorControls.js";
import type * as orgAssignments from "../orgAssignments.js";
import type * as orgMembers from "../orgMembers.js";
import type * as planning from "../planning.js";
import type * as policy from "../policy.js";
import type * as prd from "../prd.js";
import type * as projects from "../projects.js";
import type * as qcArtifacts from "../qcArtifacts.js";
import type * as qcFindings from "../qcFindings.js";
import type * as qcMetrics from "../qcMetrics.js";
import type * as qcRulesets from "../qcRulesets.js";
import type * as qcRuns from "../qcRuns.js";
import type * as quotaTracking from "../quotaTracking.js";
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
import type * as seedAgentHiring from "../seedAgentHiring.js";
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
import type * as taskRelations from "../taskRelations.js";
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
import type * as workOrders from "../workOrders.js";
import type * as workflowMetrics from "../workflowMetrics.js";
import type * as workflowRuns from "../workflowRuns.js";
import type * as workflows from "../workflows.js";
import type * as workspaceHostBindings from "../workspaceHostBindings.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  activities: typeof activities;
  agentDocuments: typeof agentDocuments;
  agentHiring: typeof agentHiring;
  agentLearning: typeof agentLearning;
  agents: typeof agents;
  alertRules: typeof alertRules;
  alerts: typeof alerts;
  analytics: typeof analytics;
  apiCollections: typeof apiCollections;
  approvals: typeof approvals;
  captures: typeof captures;
  codegen: typeof codegen;
  comments: typeof comments;
  contentDrops: typeof contentDrops;
  "context/activation": typeof context_activation;
  "context/analyzeGithubRepo": typeof context_analyzeGithubRepo;
  "context/changeRisk": typeof context_changeRisk;
  "context/evals": typeof context_evals;
  "context/importSkills": typeof context_importSkills;
  "context/manifests": typeof context_manifests;
  "context/packageFiles": typeof context_packageFiles;
  "context/packages": typeof context_packages;
  "context/verifiers": typeof context_verifiers;
  coordinator: typeof coordinator;
  costEvents: typeof costEvents;
  crons: typeof crons;
  e2e: typeof e2e;
  "eos/projections": typeof eos_projections;
  execution: typeof execution;
  executionRequests: typeof executionRequests;
  executorRouter: typeof executorRouter;
  executors: typeof executors;
  "factory/agentFleet": typeof factory_agentFleet;
  "factory/codeReviewWizard": typeof factory_codeReviewWizard;
  "factory/githubCi": typeof factory_githubCi;
  "factory/health": typeof factory_health;
  "factory/metaLoop": typeof factory_metaLoop;
  "factory/piBridge": typeof factory_piBridge;
  "factory/prChecks": typeof factory_prChecks;
  "factory/repetitiveTasks": typeof factory_repetitiveTasks;
  "factory/workflows": typeof factory_workflows;
  featureFlags: typeof featureFlags;
  flakySteps: typeof flakySteps;
  gatewayConnection: typeof gatewayConnection;
  gherkin: typeof gherkin;
  github: typeof github;
  goals: typeof goals;
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
  knowledge: typeof knowledge;
  knowledgeGraph: typeof knowledgeGraph;
  "lib/agentResolver": typeof lib_agentResolver;
  "lib/armAudit": typeof lib_armAudit;
  "lib/armCompat": typeof lib_armCompat;
  "lib/armPolicy": typeof lib_armPolicy;
  "lib/contextActivation": typeof lib_contextActivation;
  "lib/contextEvals": typeof lib_contextEvals;
  "lib/contextManifests": typeof lib_contextManifests;
  "lib/contextPackages": typeof lib_contextPackages;
  "lib/contextRegistryGate": typeof lib_contextRegistryGate;
  "lib/demoSeedExtensions": typeof lib_demoSeedExtensions;
  "lib/evalFrameworkGate": typeof lib_evalFrameworkGate;
  "lib/factoryHealth": typeof lib_factoryHealth;
  "lib/factoryOverview": typeof lib_factoryOverview;
  "lib/factoryProjectSeed": typeof lib_factoryProjectSeed;
  "lib/fileTree": typeof lib_fileTree;
  "lib/flags": typeof lib_flags;
  "lib/genomeHash": typeof lib_genomeHash;
  "lib/getActiveTenant": typeof lib_getActiveTenant;
  "lib/githubCiIngest": typeof lib_githubCiIngest;
  "lib/githubRepoSkills": typeof lib_githubRepoSkills;
  "lib/harnessPrChecks": typeof lib_harnessPrChecks;
  "lib/knowledgeGraph": typeof lib_knowledgeGraph;
  "lib/legacyToolPolicy": typeof lib_legacyToolPolicy;
  "lib/loopEngineering": typeof lib_loopEngineering;
  "lib/mergeGates": typeof lib_mergeGates;
  "lib/missionGovernance": typeof lib_missionGovernance;
  "lib/modelRouting": typeof lib_modelRouting;
  "lib/operatorControls": typeof lib_operatorControls;
  "lib/outputValidation": typeof lib_outputValidation;
  "lib/piBridgeEnvelope": typeof lib_piBridgeEnvelope;
  "lib/prdParser": typeof lib_prdParser;
  "lib/repetitiveTasks": typeof lib_repetitiveTasks;
  "lib/riskClassifier": typeof lib_riskClassifier;
  "lib/runInspector": typeof lib_runInspector;
  "lib/sanitize": typeof lib_sanitize;
  "lib/stateMachine": typeof lib_stateMachine;
  "lib/taskEvents": typeof lib_taskEvents;
  "lib/workOrderCompat": typeof lib_workOrderCompat;
  "lib/workOrderDispatch": typeof lib_workOrderDispatch;
  "lib/workOrderGovernance": typeof lib_workOrderGovernance;
  "lib/workOrderParentSync": typeof lib_workOrderParentSync;
  "lib/workOrderRevision": typeof lib_workOrderRevision;
  "lib/workOrders": typeof lib_workOrders;
  "lib/workflowObservability": typeof lib_workflowObservability;
  "lib/workflowRunState": typeof lib_workflowRunState;
  "lib/workflowTaskGuards": typeof lib_workflowTaskGuards;
  "lib/workspaceBindings": typeof lib_workspaceBindings;
  loopEngineering: typeof loopEngineering;
  loops: typeof loops;
  meetings: typeof meetings;
  memoryLifecycle: typeof memoryLifecycle;
  messages: typeof messages;
  metrics: typeof metrics;
  "migrations/backfillInstanceRefs": typeof migrations_backfillInstanceRefs;
  mission: typeof mission;
  missionChat: typeof missionChat;
  missions: typeof missions;
  modelCatalog: typeof modelCatalog;
  modelRoutingDecisions: typeof modelRoutingDecisions;
  modelRoutingPolicies: typeof modelRoutingPolicies;
  monitoring: typeof monitoring;
  notifications: typeof notifications;
  openclawDiscovery: typeof openclawDiscovery;
  "operations/opEvents": typeof operations_opEvents;
  operatorControls: typeof operatorControls;
  orgAssignments: typeof orgAssignments;
  orgMembers: typeof orgMembers;
  planning: typeof planning;
  policy: typeof policy;
  prd: typeof prd;
  projects: typeof projects;
  qcArtifacts: typeof qcArtifacts;
  qcFindings: typeof qcFindings;
  qcMetrics: typeof qcMetrics;
  qcRulesets: typeof qcRulesets;
  qcRuns: typeof qcRuns;
  quotaTracking: typeof quotaTracking;
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
  seedAgentHiring: typeof seedAgentHiring;
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
  taskRelations: typeof taskRelations;
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
  workOrders: typeof workOrders;
  workflowMetrics: typeof workflowMetrics;
  workflowRuns: typeof workflowRuns;
  workflows: typeof workflows;
  workspaceHostBindings: typeof workspaceHostBindings;
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
