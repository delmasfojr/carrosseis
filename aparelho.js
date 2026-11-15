/* Aparelho do Estúdio: celular como câmera ou tablet como mesa de escrever.
   Abre por aparelho.html#código (QR code mostrado no PC). */
import {desenharTraco, reconhecer, formaArrasto, novoId, pontosReais, mult, aplicar, IDENT,
  espDe, espMarca, ESP_PADRAO, virarForma, desfazerForma, MEXEU_DESFAZ} from './tinta.js';
(() => {
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const W = 1920, H = 1080;
const [hashCod, hashTurn] = (location.hash.slice(1) || '').split('~');
const codigo = (hashCod || '').replace(/[^a-z0-9]/g, '');
/* servidores de rede: STUN público + o servidor de retransmissão (TURN) que o professor cadastrou no PC */
const STUN = [{urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302']}, {urls: 'stun:stun.cloudflare.com:3478'}];
let iceServers = STUN, temTurn = false;
async function carregarTurn() {
  if (!hashTurn) return;
  try {
    const v = decodeURIComponent(atob(hashTurn.replace(/-/g, '+').replace(/_/g, '/')));
    let lista = null;
    if (/^https:\/\//.test(v)) lista = await (await fetch(v)).json();
    else lista = JSON.parse(v);
    if (lista && !Array.isArray(lista)) lista = lista.iceServers || [lista];
    if (Array.isArray(lista) && lista.length) { iceServers = STUN.concat(lista); temTurn = true; }
  } catch (e) { console.warn('turn', e); }
}
const turnPronto = carregarTurn();
const pcId = 'delmao-estudio-' + codigo;

const ua = navigator.userAgent;
const ehIpad = /iPad/.test(ua) || (/Macintosh/.test(ua) && 'ontouchend' in document);
const nome = ehIpad ? 'iPad' : /iPhone/.test(ua) ? 'iPhone'
  : /Android/.test(ua) ? (/Mobile/.test(ua) ? 'Celular Android' : 'Tablet Android') : 'Aparelho';

let peer = null, conn = null, modo = null, chamada = null;

function status(t, erro) {
  const s = $('#status'); s.textContent = t; s.classList.toggle('erro', !!erro);
  if (modo === 'camera') $('#camaviso').textContent = t; // na tela da câmera o aviso fica em cima do vídeo
}
function mostrar(id) { $$('.tela').forEach(t => t.classList.toggle('hide', t.id !== id)); }

/* tela sempre acesa enquanto usa */
let trava = null;
async function manterAcesa() { try { trava = await navigator.wakeLock?.request('screen'); } catch (e) {} }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && modo) manterAcesa(); });

function ligarPeer() {
  return new Promise(ok => {
    if (peer && !peer.destroyed && peer.open) return ok(true);
    peer = new Peer({debug: 0, config: {iceServers}});
    peer.on('open', () => ok(true));
    peer.on('error', e => {
      if (e.type === 'peer-unavailable') status('O Estúdio não está aberto no PC (ou o código mudou). Abra o Estúdio e leia o QR code de novo.', true);
      else if (e.type === 'network' || e.type === 'server-error' || e.type === 'socket-error') status('Sem internet no aparelho (ou o servidor de pareamento caiu). Confira o Wi-Fi.', true);
      else status('Erro de conexão: ' + e.type, true);
      ok(false);
    });
    peer.on('disconnected', () => setTimeout(() => peer && !peer.destroyed && peer.reconnect(), 1500));
  });
}

function conectar(tipo) {
  return new Promise(ok => {
    conn = peer.connect(pcId, {metadata: {tipo, nome}, reliable: true});
    let feito = false;
    conn.on('open', () => { feito = true; ok(true); });
    conn.on('data', receber);
    conn.on('close', () => caiu());
    conn.on('error', () => caiu());
    const c = conn;
    const espiar = setInterval(() => { // mostra em que pé está a conexão
      const pc = c.peerConnection;
      if (feito || !pc) return;
      const st = pc.iceConnectionState;
      if (st === 'checking') status('Achei o PC. Abrindo o caminho pela rede…');
      if (st === 'failed') { clearInterval(espiar); diagnosticar(pc).then(t => status(t, true)); }
    }, 700);
    setTimeout(async () => {
      clearInterval(espiar);
      if (feito) return;
      if (c.peerConnection) status(await diagnosticar(c.peerConnection), true);
      ok(false);
    }, 15000);
  });
}

/* por que não conectou? olha os caminhos que cada lado ofereceu */
async function diagnosticar(pc) {
  const loc = [], rem = [];
  try {
    (await pc.getStats()).forEach(r => {
      if (r.type === 'local-candidate') loc.push(r);
      if (r.type === 'remote-candidate') rem.push(r);
    });
  } catch (e) {}
  if (!rem.length) return 'O PC não respondeu. Confira se o Estúdio está aberto no PC (só em uma aba) e leia o QR code de novo.';
  const rede = c => (c.address || c.ip || '').split('.').slice(0, 3).join('.');
  const hostL = loc.filter(c => c.candidateType === 'host' && /^\d+\./.test(c.address || c.ip || '')).map(rede);
  const hostR = rem.filter(c => c.candidateType === 'host' && /^\d+\./.test(c.address || c.ip || '')).map(rede);
  const mesma = hostL.some(r => hostR.includes(r));
  const relay = loc.some(c => c.candidateType === 'relay');
  if (temTurn && !relay) return 'O servidor de retransmissão não respondeu. Confira o link dele no PC (Conectar aparelho → A câmera não conecta?).';
  if (hostL.length && hostR.length && !mesma)
    return 'O celular e o PC estão em redes diferentes (' + hostL[0] + '.x e ' + hostR[0] + '.x). Ponha os dois no mesmo Wi-Fi, ou cadastre o servidor de retransmissão no PC.';
  if (!hostL.length) return 'O celular parece estar nos dados móveis. Ligue o Wi-Fi (o mesmo do PC), ou cadastre o servidor de retransmissão no PC.';
  return 'O roteador não deixou o celular falar direto com o PC (comum em Wi-Fi de visitas ou com "isolamento"). Cadastre o servidor de retransmissão no PC: Conectar aparelho → A câmera não conecta?';
}

let religando = false;
async function caiu() {
  if (religando || !modo) return;
  religando = true;
  $('#desconectado').classList.remove('hide');
  const antes = $('#camaviso').textContent;
  if (!/redes diferentes|dados móveis|roteador|retransmissão|não respondeu/.test(antes)) $('#camaviso').textContent = 'Conexão caiu. Tentando de novo…';
  while (modo) {
    await new Promise(r => setTimeout(r, 4000));
    if (!(await ligarPeer())) continue;
    if (await conectar(modo)) {
      if (modo === 'camera') ligarChamada();
      break;
    }
  }
  $('#desconectado').classList.add('hide');
  religando = false;
}

/* =====================================================================
   CÂMERA
   ===================================================================== */
let camStream = null, frente = false, alta = true;
function explicarErro(e) {
  const n = e && e.name;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia)
    return 'Este navegador não deixa usar a câmera. Se abriu pelo leitor de QR code, toque nos três pontinhos e escolha "Abrir no Chrome" (ou no Safari, no iPhone).';
  if (n === 'NotAllowedError' || n === 'SecurityError')
    return 'A câmera foi bloqueada. Toque no cadeado ao lado do endereço → Permissões → Câmera → Permitir, e tente de novo. Se abriu pelo leitor de QR code, abra no Chrome (ou Safari).';
  if (n === 'NotReadableError' || n === 'AbortError' || n === 'TrackStartError')
    return 'A câmera está ocupada por outro app (por exemplo, o app da câmera que leu o QR code). Feche os outros apps e tente de novo.';
  if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'Não encontrei essa câmera. Toque em "Trocar câmera".';
  return 'A câmera não abriu: ' + (e && e.message || n || 'erro desconhecido');
}
async function pedirCamera() {
  // do mais exigente ao mais simples: alguns celulares recusam 1080p ou a câmera de trás com resolução fixa
  const tentativas = [
    {facingMode: frente ? 'user' : 'environment', width: {ideal: alta ? 1920 : 1280}, height: {ideal: alta ? 1080 : 720}, frameRate: {ideal: 30}},
    {facingMode: frente ? 'user' : 'environment'},
    true,
  ];
  let ultimo = null;
  for (const v of tentativas) {
    try { return await navigator.mediaDevices.getUserMedia({audio: false, video: v}); }
    catch (e) { ultimo = e; if (e.name === 'NotAllowedError' || e.name === 'SecurityError') break; }
  }
  throw ultimo;
}
async function abrirCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('sem câmera');
  const novo = await pedirCamera();
  const velho = camStream;
  camStream = novo;
  $('#camvideo').srcObject = novo;
  $('#camvideo').style.transform = frente ? 'scaleX(-1)' : '';
  const t = novo.getVideoTracks()[0];
  t.contentHint = 'motion';
  const sender = chamada?.peerConnection?.getSenders().find(s => s.track && s.track.kind === 'video');
  if (sender) { await sender.replaceTrack(t); qualidade(); }
  velho?.getTracks().forEach(x => x.stop());
  const s = t.getSettings();
  $('#qualcam').textContent = (s.height ? Math.min(s.width, s.height) : (alta ? 1080 : 720)) + 'p';
}
function ligarChamada() {
  chamada = peer.call(pcId, camStream, {metadata: {nome}});
  $('#camaviso').textContent = 'Conectando a câmera…';
  const pc = chamada.peerConnection;
  pc.addEventListener('connectionstatechange', () => {
    if (pc.connectionState === 'connected') { $('#camaviso').textContent = '✅ Câmera ligada no PC'; qualidade(); }
    if (pc.connectionState === 'failed') diagnosticar(pc).then(t => { $('#camaviso').textContent = t; });
  });
  chamada.on('close', () => caiu());
}
async function qualidade() { // bitrate alto: no Wi-Fi de casa dá para mandar a imagem quase sem perda
  const s = chamada?.peerConnection?.getSenders().find(x => x.track && x.track.kind === 'video');
  if (!s) return;
  try {
    const p = s.getParameters();
    if (!p.encodings || !p.encodings.length) p.encodings = [{}];
    // passando pelo servidor de retransmissão (plano grátis tem pouca franquia): imagem mais leve
    let relay = false;
    try {
      const st = await chamada.peerConnection.getStats(); let par = null;
      st.forEach(r => { if (r.type === 'transport' && r.selectedCandidatePairId) par = st.get(r.selectedCandidatePairId); });
      if (par) relay = [st.get(par.localCandidateId), st.get(par.remoteCandidateId)].some(c => c && c.candidateType === 'relay');
    } catch (e) {}
    if (relay) $('#camaviso').textContent = '✅ Câmera ligada (pelo servidor de retransmissão, imagem mais leve)';
    p.encodings[0].maxBitrate = relay ? 2.5e6 : alta ? 8e6 : 4e6;
    p.encodings[0].maxFramerate = 30;
    p.degradationPreference = 'maintain-resolution';
    await s.setParameters(p);
  } catch (e) { console.warn(e); }
}
$('#modocam').onclick = async () => {
  modo = 'camera';
  status('Abrindo a câmera…');
  try { await abrirCamera(); }
  catch (e) { status(explicarErro(e), true); modo = null; $('#modocam').querySelector('small').textContent = 'Toque aqui para tentar de novo.'; return; }
  mostrar('cam');
  manterAcesa();
  status('Procurando o PC…');
  await turnPronto;
  if (!(await ligarPeer()) || !(await conectar('camera'))) { caiu(); return; }
  ligarChamada();
};
$('#trocacam').onclick = () => { frente = !frente; abrirCamera().catch(e => alert(explicarErro(e))); };
$('#qualcam').onclick = () => { alta = !alta; abrirCamera().catch(e => alert(explicarErro(e))); };
$('#escurecer').onclick = () => $('#cam').classList.toggle('escuro');
$('#sairdocam').onclick = () => { modo = null; chamada?.close(); conn?.close(); camStream?.getTracks().forEach(t => t.stop()); trava?.release?.(); mostrar('inicio'); };

