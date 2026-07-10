# Workflows — Magna Lead Intelligence System

## MVP workflow

```text
Postcode scope selected
  -> platform discovery
  -> postcode/address filter
  -> group brands at same premises
  -> deduplicate against NetSuite customer master
  -> active match: discard to ignored log
  -> inactive match: reactivation list
  -> no customer match: FSA address check
  -> no FSA: manual review or reject
  -> Companies House enrichment
  -> scoring + triggers
  -> management review
  -> manual CRM export to Magna Sales Pro
  -> telesales works leads
  -> outcomes feed quarterly recalibration
```

## Same-day trigger workflow

A lead bypasses the weekly queue if any of these are found:

- New FSA registration under 60 days.
- Recent director/PSC ownership change.
- Public review complaint showing supplier failure or switching signal.

## Manual CRM upload gate

CRM upload stays manual in MVP. This is not weakness; it is quality control. One bad automated batch could create embarrassing calls to existing customers, and that is not “automation”, it is reputational vandalism.

## Weekly cadence

- System processes/scoring runs.
- Zoeb reviews scored batch before CRM upload.
- Sales Manager/reps review conversion outcomes.
- Trigger-flagged leads handled same day.

## Quarterly cadence

- Recalibrate scoring model against real conversion data.
- Review ignored leads for patterns.
- Review cost and run telemetry.

## Manual test protocol

Before any new source/stage goes live at volume, one business must be run manually end to end in under 10 minutes:

1. Find business on platform.
2. Confirm postcode.
3. Check against customer list.
4. Match FSA record by address.
5. Check Companies House by address/operator.
6. Score and explain result.
7. Confirm export field values.

If this cannot be done manually, automation is not ready. Machines are excellent at scaling stupidity.
