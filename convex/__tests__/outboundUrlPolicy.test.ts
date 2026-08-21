import { describe, expect, it } from "vitest";
import {
  requireOutboundUrl,
  safeLinkHref,
  validateOutboundUrl,
} from "../lib/outboundUrlPolicy";

describe("outbound URL policy", () => {
  it("accepts a public HTTPS destination and normalizes it", () => {
    const decision = validateOutboundUrl("  https://hooks.example.com/mc?b=2&a=1#frag ");
    expect(decision.errors).toEqual([]);
    expect(decision.url).toBe("https://hooks.example.com/mc?b=2&a=1");
  });

  it("rejects non-HTTPS schemes", () => {
    expect(validateOutboundUrl("http://hooks.example.com/mc").errors).toContain(
      "Only HTTPS destinations are permitted.",
    );
    expect(validateOutboundUrl("file:///etc/passwd").errors.length).toBeGreaterThan(0);
    expect(validateOutboundUrl("not a url").errors).toEqual([
      "Destination must be an absolute URL.",
    ]);
  });

  it("rejects loopback, private, and reserved hosts (SSRF)", () => {
    for (const host of [
      "https://localhost/hook",
      "https://127.0.0.1/hook",
      "https://10.1.2.3/hook",
      "https://192.168.0.5/hook",
      "https://169.254.169.254/latest/meta-data",
      "https://service.internal/hook",
      "https://[::1]/hook",
    ]) {
      expect(validateOutboundUrl(host).url, host).toBeUndefined();
    }
  });

  it("rejects embedded credentials and non-standard ports", () => {
    expect(validateOutboundUrl("https://user:pass@hooks.example.com/x").errors).toContain(
      "Credentials must not appear in a destination URL.",
    );
    expect(validateOutboundUrl("https://hooks.example.com:8443/x").errors).toContain(
      "Only the standard HTTPS port is permitted.",
    );
  });

  it("throws with the reason when required", () => {
    expect(() => requireOutboundUrl("https://127.0.0.1/x", "Webhook URL")).toThrow(
      /Webhook URL rejected/,
    );
    expect(requireOutboundUrl("https://hooks.example.com/x")).toBe("https://hooks.example.com/x");
  });
});

describe("safeLinkHref", () => {
  it("passes http and https through", () => {
    expect(safeLinkHref("https://github.com/o/r/pull/1")).toBe("https://github.com/o/r/pull/1");
    expect(safeLinkHref("http://localhost:5173/x")).toBe("http://localhost:5173/x");
  });

  it("drops script-bearing and non-navigational schemes", () => {
    // Regression: agent/harness-supplied artifact locations are rendered as an
    // operator-clickable href; React does not sanitize href values.
    expect(safeLinkHref("javascript:alert(document.cookie)")).toBeNull();
    expect(safeLinkHref("JavaScript:alert(1)")).toBeNull();
    expect(safeLinkHref("data:text/html;base64,PHNjcmlwdD4=")).toBeNull();
    expect(safeLinkHref("vbscript:msgbox(1)")).toBeNull();
    expect(safeLinkHref("/relative/path")).toBeNull();
    expect(safeLinkHref("")).toBeNull();
    expect(safeLinkHref(undefined)).toBeNull();
  });
});
