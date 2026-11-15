/* Estúdio Delmão: grava aulas para o YouTube no computador.
   Slides do PDF (lidos da pasta do professor, sem sair do computador) + caneta + câmera no canto
   + compartilhar tela, tudo montado num canvas 1920×1080 que é gravado com o MediaRecorder. */
import * as pdfjs from './vendor/pdfjs/pdf.min.mjs';
import {desenharTraco, contorno, reconhecer, formaArrasto, novoId, limparCache} from './tinta.js';
pdfjs.GlobalWorkerOptions.workerSrc = './vendor/pdfjs/pdf.worker.min.mjs';

const W = 1920, H = 1080;
const NAVY = '#0F1B2D', LAR = '#FF7A00', CREME = '#FFF6E6';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const tela = $('#tela'), ctx = tela.getContext('2d');

/* ---------- preferências (só neste computador) ---------- */
const PREF_PADRAO = {cor: LAR, esp: 7, formato: 'ret', tam: 24, canto: 'id', pos: null, espelho: true, camvis: true,
  marcadagua: true, forma: 'reta', contorno: true, lembrar: false, voz: true, ruido: false, somtela: true, qualidade: '1080', cam: '', mic: '', faixa: true};
let pref = {...PREF_PADRAO};
try { Object.assign(pref, JSON.parse(localStorage.getItem('estudio-pref') || '{}')); } catch (e) {}
const salvarPref = () => { try { localStorage.setItem('estudio-pref', JSON.stringify(pref)); } catch (e) {} };

/* ---------- estado ---------- */
let cena = 'slide', ferr = 'caneta';
let aula = null, tipoAberto = null;   // aula = {grupo, base, aluno, professor, lista, outros}
let doc = null, docCola = null, pagina = 1, nPag = 0, qPag = 1;
const cache = new Map();               // página → ImageBitmap 1920×1080
const anot = new Map(), hist = new Map(); // chave → traços / desfazer
let laser = [];
let camFonte = null, telaFonte = null;
let camStream = null, micStream = null, telaStream = null;
const remotos = new Map(); // id do aparelho → {nome, tipo, stream, conn}
const ganchos = {};       // funções do estudio-remoto.js

/* ---------- utilidades ---------- */
const semAcento = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const fmt = ms => { const s = Math.floor(ms / 1000); return [s / 3600, s / 60 % 60, s % 60].map(v => String(Math.floor(v)).padStart(2, '0')).join(':'); };
function info(t) { $('#infogr').textContent = t || ''; }

