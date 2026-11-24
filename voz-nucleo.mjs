/* Limpeza da voz (roda no próprio aparelho, sem servidor): recebe a gravação crua (mono, 48 kHz) e devolve a voz
   limpa, com o MESMO tempo.
   1. RNNoise (rede neural) tira ventilador, rua, chiado;  2. corta o eco da sala (cauda que fica depois de cada sílaba);
   3. abaixa o que sobra entre as frases;  4. equaliza;  5. nivela o volume, sem levantar o silêncio. */
const SR = 48000, QUADRO = 480;

function filtro(x, tipo, f, q, db = 0) {  // biquad (RBJ)
  const w = 2 * Math.PI * f / SR, c = Math.cos(w), al = Math.sin(w) / (2 * q), A = 10 ** (db / 40);
  let b0, b1, b2, a0, a1, a2;
  if (tipo === 'alta') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
  else { b0 = 1 + al * A; b1 = -2 * c; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * c; a2 = 1 - al / A; }
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let n = 0; n < x.length; n++) {
    const y = (b0 * x[n] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x[n]; y2 = y1; y1 = y; x[n] = y;
  }
}

/* RNNoise: quadros de 10 ms. "chance" = probabilidade de ser fala em cada quadro. */
function tirarRuido(x, rn, mistura) {
  const st = rn.createDenoiseState(), nq = Math.ceil(x.length / QUADRO) + 5;
  const y = new Float32Array(nq * QUADRO), chance = new Float32Array(nq), fr = new Float32Array(QUADRO);
  for (let k = 0; k < nq; k++) {
    for (let n = 0; n < QUADRO; n++) fr[n] = (x[k * QUADRO + n] || 0) * 32768;
    chance[k] = st.processFrame(fr);
    for (let n = 0; n < QUADRO; n++) y[k * QUADRO + n] = fr[n] / 32768;
  }
  st.destroy();
  const atraso = medirAtraso(x, y);  // a rede devolve o som um pouco atrasado: acerta para a boca bater com a voz
  const out = new Float32Array(x.length);
  for (let n = 0; n < x.length; n++) out[n] = mistura * (y[n + atraso] || 0) + (1 - mistura) * x[n];
  return {out, chance, desloc: Math.round(atraso / QUADRO)};
}
function medirAtraso(x, y) {
  let melhor = 0, maior = 0;
  const passo = Math.max(1, Math.floor(x.length / 60000));
  for (let d = 0; d <= 1920; d++) {
    let s = 0;
    for (let n = 0; n + d < y.length && n < x.length; n += passo) s += x[n] * y[n + d];
    if (s > maior) { maior = s; melhor = d; }
  }
  return melhor;
}

function fft(re, im) {
  const N = re.length;
  for (let i = 1, j = 0; i < N; i++) {
    let b = N >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let L = 2; L <= N; L <<= 1) {
    const a = -2 * Math.PI / L, cr = Math.cos(a), ci = Math.sin(a), h = L >> 1;
    for (let i = 0; i < N; i += L) {
      let wr = 1, wi = 0;
      for (let k = i; k < i + h; k++) {
        const ur = re[k + h] * wr - im[k + h] * wi, ui = re[k + h] * wi + im[k + h] * wr;
        re[k + h] = re[k] - ur; im[k + h] = im[k] - ui; re[k] += ur; im[k] += ui;
        const t = wr * cr - wi * ci; wi = wr * ci + wi * cr; wr = t;
      }
    }
  }
}
/* Eco da sala: o que se ouve agora é a voz de agora + um resto do que foi dito há 50 ms (que morre aos poucos).
   Estima esse resto em cada faixa de frequência e desconta. */
function tirarEco(x, t60, forca, piso) {
  const N = 1024, P = 256, M = N / 2 + 1, L = Math.round(0.05 * SR / P);
  const jan = new Float32Array(N); for (let n = 0; n < N; n++) jan[n] = Math.sqrt(0.5 - 0.5 * Math.cos(2 * Math.PI * n / N));
  const cai = 10 ** (-6 * 0.05 / t60), hist = Array.from({length: L}, () => new Float32Array(M));
  const suave = new Float32Array(M), g = new Float32Array(M).fill(1), out = new Float32Array(x.length);
  const re = new Float32Array(N), im = new Float32Array(N), alfa = 0.75;
  let q = 0;
  for (let i = -N + P; i < x.length; i += P) {
    for (let n = 0; n < N; n++) { re[n] = (x[i + n] || 0) * jan[n]; im[n] = 0; }
    fft(re, im);
    const velho = hist[q % L];
    for (let k = 0; k < M; k++) {
      const p = re[k] * re[k] + im[k] * im[k];
      const resto = forca * cai * velho[k];  // eco que sobrou de 50 ms atrás
      suave[k] = alfa * suave[k] + (1 - alfa) * p;
      velho[k] = suave[k];
      const pa = 0.5 * p + 0.5 * suave[k] + 1e-12;
      const alvo = Math.max(piso, Math.sqrt(Math.max(0, 1 - resto / pa)));
      g[k] = alvo > g[k] ? 0.3 * g[k] + 0.7 * alvo : 0.6 * g[k] + 0.4 * alvo;  // abre rápido (não come o começo das sílabas)
    }
    q++;
    for (let k = 0; k < M; k++) {
      const v = (g[Math.max(0, k - 1)] + 2 * g[k] + g[Math.min(M - 1, k + 1)]) / 4;
      re[k] *= v; im[k] *= v;
      if (k && k < M - 1) { re[N - k] = re[k]; im[N - k] = -im[k]; }
    }
    for (let k = 0; k < N; k++) im[k] = -im[k];  // volta para o tempo (conjugado)
    fft(re, im);
    for (let n = 0; n < N; n++) if (i + n >= 0 && i + n < x.length) out[i + n] += re[n] / N * jan[n] * 0.5;
  }
  return out;
}

