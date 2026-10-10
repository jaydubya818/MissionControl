import {
  RESEARCH_LAB_DOCKER_IMAGE,
  RESEARCH_LAB_DOCKER_IMAGE_ID,
} from "../../../convex/lib/researchLabDockerScope.js";
export {
  RESEARCH_LAB_DOCKER_IMAGE,
  RESEARCH_LAB_DOCKER_IMAGE_ID,
  RESEARCH_LAB_DOCKER_PROFILE,
} from "../../../convex/lib/researchLabDockerScope.js";
const standard = Object.freeze({
  memoryMb: 512,
  workspaceBytes: 134217728,
  inputBytes: 33554432,
});
const researchLab = Object.freeze({
  memoryMb: 2048,
  workspaceBytes: 1073741824,
  inputBytes: 268435456,
});
export function dockerCapacity(identity: {
  image: string;
  imageId: string;
  capacityProfile?: "research-lab-large/v1";
}) {
  if (identity.capacityProfile === undefined) return standard;
  if (
    identity.capacityProfile !== "research-lab-large/v1" ||
    identity.image !== RESEARCH_LAB_DOCKER_IMAGE ||
    identity.imageId !== RESEARCH_LAB_DOCKER_IMAGE_ID
  )
    throw new Error("RESEARCH_LAB_CAPACITY_IDENTITY_MISMATCH");
  return researchLab;
}
