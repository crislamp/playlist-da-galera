// ------------------------------------------------------------------
// O blend: junta as músicas de todo mundo com JUSTIÇA e FLUIDEZ.
//  - fluidez (prioridade): ordena o set como uma jornada de clima
//    (chill → sobe → pico → desce) usando o gênero, pra não pular de
//    Lana del Rey pra Thiaguinho no talo.
//  - justiça (2º plano): evita blocão de uma pessoa só / repetição.
//  - âncoras: músicas que 2+ pessoas curtem entram no fluxo normal,
//    mas marcadas como "todos curtem".
//  - dedupe: a mesma faixa não repete.
// (o Spotify aposentou o Audio Features, então o clima vem do gênero —
//  aproximação, mas resolve o tranco de vibe.)
// ------------------------------------------------------------------

// gênero -> nota de vibe (0 = chill, 100 = pico de pista)
const MOOD_MAP = [
  // baixo / melancólico / acústico
  ["ambient", 12], ["sleep", 10], ["classical", 15], ["piano", 20], ["lo-fi", 22],
  ["lofi", 22], ["chillhop", 28], ["acoustic", 28], ["folk", 30], ["singer-songwriter", 30],
  ["sad", 22], ["slowcore", 20], ["shoegaze", 32], ["dream pop", 35], ["bossa", 32],
  ["jazz", 33], ["soul", 40], ["r&b", 42], ["r&b", 42], ["neo soul", 40], ["mpb", 42],
  // médio
  ["indie", 48], ["art pop", 46], ["synthpop", 55], ["indietronica", 55], ["pop", 52],
  ["alt z", 50], ["alternative", 55], ["rock", 58], ["pop rock", 58], ["emo", 52],
  // médio-alto
  ["hip hop", 62], ["rap", 62], ["trap", 66], ["drill", 66], ["grunge", 60],
  ["punk", 68], ["metal", 66], ["indie rock", 58],
  // festa
  ["reggaeton", 74], ["latin", 72], ["samba", 60], ["pagode", 76], ["sertanejo", 74],
  ["forró", 74], ["forro", 74], ["axé", 80], ["axe", 80], ["brega", 74], ["piseiro", 76],
  ["arrocha", 72], ["funk carioca", 82], ["baile funk", 84], ["brazilian funk", 82],
  ["funk", 80], ["afrobeat", 70], ["dancehall", 74], ["k-pop", 68],
  // pico / pista
  ["dance", 86], ["house", 88], ["techno", 90], ["tech house", 90], ["electro", 86],
  ["edm", 90], ["eletr", 88], ["electronic", 84], ["drum and bass", 92], ["dnb", 92],
  ["dubstep", 90], ["rave", 94], ["trance", 90], ["baile", 84], ["hardstyle", 96],
  // tags de mood do Last.fm (artista e música)
  ["chillout", 20], ["chill out", 20], ["chill", 24], ["mellow", 26], ["calm", 20],
  ["relax", 22], ["melancholic", 24], ["melancholy", 24], ["moody", 30], ["sad", 20],
  ["heartbreak", 20], ["heartbroken", 18], ["breakup", 22], ["emotional", 28],
  ["ballad", 28], ["soft", 28], ["dreamy", 32], ["nostalgic", 34], ["bittersweet", 30],
  ["feel good", 62], ["happy", 60], ["fun", 66], ["upbeat", 70], ["energetic", 74],
  ["party", 82], ["dancing", 80], ["summer", 66], ["romantic", 40],
];

export function moodScore(genreStr) {
  if (!genreStr) return 50; // desconhecido = meio-termo
  const tags = genreStr.toLowerCase().split(";").map((s) => s.trim()).filter(Boolean);
  if (!tags.length) return 50;
  let wsum = 0, wtot = 0;
  tags.forEach((tag, idx) => {
    // nota do tag = média das chaves que casam com ELE (conta o tag uma vez só)
    let s = 0, c = 0;
    for (const [kw, val] of MOOD_MAP) if (tag.includes(kw)) { s += val; c++; }
    if (!c) return; // tag sem correspondência: ignora
    const weight = 1 / (idx + 1); // tags mais relevantes (primeiras) pesam mais
    wsum += (s / c) * weight;
    wtot += weight;
  });
  return wtot ? wsum / wtot : 50;
}

