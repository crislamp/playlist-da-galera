// ------------------------------------------------------------------
// Edge Function (2 modos):
//  A) { search: "texto" } -> busca no Spotify via CLIENT CREDENTIALS
//     (não conta como "usuário" -> a galera contribui SEM login, sem teto de 5)
//  B) { tracks: [{artist,title}] } -> enriquece com Last.fm
//     (tags de vibe da faixa + ouvintes + similares do artista)
//
// Secrets: SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, LASTFM_API_KEY
// Slug publicado no Supabase: "swift-responder".
// ------------------------------------------------------------------

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const LFM = "https://ws.audioscrobbler.com/2.0/";
const asArray = (x: any) => (Array.isArray(x) ? x : x ? [x] : []);
const firstArtist = (s: any) => String(s || "").split(",")[0].trim();
const json = (obj: any, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, "Content-Type": "application/json" } });

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
        `https://api.spotify.com/v1/search?type=track&limit=12&market=BR&q=${encodeURIComponent(q)}`,
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