/* =====================================================================
   MESA DE ESCREVER
   ===================================================================== */
const cv = $('#quadro'), cx = cv.getContext('2d');
let est = {cena: 'slide', pagina: 0, nPag: 0, gravando: false, pausado: false, tempo: 0, camvis: true, chave: ''};
let tempoBase = 0, tempoEm = 0;
let fundo = null, fundoChave = '', listaPC = [], listaChave = '';
const minhas = new Map(); // traços meus ainda não confirmados pelo PC
let espN = (() => { try { return Math.min(100, Math.max(1, +localStorage.getItem('mesa-esp') || ESP_PADRAO)); } catch (e) { return ESP_PADRAO; } })();
let ferr = 'caneta', cor = '#FF7A00', esp = espDe(espN), penViu = false, dedo = false, dono = null;
let atual = null, laser = [];
let sujo = true;

function receber(d) {
  if (!d || typeof d !== 'object') return;
  if (d.t === 'estado') {
    const antes = est.chave;
    est = {...est, ...d};
    tempoBase = d.tempo || 0; tempoEm = performance.now();
    if (est.chave !== antes) { minhas.clear(); if (sel) { sel = null; atualizarBotaoLimpar(); } }
    if (d.contagem) { const c = $('#contagem'); c.textContent = d.contagem; c.classList.remove('hide'); clearTimeout(c._t); c._t = setTimeout(() => c.classList.add('hide'), 900); }
    atualizarTopo();
    sujo = true;
  } else if (d.t === 'fundo') {
    fundoChave = d.chave;
    if (!d.img) { fundo = null; sujo = true; return; }
    createImageBitmap(new Blob([d.img], {type: 'image/jpeg'})).then(b => {
      if (fundoChave !== d.chave) return;
      fundo?.close?.(); fundo = b; sujo = true;
    });
  } else if (d.t === 'tracos') {
    listaPC = d.lista || []; listaChave = d.chave;
    const ids = new Set(listaPC.map(t => t.id));
    for (const id of [...minhas.keys()]) if (ids.has(id) && minhas.get(id) !== atual) minhas.delete(id);
    sujo = true;
  } else if (d.t === 'msg') {
    const m = $('#msg'); m.textContent = d.texto; m.classList.remove('hide');
    clearTimeout(m._t); m._t = setTimeout(() => m.classList.add('hide'), 5000);
    const a = $('#camaviso'); if (a) a.textContent = d.texto;
  }
}
const fmt = ms => { const s = Math.floor(ms / 1000); return [s / 3600, s / 60 % 60, s % 60].map(v => String(Math.floor(v)).padStart(2, '0')).join(':'); };
function atualizarTopo() {
  $('#pg').textContent = est.cena === 'quadro' ? `Quadro ${est.qPag || 1}` : est.nPag ? `${est.pagina} / ${est.nPag}` : '–';
  $('#mtitulo').textContent = est.aula || '';
  $('#mgravar').disabled = est.gravando;
  $('#mgravar').classList.toggle('on', est.gravando);
  $('#mpausar').disabled = !est.gravando; $('#mparar').disabled = !est.gravando;
  $('#mpausar').textContent = est.pausado ? '▶' : '⏸';
  $('#mcamvis').classList.toggle('on', !!est.camvis);
  $$('#cenas [data-cena]').forEach(b => b.classList.toggle('on', b.dataset.cena === est.cena));
  if (!est.gravando) $('#mtempo').textContent = '00:00:00';
}
setInterval(() => {
  if (est.gravando) $('#mtempo').textContent = fmt(tempoBase + (est.pausado ? 0 : performance.now() - tempoEm));
}, 250);

