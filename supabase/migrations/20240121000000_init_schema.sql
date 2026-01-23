-- Enable pgvector
create extension if not exists vector;

-- Articles table
create table if not exists articles (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    content text,
    summary_short text,
    source_url text unique not null,
    source_name text,
    published_at timestamptz default now(),
    author text,
    category text,
    embedding vector(1536), -- Default for OpenAI or similar
    metadata jsonb default '{}'::jsonb,
    created_at timestamptz default now()
);

-- Clusters table (to group articles)
create table if not exists clusters (
    id uuid primary key default gen_random_uuid(),
    label text, -- AI generated title
    representative_article_id uuid references articles(id),
    created_at timestamptz default now()
);

-- Link articles to clusters
alter table articles add column if not exists cluster_id uuid references clusters(id);

-- Summaries table (Synthesized content for a cluster)
create table if not exists summaries (
    id uuid primary key default gen_random_uuid(),
    cluster_id uuid references clusters(id) unique,
    content_tldr text, -- Level 1
    content_analysis text, -- Level 2
    model_name text,
    created_at timestamptz default now()
);

-- RSS Sources table
create table if not exists sources (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    url text unique not null,
    category text,
    is_active boolean default true,
    last_fetched_at timestamptz,
    created_at timestamptz default now()
);

-- Initial seed sources
insert into sources (name, url, category) values
('TechCrunch', 'https://techcrunch.com/feed/', 'Tech News'),
('Hacker News', 'https://news.ycombinator.com/rss', 'Dev'),
('The Verge', 'https://www.theverge.com/rss/index.xml', 'Tech News');
