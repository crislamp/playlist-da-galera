-- ============================================================
-- Playlist da Galera — migração v5 (cache de busca do YouTube)
-- Guarda o videoId de cada música pra não gastar cota buscando de novo.
-- Rode no SQL Editor do Supabase (RUN).
-- ============================================================

create table if not exists yt_cache (
  uri text primary key,          -- spotify:track:...
  video_id text,                 -- id do vídeo no YouTube
  updated_at timestamptz default now()
);

alter table yt_cache enable row level security;
create policy "anon full yt_cache" on yt_cache for all using (true) with check (true);
grant select, insert, update, delete on yt_cache to anon, authenticated;