// arco de clima ao longo do set (t em [0,1]) -> nota alvo
// rampa EXPONENCIAL entre o clima mais baixo e o mais alto DO CONJUNTO:
// começa chill, segura, e explode no fim (fim de festa = o mais animado que tiver)
function arcTarget(t, lo, hi) {
  return lo + (hi - lo) * Math.pow(t, 1.8);
}

export function buildBlend(participants, tracks) {
  const nameById = {};
  participants.forEach((p) => (nameById[p.id] = p.display_name));

  // dedupe por uri (acha âncoras)
  const byUri = new Map();
  tracks.forEach((t) => {
    if (!byUri.has(t.uri)) byUri.set(t.uri, { ...t, owners: new Set([t.participant_id]) });
    else byUri.get(t.uri).owners.add(t.participant_id);
  });

  const firstArt = (s) => (s || "").split(",")[0].trim().toLowerCase();
  const pool = [];
  for (const item of byUri.values()) {
    const owners = [...item.owners];
    pool.push({
      uri: item.uri,
      title: item.title,
      artist: item.artist,
      art: item.art,
      genre: item.genre || "",
      mood: moodScore(item.genre),
      ownArtist: firstArt(item.artist),
      similarSet: new Set(
        String(item.similar || "").split(";").map((x) => x.trim().toLowerCase()).filter(Boolean)
      ),
      listeners: Number(item.listeners) || 0,
      ownerIds: owners,
      ownerNames: owners.map((id) => nameById[id]).filter(Boolean),
      anchor: owners.length >= 2,
    });
  }
  if (!pool.length) return { order: [], metrics: metrics(participants, []) };

  // popularidade relativa (escala log) + marca os "hinos" do rolê
  const logs = pool.map((s) => Math.log10((s.listeners || 0) + 1));
  const maxLog = Math.max(1, ...logs);
  pool.forEach((s, i) => {
    s.relPop = logs[i] / maxLog;
    s.hino = s.relPop >= 0.85 && s.listeners > 0;
  });

  // conectividade: quantas OUTRAS faixas são parecidas (artista em similar)
  for (const s of pool) {
    let conn = 0;
    for (const o of pool) {
      if (o === s) continue;
      if (s.similarSet.has(o.ownArtist) || o.similarSet.has(s.ownArtist)) conn++;
    }
    s.conn = conn;
  }

  // DIVISÃO IGUAL: mantém as âncoras (consenso — todo mundo curte) e divide o
  // resto por pessoa, escolhendo as faixas mais conectáveis (melhores transições).
  const nActive = new Set(pool.map((s) => s.ownerIds[0])).size || 1;
  const perPerson = Math.max(6, Math.ceil(100 / nActive));

  const anchors = pool.filter((s) => s.anchor).sort((a, b) => (b.conn - a.conn) || (b.relPop - a.relPop));
  let work = anchors.slice(0, Math.max(6, perPerson)); // teto de âncoras

  const byOwner = {};
  pool.filter((s) => !s.anchor).forEach((s) => { const o = s.ownerIds[0]; (byOwner[o] ||= []).push(s); });
  for (const list of Object.values(byOwner)) {
    list.sort((a, b) => (b.conn - a.conn) || (b.relPop - a.relPop));
    work.push(...list.slice(0, perPerson));
  }

  const N = work.length;
  const remaining = {};
  work.forEach((s) => s.ownerIds.forEach((o) => (remaining[o] = (remaining[o] || 0) + 1)));

  // teto/piso reais de clima do conjunto -> o arco mira o que existe de fato
  const moods = work.map((s) => s.mood);
  const loMood = Math.min(...moods);
  const hiMood = Math.max(...moods);

  const result = [];
  let lastOwner = null;
  let lastArtist = null;
  let lastSimilar = null;

  for (let pos = 0; pos < N; pos++) {
    const t = N > 1 ? pos / (N - 1) : 0.5;
    const target = arcTarget(t, loMood, hiMood);
    let best = -1, bestScore = -Infinity;
    for (let i = 0; i < work.length; i++) {
      const s = work[i];
      const owner = s.ownerIds[0];
      let score = 0;
      score -= Math.abs(s.mood - target) * 2.2;          // FLUIDEZ: clima perto do alvo
      // transição suave: artista parecido com a faixa anterior (getSimilar)
      if (lastArtist && (s.similarSet.has(lastArtist) || (lastSimilar && lastSimilar.has(s.ownArtist)))) score += 22;
      if (owner === lastOwner) score -= 55;              // justiça: não repete pessoa
      if (s.ownArtist && s.ownArtist === lastArtist) score -= 30; // nem o mesmo artista
      score += (remaining[owner] || 0) * 2;              // dá vez a quem tem mais
      score += s.relPop * (2 + 12 * t);                  // famosos/hinos puxados pro FIM (fim de festa)
      if (s.anchor) score += 4;                          // carinho pras âncoras
      score += Math.random() * 4;                        // variação a cada rearranjo
      if (score > bestScore) { bestScore = score; best = i; }
    }
    const chosen = work.splice(best, 1)[0];
    chosen.ownerIds.forEach((o) => remaining[o]--);
    lastOwner = chosen.ownerIds[0];
    lastArtist = chosen.ownArtist || null;
    lastSimilar = chosen.similarSet;
    result.push(chosen);
  }

  return { order: result, metrics: metrics(participants, result) };
}

