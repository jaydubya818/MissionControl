export const RESEARCH_LAB_DOCKER_PROFILE =
  "factory/docker-bedrock-research-lab/v1";
export const RESEARCH_LAB_DOCKER_IMAGE =
  "mission-control/local-large-repository@sha256:7a36977d9b1449d2dae436e4b184326f0ef48b5873019c583911f6d95d9afda8";
export const RESEARCH_LAB_DOCKER_IMAGE_ID =
  "sha256:7a36977d9b1449d2dae436e4b184326f0ef48b5873019c583911f6d95d9afda8";
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
