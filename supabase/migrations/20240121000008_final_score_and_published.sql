alter table articles add column if not exists final_score float8;
alter table articles add column if not exists is_published boolean default false;

alter table clusters add column if not exists final_score float8;
alter table clusters add column if not exists is_published boolean default false;
alter table clusters add column if not exists last_processed_at timestamptz;