function metrics(participants, order) {
  const counts = {};
  participants.forEach((p) => (counts[p.id] = 0));
  order.forEach((t) => t.ownerIds.forEach((id) => (counts[id] != null ? counts[id]++ : null)));

  const active = participants.filter((p) => counts[p.id] > 0);
  const n = order.length;
  const anchorCount = order.filter((t) => t.anchor).length;

  // justiça: back-to-back + equilíbrio
  let clumps = 0;
  for (let i = 1; i < order.length; i++) {
    const a = order[i - 1].ownerIds, b = order[i].ownerIds;
    if (a.length === 1 && b.length === 1 && a[0] === b[0]) clumps++;
  }
  let balance = 100;
  if (active.length > 1 && n > 0) {
    const ideal = n / active.length;
    let dev = 0;
    active.forEach((p) => (dev += Math.abs(counts[p.id] - ideal)));
    balance = Math.max(0, 100 - (dev / n) * 100);
  } else if (active.length <= 1) balance = active.length === 1 ? 30 : 0;
  const clumpPenalty = n > 1 ? (clumps / (n - 1)) * 100 : 0;
  const score = Math.round(Math.max(0, balance * 0.7 + (100 - clumpPenalty) * 0.3));

  // fluidez: transições suaves de clima + faixas vizinhas parecidas (getSimilar)
  let jump = 0, links = 0;
  for (let i = 1; i < order.length; i++) {
    jump += Math.abs(order[i].mood - order[i - 1].mood);
    const a = order[i - 1], b = order[i];
    if (a.similarSet && b.similarSet && (a.similarSet.has(b.ownArtist) || b.similarSet.has(a.ownArtist))) links++;
  }
  const avgJump = n > 1 ? jump / (n - 1) : 0;
  const linkRatio = n > 1 ? links / (n - 1) : 0;
  const flow = Math.round(Math.max(0, Math.min(100, (100 - avgJump * 2.2) + linkRatio * 20)));

  const hinos = order.filter((t) => t.hino).length;

  return { counts, active, score, flow, anchorCount, hinos, total: n };
}