/* IndexedDB mínimo para lembrar a pasta escolhida */
function idb() {
  return new Promise((ok, erro) => {
    const r = indexedDB.open('estudio', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => ok(r.result); r.onerror = () => erro(r.error);
  });
}
async function kv(chave, valor) {
  const db = await idb();
  return new Promise((ok, erro) => {
    const t = db.transaction('kv', valor === undefined ? 'readonly' : 'readwrite').objectStore('kv');
    const r = valor === undefined ? t.get(chave) : t.put(valor, chave);
    r.onsuccess = () => ok(r.result); r.onerror = () => erro(r.error);
  });
}

/* ---------- fonte de vídeo que continua viva com a aba em segundo plano ---------- */
function criarFonte(stream) {
  const track = stream.getVideoTracks()[0];
  const f = {track, frame: null, video: null, fim: false,
    get w() { return this.frame ? this.frame.displayWidth : (this.video?.videoWidth || 0); },
    get h() { return this.frame ? this.frame.displayHeight : (this.video?.videoHeight || 0); },
    get img() { return this.frame || (this.video?.readyState >= 2 ? this.video : null); },
    parar() { this.fim = true; if (this.frame) { this.frame.close(); this.frame = null; } }};
  if ('MediaStreamTrackProcessor' in window) {
    // lê os quadros direto da trilha: o <video> pararia quando a aba fica escondida (compartilhando outra janela)
    const leitor = new MediaStreamTrackProcessor({track}).readable.getReader();
    (async () => {
      while (!f.fim) {
        const {value, done} = await leitor.read().catch(() => ({done: true}));
        if (done) break;
        if (f.fim) { value.close(); break; }
        if (f.frame) f.frame.close();
        f.frame = value;
      }
    })();
  } else {
    f.video = Object.assign(document.createElement('video'), {muted: true, playsInline: true, srcObject: stream});
    f.video.play().catch(() => {});
  }
  return f;
}

/* =====================================================================
   LISTA DE AULAS (pasta do computador)
   ===================================================================== */
let grupos = new Map();
const RE_ARQ = /^(.*?) - (Aula \((Aluno|Professor)\)|Lista)\.pdf$/i;

function registrar(grupo, nome, abrir) {
  if (!/\.pdf$/i.test(nome)) return;
  const m = nome.match(RE_ARQ);
  const base = m ? m[1] : nome.replace(/\.pdf$/i, '');
  const tipo = m ? (m[3] ? m[3].toLowerCase() : 'lista') : 'pdf';
  if (!grupos.has(grupo)) grupos.set(grupo, new Map());
  const g = grupos.get(grupo);
  if (!g.has(base)) g.set(base, {grupo, base});
  g.get(base)[tipo] = abrir;
}

async function lerPasta(dir) {
  grupos = new Map();
  async function andar(d, nome, nivel) {
    for await (const [n, h] of d.entries()) {
      if (h.kind === 'file') registrar(nome, n, () => h.getFile());
      else if (nivel < 3 && !n.startsWith('.')) await andar(h, n, nivel + 1);
    }
  }
  await andar(dir, dir.name, 0);
  mostrarLista();
}

function lerArquivosSoltos(files) {
  grupos = new Map();
  for (const f of files) {
    const partes = (f.webkitRelativePath || f.name).split('/');
    registrar(partes.length > 1 ? partes[partes.length - 2] : 'Pasta', f.name, () => Promise.resolve(f));
  }
  mostrarLista();
}

function mostrarLista() {
  $('#vazio').classList.add('hide');
  $('#busca').classList.remove('hide');
  const filtro = semAcento($('#filtro').value.trim());
  const lista = $('#lista');
  lista.innerHTML = '';
  const nomes = [...grupos.keys()].sort((a, b) => a.localeCompare(b, 'pt', {numeric: true}));
  let total = 0;
  for (const nome of nomes) {
    const aulas = [...grupos.get(nome).values()]
      .filter(a => !filtro || semAcento(a.base + ' ' + nome).includes(filtro))
      .sort((a, b) => a.base.localeCompare(b.base, 'pt', {numeric: true}));
    if (!aulas.length) continue;
    total += aulas.length;
    const det = document.createElement('details');
    det.className = 'grupo';
    det.open = !!filtro || (aula && aula.grupo === nome);
    det.innerHTML = `<summary></summary>`;
    det.firstChild.textContent = nome + ' ';
    det.firstChild.insertAdjacentHTML('beforeend', `<small>(${aulas.length})</small>`);
    for (const a of aulas) {
      const div = document.createElement('div');
      div.className = 'aulaitem' + (aula && aula.grupo === a.grupo && aula.base === a.base ? ' atual' : '');
      div.textContent = a.base;
      const tipos = document.createElement('div');
      tipos.className = 'tipos';
      for (const [t, rot] of [['aluno', 'Aluno'], ['professor', 'Professor'], ['lista', 'Lista'], ['pdf', 'PDF']]) {
        if (!a[t]) continue;
        const b = document.createElement('button');
        b.textContent = rot;
        if (aula === a && tipoAberto === t) b.classList.add('on');
        b.onclick = ev => { ev.stopPropagation(); abrirAula(a, t); };
        tipos.append(b);
      }
      div.append(tipos);
      div.onclick = () => abrirAula(a, a.aluno ? 'aluno' : a.professor ? 'professor' : a.lista ? 'lista' : 'pdf');
      det.append(div);
    }
    lista.append(det);
  }
  if (!total) lista.innerHTML = '<div class="dica">Nenhuma aula encontrada' + (filtro ? ' com essa busca.' : ' nessa pasta. Escolha a pasta <b>Gerador de Aulas\\PDFs</b>.') + '</div>';
}

async function iniciarPasta() {
  if (!('showDirectoryPicker' in window)) return; // navegador sem acesso a pastas: usa o input
  try {
    if (!pref.lembrar) { await kv('pasta', null); return; }
    const h = await kv('pasta');
    if (!h) return;
    if (await h.queryPermission({mode: 'read'}) === 'granted') await lerPasta(h);
    else { $('#reabrir').classList.remove('hide'); $('#reabrir').textContent = `🔓 Abrir as aulas de novo (${h.name})`; }
  } catch (e) { console.warn(e); }
}

$('#escolherpasta').onclick = $('#trocarpasta').onclick = async () => {
  if (!('showDirectoryPicker' in window)) return $('#pastainput').click();
  try {
    const h = await window.showDirectoryPicker({id: 'estudio-aulas', mode: 'read'});
    await kv('pasta', pref.lembrar ? h : null);
    pastaAtual = h;
    $('#reabrir').classList.add('hide');
    await lerPasta(h);
  } catch (e) { if (e.name !== 'AbortError') alert('Não consegui abrir a pasta: ' + e.message); }
};
$('#reabrir').onclick = async () => {
  const h = await kv('pasta');
  if (h && await h.requestPermission({mode: 'read'}) === 'granted') { $('#reabrir').classList.add('hide'); lerPasta(h); }
};
$('#pastainput').onchange = e => lerArquivosSoltos([...e.target.files]);
let pastaAtual = null;
$('#lembrar').onchange = async e => {
  pref.lembrar = e.target.checked; salvarPref();
  await kv('pasta', pref.lembrar ? pastaAtual : null).catch(() => {});
  if (!pref.lembrar) { try { localStorage.removeItem('estudio-ultima'); localStorage.removeItem('estudio-pag'); } catch (er) {} }
};
/* fecha tudo: some a lista, o slide e o que estava riscado; o navegador esquece a pasta */
$('#fecharaulas').onclick = async () => {
  if (gravador) return alert('Pare a gravação antes de fechar as aulas.');
  grupos = new Map(); aula = null; tipoAberto = null; pastaAtual = null;
  if (doc) { doc.destroy(); doc = null; }
  if (docCola) { docCola.destroy(); docCola = null; }
  for (const b of cache.values()) b.close?.();
  cache.clear(); anot.clear(); hist.clear(); nPag = 0; pagina = 1;
  pref.lembrar = false; salvarPref(); $('#lembrar').checked = false;
  await kv('pasta', null).catch(() => {});
  try { localStorage.removeItem('estudio-ultima'); localStorage.removeItem('estudio-pag'); } catch (er) {}
  $('#lista').innerHTML = ''; $('#filtro').value = '';
  $('#busca').classList.add('hide'); $('#vazio').classList.remove('hide'); $('#reabrir').classList.add('hide');
  $('#nomeaula').textContent = 'Aulas fechadas. Escolha a pasta para abrir de novo.';
  const c = $('#cola'); c.getContext('2d').clearRect(0, 0, c.width, c.height);
  atualizarPagina(); sujar(); enviarFundo();
};
$('#filtro').oninput = mostrarLista;
$('#avulso').onclick = () => $('#avulsoinput').click();
$('#avulsoinput').onchange = e => {
  const f = e.target.files[0];
  if (f) abrirAula({grupo: 'Avulso', base: f.name.replace(/\.pdf$/i, ''), pdf: () => Promise.resolve(f)}, 'pdf');
};

/* =====================================================================
   PDF
   ===================================================================== */
async function carregar(abrir) {
  const buf = await (await abrir()).arrayBuffer();
  return pdfjs.getDocument({data: buf, isEvalSupported: false}).promise;
}

async function abrirAula(a, tipo) {
  $('#nomeaula').textContent = 'Abrindo ' + a.base + '…';
  try {
    const novo = await carregar(a[tipo]);
    if (doc) doc.destroy();
    if (docCola) { docCola.destroy(); docCola = null; }
    for (const b of cache.values()) b.close?.();
    cache.clear();
    doc = novo; nPag = doc.numPages; aula = a; tipoAberto = tipo;
    let ultima = 1;
    try { ultima = JSON.parse(localStorage.getItem('estudio-pag') || '{}')[chaveAula()] || 1; } catch (e) {}
    pagina = Math.min(Math.max(1, ultima), nPag);
    $('#nomeaula').textContent = a.base + (tipo === 'aluno' ? ' · Aluno' : tipo === 'professor' ? ' · Professor' : tipo === 'lista' ? ' · Lista' : '');
    if (tipo === 'aluno' && a.professor) docCola = await carregar(a.professor).catch(() => null);
    mostrarLista();
    if (cena !== 'slide' && cena !== 'quadro') trocarCena('slide');
    irPara(pagina);
    if (pref.lembrar) try { localStorage.setItem('estudio-ultima', JSON.stringify({grupo: a.grupo, base: a.base, tipo})); } catch (e) {}
  } catch (e) {
    console.error(e);
    $('#nomeaula').textContent = 'Não consegui abrir: ' + a.base;
  }
}
const chaveAula = () => aula ? `${aula.grupo}/${aula.base}/${tipoAberto}` : 'nenhuma';

const fila = new Map();
function renderizar(n) {
  if (cache.has(n)) return Promise.resolve(cache.get(n));
  if (fila.has(n)) return fila.get(n);
  const d = doc;
  const p = (async () => {
    const pg = await d.getPage(n);
    const v1 = pg.getViewport({scale: 1});
    const esc = Math.min(W / v1.width, H / v1.height);
    const v = pg.getViewport({scale: esc});
    const c = new OffscreenCanvas(W, H), cx = c.getContext('2d');
    cx.fillStyle = NAVY; cx.fillRect(0, 0, W, H);
    const ox = Math.round((W - v.width) / 2), oy = Math.round((H - v.height) / 2);
    cx.fillStyle = '#fff'; cx.fillRect(ox, oy, Math.round(v.width), Math.round(v.height));
    await pg.render({canvasContext: cx, viewport: v, transform: [1, 0, 0, 1, ox, oy]}).promise;
    const bmp = await createImageBitmap(c);
    if (d !== doc) { bmp.close(); return null; }
    cache.set(n, bmp);
    if (cache.size > 14) { // guarda só as mais perto da página atual
      const longe = [...cache.keys()].sort((a, b) => Math.abs(b - pagina) - Math.abs(a - pagina))[0];
      cache.get(longe).close(); cache.delete(longe);
    }
    return bmp;
  })().finally(() => fila.delete(n));
  fila.set(n, p);
  return p;
}

async function desenharCola() {
  const c = $('#cola'), cx = c.getContext('2d');
  const tem = !!docCola;
  c.classList.toggle('hide', !tem);
  $('#colainfo').innerHTML = tem ? 'Resolução deste slide (versão do professor). <b>Não entra no vídeo.</b>'
    : tipoAberto === 'aluno' ? 'Essa aula não tem versão do professor na pasta.'
    : 'Abra a versão <b>Aluno</b>: aqui aparece a resolução do mesmo slide, só para você. <b>Não entra no vídeo.</b>';
  if (!tem || pagina > docCola.numPages) return;
  const d = docCola, n = pagina;
  const pg = await d.getPage(n);
  if (d !== docCola || n !== pagina) return;
  const v1 = pg.getViewport({scale: 1});
  const v = pg.getViewport({scale: Math.min(c.width / v1.width, c.height / v1.height)});
  if (colaTarefa) colaTarefa.cancel();
  cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height);
  const t = colaTarefa = pg.render({canvasContext: cx, viewport: v});
  await t.promise.catch(() => {});
  if (colaTarefa === t) colaTarefa = null;
}
let colaTarefa = null;

function irPara(n) {
  if (cena === 'quadro') { qPag = Math.max(1, n); atualizarPagina(); sujar(); enviarFundo(); return; }
  if (!doc) return;
  pagina = Math.min(Math.max(1, n), nPag);
  renderizar(pagina).then(() => { if (pagina + 1 <= nPag) return renderizar(pagina + 1); }).catch(e => console.warn(e));
  atualizarPagina();
  enviarFundo();
  desenharCola().catch(e => console.warn(e));
  sujar();
  if (pref.lembrar) try {
    const m = JSON.parse(localStorage.getItem('estudio-pag') || '{}');
    m[chaveAula()] = pagina;
    localStorage.setItem('estudio-pag', JSON.stringify(m));
  } catch (e) {}
}
function atualizarPagina() {
  $('#pagina').textContent = cena === 'quadro' ? `Quadro ${qPag}` : doc ? `${pagina} / ${nPag}` : '–';
}
const proximo = () => irPara((cena === 'quadro' ? qPag : pagina) + 1);
const anterior = () => irPara((cena === 'quadro' ? qPag : pagina) - 1);
$('#prox').onclick = proximo;
$('#ant').onclick = anterior;

/* =====================================================================
   CANETA, MARCA-TEXTO, LASER, BORRACHA
   ===================================================================== */
const podeRiscar = () => cena === 'slide' || cena === 'quadro' || cena === 'tela';
function chaveRisco() {
  if (cena === 'quadro') return 'quadro|' + qPag;
  if (cena === 'tela') return 'tela';
  return chaveAula() + '|' + pagina;
}
const tracos = () => { const k = chaveRisco(); if (!anot.has(k)) anot.set(k, []); return anot.get(k); };
const historico = () => { const k = chaveRisco(); if (!hist.has(k)) hist.set(k, []); return hist.get(k); };