function ajustar() {
  const p = $('#mesa .palco');
  const w = p.clientWidth - 8, h = p.clientHeight - 8;
  const e = Math.max(1, Math.min(w / 16, h / 9));
  const cw = Math.round(16 * e), ch = Math.round(9 * e), dpr = Math.min(2, devicePixelRatio || 1);
  cv.style.width = cw + 'px'; cv.style.height = ch + 'px';
  cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
  sujo = true;
}
window.addEventListener('resize', ajustar);

const grade = (() => {
  const c = document.createElement('canvas'); c.width = 960; c.height = 540;
  const g = c.getContext('2d');
  g.fillStyle = '#FFF6E6'; g.fillRect(0, 0, 960, 540);
  g.strokeStyle = '#EADCC3'; g.lineWidth = 1;
  for (let x = 0; x <= 960; x += 30) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 540); g.stroke(); }
  for (let y = 0; y <= 540; y += 30) { g.beginPath(); g.moveTo(0, y); g.lineTo(960, y); g.stroke(); }
  return c;
})();

function desenhar() {
  requestAnimationFrame(desenhar);
  if (modo !== 'mesa') return;
  if (!sujo && !laser.length) return;
  sujo = false;
  cx.setTransform(1, 0, 0, 1, 0, 0);
  const e = cv.width / W;
  cx.fillStyle = '#0F1B2D'; cx.fillRect(0, 0, cv.width, cv.height);
  const podeRiscar = ['slide', 'quadro', 'tela'].includes(est.cena);
  if (est.cena === 'quadro') cx.drawImage(grade, 0, 0, cv.width, cv.height);
  else if ((est.cena === 'slide' || est.cena === 'tela') && fundo) cx.drawImage(fundo, 0, 0, cv.width, cv.height);
  else {
    cx.fillStyle = '#fff'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.font = `${Math.round(cv.height / 12)}px Anton, Impact, sans-serif`;
    const t = {camera: 'CENA: CÂMERA', vinheta: 'CENA: VINHETA', slide: est.nPag ? 'CARREGANDO…' : 'ABRA UMA AULA NO PC', tela: 'CARREGANDO A TELA…'}[est.cena] || '';
    cx.fillText(t, cv.width / 2, cv.height / 2);
    cx.font = `${Math.round(cv.height / 28)}px "Open Sans", sans-serif`; cx.fillStyle = '#FF7A00';
    if (!podeRiscar) cx.fillText('Toque em 🎬 Cena para voltar ao slide ou ao quadro', cv.width / 2, cv.height / 2 + cv.height / 10);
  }
  if (podeRiscar) {
    cx.setTransform(e, 0, 0, e, 0, 0);
    const emSel = t => sel && sel.ids.has(t.id) && sel.m !== IDENT ? {...t, m: mult(sel.m, t.m || IDENT)} : t;
    if (listaChave === est.chave) for (const t of listaPC) desenharTraco(cx, emSel(t));
    for (const t of minhas.values()) desenharTraco(cx, emSel(t));
    desenharSelecao();
    // laser
    const agora = performance.now();
    laser = laser.filter(p => agora - p[2] < 700);
    if (laser.length) {
      cx.lineCap = 'round';
      for (let i = 1; i < laser.length; i++) {
        const a = laser[i - 1], b = laser[i];
        const v = 1 - (agora - b[2]) / 700;
        cx.strokeStyle = `rgba(255,40,40,${v * .8})`; cx.lineWidth = 6 + 10 * v;
        cx.beginPath(); cx.moveTo(a[0], a[1]); cx.lineTo(b[0], b[1]); cx.stroke();
      }
      const u = laser[laser.length - 1];
      cx.fillStyle = '#ff3030'; cx.beginPath(); cx.arc(u[0], u[1], 14, 0, 7); cx.fill();
    }
  }
}
requestAnimationFrame(desenhar);

