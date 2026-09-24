# 🎧 Playlist da Galera

Junta o Spotify de todo mundo do rolê numa playlist só, **com justiça**.
Cada pessoa conecta o Spotify, o app pega as músicas que ela mais ouve
(+ as que ela quiser adicionar na mão), mistura tudo sem deixar ninguém
monopolizar o som, e cria a playlist direto no Spotify de vocês.

- **Multi-celular:** cada um entra do próprio aparelho pelo link do rolê.
- **Blend justo:** nunca duas músicas da mesma pessoa em seguida; quem tem
  mais música ganha mais espaço, sem dominar; músicas que 2+ pessoas curtem
  viram "âncoras" espalhadas pelo set.
- **Exporta pro Spotify** (nativo). YouTube Music fica pra depois (não tem
  API pública de escrita — daria só lista/links).

---

## ✅ Checklist de setup (uma vez só)

### 0. Instalar o Node (na sua máquina)
Ainda não tem `node`/`npm`. No terminal:
```bash
brew install node
```

### 1. Spotify Developer (pega o Client ID)
1. Entre em **https://developer.spotify.com/dashboard** com o Spotify de vocês.
2. **Create app**. Preencha nome/descrição (qualquer coisa).
3. Em **Redirect URIs**, adicione EXATAMENTE estes dois:
   - `http://127.0.0.1:5173/callback`  ← dev local (use `127.0.0.1`, **não** `localhost`)
   - `https://SEU-APP.vercel.app/callback`  ← só depois que publicar (pode adicionar já)
4. Em **APIs used**, marque **Web API**. Salve.
5. Abra o app criado → **Settings** → copie o **Client ID**.
6. **Users and Access** (Dev Mode = até 25 pessoas): adicione **nome + email
   do Spotify** de cada amigo que vai usar. *Sem isso o login deles falha.*

### 2. Supabase (backend)
1. Entre em **https://supabase.com** → **New project** (plano free serve).
2. Espere provisionar. Vá em **SQL Editor** → cole o conteúdo de
   [`supabase-schema.sql`](./supabase-schema.sql) → **Run**.
3. Vá em **Project Settings → API** e copie:
   - **Project URL**
   - **anon public** key

### 3. Ligar as chaves no projeto
```bash
cd ~/playlist-da-galera
cp .env.example .env
```
Abra o `.env` e cole:
```
VITE_SPOTIFY_CLIENT_ID=...        # passo 1.5
VITE_SUPABASE_URL=...             # passo 2.3
VITE_SUPABASE_ANON_KEY=...        # passo 2.3
```

### 4. Rodar
```bash
npm install
npm run dev
```
Abra **http://127.0.0.1:5173** (use `127.0.0.1`, casa com o Redirect URI).

---

## 🚀 Publicar (pra galera acessar de qualquer lugar)
1. Suba a pasta num repo do GitHub.
2. Em **vercel.com** → **Import** o repo.
3. Em **Environment Variables**, coloque as mesmas 3 chaves do `.env`.
4. Deploy. Pegue a URL (`https://SEU-APP.vercel.app`).
5. Volte no Spotify Dashboard e confirme o Redirect URI
   `https://SEU-APP.vercel.app/callback`.

---

## 🧠 Como funciona (mapa rápido)
- [`src/lib/spotify.js`](./src/lib/spotify.js) — login PKCE + top tracks + busca + criar playlist.
- [`src/lib/supabase.js`](./src/lib/supabase.js) — rolês e músicas de cada um.
- [`src/lib/blend.js`](./src/lib/blend.js) — o algoritmo do blend justo.
- [`src/App.jsx`](./src/App.jsx) — as telas (criar/entrar, conectar, escolher, gerar).

## 🔁 Modelo atual (v2 — importar playlist)

A galera **não faz login**: cada um cola o link de uma playlist **pública** do
Spotify, e o app lê as faixas via uma Edge Function (Client Credentials do
próprio app). Só **você** (dona) loga — e só na hora de **criar** a playlist
final. Assim o teto de 5 usuários do Spotify não se aplica.

Setup extra do v2 (uma vez):
1. **Spotify Premium na conta dona** — desde fev/2026 o Spotify exige isso pra a
   Web API funcionar. Sem Premium, dá 403.
2. **Migração do banco:** rode [`migration-v2.sql`](./migration-v2.sql) no SQL
   Editor do Supabase.
3. **Edge Function:** publique [`supabase/functions/resolve-spotify-playlist`](./supabase/functions/resolve-spotify-playlist/index.ts)
   e configure os secrets `SPOTIFY_CLIENT_ID` e `SPOTIFY_CLIENT_SECRET`
   (o *client secret* fica em **Settings → View client secret** no dashboard do
   Spotify — ele nunca vai pro front).
   - Via CLI: `supabase functions deploy resolve-spotify-playlist`
   - Ou pelo dashboard do Supabase (Edge Functions → criar → colar o código),
     e em **Edge Functions → Secrets** adicione os dois valores.

## ⚠️ Limites conhecidos (regras atuais do Spotify)
- **Dono do app precisa de Premium** (fev/2026), senão a API dá 403.
- **Dev Mode = até 5 pessoas que fazem LOGIN.** Como aqui a galera só cola link
  (não loga), isso não limita o rolê — só você loga.
- **Recommendations** e **Audio Features** aposentados — por isso o blend usa as
  músicas reais das playlists e a fluidez do set vem do **gênero** (não de
  energia/BPM automáticos).
- Playlists importadas precisam estar **públicas**.
