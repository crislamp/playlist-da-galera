import { useState, useEffect, useCallback, useRef, createContext, useContext } from "react";
import { Routes, Route, useNavigate, useParams, Link } from "react-router-dom";
import * as sp from "./lib/spotify.js";
import * as yt from "./lib/youtube.js";
import { youtubeReady } from "./lib/youtube.js";
import {
  supabaseReady,
  createRole,
  getRole,
  joinRole,
  saveTracks,
  addTracks,
  loadRoleData,
  enrichTags,
  searchSpotify,
  importYtPlaylist,
  getYtCache,
  saveYtCache,
  getVideoIds,
} from "./lib/supabase.js";
import { buildBlend, moodScore } from "./lib/blend.js";

const firstArtistName = (t) => (t.artist || "").split(",")[0].trim();

const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID;
const clientIdOk = !!CLIENT_ID && !/cole_aqui/i.test(CLIENT_ID);
const configOk = clientIdOk && supabaseReady;

const SUGG_NAME = "✨ Sugestões"; // nome do participante das sugestões (fixo, não traduz)

/* ---------------- i18n ---------------- */
const STRINGS = {
  pt: {
    tagline: "Junta o gosto de todo mundo do rolê numa playlist só. Cada um conecta o Spotify (ou cola uma playlist), o app mistura com justiça — ninguém monopoliza o som e o set flui sem tranco de vibe.",
    setup_bold: "Falta configurar as chaves.",
    setup_rest: " Copie .env.example para .env e preencha o Client ID do Spotify e as chaves do Supabase. Veja o README.md.",
    create_hangout: "Criar um rolê",
    hangout_name: "Nome do rolê",
    hangout_name_ph: "Ex: Churras de sábado",
    where_play: "Onde vai tocar",
    soon: "em breve",
    dest_youtube: "YouTube (clipes)",
    create_btn: "Criar e pegar o link",
    creating: "Criando…",
    join_hangout: "Entrar num rolê",
    hangout_code: "Código do rolê",
    code_ph: "Ex: K7QP",
    join_btn: "Entrar",
    create_err: "Deu ruim ao criar.",
    err_name_role: "Dá um nome pro rolê 🙂",
    err_code: "Coloca o código do rolê (ex: K7QP).",
    connecting_spotify: "Conectando ao Spotify…",
    role_not_found: "Rolê não encontrado.",
    loading_role: "Carregando rolê…",
    role_label: "Rolê",
    copy_link: "Copiar link",
    copied: "Copiado!",
    your_turn: "Sua vez",
    connect_desc: "Conecte seu Spotify — o app já puxa as músicas que você mais ouve. Sem digitar nada.",
    connect_spotify: "Conectar Spotify",
    tab_add: "➕ Adicionar",
    tab_tops: "🎧 Mais ouvidas",
    tab_playlist: "📋 Colar playlist",
    add_hint: "Busca a música e adiciona — sem precisar logar. 🎧",
    connect_prompt: "Conecte o Spotify pra usar isso 👇",
    connect_btn: "🎧 Conectar Spotify",
    yt_pl_title: "Colar playlist do YouTube / YT Music — sem login 📺",
    yt_pl_hint: "💡 Músicas daqui já vêm com o clipe e tocam na hora, sem gastar a busca diária do YouTube.",
    yt_pl_link: "Link da playlist do YouTube",
    yt_pl_btn: "+ Adicionar playlist do YouTube",
    sp_pl_beta: "📋 Colar playlist do Spotify (beta — precisa logar, e só suas/colaborativas)",
    your_name: "Seu nome no rolê",
    your_name_ph: "Como você aparece",
    top_played: "Mais ouvidas:",
    range_short: "4 sem",
    range_med: "6 meses",
    range_long: "1 ano",
    pulling_tops: "Puxando suas mais ouvidas…",
    search_ph: "Buscar e adicionar outra música…",
    search_btn: "Buscar",
    save_btn: (n) => `Salvar minhas ${n} músicas no rolê`,
    paste_desc_pre: "Cole uma playlist ",
    paste_desc_bold: "sua ou colaborativa",
    paste_desc_post: " e diga de quem é.",
    paste_help: "Regra do Spotify: só dá pra ler playlists que você é dona ou colaboradora. Playlist pública de outra pessoa não abre. Pra usar a de um amigo: ele te adiciona como colaborador(a), ou ele mesmo loga na aba 'Mais ouvidas'.",
    whose: "De quem é",
    whose_ph: "Ex: Ana",
    playlist_link: "Link da playlist do Spotify",
    add_playlist_btn: "+ Adicionar playlist ao rolê",
    reading: "Lendo…",
    logout: "Sair do Spotify",
    analyzing: "Analisando as vibes… 🎧",
    reading_pl: (name) => `Lendo a playlist de ${name}…`,
    err_whose: "De quem é essa playlist?",
    err_pastelink: "Cole o link da playlist.",
    err_empty_pl: "Playlist vazia ou sem faixas legíveis.",
    err_name: "Coloque seu nome.",
    added_pl: (n, name) => `✅ ${n} músicas de "${name}" no rolê 🎶`,
    saved_ok: (n) => `✅ Prontinho — ${n} músicas suas no rolê 🎶`,
    the_playlist: "A playlist",
    refresh: "↻ Atualizar",
    reshuffle: "Rearranjar",
    enrich: "✨ Enriquecer",
    create_spotify: "Criar no Spotify",
    connect_create_spotify: "Conectar e criar no Spotify",
    yt_soon: "Configure o Google (README) pra criar no YouTube",
    create_youtube: "Criar no YouTube",
    yt_created: "✅ Playlist criada! Abrir no YouTube →",
    yt_progress: (i, n) => `Procurando os clipes… ${i}/${n}`,
    yt_quota: "Acabou a cota de busca do YouTube por hoje 😕 As músicas do Spotify precisam procurar o clipe (limite de ~100/dia). Reseta amanhã de madrugada. Dica: clipes de playlists do YouTube tocam na hora, sem limite.",
    yt_quota_partial: (n) => `Toquei ${n} que já estavam prontas 🎧 As novas do Spotify não deram porque a busca do YouTube atingiu o limite de hoje (reseta amanhã). Playlists do YouTube tocam sem esse limite.`,
    yt_noclips: "Não achei os clipes no YouTube 😕",
    no_sp_tracks: "Essas faixas vieram do YouTube — não dá pra criar no Spotify. Usa o ▶️ Tocar ou o 📺 YouTube.",
    play_btn: "▶️ Tocar",
    preparing: "Preparando…",
    no_videos: "Não consegui preparar os clipes 😕",
    up_next: "A seguir",
    now_playing: "Tocando agora",
    beta_tag: "beta",
    beta_spotify: "🔒 Criar no Spotify é beta — precisa conectar sua conta, e por enquanto o Spotify libera só algumas pessoas. Pra ouvir sem login, usa o ▶️ Tocar!",
    beta_youtube: "🔒 Criar no YouTube é beta — precisa conectar sua conta Google e a cota diária é limitada. Pra ouvir sem login, usa o ▶️ Tocar!",
    beta_connect: "Conectar mesmo assim",
    beta_dismiss: "Deixa, vou no ▶️ Tocar",
    connect_beta_note: "Beta: por enquanto o login do Spotify é limitado a poucas contas.",
    pl_created: "✅ Playlist criada! Abrir no Spotify →",
    flow_label: "Fluidez das transições",
    flow_hi: "Flui liso 🌊",
    flow_mid: "Uns trancos",
    flow_low: "Vibe pula muito",
    anti_label: "Anti-monomúsica",
    anti_sub: (p, c, h) => `${p} pessoas · ${c} em comum · ${h} 🔥`,
    dominating: (name, pct) => `⚠️ ${name} está com ${pct}% da fila. Chame mais gente pra equilibrar.`,
    democratic: "✅ Rolê democrático: todo mundo tem espaço parecido.",
    enrich_title: "✨ Sugerir músicas novas — escolha a vibe",
    add_sugg: (n) => `+ Adicionar ${n} ao rolê`,
    sugg_mining: "Garimpando faixas novas…",
    sugg_none: "Não achei sugestões novas dessa vibe — tenta outra.",
    sugg_login: "Conecte seu Spotify (lá em cima) pra buscar sugestões.",
    sugg_added: (n) => `✅ ${n} adicionada(s)!`,
    empty_blend: "Ninguém jogou música ainda. Compartilhe o link do rolê 👆",
    everyone: "todos curtem",
    hino_tip: "Hino — muita gente conhece",
  },
  en: {
    tagline: "Blends everyone's taste at the hangout into one playlist. Each person connects Spotify (or pastes a playlist), and the app mixes it fairly — nobody hogs the sound and the set flows without vibe whiplash.",
    setup_bold: "Keys not configured yet.",
    setup_rest: " Copy .env.example to .env and fill in your Spotify Client ID and Supabase keys. See README.md.",
    create_hangout: "Create a hangout",
    hangout_name: "Hangout name",
    hangout_name_ph: "e.g. Saturday BBQ",
    where_play: "Where it'll play",
    soon: "soon",
    dest_youtube: "YouTube (clips)",
    create_btn: "Create & get the link",
    creating: "Creating…",
    join_hangout: "Join a hangout",
    hangout_code: "Hangout code",
    code_ph: "e.g. K7QP",
    join_btn: "Join",
    create_err: "Couldn't create it.",
    err_name_role: "Give the hangout a name 🙂",
    err_code: "Enter the hangout code (e.g. K7QP).",
    connecting_spotify: "Connecting to Spotify…",
    role_not_found: "Hangout not found.",
    loading_role: "Loading hangout…",
    role_label: "Hangout",
    copy_link: "Copy link",
    copied: "Copied!",
    your_turn: "Your turn",
    connect_desc: "Connect your Spotify — the app grabs the songs you listen to most. No typing.",
    connect_spotify: "Connect Spotify",
    tab_add: "➕ Add",
    tab_tops: "🎧 Top played",
    tab_playlist: "📋 Paste playlist",
    add_hint: "Search a song and add it — no login needed. 🎧",
    connect_prompt: "Connect Spotify to use this 👇",
    connect_btn: "🎧 Connect Spotify",
    yt_pl_title: "Paste a YouTube / YT Music playlist — no login 📺",
    yt_pl_hint: "💡 Songs from here already include the clip and play instantly, without using YouTube's daily search.",
    yt_pl_link: "YouTube playlist link",
    yt_pl_btn: "+ Add YouTube playlist",
    sp_pl_beta: "📋 Paste a Spotify playlist (beta — needs login, only yours/collaborative)",
    your_name: "Your name",
    your_name_ph: "How you appear",
    top_played: "Top played:",
    range_short: "4 wks",
    range_med: "6 mo",
    range_long: "1 yr",
    pulling_tops: "Pulling your top played…",
    search_ph: "Search & add another song…",
    search_btn: "Search",
    save_btn: (n) => `Save my ${n} songs`,
    paste_desc_pre: "Paste a playlist ",
    paste_desc_bold: "you own or collaborate on",
    paste_desc_post: " and say whose it is.",
    paste_help: "Spotify rule: you can only read playlists you own or collaborate on. Someone else's public playlist won't open. To use a friend's: have them add you as a collaborator, or they log in themselves on the 'Top played' tab.",
    whose: "Whose is it",
    whose_ph: "e.g. Ana",
    playlist_link: "Spotify playlist link",
    add_playlist_btn: "+ Add playlist to hangout",
    reading: "Reading…",
    logout: "Log out of Spotify",
    analyzing: "Analyzing the vibes… 🎧",
    reading_pl: (name) => `Reading ${name}'s playlist…`,
    err_whose: "Whose playlist is this?",
    err_pastelink: "Paste the playlist link.",
    err_empty_pl: "Playlist empty or unreadable.",
    err_name: "Enter your name.",
    added_pl: (n, name) => `✅ ${n} songs from "${name}" added 🎶`,
    saved_ok: (n) => `✅ Done — ${n} of your songs added 🎶`,
    the_playlist: "The playlist",
    refresh: "↻ Refresh",
    reshuffle: "Reshuffle",
    enrich: "✨ Enrich",
    create_spotify: "Create on Spotify",
    connect_create_spotify: "Connect & create on Spotify",
    yt_soon: "Set up Google (README) to create on YouTube",
    create_youtube: "Create on YouTube",
    yt_created: "✅ Playlist created! Open on YouTube →",
    yt_progress: (i, n) => `Finding the clips… ${i}/${n}`,
    yt_quota: "Out of YouTube search quota for today 😕 Spotify songs have to look up their clip (~100/day limit). It resets overnight. Tip: clips from YouTube playlists play instantly, no limit.",
    yt_quota_partial: (n) => `Played ${n} that were already prepared 🎧 The new Spotify ones didn't make it — YouTube search hit today's limit (resets tomorrow). YouTube playlists play without this limit.`,
    yt_noclips: "Couldn't find the clips on YouTube 😕",
    no_sp_tracks: "These tracks came from YouTube — can't create on Spotify. Use ▶️ Play or 📺 YouTube.",
    play_btn: "▶️ Play",
    preparing: "Getting it ready…",
    no_videos: "Couldn't prepare the clips 😕",
    up_next: "Up next",
    now_playing: "Now playing",
    beta_tag: "beta",
    beta_spotify: "🔒 Creating on Spotify is beta — you need to connect your account, and for now Spotify only allows a few people. To listen with no login, use ▶️ Play!",
    beta_youtube: "🔒 Creating on YouTube is beta — you need to connect your Google account and the daily quota is limited. To listen with no login, use ▶️ Play!",
    beta_connect: "Connect anyway",
    beta_dismiss: "Nah, I'll use ▶️ Play",
    connect_beta_note: "Beta: for now Spotify login is limited to a few accounts.",
    pl_created: "✅ Playlist created! Open in Spotify →",
    flow_label: "Transition flow",
    flow_hi: "Flows smooth 🌊",
    flow_mid: "A few bumps",
    flow_low: "Vibe jumps a lot",
    anti_label: "Anti-samey",
    anti_sub: (p, c, h) => `${p} people · ${c} shared · ${h} 🔥`,
    dominating: (name, pct) => `⚠️ ${name} has ${pct}% of the queue. Get more people to balance it.`,
    democratic: "✅ Balanced hangout: everyone gets similar space.",
    enrich_title: "✨ Suggest new songs — pick the vibe",
    add_sugg: (n) => `+ Add ${n} to the hangout`,
    sugg_mining: "Digging up new tracks…",
    sugg_none: "No new suggestions for that vibe — try another.",
    sugg_login: "Connect your Spotify (above) to get suggestions.",
    sugg_added: (n) => `✅ ${n} added!`,
    empty_blend: "No songs yet. Share the hangout link 👆",
    everyone: "everyone",
    hino_tip: "Anthem — lots of people know it",
    install_app: "📲 Install",
  },
};
STRINGS.pt.install_app = "📲 Instalar";

