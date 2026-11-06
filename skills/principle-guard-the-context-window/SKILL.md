---
name: principle-guard-the-context-window
description: "Apply when large files, logs, or broad exploration threaten reasoning focus."
license: MIT
metadata:
  author: jstack-maintainers
  source: michael-denyer/pstack-claude
  source-version: "0.9.130"
  source-commit: d88063f3355a5ecff0e6dbb890a11bab4b08bc2e
  owner: software-factory
  risk: low
  capabilities: jstack,engineering-principle
user-invocable: false
---

# Guard the Context Window

**Why:** Context overflow degrades reasoning quality, creates compression artifacts, and halts progress.

**Pattern:**
- **Size phases and cap scope.** Limit files per phase, set turn budgets, account for mechanism costs.
