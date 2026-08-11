-- Canonical, versioned question bank for admin authoring.
-- Bank answers stay server-side; exam questions receive a content snapshot when attached.

create table if not exists public.question_banks (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 160),
  subject_code text not null default '',
  grade text not null default '',
  curriculum text not null default '',
  description text not null default '',
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.question_bank_nodes (
  id uuid primary key default gen_random_uuid(),
  bank_id uuid not null references public.question_banks(id) on delete cascade,
  parent_id uuid references public.question_bank_nodes(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 160),
  node_type text not null default 'topic' check (node_type in ('topic', 'unit')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (bank_id, parent_id, title)
);

create table if not exists public.question_bank_items (
  id uuid primary key default gen_random_uuid(),
  bank_id uuid not null references public.question_banks(id) on delete cascade,
  node_id uuid references public.question_bank_nodes(id) on delete set null,
  current_version integer not null default 1 check (current_version between 1 and 1000000),
  difficulty text check (difficulty is null or difficulty in ('NB', 'TH', 'VD', 'VDC')),
  tags text[] not null default '{}',
  status text not null default 'active' check (status in ('draft', 'active', 'archived')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.question_bank_item_versions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.question_bank_items(id) on delete cascade,
  version integer not null check (version between 1 and 1000000),
  prompt text not null check (length(trim(prompt)) between 1 and 50000),
  question_type text not null default 'single' check (question_type in ('single', 'multiple', 'text', 'inline', 'true_false', 'ordering', 'drag_drop')),
  options jsonb not null default '[]'::jsonb,
  correct_answer jsonb not null default 'null'::jsonb,
  explanation text not null default '',
  passage text,
  media_url text,
  instruction text,
  solution_source text not null default '',
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (item_id, version)
);

alter table if exists public.exam_questions
  add column if not exists source_item_id uuid references public.question_bank_items(id) on delete set null,
  add column if not exists source_item_version integer;

create index if not exists question_banks_updated_idx on public.question_banks(updated_at desc);
create index if not exists question_bank_nodes_bank_sort_idx on public.question_bank_nodes(bank_id, parent_id, sort_order);
create index if not exists question_bank_items_lookup_idx on public.question_bank_items(bank_id, status, difficulty, updated_at desc);
create index if not exists question_bank_items_node_idx on public.question_bank_items(node_id, status);
create index if not exists question_bank_item_versions_lookup_idx on public.question_bank_item_versions(item_id, version desc);
create index if not exists exam_questions_source_item_idx on public.exam_questions(source_item_id, source_item_version);

alter table public.question_banks enable row level security;
alter table public.question_bank_nodes enable row level security;
alter table public.question_bank_items enable row level security;
alter table public.question_bank_item_versions enable row level security;

drop policy if exists "admin question banks" on public.question_banks;
create policy "admin question banks" on public.question_banks
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists "admin question bank nodes" on public.question_bank_nodes;
create policy "admin question bank nodes" on public.question_bank_nodes
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists "admin question bank items" on public.question_bank_items;
create policy "admin question bank items" on public.question_bank_items
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists "admin question bank item versions" on public.question_bank_item_versions;
create policy "admin question bank item versions" on public.question_bank_item_versions
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

revoke all on table public.question_banks, public.question_bank_nodes,
  public.question_bank_items, public.question_bank_item_versions from public, anon, authenticated;
grant select, insert, update, delete on table public.question_banks, public.question_bank_nodes,
  public.question_bank_items, public.question_bank_item_versions to service_role;

notify pgrst, 'reload schema';

