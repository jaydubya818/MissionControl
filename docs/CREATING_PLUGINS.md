# Creating Plugins (Context Packages)

This section covers how to create custom **context packages** (plugins) for Mission Control — versioned skills, rules, and related agent context that teams share through the governed Registry.

Modelled on Tessl’s [Creating plugins](https://docs.tessl.io/create/creating-plugins) lifecycle: author locally → lint / review → publish to a registry → install into repos via manifests.

> **Tessl mapping:** Tessl calls these *plugins*. Mission Control stores the same ideas as `contextPackages` + `contextPackageVersions` (see `convex/schema.ts`, flag `context.registry`). UI surface: **Registry** (`/v2/skills`).

---

## When to create plugins

Create a package when you want to:

- **Codify team standards** — Capture coding conventions, Convex patterns, and UI rules as always-on guidance (`RULES`, `POLICY`, `ARCHITECTURE_GUIDE`)
- **Share procedural knowledge** — Document multi-step agent workflows as skills (`SKILL`) that load when relevant
- **Ensure consistency** — Make every agent on the squad follow the same practices via locked installs (`mc-context.json` / `mc-context.lock`)

Do **not** create a package for one-off chat instructions. Prefer a skill or rule only when the procedure will be reused across sessions, agents, or repos.

---

## What can you create?

Package types in the registry:

| Type | Tessl analogue | Role |
|------|----------------|------|
| `SKILL` | Skills | Procedural workflows loaded when the agent’s task matches the skill description |
| `RULES` | Rules | Mandatory standards always in play for a workspace / repo |
| `DOCUMENTATION` | Docs | Reference material agents may consult |
| `POLICY` | Rules / governance | Approval, risk, and tool-use constraints |
| `TOOL_GUIDE` | MCP-adjacent | How to call internal tools / Convex APIs correctly |
| `PROMPT_TEMPLATE` | — | Reusable prompt scaffolds |
| `SOUL` / `WORKFLOW` / `ARCHITECTURE_GUIDE` | — | Persona, YAML workflow, and system-design context |

### Skills

Procedural workflows that guide agents through complex tasks step-by-step.

**Example use cases:**

- Task lifecycle / claim / transition (`skills/mission-control-task-lifecycle/`)
- Approval requests and deliverable submission
- API testing checklists
- Deployment or migration runbooks
- Code review processes

**Learn more:** [Creating skills (Tessl)](https://docs.tessl.io/create/creating-skills) · Agent Skills `SKILL.md` format

### Rules

Mandatory coding standards and conventions that agents always follow.

**Example use cases:**

- Error handling patterns
- Convex validator / idempotency requirements
- Response format conventions
- Security best practices
- Naming conventions

In Tessl, rules live under `rules/` inside a plugin. In Mission Control, publish them as `RULES` (or `POLICY`) packages and pin them from `mc-context.json`.

### MCP / tools

Tessl plugins can declare MCP servers via `.mcp.json` so agents call internal APIs during a session.

**Example use cases:**

- Query feature flags so the agent knows which flags are active
- Look up the internal component library for UI patterns
- Fetch live API schema from staging

Mission Control’s equivalent today:

- Tool guides as `TOOL_GUIDE` packages
- Live data via Convex queries/mutations (no Express REST API)
- Optional local MCP configs for Cursor / Claude (repo or user `.mcp.json`) — not yet a first-class registry artifact

### Hooks — Coming Soon

Tessl hooks run deterministic commands on harness events (lint after edit, tests before commit). Mission Control does not yet ship a plugin-hooks runtime; use Cursor hooks / CI for the same jobs until this lands.

---

## Package layout (local)

Skills in this repo follow the Agent Skills layout Tessl also uses:

```text
skills/<skill-name>/
└── SKILL.md          # frontmatter + procedural body
```

Minimal `SKILL.md`:

```markdown
---
name: my-skill-name
description: >-
  When to activate this skill — be specific so agents can discover it.
  Use this skill when …
version: 1.0.0
owner: software-factory
risk: low
---

# My Skill

## Steps

1. …
```

**Frontmatter tips (Mission Control linter):**

- `description` must include activation language (“Use this skill when…”)
- Keep description ~80–500 characters
- Directory name should match `name`
- Avoid dangerous instructions that bypass policy / approvals

Tessl’s fuller plugin shape (for reference when aligning packages):

```text
my-plugin/
├── .tessl-plugin/plugin.json   # Tessl manifest (not required by MC today)
├── skills/<name>/SKILL.md
├── rules/                      # always-on standards
└── evals/scenario-*/           # with/without-context scenarios
```

See [Developing plugins locally (Tessl)](https://docs.tessl.io/create/developing-plugins-locally) and [Configuration files (Tessl)](https://docs.tessl.io/reference/configuration).

---

## Development workflow

### 1. Develop locally

1. Add `skills/<name>/SKILL.md` (or a rules/docs markdown file for other types).
2. Lint:

   ```bash
   ./scripts/mc skill lint
   # or
   node scripts/skill-lint.mjs skills/<name>/SKILL.md
   ```

3. Exercise the skill with your agent in this repo before publishing.

### 2. Package & publish into the Registry

Import repo skills into Convex (idempotent by content hash):

```bash
# Requires CONVEX_URL and context.registry enabled
node scripts/import-repo-skills.mjs
```

Publish path (governed):

1. Version lands as `DRAFT`
2. Structural review scores stored (`validation` / `implementation` / `activation` — Tessl-style axes)
3. `publishVersion` gates `SKILL` packages (default quality ≥ 50, validation axis ≥ 40)

Inspect packages in the UI: **Registry** → package detail → versions / review / installs.

### 3. Evaluate (prove it works)

Tessl evals run scenarios with and without context, then compare scores. Mission Control mirrors that:

```bash
node scripts/run-context-eval.mjs
```

Evals attach to package versions via `convex/context/evals.ts`. Prefer shipping skills that show a measurable lift on held-out scenarios.

### 4. Distribute / install into repos

Pin packages from consuming repos:

```bash
mc context init
mc context add software-factory/<package-slug> ^1.0.0
mc context lock
mc context verify
```

Details: [Context Manifests & Locks](./CONTEXT_MANIFESTS.md).

Tessl’s registry distribution analogue: [Distributing via registry](https://docs.tessl.io/distribute/distributing-via-registry).

---

## Quick checklist

- [ ] One clear purpose per skill; activation language in `description`
- [ ] `mc skill lint` / skill-lint clean (no error-severity findings)
- [ ] Imported / published with review scores above publish gates
- [ ] Eval scenario shows with-context ≥ without-context (when applicable)
- [ ] Consuming repo pins via `mc-context.json` + lockfile
- [ ] Risky capabilities marked (`risk`, tool requirements) and aligned with policy

---

## Related documentation

| Doc | Purpose |
|-----|---------|
| [CONTEXT_MANIFESTS.md](./CONTEXT_MANIFESTS.md) | Manifest / lock / `mc context` CLI |
| [FEATURE_FLAGS.md](./FEATURE_FLAGS.md) | `context.registry` and related flags |
| [CREATING_WORKFLOWS.md](./CREATING_WORKFLOWS.md) | Multi-agent YAML workflows (complementary) |
| [Tessl — Creating plugins](https://docs.tessl.io/create/creating-plugins) | Upstream plugin model |
| [Tessl — Creating skills](https://docs.tessl.io/create/creating-skills) | Skill authoring + publish |
| [Tessl — Glossary](https://docs.tessl.io/reference/glossary) | Plugins, skills, rules, workspaces |
