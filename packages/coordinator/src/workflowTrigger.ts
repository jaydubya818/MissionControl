/**
 * Workflow Trigger
 * 
 * Determines when to automatically trigger a workflow based on task characteristics.
 * Implements smart workflow selection based on task type, description, and context.
 */

export interface TaskAnalysis {
  taskId: string;
  title: string;
  description: string;
  type: string;
  suggestedWorkflow?: string;
  confidence: number; // 0-1
  reasoning: string;
}

/**
 * Analyze a task and suggest a workflow if appropriate
 */
export function analyzeForWorkflow(task: {
  id: string;
  title: string;
  description: string;
  type: string;
}): TaskAnalysis {
  const lowerTitle = task.title.toLowerCase();
  const lowerDesc = task.description.toLowerCase();
  const combined = `${lowerTitle} ${lowerDesc}`;
  
  // Feature development patterns
  if (
    matchesPattern(combined, [
      "add feature",
      "implement feature",
      "new feature",
      "build feature",
      "create feature",
      "add functionality",
      "implement functionality",
    ])
  ) {
    return {
      taskId: task.id,
      title: task.title,
      description: task.description,
      type: task.type,
      suggestedWorkflow: "feature-dev",
      confidence: 0.85,
      reasoning: "Task appears to be a feature development request",
    };
  }
  
  // Bug fix patterns
  if (
    matchesPattern(combined, [
      "fix bug",
      "bug fix",
      "fix issue",
      "resolve bug",
      "fix error",
      "broken",
      "not working",
      "doesn't work",
      "fails",
      "crash",
    ])
  ) {
    return {
      taskId: task.id,
      title: task.title,
      description: task.description,
      type: task.type,
      suggestedWorkflow: "bug-fix",
      confidence: 0.9,
      reasoning: "Task appears to be a bug fix request",
    };
  }
  
  // Security audit patterns
  if (
    matchesPattern(combined, [
      "security",
      "vulnerability",
      "audit",
      "cve",
      "exploit",
      "injection",
      "xss",
      "csrf",
      "authentication",
      "authorization",
    ])
  ) {
    return {
      taskId: task.id,
      title: task.title,
      description: task.description,
      type: task.type,
      suggestedWorkflow: "security-audit",
      confidence: 0.8,
      reasoning: "Task appears to be security-related",
    };
  }
  
  // No workflow suggested
  return {
    taskId: task.id,
    title: task.title,
    description: task.description,
    type: task.type,
    confidence: 0,
    reasoning: "No workflow pattern matched",
  };
}

/**
 * Check if text matches any of the given patterns
 */
function matchesPattern(text: string, patterns: string[]): boolean {
  return patterns.some((pattern) => text.includes(pattern));
}

/**
 * Determine if a workflow should be auto-triggered based on confidence threshold
 */
export function shouldAutoTrigger(
  analysis: TaskAnalysis,
  threshold: number = 0.8
): boolean {
  return !!analysis.suggestedWorkflow && analysis.confidence >= threshold;
}

/**
 * Get workflow recommendation message for UI display
 */
export function getWorkflowRecommendation(analysis: TaskAnalysis): string | null {
  if (!analysis.suggestedWorkflow) {
    return null;
  }
  
  const workflowNames: Record<string, string> = {
    "feature-dev": "Feature Development",
    "bug-fix": "Bug Fix",
    "security-audit": "Security Audit",
  };
  
  const workflowName = workflowNames[analysis.suggestedWorkflow] ?? analysis.suggestedWorkflow;
  
  if (analysis.confidence >= 0.8) {
    return `This task is a good candidate for the ${workflowName} workflow (${Math.round(analysis.confidence * 100)}% confidence). Would you like to use it?`;
  } else if (analysis.confidence >= 0.6) {
    return `This task might benefit from the ${workflowName} workflow (${Math.round(analysis.confidence * 100)}% confidence).`;
  }
  
  return null;
}
