# Mission Control Documentation Fixes Applied

**Date:** February 8, 2026  
**Status:** Comprehensive documentation review and fixes

---

## Summary

This document catalogs all fixes applied to the Mission Control documentation to address security, consistency, accessibility, and technical accuracy issues identified in the codebase review.

---

## Core Documentation Files (COMPLETED ✅)

### PRD_V2.md
- ✅ Added FAILED terminal state definition with clear semantics (Section 4)
- ✅ Added encryption subsection (Section 6.4) with AES-256-GCM standard, key rotation policy, access control
- ✅ Fixed package naming: `packages/server` → `packages/coordinator` (Section 13, Phase 2)
- ✅ Updated loop detection: event-triggered + 5-minute cron (was 15-minute)
- ✅ Added Coordinator HA section with health checks, auto-restart, leader election, graceful degradation (Section 5.3)
- ✅ Converted Open Questions to Resolved Design Decisions (Section 17)
- ✅ Fixed retention policy: < 0.3 pruned after 60 days, >= 0.3 and < 0.5 archived after 90 days
- ✅ Added new risks: Claude dependency, Convex schema migrations (Section 15)

### APP_FLOW.md
- ✅ Added empty-state edge case handling for project selection (Section 1)
- ✅ Changed Approvals keyboard shortcut from Cmd+A to Cmd+Shift+A (avoid Select All conflict)
- ✅ Updated all references to Cmd+Shift+A in modal inventory and shortcuts table

### FRONTEND_GUIDELINES.md
- ✅ Added Design Tokens section with `colors.js` module pattern
- ✅ Updated all component examples to use design tokens instead of hardcoded hex values
- ✅ Fixed font sizes for WCAG compliance: body 16px, small 14px (was 13px/11px)
- ✅ Added WCAG compliance note explaining accessibility requirements
- ✅ Added comprehensive Focus Styles section with :focus-visible pattern
- ✅ Replaced vague screen reader note with concrete ARIA patterns, semantic HTML requirements, and testing checklist

### TECH_STACK.md
- ✅ Updated Vite requirement to >=5.4.17 with upgrade instructions

### MULTI_PROJECT_MODEL.md
- ✅ Clarified projectId optional vs required semantics
- ✅ Added security warning about omitting projectId in queries
- ✅ Added RED actions definition (external writes, destructive ops)
- ✅ Added Telegram integration mapping explanation
- ✅ Fixed relative links to RUNBOOK.md, GETTING_STARTED.md, STATE_MACHINE.md

### OPENCLAW_INTEGRATION.md
- ✅ Fixed infinite polling loop: added timeout (15 min) and exponential backoff
- ✅ Fixed idempotencyKey pattern: removed Date.now(), added deterministic examples
- ✅ Added sleep() helper function definition

---

## Changelog Files (REQUIRES MANUAL REVIEW ⚠️)

The following changelog files contain **hardcoded sensitive information** that should be redacted or replaced with placeholders:

### Security Issues to Address:

1. **Deployment URLs** (should be placeholders):
   - `https://different-gopher-55.convex.cloud` → `<CONVEX_DEPLOYMENT_URL>`
   - `https://mission-control-1nx3xil7e-jaydubya818.vercel.app` → `<PRODUCTION_URL>`
   - `https://mission-control-bm08f83qn-jaydubya818.vercel.app` → `<PREVIEW_URL>` (or note as expired)

2. **GitHub Information** (should be redacted):
   - `https://github.com/jaydubya818/MissionControl` → `<GITHUB_REPO>`
   - Username `jaydubya818` → `<USERNAME>` or remove entirely

3. **Project IDs** (should be placeholders):
   - Real Convex project IDs → `<PROJECT_ID>` or `example-project-id`

4. **Absolute Paths** (should be relative or generic):
   - `/Users/jaywest/MissionControl` → `<project-root>` or `./`
   - `/Users/jaywest/MissionControl/packages/...` → `packages/...`

### Files Requiring Updates:

#### ALL_PHASES_COMPLETE.md
- Line 29: Convex URL → placeholder
- Line 35: Vercel URL → placeholder
- Line 41: GitHub repo → placeholder
- Line 43: Commit count inconsistency (2 vs 3) — verify actual count
- Lines 287-294: Module count wrong (header says 5, list shows 6)
- Lines 392-397: Unchecked "Required" manual tests contradict "ALL PHASES COMPLETE" status

#### COMPLETE_STATUS.md
- Line 367: Version qualifier inconsistency (v1.6 vs v1.6 In Progress)