/* entre as frases, desce o volume devagar (porta suave, sem cortar seco) */
function porta(x, chance, desloc, minimo) {
  const nq = Math.ceil(x.length / QUADRO), alvo = new Float32Array(nq);
  for (let k = 0; k < nq; k++) {
    let m = 0;  // abre 60 ms antes da fala e segura 150 ms depois
    for (let d = -15; d <= 6; d++) m = Math.max(m, chance[k + desloc + d] || 0);
    alvo[k] = m > 0.5 ? 1 : minimo + (1 - minimo) * m;
  }
  let g = minimo;
  for (let n = 0; n < x.length; n++) {
    const a = alvo[Math.floor(n / QUADRO)];
    g += (a - g) * (a > g ? 0.002 : 0.0004);
    x[n] *= g;
  }
}

/* leva a fala para um volume só e segura os picos, olhando 5 ms à frente */
function nivelar(x, chance, desloc) {
  const nq = Math.ceil(x.length / QUADRO), e = [];
  for (let k = 0; k < nq; k++) {
    let s = 0; for (let n = k * QUADRO; n < Math.min(x.length, (k + 1) * QUADRO); n++) s += x[n] * x[n];
    s /= QUADRO;
    if (s > 1e-8 && (chance[k + desloc] || 0) > 0.5) e.push(s);
  }
  if (!e.length) return;
  e.sort((a, b) => b - a);
  const top = e.slice(0, Math.ceil(e.length * 0.7));
  const ganho = Math.min(16, 0.14 / Math.sqrt(top.reduce((a, b) => a + b, 0) / top.length));
  // compressão leve só no que passa de −20 dB (2:1): fala mais parelha, silêncio igual
  let env = 0;
  for (let n = 0; n < x.length; n++) {
    x[n] *= ganho;
    const p = x[n] * x[n];
    env += (p - env) * (p > env ? 0.004 : 0.0002);
    x[n] *= 10 ** (-Math.max(0, 10 * Math.log10(env + 1e-12) + 20) * 0.5 / 20) * 1.25;
  }
  const ant = 240, teto = 0.9, pico = new Float32Array(Math.ceil(x.length / ant) + 2);
  for (let n = 0; n < x.length; n++) { const b = Math.floor(n / ant); pico[b] = Math.max(pico[b], Math.abs(x[n])); }
  let g = 1;
  for (let n = 0; n < x.length; n++) {
    const b = Math.floor(n / ant), alvo = Math.min(1, teto / Math.max(pico[b], pico[b + 1], 1e-9));
    g += (alvo - g) * (alvo < g ? 0.03 : 0.0002);
    x[n] = Math.max(-0.98, Math.min(0.98, x[n] * g));
  }
}

export const MODOS = {
  normal: {mistura: 0.97, t60: 0.5, eco: 1.0, pisoEco: 0.25, porta: 0.2},
  forte: {mistura: 1, t60: 0.7, eco: 1.6, pisoEco: 0.1, porta: 0.06},
};
export function limpar(x, rn, modo = 'normal') {
  const m = MODOS[modo] || MODOS.normal;
  x = Float32Array.from(x);
  filtro(x, 'alta', 75, 0.7);
  let pico = 0; for (const v of x) pico = Math.max(pico, Math.abs(v));
  if (pico > 0 && pico < 0.3) for (let n = 0; n < x.length; n++) x[n] *= 0.3 / pico;  // gravou baixinho: a rede entende melhor mais alto
  const r = tirarRuido(x, rn, m.mistura);
  const y = tirarEco(r.out, m.t60, m.eco, m.pisoEco);
  porta(y, r.chance, r.desloc, m.porta);
  filtro(y, 'pico', 280, 0.9, -2.5);   // tira o "dentro da caixa"
  filtro(y, 'pico', 3400, 0.9, 2.5);   // presença
  nivelar(y, r.chance, r.desloc);
  return y;
}
