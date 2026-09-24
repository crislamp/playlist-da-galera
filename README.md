# 🎧 Playlist da Galera

> Junta o gosto de todo mundo do rolê numa playlist só — com justiça e fluxo de DJ.

**▶️ Ao vivo:** [playlist-da-galera.vercel.app](https://playlist-da-galera.vercel.app)

A gente nunca reclama da música — reclama que a playlist não é *nossa*. Este é um
appzinho (side project) que resolve isso: cada pessoa joga as músicas que curte, e o
app monta **um set só**, sem ninguém monopolizar o som e sem pular de uma balada
chorosa direto pro pancadão.

*PT/EN · funciona no celular · dá pra instalar (PWA).*

---

## ✨ O que ele faz

- **Todo mundo contribui — sem login.** Busca a música e adiciona, ou cola uma
  **playlist pública do YouTube/YT Music**. (quem tiver Spotify pode conectar pra
  puxar as mais ouvidas — opcional)
- **Blend justo:** cada pessoa tem o mesmo espaço, nunca duas da mesma em seguida,
  e as músicas que 2+ curtem viram **âncoras** ("todos curtem").
- **Fluxo de fim de festa:** o app entende o **clima** de cada faixa (via tags do
  Last.fm) e ordena numa **rampa** — começa chill e sobe até os hinos no fim. Nada
  de Lana Del Rey emendada num pancadão. 😅
- **🔥 Hinos** marcados (por nº de ouvintes) e **✨ sugestões** de músicas novas por vibe.
- **▶️ Toca no próprio app** (clipes do YouTube, sem login — e dá pra jogar na TV).
- **Exporta** pro Spotify ou YouTube da sua conta *(beta — ver limites abaixo)*.

## 🧠 Como o blend funciona

O coração está em [`src/lib/blend.js`](./src/lib/blend.js):

1. **Dedupe + âncoras** — músicas repetidas viram consenso.
2. **Clima (mood 0–100)** — cada faixa ganha uma nota a partir das tags de gênero/mood.
3. **Conectividade** — usa artistas similares (Last.fm) pra escolher faixas que
   "conversam" e dividir por pessoa com justiça.
4. **Arco exponencial** — ordena mirando uma rampa que explode no fim, encostando
   faixas parecidas (transições suaves) e puxando os hinos pro final.

> Curiosidade: o Spotify aposentou *audio-features* e *recommendations* (2024–2026),
> então a "energia" e as similaridades vêm do **Last.fm**, não do Spotify.

## 🛠️ Stack

- **Front:** React + Vite (deploy na Vercel), PWA
- **Backend:** Supabase (Postgres + 1 Edge Function)
- **APIs:** Spotify (login PKCE + busca via client-credentials), Last.fm (vibe),
  YouTube Data API (importar playlist, resolver clipes, player embed)

---

## ⚙️ Rodar localmente

Precisa de contas grátis: Spotify Developer, Supabase, Last.fm API e Google Cloud (YouTube).

```bash
npm install
cp .env.example .env   # preencha as chaves
npm run dev            # abre em http://127.0.0.1:5173
```

**`.env`** (todas são públicas — usadas no navegador):
```
VITE_SPOTIFY_CLIENT_ID=...     # Spotify Dashboard → seu app → Settings
VITE_SUPABASE_URL=...          # Supabase → Project Settings → API
VITE_SUPABASE_ANON_KEY=...     # idem (anon public)
VITE_RESOLVE_FN=...            # slug da Edge Function (ex: swift-responder)
VITE_GOOGLE_CLIENT_ID=...      # Google Cloud → OAuth Client (só p/ export YouTube)
```

**Banco (Supabase → SQL Editor):** rode, em ordem,
[`supabase-schema.sql`](./supabase-schema.sql), [`migration-v2.sql`](./migration-v2.sql),
[`migration-v3.sql`](./migration-v3.sql) e [`migration-v5.sql`](./migration-v5.sql).

**Edge Function** ([`supabase/functions/swift-responder`](./supabase/functions/swift-responder/index.ts)):
publique e configure os secrets `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`,
`LASTFM_API_KEY`, `YT_API_KEY`. (o Redirect URI do Spotify e a Origem JS do Google
precisam bater com a sua URL, incl. `http://127.0.0.1:5173`.)

## 🗺️ Mapa do código

- [`src/App.jsx`](./src/App.jsx) — telas, i18n (PT/EN), player, blend na UI
- [`src/lib/blend.js`](./src/lib/blend.js) — o algoritmo do blend (justiça + arco)
- [`src/lib/spotify.js`](./src/lib/spotify.js) — login PKCE, top tracks, busca, criar playlist
- [`src/lib/youtube.js`](./src/lib/youtube.js) — player e criar playlist no YouTube
- [`src/lib/supabase.js`](./src/lib/supabase.js) — rolês, faixas, cache, chamadas à função
- [`supabase/functions/swift-responder`](./supabase/functions/swift-responder/index.ts) — busca Spotify, tags Last.fm, YouTube

## ⚠️ Limites conhecidos (regras das plataformas em 2026)

- **Spotify:** modo dev exige **Premium** na conta dona e libera **login só p/ ~5 contas**.
  Por isso a galera **contribui sem login** (busca via client-credentials), e criar
  playlist no Spotify fica **beta**.
- **YouTube:** cota de **10.000 unidades/dia** (compartilhada). O player usa **cache**
  pra não gastar à toa; criar playlist grande consome bastante.
- **Ouvir no app é ilimitado** (player embed) — é o caminho recomendado pra todos.

---

Feito de brincadeira, num fim de semana — em conversa com uma IA (vibe coding). 💜
