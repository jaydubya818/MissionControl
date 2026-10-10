import {
  RESEARCH_LAB_DOCKER_IMAGE,
  RESEARCH_LAB_DOCKER_IMAGE_ID,
} from "./dockerCapacity.js";
import {
  DOCKER_CANDIDATE_IDENTITY,
  type DockerProviderIdentity,
} from "./dockerSandboxProvider.js";
/** Separate OFFLINE candidate. Old qualification image remains unchanged. */
export const DOCKER_BEDROCK_CANDIDATE_IDENTITY: DockerProviderIdentity =
  Object.freeze({
    ...DOCKER_CANDIDATE_IDENTITY,
    image:
      "mission-control/factory-docker-bedrock@sha256:11ea5f88493593ff48520222e1df3bca6303e92138847decf71d30e5cce92124",
    imageId:
      "sha256:11ea5f88493593ff48520222e1df3bca6303e92138847decf71d30e5cce92124",
  });

export const RESEARCH_LAB_DOCKER_IDENTITY: DockerProviderIdentity =
  Object.freeze({
    ...DOCKER_BEDROCK_CANDIDATE_IDENTITY,
    image: RESEARCH_LAB_DOCKER_IMAGE,
    imageId: RESEARCH_LAB_DOCKER_IMAGE_ID,
    capacityProfile: "research-lab-large/v1",
  });
