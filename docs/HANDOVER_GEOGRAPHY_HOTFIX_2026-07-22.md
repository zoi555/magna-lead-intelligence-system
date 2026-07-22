# AspectLead Geography Hotfix Handover

Date: 22 July 2026

Branch:
feature/mvp-vertical-slice-001

Accepted hotfix commit:
fc5063b

Production repair audit event:
4be92d93-a815-4750-8c85-cce196dc58b7

Affected proof run:
c301cbbc-5c6d-4b5d-8c7e-d7bdeccbc1a9

## Why the hotfix was required

consolidateRun() previously consolidated every canonical, non-duplicate Just Eat observation without enforcing the run-specific geography verdict.

persistConsolidation() then stamped every candidate as valid_geography.

The proof run therefore retained 646 candidates as operationally valid even though only 94 unique candidates were supported by valid run-scoped geography evidence.

## Accepted production state

- total retained candidates: 646
- valid_geography: 94
- out_of_scope_geography: 552
- unverifiable_geography: 0
- mixed-verdict candidates: 0
- candidate source links: 716
- raw observations unchanged
- geography validations unchanged

Rejected candidates were retained as evidence rather than deleted.

Operational query helpers now require:

geography_status = 'valid_geography'

## Verification completed

- geography-consolidation regression tests passed
- geography-gate tests passed
- Just Eat Supabase tests passed
- operational-candidate query tests passed
- typecheck passed
- production build passed
- both Vercel projects deployed and verified on commit fc5063b

Canonical production:

https://magna-lead-intelligence-system-pngu.vercel.app

## Important operating restriction

Do not use all 646 retained candidates as a sales-ready pool.

Only the 94 candidates with geography_status = valid_geography are operationally eligible from this repaired run.

The 552 out-of-scope candidates remain available only for:

- evidence
- exceptions
- reassignment to the correct territory
- later review

## Emergency data rollback

The repair can technically be reverted to the exact pre-repair database state because all 646 candidates were previously stamped uniformly as valid_geography.

Emergency rollback SQL:

```sql
begin;

update consolidated_candidates
set
  geography_status = 'valid_geography',
  geography_reason = null
where run_id = 'c301cbbc-5c6d-4b5d-8c7e-d7bdeccbc1a9';

-- Verify exactly 646 rows belong to the run before committing.

commit;
```
