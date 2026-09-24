// ------------------------------------------------------------------
// Edge Function (Last.fm): enriquece as faixas pra dar fluidez ao set.
//  - track.getTopTags  → tags da MÚSICA (vibe precisa: "sad", "chill"...)
//  - artist.getInfo    → ouvintes (hino) + similares (transição) + tags fallback
// Recebe { tracks:[{artist,title}] } e devolve:
//   { trackTags: { "artista|titulo": "tag;tag" },
//     artistInfo: { artista: { genre, listeners, similar:[...] } } }
//
// Secret: LASTFM_API_KEY   |   Slug no Supabase: "swift-responder"
// ------------------------------------------------------------------

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LFM = "https://ws.audioscrobbler.com/2.0/";
const asArray = (x: any) => (Array.isArray(x) ? x : x ? [x] : []);
const firstArtist = (s: any) => String(s || "").split(",")[0].trim();

// roda as tarefas com concorrência limitada (não estoura o limite do Last.fm)
async function pool<T>(items: T[], limit: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  const workers = Array(Math.min(limit, items.length))
    .fill(0)
    .map(async () => {
      while (i < items.length) {
        const idx = i++;
        await fn(items[idx]);
      }
    });
  await Promise.all(workers);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const { tracks } = await req.json();
    const key = Deno.env.get("LASTFM_API_KEY");
    if (!key) throw new Error("Falta LASTFM_API_KEY nos secrets.");

    const trackList = asArray(tracks).filter((t: any) => t && t.artist && t.title);
    const artistSet = new Set<string>();
    trackList.forEach((t: any) => {
      const a = firstArtist(t.artist);
      if (a) artistSet.add(a);
    });

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
          const tags = asArray(j?.toptags?.tag).slice(0, 6).map((x: any) => x.name).join(";");
          trackTags[`${artist.toLowerCase()}|${title.toLowerCase()}`] = tags;
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
      } catch {
        /* ignora falha pontual */
      }
    });

    return new Response(JSON.stringify({ trackTags, artistInfo }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e.message || e) }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