const VIBE_LABELS = {
  pt: { chill: "chill", mellow: "suave", mid: "médio", upbeat: "animado", peak: "pico", none: "—" },
  en: { chill: "chill", mellow: "mellow", mid: "mid", upbeat: "upbeat", peak: "peak", none: "—" },
};

const LangCtx = createContext({ lang: "pt", t: (k) => k });
const useT = () => useContext(LangCtx);

// os 5 climas (nota central de cada balde) — pra escolher a vibe das sugestões
const VIBES = [
  { m: 20, e: "🌙", key: "chill" },
  { m: 42, e: "🍃", key: "mellow" },
  { m: 57, e: "✨", key: "mid" },
  { m: 72, e: "🔥", key: "upbeat" },
  { m: 92, e: "⚡", key: "peak" },
];

// nota de clima (0-100) -> etiqueta de vibe (key + emoji + cor)
function vibeOf(mood) {
  if (mood == null) return { e: "🎵", key: "none", color: "#8b8b8b" };
  if (mood < 35) return { e: "🌙", key: "chill", color: "#35b8c7" };
  if (mood < 50) return { e: "🍃", key: "mellow", color: "#3fae8f" };
  if (mood < 65) return { e: "✨", key: "mid", color: "#b06bff" };
  if (mood < 80) return { e: "🔥", key: "upbeat", color: "#ff8a3d" };
  return { e: "⚡", key: "peak", color: "#ff5c6a" };
}

