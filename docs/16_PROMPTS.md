# Prompts — Magna Lead Intelligence System

## First Claude Code prompt

```text
You are inside the Magna Lead Intelligence System repo.

Read CLAUDE.md, PROJECT_STATUS.md, project_manifest.yml, VERIFY_BEFORE_CLAIMING.md, docs/00_PROJECT_CONTEXT.md through docs/17_HANDOVER.md, and all active docs/modules files.

Do not code yet.

First produce:
1. current project diagnosis,
2. blockers,
3. MVP scope risks,
4. exact files you need from Zoeb,
5. proposed GitHub issues,
6. proposed implementation sequence,
7. what should be validated manually before automation.

Do not create app code until Zoeb confirms the blockers are handled.
```

## Start build prompt after blockers are resolved

```text
Blockers have been resolved. Start with the smallest safe MVP. Create only the files needed for UAT schema/pipeline skeleton. Keep CRM upload manual. Do not add runtime LLM, automated CRM write, or production deployment. Update docs after every change.
```

## End session prompt

```text
Before ending, update PROJECT_STATUS.md, docs/15_AI_WORK_LOG.md, docs/09_DECISIONS.md if decisions changed, docs/10_BUGS_AND_FIXES.md if bugs were fixed, docs/11_ISSUES_LOG.md if anything remains unresolved, and VERIFY_BEFORE_CLAIMING.md with exact verification evidence.
```
