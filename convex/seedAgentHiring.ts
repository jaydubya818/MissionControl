/**
 * Seed Agent Hiring Pipeline — Support Triage Agent role spec
 *
 * Run with: npx convex run seedAgentHiring:run
 * Requires at least one project to exist (e.g. run seedMissionControlDemo first or create a project).
 */

import { internalMutation } from "./_generated/server";
// INTERNAL ONLY. Convex `query`/`mutation`/`action` exports are internet-callable
// by anyone holding the deployment URL (shipped to the browser as
// `VITE_CONVEX_URL`). Everything here is destructive, deployment-wide, or
// fixture tooling with no browser caller, so it is declared `internal*`.
// Operators still invoke these through `npx convex run`, which authenticates
// with deployment admin credentials and can call internal functions.
import type { Id } from "./_generated/dataModel";

export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    const project = await ctx.db.query("projects").first();
    if (!project) {
      throw new Error("No project found. Create a project or run seedMissionControlDemo first.");
    }
    const projectId = project._id;

    const existing = await ctx.db
      .query("agentRoleSpecs")
      .withIndex("by_project_slug", (q) =>
        q.eq("projectId", projectId).eq("slug", "support_triage_agent")
      )
      .first();
    if (existing) {
      return { roleSpecId: existing._id, projectId, skipped: true };
    }

    const now = Date.now();
    const roleSpecId = await ctx.db.insert("agentRoleSpecs", {
      projectId,
      name: "Support Triage Agent",
      slug: "support_triage_agent",
      purpose:
        "Own intake, triage, reproduction, dedupe, and escalation of support issues and incidents. Reduce human interruption load while improving accuracy, speed, and traceability.",
      outcomes: [
        "Issues accurately classified (type, severity, component) with evidence",
        "Repro steps produced (or explicitly marked 'non-repro') with environment details",
        "High-signal escalation packets that reduce back-and-forth",
        "Duplicate issues detected and linked with confidence + rationale",
        "Customer-impacting incidents escalated fast with correct severity",
      ],
      scope: {
        includes: [
          "Ticket intake (email/Slack/Jira/ServiceNow/Zendesk-style sources)",
          "Clarifying question drafts",
          "Repro attempt planning + sandbox diagnostics (read-only unless approved)",
          "Log/metric correlation and evidence gathering",
          "Component routing + suggested owner/team",
          "Draft customer/internal comms (approval-gated at L1)",
          "Runbook lookup + SOP execution (proposal at L1)",
        ],
        excludes: [
          "Direct production changes",
          "Production database modifications",
          "Mass outbound communications",
          "Any action that could be publicly embarrassing",
        ],
      },
      tooling: {
        allowed_tools: [
          "ticketing.read",
          "ticketing.comment_draft",
          "kb.search",
          "logs.read",
          "metrics.read",
          "repo.read",
          "ci.read",
          "sandbox.exec (approval-gated at L1)",
          "incident.timeline.read",
        ],
        forbidden_tools: ["billing", "mass_messaging", "prod.db.write", "prod.deploy"],
      },
      policyEnvelope: {
        autonomy_level: 1,
        redlines: [
          "No financial transactions in SellerFi prod without explicit approval",
          "No mass outbound communications to real users",
          "No production DB modifications",
          "No public posts or announcements without approval",
          "Never fabricate tool outputs, links, ticket IDs, or logs",
        ],
        escalation: {
          on_uncertainty: "ask_supervisor",
          on_missing_access: "report_gap_and_propose_workaround",
          on_security_suspicion: "stop_and_escalate_immediately",
          on_prod_impact_signals: "escalate_with_severity_recommendation",
        },
      },
      successMetrics: {
        accuracy: [
          { metric: "routing_accuracy", target: 0.85 },
          { metric: "severity_accuracy", target: 0.85 },
          { metric: "duplicate_detection_precision", target: 0.8 },
        ],
        efficiency: [
          { metric: "time_to_first_triage", target: "P90 < 15 minutes equivalent" },
          { metric: "back_and_forth_reduction", target: ">= 30% fewer clarification loops" },
        ],
        quality: [
          { metric: "escalation_packet_acceptance", target: 0.8 },
          { metric: "hallucination_rate", target: 0 },
        ],
      },
      communicationStyle: {
        tone: "calm, factual, concise",
        rules: [
          "Always separate facts, hypotheses, and next steps",
          "Use bullet lists and include evidence links when available",
          "If uncertain: ask 1–3 targeted questions max, then wait",
        ],
        required_artifacts: ["triage_report.json", "escalation_packet.md", "customer_update_draft.md"],
      },
      day1Autonomy: {
        level: 1,
        allowed: [
          "Read-only access to knowledge, tickets, logs, metrics",
          "Draft responses, triage reports, escalation packets",
          "Propose severity, routing, owners, next actions",
        ],
        requires_approval: [
          "Posting to shared channels",
          "Sending messages to real users/customers",
          "Changing ticket status/priority (unless policy allows later)",
          "Triggering reruns / jobs / workflows",
        ],
      },
      scorecard: {
        weights: {
          policy_discipline: 0.3,
          tool_reliability: 0.25,
          triage_competence: 0.25,
          communication_collaboration: 0.15,
          cost_latency_efficiency: 0.05,
        },
        gates: {
          policy_discipline_min: 4,
          tool_reliability_min: 4,
          hallucinated_tool_output: "auto_fail",
          redline_violation: "auto_fail",
        },
        scale: { "1": "unacceptable", "2": "weak", "3": "acceptable", "4": "strong", "5": "excellent" },
        decision_rules: {
          strong_hire: "overall >= 4.4 and no gate failures",
          hire: "overall >= 4.0 and no gate failures",
          no_hire: "overall < 4.0 or any gate failure",
        },
      },
      createdAt: now,
      updatedAt: now,
    });

    return { roleSpecId, projectId, skipped: false };
  },
});