const camada = new OffscreenCanvas(W, H), ccx = camada.getContext('2d');
let suja = true;
const sujar = () => { suja = true; tracosMudou = true; };
let tracosMudou = false;

function redesenharCamada() {
  ccx.clearRect(0, 0, W, H);
  for (const t of tracos()) desenharTraco(ccx, t);
  limparCache();
  suja = false;
}

function pontoNaTela(e) {
  const r = tela.getBoundingClientRect();
  return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H];
}
function distSeg(px, py, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / l)) : 0;
  return Math.hypot(px - a[0] - t * dx, py - a[1] - t * dy);
}
function apagarEm(x, y) {
  const ts = tracos();
  for (let i = ts.length - 1; i >= 0; i--) {
    const p = contorno(ts[i]), raio = 18 + ts[i].esp / 2;
    const toca = p.length === 1 ? Math.hypot(x - p[0][0], y - p[0][1]) < raio
      : p.some((q, j) => j > 0 && distSeg(x, y, p[j - 1], q) < raio);
    if (toca) { historico().push({del: ts[i], i}); ts.splice(i, 1); sujar(); }
  }
}

/* segurar a caneta parada no fim do traço vira forma (reta, círculo, retângulo, triângulo, seta) */
let seguraTimer = null;
function armarForma(t) {
  clearTimeout(seguraTimer);
  if (!t || t.tipo === 'forma' || t.formado) return;
  seguraTimer = setTimeout(() => {
    if (atual !== t) return;
    const f = reconhecer(t.pts);
    if (!f) return;
    t.tipo = 'forma'; t.f = f; t.formado = true;
    if (t.esp > pref.esp * 2) t.esp = pref.esp * 2; // marca-texto vira forma de traço normal
    sujar();
  }, 550);
}

let atual = null, arrasto = null;
tela.addEventListener('contextmenu', e => e.preventDefault());
tela.addEventListener('pointerdown', e => {
  const [x, y] = pontoNaTela(e);
  if (e.button === 2) { // botão direito: arrastar a câmera
    const r = retCam();
    if (r) { arrasto = {dx: x - (r.x + r.w / 2), dy: y - (r.y + r.h / 2)}; tela.setPointerCapture(e.pointerId); tela.classList.add('mover'); }
    return;
  }
  if (e.button !== 0 && e.pointerType === 'mouse') return;
  if (!podeRiscar()) return;
  tela.setPointerCapture(e.pointerId);
  const f = (e.buttons & 32) ? 'borracha' : ferr; // ponta de borracha da caneta da mesa
  if (f === 'borracha') { atual = {borracha: true}; apagarEm(x, y); return; }
  if (f === 'laser') { atual = {laser: true}; laser.push([x, y, performance.now()]); return; }
  const pr = e.pointerType === 'pen';
  if (f === 'forma') {
    atual = {id: novoId(), tipo: 'forma', cor: pref.cor, esp: pref.esp, pts: [[x, y]], ini: [x, y], f: formaArrasto(pref.forma, [x, y], [x + 1, y + 1])};
  } else {
    atual = {id: novoId(), tipo: f, cor: pref.cor, esp: f === 'marca' ? pref.esp * 4 : pref.esp, pr, pts: [[x, y, pr ? e.pressure : .5]]};
    armarForma(atual);
  }
  tracos().push(atual);
  historico().push({add: atual});
  sujar();
});
tela.addEventListener('pointermove', e => {
  if (arrasto) {
    const [x, y] = pontoNaTela(e);
    pref.pos = {x: x - arrasto.dx, y: y - arrasto.dy}; pref.canto = null;
    marcarCanto();
    return;
  }
  if (!atual) return;
  for (const ev of (e.getCoalescedEvents ? e.getCoalescedEvents() : [e])) {
    const [x, y] = pontoNaTela(ev);
    if (atual.borracha) apagarEm(x, y);
    else if (atual.laser) laser.push([x, y, performance.now()]);
    else if (atual.ini) atual.f = formaArrasto(pref.forma, atual.ini, [x, y], ev.shiftKey);
    else if (atual.formado) { if (atual.f.k === 'reta') atual.f = formaArrasto('reta', atual.f.a, [x, y], true); }
    else {
      const u = atual.pts[atual.pts.length - 1];
      if (Math.hypot(x - u[0], y - u[1]) < 1.5) continue;
      atual.pts.push([x, y, atual.pr ? ev.pressure : .5]);
      if (Math.hypot(x - u[0], y - u[1]) > 3) armarForma(atual);
    }
  }
  sujar();
});
const soltar = () => {
  if (arrasto) { arrasto = null; tela.classList.remove('mover'); salvarPref(); }
  clearTimeout(seguraTimer);
  if (atual && atual.pts) { atual.fim = true; delete atual.ini; sujar(); }
  atual = null;
};
tela.addEventListener('pointerup', soltar);
tela.addEventListener('pointercancel', soltar);

function desfazer() {
  const h = historico().pop();
  if (!h) return;
  const ts = tracos();
  if (h.add) { const i = ts.lastIndexOf(h.add); if (i >= 0) ts.splice(i, 1); }
  else ts.splice(Math.min(h.i, ts.length), 0, h.del);
  sujar();
}
function limparSlide() {
  const ts = tracos();
  if (!ts.length) return;
  for (let i = ts.length - 1; i >= 0; i--) historico().push({del: ts[i], i});
  ts.length = 0;
  sujar();
}
$('#desfazer').onclick = desfazer;
$('#limpar').onclick = limparSlide;

function escolherFerr(f) {
  ferr = f;
  $$('[data-ferr]').forEach(b => b.classList.toggle('on', b.dataset.ferr === f));
}
$$('[data-ferr]').forEach(b => b.onclick = () => escolherFerr(b.dataset.ferr));
$('#forma').onchange = e => { pref.forma = e.target.value; salvarPref(); escolherFerr('forma'); };
$$('.cor').forEach(b => b.onclick = () => {
  pref.cor = b.dataset.cor; salvarPref();
  $$('.cor').forEach(c => c.classList.toggle('on', c === b));
  if (ferr === 'laser' || ferr === 'borracha') escolherFerr('caneta');
});
$('#espessura').onchange = e => { pref.esp = +e.target.value; salvarPref(); };

/* =====================================================================
   CENAS
   ===================================================================== */
async function trocarCena(c) {
  if (c === 'tela' && !telaStream) {
    const ok = await abrirTela();
    if (!ok) return;
  }
  cena = c;
  $$('[data-cena]').forEach(b => b.classList.toggle('on', b.dataset.cena === c));
  atualizarPagina();
  sujar();
  enviarFundo();
}
$$('[data-cena]').forEach(b => b.onclick = () => trocarCena(b.dataset.cena));

async function abrirTela() {
  try {
    telaStream = await navigator.mediaDevices.getDisplayMedia({
      video: {frameRate: 30, width: {ideal: 1920}, height: {ideal: 1080}},
      audio: pref.somtela, selfBrowserSurface: 'exclude', surfaceSwitching: 'include', systemAudio: 'include'});
  } catch (e) { return false; }
  telaFonte = criarFonte(telaStream);
  ligarSomTela();
  telaStream.getVideoTracks()[0].addEventListener('ended', () => {
    telaFonte?.parar(); telaFonte = null;
    desligarSomTela();
    telaStream = null;
    if (cena === 'tela') trocarCena(doc ? 'slide' : 'quadro');
  });
  return true;
}

/* ---------- câmera no canto ---------- */
function retCam() {
  if (!pref.camvis || !camFonte || !camFonte.w || !['slide', 'quadro', 'tela'].includes(cena)) return null;
  const rec = usandoRecorte();
  const w = W * pref.tam / 100 * (rec ? 1.3 : 1);
  const h = pref.formato === 'circulo' ? w : rec ? w * recorte.height / recorte.width : w * 9 / 16;
  const m = 36;
  let cx, cy;
  if (pref.canto) {
    cx = pref.canto[1] === 'e' ? m + w / 2 : W - m - w / 2;
    // o recorte fica encostado na borda de baixo, como o mascote
    cy = pref.canto[0] === 's' ? m + h / 2 : rec ? H - h / 2 : H - m - h / 2;
  } else { cx = pref.pos.x; cy = pref.pos.y; }
  cx = Math.min(Math.max(cx, w / 2), W - w / 2);
  cy = Math.min(Math.max(cy, h / 2), H - h / 2);
  return {x: cx - w / 2, y: cy - h / 2, w, h};
}
function desenharCover(cx, f, x, y, w, h, espelho) {
  const img = f.img;
  if (!img) return;
  const ar = f.w / f.h, alvo = w / h;
  let sw = f.w, sh = f.h;
  if (ar > alvo) sw = f.h * alvo; else sh = f.w / alvo;
  const sx = (f.w - sw) / 2, sy = (f.h - sh) / 2;
  cx.save();
  if (espelho) { cx.translate(x + w, y); cx.scale(-1, 1); cx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h); }
  else cx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  cx.restore();
}
/* ---------- recorte: só a pessoa, sem o cenário (MediaPipe, roda no próprio PC) ----------
   1) o modelo acha a pessoa numa janela em volta dela (não no quadro todo), o que dá mais resolução na borda;
   2) um shader (WebGL) refina a máscara seguindo as cores da imagem (borda do cabelo/ombro sem "auréola"). */
