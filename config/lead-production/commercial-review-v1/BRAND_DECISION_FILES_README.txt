Approved commercial brand review files

145 brands reviewed
27 explicitly kept
118 excluded as whole brands

2026-08-02 addition (locked policy — union with the permanent AspectLead app's chain-registry.ts
list, plus a real leaked candidate): Boots, Burger King, Greene King added to the exclude list.
See brand-aliases-and-identifiers-v1.json for known aliases/company identifiers layered on top of
this list (e.g. Nisa Local -> Nisa Express; Greene King -> company number 00024694) without
altering the core Brand Name lists above.

2026-08-04 addition (owner correction, campaign-002 five-district-pilot review): Haute Dolci
added to the exclude list — a real UK dessert/waffle franchise chain (IG1-5B80F9CF, "Haute
Dolci® - Ilford") that reached "Operationally Usable Leads" because it was not yet on this
registry.

2026-08-04 addition (owner correction, campaign-002 five-district-pilot review): Black Sheep
Coffee added to the exclude list — a real UK coffee-shop chain (BR1-A2706B17, "Black Sheep
Coffee - Bromley"). "Chaiiwala" was already present on this list but was not matching real
branch names like "Chaiiwala® - Ilford Lane" (IG1-34DC85F9) due to a separate, real matching
defect (a "®" trademark symbol directly after the brand word breaking the raw-string
separator-pattern regexes in commercial-review-filter.ts) — fixed in that file, not this
registry; see docs/10_BUGS_AND_FIXES.md.

Files:
- corrected_brand_decisions.csv
- brands_to_exclude_final.csv
- brands_to_keep_final.csv
- brand-aliases-and-identifiers-v1.json
