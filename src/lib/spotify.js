// ------------------------------------------------------------------
// Spotify Web API — login via Authorization Code + PKCE (sem backend/secret)
// e as chamadas que o app usa: perfil, top tracks, busca, criar playlist.
// ------------------------------------------------------------------

const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID;
const SCOPES = [
  "user-top-read",
  "playlist-modify-public",
  "playlist-modify-private",
].join(" ");

// Precisa bater EXATAMENTE com o Redirect URI cadastrado no dashboard.
export const REDIRECT_URI = window.location.origin + "/callback";

const TOKEN_KEY = "pdg_spotify_token"; // { access_token, refresh_token, expires_at }
const VERIFIER_KEY = "pdg_pkce_verifier";

// ---------- PKCE helpers ----------
function randomString(len) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, (x) => chars[x % chars.length]).join("");
}

async function sha256(str) {
  const data = new TextEncoder().encode(str);
  return crypto.subtle.digest("SHA-256", data);
}

function base64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// ---------- token storage ----------
function readToken() {
  try {
    return JSON.parse(localStorage.getItem(TOKEN_KEY) || "null");
  } catch {
    return null;
  }
}
function writeToken(t) {
  try {
    localStorage.setItem(TOKEN_KEY, JSON.stringify(t));
  } catch {}
}
export function isLoggedIn() {
  return !!readToken();
}
export function logout() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

// ---------- login flow ----------
export async function login() {
  if (!CLIENT_ID) {
    alert("Falta o VITE_SPOTIFY_CLIENT_ID no .env — veja o README.");
    return;
  }
  const verifier = randomString(96);
  const challenge = base64url(await sha256(verifier));
  try {
    sessionStorage.setItem(VERIFIER_KEY, verifier);
  } catch {}

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge_method: "S256",
    code_challenge: challenge,
    // devolve pra onde a pessoa estava (ex.: código do rolê)
    state: window.location.pathname + window.location.search,
  });
  window.location.href =
    "https://accounts.spotify.com/authorize?" + params.toString();
}

// Troca o ?code= por tokens. Retorna o "state" (pra redirecionar de volta).
export async function handleCallback() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") || "/";
  const error = url.searchParams.get("error");
  if (error) throw new Error("Spotify recusou o login: " + error);
  if (!code) throw new Error("Sem código de autorização na volta do Spotify.");

  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  if (!verifier) throw new Error("Verifier PKCE não encontrado. Tente logar de novo.");

  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
  });
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error("Falha ao trocar código por token: " + (await res.text()));
  const data = await res.json();
  writeToken({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in - 60) * 1000,
  });
  return state;
}

async function refresh() {
  const tok = readToken();
  if (!tok?.refresh_token) throw new Error("Sessão expirada. Logue de novo.");
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    grant_type: "refresh_token",
    refresh_token: tok.refresh_token,
  });
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    logout();
    throw new Error("Não deu pra renovar a sessão. Logue de novo.");
  }
  const data = await res.json();
  writeToken({
    access_token: data.access_token,
    refresh_token: data.refresh_token || tok.refresh_token,
    expires_at: Date.now() + (data.expires_in - 60) * 1000,
  });
}

async function token() {
  let tok = readToken();
  if (!tok) throw new Error("Não logado no Spotify.");
  if (Date.now() >= tok.expires_at) {
    await refresh();
    tok = readToken();
  }
  return tok.access_token;
}

// ---------- API calls ----------
async function api(path, opts = {}) {
  const t = await token();
  const res = await fetch("https://api.spotify.com/v1" + path, {
    ...opts,
    headers: {
      Authorization: "Bearer " + t,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  if (res.status === 429) {
    const wait = (+res.headers.get("Retry-After") || 1) * 1000;
    await new Promise((r) => setTimeout(r, wait));
    return api(path, opts);
  }
  if (!res.ok) throw new Error(`Spotify ${res.status}: ${await res.text()}`);
  if (res.status === 204) return null;
  return res.json();
}

export async function getMe() {
  return api("/me");
}

// time_range: short_term (~4 semanas) | medium_term (~6 meses) | long_term (~1 ano)
// (o gênero/vibe é adicionado depois, via Last.fm — o Spotify esvaziou esse dado)
export async function getTopTracks(time_range = "medium_term", limit = 30) {
  const data = await api(`/me/top/tracks?time_range=${time_range}&limit=${limit}`);
  return (data.items || []).map(normalizeTrack);
}

export async function searchTracks(q, limit = 12) {
  if (!q.trim()) return [];
  const data = await api(`/search?type=track&limit=${limit}&q=${encodeURIComponent(q)}`);
  return (data.tracks?.items || []).map(normalizeTrack);
}

function normalizeTrack(t) {
  return {
    uri: t.uri,
    spotify_id: t.id,
    title: t.name,
    artist: (t.artists || []).map((a) => a.name).join(", "),
    art: t.album?.images?.slice(-1)[0]?.url || null,
    genre: "",
  };
}

// Extrai o id de um link/URI de playlist do Spotify.
export function playlistIdFromUrl(input) {
  const s = String(input || "").trim();
  const m = s.match(/playlist[/:]([a-zA-Z0-9]+)/) || (/^[a-zA-Z0-9]{22}$/.test(s) ? [null, s] : null);
  return m ? m[1] : null;
}

// Lê as faixas de uma playlist QUE VOCÊ TEM ACESSO (sua ou colaborativa),
// usando o token do usuário logado. Endpoint novo (mar/2026): /items.
export async function getPlaylistTracks(url) {
  const id = playlistIdFromUrl(url);
  if (!id) throw new Error("Não reconheci esse link de playlist.");
  const strip = (u) => u.replace("https://api.spotify.com/v1", "");
  const tracks = [];
  let path = `/playlists/${id}/items?limit=100&fields=next,items(item(uri,id,name,artists(name),album(images)))`;
  while (path) {
    let data;
    try {
      data = await api(path);
    } catch (e) {
      const msg = String(e);
      if (msg.includes("403")) throw new Error("Sem acesso a essa playlist — o Spotify só deixa ler as suas ou colaborativas.");
      if (msg.includes("404")) throw new Error("Playlist não encontrada.");
      throw e;
    }
    for (const it of data.items || []) {
      const t = it.item;
      if (!t || !t.uri) continue;
      tracks.push(normalizeTrack(t));
    }
    path = data.next ? strip(data.next) : null;
  }
  return tracks;
}

// Cria a playlist na conta de quem está logado e adiciona as faixas (URIs).
// Endpoints atualizados pra migração de mar/2026: /me/playlists e /items.
export async function createPlaylist(name, uris, description = "") {
  const pl = await api(`/me/playlists`, {
    method: "POST",
    body: JSON.stringify({ name, description, public: false }),
  });
  for (let i = 0; i < uris.length; i += 100) {
    await api(`/playlists/${pl.id}/items`, {
      method: "POST",
      body: JSON.stringify({ uris: uris.slice(i, i + 100) }),
    });
  }
  return pl.external_urls?.spotify || `https://open.spotify.com/playlist/${pl.id}`;
}
