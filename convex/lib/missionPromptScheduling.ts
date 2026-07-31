export type MissionPromptReadiness =
  | { allowed: true; reason: "Mission statement configured" }
  | { allowed: false; reason: "No mission statement set. Configure the workspace mission before running this job." };

export function evaluateMissionPromptReadiness(
  missionStatement: unknown,
): MissionPromptReadiness {
  if (typeof missionStatement !== "string" || missionStatement.trim().length === 0) {
    return {
      allowed: false,
      reason: "No mission statement set. Configure the workspace mission before running this job.",
    };
  }

  return { allowed: true, reason: "Mission statement configured" };
}
