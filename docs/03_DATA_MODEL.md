# Data Model — Magna Lead Intelligence System

## Status

Draft. Do not treat this as final SQL until CTO field validation against Magna Sales Pro is complete.

## Source field schema summary

The uploaded field schema workbook contains 102 fields across these groups:

| Group | Count | Purpose |
|---|---:|---|
| Identity | 11 | Who and where; lat/long feeds NetSuite + TMS |
| Contact | 10 | ALL numbers found across all sources — mobiles are priority |
| FSA Verification | 6 | Legitimacy; registration count splits multi-tenant buildings from multi-brand kitchens |
| Company Profile | 16 | CH matched by ADDRESS; director trace catches phoenix companies |
| CH Financials (Own Parser) | 18 | Parsed FREE from CH iXBRL filings — replicates DataLedger format (c_=current yr, p_=prior yr). Turnover/profit blank for most micro-entities. Financial_Label = our own formula verdict. |
| Platform | 9 | Trading proof + size proxy from reviews |
| Scoring | 9 | Calibrated model output; 80%+ match = auto-ignored to log |
| Pipeline | 4 | Batch tracking; Search_Code accepts outer (TW) or inner (TW1) codes |
| Contact — Additional Sources | 4 | WhatsApp link number extracted from Google/Facebook business page — TOP PRIORITY source, most likely to be the actual owner mobile for this demographic |
| Trigger Scoring + Review Mining (NEW — conversion-focused) | 9 | Timing-based buying signals: newly opened businesses and recent ownership changes have no incumbent supplier loyalty. Review mining flags businesses whose public reviews mention stock/quality/consistency complaints — a live signal their current supplier is failing them. Own-formula bonus applied on top of base score, shown separately for auditability. |

## Proposed Supabase tables

| Table | Purpose |
|---|---|
| `territory_sets` | A named, reusable collection of territory items selected for a run (see ADR-0009) |
| `territory_items` | Individual entries in a set: outer code, inner sector, uploaded delivery boundary list, pasted list, or expansion/out-of-area list |
| `pipeline_runs` | One row per discovery/scoring run; **references one `territory_set`** |
| `run_telemetry` | Counts, duration, cost and failures by stage |
| `leads` | Canonical lead record |
| `lead_brands` | Multiple brands at one physical premises |
| `lead_contacts` | Mobile/landline/contact-source records |
| `fsa_matches` | FSA match details by address |
| `company_profiles` | Companies House profile, directors, PSC, status |
| `company_financials` | Parsed CH financial fields and derived label |
| `platform_profiles` | Platform ratings, reviews, URLs, cuisine, active proof |
| `lead_scores` | Final score, tier, score breakdown, match percentages |
| `lead_triggers` | New business, ownership change, review complaint signals |
| `ignored_leads` | Active matches, out-of-area, low score, no FSA, not food, other ignores |
| `reactivation_leads` | Inactive valuable customer matches for reactivation |
| `expansion_pipeline` | Verified out-of-area leads for future routes |
| `crm_exports` | Manual export batches to Magna Sales Pro |
| `audit_events` | Immutable trace of every material action/decision |
| `manual_test_runs` | One-business manual validation runs |

## Territory model (ADR-0009)

Territory is per-run configuration, not a hardcoded scope. A `territory_set` is a named collection; a run points at exactly one set. Each `territory_item` carries a type so the pipeline knows how to expand it into postcodes:

| Item type | Example value | Notes |
|---|---|---|
| `outer_code` | `UB1`, `HA0` | One or more outer codes |
| `inner_sector` | `UB1 2`, `TW3 1` | One or more inner sectors; a single sector is valid as a manual-test input only |
| `delivery_boundary_upload` | uploaded file reference | Approved delivery postcode boundary list |
| `pasted_list` | free-text postcode list | Custom pasted postcodes |
| `expansion_list` | out-of-area list | Verified out-of-area / future-route postcodes |

The existing `Search_Code` flat field (outer or inner) remains the export-shape summary of what a lead was found under; it does not replace the normalised territory tables.

## Map layers must support multiple business overlays later (FUTURE — see ADR-0010)