let segmentador = null, carregandoSeg = false, segFalhou = false, recortePronto = false, ultimoSeg = 0, mascaraAnt = null;
let caixaSeg = null, nSeg = 0, custoSeg = 0;
const corCam = document.createElement('canvas'), ctxCor = corCam.getContext('2d', {willReadFrequently: false});
const segIn = document.createElement('canvas'), ctxSegIn = segIn.getContext('2d');
let recorte = document.createElement('canvas'), ctxRecorte = recorte.getContext('2d');
const branco = document.createElement('canvas'), ctxBranco = branco.getContext('2d');
const mascara = document.createElement('canvas'), ctxMascara = mascara.getContext('2d');
recorte.width = 16; recorte.height = 9;
const usandoRecorte = () => pref.formato === 'recorte' && recortePronto && !segFalhou;
function recorteInfo(t) { $('#recorteinfo').textContent = t; $('#recorteinfo').classList.toggle('hide', !t); }
async function carregarSeg() {
  if (segmentador || carregandoSeg || segFalhou) return;
  carregandoSeg = true;
  recorteInfo('Carregando o recorte (só na primeira vez demora um pouco)…');
  try {
    const {FilesetResolver, ImageSegmenter} = await import('./vendor/mediapipe/vision_bundle.mjs');
    const fs = await FilesetResolver.forVisionTasks(new URL('vendor/mediapipe/wasm', location.href).href);
    const criar = (modelo, delegate) => ImageSegmenter.createFromOptions(fs, {
      baseOptions: {modelAssetPath: new URL('vendor/mediapipe/' + modelo, location.href).href, delegate},
      runningMode: 'VIDEO', outputCategoryMask: false, outputConfidenceMasks: true});
    segmentador = await criar('selfie_segmenter_landscape.tflite', 'GPU').catch(() => criar('selfie_segmenter_landscape.tflite', 'CPU'));
    recorteInfo('');
  } catch (e) {
    console.error(e);
    segFalhou = true;
    recorteInfo('O recorte não funcionou neste computador (' + e.message + '). Usando a câmera normal.');
  }
  carregandoSeg = false;
}

/* ---- refinamento da borda na placa de vídeo ---- */
let gl = null, glProg = null, glTexCam = null, glTexMask = null, glU = {}, glFalhou = false;
const glCanvas = document.createElement('canvas');
function iniciarGL() {
  if (gl || glFalhou) return !!gl;
  try {
    gl = glCanvas.getContext('webgl2', {premultipliedAlpha: true, alpha: true, preserveDrawingBuffer: true});
    if (!gl) throw new Error('sem webgl2');
    const vs = `#version 300 es
in vec2 p; out vec2 uv;
void main(){ uv = vec2(p.x*.5+.5, .5-p.y*.5); gl_Position = vec4(p,0.,1.); }`;
    const fs = `#version 300 es
precision highp float;
uniform sampler2D cam, mask; uniform vec4 caixa; uniform vec2 tamMask; uniform float lod, ini, fim;
in vec2 uv; out vec4 o;
float m(vec2 q){ vec2 r = (q - caixa.xy) / caixa.zw; if (r.x<0. || r.y<0. || r.x>1. || r.y>1.) return 0.; return texture(mask, r).r; }
void main(){
  vec3 c = texture(cam, uv).rgb;
  vec3 cb = textureLod(cam, uv, lod).rgb;
  vec2 px = caixa.zw / tamMask;
  float sw = 0., sm = 0.;
  for (int j=-2; j<=2; j++) for (int i=-2; i<=2; i++) {
    vec2 q = uv + vec2(float(i), float(j)) * px;
    vec3 d = mix(c, cb, .5) - textureLod(cam, q, lod).rgb;
    float w = exp(-dot(d,d)*28.) * exp(-float(i*i+j*j)/5.);
    sw += w; sm += w * m(q);
  }
  float a = smoothstep(ini, fim, sm / max(sw, 1e-4));
  o = vec4(c * a, a);
}`;
    const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    glProg = gl.createProgram();
    gl.attachShader(glProg, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(glProg, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(glProg);
    if (!gl.getProgramParameter(glProg, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(glProg));
    gl.useProgram(glProg);
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const lp = gl.getAttribLocation(glProg, 'p'); gl.enableVertexAttribArray(lp); gl.vertexAttribPointer(lp, 2, gl.FLOAT, false, 0, 0);
    for (const n of ['cam', 'mask', 'caixa', 'tamMask', 'lod', 'ini', 'fim']) glU[n] = gl.getUniformLocation(glProg, n);
    const tex = (unid, mip) => {
      const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unid); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    glTexCam = tex(0, true); glTexMask = tex(1, false);
    gl.uniform1i(glU.cam, 0); gl.uniform1i(glU.mask, 1);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    return true;
  } catch (e) { console.warn('recorte sem WebGL:', e); gl = null; glFalhou = true; return false; }
}
let mask8 = null;
function refinarGL(cw, ch, mw, mh, cx0) {
  if (glCanvas.width !== cw || glCanvas.height !== ch) { glCanvas.width = cw; glCanvas.height = ch; }
  gl.viewport(0, 0, cw, ch);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, glTexCam);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, corCam);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, glTexMask);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, mw, mh, 0, gl.RED, gl.UNSIGNED_BYTE, mask8);
  gl.uniform4f(glU.caixa, cx0.x, cx0.y, cx0.w, cx0.h);
  gl.uniform2f(glU.tamMask, mw, mh);
  gl.uniform1f(glU.lod, Math.max(0, Math.log2(cw * cx0.w / mw)));
  const centro = .62 - (pref.borda ?? 50) / 100 * .24; // 0 = mais justo, 100 = mais folgado
  gl.uniform1f(glU.ini, centro - .12); gl.uniform1f(glU.fim, centro + .12);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

