import { describe, expect, it } from "vitest";
import {
  CBOM_ENVELOPE_SCHEMA,
  diffSnapshots,
  formatModelIdentity,
  hashableEnvelope,
  normalizeSnapshotForExport,
  type SnapshotLike,
  type SnapshotPackageEntry,
} from "../lib/contextSnapshots";

const HASH_A = `sha256:${"a".repeat(64)}`;
const HASH_B = `sha256:${"b".repeat(64)}`;

function pkg(
  slug: string,
  version = "1.0.0",
  overrides: Partial<SnapshotPackageEntry> = {}
): SnapshotPackageEntry {
  return { slug, version, contentHash: HASH_A, ...overrides };
}

function snapshot(overrides: Partial<SnapshotLike> = {}): SnapshotLike {
  return {
    model: "claude-sonnet-4-5",
    packages: [pkg("scope/a")],
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// formatModelIdentity
// ---------------------------------------------------------------------------

describe("formatModelIdentity", () => {
  it("returns the bare model when no version is recorded", () => {
    expect(formatModelIdentity({ model: "claude-sonnet-4-5" })).toBe(
      "claude-sonnet-4-5"
    );
    expect(
      formatModelIdentity({ model: "claude-sonnet-4-5", modelVersion: "" })
    ).toBe("claude-sonnet-4-5");
  });

  it("appends the model version when present", () => {
    expect(
      formatModelIdentity({ model: "claude-sonnet-4-5", modelVersion: "20250929" })
    ).toBe("claude-sonnet-4-5@20250929");
  });
});

// ---------------------------------------------------------------------------
// diffSnapshots — package matrix
// ---------------------------------------------------------------------------

describe("diffSnapshots packages", () => {
  it("reports a package only in b as added", () => {
    const diff = diffSnapshots(
      snapshot({ packages: [pkg("scope/a")] }),
      snapshot({ packages: [pkg("scope/a"), pkg("scope/new")] })
    );
    expect(diff.packagesAdded.map((p) => p.slug)).toEqual(["scope/new"]);
    expect(diff.packagesRemoved).toEqual([]);
    expect(diff.packagesChanged).toEqual([]);
    expect(diff.identical).toBe(false);
  });

  it("reports a package only in a as removed", () => {
    const diff = diffSnapshots(
      snapshot({ packages: [pkg("scope/a"), pkg("scope/gone")] }),
      snapshot({ packages: [pkg("scope/a")] })
    );
    expect(diff.packagesRemoved.map((p) => p.slug)).toEqual(["scope/gone"]);
    expect(diff.packagesAdded).toEqual([]);
    expect(diff.identical).toBe(false);
  });

  it("reports a version bump under the same slug as changed", () => {
    const diff = diffSnapshots(
      snapshot({ packages: [pkg("scope/a", "1.0.0")] }),
      snapshot({ packages: [pkg("scope/a", "2.0.0", { contentHash: HASH_B })] })
    );
    expect(diff.packagesChanged).toEqual([
      {
        slug: "scope/a",
        from: { version: "1.0.0", contentHash: HASH_A },
        to: { version: "2.0.0", contentHash: HASH_B },
      },
    ]);
    expect(diff.packagesAdded).toEqual([]);
    expect(diff.packagesRemoved).toEqual([]);
  });

  it("reports a hash change with the same version as changed", () => {
    const diff = diffSnapshots(
      snapshot({ packages: [pkg("scope/a", "1.0.0")] }),
      snapshot({ packages: [pkg("scope/a", "1.0.0", { contentHash: HASH_B })] })
    );
    expect(diff.packagesChanged).toHaveLength(1);
    expect(diff.packagesChanged[0].from.contentHash).toBe(HASH_A);
    expect(diff.packagesChanged[0].to.contentHash).toBe(HASH_B);
    expect(diff.packagesChanged[0].from.version).toBe("1.0.0");
    expect(diff.packagesChanged[0].to.version).toBe("1.0.0");
  });

  it("sorts added/removed/changed lists by slug", () => {
    const diff = diffSnapshots(
      snapshot({ packages: [pkg("scope/z"), pkg("scope/m", "1.0.0")] }),
      snapshot({
        packages: [
          pkg("scope/b"),
          pkg("scope/a"),
          pkg("scope/m", "2.0.0", { contentHash: HASH_B }),
        ],
      })
    );
    expect(diff.packagesAdded.map((p) => p.slug)).toEqual([
      "scope/a",
      "scope/b",
    ]);
    expect(diff.packagesRemoved.map((p) => p.slug)).toEqual(["scope/z"]);
    expect(diff.packagesChanged.map((p) => p.slug)).toEqual(["scope/m"]);
  });
});

// ---------------------------------------------------------------------------
// diffSnapshots — model / repo / flags / tools
// ---------------------------------------------------------------------------

describe("diffSnapshots model, repo, flags, tools", () => {
  it("reports a model change with from/to identities", () => {
    const diff = diffSnapshots(
      snapshot({ model: "claude-sonnet-4-5" }),
      snapshot({ model: "claude-opus-4-6" })
    );
    expect(diff.modelChanged).toEqual({
      from: "claude-sonnet-4-5",
      to: "claude-opus-4-6",
    });
  });

  it("reports a modelVersion-only change as a model change", () => {
    const diff = diffSnapshots(
      snapshot({ modelVersion: "20250929" }),
      snapshot({ modelVersion: "20251101" })
    );
    expect(diff.modelChanged).toEqual({
      from: "claude-sonnet-4-5@20250929",
      to: "claude-sonnet-4-5@20251101",
    });
  });

  it("reports repositorySha changes, including missing sides as null", () => {
    const shaChange = diffSnapshots(
      snapshot({ repositorySha: "abc" }),
      snapshot({ repositorySha: "def" })
    );
    expect(shaChange.repositoryShaChanged).toEqual({ from: "abc", to: "def" });

    const shaAdded = diffSnapshots(snapshot(), snapshot({ repositorySha: "def" }));
    expect(shaAdded.repositoryShaChanged).toEqual({ from: null, to: "def" });
  });

  it("reports flag flips and flags present on only one side", () => {
    const diff = diffSnapshots(
      snapshot({
        featureFlags: [
          { key: "context.cbom", enabled: false },
          { key: "removed.flag", enabled: true },
          { key: "same.flag", enabled: true },
        ],
      }),
      snapshot({
        featureFlags: [
          { key: "context.cbom", enabled: true },
          { key: "added.flag", enabled: false },
          { key: "same.flag", enabled: true },
        ],
      })
    );
    expect(diff.flagsChanged).toEqual([
      { key: "added.flag", from: null, to: false },
      { key: "context.cbom", from: false, to: true },
      { key: "removed.flag", from: true, to: null },
    ]);
  });

  it("reports tools added and removed by name", () => {
    const diff = diffSnapshots(
      snapshot({ tools: [{ name: "bash" }, { name: "legacy-grep" }] }),
      snapshot({ tools: [{ name: "bash" }, { name: "web-search" }] })
    );
    expect(diff.toolsAdded.map((t) => t.name)).toEqual(["web-search"]);
    expect(diff.toolsRemoved.map((t) => t.name)).toEqual(["legacy-grep"]);
  });

  it("treats undefined tools/flags as empty sets", () => {
    const diff = diffSnapshots(
      snapshot({ tools: undefined, featureFlags: undefined }),
      snapshot({ tools: [{ name: "bash" }], featureFlags: [{ key: "x", enabled: true }] })
    );
    expect(diff.toolsAdded.map((t) => t.name)).toEqual(["bash"]);
    expect(diff.flagsChanged).toEqual([{ key: "x", from: null, to: true }]);
  });

  it("returns an empty, identical diff for equal snapshots", () => {
    const a = snapshot({
      repositorySha: "abc",
      featureFlags: [{ key: "context.cbom", enabled: true }],
      tools: [{ name: "bash", version: "1.0" }],
    });
    const b = snapshot({
      repositorySha: "abc",
      featureFlags: [{ key: "context.cbom", enabled: true }],
      tools: [{ name: "bash", version: "1.0" }],
    });
    const diff = diffSnapshots(a, b);
    expect(diff).toEqual({
      packagesAdded: [],
      packagesRemoved: [],
      packagesChanged: [],
      modelChanged: null,
      repositoryShaChanged: null,
      flagsChanged: [],
      toolsAdded: [],
      toolsRemoved: [],
      identical: true,
    });
  });
});

// ---------------------------------------------------------------------------
// normalizeSnapshotForExport
// ---------------------------------------------------------------------------

describe("normalizeSnapshotForExport", () => {
  it("strips Convex system fields and undefined values", () => {
    const raw = {
      _id: "j57abc",
      _creationTime: 123,
      model: "claude-sonnet-4-5",
      modelVersion: undefined,
      packages: [pkg("scope/a")],
      createdAt: 1,
    } as unknown as SnapshotLike;
    const normalized = normalizeSnapshotForExport(raw);
    expect(Object.keys(normalized)).not.toContain("_id");
    expect(Object.keys(normalized)).not.toContain("_creationTime");
    expect(Object.keys(normalized)).not.toContain("modelVersion");
    expect(normalized.model).toBe("claude-sonnet-4-5");
  });

  it("produces identical JSON regardless of property insertion order", () => {
    const orderOne = {
      model: "m",
      createdAt: 1,
      repoSlug: "owner/repo",
      packages: [pkg("scope/b"), pkg("scope/a")],
      tools: [{ name: "z" }, { name: "a" }],
      featureFlags: [
        { key: "b.flag", enabled: true },
        { key: "a.flag", enabled: false },
      ],
    } as SnapshotLike;
    const orderTwo = {
      featureFlags: [
        { key: "a.flag", enabled: false },
        { key: "b.flag", enabled: true },
      ],
      tools: [{ name: "a" }, { name: "z" }],
      packages: [pkg("scope/a"), pkg("scope/b")],
      repoSlug: "owner/repo",
      createdAt: 1,
      model: "m",
    } as SnapshotLike;

    expect(JSON.stringify(normalizeSnapshotForExport(orderOne))).toBe(
      JSON.stringify(normalizeSnapshotForExport(orderTwo))
    );
  });

  it("sorts top-level keys, packages by slug+version, tools and flags", () => {
    const normalized = normalizeSnapshotForExport(
      snapshot({
        packages: [pkg("scope/b"), pkg("scope/a", "2.0.0"), pkg("scope/a", "1.0.0")],
        tools: [{ name: "web" }, { name: "bash" }],
        featureFlags: [
          { key: "z.flag", enabled: true },
          { key: "a.flag", enabled: false },
        ],
      })
    );
    expect(Object.keys(normalized)).toEqual(
      [...Object.keys(normalized)].sort()
    );
    expect(
      (normalized.packages as SnapshotPackageEntry[]).map(
        (p) => `${p.slug}@${p.version}`
      )
    ).toEqual(["scope/a@1.0.0", "scope/a@2.0.0", "scope/b@1.0.0"]);
    expect((normalized.tools as { name: string }[]).map((t) => t.name)).toEqual(
      ["bash", "web"]
    );
    expect(
      (normalized.featureFlags as { key: string }[]).map((f) => f.key)
    ).toEqual(["a.flag", "z.flag"]);
  });

  it("sorts nested object keys deeply", () => {
    const normalized = normalizeSnapshotForExport(
      snapshot({
        packages: [
          {
            version: "1.0.0",
            slug: "scope/a",
            sourceCommitSha: "abc",
            contentHash: HASH_A,
          },
        ],
      })
    );
    const entry = (normalized.packages as Record<string, unknown>[])[0];
    expect(Object.keys(entry)).toEqual([
      "contentHash",
      "slug",
      "sourceCommitSha",
      "version",
    ]);
  });

  it("does not mutate the input snapshot", () => {
    const input = snapshot({ packages: [pkg("scope/b"), pkg("scope/a")] });
    normalizeSnapshotForExport(input);
    expect(input.packages.map((p) => p.slug)).toEqual(["scope/b", "scope/a"]);
  });
});

// ---------------------------------------------------------------------------
// hashableEnvelope
// ---------------------------------------------------------------------------

describe("hashableEnvelope", () => {
  it("wraps the normalized snapshot in a versioned envelope", () => {
    const parsed = JSON.parse(hashableEnvelope(snapshot())) as {
      schema: string;
      snapshot: Record<string, unknown>;
    };
    expect(parsed.schema).toBe(CBOM_ENVELOPE_SCHEMA);
    expect(parsed.snapshot.model).toBe("claude-sonnet-4-5");
  });

  it("is byte-stable across repeated calls and insertion orders", () => {
    const a = { model: "m", createdAt: 1, packages: [pkg("scope/a")] } as SnapshotLike;
    const b = { packages: [pkg("scope/a")], createdAt: 1, model: "m" } as SnapshotLike;
    expect(hashableEnvelope(a)).toBe(hashableEnvelope(a));
    expect(hashableEnvelope(a)).toBe(hashableEnvelope(b));
  });

  it("changes when any recorded field changes", () => {
    const base = snapshot();
    expect(hashableEnvelope(base)).not.toBe(
      hashableEnvelope(snapshot({ model: "other-model" }))
    );
    expect(hashableEnvelope(base)).not.toBe(
      hashableEnvelope(
        snapshot({ packages: [pkg("scope/a", "1.0.0", { contentHash: HASH_B })] })
      )
    );
  });
});
