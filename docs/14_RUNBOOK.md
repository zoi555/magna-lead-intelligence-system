# Runbook — Magna Lead Intelligence System

## Before any run

1. Confirm postcode scope.
2. Confirm API keys/quotas are configured.
3. Confirm UAT database target.
4. Confirm customer master export is current.
5. Confirm no production CRM write.

## If scraper/API fails

- Mark affected lead/run stage as pending.
- Retry on next scheduled run.
- Do not discard unless failure is confirmed permanent.
- Log failure in `run_telemetry` and `audit_events`.

## If budget cap is hit

- Pause run.
- Log event.
- Review volume and paid-call triggers.
- Do not silently continue spending.

## If dedup error found

- Stop export.
- Review ignored/audit logs.
- Reprocess affected run.
- Update bug log and scoring/matching rule documentation.

## If bad CRM export sent

- Pause further exports.
- Identify affected leads.
- Notify Sales Manager.
- Mark records in CRM/export log.
- Correct export mapping before resuming.
