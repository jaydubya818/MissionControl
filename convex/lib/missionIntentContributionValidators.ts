import { v } from "convex/values";

export const missionIntentContributorRoleValidator = v.union(
  v.literal("PRODUCT"),
  v.literal("QA"),
  v.literal("DESIGN"),
  v.literal("ENGINEERING"),
  v.literal("SECURITY_OPERATIONS"),
);

export const missionIntentTargetSectionValidator = v.union(
  v.literal("OUTCOME"),
  v.literal("REQUIREMENTS"),
  v.literal("NON_FUNCTIONAL_REQUIREMENTS"),
  v.literal("ACCEPTANCE_EXPECTATIONS"),
  v.literal("VERIFICATION_EXPECTATIONS"),
  v.literal("NON_GOALS"),
  v.literal("CONSTRAINTS"),
  v.literal("RISKS"),
  v.literal("REPOSITORY_SCOPE"),
);

export const missionIntentDecisionValidator = v.union(
  v.literal("ACCEPTED"),
  v.literal("REJECTED"),
);
