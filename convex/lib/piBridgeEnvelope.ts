type WorkOrderLike = {
  acceptanceCriteria: Array<{ id: string }>;
  state: string;
};

type RunLike = {
  workOrderId?: string;
  status: string;
};

type ReceiptLike = {
  acceptanceCriterionId: string;
  status: string;
};

export function validateReceiptPacket(input: {
  workOrder: WorkOrderLike;
  run: RunLike;
  receipts: ReceiptLike[];
  piSessionId?: string;
  piExecutionId?: string;
}): void {
  if (!input.piSessionId && !input.piExecutionId) {
    throw new Error("Pi receipt packet requires piSessionId or piExecutionId");
  }
  if (input.receipts.length === 0) {
    throw new Error("Receipt packet must include at least one verification receipt");
  }
  const criterionIds = new Set(input.workOrder.acceptanceCriteria.map((c) => c.id));
  for (const receipt of input.receipts) {
    if (!criterionIds.has(receipt.acceptanceCriterionId)) {
      throw new Error(`Unknown acceptance criterion: ${receipt.acceptanceCriterionId}`);
    }
  }
}