/* caixa (em fração do quadro) em volta da pessoa, a partir da máscara anterior */
function caixaPessoa(arr, mw, mh, base) {
  let x0 = mw, y0 = mh, x1 = -1, y1 = -1;
  for (let y = 0; y < mh; y += 2) for (let x = 0; x < mw; x += 2) {
    if (arr[y * mw + x] > .5) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return null;
  return {x: base.x + x0 / mw * base.w, y: base.y + y0 / mh * base.h, w: (x1 - x0 + 1) / mw * base.w, h: (y1 - y0 + 1) / mh * base.h};
}
function atualizarRecorte() {
  if (pref.formato !== 'recorte' || !camFonte || !camFonte.img || !camFonte.w) return;
  const precisa = cena === 'camera' || (pref.camvis && ['slide', 'quadro', 'tela'].includes(cena));
  if (!precisa) return;
  if (!segmentador) { carregarSeg(); return; }
  const agora = performance.now();
  // computador mais fraco: recorta menos vezes por segundo (o vídeo continua a 30 quadros)
  if (agora - ultimoSeg < Math.max(30, custoSeg * 2)) return;
  ultimoSeg = agora;
  const cw = Math.min(1280, camFonte.w), ch = Math.round(cw * camFonte.h / camFonte.w);
  if (corCam.width !== cw || corCam.height !== ch) { corCam.width = branco.width = cw; corCam.height = branco.height = ch; caixaSeg = null; }
  ctxCor.drawImage(camFonte.img, 0, 0, cw, ch);
  // região que vai para o modelo: um quadrado folgado em volta da pessoa (de vez em quando, o quadro todo)
  nSeg++;
  let reg = {x: 0, y: 0, w: 1, h: 1};
  if (caixaSeg && nSeg % 20) { // janela 16:9 (formato do modelo) bem folgada em volta da pessoa
    let rh = Math.max(caixaSeg.h * ch * 1.3, caixaSeg.w * cw * 1.3 * 9 / 16, ch * .45);
    rh = Math.min(rh, ch); let rw = Math.min(rh * 16 / 9, cw); rh = rw * 9 / 16;
    let px = (caixaSeg.x + caixaSeg.w / 2) * cw - rw / 2, py = caixaSeg.y * ch - rh * .12;
    px = Math.max(0, Math.min(cw - rw, px)); py = Math.max(0, Math.min(ch - rh, py));
    reg = {x: px / cw, y: py / ch, w: rw / cw, h: rh / ch};
  }
  if (segIn.width !== 512) { segIn.width = 512; segIn.height = 288; }
  ctxSegIn.drawImage(corCam, reg.x * cw, reg.y * ch, reg.w * cw, reg.h * ch, 0, 0, 512, 288);
  const entrada = segIn;
  let mw = 0, mh = 0, ok = false;
  try {
    segmentador.segmentForVideo(entrada, agora, r => {
      const ms = r.confidenceMasks;
      if (!ms || !ms[0]) return;
      const arr = ms[0].getAsFloat32Array(); mw = ms[0].width; mh = ms[0].height;
      if (!mascaraAnt || mascaraAnt.length !== arr.length) mascaraAnt = new Float32Array(arr.length);
      if (!mask8 || mask8.length !== arr.length) mask8 = new Uint8Array(arr.length);
      const mudouReg = !mascaraAnt.ultima || mascaraAnt.ultima.x !== reg.x || mascaraAnt.ultima.w !== reg.w || mascaraAnt.ultima.y !== reg.y;
      const k = mudouReg ? 0 : .3; // suaviza o tremido entre quadros (sem arrastar quando a janela mexe)
      for (let i = 0; i < arr.length; i++) {
        const p = arr[i];
        const v = mascaraAnt[i] = mascaraAnt[i] * k + p * (1 - k);
        mask8[i] = v * 255;
      }
      mascaraAnt.ultima = reg;
      const nova = caixaPessoa(mascaraAnt, mw, mh, reg);
      if (nova) caixaSeg = caixaSeg ? {x: caixaSeg.x * .5 + nova.x * .5, y: caixaSeg.y * .5 + nova.y * .5, w: caixaSeg.w * .5 + nova.w * .5, h: caixaSeg.h * .5 + nova.h * .5} : nova;
      else caixaSeg = null;
      ok = true;
    });
  } catch (e) { console.warn(e); return; }
  if (!ok) return;
  const tSeg = performance.now() - agora;
  if (iniciarGL()) {
    refinarGL(cw, ch, mw, mh, reg);
    recorte = glCanvas;
  } else { // sem WebGL: máscara simples desfocada
    if (recorte === glCanvas || recorte.width !== cw || recorte.height !== ch) { recorte = document.createElement('canvas'); recorte.width = cw; recorte.height = ch; ctxRecorte = recorte.getContext('2d'); }
    if (mascara.width !== mw || mascara.height !== mh) { mascara.width = mw; mascara.height = mh; }
    const img = ctxMascara.createImageData(mw, mh), d = img.data;
    for (let i = 0; i < mask8.length; i++) d[i * 4 + 3] = Math.max(0, Math.min(255, (mask8[i] - 77) * 2.5));
    ctxMascara.putImageData(img, 0, 0);
    ctxRecorte.globalCompositeOperation = 'copy';
    ctxRecorte.drawImage(corCam, 0, 0);
    ctxRecorte.globalCompositeOperation = 'destination-in';
    ctxRecorte.filter = 'blur(2px)';
    ctxRecorte.drawImage(mascara, 0, 0, mw, mh, reg.x * cw, reg.y * ch, reg.w * cw, reg.h * ch);
    ctxRecorte.filter = 'none';
    ctxRecorte.globalCompositeOperation = 'source-over';
  }
  const gasto = performance.now() - agora;
  if (nSeg > 3) custoSeg = custoSeg ? custoSeg * .9 + gasto * .1 : gasto; // os primeiros quadros incluem o aquecimento do modelo
  window.estudioSeg = {custo: custoSeg, seg: tSeg, total: gasto, reg, gl: !!gl};
  if (pref.contorno) { // silhueta branca para o contorno "adesivo"
    ctxBranco.globalCompositeOperation = 'copy';
    ctxBranco.drawImage(recorte, 0, 0);
    ctxBranco.globalCompositeOperation = 'source-in';
    ctxBranco.fillStyle = '#fff'; ctxBranco.fillRect(0, 0, cw, ch);
    ctxBranco.globalCompositeOperation = 'source-over';
  }
  recortePronto = true;
}
function desenharRecorte(x, y, w, h) {
  ctx.save();
  if (pref.espelho) { ctx.translate(x + w, y); ctx.scale(-1, 1); x = 0; y = 0; }
  if (pref.contorno) {
    const r = Math.max(4, w / 110);
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2;
      ctx.drawImage(branco, x + Math.cos(a) * r, y + Math.sin(a) * r, w, h);
    }
  }
  ctx.shadowColor = '#0006'; ctx.shadowBlur = pref.contorno ? 0 : 18;
  ctx.drawImage(recorte, x, y, w, h);
  ctx.restore();
}

function desenharPip() {
  const r = retCam();
  if (!r) return;
  if (usandoRecorte()) { desenharRecorte(r.x, r.y, r.w, r.h); return; }
  ctx.save();
  ctx.beginPath();
  if (pref.formato === 'circulo') ctx.arc(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, 0, 7);
  else ctx.roundRect(r.x, r.y, r.w, r.h, 22);
  ctx.shadowColor = '#0008'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 6;
  ctx.fillStyle = NAVY; ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.save(); ctx.clip();
  desenharCover(ctx, camFonte, r.x, r.y, r.w, r.h, pref.espelho);
  ctx.restore();
  ctx.lineWidth = 7; ctx.strokeStyle = LAR; ctx.stroke();
  ctx.restore();
}

function marcarCanto() { $$('[data-canto]').forEach(b => b.classList.toggle('on', b.dataset.canto === pref.canto)); }
$$('[data-canto]').forEach(b => b.onclick = () => { pref.canto = b.dataset.canto; pref.pos = null; salvarPref(); marcarCanto(); });
$('#tamanho').oninput = e => { pref.tam = +e.target.value; salvarPref(); };
$('#formato').onchange = e => { pref.formato = e.target.value; salvarPref(); };
$('#espelho').onchange = e => { pref.espelho = e.target.checked; salvarPref(); };
$('#contornocam').onchange = e => { pref.contorno = e.target.checked; salvarPref(); };
$('#borda').oninput = e => { pref.borda = +e.target.value; salvarPref(); };
$('#editarparar').onchange = e => { pref.editarAoParar = e.target.checked; salvarPref(); };
$('#editararq').onclick = editarArquivo;
$('#camvis').onchange = e => { pref.camvis = e.target.checked; salvarPref(); };
$('#marcadagua').onchange = e => { pref.marcadagua = e.target.checked; salvarPref(); };
$('#faixa').onchange = e => { pref.faixa = e.target.checked; salvarPref(); };
$('#qualidade').onchange = e => { pref.qualidade = e.target.value; salvarPref(); };

/* ---------- desenho de cada quadro ---------- */
const mascote = new Image(); mascote.src = 'mascote/capa.webp';
const quadriculado = (() => {
  const c = new OffscreenCanvas(W, H), cx = c.getContext('2d');
  cx.fillStyle = CREME; cx.fillRect(0, 0, W, H);
  cx.strokeStyle = '#EADCC3'; cx.lineWidth = 2;
  for (let x = 0; x <= W; x += 60) { cx.beginPath(); cx.moveTo(x, 0); cx.lineTo(x, H); cx.stroke(); }
  for (let y = 0; y <= H; y += 60) { cx.beginPath(); cx.moveTo(0, y); cx.lineTo(W, y); cx.stroke(); }
  return c;
})();

