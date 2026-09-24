-- ============================================================
-- Playlist da Galera — migração v2 (modelo "importar playlist")
-- Rode no SQL Editor do Supabase (RUN).
-- Muda: participante agora é por NOME (a galera não loga mais),
-- e o rolê guarda o DESTINO (spotify / youtube).
-- ============================================================

-- rolê guarda onde a playlist final vai ser criada
alter table roles add column if not exists destination text default 'spotify';

-- gênero da faixa (pra dar fluidez nas transições do set)
alter table tracks add column if not exists genre text;

-- participante deixa de depender de login do Spotify
alter table participants alter column spotify_id drop not null;
alter table participants drop constraint if exists participants_role_id_spotify_id_key;

-- identifica participante pelo nome dentro do rolê
alter table participants
  add constraint participants_role_display_key unique (role_id, display_name);

-- garante que a anon key continua com acesso (idempotente)
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
