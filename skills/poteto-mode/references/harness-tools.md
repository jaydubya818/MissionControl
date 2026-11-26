# Runtime tool mapping for Jstack

Jstack skills use Claude Code tool names because that is the language of the
upstream workflows. The workflow is portable. The literal tool name is not.
Use this file when a skill names a Claude tool, model, driver, transcript path,
or companion agent that the active runtime does not expose.

## Common rules

- Preserve the workflow's intent, ordering, authority limits, and evidence
  requirements.
- Map an action to a native capability. Never pretend that an unavailable tool
  ran.
- Run independent steps sequentially when delegation is unavailable or not authorized.
- Keep each writing worker on a separate branch or worktree when parallel work
  is available.
- Use the active runtime's model identifiers. A Claude model slug is a role
  hint outside Claude Code, not a valid model name.
- Ask in chat when no structured question tool exists.
- Keep an uncommitted Markdown checklist when no task tracker exists.

## Claude Code

Claude Code runs the skills as written. Plugin installs namespace the companion
agents as `software-factory-skills:poteto-agent` and
`software-factory-skills:comment-sicko`, plus the two `thermo-nuclear-*-subagent`
reviewers. Direct installs place the same agents
under `.claude/agents/` and use the bare names.

## Codex

Use these Codex equivalents:

| Jstack or Claude action | Codex equivalent |
| --- | --- |
| Read a file | Shell reads such as `cat`, `sed`, `head`, or `tail` |
| Create, edit, or delete a file | `apply_patch` |
| Run a command | The shell execution tool |
| Search text or files | `rg`, with `find` or `grep` as fallbacks |
| Fetch a URL or search the web | The available web tool, or `curl` for a known URL |
| Invoke a skill | Load the matching `SKILL.md` and follow it |
| Dispatch a worker | `spawn_agent` when the session exposes it |
| Wait for a worker | `wait_agent` |
| Track tasks | The active plan tool, or an uncommitted Markdown checklist |
| Ask a fixed-choice question | The structured input tool when available, otherwise chat |

Codex has no Claude `subagent_type`. For an ad hoc Jstack worker, instruct the
worker to read `poteto-mode` in full before starting. For `no-comments`,
instruct the worker to read `references/agents/comment-sicko.md` first. If the
session does not expose workers, perform the same review passes sequentially.

Use the session's model and reasoning settings unless the user or applicable
repository instructions authorize an override. Upstream Claude role defaults
do not themselves authorize changing a Codex model. If a review cannot use a
diverse panel, report that limitation.

Codex stores user skills in `~/.agents/skills/` and project skills in
`.agents/skills/`. Each Jstack skill includes `agents/openai.yaml` for Codex
presentation metadata.

## Cursor

Cursor loads the standard root `plugin.json` or the Cursor manifest under
`.cursor-plugin/plugin.json`. It also discovers personal skills under
`~/.cursor/skills/` and shared project skills under `.agents/skills/`.

Use Cursor's native file, search, terminal, web, task, and agent controls for
the corresponding Claude actions. Do not pass Claude-only fields such as
`subagent_type` or `run_in_background` when Cursor does not expose them. Select
a custom agent by name when the installed plugin provides one. Otherwise start
a general worker and tell it to read the relevant companion definition under
`agents/` or `poteto-mode/references/agents/`. Run the passes sequentially when
the current Cursor product or plan does not expose independent workers.

Use the models available in the current Cursor model picker. Preserve the role
of each requested model, such as fast mechanical work, primary implementation,
or strongest judgment. Do not copy a `claude-*` or Codex slug into Cursor and
assume that it resolves.

Cursor does not guarantee Claude Code transcript paths, task tools, or bundled
drivers. Use the current workspace's documented history and native browser or
terminal controls. If no driver is available, return a concrete manual check
and mark the runtime evidence as unverified.

## Other runtimes

Install the canonical `skills/` tree into the runtime's Agent Skills directory:

```bash
python3 scripts/install_skills.py --portable /path/to/runtime/skills
```

Then map these capabilities:

| Required capability | Fallback |
| --- | --- |
| Skill discovery | Explicitly open the selected `SKILL.md` |
| File reads and searches | Native file APIs or shell tools |
| File edits | The runtime's patch or write API |
| Commands | The runtime's shell or process API |
| Delegation | Independent workers, or sequential passes in one session |
| Task tracking | Native tasks, or an uncommitted Markdown checklist |
| Structured questions | Plain chat with the user |
| Scheduled follow-up | A native scheduler, or a documented manual recheck |

An adapter may rename tools, but it must not weaken authorization, skip
verification, invent worker results, or claim that an unsupported action ran.

## Named drivers and skills

| Name used by Jstack | Portable behavior |
| --- | --- |
| `run` | Start the real application with native process tools and observe its output. |
| Project UI driver | Use the installed browser or UI automation tool. Do not claim success without observing the result. |
| `plugin-dev:skill-development` | Use the runtime's skill-authoring guidance and keep standard `name` and `description` frontmatter. |
| `loop` | Use a native recurring task. If none exists, re-run the check manually at a stated cadence. |
| `AskUserQuestion` | Use structured input when available, otherwise ask one concise question in chat. |

## Per-skill notes

- `interrogate`, `arena`, `architect`, `how`, `why`, and `reflect` use
  independent review passes. Use native workers or run each pass sequentially.
- `setup-jstack` must write model identifiers that the active runtime accepts.
  Put standing instructions in `CLAUDE.md` for Claude Code, `AGENTS.md` for
  Codex, Cursor rules or instructions for Cursor, or the runtime's documented
  equivalent.
- `create-verification-skill` and `maintain-verification-skill` use
  `.claude/skills/` for a Claude-only project and `.agents/skills/` for a
  shared project definition.
- The formal verification create and maintenance skills use the same roots.
  A passing bounded model is not proof of the entire application. Keep tool
  versions, assumptions, code mappings, and a demonstrated failing control.
- `thermos` reads both reviewer definitions in `references/agents/` and
  combines their findings. Use native workers only when authorized; otherwise
  perform the passes sequentially without claiming independence.
- `babysit` needs a real recurring mechanism. If the runtime cannot schedule a
  recheck, return the last observed state and a command the user can rerun.
- `recall`, `reflect`, `show-me-your-work`, and transcript-based playbooks must
  use only the active workspace's documented history location. Never scan
  another workspace's conversations.

## Vendored scripts

`skills/poteto-mode/scripts/` contains Bun, Node.js, and shell programs. The
orchestration and PR-watching tools require Bun and their pinned dependencies.
Review that tool's bootstrap before invoking it; installing dependencies needs
the session's normal authorization. Other helpers may need `gh`, `jq`, or `rg`.
`worktree-audit.mjs` reads Claude transcripts by default. Use the active
runtime's workspace-scoped history and do not scan unrelated chats. No hooks,
Pi extensions, or automatic routing are installed by this collection.
