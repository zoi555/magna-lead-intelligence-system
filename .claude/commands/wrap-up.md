# Wrap-up

End-of-session housekeeping. Run this before finishing any working session.

## Always update

- `PROJECT_STATUS.md` — current state, what works, what is blocked, immediate next action.
- `docs/15_AI_WORK_LOG.md` — what was done this session.

## Update only if it changed this session

- `docs/11_ISSUES_LOG.md` — if blockers or unresolved issues changed (new, closed, or reprioritised).
- `docs/10_BUGS_AND_FIXES.md` — if a bug was fixed.
- `docs/09_DECISIONS.md` — if any decision was made (add an ADR).
- `VERIFY_BEFORE_CLAIMING.md` — if anything was checked, tested, or verified.

## Rules

- **Never claim the app works** unless a real test, build, deployment, or manual verification was actually completed. A passing build alone is not full verification.
- **Do not mark a blocker resolved** unless the supporting evidence is recorded (in `docs/11_ISSUES_LOG.md` and/or `VERIFY_BEFORE_CLAIMING.md`).
- Update files **on change only** — do not churn files that did not change.

## Finish with

State the **next exact action** — the single concrete thing to do next session.