function quebrar(cx, texto, larg) {
  const linhas = []; let l = '';
  for (const p of texto.split(/\s+/)) {
    const t = l ? l + ' ' + p : p;
    if (cx.measureText(t).width > larg && l) { linhas.push(l); l = p; } else l = t;
  }
  if (l) linhas.push(l);
  return linhas;
}
function tituloAula() {
  if (!aula) return '';
  return aula.base.replace(/\s*\(Parte (\d+)\)/i, ' · Parte $1');
}
function desenharVinheta() {
  ctx.drawImage(quadriculado, 0, 0);
  ctx.fillStyle = LAR; ctx.fillRect(0, H - 34, W, 34);
  if (mascote.complete && mascote.naturalWidth) {
    const h = 900, w = h * mascote.naturalWidth / mascote.naturalHeight;
    ctx.drawImage(mascote, 120, H - 34 - h, w, h);
  }
  const x = 900, larg = W - x - 110;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = LAR; ctx.font = '48px Anton, Impact, sans-serif';
  const m = aula && aula.base.match(/^([A-Z]*\d+[a-z]?)\s*-\s*/);
  ctx.fillText(m ? `AULA ${m[1]}` : 'DELMÃO SIMPLIFICA', x, 300);
  const titulo = (m ? tituloAula().slice(m[0].length) : tituloAula()) || 'BORA ESTUDAR?';
  ctx.fillStyle = NAVY;
  let tam = 120, linhas;
  do { ctx.font = `${tam}px Anton, Impact, sans-serif`; linhas = quebrar(ctx, titulo.toUpperCase(), larg); tam -= 6; } while (linhas.length > 4 && tam > 60);
  let y = 300 + tam * 1.2;
  for (const l of linhas) { ctx.fillText(l, x, y); y += tam * 1.08; }
  ctx.fillStyle = LAR; ctx.fillRect(x, y - tam * 0.75, 260, 14);
  ctx.fillStyle = NAVY; ctx.font = '44px Kalam, "Segoe Print", cursive';
  ctx.fillText('@delmaosimplifica', x, H - 110);
}
function desenharFaixa() {
  if (!pref.faixa) return;
  const t1 = 'DELMÃO SIMPLIFICA', t2 = tituloAula();
  ctx.save();
  ctx.font = '56px Anton, Impact, sans-serif';
  const w1 = ctx.measureText(t1).width + 60;
  ctx.fillStyle = NAVY; ctx.fillRect(80, H - 250, w1, 86);
  ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(t1, 110, H - 207);
  if (t2) {
    ctx.font = '700 38px "Open Sans", sans-serif';
    const w2 = Math.min(ctx.measureText(t2).width + 60, W - 160);
    ctx.fillStyle = LAR; ctx.fillRect(80, H - 164, w2, 64);
    ctx.fillStyle = '#fff'; ctx.fillText(t2, 110, H - 132, w2 - 60);
  }
  ctx.restore();
}
function desenharMarca() {
  if (!pref.marcadagua || cena === 'vinheta' || cena === 'slide') return; // os slides já trazem o @ no topo
  const r = retCam();
  const ocupado = c => r && (c.includes('d') ? r.x + r.w > W - 520 : r.x < 520) && (c.includes('s') ? r.y < 140 : r.y + r.h > H - 140);
  const canto = ['sd', 'ie', 'id', 'se'].find(c => !ocupado(c));
  ctx.save();
  ctx.font = '30px Anton, Impact, sans-serif';
  const t = '@DELMAOSIMPLIFICA', w = ctx.measureText(t).width + 36, h = 52;
  const x = canto[1] === 'd' ? W - w - 28 : 28, y = canto[0] === 's' ? 24 : H - h - 24;
  ctx.globalAlpha = .82;
  ctx.fillStyle = NAVY; ctx.beginPath(); ctx.roundRect(x, y, w, h, 26); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(t, x + 18, y + h / 2 + 1);
  ctx.restore();
}
function desenharLaser() {
  const agora = performance.now();
  laser = laser.filter(p => agora - p[2] < 700);
  if (!laser.length) return;
  ctx.save();
  ctx.lineCap = ctx.lineJoin = 'round';
  for (let i = 1; i < laser.length; i++) {
    const a = laser[i - 1], b = laser[i];
    if (b[2] - a[2] > 120) continue;
    const vida = 1 - (agora - b[2]) / 700;
    ctx.strokeStyle = `rgba(255,40,40,${vida * .8})`;
    ctx.lineWidth = 6 + 10 * vida;
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
  }
  const u = laser[laser.length - 1];
  ctx.shadowColor = '#f00'; ctx.shadowBlur = 30;
  ctx.fillStyle = '#ff3030'; ctx.beginPath(); ctx.arc(u[0], u[1], 14, 0, 7); ctx.fill();
  ctx.restore();
}
function textoCentro(t, sub) {
  ctx.fillStyle = NAVY; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff'; ctx.font = '84px Anton, Impact, sans-serif'; ctx.fillText(t, W / 2, H / 2 - 30);
  if (sub) { ctx.fillStyle = LAR; ctx.font = '40px "Open Sans", sans-serif'; ctx.fillText(sub, W / 2, H / 2 + 60); }
  ctx.textAlign = 'start';
}

function desenhar() {
  try { atualizarRecorte(); } catch (e) { console.warn(e); }
  ctx.save();
  if (cena === 'slide') {
    const b = doc && cache.get(pagina);
    if (b) ctx.drawImage(b, 0, 0);
    else textoCentro(doc ? 'CARREGANDO…' : 'ESCOLHA UMA AULA', doc ? '' : 'na lista à esquerda');
  } else if (cena === 'quadro') {
    ctx.drawImage(quadriculado, 0, 0);
  } else if (cena === 'tela') {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    const f = telaFonte;
    if (f && f.img && f.w) {
      const e = Math.min(W / f.w, H / f.h), w = f.w * e, h = f.h * e;
      ctx.drawImage(f.img, (W - w) / 2, (H - h) / 2, w, h);
    }
  } else if (cena === 'camera') {
    if (camFonte && camFonte.img && usandoRecorte()) { // fundo da marca + só o professor
      ctx.drawImage(quadriculado, 0, 0);
      ctx.fillStyle = LAR; ctx.fillRect(0, H - 34, W, 34);
      const h = H * .96, w = h * recorte.width / recorte.height;
      desenharRecorte((W - w) / 2, H - h, w, h);
    } else if (camFonte && camFonte.img) desenharCover(ctx, camFonte, 0, 0, W, H, pref.espelho);
    else textoCentro('CÂMERA DESLIGADA', 'confira a câmera no painel à direita');
    desenharFaixa();
  } else if (cena === 'vinheta') desenharVinheta();
  if (podeRiscar()) {
    if (suja) redesenharCamada();
    ctx.drawImage(camada, 0, 0);
    desenharLaser();
  }
  desenharPip();
  desenharMarca();
  ctx.restore();
  if (gravador && pref.qualidade === '720') ctxRec.drawImage(tela, 0, 0, 1280, 720);
}

/* relógio num Worker: continua batendo com a aba em segundo plano (compartilhando outra janela) */
const relogio = new Worker(URL.createObjectURL(new Blob(['setInterval(()=>postMessage(0),1000/30)'], {type: 'text/javascript'})));
relogio.onmessage = () => { try { desenhar(); } catch (e) { console.error(e); } medirVu(); try { enviarTracos(); } catch (e) {} };

/* =====================================================================
   CÂMERA E MICROFONE
   ===================================================================== */
let actx = null, destino = null, micNo = null, cadeia = null, analisador = null, telaNo = null;
function audio() {
  if (!actx) {
    actx = new AudioContext({sampleRate: 48000});
    destino = actx.createMediaStreamDestination();
    analisador = actx.createAnalyser(); analisador.fftSize = 1024;
  }
  if (actx.state === 'suspended') actx.resume();
  return actx;
}
document.addEventListener('pointerdown', () => actx && actx.state === 'suspended' && actx.resume(), true);
document.addEventListener('keydown', () => actx && actx.state === 'suspended' && actx.resume(), true);

function montarCadeia() {
  if (!micNo) return;
  try { micNo.disconnect(); } catch (e) {}
  if (cadeia) cadeia.forEach(n => { try { n.disconnect(); } catch (e) {} });
  cadeia = [];
  let ult = micNo;
  if (pref.voz) { // tira o grave do ambiente, dá presença na voz e segura os picos
    const hp = actx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 85;
    const pres = actx.createBiquadFilter(); pres.type = 'peaking'; pres.frequency.value = 3200; pres.Q.value = 1; pres.gain.value = 3;
    const comp = actx.createDynamicsCompressor();
    comp.threshold.value = -22; comp.knee.value = 8; comp.ratio.value = 3.5; comp.attack.value = .005; comp.release.value = .2;
    const ganho = actx.createGain(); ganho.gain.value = 1.6;
    cadeia = [hp, pres, comp, ganho];
    for (const n of cadeia) { ult.connect(n); ult = n; }
  }
  // atraso do som: a imagem do celular chega um pouco depois; atrasar a voz deixa boca e som juntos
  if (!atrasoNo) { atrasoNo = actx.createDelay(1); atrasoNo.connect(destino); }
  atrasoNo.delayTime.value = (pref.atraso || 0) / 1000;
  ult.connect(atrasoNo);
  ult.connect(analisador);
}
let atrasoNo = null;

