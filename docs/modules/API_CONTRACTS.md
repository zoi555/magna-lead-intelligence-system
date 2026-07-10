# API Contracts

Draft only. Do not implement final endpoints until data model is confirmed.

## Candidate internal endpoints

- `POST /api/runs/manual-test`
- `POST /api/runs/start`
- `GET /api/runs/:id`
- `GET /api/leads`
- `GET /api/ignored-leads`
- `POST /api/exports/crm-draft`
- `GET /api/telemetry`

## API rule

All mutation endpoints require authenticated management/admin role and audit logging.
