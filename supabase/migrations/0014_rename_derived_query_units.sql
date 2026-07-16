-- 0014 — Geography Standard v1.0: rename discovery_runs.derived_outcodes → derived_query_units
--
-- "outcode" is replaced by the canonical "Postcode District" everywhere user-facing; the
-- run column that stored the planned query codes is renamed to the geography-neutral
-- `derived_query_units` (query units can be districts or sectors depending on the source).
-- Pure rename — no data change.

alter table discovery_runs rename column derived_outcodes to derived_query_units;