async function abrirMic() {
  micStream?.getTracks().forEach(t => t.stop());
  try {
    micStream = await navigator.mediaDevices.getUserMedia({audio: {
      deviceId: pref.mic ? {exact: pref.mic} : undefined,
      echoCancellation: false, noiseSuppression: pref.ruido, autoGainControl: false, channelCount: 1}});
  } catch (e) {
    if (pref.mic) { pref.mic = ''; return abrirMic(); }
    info('Microfone não abriu: ' + e.message); return;
  }
  audio();
  micNo = actx.createMediaStreamSource(micStream);
  montarCadeia();
}
async function abrirCam() {
  camFonte?.parar(); camFonte = null;
  if (pref.cam.startsWith('remoto:')) { // câmera do celular
    const r = remotos.get(pref.cam.slice(7));
    if (r && r.stream) {
      camStream?.getTracks().forEach(t => t.stop()); camStream = null;
      camFonte = criarFonte(r.stream);
      return;
    }
  }
  camStream?.getTracks().forEach(t => t.stop());
  const local = pref.cam.startsWith('remoto:') ? '' : pref.cam;
  try {
    camStream = await navigator.mediaDevices.getUserMedia({video: {
      deviceId: local ? {exact: local} : undefined,
      width: {ideal: 1920}, height: {ideal: 1080}, frameRate: {ideal: 30}}});
  } catch (e) {
    if (local) { pref.cam = ''; return abrirCam(); }
    info('Câmera não abriu: ' + e.message); return;
  }
  camFonte = criarFonte(camStream);
}
function ligarSomTela() {
  if (!telaStream || !telaStream.getAudioTracks().length || !pref.somtela) return;
  audio();
  telaNo = actx.createMediaStreamSource(telaStream);
  telaNo.connect(destino);
}
function desligarSomTela() { if (telaNo) { try { telaNo.disconnect(); } catch (e) {} telaNo = null; } }

async function listarAparelhos() {
  const ap = await navigator.mediaDevices.enumerateDevices();
  const encher = (sel, tipo, atual) => {
    sel.innerHTML = '';
    for (const d of ap.filter(a => a.kind === tipo)) {
      const o = document.createElement('option');
      o.value = d.deviceId; o.textContent = d.label || (tipo === 'videoinput' ? 'Câmera' : 'Microfone');
      sel.append(o);
    }
    if (atual) sel.value = atual;
  };
  encher($('#selcam'), 'videoinput', camStream?.getVideoTracks()[0]?.getSettings().deviceId);
  for (const [id, r] of remotos) if (r.stream) {
    const o = document.createElement('option');
    o.value = 'remoto:' + id; o.textContent = '📱 ' + r.nome + ' (câmera)';
    $('#selcam').append(o);
  }
  if (pref.cam.startsWith('remoto:') && camFonte && !camStream) $('#selcam').value = pref.cam;
  encher($('#selmic'), 'audioinput', micStream?.getAudioTracks()[0]?.getSettings().deviceId);
}
$('#selcam').onchange = async e => { pref.cam = e.target.value; salvarPref(); await abrirCam(); };
$('#selmic').onchange = async e => { pref.mic = e.target.value; salvarPref(); await abrirMic(); };
$('#ruido').onchange = async e => { pref.ruido = e.target.checked; salvarPref(); await abrirMic(); };
$('#voz').onchange = e => { pref.voz = e.target.checked; salvarPref(); montarCadeia(); };
$('#somtela').onchange = e => { pref.somtela = e.target.checked; salvarPref(); desligarSomTela(); ligarSomTela(); };
navigator.mediaDevices?.addEventListener?.('devicechange', listarAparelhos);

const vuDados = new Float32Array(1024);
let vuNivel = 0;
function medirVu() {
  if (!analisador) return;
  analisador.getFloatTimeDomainData(vuDados);
  let pico = 0;
  for (const v of vuDados) pico = Math.max(pico, Math.abs(v));
  vuNivel = Math.max(pico, vuNivel * .85);
  const db = 20 * Math.log10(vuNivel || 1e-6);
  $('#vu i').style.width = Math.max(0, Math.min(100, (db + 60) / 60 * 100)) + '%';
}

/* =====================================================================
   GRAVAÇÃO (salva direto no disco enquanto grava)
   ===================================================================== */
let gravarIniciando = false, pastaRec = null;
let gravador = null, arquivo = null, escrita = Promise.resolve(), pedacos = [], bytes = 0;
let inicio = 0, acumulado = 0, pausado = false, relTimer = null, nomeArq = '', arqHandle = null, arqPasta = null;
const telaRec = document.createElement('canvas'); telaRec.width = 1280; telaRec.height = 720;
const ctxRec = telaRec.getContext('2d');

