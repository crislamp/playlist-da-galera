// ------------------------------------------------------------------
// Supabase — guarda os rolês e as músicas de cada participante,
// pra juntar o gosto de todo mundo mesmo em celulares diferentes.
// ------------------------------------------------------------------
import { createClient } from "@supabase/supabase-js";

// remove caracteres invisíveis/estranhos que podem grudar ao colar a chave
// (espaço zero-width, aspa curva, etc.) — senão o header quebra na nuvem.
const clean = (v) => (v || "").replace(/[^\x21-\x7E]/g, "");

const url = clean(import.meta.env.VITE_SUPABASE_URL);
const key = clean(import.meta.env.VITE_SUPABASE_ANON_KEY);

// trata os valores de exemplo do .env.example como "não configurado"
const isPlaceholder = (v) => !v || /cole_aqui|xxxxxxxx/i.test(v);
export const supabaseReady = !isPlaceholder(url) && !isPlaceholder(key);
export const supabase = supabaseReady ? createClient(url, key) : null;

// código curto e legível pro rolê (ex.: "K7QP")
function shortCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem 0/O/1/I
  let s = "";
  for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export async function createRole(name, destination = "spotify") {
  const code = shortCode();
  const { data, error } = await supabase
    .from("roles")
    .insert({ code, name, destination })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getRole(code) {
  const { data, error } = await supabase
    .from("roles")
    .select("*")
    .eq("code", code.toUpperCase())
    .maybeSingle();
  if (error) throw error;
  return data;
}

// entra no rolê pelo NOME (a galera não loga; reusa se o nome já existir)
export async function joinRole(roleId, displayName) {
  const { data: existing } = await supabase
    .from("participants")
    .select("*")
    .eq("role_id", roleId)
    .eq("display_name", displayName)
    .maybeSingle();
  if (existing) return existing;
  const { data, error } = await supabase
    .from("participants")
    .insert({ role_id: roleId, display_name: displayName })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// adiciona gênero/vibe às faixas via Last.fm (Edge Function).
// o slug real da função vem do .env (o Supabase gera um nome aleatório).
const RESOLVE_FN = clean(import.meta.env.VITE_RESOLVE_FN) || "resolve-spotify-playlist";
const firstArtist = (t) => (t.artist || "").split(",")[0].trim();

// busca música no Spotify SEM login (via Edge Function, client-credentials)
export async function searchSpotify(query, limit = 10) {
  if (!query || !query.trim()) return [];
  try {
    const { data, error } = await supabase.functions.invoke(RESOLVE_FN, { body: { search: query.trim(), limit } });
    if (error || !data?.tracks) return [];
    return data.tracks;
  } catch {
    return [];
  }
}

// importa uma playlist PÚBLICA do YouTube SEM login (via API key no servidor)
export async function importYtPlaylist(url) {
  const { data, error } = await supabase.functions.invoke(RESOLVE_FN, { body: { ytplaylist: url } });
  if (error) throw new Error("Não consegui ler essa playlist do YouTube.");
  if (data?.error) throw new Error(data.error);
  const tracks = data?.tracks || [];
  // já cacheia os videoIds (uri -> videoId) pro player tocar na hora
  const map = {};
  tracks.forEach((t) => { if (t.video_id) map[t.uri] = t.video_id; });
  saveYtCache(map).catch(() => {});
  return tracks;
}

export async function enrichTags(tracks) {
  if (!tracks.length) return tracks;
  const payload = tracks.map((t) => ({ artist: t.artist, title: t.title }));
  try {
    const { data, error } = await supabase.functions.invoke(RESOLVE_FN, { body: { tracks: payload } });
    if (error || !data) return tracks; // se falhar, segue sem vibe
    const tt = data.trackTags || {};
    const ai = data.artistInfo || {};
    return tracks.map((t) => {
      const fa = firstArtist(t).toLowerCase();
      const title = String(t.title || "").trim().toLowerCase();
      const info = ai[fa] || {};
      const trackGenre = tt[`${fa}|${title}`];
      return {
        ...t,
        // vibe da MÚSICA na frente; cai pro gênero do artista se a faixa não tiver tag
        genre: (trackGenre && trackGenre.length ? trackGenre : info.genre) || t.genre || "",
        listeners: info.listeners || null,
        similar: (info.similar || []).join(";"),
      };
    });
  } catch {
    return tracks;
  }
}

// insere faixas SEM apagar as que já existem (usado por sugestões)
export async function addTracks(roleId, participantId, tracks) {
  if (!tracks.length) return;
  const rows = tracks.map((t) => ({
    role_id: roleId,
    participant_id: participantId,
    uri: t.uri,
    title: t.title,
    artist: t.artist,
    art: t.art,
    genre: t.genre || null,
    listeners: t.listeners || null,
    similar: t.similar || null,
    source: t.source || "spotify",
  }));
  const { error } = await supabase.from("tracks").insert(rows);
  if (error) throw error;
}

// substitui as faixas daquele participante (idempotente ao re-enviar)
export async function saveTracks(roleId, participantId, tracks) {
  await supabase.from("tracks").delete().eq("participant_id", participantId);
  await addTracks(roleId, participantId, tracks);
}

export async function loadRoleData(roleId) {
  const [{ data: participants }, { data: tracks }] = await Promise.all([
    supabase.from("participants").select("*").eq("role_id", roleId),
    supabase.from("tracks").select("*").eq("role_id", roleId),
  ]);
  return { participants: participants || [], tracks: tracks || [] };
}

// cache do YouTube: uri do Spotify -> videoId (pra não gastar cota buscando de novo)
export async function getYtCache(uris) {
  if (!uris || !uris.length) return {};
  const map = {};
  try {
    // busca em lotes (o filtro "in" tem limite de tamanho de URL)
    for (let i = 0; i < uris.length; i += 200) {
      const batch = uris.slice(i, i + 200);
      const { data } = await supabase.from("yt_cache").select("uri,video_id").in("uri", batch);
      (data || []).forEach((r) => { if (r.video_id) map[r.uri] = r.video_id; });
    }
  } catch { /* tabela ainda não existe — segue sem cache */ }
  return map;
}

export async function saveYtCache(map) {
  const rows = Object.entries(map || {}).map(([uri, video_id]) => ({ uri, video_id }));
  if (!rows.length) return;
  try { await supabase.from("yt_cache").upsert(rows, { onConflict: "uri" }); } catch { /* sem cache */ }
}

// resolve o videoId do YouTube de cada faixa (cache primeiro; busca só o que falta).
// SEM login (busca via API key no servidor). Retorna as faixas com { videoId }.
export async function getVideoIds(tracks) {
  if (!tracks || !tracks.length) return [];
  const cache = await getYtCache(tracks.map((t) => t.uri));
  const misses = tracks.filter((t) => !cache[t.uri]);
  if (misses.length) {
    try {
      const { data } = await supabase.functions.invoke(RESOLVE_FN, {
        body: { ytsearch: misses.map((t) => ({ uri: t.uri, q: `${t.title} ${t.artist}` })) },
      });
      const found = data?.ids || {};
      Object.assign(cache, found);
      saveYtCache(found).catch(() => {});
    } catch { /* segue com o que tiver no cache */ }
  }
  return tracks.map((t) => ({ ...t, videoId: cache[t.uri] || null }));
}
