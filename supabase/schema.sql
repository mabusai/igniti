create extension if not exists "pgcrypto";

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  model jsonb,
  fires jsonb not null default '[]'::jsonb,
  cameras jsonb not null default '[]'::jsonb
);

create index if not exists projects_created_at_desc_idx
  on public.projects (created_at desc);