Note only — not built or verified. The geospatial map is intended to become a **shared map engine** (ADR-0010), so the data model should later allow the same postcode-boundary/road base map to be joined to **multiple business overlays**, keyed by postcode area/district/sector:

- lead-search coverage (Phase 1),
- active vs inactive customers,
- customer/prospect demographics,
- new route planning,
- expansion territories.

Practical implication for a future schema: keep coverage/customer/demographic aggregates **joinable by postcode code** (area/district/sector) rather than baked into a single lead-specific table, so any overlay can bind to the shared boundary layer. No schema change is required now — this is a forward-looking constraint for Phase 2.

### Map POC validated the approach (ADR-0011 — not built in the app)

The accepted map POC (`magna-lead-intelligence-map-poc`) confirmed the joinable shape works in practice: real postcode **area/district/sector** polygons (derived from current OS Code-Point Open), an OS Open Roads layer, and a **delivery-area membership** layer, all joined to coverage by postcode code. This reinforces the constraint above and adds two MVP map data needs (see ADR-0011):

- **delivery boundary + remaining-delivery-gap** membership per postcode code (in-delivery, targeted vs not, expansion, outside),
- a **configurable feeder-route list** (road numbers) — data/config, not a hardcoded constant.

Still a forward-looking note — no schema, no app table exists yet.

## Important modelling rule

Do not create one giant 102-column table as the permanent internal model. That is spreadsheet-thinking in database trousers. Use a normalised internal schema, then export a flattened CRM/import shape when needed.

## Full flat CRM/import layout from workbook

