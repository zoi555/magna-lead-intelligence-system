-- DRAFT ONLY
-- Not applied to any database.
-- Do not run until reviewed and approved.
--
-- 02_enums.sql — MVP enums (Rev 3 §1).
-- Depends on: 01_extensions.sql.
--
-- ENUM RIGIDITY NOTE: enum VALUES can be added later (ALTER TYPE ... ADD VALUE), but they
-- cannot be removed or reordered without a type rewrite. Only defined, stable value sets are
-- modelled as enums below. Intentionally NOT enums (kept as text + CHECK, for flexibility):
--   uploaded_files.kind, road_display_configs.mode, integration_status.status, audit_logs.actor_kind.

create type user_role            as enum ('owner','admin','management','telesales','developer');
create type territory_item_type  as enum ('outer_code','inner_sector','pasted_list','delivery_boundary_upload','expansion_list');
create type run_type             as enum ('weekly','manual_test','trigger_sweep');
create type run_status           as enum ('queued','running','complete','failed','blocked','archived');
create type ignored_reason       as enum ('ACTIVE_MATCH','DISSOLVED','OUT_OF_AREA','NOT_FOOD','LOW_SCORE','NO_FSA','OTHER');
create type priority_tier        as enum ('A','B','Low','Ignore');
create type lead_status          as enum ('new','contacted','converted','dead');
create type export_status        as enum ('draft','approved','exported','archived');
create type suppression_match    as enum ('brand','phone','postcode');
create type suppression_status   as enum ('active','withdrawn');
create type membership_type      as enum ('in_area','expansion');
create type pc_granularity       as enum ('area','district','sector','unit');
create type worked_status        as enum ('open','in_progress','contacted','no_answer','converted','dead');
create type trigger_urgency      as enum ('high','medium','low');
create type verify_state         as enum ('unverified','fsa_only','fsa_ch','rejected');
create type import_status        as enum ('pending','parsing','parsed','failed');
create type file_status          as enum ('uploaded','processing','processed','failed');
create type reactivation_status  as enum ('to_contact','contacted','reactivated','dead');