/* =========== SELECIONAR: laço → mover, girar, aumentar/diminuir =========== */
let sel = null; // {ids, base:[x0,y0,x1,y1], acc: matriz já aplicada, m: matriz do arrasto atual}
function todosTracos() {
  const r = listaChave === est.chave ? [...listaPC] : [];
  for (const t of minhas.values()) if (t !== atual && !r.some(x => x.id === t.id)) r.push(t);
  return r;
}
function dentro(p, poli) { // ponto dentro do polígono (laço)
  let d = false;
  for (let i = 0, j = poli.length - 1; i < poli.length; j = i++) {
    const [xi, yi] = poli[i], [xj, yj] = poli[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) d = !d;
  }
  return d;
}
function caixaDe(ids) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const t of todosTracos()) if (ids.has(t.id)) for (const p of pontosReais(t)) {
    const r = t.esp / 2; x0 = Math.min(x0, p[0] - r); y0 = Math.min(y0, p[1] - r); x1 = Math.max(x1, p[0] + r); y1 = Math.max(y1, p[1] + r);
  }
  return x0 === Infinity ? null : [x0 - 14, y0 - 14, x1 + 14, y1 + 14];
}
function selecionarLaco(laco) {
  sel = null;
  if (laco.length < 3) { atualizarBotaoLimpar(); return; }
  const ids = new Set();
  for (const t of todosTracos()) {
    const p = pontosReais(t);
    const passo = Math.max(1, Math.floor(p.length / 40));
    let n = 0, k = 0;
    for (let i = 0; i < p.length; i += passo) { n++; if (dentro(p[i], laco)) k++; }
    if (n && k / n >= .5) ids.add(t.id);
  }
  const base = ids.size && caixaDe(ids);
  if (base) sel = {ids, base, acc: IDENT, m: IDENT};
  atualizarBotaoLimpar();
}
function cantosSel() {
  const [x0, y0, x1, y1] = sel.base, M = mult(sel.m, sel.acc);
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(p => aplicar(M, p));
}
function alcasSel() {
  const c = cantosSel(), topo = [(c[0][0] + c[1][0]) / 2, (c[0][1] + c[1][1]) / 2];
  const lado = Math.hypot(c[1][0] - c[0][0], c[1][1] - c[0][1]) || 1;
  const nx = (c[1][1] - c[0][1]) / lado, ny = (c[0][0] - c[1][0]) / lado; // normal para "cima"
  const centro = [(c[0][0] + c[2][0]) / 2, (c[0][1] + c[2][1]) / 2];
  return {c, girar: [topo[0] + nx * 70, topo[1] + ny * 70], topo, escala: c[2], centro};
}
function desenharSelecao() {
  if (atual && atual.laco) {
    cx.save(); cx.setLineDash([14, 10]); cx.strokeStyle = '#1F6FEB'; cx.lineWidth = 4;
    cx.beginPath(); atual.laco.forEach((p, i) => i ? cx.lineTo(p[0], p[1]) : cx.moveTo(p[0], p[1])); cx.stroke(); cx.restore();
  }
  if (!sel) return;
  const a = alcasSel();
  cx.save();
  cx.strokeStyle = '#1F6FEB'; cx.lineWidth = 4; cx.setLineDash([16, 10]);
  cx.beginPath(); a.c.forEach((p, i) => i ? cx.lineTo(p[0], p[1]) : cx.moveTo(p[0], p[1])); cx.closePath(); cx.stroke();
  cx.setLineDash([]);
  cx.beginPath(); cx.moveTo(a.topo[0], a.topo[1]); cx.lineTo(a.girar[0], a.girar[1]); cx.stroke();
  cx.fillStyle = '#fff';
  cx.beginPath(); cx.arc(a.girar[0], a.girar[1], 22, 0, 7); cx.fill(); cx.stroke();
  cx.fillStyle = '#1F6FEB'; cx.font = 'bold 28px sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
  cx.fillText('⟳', a.girar[0], a.girar[1] + 1);
  cx.fillStyle = '#fff';
  cx.beginPath(); cx.rect(a.escala[0] - 18, a.escala[1] - 18, 36, 36); cx.fill(); cx.stroke();
  cx.fillStyle = '#1F6FEB'; cx.fillText('⤡', a.escala[0], a.escala[1] + 1);
  cx.restore();
}
function iniciarSel(p) {
  if (sel) {
    const a = alcasSel(), perto = (q, r) => Math.hypot(p[0] - q[0], p[1] - q[1]) < r;
    if (perto(a.girar, 55)) return {arraste: 'girar', p0: p, centro: a.centro};
    if (perto(a.escala, 50)) return {arraste: 'escala', p0: p, centro: a.centro};
    if (dentro(p, a.c)) return {arraste: 'mover', p0: p};
  }
  sel = null; atualizarBotaoLimpar();
  return {laco: [p]};
}
function arrastarSel(p, shift) {
  const g = atual;
  if (g.laco) { const u = g.laco[g.laco.length - 1]; if (Math.hypot(p[0] - u[0], p[1] - u[1]) > 6) g.laco.push(p); return; }
  if (!sel) return;
  if (g.arraste === 'mover') { sel.m = [1, 0, 0, 1, p[0] - g.p0[0], p[1] - g.p0[1]]; return; }
  const [cx0, cy0] = g.centro;
  let ang = 0, esc = 1;
  if (g.arraste === 'girar') {
    ang = Math.atan2(p[1] - cy0, p[0] - cx0) - Math.atan2(g.p0[1] - cy0, g.p0[0] - cx0);
    const passo = Math.PI / 12, perto = Math.round(ang / passo) * passo; // gruda em múltiplos de 15°
    if (Math.abs(ang - perto) < .05) ang = perto;
  } else {
    esc = Math.max(.15, Math.min(8, Math.hypot(p[0] - cx0, p[1] - cy0) / Math.max(10, Math.hypot(g.p0[0] - cx0, g.p0[1] - cy0))));
  }
  const a = esc * Math.cos(ang), b = esc * Math.sin(ang);
  sel.m = [a, b, -b, a, cx0 - (a * cx0 - b * cy0), cy0 - (b * cx0 + a * cy0)];
}
function soltarSel() {
  const g = atual;
  if (g.laco) { selecionarLaco(g.laco); return; }
  if (!sel || sel.m === IDENT) return;
  const m = sel.m, ids = [...sel.ids];
  for (const t of todosTracos()) if (sel.ids.has(t.id)) t.m = mult(m, t.m || IDENT); // já mostra no lugar novo
  enviar({t: 'mover', ids, m});
  sel.acc = mult(m, sel.acc); sel.m = IDENT;
}
function atualizarBotaoLimpar() { $('#mlimpar').textContent = sel ? '🗑️ Apagar seleção' : '🗑️'; }