| Field | Type | Notes |
|---|---|---|
| Lead_ID | Text | Unique ID generated by pipeline |
| Primary_Brand_Name | Text | Main trading name |
| All_Brand_Names | Text | Pipe-separated, every brand at address |
| Brand_Count | Number |  |
| Trading_Address | Text | Premises address |
| Town | Text |  |
| Postcode | Text |  |
| Outer_Code | Text |  |
| Inner_Code | Text |  |
| Latitude | Decimal | From FSA |
| Longitude | Decimal | From FSA |
| Phone_Mobile_1 | Text | PRIORITY — first mobile found |
| Phone_Mobile_2 | Text | Second mobile if found |
| Phone_Landline_1 | Text |  |
| Phone_Landline_2 | Text |  |
| Phone_Landline_3 | Text |  |
| Phone_Sources | Text | Pipe-mapped: number=source |
| Website_URL | Text |  |
| JustEat_URL | Text |  |
| UberEats_URL | Text |  |
| Deliveroo_URL | Text |  |
| FSA_ID | Text |  |
| FSA_Operator_Name | Text | Registered operator — key for CH address match |
| FSA_Business_Type | Text |  |
| Hygiene_Rating | Number | 1-5 |
| Last_Inspection_Date | Date |  |
| FSA_Registrations_At_Address | Number | >1 = multi-tenant building, split leads |
| CH_Company_Name | Text |  |
| CH_Number | Text |  |
| CH_Status | Text | Active / Dissolved / In Administration |
| Incorporation_Date | Date |  |
| SIC_Code | Text |  |
| Red_Flags | Text | Charges / strike-off / none |
| Director_1_Name | Text |  |
| Director_1_Role | Text |  |
| Director_1_LinkedIn | Text | URL if found — low hit rate expected |
| Director_2_Name | Text |  |
| Director_2_Role | Text |  |
| Director_2_LinkedIn | Text |  |
| PSC_1_Name | Text | Person with significant control |
| PSC_1_LinkedIn | Text |  |
| Directors_Other_Food_Companies | Yes/No | Director trace result |
| Directors_Other_Companies_List | Text | Name (CH no.), pipe-separated |
| Accounts_Type | Text | Micro / Small / Full / Dormant |
| Accounts_Date | Date | Latest filed accounts period end |
| c_Total_Assets | Currency | Current year |
| c_Fixed_Assets | Currency |  |
| c_Current_Assets | Currency |  |
| c_Cash_At_Bank | Currency |  |
| c_Debtors | Currency |  |
| c_Creditors | Currency |  |
| c_Current_Liabilities | Currency |  |
| c_Net_Assets | Currency | Solvency signal |
| p_Net_Assets | Currency | Prior year — for growth calc |
| c_Equity | Currency |  |
| c_Turnover | Currency | BLANK for most micro-entities |
| c_Gross_Profit | Currency | Only where full accounts filed |
| c_Net_Profit | Currency | Only where full accounts filed |
| Employee_Count | Number | Where disclosed |
| Net_Assets_Growth | Percent | (c-p)/p — our calculation |
| Financial_Label | Text | OUR formula: Solvent-Growing / Solvent-Stable / Thin / Insolvency-Flag / No-Data / Dormant |
| Platforms_Count | Number | 1-3 |
| JustEat_Rating | Decimal |  |
| JustEat_Reviews | Number |  |
| UberEats_Rating | Decimal |  |
| UberEats_Reviews | Number |  |
| Deliveroo_Rating | Decimal |  |
| Deliveroo_Reviews | Number |  |
| Cuisine_Type | Text |  |
| Multi_Brand_Flag | Yes/No |  |
| Google_Place_ID | Text | Permanent Google reference — enables caching, never re-lookup |
| Google_Rating | Decimal | Used in size proxy when platform reviews thin |
| Google_Reviews | Number | Substitutes into size proxy score in fallback cases |
| Google_Phone | Text | Fallback phone source — feeds Phone slots + Phone_Sources |
| Google_Address | Text | Address confirmation/gap-fill |
| Google_Lookup_Date | Date | When the paid call was made — cost audit trail |
| WhatsApp_Link_Number | Text | Extracted from wa.me link on Google/Facebook — TOP PRIORITY phone source |
| Website_Phone | Text | From contact/footer page of own website if present |
| Facebook_URL | Text | Business page if found |
| Facebook_Phone | Text | From Facebook business page contact info |
| Days_Since_FSA_Registration | Number | Newly opened = high switching-window signal |
| New_Business_Flag | Yes/No | TRUE if registered under 60 days ago |
| Recent_Ownership_Change_Flag | Yes/No | New director/PSC appointment OR dissolved+re-incorporated at same address |
| Ownership_Change_Date | Date | When the change was detected |
| Review_Trigger_Flag | Yes/No | Recent reviews mention supply/stock/quality/consistency complaints |
| Review_Trigger_Snippet | Text | Extracted quote/paraphrase driving the flag (max 200 chars, no verbatim copyright text) |
| Review_Trigger_Source | Text | Google / JustEat / UberEats / Deliveroo |
| Review_Trigger_Date | Date | Date of the flagged review |
| Trigger_Score_Bonus | Number | Points added to Lead_Score from triggers — shown separately for transparency |
| Lead_Score | Number |  |
| Priority_Tier | Text | A / B / Low / Ignore |
| Uniqueness_Pct | Percent | Confidence NOT existing/former customer |
| Legitimacy_Pct | Percent | Confidence real verified business |
| Match_Flag_Colour | Text | Green / Amber for partial matches under 80 |
| Matched_Account_Code | Text | If partial match |
| Match_Pct | Percent | Only shown if under 80 (80+ = auto-ignored) |
| Matched_Fields | Text |  |
| Score_Breakdown | Text | Human-readable trail |
| Run_Date | Date |  |
| Search_Code | Text | Outer (TW) or inner (TW1) code |
| Assigned_Rep | Text | Set on import |
| Lead_Status | Text | New / Contacted / Converted / Dead |

## Ignored leads log fields from workbook

| Field | Type | Notes |
|---|---|---|
| Ignored_Date | Date |  |
| Brand_Name | Text |  |
| Address | Text |  |
| Postcode | Text |  |
| Reason_Code | Text | ACTIVE_MATCH / DISSOLVED / OUT_OF_AREA / NOT_FOOD / LOW_SCORE / NO_FSA |
| Reason_Detail | Text | Plain English |
| Matched_Account_Code | Text |  |
| Match_Pct | Percent |  |
| Matched_Fields | Text |  |
| CH_Status | Text | If dissolved |
| Notes | Text |  |

## Open schema questions

- Which of the 102 fields can Magna Sales Pro actually accept?
- Are any fields required but not visible to telesales?
- Which fields must be management-only?
- What exact CRM import/export format is required?
- What retention period applies to ignored leads and rejected prospects?