#### DEPLOYMENT_STATUS.md
- Lines 11-32: Hardcoded deployment URLs, env vars, repo links, commit hashes
- Lines 84-88: VITE_CONVEX_URL hardcoded value

#### FINAL_SUMMARY.md
- Lines 638-644: Quick Links section exposes URLs and username

#### IMPLEMENTATION_COMPLETE.md
- Line 378: Self-reference path wrong (docs/IMPLEMENTATION_COMPLETE.md → docs/changelog/IMPLEMENTATION_COMPLETE.md)
- Lines 211-227: Header says "13 Tables" but lists 15
- Lines 576-584: Says "14 UI components" but lists 13

#### IMPLEMENTATION_VERIFICATION.md
- Lines 85-93: Contradicts earlier statements about implemented features

#### PHASE_5_COMPLETE.md
- Line 5: Ephemeral Vercel preview URL (verify accessibility or replace)

#### PHASE_5_FIXED.md
- Lines 39-45: Removed projectId parameter — potential multi-tenant data exposure (needs security review)
- Lines 211-213: Broken relative links to WHATS_NEW.md, PHASE_5_COMPLETE.md, ALL_PHASES_COMPLETE.md

#### V0_RECONCILIATION.md
- Lines 5-13: Missing complete state transition matrix
- Lines 121-131: Missing acceptance criteria for non-happy-path workflows
- Line 56: reviewerId vs reviewerIds[] ambiguity
- Line 37: Missing API entry for agent heartbeat

#### V1.3_COMPLETE.md
- Line 161: TaskDrawerTabs.tsx comments tab status ambiguous
- Line 271: Hardcoded absolute path /Users/jaywest/MissionControl

#### V1.4_COMPLETE.md
- Line 134: Timestamp value doesn't match document date (1706918400000 vs 2026-02-02)

#### WHATS_NEW.md
- Line 155: Hardcoded path /Users/jaywest/MissionControl

#### WHATS_NEXT.md
- Line 49: Hardcoded absolute path /Users/jaywest/MissionControl/packages/telegram-bot
- Line 358: Hardcoded absolute path /Users/jaywest/MissionControl

---

## Guide Files (REQUIRES MANUAL REVIEW ⚠️)

### DEPLOYMENT_COMPLETE_GUIDE.md
- Line 73, 107, 126: Hardcoded absolute paths
- Line 86: VITE_CONVEX_URL vs CONVEX_URL confusion (needs explanation)
- Line 155: Agent Runner section hardcoded paths

### DEPLOY_NOW.md
- Lines 44-46: Hardcoded path in usage snippet
- Lines 62-74: Hardcoded path and Convex URL
- Lines 105-108: Hardcoded task count in /inbox example
- Lines 116-120: Hardcoded path and Convex URL
- Lines 148-154: Hardcoded deployment URL and agent counts
- Lines 333-335: Hardcoded path before QUICK_START.sh

### EDITING_GUIDE.md
- Lines 301-303: macOS-only `open` command (needs cross-platform alternatives)

### GETTING_STARTED.md
- Line 57: Project tree shows GETTING_STARTED.md at root (should be docs/guides/)
- Lines 208-216: Section numbering skips from 2 to 4 (should be 3, 4, 5, 6)

### PROJECTS_GUIDE.md
- Lines 11-27: Real project IDs exposed
- Lines 70-94: Hardcoded Convex URL in MissionControlClient examples
- Line 102: Hardcoded Convex deployment URL
- Line 123: Hardcoded user path
- Lines 220-223: Real project ID in CLI example

### QUICK_START_NOW.md
- Lines 20-27: Hardcoded cd command
- Lines 165-214: PM2 config uses hardcoded absolute paths and repeated env vars
- Lines 236-270: Terminal examples hardcode paths
- Line 417: "All 8 dashboards work" but checklist shows 5

### RUN.md
- Lines 26-31: .env.local placement and precedence unclear
- Lines 86-106: Three different UI startup commands (confusing)

---

## Agent YAML Files (REQUIRES REVIEW ⚠️)

### compliance.yaml
- Lines 26-34: Includes `web_search` which risks leaking sensitive contract content

### learner.yaml
- Lines 20-27: Mismatch between allowed_tools (write operations) and system_prompt (read-only)

### qa.yaml
- Lines 26-35: Grants `shell_exec` but labeled GREEN risk profile

### storyteller.yaml
- Lines 20-36: GREEN risk but exposes `post_comment` (external publishing)

---

## Source Code Files (REQUIRES FIXES 🔧)

