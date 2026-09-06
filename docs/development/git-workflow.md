---
status: current
source_of_truth: false
last_updated: 2026-08-08
related_modules: []
related_decisions: []
---

# Git workflow

## Branching

- **Major features** get a `feature/<name>` branch, merged back to `main` via PR (e.g.
  `feature/supabase-migration-and-site-rebuild`, merged via PR #1 — see `git log --merges`).
- **Small fixes** stay on the current branch — no branch-per-typo.
- Branch and milestone planning happens up front, and work is broken into small, focused commits
  rather than one large commit per feature.

## Commit message convention

Single-line, `<type>: <description>`, no bodies, no co-author trailers, per the project's
documented policy. **Observed types in `git log`** (all-time tally):

| Type | Count |
|---|---|
| `feat` | 31 |
| `build` | 16 |
| `fix` | 14 |
| `docs` | 13 |
| `refactor` | 1 |
| `ci` | 1 |

**Contradiction:** the documented policy lists the allowed commit types as
**only** `feat\|fix\|build\|docs`, but actual history contains one `refactor:` commit (the most
recent: "refactor: simplify appointments to admin-only, drop locale routing and i18n, adopt R2
storage") and one `ci:` commit. Treat `feat/fix/build/docs` as the house style to follow when
writing new commits — `refactor`/`ci` are outliers, not evidence the rule changed.

## Pull requests

Feature branches merge via GitHub PR (`gh pr create`), not a direct push to `main`, for
multi-commit feature work. Single small fixes may land as a direct commit to `main`.
