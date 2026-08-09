Approved commercial brand review files

164 brands reviewed
38 explicitly kept
126 excluded as whole brands

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

2026-08-09 addition (owner commercial decision, Monday field-sales 287-lead pre-routing chain/
group review — Nauman/Manraj/Ayesha/Alam, campaigns 013-016): owner reviewed a chain/group audit
of all 287 released field-sales leads and made explicit brand-level KEEP/EXCLUDE calls, overriding
any assumption that chain size alone determines outcome. Added to the exclude list: Chipotle
Mexican Grill, Franco Manca, Best One, Spar, All Bar One, Costcutter, Waitrose, Co-op / Southern
Co-operative, Day's Stores. Added to the keep list: Slim Chickens, Dixy Chicken, Whale Tea /
WHALETEA, Tasty African Food, Aksular, Sankalp, Little Kathmandu Kitchen, Ambala Karahi, Chicken
Hut, M. Manze. Sambal Express changed from Exclude Whole Brand to Keep (explicit owner override of
the prior decision). Londis, Creams, Kebabish, Morley's, and Sam's Chicken were reviewed and their
existing decisions reconfirmed unchanged. Full per-brand provenance (decision source, date,
reason, previous decision where changed) recorded in owner-decision-log.json. See
docs/09_DECISIONS.md (2026-08-09 entry).

Files:
- corrected_brand_decisions.csv
- brands_to_exclude_final.csv
- brands_to_keep_final.csv
- brand-aliases-and-identifiers-v1.json
- owner-decision-log.json
