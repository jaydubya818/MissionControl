const NOW = Date.parse("2026-08-30T18:00:00.000Z");

export function validIntent(): Record<string, any> {
  const digest = `sha256:${"a".repeat(64)}`;
  return {
    schema_version: "execution-intent/v1",
    intent_id: "executionIntent_shadow1",
    organization_id: "org_phase1demo",
    idempotency_key: "shadow-canary-intent-v1",
    created_at: new Date(NOW - 60_000).toISOString(),
    requested_by: { actor_type: "SERVICE", actor_id: "service_factory1" },
    correlation: {
      correlation_id: "command_shadow1",
      causation_id: "decision_shadow1",
    },
    subject: {
      portfolio_id: "portfolio_shadow1",
      venture_id: "venture_shadow1",
      decision_id: "decision_shadow1",
      product_build_id: "productBuild_shadow1",
    },
    product_build: {
      specification_id: "productSpecification_shadow1",
      specification_revision: 1,
      specification_digest: digest,
      build_plan_id: "productPlan_shadow1",
      build_plan_revision: 1,
      build_plan_digest: digest,
      repository: "local/autonomous-venture-factory",
      base_sha: "b".repeat(40),
      definition_of_done: ["Record one shadow correlation."],
      compute_budget_minor: 0,
      target_environment: "TEST",
      expected_verification: ["TEST", "SECURITY"],
      callback_identity: "callback_factory1",
    },
    desired_business_outcome: {
      statement: "Prove the provider boundary without executing work.",
      success_conditions: [
        {
          id: "evidence_shadow1",
          statement: "One event exists.",
          verification_expectation: "Reconcile sequence 1.",
        },
      ],
      non_goals: ["Dispatch"],
    },
    constraints: {
      required: ["Preserve lineage"],
      prohibited: ["Dispatch", "Spend", "Software acceptance"],
      data_boundaries: [{ classification: "INTERNAL", rule: "No credentials" }],
      stop_conditions: ["Stop on drift"],
    },
    evidence_requirements: {
      criteria: [
        {
          id: "evidence_shadow1",
          statement: "One event exists.",
          required_categories: ["TEST", "SECURITY"],
        },
      ],
      independent_verification_required: true,
      human_review_required: true,
    },
    budget_ceiling: {
      amount_minor: 0,
      currency: "USD",
      reservation_id: "approval_shadow1",
      includes_mission_control_cost: true,
    },
    rights_constraints: {
      decision_ids: ["decision_shadow1"],
      allowed_territories: ["US"],
      prohibited_uses: ["Production execution"],
      derived_artifact_requirements: ["Retain lineage"],
    },
    governance: {
      risk_level: "HIGH",
      policy_decision_id: "policy_shadow1",
      approval_ids: ["approval_shadow1"],
      maximum_autonomy: "L2_PREPARE",
    },
    provenance: {
      input_digest: digest,
      decision_digest: digest,
      evidence_set_digest: digest,
      source_references: [
        {
          kind: "PORTFOLIO_DECISION",
          id: "decision_shadow1",
          version: 1,
          digest,
        },
      ],
    },
    factory_callback: { event_sink_id: "callback_factory1" },
  };
}
