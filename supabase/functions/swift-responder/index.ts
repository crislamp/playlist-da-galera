// ------------------------------------------------------------------
// Edge Function (4 modos):
//  A) { search: "texto" } -> busca no Spotify via CLIENT CREDENTIALS
//     (não conta como "usuário" -> a galera contribui SEM login, sem teto de 5)
//  B) { tracks: [{artist,title}] } -> enriquece com Last.fm
//     (tags de vibe da faixa + ouvintes + similares do artista)
//  C) { ytsearch: [{uri,q}] } -> resolve videoIds pro player via SCRAPE da página
//     pública do YouTube (sem cota); cai pra API oficial só se o scrape falhar
//  D) { ytplaylist: "url" } -> importa playlist pública do YouTube (sem login)
//  E) { spotifycreate: {name,description,tracks} } -> cria playlist no Spotify numa
//     conta de serviço (refresh token) -> qualquer um exporta sem login nem teto de contas
//
// Secrets: SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, LASTFM_API_KEY, YT_API_KEY,
//          SPOTIFY_REFRESH_TOKEN (da conta que hospeda as playlists)
// Slug publicado no Supabase: "swift-responder".
// ------------------------------------------------------------------

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const LFM = "https://ws.audioscrobbler.com/2.0/";
// o YouTube sinaliza cota estourada com 403 OU 429 (e reason/quota no corpo)
const isQuota = (status: number, body: string) =>
  (status === 403 || status === 429) && /quota|ratelimit|resource_exhausted/i.test(body);
const asArray = (x: any) => (Array.isArray(x) ? x : x ? [x] : []);
const firstArtist = (s: any) => String(s || "").split(",")[0].trim();
const json = (obj: any, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, "Content-Type": "application/json" } });

function ytPlaylistId(input: string) {
  const s = String(input || "").trim();
  const m = s.match(/[?&]list=([A-Za-z0-9_-]+)/) || (/^[A-Za-z0-9_-]{12,}$/.test(s) ? [null, s] : null);
  return m ? m[1] : null;
}
// tenta separar "Artista - Música (Official Video)" em {artist, title}
function parseYtTitle(raw: string, channel: string) {
  let s = String(raw || "").replace(/\([^)]*\)|\[[^\]]*\]/g, "")
    .replace(/official (music )?video|lyric video|clipe oficial|videoclipe|audio|áudio/gi, "").trim();
  const parts = s.split(/\s[-–—]\s/);
  if (parts.length >= 2) return { artist: parts[0].trim(), title: parts.slice(1).join(" - ").trim() };
  return { artist: String(channel || "").replace(/\s*-\s*Topic$/i, "").trim(), title: s };
}

// resolve o videoId lendo a PÁGINA PÚBLICA de resultados do YouTube (sem API, sem cota).
// pega o 1º vídeo do resultado — que é o topo da busca (normalmente o clipe oficial).
async function scrapeVideoId(q: string): Promise<string | null> {
  try {
    const r = await fetch(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&hl=en&gl=US`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
          "Cookie": "CONSENT=YES+cb", // evita o muro de consentimento (UE)
        },
      }
    );
    if (!r.ok) return null;
    const html = await r.text();
    const m = html.match(/"videoId":"([A-Za-z0-9_-]{11})"/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

// reserva: busca 1 vídeo via API oficial (gasta cota — só quando o scrape falha)
async function apiVideoId(q: string, ytkey: string): Promise<{ id: string | null; quota: boolean }> {
  const r = await fetch(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=1&q=${encodeURIComponent(q)}&key=${ytkey}`
  );
  if (!r.ok) return { id: null, quota: isQuota(r.status, await r.text()) };
  const j = await r.json();
  return { id: j.items?.[0]?.id?.videoId || null, quota: false };
}

async function pool(items: any[], limit: number, fn: (x: any) => Promise<void>) {
  let i = 0;
  await Promise.all(Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (i < items.length) { const idx = i++; await fn(items[idx]); }
  }));
}

