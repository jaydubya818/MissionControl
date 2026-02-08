/**
 * Task Decomposer
 * 
 * Breaks complex tasks into smaller, assignable subtasks.
 * Rules:
 *   - 2-7 subtasks per decomposition
 *   - Each subtask must have a clear deliverable
 *   - Dependencies between subtasks are explicit
 *   - Task types match available agent capabilities
 */

export interface Subtask {
  title: string;
  description: string;
  type: string;
  priority: 1 | 2 | 3 | 4;
  estimatedMinutes: number;
  dependsOn: number[]; // Indices into the subtask array
  requiredCapabilities: string[];
  deliverable: string;
}

export interface DecompositionResult {
  parentTaskId: string;
  subtasks: Subtask[];
  reasoning: string;
  estimatedTotalMinutes: number;
}

export interface TaskInput {
  id: string;
  title: string;
  description: string;
  type: string;
  priority: 1 | 2 | 3 | 4;
}

/**
 * Decompose a complex task into subtasks.
 * 
 * This is a structural decomposer that uses heuristics to determine
 * the right number and shape of subtasks. For AI-powered decomposition,
 * this output is passed as context to an LLM call.
 */
export function decompose(task: TaskInput): DecompositionResult {
  const subtasks: Subtask[] = [];
  
  // Determine decomposition strategy based on task type
  const strategy = getDecompositionStrategy(task.type);
  
  for (const phase of strategy.phases) {
    subtasks.push({
      title: `${phase.verb} — ${task.title}`,
      description: `${phase.description} for: ${task.description}`,
      type: phase.subtaskType ?? task.type,
      priority: task.priority,
      estimatedMinutes: phase.estimatedMinutes,
      dependsOn: phase.dependsOnPhaseIndex ?? [],
      requiredCapabilities: phase.requiredCapabilities,
      deliverable: phase.deliverable,
    });
  }
  
  const estimatedTotalMinutes = subtasks.reduce(
    (sum, s) => sum + s.estimatedMinutes,
    0
  );
  
  return {
    parentTaskId: task.id,
    subtasks,
    reasoning: `Decomposed "${task.title}" into ${subtasks.length} subtasks using ${strategy.name} strategy`,
    estimatedTotalMinutes,
  };
}

// ============================================================================
// Decomposition Strategies
// ============================================================================

interface DecompositionPhase {
  verb: string;
  description: string;
  subtaskType?: string;
  estimatedMinutes: number;
  dependsOnPhaseIndex?: number[];
  requiredCapabilities: string[];
  deliverable: string;
}

interface DecompositionStrategy {
  name: string;
  phases: DecompositionPhase[];
}

function getDecompositionStrategy(taskType: string): DecompositionStrategy {
  const strategies: Record<string, DecompositionStrategy> = {
    ENGINEERING: {
      name: "engineering",
      phases: [
        {
          verb: "Research",
          description: "Investigate requirements and existing code",
          subtaskType: "RESEARCH",
          estimatedMinutes: 30,
          requiredCapabilities: ["code_analysis", "research"],
          deliverable: "Research summary with approach recommendation",
        },
        {
          verb: "Implement",
          description: "Write the core implementation",
          estimatedMinutes: 60,
          dependsOnPhaseIndex: [0],
          requiredCapabilities: ["code_generation", "file_operations"],
          deliverable: "Working implementation with inline comments",
        },
        {
          verb: "Test",
          description: "Write and run tests",
          estimatedMinutes: 30,
          dependsOnPhaseIndex: [1],
          requiredCapabilities: ["testing", "code_generation"],
          deliverable: "Test suite with passing results",
        },
        {
          verb: "Document",
          description: "Update documentation",
          subtaskType: "DOCS",
          estimatedMinutes: 15,
          dependsOnPhaseIndex: [1],
          requiredCapabilities: ["documentation"],
          deliverable: "Updated docs reflecting the changes",
        },
      ],
    },
    CONTENT: {
      name: "content",
      phases: [
        {
          verb: "Research",
          description: "Research topic and gather sources",
          subtaskType: "CUSTOMER_RESEARCH",
          estimatedMinutes: 20,
          requiredCapabilities: ["research", "web_search"],
          deliverable: "Research brief with key points and sources",
        },
        {
          verb: "Draft",
          description: "Write the first draft",
          estimatedMinutes: 40,
          dependsOnPhaseIndex: [0],
          requiredCapabilities: ["content_creation"],
          deliverable: "Complete first draft",
        },
        {
          verb: "Review",
          description: "Review and revise for quality",
          estimatedMinutes: 20,
          dependsOnPhaseIndex: [1],
          requiredCapabilities: ["content_review", "editing"],
          deliverable: "Polished final draft",
        },
      ],
    },
    OPS: {
      name: "operations",
      phases: [
        {
          verb: "Audit",
          description: "Audit current state and identify gaps",
          estimatedMinutes: 20,
          requiredCapabilities: ["system_audit", "monitoring"],
          deliverable: "Audit report with findings",
        },
        {
          verb: "Plan",
          description: "Create execution plan",
          estimatedMinutes: 15,
          dependsOnPhaseIndex: [0],
          requiredCapabilities: ["planning"],
          deliverable: "Step-by-step execution plan",
        },
        {
          verb: "Execute",
          description: "Execute the planned changes",
          estimatedMinutes: 30,
          dependsOnPhaseIndex: [1],
          requiredCapabilities: ["system_operations"],
          deliverable: "Completed operation with verification",
        },
      ],
    },
  };
  
  // Default strategy for unrecognized types
  return strategies[taskType] ?? {
    name: "generic",
    phases: [
      {
        verb: "Research",
        description: "Investigate and plan approach",
        estimatedMinutes: 20,
        requiredCapabilities: ["research"],
        deliverable: "Approach recommendation",
      },
      {
        verb: "Execute",
        description: "Perform the main work",
        estimatedMinutes: 45,
        dependsOnPhaseIndex: [0],
        requiredCapabilities: [],
        deliverable: "Completed deliverable",
      },
      {
        verb: "Review",
        description: "Quality check the output",
        estimatedMinutes: 15,
        dependsOnPhaseIndex: [1],
        requiredCapabilities: ["review"],
        deliverable: "Quality-verified output",
      },
    ],
  };
}
