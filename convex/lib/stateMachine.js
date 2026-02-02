"use strict";
/**
 * Task State Machine Validator (Convex-safe, no external deps)
 * Mirrors packages/state-machine logic for use in Convex mutations.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateTransition = validateTransition;
const TRANSITION_RULES = [
    { from: "inbox", to: "assigned", allowedActors: ["agent", "human", "system"], requiresArtifacts: ["assigneeIds"] },
    { from: "inbox", to: "needs_approval", allowedActors: ["system"] },
    { from: "inbox", to: "blocked", allowedActors: ["system", "human"] },
    { from: "inbox", to: "canceled", allowedActors: ["human"] },
    { from: "assigned", to: "in_progress", allowedActors: ["agent", "human"], requiresArtifacts: ["workPlan"] },
    { from: "assigned", to: "needs_approval", allowedActors: ["system"] },
    { from: "assigned", to: "blocked", allowedActors: ["system", "human"] },
    { from: "assigned", to: "canceled", allowedActors: ["human"] },
    { from: "assigned", to: "inbox", allowedActors: ["human"] },
    { from: "in_progress", to: "review", allowedActors: ["agent", "human"], requiresArtifacts: ["deliverable", "selfReview"] },
    { from: "in_progress", to: "needs_approval", allowedActors: ["system"] },
    { from: "in_progress", to: "blocked", allowedActors: ["system", "human"] },
    { from: "in_progress", to: "canceled", allowedActors: ["human"] },
    { from: "in_progress", to: "assigned", allowedActors: ["human"] },
    { from: "review", to: "in_progress", allowedActors: ["agent", "human"] },
    { from: "review", to: "done", allowedActors: ["human"], requiresArtifacts: ["approvalRecord"] },
    { from: "review", to: "needs_approval", allowedActors: ["system", "human"] },
    { from: "review", to: "blocked", allowedActors: ["system", "human"] },
    { from: "review", to: "canceled", allowedActors: ["human"] },
    { from: "review", to: "assigned", allowedActors: ["human"] },
    { from: "needs_approval", to: "blocked", allowedActors: ["system", "human"] },
    { from: "needs_approval", to: "assigned", allowedActors: ["human"] },
    { from: "needs_approval", to: "in_progress", allowedActors: ["human"] },
    { from: "needs_approval", to: "review", allowedActors: ["human"] },
    { from: "needs_approval", to: "done", allowedActors: ["human"], requiresArtifacts: ["approvalRecord"] },
    { from: "needs_approval", to: "canceled", allowedActors: ["human"] },
    { from: "blocked", to: "assigned", allowedActors: ["human"] },
    { from: "blocked", to: "in_progress", allowedActors: ["human"] },
    { from: "blocked", to: "needs_approval", allowedActors: ["human", "system"] },
    { from: "blocked", to: "canceled", allowedActors: ["human"] },
    { from: "done", to: "review", allowedActors: ["human"] },
    { from: "done", to: "canceled", allowedActors: ["human"] },
];
function findRule(from, to) {
    return TRANSITION_RULES.find((r) => r.from === from && r.to === to);
}
function isValidTransition(from, to) {
    return TRANSITION_RULES.some((r) => r.from === from && r.to === to);
}
function validateTransition(from, to, actor, artifacts) {
    if (!isValidTransition(from, to)) {
        return { valid: false, error: `Invalid transition: ${from} → ${to}. This transition is not allowed.` };
    }
    const rule = findRule(from, to);
    if (!rule) {
        return { valid: false, error: `Internal error: transition rule not found for ${from} → ${to}` };
    }
    if (!rule.allowedActors.includes(actor)) {
        return {
            valid: false,
            error: `Actor '${actor}' is not allowed to perform transition ${from} → ${to}. Allowed: ${rule.allowedActors.join(", ")}`,
        };
    }
    const provided = artifacts ?? {};
    const required = rule.requiresArtifacts ?? [];
    for (const key of required) {
        const value = provided[key];
        if (key === "assigneeIds") {
            const arr = value;
            if (!arr || !Array.isArray(arr) || arr.length === 0) {
                return { valid: false, error: `Missing required artifact: ${key}` };
            }
        }
        else if (!value) {
            return { valid: false, error: `Missing required artifact: ${key}` };
        }
    }
    return { valid: true };
}