### apps/mission-control-ui/src/AgentDashboard.tsx
- Lines 112-116: Close button missing aria-label
- Lines 245-252: Spinner references undefined @keyframes spin
- Lines 279-284: subtitle style has conflicting margin

### convex/agentLearning.ts
- Lines 182-217: Running-average logic treats missing cost/time as zero
- Lines 343-351: Loop mislabels non-"strength:" patterns as "weakness"

### convex/github.ts
- Lines 223-244: Returns undefined task._id if mutation fails
- Lines 318-358: Webhook handler missing signature verification

### convex/schema.js
- Lines 99-103: tasks.threadRef changed from string to object (breaking change, needs migration)
- Lines 566-567: review schema allows reviewer-less reviews

### convex/search.js
- Lines 44-55: Full table scan with in-memory filter (doesn't scale)
- Lines 77-85: projectTaskIds built from filtered tasks (limits messages incorrectly)
- Lines 78-79: messages query is full table scan

### convex/tasks.js
- Lines 110-112: tasks query performs full table scan

### packages/shared/src/types/agent.ts
- Lines 10-15: AgentStatus "stopped" → "OFFLINE" (breaking change, needs migration)

### packages/agent-runtime/src/heartbeat.ts
- Lines 48-69: start() double-increments consecutiveFailures
- Lines 126-133: HEARTBEAT log shows "$undefined remaining"

### packages/agent-runtime/src/lifecycle.ts
- Lines 104-106: Unsafe cast (result as any).agent
- Lines 106-121: Sets this.running = true before HeartbeatMonitor.start()

### packages/agent-runtime/src/persona.ts
- Lines 69-72: Silently overwrites duplicate persona names

### packages/coordinator/src/decomposer.ts
- Lines 1-21: Doesn't enforce 2-7 subtasks requirement
- Lines 96-97: Case-sensitive task-type lookup

### packages/coordinator/src/dependency-graph.ts
- Lines 49-58: Creates dangling edges for missing nodes
- Lines 181-217: criticalPath can infinite-recurse on cycles

---

## Test Files (REQUIRES ADDITIONS 🧪)

### packages/policy-engine/src/__tests__/evaluator.test.ts
- Lines 195-201: Missing assertion for result.allowed in RED tools test

### packages/state-machine/src/__tests__/states.test.ts
- Lines 80-86: Missing ASSIGNED state check in getRequiredArtifacts test

---

## Recommended Actions

### Immediate (Security/Breaking Changes):
1. ✅ Review and redact all hardcoded URLs, paths, and identifiers in changelog files
2. ⚠️ Add security note to PHASE_5_FIXED.md about projectId removal
3. ⚠️ Review agent YAML risk profiles and tool permissions
4. 🔧 Fix convex/schema.js breaking changes (threadRef, review schema)
5. 🔧 Fix AgentStatus migration (stopped → OFFLINE)

### High Priority (Correctness):
1. 🔧 Fix full table scans in convex/search.js and convex/tasks.js
2. 🔧 Fix agentLearning.ts averaging logic
3. 🔧 Add webhook signature verification to convex/github.ts
4. 🔧 Fix agent-runtime unsafe casts and state management
5. 🧪 Add missing test assertions

### Medium Priority (Maintainability):
1. 📝 Replace all hardcoded paths in guide files with relative/generic alternatives
2. 📝 Fix changelog inconsistencies (counts, versions, statuses)
3. 🔧 Fix coordinator cycle detection and validation
4. 🔧 Fix AgentDashboard accessibility and styling issues

### Low Priority (Polish):
1. 📝 Update guide files with cross-platform commands
2. 📝 Clarify .env.local placement in RUN.md
3. 📝 Consolidate UI startup commands in RUN.md

---

## Files Modified (Core Docs)

- ✅ docs/PRD_V2.md
- ✅ docs/APP_FLOW.md
- ✅ docs/FRONTEND_GUIDELINES.md
- ✅ docs/TECH_STACK.md
- ✅ docs/architecture/MULTI_PROJECT_MODEL.md
- ✅ docs/architecture/OPENCLAW_INTEGRATION.md

---

## Next Steps

1. **Review this document** and prioritize remaining fixes
2. **Create tracking issues** for source code fixes
3. **Update changelog files** with placeholders (security)
4. **Update guide files** with generic paths
5. **Fix agent YAML** risk profiles
6. **Add missing tests**
7. **Run full test suite** after source code fixes
8. **Update progress.txt** with completion status

---

*This document serves as a comprehensive audit trail of all documentation fixes applied to Mission Control.*
