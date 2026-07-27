# Discover and install

Registry Discover is the searchable index of context packages — Tessl Registry analog.

## Package identity

- Slug format: `scope/name` (lowercase, e.g. `mission-control/factory-health`)
- Types: SKILL, RULES, DOCUMENTATION, WORKFLOW, POLICY, …
- Status: DRAFT → PUBLISHED → DEPRECATED

## Install flow

1. Browse **Registry Discover** or search by tag
2. Review published version, quality score, security status
3. Add to `mc-context.json` manifest for target repo
4. Run lock resolve → updates `mc-context.lock`
5. **Installations** panel shows INSTALLED / STALE / MISSING

## Demo packages

Demo seed publishes nine skills including factory-health, code-review-wizard, superpowers/test-driven-development, and harness/change-review.

## CLI

```bash
node scripts/import-repo-skills.mjs
node scripts/skill-lint.mjs
```

See [Context CDL](./context-cdl.md) for lifecycle details.
