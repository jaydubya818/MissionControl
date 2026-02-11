/**
 * Workflow Engine
 * 
 * Multi-agent workflow execution inspired by Antfarm.
 * 
 * Key patterns:
 * - Deterministic workflows (same steps, same order)
 * - Agent verification (separate verifier checks implementer's work)
 * - Fresh context per step (Ralph loop pattern)
 * - Retry and escalation (automatic retry, then human approval)
 * - Template-based inputs ({{variable}} substitution)
 */

export {
  WorkflowExecutor,
  createExecutor,
  type WorkflowExecutorConfig,
  type StepExecutionResult,
} from "./executor";

export {
  render,
  extractVariables,
  validateContext,
  type RenderContext,
} from "./renderer";

export {
  parse,
  meetsExpectations,
  extractData,
  type ParsedOutput,
} from "./parser";

export {
  loadWorkflow,
  loadAllWorkflows,
  validateWorkflow,
  type WorkflowDefinition,
  type WorkflowValidationError,
} from "./loader";
