/**
 * Typed Convex API surface used by the orchestration server.
 * Centralizes function paths so schema/API renames are updated in one place.
 */

export const ConvexQueries = {
  tasks: {
    listByStatus: "tasks:listByStatus",
    listAll: "tasks:listAll",
  },
  agents: {
    listAll: "agents:listAll",
  },
  gatewayConnection: {
    get: "gatewayConnection:get",
  },
} as const;

export const ConvexMutations = {
  tasks: {
    create: "tasks:create",
  },
  workOrders: {
    dispatch: "workOrders:dispatch",
  },
  taskRouter: {
    autoAssign: "taskRouter:autoAssign",
  },
  alerts: {
    create: "alerts:create",
  },
} as const;
