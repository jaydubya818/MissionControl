---
title: Mission Control Docs Product Assessment
date: 2026-07-28
status: PUBLISHED
owner: Mission Control Platform
reviewer: Quality Engineering
mission_control_docs_id: SFE-DOC-008
mission_control_docs_title: Mission Control Docs Product Assessment
related_mission_id: gs7g4215qyeka9njttxdcsd48n8bc9yn
related_work_order_ids: []
last_synchronized_date: 2026-07-28
---

# Mission Control Docs Product Assessment

## Executive assessment

The current Docs product is a version-controlled Markdown reader with static
navigation, title/path filtering, a separately indexed search tab, and repo
chat. It is not yet a governed document-management system.

The supplied documentation workspace ID
`w17bnnjbwzws1rdyvg97s9cwxd8bfda8` is not one of the selectable projects in the
current deployment. Opening the requested URL produces a `projects:get`
validation error and the App error boundary. The verified connected workspace
is Software Factory Research Lab,
`sn71gskbdemgf4z1trt9zdmm5h8bde69`.

No document was inserted directly into Convex. The current Task/Work Order work
is exposed through the supported Docs browser as a version-controlled
`Software Factory Enhancement` section. Dynamic creation, editing, collection
records, approval, and history remain explicit defects.

## Repository implementation

| Surface | Current behavior |
| --- | --- |
| `DocsView.tsx` | Documentation, Search, and Chat with Repo tabs |
| `DocsSiteBrowser.tsx` | read-only Markdown navigation and title/path filter |
| `docsSiteConfig.ts` | source-coded sections/pages and eager Markdown imports |
| `markdownRender.ts` | sanitized headings, lists, tables, code, quotes, links |
| `knowledge.indexAllDocs` | hard-coded repository document indexing list |
| `docs/site/` | operator-facing repository Markdown |

## Capability classification

| Capability | Classification | Finding |
| --- | --- | --- |
| Document reading | WORKING | Markdown is readable through the browser UI |
| Tables and code blocks | WORKING | rendered by the lightweight Markdown renderer |
| Links | WORKING | internal configured pages and external links |
| Search/filter | PARTIAL | page filter works; semantic index is hard-coded |
| Collection navigation | PARTIAL | source-coded sections, not records |
| Direct document URL | WORKING | `doc` query persistence verified in Chromium |
| Back/forward | WORKING | configured page history verified in Chromium |
| Create/edit/save | MISSING | no UI controls or persistence model |
| Autosave/manual save | MISSING | read-only |
| Tags/status/owner | MISSING | display-only Markdown metadata |
| Review/approval | MISSING | no enforced lifecycle |
| Version/history | MISSING | Git history only |
| Record relationships | MISSING | text references only |
| Import/export/sync | MISSING | no UI workflow |
| Mermaid | MISSING | code block only |
| Attachments/screenshots | MISSING | no record or upload workflow |
| Workspace scoping | CONFUSING | global content displayed under workspace URL |
| Invalid-workspace recovery | BROKEN | App-level crash |
| Empty/loading/error states | PARTIAL | missing page card; no authoring states |
| Accessibility | PARTIAL | reader controls named; authoring cannot be tested |
| Large-document performance | NEEDS_RESEARCH | no benchmark |
| Many-document performance | NEEDS_RESEARCH | static list only |

## Defect register

### DOCS-001 — Invalid supplied workspace crashes Docs

| Field | Value |
| --- | --- |
| Severity | Critical |
| Workspace | `w17bnnjbwzws1rdyvg97s9cwxd8bfda8` |
| Page | Docs |
| URL | `http://localhost:5199/v2/docs?workspace=w17bnnjbwzws1rdyvg97s9cwxd8bfda8` |
| Browser | Chromium, agent-browser 0.27.0 |
| Commit | `61d479b` base |
| Date | 2026-07-28 |
| Expected | Workspace loads or displays a scoped not-found state |
| Actual | `projects:get` validation error reaches App error boundary |
| Console | Convex request error plus React App error-boundary report |
| Network | Convex query failed before Docs rendered |
| Related Mission | `gs7g4215qyeka9njttxdcsd48n8bc9yn` |
| Recommended owner | Workspace/Docs platform |
| Status | OPEN |
| Resolution | Not implemented in this documentation-only remediation |
| Verification | Fails on supplied URL; Research Lab URL works |

