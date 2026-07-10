# Project Context — Magna Lead Intelligence System

## Business reason

Magna Foodservice has never had a structured outbound acquisition channel. Customer acquisition has historically come from inbound enquiries, personal recommendations, returning staff contacts, door-to-door sales, manual Google Maps dialling, and blunt WhatsApp broadcasts.

The uploaded business case states that Magna is losing 64.9% of organic independent customers, with a median customer lifespan of 80 days. This means the project is not just lead generation; it is acquisition plus retention visibility. A lead pipeline without retention improvement is just a faster way to leak customers. Very modern, very tragic.

## Core objective

Build a repeatable, automated, auditable lead intelligence pipeline that:

- discovers foodservice prospects by postcode,
- verifies legitimacy via FSA registration,
- deduplicates against Magna customers,
- enriches contacts and company data,
- scores leads using Magna-specific customer evidence,
- exports reviewed leads to Magna Sales Pro,
- logs ignored/rejected records for management intelligence,
- improves quarterly from real conversion feedback.

## Target customer profile

Independent foodservice operators, mainly:

- Fried Chicken Shops
- Piri Piri Shops
- Fast Casual Restaurants
- Burger Restaurants

Core territories:

- UB
- W
- HA
- TW
- SW
- SL

The ICP threshold is £597+ weekly spend, 2+ orders per week, and a named/mobile-contactable decision-maker.

## Important business warning

The uploaded material is clear: the pipeline alone will not fix the business. Retention must be addressed in parallel through onboarding, churn diagnosis, switching incentives, and investigation of sales attribution anomalies.

## Source material loaded into this starter

- `Magna_Vol1_Business_Case.docx`
- `Magna_Vol2_Technical_Architecture.docx`
- `Magna_Vol3_Process_Operations.docx`
- `Magna_Vol4_Security_Scale_Governance.docx`
- `Magna_Lead_Field_Schema_v4.xlsx`
- `Magna_Lead_Intelligence_Presentation.pptx`

## Assumptions

- Magna Sales Pro remains the CRM.
- NetSuite remains the source of truth for existing customer master data.
- Supabase stores internal lead records, run telemetry, ignored leads, and audit data.
- CRM upload stays manual in MVP.
- UAT and production databases must be separate.
