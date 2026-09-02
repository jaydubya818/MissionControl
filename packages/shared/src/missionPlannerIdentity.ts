import { canonicalHash } from "./canonicalDigest.js";

export const BUILT_IN_MISSION_PLANNER_IDENTITY = Object.freeze({
  kind: "BUILT_IN" as const,
  plannerId: "mission-planner",
  version: "v1",
  displayName: "Mission Planner",
  researchPromptVersion: "mission-planner-research/v1",
  generationPromptVersion: "mission-planner-generation/v1",
});

export const BUILT_IN_MISSION_PLANNER_CONFIG_DIGEST = `sha256:${canonicalHash(
  BUILT_IN_MISSION_PLANNER_IDENTITY,
)}`;

export function missionPlannerActorId() {
  return `planner:${BUILT_IN_MISSION_PLANNER_IDENTITY.plannerId}/${BUILT_IN_MISSION_PLANNER_IDENTITY.version}`;
}
