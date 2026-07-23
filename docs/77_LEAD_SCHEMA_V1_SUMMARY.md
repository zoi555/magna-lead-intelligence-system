# Lead Data Schema v1 — Human-Readable Summary

Generated: 2026-07-23. Source spreadsheets located in `~/Downloads` (owner-supplied, not
committed — see "Do not depend permanently on local spreadsheets" below):
`Lead_Data_Schema_and_SalesPro_Mapping_v1.xlsx`, `CTO_New_Fields_To_Add_v1.xlsx`/`.csv`,
`CTO_Lead_Import_Template.xlsx`. Converted and validated into version-controlled JSON —
spreadsheets are no longer a dependency for any code path; only the JSON config is.

## Versioned artefacts

- `config/lead-production/master-schema-v1.json` — 107 canonical master fields.
- `config/lead-production/salespro-schema-v1.json` — 108-column Magna Sales Pro export schema
  (20 existing CTO columns, exact label/order preserved, + 88 new columns appended).
- `config/lead-production/cto-existing-field-mapping-v1.json` — the CTO's own 20-column import
  template, mapped field-by-field to our canonical names, cross-validated verbatim against the
  raw `CTO_Lead_Import_Template.xlsx` header.
- `config/lead-production/sales-territories-v2.json` — the current 13-representative,
  112-district assignment (see `docs/78_SALES_TERRITORIES_V2.md` or the handover doc for detail).

**The CTO's existing 20 labels and column order are preserved exactly as supplied.** Any future
CTO change must be introduced as a new versioned mapping (e.g. `v1.1`) — this v1 file is never
overwritten or silently altered.

## Validated invariants (all confirmed against the source spreadsheets)

- Exactly 107 unique Master fields, no duplicate labels, no duplicate canonical names.
- Exactly 20 existing CTO fields, in the CTO's own exact label/column order — cross-checked
  verbatim against the raw `CTO_Lead_Import_Template.xlsx` header row (byte-for-byte match).
- Exactly 88 unique new CTO fields, none of which repeats any of the existing 20 fields' labels
  or canonical names.
- Exactly 108 final Sales Pro columns (20 existing + 88 new, in the approved final order).
- Every Sales Pro field maps to a canonical Master field or carries a documented
  transformation/export rule (default/derived/manual value) — none is unmapped or unexplained.
- **One documented, deliberate exception, not an error:** the canonical name
  `assigned_representative` appears on two of the CTO's own existing columns — "Field Sales Rep"
  (populated when Sales Role is Field Sales or Both) and "Sales Rep" (populated when Sales Role
  is Telesales or Both). This is a genuine feature of the CTO's own template, not a duplicate to
  fix.

## Field categories (Master Schema, 107 fields)

Categories mirror the canonical field inventory built for UB1
(`docs/76...` — see `/Users/homemac/Data/aspectlead-lead-production/schema/canonical-field-inventory-summary.md`
for the full 344-field pipeline-internal inventory this 107-field *sales-facing* schema was
curated from): Assignment and Control, Business Identity, Address and Geography, Contact
Information, FSA, Google, Companies House, Financials, Directors and PSC, Website and Public
Profile, Customer Matching, Group and Franchise, Commercial Intelligence, Qualification,
Scoring, Channel Eligibility.

## Relationship to the canonical field inventory

This 107/108-field sales-facing schema is a **curated subset** of the full 344-field
pipeline-internal inventory produced earlier this session
(`/Users/homemac/Data/aspectlead-lead-production/schema/canonical-field-inventory.json`) — every
audit/evidence-only field (raw API payloads, per-gate hard-gate detail, per-component scoring
audit trail, config hashes, checksums) is deliberately excluded from the sales-facing schema;
only rep-safe, business-actionable fields were carried forward, per the earlier inventory's own
`rep_safe`/`sales_pro_suitable` classification.

## Do not depend permanently on local spreadsheets

The four source `.xlsx`/`.csv` files remain in `~/Downloads` (the owner's machine) as the
original approval record, but are NOT committed to the repository and are NOT read by any
pipeline code. `config/lead-production/*.json` is the sole runtime dependency going forward.
