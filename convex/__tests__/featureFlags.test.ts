import { describe, expect, it } from "vitest";
import {
  KNOWN_FLAGS,
  getFlagDefinition,
  isKnownFlag,
  isValidFlagKey,
  resolveAllFlags,
  resolveFlag,
  type FlagRow,
} from "../lib/flags";

describe("flag registry", () => {
  it("registers every Software Factory subsystem flag", () => {
    const keys = KNOWN_FLAGS.map((f) => f.key);
    expect(keys).toContain("ui.shell.v2");
    expect(keys).toContain("context.registry");
    expect(keys).toContain("context.cbom");
    expect(keys).toContain("context.gates");
    expect(keys).toContain("eval.framework");
    expect(keys).toContain("security.scanning");
    expect(keys).toContain("dispatch.v2");
    expect(keys).toContain("trust.scoring");
    expect(keys).toContain("rollout.rings");
    expect(keys).toContain("delivery.workorders");
    expect(keys).toContain("executor.pi-bridge");
  });

  it("ships every flag default-off", () => {
    for (const flag of KNOWN_FLAGS) {
      expect(flag.defaultEnabled, flag.key).toBe(false);
    }
  });

  it("has unique keys and valid key format", () => {
    const keys = KNOWN_FLAGS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) {
      expect(isValidFlagKey(key), key).toBe(true);
    }
  });

  it("looks up known flags", () => {
    expect(isKnownFlag("ui.shell.v2")).toBe(true);
    expect(isKnownFlag("nope.never")).toBe(false);
    expect(getFlagDefinition("ui.shell.v2")?.description).toBeTruthy();
    expect(getFlagDefinition("nope.never")).toBeUndefined();
  });
});

describe("isValidFlagKey", () => {
  it("accepts dot/dash separated lowercase segments", () => {
    expect(isValidFlagKey("ui.shell.v2")).toBe(true);
    expect(isValidFlagKey("delivery.workorders")).toBe(true);
    expect(isValidFlagKey("a-b.c-d")).toBe(true);
    expect(isValidFlagKey("solo")).toBe(true);
  });

  it("rejects malformed keys", () => {
    expect(isValidFlagKey("")).toBe(false);
    expect(isValidFlagKey("UPPER.case")).toBe(false);
    expect(isValidFlagKey(".leading")).toBe(false);
    expect(isValidFlagKey("trailing.")).toBe(false);
    expect(isValidFlagKey("double..dot")).toBe(false);
    expect(isValidFlagKey("has space")).toBe(false);
    expect(isValidFlagKey("semi;colon")).toBe(false);
  });
});

describe("resolveFlag precedence", () => {
  const PROJECT = "project_123";

  it("unknown key with no rows resolves to off/default", () => {
    const resolved = resolveFlag([], "nope.never");
    expect(resolved).toMatchObject({ enabled: false, source: "default" });
  });

  it("known key with no rows resolves to registered default", () => {
    const resolved = resolveFlag([], "ui.shell.v2");
    expect(resolved).toMatchObject({ enabled: false, source: "default" });
    expect(resolved.description).toBeTruthy();
  });

  it("global row overrides the default", () => {
    const rows: FlagRow[] = [{ key: "ui.shell.v2", enabled: true }];
    expect(resolveFlag(rows, "ui.shell.v2")).toMatchObject({
      enabled: true,
      source: "global",
    });
  });

  it("project row overrides the global row for that project", () => {
    const rows: FlagRow[] = [
      { key: "ui.shell.v2", enabled: true },
      { key: "ui.shell.v2", enabled: false, projectId: PROJECT },
    ];
    expect(resolveFlag(rows, "ui.shell.v2", PROJECT)).toMatchObject({
      enabled: false,
      source: "project",
    });
  });

  it("project scope falls through to global when no project row exists", () => {
    const rows: FlagRow[] = [{ key: "ui.shell.v2", enabled: true }];
    expect(resolveFlag(rows, "ui.shell.v2", PROJECT)).toMatchObject({
      enabled: true,
      source: "global",
    });
  });

  it("another project's row does not leak across projects", () => {
    const rows: FlagRow[] = [
      { key: "ui.shell.v2", enabled: true, projectId: "project_other" },
    ];
    expect(resolveFlag(rows, "ui.shell.v2", PROJECT)).toMatchObject({
      enabled: false,
      source: "default",
    });
  });

  it("without project scope, project rows are ignored", () => {
    const rows: FlagRow[] = [
      { key: "ui.shell.v2", enabled: true, projectId: PROJECT },
    ];
    expect(resolveFlag(rows, "ui.shell.v2")).toMatchObject({
      enabled: false,
      source: "default",
    });
  });
});

describe("resolveAllFlags", () => {
  it("includes every known flag plus ad-hoc row keys, sorted", () => {
    const rows: FlagRow[] = [{ key: "adhoc.experiment", enabled: true }];
    const all = resolveAllFlags(rows);
    const keys = all.map((f) => f.key);
    expect(keys.length).toBe(KNOWN_FLAGS.length + 1);
    expect(keys).toContain("adhoc.experiment");
    expect([...keys].sort()).toEqual(keys);
    expect(all.find((f) => f.key === "adhoc.experiment")).toMatchObject({
      enabled: true,
      source: "global",
    });
  });
});
