import { describe, expect, it } from "vitest";
import { resolveServerBinding } from "../runtimeServerConfig.js";

describe("orchestration server binding", () => {
  it("defaults to the loopback production boundary", () => {
    expect(resolveServerBinding({})).toEqual({ host: "127.0.0.1", port: 4100 });
  });

  it.each(["0.0.0.0", "localhost", "example.com"])("rejects non-exact loopback host %s", (host) => {
    expect(() => resolveServerBinding({ ORCHESTRATION_HOST: host })).toThrow("explicit loopback");
  });

  it.each(["0", "65536", "4100x", "1.5"])("rejects invalid port %s", (port) => {
    expect(() => resolveServerBinding({ ORCHESTRATION_PORT: port })).toThrow("between 1 and 65535");
  });

  it("accepts an explicit IPv6 loopback and bounded port", () => {
    expect(resolveServerBinding({ ORCHESTRATION_HOST: "::1", ORCHESTRATION_PORT: "8443" }))
      .toEqual({ host: "::1", port: 8443 });
  });
});
