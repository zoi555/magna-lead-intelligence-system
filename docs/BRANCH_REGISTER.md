# Branch Register

Generated: 2026-07-23. Audited via `git status`, `git branch --all --verbose --no-abbrev`,
`git log --graph --decorate --oneline --all`, `git remote -v`, plus `git merge-base` /
`git rev-list --left-right --count` checks for merge/ahead-behind status.

**Commits are not branches.** This register lists the repository's actual branches only (3
local, 3 remote — one-to-one, no branch exists on only one side). The 92-commit sequence on
`feature/mvp-vertical-slice-001` is commit history *within* that one branch, not a list of
branches — do not confuse a commit SHA with a branch name anywhere in this document.

## Remote

`origin` → `https://github.com/zoi555/magna-lead-intelligence-system.git` (fetch + push).

## Current state at time of audit

- **Active branch:** `feature/mvp-vertical-slice-001`
- **Local HEAD:** `fbd2d61bf34a59d566a47d8df118306737a529e4` (107 commits ahead of `main`)
- **Remote HEAD (`origin/feature/mvp-vertical-slice-001`):** same SHA — fully pushed, zero commits ahead/behind origin
- **Update 2026-07-24:** Nauman's full Sales Territory (RM1-RM14, 14 Postcode Districts)
  processed live end-to-end and accepted on this same branch — no new branch created, no merge
  to `main`. See `docs/LEAD_PRODUCTION_HANDOVER.md` for full detail.
- **Update 2026-07-24 (later):** Manraj's full Sales Territory (KT1-KT24, 24 Postcode Districts)
  processed live end-to-end and accepted on this same branch, at this same commit — no code
  changes were needed for KT processing (the RM1-RM14-era fixes carried over clean), so HEAD is
  unchanged from the RM1-RM14 update. No new branch created, no merge to `main`. See
  `docs/LEAD_PRODUCTION_HANDOVER.md` for full detail.
- **Untracked files present:** yes, 2 —
  `scripts/export-operational-leads.ts` (pre-existing before this project's lead-production
  sessions began; never authored or touched by this work; intentionally left untracked) and
  `scripts/lead-production/generate-release-review.ts` (a v1-era release-review generator built
  and then superseded by `generate-release-package-v2.ts` mid-session; kept on disk as reference,
  never committed since it was superseded before completion).

## Branch table

| Branch | Local/Remote | Latest commit SHA | Latest commit date | Apparent purpose | Merged/Unmerged | Status | Safe-delete recommendation |
|---|---|---|---|---|---|---|---|
| `feature/mvp-vertical-slice-001` | Local + Remote (in sync) | `d67279b7b1442cb4fe8a13d7356b3a58738885d0` | 2026-07-23 21:29:28 +0100 | The single active development line for the entire AspectLead lead-intelligence system: Just Eat discovery, geography, Supabase auth, the full offline lead-production bridge (FSA/Google/Companies House/website/scoring/qualification v2), and the reusable multi-territory orchestrator. 92 commits ahead of `main`. | Unmerged into `main` | **Current** — this is the one active branch all work happens on | Do not delete. Actively in use. |
| `main` | Local + Remote (in sync) | `c91157c589233bfa7adf752b915a561e5fda7b0d` | 2026-07-11 18:40:22 +0100 | The nominal default/production branch. Has received no commits since `feature/mvp-vertical-slice-001` and `design/aspectlead-branding` both branched from it on 2026-07-11 — its last commit is an early AspectLead brand-board/wordmark draft, not any lead-production work. | N/A (nothing has been merged into or out of it since the fork point) | **Unknown/stale** — not advanced in 12+ days while `feature/mvp-vertical-slice-001` received 92 commits | Do not delete (default branch). Needs an explicit, separate decision on when/whether to merge `feature/mvp-vertical-slice-001` into it — not part of this task. |
| `design/aspectlead-branding` | Local + Remote (in sync) | `5077e545c2686823808be76ab1bbc5e2e45dcb90` | 2026-07-11 21:36:00 +0100 | Brand-identity/wordmark exploration (1 commit ahead of `main`: "checkpoint AspectLead spatial command brand direction draft"). Entirely unrelated to the lead-production pipeline. | Unmerged into `main` and into `feature/mvp-vertical-slice-001` | **Superseded/parked** — no activity since 2026-07-11, no lead-production content | Likely safe to delete once its design content is either merged or confirmed abandoned — **do not delete without separate explicit confirmation**; this document only flags it for later review. |

## Confirmed findings (all 6 required checks)

1. **Current active branch:** `feature/mvp-vertical-slice-001`.
2. **Current local HEAD:** `d67279b7b1442cb4fe8a13d7356b3a58738885d0`.
3. **Current remote HEAD:** identical SHA on `origin/feature/mvp-vertical-slice-001` — branch is
   fully pushed, 0 ahead / 0 behind.
4. **Every other local/remote branch:** `main` and `design/aspectlead-branding`, each present
   identically on both local and remote (no branch exists on only one side).
5. **Latest commit on each branch:** see table above.
6. **Merged/unmerged status:** `feature/mvp-vertical-slice-001` is NOT merged into `main`.
   `design/aspectlead-branding` is NOT merged into `main` or into `feature/mvp-vertical-slice-001`.
   `main` is an ancestor of `feature/mvp-vertical-slice-001` (i.e. `feature/mvp-vertical-slice-001`
   contains every commit `main` has, plus 92 more).

No branch was created, merged, or deleted producing this audit.