Reproduction:

1. clear or preserve local workspace state;
2. open the supplied URL;
3. observe “Mission Control could not render.”

### DOCS-002 — Required authoring journey is unavailable

| Field | Value |
| --- | --- |
| Severity | High |
| Affected page | `/v2/docs` |
| Expected | Create collection/document, edit, save, search, history |
| Actual | Static read-only repository Markdown |
| Recommended owner | Docs product |
| Status | OPEN |

### DOCS-003 — Selected static document reset after refresh

| Field | Value |
| --- | --- |
| Severity | Medium |
| Expected | Selected page persists and supports history navigation |
| Actual before change | component state reset to default |
| Resolution | `doc` query parameter in this branch |
| Status | VERIFIED IN BRANCH |
| Verification | direct URL, reload, back, and forward passed in Chromium |

### DOCS-004 — Mermaid is unsupported

Mermaid content is safely displayed as code but not rendered. Status OPEN.
Do not add runtime Mermaid without sanitizer, accessibility, export, and error
behavior.

### DOCS-005 — Search index is hard-coded

New repository Docs pages do not enter semantic search automatically. The static
title/path filter sees them, but `knowledge.indexAllDocs` requires manual code
changes. Status OPEN.

## UX and accessibility findings

Strengths:

- one Documentation H1;
- named tabs, page buttons, page selector, and filter;
- sanitized HTML output;
- mobile page selector;
- readable tables and code;
- missing-page error card.

Gaps:

- section navigation disappears below `lg` and becomes a long flat select;
- no result-count or no-results message for filtering;
- no active document URL before this branch;
- global-versus-workspace scope is not explained;
- source-coded status is not enforced;
- authoring, validation, focus recovery, and error association cannot be tested.

## Recommended product slices

### Docs PR 1 — Scope and reliability

- recover from invalid workspace without App crash;
- explicitly label global repository Docs;
- manifest-driven static catalog and search index;
- preserve document URL/history;
- add filter no-results and announcements.

### Docs PR 2 — Governed documents

- collections and documents tables;
- workspace, owner, reviewer, status;
- Markdown editor with manual save and optimistic conflict detection;
- immutable revisions and history;
- search;
- direct routes and record relationships.

### Docs PR 3 — Repository synchronization

- import/export with diff preview;
- source commit and path;
- sync status and conflict detection;
- approval before publication;
- attachment/evidence relationships.

## Risks

- mixing global repository guides and workspace records;
- inventing a second unsynchronized document catalog;
- interpreting Markdown status as enforced approval;
- unsafe rich rendering;
- search omissions;
- write conflicts between Git and UI.

## Decisions

- do not bypass missing UI authoring with direct Convex inserts;
- use the existing static Docs browser as the current operator mirror;
- use stable `SFE-DOC-*` IDs for compatibility mapping;
- implement dynamic persistence only through an approved design and Work Order;
- treat the workspace mismatch as a critical defect, not an operator mistake.

## Open questions

- Is `w17bnn...` from another Convex deployment or a malformed ID?
- Should repository guides remain global while governed documents are
  workspace-scoped?
- What is the publication approval authority?
- Is Git or a Docs revision authoritative during a conflict?
- Which source formats and attachments are allowed?

## Supporting evidence

- Operator page: `SFE-DOC-008`
- Supplied invalid URL browser console captured during this cycle
- Existing Docs source files listed above
- Screenshot directory:
  `docs/testing/evidence/mission-control-docs/`

## Next action

Create a governed Work Order for DOCS-001 and the dynamic-authoring design. Do
not claim the mandatory create/edit/save/history journey complete until those
features exist.
