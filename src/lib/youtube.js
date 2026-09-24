// ------------------------------------------------------------------
// YouTube Data API v3 — cria uma playlist de CLIPES a partir do blend.
// Login via Google Identity Services (token client, sem secret, client-side).
// Busca o vídeo de cada música (título + artista) e monta a playlist.
//
// .env: VITE_GOOGLE_CLIENT_ID  (Client ID OAuth do Google Cloud)
// ------------------------------------------------------------------

const CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID || "").replace(/[^\x21-\x7E]/g, "");
const SCOPE = "https://www.googleapis.com/auth/youtube";
export const youtubeReady = !!CLIENT_ID && !/cole_aqui/i.test(CLIENT_ID || "");

let accessToken = null;
let tokenExpiry = 0;

const gis = () => window.google?.accounts?.oauth2;

function ensureGis() {
  return new Promise((resolve, reject) => {
    if (gis()) return resolve();
    let tries = 0;
    const iv = setInterval(() => {
      if (gis()) { clearInterval(iv); resolve(); }
      else if (++tries > 60) { clearInterval(iv); reject(new Error("Script do Google não carregou.")); }
    }, 100);
  });
}

export function isLoggedIn() {
  return !!accessToken && Date.now() < tokenExpiry;
}

export async function login() {
  if (!youtubeReady) throw new Error("Falta o VITE_GOOGLE_CLIENT_ID no .env.");
  await ensureGis();
  return new Promise((resolve, reject) => {
    const client = gis().initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (resp) => {
        if (resp.error) return reject(new Error("Google recusou: " + resp.error));
        accessToken = resp.access_token;
        tokenExpiry = Date.now() + (resp.expires_in ? resp.expires_in * 1000 : 3500000) - 60000;
        resolve(accessToken);
      },
    });
    client.requestAccessToken();
  });
}

async function token() {
  if (isLoggedIn()) return accessToken;
  return login();
}

async function yt(path, opts = {}) {
  const t = await token();
  const res = await fetch("https://www.googleapis.com/youtube/v3" + path, {
    ...opts,
    headers: { Authorization: "Bearer " + t, "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 403 && /quota/i.test(body)) throw new Error("quota");
    throw new Error("YouTube " + res.status + ": " + body);
  }
  return res.json();
}

async function searchVideoId(query) {
  const data = await yt(`/search?part=snippet&type=video&maxResults=1&q=${encodeURIComponent(query)}`);
  return data.items?.[0]?.id?.videoId || null;
}

// concorrência limitada pra buscas
async function pool(items, limit, fn) {
  let i = 0;
  await Promise.all(
    Array(Math.min(limit, items.length)).fill(0).map(async () => {
      while (i < items.length) { const idx = i++; await fn(items[idx], idx); }
    })
  );
}

// Cria a playlist de clipes. Usa o cache (uri->videoId) e busca só o que falta.
// Retorna { url, resolved } — resolved = novos videoIds pra gravar no cache.
export async function createPlaylist(name, tracks, description = "", onProgress, cachedIds = {}) {
  await token(); // dispara o login se preciso
  // 1) resolve o videoId de cada faixa (cache primeiro; busca só os que faltam)
  const videoIds = new Array(tracks.length).fill(null);
  const resolved = {}; // uri -> videoId (novos, pra cachear)
  let done = 0;
  let firstErr = null;
  await pool(tracks, 5, async (tk, idx) => {
    const cached = cachedIds[tk.uri];
    if (cached) {
      videoIds[idx] = cached;
    } else {
      try {
        const id = await searchVideoId(`${tk.title} ${tk.artist}`);
        videoIds[idx] = id;
        if (id) resolved[tk.uri] = id;
      } catch (e) { if (!firstErr) firstErr = e; }
    }
    done++;
    onProgress && onProgress(done, tracks.length);
  });
  const ids = videoIds.filter(Boolean);
  if (!ids.length) throw new Error(firstErr ? firstErr.message : "no-clips");

  // 2) cria a playlist (não listada)
  const pl = await yt(`/playlists?part=snippet,status`, {
    method: "POST",
    body: JSON.stringify({ snippet: { title: name, description }, status: { privacyStatus: "unlisted" } }),
  });

  // 3) adiciona os vídeos NA ORDEM (sequencial)
  for (const videoId of ids) {
    await yt(`/playlistItems?part=snippet`, {
      method: "POST",
      body: JSON.stringify({ snippet: { playlistId: pl.id, resourceId: { kind: "youtube#video", videoId } } }),
    });
  }
  return { url: `https://www.youtube.com/playlist?list=${pl.id}`, resolved };
}
