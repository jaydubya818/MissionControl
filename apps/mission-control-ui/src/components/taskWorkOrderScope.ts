export type TaskWorkOrderScope =
  | { status: "UNSCOPED"; workOrder: null }
  | { status: "LOADING"; workOrder: null }
  | { status: "UNAVAILABLE"; workOrder: null }
  | { status: "FOUND"; workOrder: { _id: string; title: string } };

export function resolveTaskWorkOrderScope(
  requestedWorkOrderId: string | null,
  workOrders: Array<{ _id: string; title: string }> | undefined,
): TaskWorkOrderScope {
  if (!requestedWorkOrderId) return { status: "UNSCOPED", workOrder: null };
  if (!workOrders) return { status: "LOADING", workOrder: null };

  const workOrder = workOrders.find((candidate) => candidate._id === requestedWorkOrderId);
  return workOrder
    ? { status: "FOUND", workOrder }
    : { status: "UNAVAILABLE", workOrder: null };
}
