# Requirements — Magna Lead Intelligence System

## MVP requirements

1. Run lead discovery for one confirmed postcode scope.
2. Use delivery platforms as primary discovery, not Google Places bulk search.
3. Filter to in-scope business postcodes.
4. Group platform brands by physical address.
5. Deduplicate against Magna customer records.
6. Auto-discard active customer matches.
7. Route inactive customer matches to Reactivation List.
8. Match FSA records by physical address.
9. Enrich company profile via Companies House by address/operator correlation.
10. Estimate size using platform review volume/rating, not turnover assumptions.
11. Apply final score and tier.
12. Flag triggers: new business, ownership change, review complaints.
13. Export reviewed leads to Magna Sales Pro manually.
14. Store full internal record and ignored lead log in Supabase.
15. Record telemetry for every run: cost, duration, count at each stage, failure states.
16. Provide a management dashboard for ignored leads and run telemetry.
17. Keep audit trail for every lead, score, decision, ignored record, and export.

## MVP acceptance criteria

- One confirmed territory run produces verified, scored, deduplicated leads.
- Zero active Magna customer contamination reaches CRM export.
- First 20 telesales calls confirm correct number, correct decision-maker or business genuinely trading.
- Manual one-business end-to-end test passes before automated volume runs.
- No secrets in repo.
- UAT database has RLS designed before production.

## Not MVP

- Automated write access to Magna Sales Pro.
- Runtime LLM-based decisions.
- Menu classification using LLM.
- Off-platform business discovery campaign.
- Full route expansion pipeline activation.
- Mass WhatsApp messaging.
- Production deployment before UAT validation.

## Phase 2 / later

- Menu classification.
- Off-platform businesses from FSA/Google sweep.
- More business types: butchers, supermarkets, shops.
- Automated same-day assignment into CRM after six months of reliable manual uploads.
- Open Projects app integration for project health and logs.

## Open requirement conflicts

1. MVP scope conflict: Volume 4 says one outer code; presentation says one inner sector `UB1 2`.
2. Dedup threshold conflict: technical docs use 80%+; presentation mentions 70%+ for inactive/reactivation special case.
3. Presentation still shows Google Places as discovery stage, but Volume 2 supersedes it with platform-first discovery.
