-- Table for Daily Digests
create table if not exists digests (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    content_json jsonb not null, -- Stores the structured digest
    published_at timestamptz default now(),
    created_at timestamptz default now()
);
