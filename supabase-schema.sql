-- ============================================================
-- Playlist da Galera — schema do Supabase
-- Cole isto no SQL Editor do Supabase e rode (RUN).
-- ============================================================

create table if not exists roles (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  created_at timestamptz default now()
);

create table if not exists participants (
  id uuid primary key default gen_random_uuid(),
  role_id uuid references roles(id) on delete cascade,
  display_name text not null,
  spotify_id text not null,
  created_at timestamptz default now(),
  unique (role_id, spotify_id)
);

create table if not exists tracks (
  id uuid primary key default gen_random_uuid(),
  role_id uuid references roles(id) on delete cascade,
  participant_id uuid references participants(id) on delete cascade,
  uri text not null,
  title text,
  artist text,
  art text,
  source text default 'top',
  added_at timestamptz default now()
);

create index if not exists idx_tracks_role on tracks(role_id);
create index if not exists idx_participants_role on participants(role_id);

-- ------------------------------------------------------------
-- RLS: grupo fechado (você + amigos). Políticas permissivas pra
-- a anon key ler/escrever. NÃO use assim pra app público —
-- aí precisaria de auth de verdade por linha.
-- ------------------------------------------------------------
alter table roles enable row level security;
alter table participants enable row level security;
alter table tracks enable row level security;

create policy "anon full roles"        on roles        for all using (true) with check (true);
create policy "anon full participants" on participants for all using (true) with check (true);
create policy "anon full tracks"       on tracks       for all using (true) with check (true);

-- ------------------------------------------------------------
-- GRANTs: tabelas criadas por SQL cru não recebem privilégios
-- automáticos pro papel "anon". Sem isso dá "permission denied".
-- ------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated;
