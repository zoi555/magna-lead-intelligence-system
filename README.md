# Magna Lead Intelligence System

## Summary

The Magna Lead Intelligence System is a business-critical outbound acquisition and retention-support pipeline for Magna Foodservice. It finds, verifies, deduplicates, scores, and routes foodservice prospects using platform discovery, FSA registration checks, Companies House enrichment, RapidFuzz matching, and manual CRM export to Magna Sales Pro.

This is not an AI-agent toy. The core pipeline must be deterministic, auditable, cheap, and explainable. Runtime LLM use is explicitly out of MVP, because letting a language model decide live sales targeting would be the kind of idea people later describe in incident reports.

## Local path

```text
~/Projects/magna/lead-intelligence-system/
```

## MVP

One approved postcode scope in, verified/scored/deduplicated leads out to Magna Sales Pro export, with zero active-customer contamination and manual review before CRM upload.

## Read first

- `CLAUDE.md`
- `PROJECT_STATUS.md`
- `docs/00_PROJECT_CONTEXT.md`
- `docs/01_REQUIREMENTS.md`
- `docs/02_ARCHITECTURE.md`
- `docs/03_DATA_MODEL.md`
- `docs/04_WORKFLOWS.md`
- `docs/05_INTEGRATIONS.md`
- `docs/06_SECURITY.md`
- `docs/11_ISSUES_LOG.md`

## Source material

Original source files are kept in `docs/source_material/` for reference. Do not commit secrets or API keys.
