/** Ignore identity text for exact delegated handoffs only inside execution inputs.
 * This changes lineage inspection, never the stored or returned payload. Direct
 * handoff reads and typed resource references still require their own authority.
 */
export function serviceInputLineageRow(row: Record<string, any>, table: string | undefined,
  authority: { workOrderId: string; dependencyHandoffIds: readonly string[] }) {
  if (!authority.dependencyHandoffIds.length) return row;
  const identities = new Set(authority.dependencyHandoffIds);
  function input(value: any): any {
    if (typeof value === "string") return value.replace(/(?<![a-z0-9])[a-z0-9]{32}(?![a-z0-9])/g,
      id => identities.has(id) ? "authorized-dependency-handoff" : id);
    if (Array.isArray(value)) return value.map(input);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, input(item)]));
    return value;
  }
  function steps(value: any, operation: boolean) {
    return Array.isArray(value) ? value.map(step => operation
      ? { ...step, ...(step.operation ? { operation: { ...step.operation, input: input(step.operation.input) } } : {}) }
      : { ...step, input: input(step.input) }) : value;
  }
  if (table === "workflowRuns" && row.workOrderId === authority.workOrderId) return { ...row,
    ...(row.executionManifest ? { executionManifest: { ...row.executionManifest, workflow: {
      ...row.executionManifest.workflow, steps: steps(row.executionManifest.workflow?.steps, true) } } } : {}),
    ...(row.workflowSnapshot ? { workflowSnapshot: { ...row.workflowSnapshot, steps: steps(row.workflowSnapshot.steps, false) } } : {}),
  };
  if (table === "workflows") return { ...row, steps: steps(row.steps, false) };
  if (table === "factoryDefinitionVersions" && row.deterministicOperation) return { ...row,
    deterministicOperation: { ...row.deterministicOperation, input: input(row.deterministicOperation.input) } };
  if (table === "runArtifacts" && row.workOrderId === authority.workOrderId
    && row.metadata?.schema === "factory-offline-attempt-evidence/v1" && row.metadata.packet?.request?.workload) {
    const packet = row.metadata.packet;
    const result = (value: any) => value && ({ ...value, ...(Array.isArray(value.candidateFiles)
      ? { candidateFiles: value.candidateFiles.map((file: any) => ({ ...file, content: input(file.content) })) } : {}) });
    return { ...row, metadata: { ...row.metadata, packet: { ...packet, result: result(packet.result),
      ...(packet.evidence ? { evidence: { ...packet.evidence, validatedRuntimeResult: result(packet.evidence.validatedRuntimeResult) } } : {}), request: { ...packet.request,
      workload: { ...packet.request.workload, input: input(packet.request.workload.input) } } } } };
  }
  return row;
}