// token client-credentials do Spotify (app, sem usuário)
async function spotifyToken() {
  const id = Deno.env.get("SPOTIFY_CLIENT_ID");
  const secret = Deno.env.get("SPOTIFY_CLIENT_SECRET");
  if (!id || !secret) throw new Error("Faltam SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET nos secrets.");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: "Basic " + btoa(`${id}:${secret}`) },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error("Falha no token do Spotify: " + (await res.text()));
  return (await res.json()).access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = await req.json();

    // ---------- MODO A: busca no Spotify (sem login) ----------
    if (typeof body.search === "string") {
      const q = body.search.trim();
      if (!q) return json({ tracks: [] });
      const token = await spotifyToken();
      const r = await fetch(
        `https://api.spotify.com/v1/search?type=track&limit=10&market=BR&q=${encodeURIComponent(q)}`,
        { headers: { Authorization: "Bearer " + token } }
      );
      if (!r.ok) throw new Error("Spotify " + r.status + ": " + (await r.text()));
      const j = await r.json();
      const tracks = (j.tracks?.items || []).map((t: any) => ({
        uri: t.uri,
        spotify_id: t.id,
        title: t.name,
        artist: (t.artists || []).map((a: any) => a.name).join(", "),
        art: t.album?.images?.slice(-1)[0]?.url || null,
        genre: "",
      }));
      return json({ tracks });
    }

    // ---------- MODO C: resolve videoIds do YouTube (pro player, sem login) ----------
    // Estratégia: SCRAPE da página pública (sem cota, ilimitado). Se falhar numa
    // faixa, cai pra API oficial (só aí gasta a cota de 100/dia).
    if (Array.isArray(body.ytsearch)) {
      const ytkey = Deno.env.get("YT_API_KEY"); // opcional (só reserva)
      const ids: Record<string, string> = {};
      let quota = false;
      await pool(body.ytsearch, 6, async (item: any) => {
        let vid = await scrapeVideoId(item.q);
        if (!vid && ytkey && !quota) {
          const res = await apiVideoId(item.q, ytkey);
          if (res.quota) quota = true;
          vid = res.id;
        }
        if (vid) ids[item.uri] = vid;
      });
      // quota só marca true se o scrape falhou E a API bateu no teto (raro agora)
      return json({ ids, quota });
    }

    // ---------- MODO D: importar playlist do YouTube (sem login) ----------
    if (typeof body.ytplaylist === "string") {
      const ytkey = Deno.env.get("YT_API_KEY");
      if (!ytkey) throw new Error("Falta YT_API_KEY nos secrets.");
      const pid = ytPlaylistId(body.ytplaylist);
      if (!pid) throw new Error("Link de playlist do YouTube inválido.");
      const tracks: any[] = [];
      let pageToken = "";
      for (let page = 0; page < 4; page++) {
        const u = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${pid}&key=${ytkey}${pageToken ? `&pageToken=${pageToken}` : ""}`;
        const r = await fetch(u);
        if (!r.ok) {
          const b = await r.text();
          if (isQuota(r.status, b)) throw new Error("quota");
          throw new Error("YouTube " + r.status + ": " + b);
        }
        const j = await r.json();
        for (const it of j.items || []) {
          const sn = it.snippet;
          const vid = sn?.resourceId?.videoId;
          if (!vid || sn.title === "Private video" || sn.title === "Deleted video") continue;
          const parsed = parseYtTitle(sn.title, sn.videoOwnerChannelTitle);
          tracks.push({
            uri: `yt:${vid}`, video_id: vid,
            title: parsed.title, artist: parsed.artist,
            art: sn.thumbnails?.default?.url || null, genre: "",
          });
        }
        pageToken = j.nextPageToken;
        if (!pageToken) break;
      }
      return json({ tracks });
    }

    // ---------- MODO E: criar playlist no Spotify (conta de serviço, sem login) ----------
    // usa um refresh_token de UMA conta pré-autorizada -> qualquer pessoa cria sem logar
    // e sem o teto de contas do modo dev. Resolve no Spotify até faixas vindas do YouTube.
    if (body.spotifycreate) {
      const { name, description = "", tracks = [] } = body.spotifycreate;
      const refresh = Deno.env.get("SPOTIFY_REFRESH_TOKEN");
      const clientId = Deno.env.get("SPOTIFY_CLIENT_ID");
      if (!refresh) throw new Error("Falta SPOTIFY_REFRESH_TOKEN nos secrets (autorize a conta uma vez).");
      if (!clientId) throw new Error("Falta SPOTIFY_CLIENT_ID nos secrets.");

      // token de USUÁRIO da conta de serviço (refresh via PKCE: só client_id)
      const tr = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh, client_id: clientId }),
      });
      if (!tr.ok) throw new Error("Falha ao renovar o Spotify da conta de serviço: " + (await tr.text()));
      const userToken = (await tr.json()).access_token;
      const sapi = (path: string, opts: any = {}) =>
        fetch("https://api.spotify.com/v1" + path, {
          ...opts,
          headers: { Authorization: "Bearer " + userToken, "Content-Type": "application/json", ...(opts.headers || {}) },
        });

      // resolve URIs: as nativas do Spotify vão direto; as de YouTube/etc via busca (app token)
      const appToken = await spotifyToken();
      const uris: string[] = [];
      const seen = new Set<string>();
      for (const t of tracks) {
        let uri: string | null =
          typeof t.uri === "string" && t.uri.startsWith("spotify:") ? t.uri : null;
        if (!uri && t.title) {
          const q = `${t.title} ${t.artist || ""}`.trim();
          const sr = await fetch(
            `https://api.spotify.com/v1/search?type=track&limit=1&market=BR&q=${encodeURIComponent(q)}`,
            { headers: { Authorization: "Bearer " + appToken } }
          );
          if (sr.ok) uri = (await sr.json())?.tracks?.items?.[0]?.uri || null;
        }
        if (uri && !seen.has(uri)) { seen.add(uri); uris.push(uri); }
      }
      if (!uris.length) return json({ error: "no-tracks" }, 400);

      const cr = await sapi("/me/playlists", {
        method: "POST",
        body: JSON.stringify({ name, description, public: true }),
      });
      if (!cr.ok) throw new Error("Spotify (criar): " + (await cr.text()));
      const pl = await cr.json();
      for (let i = 0; i < uris.length; i += 100) {
        const ar = await sapi(`/playlists/${pl.id}/items`, {
          method: "POST",
          body: JSON.stringify({ uris: uris.slice(i, i + 100) }),
        });
        if (!ar.ok) throw new Error("Spotify (adicionar): " + (await ar.text()));
      }
      return json({ url: pl.external_urls?.spotify || `https://open.spotify.com/playlist/${pl.id}`, count: uris.length });
    }

    // ---------- MODO B: enriquecer com Last.fm ----------
    const key = Deno.env.get("LASTFM_API_KEY");
    if (!key) throw new Error("Falta LASTFM_API_KEY nos secrets.");
    const trackList = asArray(body.tracks).filter((t: any) => t && t.artist && t.title);
    const artistSet = new Set<string>();
    trackList.forEach((t: any) => { const a = firstArtist(t.artist); if (a) artistSet.add(a); });

    const trackTags: Record<string, string> = {};
    const artistInfo: Record<string, any> = {};
    const tasks = [
      ...trackList.map((t: any) => ({ kind: "track", t })),
      ...[...artistSet].map((name) => ({ kind: "artist", name })),
    ];

    await pool(tasks, 8, async (task: any) => {
      try {
        if (task.kind === "track") {
          const artist = firstArtist(task.t.artist);
          const title = String(task.t.title || "").trim();
          const u = `${LFM}?method=track.getTopTags&artist=${encodeURIComponent(artist)}&track=${encodeURIComponent(title)}&api_key=${key}&format=json&autocorrect=1`;
          const j = await (await fetch(u)).json();
          trackTags[`${artist.toLowerCase()}|${title.toLowerCase()}`] =
            asArray(j?.toptags?.tag).slice(0, 6).map((x: any) => x.name).join(";");
        } else {
          const u = `${LFM}?method=artist.getInfo&artist=${encodeURIComponent(task.name)}&api_key=${key}&format=json&autocorrect=1`;
          const a = (await (await fetch(u)).json())?.artist;
          if (!a) return;
          artistInfo[task.name.toLowerCase()] = {
            genre: asArray(a.tags?.tag).slice(0, 6).map((x: any) => x.name).join(";"),
            listeners: Number(a.stats?.listeners || 0),
            similar: asArray(a.similar?.artist).map((s: any) => String(s.name || "").toLowerCase()).filter(Boolean),
          };
        }
      } catch { /* ignora falha pontual */ }
    });

    return json({ trackTags, artistInfo });
  } catch (e) {
    return json({ error: String(e.message || e) }, 400);
  }
});