export default function App() {
  const [lang, setLang] = useState(() => {
    try { return localStorage.getItem("pdg_lang") || "pt"; } catch { return "pt"; }
  });
  const t = (k, ...a) => {
    const v = STRINGS[lang]?.[k];
    return typeof v === "function" ? v(...a) : v ?? k;
  };
  function switchLang() {
    const next = lang === "pt" ? "en" : "pt";
    setLang(next);
    try { localStorage.setItem("pdg_lang", next); } catch {}
  }

  // botão "Instalar" (Android/Chrome dispara beforeinstallprompt; iOS não tem)
  const [installEvt, setInstallEvt] = useState(null);
  useEffect(() => {
    const onPrompt = (e) => { e.preventDefault(); setInstallEvt(e); };
    const onInstalled = () => setInstallEvt(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  async function install() {
    if (!installEvt) return;
    installEvt.prompt();
    try { await installEvt.userChoice; } catch {}
    setInstallEvt(null);
  }

  return (
    <LangCtx.Provider value={{ lang, t }}>
      <div className="wrap">
        <header className="top">
          <Link to="/" className="brand">
            <h1>Playlist da <span className="em">Galera</span></h1>
          </Link>
          <div className="hdr-btns">
            {installEvt && <button className="lang-btn install" onClick={install}>{t("install_app")}</button>}
            <button className="lang-btn" onClick={switchLang} aria-label="Language">🌐 {lang.toUpperCase()}</button>
            <ThemeToggle />
          </div>
        </header>
        {!configOk && <SetupBanner />}
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/callback" element={<Callback />} />
          <Route path="/role/:code" element={<RolePage />} />
        </Routes>
      </div>
    </LangCtx.Provider>
  );
}

function destLabel(k, t) {
  return k === "spotify" ? "Spotify" : t("dest_youtube");
}

function SetupBanner() {
  const { t } = useT();
  return (
    <div className="banner">
      <b>{t("setup_bold")}</b>{t("setup_rest")}
    </div>
  );
}

/* ---------------- home ---------------- */
function Home() {
  const { t } = useT();
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function create() {
    if (!name.trim()) { setErr(t("err_name_role")); return; }
    setBusy(true);
    setErr("");
    try {
      const role = await createRole(name.trim());
      nav(`/role/${role.code}`);
    } catch (e) {
      setErr(e.message || t("create_err"));
    } finally {
      setBusy(false);
    }
  }
  function enter() {
    if (code.trim().length < 3) { setErr(t("err_code")); return; }
    nav(`/role/${code.trim().toUpperCase()}`);
  }

  return (
    <>
      <p className="tagline">{t("tagline")}</p>
      <div className="cards2">
        <div className="card">
          <p className="eyebrow">{t("create_hangout")}</p>
          <div className="field">
            <label htmlFor="rn">{t("hangout_name")}</label>
            <input id="rn" value={name} onChange={(e) => { setName(e.target.value); if (err) setErr(""); }}
              placeholder={t("hangout_name_ph")} maxLength={40}
              onKeyDown={(e) => e.key === "Enter" && create()} />
          </div>
          <button className="btn wide" onClick={create} disabled={busy || !configOk}>
            {busy ? t("creating") : t("create_btn")}
          </button>
        </div>
        <div className="card">
          <p className="eyebrow">{t("join_hangout")}</p>
          <div className="field">
            <label htmlFor="rc">{t("hangout_code")}</label>
            <input id="rc" value={code} onChange={(e) => { setCode(e.target.value.toUpperCase()); if (err) setErr(""); }}
              placeholder={t("code_ph")} maxLength={6}
              onKeyDown={(e) => e.key === "Enter" && enter()} />
          </div>
          <button className="btn ghost wide" onClick={enter} disabled={!configOk}>{t("join_btn")}</button>
        </div>
      </div>
      {err && <p className="err">{err}</p>}
    </>
  );
}

/* ---------------- callback (login do Spotify, só pra exportar) ---------------- */
function Callback() {
  const { t } = useT();
  const nav = useNavigate();
  const [err, setErr] = useState("");
  useEffect(() => {
    sp.handleCallback()
      .then((state) => nav(state || "/", { replace: true }))
      .catch((e) => setErr(e.message));
  }, [nav]);
  return (
    <div className="card center">
      {err ? <p className="err">{err}</p> : <p>{t("connecting_spotify")}</p>}
    </div>
  );
}

/* ---------------- página do rolê ---------------- */
function RolePage() {
  const { t } = useT();
  const { code } = useParams();
  const [role, setRole] = useState(null);
  const [loadErr, setLoadErr] = useState("");
  const [data, setData] = useState({ participants: [], tracks: [] });

  useEffect(() => {
    getRole(code).then((r) => { if (r) setRole(r); else setLoadErr(t("role_not_found")); })
      .catch((e) => setLoadErr(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const refresh = useCallback(async () => {
    if (!role) return;
    setData(await loadRoleData(role.id));
  }, [role]);

  useEffect(() => { refresh(); }, [refresh]);

  if (loadErr) return <p className="err">{loadErr}</p>;
  if (!role) return <div className="card center">{t("loading_role")}</div>;

  return (
    <>
      <div className="rolehead card">
        <div>
          <p className="eyebrow">{t("role_label")} · 🎧 📺</p>
          <h2>{role.name}</h2>
        </div>
        <ShareBox code={role.code} />
      </div>

      <MyPicks role={role} onSaved={refresh} />
      <Blend role={role} data={data} onRefresh={refresh} />
    </>
  );
}

const DEST_ICON = { spotify: "🎧", youtube: "📺" };

function ShareBox({ code }) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/role/${code}`;
  function copy() {
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 1800);
    });
  }
  return (
    <div className="share">
      <div className="code">{code}</div>
      <button className="btn sm" onClick={copy}>{copied ? t("copied") : t("copy_link")}</button>
    </div>
  );
}

/* ---------------- conectar (login do Spotify) ---------------- */
function ConnectCard({ onLogin }) {
  const { t } = useT();
  return (
    <div className="card center">
      <p className="eyebrow">{t("your_turn")}</p>
      <p className="muted" style={{ marginTop: 0, marginBottom: 14 }}>{t("connect_desc")}</p>
      <button className="btn wide green" onClick={onLogin} disabled={!configOk}>{t("connect_spotify")}</button>
    </div>
  );
}

/* ---------------- minhas músicas (mais ouvidas + busca + colar playlist) ---------------- */
function MyPicks({ role, onSaved }) {
  const { t } = useT();
  const [loggedIn, setLoggedIn] = useState(sp.isLoggedIn());
  const [name, setName] = useState("");
  const [range, setRange] = useState("medium_term");
  const [tops, setTops] = useState([]);
  const [selected, setSelected] = useState({});
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [status, setStatus] = useState("");
  const [ready, setReady] = useState(false);
  const [plName, setPlName] = useState("");
  const [plUrl, setPlUrl] = useState("");
  const [plBusy, setPlBusy] = useState(false);
  const [ypName, setYpName] = useState("");
  const [ypUrl, setYpUrl] = useState("");
  const [ypBusy, setYpBusy] = useState(false);
  const [mode, setMode] = useState("add");
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    if (!sp.isLoggedIn()) return;
    (async () => {
      try {
        const profile = await sp.getMe();
        setName((n) => n || profile.display_name || "");
        setTops(await sp.getTopTracks(range, 30));
        setReady(true);
      } catch (e) {
        setStatus("⚠️ " + e.message);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function changeRange(r) {
    setRange(r);
    try { setTops(await sp.getTopTracks(r, 30)); } catch (e) { setStatus("⚠️ " + e.message); }
  }
  function toggle(track, source) {
    setSelected((s) => {
      const n = { ...s };
      if (n[track.uri]) delete n[track.uri];
      else n[track.uri] = { ...track, source };
      return n;
    });
  }
  async function doSearch() {
    if (!query.trim()) return;
    setSearching(true);
    try {
      setResults(loggedIn ? await sp.searchTracks(query, 10) : await searchSpotify(query, 10));
    } catch (e) { setStatus("⚠️ " + e.message); }
    finally { setSearching(false); }
  }
  async function addPlaylist() {
    if (!plName.trim()) return setStatus(t("err_whose"));
    if (!plUrl.trim()) return setStatus(t("err_pastelink"));
    setPlBusy(true);
    try {
      setStatus(t("reading_pl", plName.trim()));
      let tracks = await sp.getPlaylistTracks(plUrl.trim());
      if (!tracks.length) throw new Error(t("err_empty_pl"));
      setStatus(t("analyzing"));
      tracks = await enrichTags(tracks.map((tk) => ({ ...tk, source: "playlist" })));
      const p = await joinRole(role.id, plName.trim());
      await saveTracks(role.id, p.id, tracks);
      setStatus(t("added_pl", tracks.length, plName.trim()));
      setPlName(""); setPlUrl("");
      onSaved();
    } catch (e) {
      setStatus("⚠️ " + e.message);
    } finally {
      setPlBusy(false);
    }
  }
  async function addYtPlaylist() {
    if (!ypName.trim()) return setStatus(t("err_whose"));
    if (!ypUrl.trim()) return setStatus(t("err_pastelink"));
    setYpBusy(true);
    try {
      setStatus(t("reading_pl", ypName.trim()));
      let tracks = (await importYtPlaylist(ypUrl.trim())).slice(0, 40);
      if (!tracks.length) throw new Error(t("err_empty_pl"));
      setStatus(t("analyzing"));
      tracks = await enrichTags(tracks.map((tk) => ({ ...tk, source: "youtube" })));
      const p = await joinRole(role.id, ypName.trim());
      await saveTracks(role.id, p.id, tracks);
      setStatus(t("added_pl", tracks.length, ypName.trim()));
      setYpName(""); setYpUrl("");
      onSaved();
    } catch (e) {
      setStatus("⚠️ " + e.message);
    } finally {
      setYpBusy(false);
    }
  }
  async function save() {
    if (!name.trim()) return setStatus(t("err_name"));
    try {
      setStatus(t("analyzing"));
      const enriched = await enrichTags(Object.values(selected));
      const p = await joinRole(role.id, name.trim());
      await saveTracks(role.id, p.id, enriched);
      setStatus(t("saved_ok", Object.keys(selected).length));
      onSaved();
    } catch (e) {
      setStatus("⚠️ " + e.message);
    }
  }

  const count = Object.keys(selected).length;
  const connectPrompt = (
    <div style={{ textAlign: "center", padding: "6px 0 4px" }}>
      <p className="muted" style={{ marginTop: 0 }}>{t("connect_prompt")}</p>
      <button className="btn green" onClick={() => sp.login()} disabled={!configOk}>{t("connect_btn")}</button>
      <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>{t("connect_beta_note")}</p>
    </div>
  );

  return (
    <div className="card">
      <div className="field">
        <label htmlFor="dn">{t("your_name")}</label>
        <input id="dn" value={name} onChange={(e) => setName(e.target.value)} maxLength={24}
          placeholder={t("your_name_ph")} />
      </div>

      <div className="tabs">
        <button className={mode === "add" ? "on" : ""} onClick={() => setMode("add")}>{t("tab_add")}</button>
        <button className={mode === "tops" ? "on" : ""} onClick={() => setMode("tops")}>{t("tab_tops")}</button>
        <button className={mode === "playlist" ? "on" : ""} onClick={() => setMode("playlist")}>{t("tab_playlist")}</button>
      </div>

      {mode === "add" && (
        <>
          <p className="muted" style={{ marginTop: 0 }}>{t("add_hint")}</p>
          <div className="searchbox">
            <input value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder={t("search_ph")}
              onKeyDown={(e) => e.key === "Enter" && doSearch()} />
            <button className="btn sm" onClick={doSearch} disabled={searching}>{searching ? "…" : t("search_btn")}</button>
          </div>
          <div className="tracklist">
            {results.map((tk) => (
              <TrackRow key={tk.uri} t={tk} on={!!selected[tk.uri]} onClick={() => toggle(tk, "manual")} />
            ))}
          </div>
        </>
      )}

      {mode === "tops" && (loggedIn ? (
        <>
          <div className="segrow">
            <span className="seglabel">{t("top_played")}</span>
            <div className="seg">
              {[["short_term", t("range_short")], ["medium_term", t("range_med")], ["long_term", t("range_long")]].map(([v, l]) => (
                <button key={v} className={range === v ? "on" : ""} onClick={() => changeRange(v)}>{l}</button>
              ))}
            </div>
          </div>
          {!ready && !status && <p className="muted">{t("pulling_tops")}</p>}
          <div className="tracklist">
            {tops.map((tk) => (
              <TrackRow key={tk.uri} t={tk} on={!!selected[tk.uri]} onClick={() => toggle(tk, "top")} />
            ))}
          </div>
        </>
      ) : connectPrompt)}

      {mode === "playlist" && (
        <div>
          {/* YouTube — sem login, pra todos */}
          <p className="muted" style={{ marginTop: 0 }}>{t("yt_pl_title")}</p>
          <p className="muted" style={{ marginTop: -4, fontSize: ".82rem" }}>{t("yt_pl_hint")}</p>
          <div className="field">
            <label htmlFor="ypn">{t("whose")}</label>
            <input id="ypn" value={ypName} onChange={(e) => setYpName(e.target.value)}
              placeholder={t("whose_ph")} maxLength={24} />
          </div>
          <div className="field">
            <label htmlFor="ypu">{t("yt_pl_link")}</label>
            <input id="ypu" value={ypUrl} onChange={(e) => setYpUrl(e.target.value)}
              placeholder="https://www.youtube.com/playlist?list=..."
              onKeyDown={(e) => e.key === "Enter" && addYtPlaylist()} />
          </div>
          <button className="btn wide" onClick={addYtPlaylist} disabled={ypBusy}>
            {ypBusy ? t("reading") : t("yt_pl_btn")}
          </button>

          {/* Spotify — beta (só logado) */}
          <div className="pl-add">
            {loggedIn ? (
              <>
                <p className="muted" style={{ marginTop: 0 }}>
                  {t("paste_desc_pre")}<b>{t("paste_desc_bold")}</b>{t("paste_desc_post")}{" "}
                  <button className="help" onClick={() => setShowHelp((v) => !v)} aria-label="?">?</button>
                </p>
                {showHelp && <div className="helpbox">{t("paste_help")}</div>}
                <div className="field">
                  <label htmlFor="pln">{t("whose")}</label>
                  <input id="pln" value={plName} onChange={(e) => setPlName(e.target.value)}
                    placeholder={t("whose_ph")} maxLength={24} />
                </div>
                <div className="field">
                  <label htmlFor="plu">{t("playlist_link")}</label>
                  <input id="plu" value={plUrl} onChange={(e) => setPlUrl(e.target.value)}
                    placeholder="https://open.spotify.com/playlist/..."
                    onKeyDown={(e) => e.key === "Enter" && addPlaylist()} />
                </div>
                <button className="btn wide expsp" onClick={addPlaylist} disabled={plBusy}>
                  {plBusy ? t("reading") : t("add_playlist_btn")}
                </button>
              </>
            ) : (
              <p className="muted" style={{ fontSize: 12, margin: 0 }}>{t("sp_pl_beta")}</p>
            )}
          </div>
        </div>
      )}

      <button className="btn wide" onClick={save} disabled={count === 0}>{t("save_btn", count)}</button>

      <div className="row-right">
        {loggedIn
          ? <button className="linkbtn" onClick={() => { sp.logout(); setLoggedIn(false); setTops([]); setReady(false); }}>{t("logout")}</button>
          : <button className="linkbtn" onClick={() => sp.login()}>{t("connect_btn")}</button>}
      </div>
      {status && <p className="muted" style={{ marginTop: 10 }}>{status}</p>}
    </div>
  );
}

function TrackRow({ t, on, onClick }) {
  return (
    <button className={"trackrow" + (on ? " on" : "")} onClick={onClick}>
      <span className="check">{on ? "✓" : "+"}</span>
      {t.art ? <img src={t.art} alt="" className="art" /> : <span className="art ph" />}
      <span className="meta">
        <span className="tt">{t.title}</span>
        <span className="aa">{t.artist}</span>
      </span>
    </button>
  );
}

/* ---------------- player (toca o blend no app, via YouTube) ---------------- */
let ytApiPromise = null;
function loadYouTubeApi() {
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { if (prev) prev(); resolve(); };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(s);
  });
  return ytApiPromise;
}

function Player({ tracks, onClose }) {
  const { t } = useT();
  const [idx, setIdx] = useState(0);
  const playerRef = useRef(null);
  const idxRef = useRef(0);
  useEffect(() => { idxRef.current = idx; }, [idx]);

  useEffect(() => {
    let cancelled = false;
    loadYouTubeApi().then(() => {
      if (cancelled) return;
      playerRef.current = new window.YT.Player("yt-player-el", {
        videoId: tracks[0].videoId,
        playerVars: { autoplay: 1, playsinline: 1, rel: 0 },
        events: {
          onStateChange: (e) => {
            if (e.data === window.YT.PlayerState.ENDED) {
              const next = idxRef.current + 1;
              if (next < tracks.length) setIdx(next);
            }
          },
        },
      });
    });
    return () => { cancelled = true; try { playerRef.current?.destroy(); } catch {} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const p = playerRef.current;
    if (p && p.loadVideoById && tracks[idx]) {
      try { p.loadVideoById(tracks[idx].videoId); } catch {}
    }
  }, [idx, tracks]);

  const cur = tracks[idx];
  return (
    <div className="player-overlay" onClick={(e) => { if (e.target.classList.contains("player-overlay")) onClose(); }}>
      <div className="player-box">
        <div className="player-head">
          <div className="player-now">
            <div className="pn-label">{t("now_playing")}</div>
            <div className="pn-title">{cur?.title}</div>
            <div className="pn-artist">{cur?.artist}</div>
          </div>
          <button className="player-close" onClick={onClose} aria-label="X">✕</button>
        </div>
        <div className="player-video"><div id="yt-player-el" /></div>
        <div className="player-ctrl">
          <button className="btn ghost sm" onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0}>⏮</button>
          <span className="player-pos">{idx + 1}/{tracks.length}</span>
          <button className="btn ghost sm" onClick={() => setIdx((i) => Math.min(tracks.length - 1, i + 1))} disabled={idx === tracks.length - 1}>⏭</button>
        </div>
        <div className="player-list">
          <div className="pl-label">{t("up_next")}</div>
          {tracks.map((tk, i) => (
            <button key={tk.videoId + i} className={"pl-item" + (i === idx ? " on" : "")} onClick={() => setIdx(i)}>
              <span className="pl-num">{i + 1}</span>
              <span className="pl-meta"><span className="tt">{tk.title}</span><span className="aa">{tk.artist}</span></span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------- blend + exportar ---------------- */
function Blend({ role, data, onRefresh }) {
  const { t, lang } = useT();
  const [result, setResult] = useState(null);
  const [exportingWhich, setExportingWhich] = useState(null);
  const [link, setLink] = useState("");
  const [linkKind, setLinkKind] = useState("spotify");
  const [err, setErr] = useState("");
  const [exportMsg, setExportMsg] = useState("");
  const [enrichOpen, setEnrichOpen] = useState(false);
  const [enrichVibe, setEnrichVibe] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [picked, setPicked] = useState({});
  const [suggBusy, setSuggBusy] = useState(false);
  const [suggMsg, setSuggMsg] = useState("");
  const [playerTracks, setPlayerTracks] = useState(null);
  const [preparing, setPreparing] = useState(false);
  const [betaMsg, setBetaMsg] = useState(null);

  const regen = useCallback(() => {
    setResult(buildBlend(data.participants, data.tracks));
  }, [data]);
  useEffect(() => { regen(); }, [regen]);

  async function findSuggestions(vibe) {
    if (!sp.isLoggedIn()) { setSuggMsg(t("sugg_login")); return; }
    setEnrichVibe(vibe); setSuggBusy(true); setSuggestions([]); setPicked({}); setSuggMsg(t("sugg_mining"));
    try {
      const existingArtists = new Set(data.tracks.map((tk) => firstArtistName(tk).toLowerCase()));
      const existingUris = new Set(data.tracks.map((tk) => tk.uri));
      let seeds = data.tracks.filter((tk) => vibeOf(moodScore(tk.genre)).key === vibe.key);
      if (!seeds.length) seeds = data.tracks;
      const cand = new Map();
      seeds.forEach((tk) => String(tk.similar || "").split(";").map((s) => s.trim().toLowerCase()).filter(Boolean)
        .forEach((a) => { if (!existingArtists.has(a)) cand.set(a, (cand.get(a) || 0) + 1); }));
      const ranked = [...cand.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0]).slice(0, 16);
      const found = [];
      for (const artist of ranked) {
        if (found.length >= 8) break;
        try {
          const r = await sp.searchTracks(`artist:${artist}`, 1);
          if (r[0] && !existingUris.has(r[0].uri) && !found.some((f) => f.uri === r[0].uri)) found.push(r[0]);
        } catch {}
      }
      setSuggestions(found);
      setSuggMsg(found.length ? "" : t("sugg_none"));
    } catch (e) {
      setSuggMsg("⚠️ " + e.message);
    } finally {
      setSuggBusy(false);
    }
  }

  async function addSuggestions() {
    const chosen = suggestions.filter((s) => picked[s.uri]);
    if (!chosen.length) return;
    setSuggBusy(true); setSuggMsg(t("analyzing"));
    try {
      const enriched = await enrichTags(chosen.map((tk) => ({ ...tk, source: "sugestão" })));
      const p = await joinRole(role.id, SUGG_NAME);
      await addTracks(role.id, p.id, enriched);
      setSuggestions((prev) => prev.filter((s) => !picked[s.uri]));
      setPicked({}); setSuggMsg(t("sugg_added", chosen.length));
      onRefresh();
    } catch (e) {
      setSuggMsg("⚠️ " + e.message);
    } finally {
      setSuggBusy(false);
    }
  }

  if (!data.participants.length) {
    return (
      <div className="card center">
        <p className="muted">{t("empty_blend")}</p>
      </div>
    );
  }
  if (!result) return null;

  const { order, metrics } = result;
  const top = metrics.active.slice().sort((a, b) => metrics.counts[b.id] - metrics.counts[a.id])[0];
  const topShare = top ? metrics.counts[top.id] / metrics.total : 0;
  const pickedCount = Object.values(picked).filter(Boolean).length;

  async function exportSpotify() {
    if (!sp.isLoggedIn()) { sp.login(); return; }
    setExportingWhich("spotify"); setErr(""); setLink("");
    try {
      const uris = order.map((tk) => tk.uri).filter((u) => u.startsWith("spotify:"));
      if (!uris.length) { setErr(t("no_sp_tracks")); return; }
      const url = await sp.createPlaylist(
        `Playlist da Galera — ${role.name}`,
        uris,
        `Playlist da Galera · ${metrics.active.length} 🎧`
      );
      setLink(url); setLinkKind("spotify");
    } catch (e) {
      setErr(e.message);
    } finally {
      setExportingWhich(null);
    }
  }

  async function exportYouTube() {
    setExportingWhich("youtube"); setErr(""); setExportMsg(""); setLink("");
    try {
      const cache = await getYtCache(order.map((tk) => tk.uri));
      const { url, resolved } = await yt.createPlaylist(
        `Playlist da Galera — ${role.name}`,
        order,
        "Playlist da Galera 🎧",
        (i, n) => setExportMsg(t("yt_progress", i, n)),
        cache
      );
      if (resolved && Object.keys(resolved).length) saveYtCache(resolved).catch(() => {});
      setLink(url); setLinkKind("youtube");
    } catch (e) {
      const msg = e.message === "quota" ? t("yt_quota") : e.message === "no-clips" ? t("yt_noclips") : e.message;
      setErr(msg);
    } finally {
      setExportingWhich(null); setExportMsg("");
    }
  }

  async function openPlayer() {
    setPreparing(true); setErr("");
    try {
      const { tracks: resolved, quota } = await getVideoIds(order);
      const playable = resolved.filter((tk) => tk.videoId);
      if (!playable.length) { setErr(quota ? t("yt_quota") : t("no_videos")); return; }
      // achou algumas, mas a cota de busca estourou no meio: toca o que dá e explica
      if (quota) setErr(t("yt_quota_partial", playable.length));
      setPlayerTracks(playable);
    } catch (e) {
      setErr(e.message);
    } finally {
      setPreparing(false);
    }
  }

  return (
    <div className="card">
      {playerTracks && <Player tracks={playerTracks} onClose={() => setPlayerTracks(null)} />}
      <div className="queue-head">
        <h2>{t("the_playlist")}</h2>
        <div className="actions">
          <button className="btn sm" onClick={openPlayer} disabled={preparing}>{preparing ? t("preparing") : t("play_btn")}</button>
          <button className="btn ghost sm" onClick={onRefresh}>{t("refresh")}</button>
          <button className="btn ghost sm" onClick={regen}>{t("reshuffle")}</button>
          <button className={"btn sm" + (enrichOpen ? "" : " ghost")} onClick={() => setEnrichOpen((v) => !v)}>{t("enrich")}</button>
          <button className="btn sm expsp" onClick={() => (sp.isLoggedIn() ? exportSpotify() : setBetaMsg("spotify"))} disabled={!!exportingWhich}>
            {exportingWhich === "spotify" ? t("creating") : <>🎧 Spotify<sup className="betatag">{t("beta_tag")}</sup></>}
          </button>
          {youtubeReady && (
            <button className="btn sm expyt" onClick={() => (yt.isLoggedIn() ? exportYouTube() : setBetaMsg("youtube"))} disabled={!!exportingWhich}>
              {exportingWhich === "youtube" ? t("creating") : <>📺 YouTube<sup className="betatag">{t("beta_tag")}</sup></>}
            </button>
          )}
        </div>
      </div>

      {link && (
        <a className="banner ok" href={link} target="_blank" rel="noreferrer">
          {linkKind === "youtube" ? t("yt_created") : t("pl_created")}
        </a>
      )}
      {exportingWhich && exportMsg && <p className="muted">{exportMsg}</p>}
      {err && <p className="err">{err}</p>}

      {betaMsg && (
        <div className="flag">
          {betaMsg === "spotify" ? t("beta_spotify") : t("beta_youtube")}
          <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn sm ghost" onClick={() => {
              const which = betaMsg; setBetaMsg(null);
              if (which === "spotify") sp.login();
              else yt.login().then(() => exportYouTube()).catch((e) => setErr(e.message));
            }}>{t("beta_connect")}</button>
            <button className="btn sm" onClick={() => { setBetaMsg(null); openPlayer(); }}>{t("beta_dismiss")}</button>
          </div>
        </div>
      )}

      <div className="stats">
        <div className={"stat score" + (metrics.flow < 55 ? " low" : metrics.flow < 78 ? " mid" : "")}>
          <div className="k">{t("flow_label")}</div>
          <div className="v">{metrics.flow}</div>
          <div className="sub">{metrics.flow >= 78 ? t("flow_hi") : metrics.flow >= 55 ? t("flow_mid") : t("flow_low")}</div>
        </div>
        <div className={"stat score" + (metrics.score < 55 ? " low" : metrics.score < 78 ? " mid" : "")}>
          <div className="k">{t("anti_label")}</div>
          <div className="v">{metrics.score}</div>
          <div className="sub">{t("anti_sub", metrics.active.length, metrics.anchorCount, metrics.hinos)}</div>
        </div>
      </div>

      {enrichOpen && (
        <div className="enrich">
          <p className="eyebrow" style={{ margin: "0 0 10px" }}>{t("enrich_title")}</p>
          <div className="vibepick">
            {VIBES.map((vb) => (
              <button key={vb.key} className={enrichVibe?.key === vb.key ? "on" : ""}
                onClick={() => findSuggestions(vb)} disabled={suggBusy}>
                {vb.e} {VIBE_LABELS[lang][vb.key]}
              </button>
            ))}
          </div>
          {suggMsg && <p className="muted" style={{ margin: "10px 0 0" }}>{suggBusy ? "⏳ " : ""}{suggMsg}</p>}
          {suggestions.length > 0 && (
            <>
              <div className="tracklist" style={{ marginTop: 12 }}>
                {suggestions.map((s) => (
                  <TrackRow key={s.uri} t={s} on={!!picked[s.uri]}
                    onClick={() => setPicked((p) => ({ ...p, [s.uri]: !p[s.uri] }))} />
                ))}
              </div>
              <button className="btn wide" onClick={addSuggestions} disabled={suggBusy || !pickedCount}>
                {t("add_sugg", pickedCount)}
              </button>
            </>
          )}
        </div>
      )}

      {top && metrics.active.length > 1 && (
        <div className={"flag" + (topShare <= 0.45 ? " ok" : "")}>
          {topShare > 0.45 ? t("dominating", top.display_name, Math.round(topShare * 100)) : t("democratic")}
        </div>
      )}

      <div className="queue">
        {order.map((tk, i) => {
          const v = vibeOf(tk.mood);
          return (
            <div className={"track" + (tk.anchor ? " anchor" : "")} key={tk.uri + i}>
              <div className="num">{i + 1}</div>
              {tk.art ? <img src={tk.art} className="art" alt="" /> : <span className="art ph" />}
              <div className="info">
                <div className="tt">{tk.title}{tk.hino && <span className="hino" title={t("hino_tip")}> 🔥</span>}</div>
                <div className="aa">
                  {tk.artist}
                  <span className="vibe" style={{ color: v.color, borderColor: v.color }}>{v.e} {VIBE_LABELS[lang][v.key]}</span>
                </div>
              </div>
              <div className="who">
                {tk.anchor ? <span className="pill">{t("everyone")}</span> : tk.ownerNames[0]}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- tema ---------------- */
function ThemeToggle() {
  function toggle() {
    const cur = document.documentElement.getAttribute("data-theme");
    const isDark = cur ? cur === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    const next = isDark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("pdg_theme", next); } catch {}
  }
  useEffect(() => {
    try {
      const s = localStorage.getItem("pdg_theme");
      if (s) document.documentElement.setAttribute("data-theme", s);
    } catch {}
  }, []);
  return <button className="theme-btn" onClick={toggle} aria-label="Tema">◑</button>;
}