function escolherFormato() {
  const tipos = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1.4d0028,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  const t = tipos.find(t => MediaRecorder.isTypeSupported(t)) || '';
  return {mime: t, ext: t.startsWith('video/mp4') ? 'mp4' : 'webm'};
}
function nomeSugerido(ext) {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  const base = (aula ? aula.base : 'Aula').replace(/[\\/:*?"<>|]/g, '');
  return `${base} - gravação ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}h${p(d.getMinutes())}.${ext}`;
}

async function gravar(peloAparelho) {
  if (gravador || gravarIniciando) return;
  const {mime, ext} = escolherFormato();
  nomeArq = nomeSugerido(ext);
  arquivo = null; pedacos = []; bytes = 0; arqHandle = null; arqPasta = null;
  // 1º caminho: pasta das gravações já escolhida (não pergunta nada; dá para começar pelo tablet)
  if (pastaRec) {
    let perm = await pastaRec.queryPermission({mode: 'readwrite'}).catch(() => 'denied');
    if (perm !== 'granted' && !peloAparelho) perm = await pastaRec.requestPermission({mode: 'readwrite'}).catch(() => 'denied');
    if (perm === 'granted') {
      try {
        let nome = nomeArq, n = 2;
        while (await pastaRec.getFileHandle(nome).then(() => true, () => false)) nome = nomeArq.replace(/(\.\w+)$/, ` (${n++})$1`);
        nomeArq = nome;
        arqHandle = await pastaRec.getFileHandle(nomeArq, {create: true}); arqPasta = pastaRec;
        arquivo = await arqHandle.createWritable();
      } catch (e) { console.warn(e); arquivo = null; }
    }
  }
  if (!arquivo && peloAparelho) { avisarAparelhos('Para começar pelo tablet, escolha antes a pasta das gravações no PC.'); return; }
  if (!arquivo && 'showSaveFilePicker' in window) { // pergunta onde salvar ANTES de gravar: o vídeo vai direto para o disco
    try {
      const h = await window.showSaveFilePicker({id: 'estudio-gravacoes', startIn: 'videos', suggestedName: nomeArq,
        types: [{description: 'Vídeo', accept: {[ext === 'mp4' ? 'video/mp4' : 'video/webm']: ['.' + ext]}}]});
      nomeArq = h.name; arqHandle = h;
      arquivo = await h.createWritable();
    } catch (e) { if (e.name === 'AbortError') return; console.warn(e); }
  }
  audio();
  if (!micStream) await abrirMic();
  // contagem 3, 2, 1
  gravarIniciando = true;
  const cont = $('#contagem');
  cont.classList.add('on');
  for (const n of [3, 2, 1]) { cont.textContent = n; avisarMesas({contagem: n}); await new Promise(r => setTimeout(r, 800)); }
  cont.classList.remove('on');
  gravarIniciando = false;

  const fonte = pref.qualidade === '720' ? telaRec : tela;
  if (fonte === telaRec) ctxRec.drawImage(tela, 0, 0, 1280, 720);
  const video = fonte.captureStream(30).getVideoTracks()[0];
  const stream = new MediaStream([video, ...destino.stream.getAudioTracks()]);
  try {
    gravador = new MediaRecorder(stream, {mimeType: mime || undefined,
      videoBitsPerSecond: pref.qualidade === '720' ? 5e6 : 10e6, audioBitsPerSecond: 192000,
      videoKeyFrameIntervalDuration: 500}); // quadro-chave a cada 0,5 s: o editor corta com precisão
  } catch (e) {
    alert('O navegador não conseguiu começar a gravar: ' + e.message);
    if (arquivo) await arquivo.abort?.();
    return;
  }
  escrita = Promise.resolve();
  gravador.ondataavailable = e => {
    if (!e.data.size) return;
    bytes += e.data.size;
    if (arquivo) { const d = e.data; escrita = escrita.then(() => arquivo.write(d)); }
    else pedacos.push(e.data);
  };
  gravador.onstop = finalizar;
  gravador.onerror = e => { console.error(e); info('Erro na gravação: ' + (e.error?.message || '')); };
  gravador.start(1000);
  inicio = performance.now(); acumulado = 0; pausado = false;
  relTimer = setInterval(atualizarTempo, 250);
  estadoBotoes();
}
function pausar() {
  if (!gravador) return;
  if (!pausado) { gravador.pause(); acumulado += performance.now() - inicio; pausado = true; }
  else { gravador.resume(); inicio = performance.now(); pausado = false; }
  estadoBotoes();
}
function parar() { if (gravador && gravador.state !== 'inactive') gravador.stop(); }

async function finalizar() {
  clearInterval(relTimer);
  const total = acumulado + (pausado ? 0 : performance.now() - inicio);
  gravador.stream.getVideoTracks().forEach(t => t.stop());
  gravador = null; pausado = false;
  estadoBotoes();
  const mb = (bytes / 1048576).toFixed(0);
  if (arquivo) {
    info('Terminando de salvar…');
    await escrita;
    await arquivo.close();
    info(`✅ Salvo: ${nomeArq} (${fmt(total)}, ${mb} MB)`);
    if (pref.editarAoParar !== false && arqHandle) editar(await arqHandle.getFile(), nomeArq, arqPasta, arqHandle);
  } else {
    const blob = new Blob(pedacos, {type: pedacos[0]?.type || 'video/webm'});
    const a = Object.assign(document.createElement('a'), {href: URL.createObjectURL(blob), download: nomeArq});
    a.click();
    info(`✅ Baixado: ${nomeArq} (${fmt(total)}, ${mb} MB)`);
  }
  arquivo = null; pedacos = [];
}
/* editor: abre logo depois de gravar (a gravação original já está salva; a editada vira outro arquivo) */
async function editar(file, nome, pasta, handle) {
  try {
    const {abrirEditor} = await import('./editor.js');
    await abrirEditor({arquivo: file, nome, pasta, handle, aoFechar: r => {
      if (r) info(`✅ Editado e salvo: ${r.nome} (${fmt(r.duracao * 1000)})` + (r.apagouOriginal ? ' · original apagado' : ''));
    }});
  } catch (e) { console.error(e); info('O editor não abriu: ' + e.message); }
}
async function editarArquivo() {
  try {
    if ('showOpenFilePicker' in window) {
      const [h] = await window.showOpenFilePicker({id: 'estudio-gravacoes', types: [{description: 'Vídeo', accept: {'video/*': ['.mp4', '.webm']}}]});
      let pasta = null;
      if (pastaRec && await pastaRec.resolve(h).then(c => c && c.length === 1, () => false)) pasta = pastaRec;
      editar(await h.getFile(), h.name, pasta, h);
    } else {
      const i = Object.assign(document.createElement('input'), {type: 'file', accept: 'video/*'});
      i.onchange = () => i.files[0] && editar(i.files[0], i.files[0].name, null, null);
      i.click();
    }
  } catch (e) { if (e.name !== 'AbortError') info('Não abriu: ' + e.message); }
}
function atualizarTempo() {
  const t = acumulado + (pausado ? 0 : performance.now() - inicio);
  $('#tempo').textContent = fmt(t);
  if (!pausado) info(`${(bytes / 1048576).toFixed(0)} MB gravados`);
}
function estadoBotoes() {
  const g = !!gravador;
  $('#gravar').disabled = g;
  $('#gravar').classList.toggle('gravando', g);
  $('#pausar').disabled = !g; $('#parar').disabled = !g;
  $('#pausar').textContent = pausado ? '▶ Continuar' : '⏸ Pausar';
  $('#gravando').classList.toggle('on', g);
  $('#gravando').classList.toggle('pausa', pausado);
  $('#gravando span').textContent = pausado ? 'PAUSADO' : 'GRAVANDO';
  $('#qualidade').disabled = g;
  if (!g) $('#tempo').textContent = '00:00:00';
  avisarMesas();
}
$('#gravar').onclick = () => gravar();
$('#pausar').onclick = pausar;
$('#parar').onclick = parar;
window.addEventListener('beforeunload', e => { if (gravador) { e.preventDefault(); e.returnValue = ''; } });

/* =====================================================================
   TECLADO
   ===================================================================== */
document.addEventListener('keydown', e => {
  if (e.target.matches('input[type=search], input[type=text], select')) return;
  const k = e.key;
  if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'z') { e.preventDefault(); desfazer(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (['ArrowRight', 'PageDown', ' ', 'ArrowDown'].includes(k)) { e.preventDefault(); proximo(); }
  else if (['ArrowLeft', 'PageUp', 'ArrowUp'].includes(k)) { e.preventDefault(); anterior(); }
  else if (k === 'Home') irPara(1);
  else if (k === 'End') irPara(cena === 'quadro' ? qPag : nPag);
  else if (k >= '1' && k <= '5') trocarCena(['camera', 'slide', 'quadro', 'tela', 'vinheta'][+k - 1]);
  else if (k.toLowerCase() === 'c') { pref.camvis = !pref.camvis; $('#camvis').checked = pref.camvis; salvarPref(); }
  else if (k.toLowerCase() === 'p') escolherFerr('caneta');
  else if (k.toLowerCase() === 'm') escolherFerr('marca');
  else if (k.toLowerCase() === 'f') escolherFerr('forma');
  else if (k.toLowerCase() === 'l') escolherFerr('laser');
  else if (k.toLowerCase() === 'e') escolherFerr('borracha');
  else if (k === 'Delete' || k === 'Backspace') limparSlide();
  else if (k.toLowerCase() === 'g') gravador ? pausar() : gravar();
});

/* =====================================================================
   INÍCIO
   ===================================================================== */
function ajustar() {
  const p = $('#palco');
  const w = p.clientWidth - 28, h = p.clientHeight - 28;
  const e = Math.max(1, Math.min(w / 16, h / 9));
  tela.style.width = 16 * e + 'px'; tela.style.height = 9 * e + 'px';
}
new ResizeObserver(ajustar).observe($('#palco'));

function aplicarPref() {
  $('#espessura').value = pref.esp;
  $('#forma').value = pref.forma;
  $('#lembrar').checked = pref.lembrar;
  $('#contornocam').checked = pref.contorno;
  $('#borda').value = pref.borda ?? 50;
  $('#editarparar').checked = pref.editarAoParar !== false;
  $$('.cor').forEach(c => c.classList.toggle('on', c.dataset.cor === pref.cor));
  $('#formato').value = pref.formato; $('#tamanho').value = pref.tam;
  $('#espelho').checked = pref.espelho; $('#camvis').checked = pref.camvis;
  $('#marcadagua').checked = pref.marcadagua; $('#faixa').checked = pref.faixa;
  $('#voz').checked = pref.voz; $('#ruido').checked = pref.ruido; $('#somtela').checked = pref.somtela;
  $('#qualidade').value = pref.qualidade;
  if (!pref.canto && !pref.pos) pref.canto = 'id';
  marcarCanto();
}

(async () => {
  aplicarPref();
  ajustar();
  if (!navigator.mediaDevices?.getUserMedia) { info('Este navegador não grava. Use o Chrome ou o Edge.'); return; }
  await Promise.all([abrirCam(), abrirMic()]);
  await listarAparelhos().catch(() => {});
  await iniciarPasta();
  // reabre a última aula usada
  try {
    const u = JSON.parse(localStorage.getItem('estudio-ultima') || 'null');
    const a = u && grupos.get(u.grupo)?.get(u.base);
    if (a && a[u.tipo]) abrirAula(a, u.tipo);
  } catch (e) {}
})();

import('./estudio-remoto.js').then(m => m.iniciar({
  get cena() { return cena; }, get pagina() { return pagina; }, get nPag() { return nPag; }, get qPag() { return qPag; },
  get aula() { return aula ? tituloAula() : ''; }, get gravando() { return !!gravador; }, get pausado() { return pausado; },
  get tempo() { return gravador ? acumulado + (pausado ? 0 : performance.now() - inicio) : 0; },
  get pastaRec() { return pastaRec; }, set pastaRec(h) { pastaRec = h; },
  tracos, chaveRisco, podeRiscar, sujar, historico, apagarEm, laser: p => laser.push(p),
  renderizar, telaFonte: () => telaFonte, quadriculado,
  proximo, anterior, trocarCena, desfazer, limparSlide, gravar, pausar, parar,
  camvis: () => { pref.camvis = !pref.camvis; $('#camvis').checked = pref.camvis; salvarPref(); avisarMesas(); },
  get camvisOn() { return pref.camvis; },
  remotos, abrirCam, listarAparelhos, get pref() { return pref; }, salvarPref, montarCadeia, info,
  registrar: f => Object.assign(ganchos, f),
})).catch(e => console.error('remoto', e));
function avisarMesas(extra) { ganchos.avisar?.(extra); }
function avisarAparelhos(t) { ganchos.mensagem?.(t); info(t); }
function enviarFundo() { ganchos.fundo?.(); }
function enviarTracos() { if (tracosMudou && ganchos.tracos && ganchos.tracos()) tracosMudou = false; }
// para testes no console
window.estudio = {get cena() { return cena; }, get actx() { return actx; }, get destino() { return destino; }, get pagina() { return pagina; }, get nPag() { return nPag; }, lerArquivosSoltos, abrirAula, grupos: () => grupos, trocarCena, editar, get gravador() { return gravador; }};