function ponto(ev) {
  const r = cv.getBoundingClientRect();
  return [Math.round((ev.clientX - r.left) / r.width * W), Math.round((ev.clientY - r.top) / r.height * H),
    ev.pointerType === 'pen' ? Math.round((ev.pressure || .5) * 100) / 100 : .5];
}
/* segurar parado no fim do traço vira forma */
let seguraTimer = null, formaSel = 'reta';
function armarForma(t) {
  clearTimeout(seguraTimer);
  if (!t || t.tipo === 'forma') return;
  seguraTimer = setTimeout(() => {
    if (atual !== t) return;
    const f = reconhecer(t.pts);
    if (!f) return;
    virarForma(t, f);
    enviar({t: 'forma', id: t.id, f});
    if (navigator.vibrate) navigator.vibrate(15);
    sujo = true;
  }, 550);
}
const enviar = d => { if (conn && conn.open) conn.send(d); };
cv.addEventListener('pointerdown', e => {
  if (e.pointerType === 'pen') penViu = true;
  if (e.pointerType === 'touch' && penViu && !dedo) return; // com caneta, a mão encostada não risca
  if (!['slide', 'quadro', 'tela'].includes(est.cena)) return;
  e.preventDefault();
  if (atual && dono !== null && dono !== e.pointerId) return; // segundo dedo não rouba o traço
  $('#espbox').classList.add('hide');
  cv.setPointerCapture(e.pointerId);
  dono = e.pointerId;
  const p = ponto(e);
  const f = (e.buttons & 32) ? 'borracha' : ferr;
  if (f === 'selecao') { atual = iniciarSel(p); sujo = true; return; }
  if (sel) { sel = null; atualizarBotaoLimpar(); }
  if (f === 'borracha') { atual = {borracha: true}; enviar({t: 'apaga', pts: [p]}); return; }
  if (f === 'laser') { atual = {laser: true}; laser.push([...p, performance.now()]); enviar({t: 'laser', pts: [p]}); return; }
  const id = novoId();
  const pr = e.pointerType === 'pen';
  if (f === 'forma') {
    atual = {id, tipo: 'forma', cor, esp, base: esp, pts: [p], ini: p, f: formaArrasto(formaSel, p, [p[0] + 1, p[1] + 1])};
  } else {
    atual = {id, tipo: f, cor, esp: f === 'marca' ? espMarca(esp) : esp, base: esp, pr, pts: [p]};
    armarForma(atual);
  }
  minhas.set(id, atual);
  enviar({t: 'ini', id, tipo: f, cor, esp, pr, p, f: atual.f || null});
  sujo = true;
});
cv.addEventListener('pointermove', e => {
  if (!atual || (dono !== null && e.pointerId !== dono)) return;
  e.preventDefault();
  const novos = [];
  for (const ev of (e.getCoalescedEvents ? e.getCoalescedEvents() : [e])) {
    const p = ponto(ev);
    if (atual.laco || atual.arraste) { arrastarSel(p, e.shiftKey); sujo = true; continue; }
    if (atual.laser) { laser.push([...p, performance.now()]); novos.push(p); continue; }
    if (atual.borracha) { novos.push(p); continue; }
    if (atual.ini) { atual.f = formaArrasto(formaSel, atual.ini, p); continue; }
    if (atual.formado) { // virou forma mas a caneta seguiu andando: volta a ser traço
      const o = atual.antes.onde;
      if (Math.hypot(p[0] - o[0], p[1] - o[1]) < MEXEU_DESFAZ) continue;
      desfazerForma(atual);
      enviar({t: 'desforma', id: atual.id});
    }
    const u = atual.pts[atual.pts.length - 1];
    if (Math.hypot(p[0] - u[0], p[1] - u[1]) < 2) continue;
    atual.pts.push(p);
    if (Math.hypot(p[0] - u[0], p[1] - u[1]) > 3) armarForma(atual);
    novos.push(p);
  }
  if (atual.laco || atual.arraste) return;
  if (atual.ini) { enviar({t: 'forma', id: atual.id, f: atual.f}); sujo = true; return; }
  if (atual.formado) return;
  if (!novos.length) return;
  if (atual.laser) enviar({t: 'laser', pts: novos});
  else if (atual.borracha) enviar({t: 'apaga', pts: novos});
  else enviar({t: 'pts', id: atual.id, pts: novos});
  sujo = true;
});
const soltar = e => {
  if (e && dono !== null && e.pointerId !== dono) return; // soltou outro dedo: o traço continua
  dono = null;
  clearTimeout(seguraTimer);
  if (atual && (atual.laco || atual.arraste)) { soltarSel(); atual = null; sujo = true; return; }
  if (atual && atual.id) { atual.fim = true; delete atual.ini; delete atual.antes; enviar({t: 'fim', id: atual.id}); sujo = true; }
  atual = null;
};
cv.addEventListener('pointerup', soltar);
cv.addEventListener('pointercancel', soltar);
cv.addEventListener('lostpointercapture', soltar);
document.addEventListener('touchmove', e => e.preventDefault(), {passive: false}); // sem rolar/zoom sem querer

