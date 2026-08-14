-- Server-only Microsoft Graph delegated OAuth connection.
-- OAuth tokens are encrypted by the application before they reach Postgres.
-- This table intentionally has no anon/authenticated policies or privileges.
begin;

create table public.microsoft_graph_connections (
  id smallint primary key default 1 check (id = 1),
  tenant_id text not null,
  provider_account_id text not null,
  provider_principal text,
  access_token_ciphertext text not null,
  refresh_token_ciphertext text not null,
  access_token_expires_at timestamptz not null,
  scope text not null default '',
  connected_by uuid,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.microsoft_graph_connections is
  'Server-only encrypted delegated Microsoft Graph connection. Never expose through the browser Data API.';
comment on column public.microsoft_graph_connections.access_token_ciphertext is
  'AES-GCM ciphertext produced by the application; never store a plaintext access token.';
comment on column public.microsoft_graph_connections.refresh_token_ciphertext is
  'AES-GCM ciphertext produced by the application; never store a plaintext refresh token.';

alter table public.microsoft_graph_connections enable row level security;
alter table public.microsoft_graph_connections force row level security;

revoke all on table public.microsoft_graph_connections from public, anon, authenticated;
grant select, insert, update, delete on table public.microsoft_graph_connections to service_role;

do $$
declare
  rls_enabled boolean;
  rls_forced boolean;
begin
  select relation.relrowsecurity, relation.relforcerowsecurity
    into rls_enabled, rls_forced
  from pg_catalog.pg_class relation
  join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relname = 'microsoft_graph_connections';

  if not coalesce(rls_enabled, false) or not coalesce(rls_forced, false) then
    raise exception 'Microsoft Graph connection table must force RLS';
  end if;
  if pg_catalog.has_table_privilege('anon', 'public.microsoft_graph_connections', 'select')
     or pg_catalog.has_table_privilege('authenticated', 'public.microsoft_graph_connections', 'select')
     or exists (
       select 1 from pg_catalog.pg_policies
       where schemaname = 'public' and tablename = 'microsoft_graph_connections'
     ) then
    raise exception 'Microsoft Graph connection table is exposed to browser roles';
  end if;
end
$$;

notify pgrst, 'reload schema';

commit;
