# Context CDL

**Context Development Lifecycle** — draft, review, publish, install, deprecate.

## Artifacts

| Artifact | Purpose |
| --- | --- |
| `mc-context.json` | Declares desired packages per repo |
| `mc-context.lock` | Resolved versions + content hashes |
| `contextManifests` | Stored manifest per repo slug |
| `contextLocks` | Stored lock + manifest hash for drift detection |

## UI: Context CDL tab

**Knowledge → Context CDL** (`registry-lifecycle`) shows manifest/lock pairs and drift indicators.

## Version rules

- Semver strictly increasing per package
- Published versions immutable (content hash required)
- Deprecation requires `replacementPackageId` when successor exists

## Publish gate

When `eval.framework` flag is on, publish requires recent COMPLETED eval with acceptable impact delta.

## Related docs

- Repo: `docs/CONTEXT_MANIFESTS.md`
- Creating packages: `docs/CREATING_PLUGINS.md`