const cmd = (c, v) => enviar({t: 'cmd', c, v});
$('#mant').onclick = () => cmd('ant');
$('#mprox').onclick = () => cmd('prox');
$('#mdesfazer').onclick = () => { if (sel) { sel = null; atualizarBotaoLimpar(); sujo = true; } cmd('desfazer'); };
$('#mlimpar').onclick = () => {
  if (sel) { enviar({t: 'apagaIds', ids: [...sel.ids]}); sel = null; atualizarBotaoLimpar(); sujo = true; return; }
  cmd('limpar');
};
$('#mcamvis').onclick = () => cmd('camvis');
$('#mgravar').onclick = () => cmd('gravar');
$('#mpausar').onclick = () => cmd('pausar');
$('#mparar').onclick = () => { if (confirm('Parar a gravação?')) cmd('parar'); };
$('#mcenas').onclick = () => $('#cenas').classList.toggle('hide');
$$('#cenas [data-cena]').forEach(b => b.onclick = () => { cmd('cena', b.dataset.cena); $('#cenas').classList.add('hide'); });
$$('[data-f]').forEach(b => b.onclick = () => {
  ferr = b.dataset.f; $$('[data-f]').forEach(x => x.classList.toggle('on', x === b));
  if (ferr !== 'selecao' && sel) { sel = null; atualizarBotaoLimpar(); sujo = true; }
  $('#formas').classList.toggle('hide', ferr !== 'forma');
});
$$('#formas [data-forma]').forEach(b => b.onclick = () => {
  formaSel = b.dataset.forma;
  $$('#formas [data-forma]').forEach(x => x.classList.toggle('on', x === b));
  $('#formas').classList.add('hide');
});
$$('#mesa .cor').forEach(b => b.onclick = () => {
  cor = b.dataset.cor; $$('#mesa .cor').forEach(x => x.classList.toggle('on', x === b)); definirEsp(espN);
  if (ferr === 'laser' || ferr === 'borracha') $('[data-f=caneta]').click();
});
/* espessura de 1 a 100: botão abre a régua (deslizar + atalhos) */
function definirEsp(n) {
  espN = Math.min(100, Math.max(1, Math.round(+n) || ESP_PADRAO));
  esp = espDe(espN);
  try { localStorage.setItem('mesa-esp', espN); } catch (e) {}
  $('#mesp').innerHTML = `<i class="espb"></i>${espN}`;
  $('#espval').textContent = espN;
  $('#espslider').value = espN;
  const r = cv.getBoundingClientRect().width / W || .5, d = Math.max(2, Math.min(40, esp * r));
  for (const b of document.querySelectorAll('.espb')) { b.style.width = b.style.height = Math.min(d, b.closest('#mesp') ? 22 : 40) + 'px'; b.style.background = cor; }
}
$('#mesp').onclick = () => { $('#espbox').classList.toggle('hide'); $('#formas').classList.add('hide'); definirEsp(espN); };
$('#espslider').oninput = e => definirEsp(e.target.value);
$$('#espbox [data-esp]').forEach(b => b.onclick = () => definirEsp(b.dataset.esp));
$('#espmenos').onclick = () => definirEsp(espN - 1);
$('#espmais').onclick = () => definirEsp(espN + 1);
definirEsp(espN);
$('#mdedo').onclick = () => { dedo = !dedo; $('#mdedo').classList.toggle('on', dedo); };

$('#modomesa').onclick = async () => {
  modo = 'mesa';
  status('Conectando…');
  await turnPronto;
  if (!(await ligarPeer()) || !(await conectar('mesa'))) { modo = null; if (!$('#status').classList.contains('erro')) status('Não achei o Estúdio no PC. Ele está aberto?', true); return; }
  mostrar('mesa');
  ajustar();
  manterAcesa();
  try { await document.documentElement.requestFullscreen?.(); } catch (e) {}
  setTimeout(ajustar, 300);
};

/* início */
if (!codigo) {
  status('Abra esta página pelo QR code do Estúdio, no PC.', true);
  $('#modocam').disabled = $('#modomesa').disabled = true;
} else {
  turnPronto.then(ligarPeer).then(ok => { if (ok) status(`Pronto para conectar (${nome}). Escolha:`); });
}
window.aparelho = {get sel() { return sel; }, get lista() { return listaPC; }, get est() { return est; }, get modo() { return modo; }, get conn() { return conn; }};
})();
