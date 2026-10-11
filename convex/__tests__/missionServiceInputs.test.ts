import { describe, expect, it } from "vitest";
import { serviceInputLineageRow } from "../lib/missionServiceInputs";
const handoff = "h".repeat(32), foreign = "f".repeat(32), workOrderId = "w".repeat(32);
const authority = {workOrderId,dependencyHandoffIds:[handoff]};
describe("delegated input identity references", () => {
  it("recognizes only exact bound handoff text inside approved input paths", () => {
    const row = {workOrderId,context:{handoff},executionManifest:{workflow:{steps:[{operation:{input:{text:`${handoff} ${foreign}`}}}]}},workflowSnapshot:{steps:[{input:handoff}]}};
    const original=JSON.stringify(row), inspected=serviceInputLineageRow(row,"workflowRuns",authority);
    expect(inspected.executionManifest.workflow.steps[0].operation.input.text).toBe(`authorized-dependency-handoff ${foreign}`);
    expect(inspected.context.handoff).toBe(handoff);
    expect(JSON.stringify(row)).toBe(original);
  });
  it("does not authorize direct handoffs, foreign WorkOrders or unrelated resource copies", () => {
    for(const table of ["missionHandoffs","workOrders","evidenceEnvelopes","qualityGateDecisions"]){
      const row={workOrderId,metadata:{handoff}};
      expect(serviceInputLineageRow(row,table,authority)).toBe(row);
    }
    const foreignRun={workOrderId:foreign,workflowSnapshot:{steps:[{input:handoff}]}};
    expect(serviceInputLineageRow(foreignRun,"workflowRuns",authority)).toBe(foreignRun);
  });
  it("recognizes copied handoff text only in own retained candidate file content", () => {
    const result={candidateFiles:[{content:`${handoff} ${foreign}`,path:handoff}],summary:handoff};
    const row={workOrderId,workflowRunId:foreign,metadata:{other:handoff,schema:"factory-offline-attempt-evidence/v1",packet:{request:{workload:{input:handoff}},result,evidence:{validatedRuntimeResult:result}}}};
    const before=JSON.stringify(row), inspected=serviceInputLineageRow(row,"runArtifacts",authority);
    expect(inspected.metadata.packet.result.candidateFiles[0].content).toBe(`authorized-dependency-handoff ${foreign}`);
    expect(inspected.metadata.packet.result.summary).toBe(handoff);
    expect(inspected.metadata.packet.result.candidateFiles[0].path).toBe(handoff);
    expect(inspected.metadata.other).toBe(handoff);
    expect(inspected.workflowRunId).toBe(foreign);
    expect(JSON.stringify(row)).toBe(before);
    const wrongSchema={...row,metadata:{...row.metadata,schema:"other"}};
    expect(serviceInputLineageRow(wrongSchema,"runArtifacts",authority)).toBe(wrongSchema);
    expect(inspected.metadata.packet.evidence.validatedRuntimeResult.candidateFiles[0].content).toBe(`authorized-dependency-handoff ${foreign}`);
    expect(serviceInputLineageRow({...row,workOrderId:foreign},"runArtifacts",authority).metadata.packet).toBe(row.metadata.packet);
  });
  it("retains unbound handoffs and typed references even in policy snapshots", () => {
    const row={steps:[{input:foreign,handoffId:handoff}],metadata:{handoff}};
    const inspected=serviceInputLineageRow(row,"workflows",authority);
    expect(inspected.steps[0]).toEqual(row.steps[0]);
    expect(inspected.metadata).toEqual(row.metadata);
  });
});
