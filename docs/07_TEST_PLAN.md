# Test Plan — Magna Lead Intelligence System

## Gate 1 — documentation/setup tests

- [ ] Project folder exists under `~/Projects/magna/lead-intelligence-system/`.
- [ ] Git repo initialised.
- [ ] No secrets committed.
- [ ] `scripts/validate-project-docs.ts` passes.
- [ ] GitHub repo created.

## Gate 2 — data source manual test

Run one business manually end to end before automation:

- [ ] Platform listing found.
- [ ] Address/postcode confirmed.
- [ ] Customer dedup checked.
- [ ] FSA matched by address.
- [ ] Companies House checked by address/operator.
- [ ] Contact number source recorded.
- [ ] Score calculated by hand.
- [ ] Export row created.

## Gate 3 — pipeline test

- [ ] One postcode scope runs in UAT.
- [ ] Counts logged by stage.
- [ ] Active customer matches do not reach export.
- [ ] Inactive matches route to Reactivation List.
- [ ] No-FSA or ambiguous matches route correctly.
- [ ] Cost cap handling tested.
- [ ] Failure/retry state tested.

## Gate 4 — dashboard/export test

- [ ] Management dashboard loads.
- [ ] Ignored leads searchable.
- [ ] Run telemetry visible.
- [ ] Manual export generated.
- [ ] Export accepted by Magna Sales Pro test/import process.

## Gate 5 — first sales validation

- [ ] First 20 calls reviewed.
- [ ] Correct business trading status.
- [ ] Correct or useful phone number.
- [ ] Correct decision-maker where available.
- [ ] Sales feedback captured for recalibration.
