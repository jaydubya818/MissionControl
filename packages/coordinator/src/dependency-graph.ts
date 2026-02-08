/**
 * Dependency Graph
 * 
 * Manages task dependency relationships:
 *   - Build a directed acyclic graph (DAG) of task dependencies
 *   - Topological sort for execution ordering
 *   - Cycle detection to prevent deadlocks
 *   - Critical path analysis
 */

export interface DependencyNode {
  id: string;
  title: string;
  status: string;
  dependsOn: string[];
  dependedOnBy: string[];
}

export interface DependencyGraph {
  nodes: Map<string, DependencyNode>;
  edges: Array<{ from: string; to: string }>;
}

/**
 * Build a dependency graph from a list of tasks.
 */
export function buildDependencyGraph(
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    dependsOn: string[];
  }>
): DependencyGraph {
  const nodes = new Map<string, DependencyNode>();
  const edges: Array<{ from: string; to: string }> = [];
  
  // Create nodes
  for (const task of tasks) {
    nodes.set(task.id, {
      id: task.id,
      title: task.title,
      status: task.status,
      dependsOn: task.dependsOn,
      dependedOnBy: [],
    });
  }
  
  // Create edges and back-references
  for (const task of tasks) {
    for (const depId of task.dependsOn) {
      edges.push({ from: depId, to: task.id });
      const depNode = nodes.get(depId);
      if (depNode) {
        depNode.dependedOnBy.push(task.id);
      }
    }
  }
  
  return { nodes, edges };
}

/**
 * Topological sort of the dependency graph.
 * Returns task IDs in execution order (dependencies first).
 * Throws if cycles are detected.
 */
export function topologicalSort(graph: DependencyGraph): string[] {
  const visited = new Set<string>();
  const visiting = new Set<string>(); // For cycle detection
  const result: string[] = [];
  
  function visit(nodeId: string): void {
    if (visited.has(nodeId)) return;
    
    if (visiting.has(nodeId)) {
      throw new Error(`Circular dependency detected involving task: ${nodeId}`);
    }
    
    visiting.add(nodeId);
    
    const node = graph.nodes.get(nodeId);
    if (node) {
      for (const depId of node.dependsOn) {
        if (graph.nodes.has(depId)) {
          visit(depId);
        }
      }
    }
    
    visiting.delete(nodeId);
    visited.add(nodeId);
    result.push(nodeId);
  }
  
  for (const nodeId of graph.nodes.keys()) {
    visit(nodeId);
  }
  
  return result;
}

/**
 * Detect cycles in the dependency graph.
 * Returns an array of cycle paths (empty array = no cycles).
 */
export function detectCycles(graph: DependencyGraph): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const path: string[] = [];
  const pathSet = new Set<string>();
  
  function dfs(nodeId: string): void {
    if (pathSet.has(nodeId)) {
      // Found a cycle: extract it from the path
      const cycleStart = path.indexOf(nodeId);
      cycles.push([...path.slice(cycleStart), nodeId]);
      return;
    }
    
    if (visited.has(nodeId)) return;
    
    path.push(nodeId);
    pathSet.add(nodeId);
    
    const node = graph.nodes.get(nodeId);
    if (node) {
      for (const depId of node.dependsOn) {
        if (graph.nodes.has(depId)) {
          dfs(depId);
        }
      }
    }
    
    path.pop();
    pathSet.delete(nodeId);
    visited.add(nodeId);
  }
  
  for (const nodeId of graph.nodes.keys()) {
    dfs(nodeId);
  }
  
  return cycles;
}

/**
 * Find all tasks that are ready to execute (all dependencies met).
 */
export function findReadyTasks(
  graph: DependencyGraph,
  terminalStatuses: string[] = ["DONE", "CANCELED"]
): string[] {
  const ready: string[] = [];
  
  for (const [id, node] of graph.nodes) {
    // Skip already terminal tasks
    if (terminalStatuses.includes(node.status)) continue;
    
    // Skip tasks already in progress
    if (node.status === "IN_PROGRESS") continue;
    
    // Check if all dependencies are satisfied
    const allDepsResolved = node.dependsOn.every((depId) => {
      const depNode = graph.nodes.get(depId);
      return depNode && terminalStatuses.includes(depNode.status);
    });
    
    if (allDepsResolved) {
      ready.push(id);
    }
  }
  
  return ready;
}

/**
 * Calculate the critical path (longest dependency chain).
 * Returns the sequence of task IDs on the critical path.
 */
export function criticalPath(
  graph: DependencyGraph,
  estimatedMinutes: Map<string, number>
): { path: string[]; totalMinutes: number } {
  const memo = new Map<string, { path: string[]; totalMinutes: number }>();
  
  function longestFrom(nodeId: string): { path: string[]; totalMinutes: number } {
    if (memo.has(nodeId)) return memo.get(nodeId)!;
    
    const node = graph.nodes.get(nodeId);
    const myMinutes = estimatedMinutes.get(nodeId) ?? 0;
    
    if (!node || node.dependedOnBy.length === 0) {
      const result = { path: [nodeId], totalMinutes: myMinutes };
      memo.set(nodeId, result);
      return result;
    }
    
    let longest: { path: string[]; totalMinutes: number } = {
      path: [],
      totalMinutes: 0,
    };
    
    for (const childId of node.dependedOnBy) {
      const child = longestFrom(childId);
      if (child.totalMinutes > longest.totalMinutes) {
        longest = child;
      }
    }
    
    const result = {
      path: [nodeId, ...longest.path],
      totalMinutes: myMinutes + longest.totalMinutes,
    };
    memo.set(nodeId, result);
    return result;
  }
  
  // Find root nodes (no dependencies)
  const roots = [...graph.nodes.entries()]
    .filter(([, node]) => node.dependsOn.length === 0)
    .map(([id]) => id);
  
  let overall: { path: string[]; totalMinutes: number } = {
    path: [],
    totalMinutes: 0,
  };
  
  for (const rootId of roots) {
    const result = longestFrom(rootId);
    if (result.totalMinutes > overall.totalMinutes) {
      overall = result;
    }
  }
  
  return overall;
}
