-- ============================================================
-- Playlist da Galera — migração v3 (transições: popularidade + similares)
-- Rode no SQL Editor do Supabase (RUN).
-- ============================================================

-- nº de ouvintes no Last.fm (pra marcar os "hinos")
alter table tracks add column if not exists listeners bigint;

-- artistas similares (Last.fm), separados por ; — pra suavizar transições
-- ("similar" é palavra reservada no Postgres → precisa das aspas)
alter table tracks add column if not exists "similar" text;
