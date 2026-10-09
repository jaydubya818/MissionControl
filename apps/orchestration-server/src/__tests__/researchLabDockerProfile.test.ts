import { expect, it } from "vitest";
import {
  dockerCapacity,
  RESEARCH_LAB_DOCKER_PROFILE,
} from "../dockerCapacity.js";
import { RESEARCH_LAB_DOCKER_IDENTITY } from "../dockerBedrockIdentity.js";
import { bedrockFactoryProviderFactory } from "../bedrockFactoryComposition.js";
import { bedrockProfileFixture } from "./fixtures/bedrockProfileFixture.js";
import { bridgeFixture } from "./fixtures/bedrockBridgeFixture.js";
const factory = (url: string, enabled = true) => {
  const b = bridgeFixture();
  return bedrockFactoryProviderFactory(
    { url } as any,
    {
      ...(enabled
        ? { localResearchLabProfile: "large-repository/v1" as const }
        : {}),
      route: b.binding.route,
      reservationId: b.binding.reservationId,
      price: b.price,
      maximumProgramNanoUsd: b.binding.maximumProgramNanoUsd,
      maximumPhysicalRequests: b.binding.maximumPhysicalRequests,
      timeoutMs: 10000,
    },
    b.transport,
  );
};
it("retains standard resource limits unless explicitly selected", () => {
  expect(dockerCapacity({ image: "anything", imageId: "anything" })).toEqual({
    memoryMb: 512,
    workspaceBytes: 134217728,
    inputBytes: 33554432,
  });
  expect(dockerCapacity(RESEARCH_LAB_DOCKER_IDENTITY)).toEqual({
    memoryMb: 2048,
    workspaceBytes: 1073741824,
    inputBytes: 268435456,
  });
});
it.each(["image", "imageId"])(
  "rejects a substituted large-profile %s",
  (key) => {
    expect(() =>
      dockerCapacity({ ...RESEARCH_LAB_DOCKER_IDENTITY, [key]: "wrong" }),
    ).toThrow("IDENTITY_MISMATCH");
  },
);
it.each([
  "https://shared.convex.cloud",
  "http://127.0.0.1:3210",
  "http://localhost:3214.evil.test",
  "http://localhost:3214/path",
])("rejects non-Research-Lab backend %s", (url) =>
  expect(() => factory(url)).toThrow("LOCAL_BACKEND_REQUIRED"),
);
it.each(["http://127.0.0.1:3214", "http://localhost:3214"])(
  "selects the pinned local profile at %s",
  async (url) => {
    const p = bedrockProfileFixture(undefined, undefined, true).profile;
    expect(p.providerProfile).toBe(RESEARCH_LAB_DOCKER_PROFILE);
    const provider = factory(url)(p);
    expect((await provider.validateProfile(p)).dispatchable).toBe(true);
    p.machine.memoryMb = 512;
    expect((await provider.validateProfile(p)).dispatchable).toBe(false);
  },
);
it("does not select larger capacity implicitly", () => {
  expect(() =>
    factory(
      "http://localhost:3214",
      false,
    )(bedrockProfileFixture(undefined, undefined, true).profile),
  ).toThrow("BACKEND_MISMATCH");
});
it("does not accept a standard profile under the larger selection", () => {
  expect(() =>
    factory("http://localhost:3214")(bedrockProfileFixture().profile),
  ).toThrow("BACKEND_MISMATCH");
});
