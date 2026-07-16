-- 0010 — ON DELETE SET NULL for observation references
--
-- je_outlets / je_rating_history / je_field_provenance point at a raw observation, and an
-- observation can point at the earlier duplicate it matched. These FKs were NO ACTION, so
-- deleting a run's observations (run cascade) OR pruning old observations for retention was
-- blocked whenever a tenant-scoped outlet still referenced them.
--
-- Correct semantics: outlets/history/provenance are tenant assets that OUTLIVE any single
-- observation. Deleting/pruning an observation should NULL the pointer, not block or destroy
-- the record. (Outlets are intentionally NOT run-scoped — they can be observed by many runs.)

alter table je_outlets
  drop constraint je_outlets_latest_observation_id_fkey,
  add  constraint je_outlets_latest_observation_id_fkey
    foreign key (latest_observation_id) references je_raw_observations(id) on delete set null;

alter table je_rating_history
  drop constraint je_rating_history_raw_observation_id_fkey,
  add  constraint je_rating_history_raw_observation_id_fkey
    foreign key (raw_observation_id) references je_raw_observations(id) on delete set null;

alter table je_field_provenance
  drop constraint je_field_provenance_raw_observation_id_fkey,
  add  constraint je_field_provenance_raw_observation_id_fkey
    foreign key (raw_observation_id) references je_raw_observations(id) on delete set null;

alter table je_raw_observations
  drop constraint je_raw_observations_duplicate_of_fkey,
  add  constraint je_raw_observations_duplicate_of_fkey
    foreign key (duplicate_of) references je_raw_observations(id) on delete set null;
