/* Estúdio: celular como webcam e tablet como mesa de escrever.
   O PC fica esperando com um código fixo (QR code). O aparelho abre aparelho.html#código e se conecta.
   Só o "aperto de mão" passa pelo servidor gratuito do PeerJS; vídeo e traços vão direto pelo Wi-Fi (WebRTC). */
const $ = s => document.querySelector(s);
const W = 1920, H = 1080;
let E = null, peer = null, codigo = '';
const conexoes = new Map(); // id do aparelho → DataConnection

function novoCodigo() {
  const l = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), b => l[b % l.length]).join('');
}
function lerCodigo() {
  try {
    let c = localStorage.getItem('estudio-codigo');
    if (!c) { c = novoCodigo(); localStorage.setItem('estudio-codigo', c); }
    return c;
  } catch (e) { return novoCodigo(); }
}
const linkAparelho = () => new URL('aparelho.html', location.href).href + '#' + codigo;

function estadoPeer(t) { $('#estadopeer').textContent = t; }

function ligarPeer() {
  if (!window.Peer) { estadoPeer('Sem a biblioteca de conexão (sem internet?)'); return; }
  peer = new window.Peer('delmao-estudio-' + codigo, {debug: 0});
  peer.on('open', () => estadoPeer('✅ Pronto. Esperando o aparelho…'));
  peer.on('error', e => {
    if (e.type === 'unavailable-id') { // esse código já está aberto em outra aba
      estadoPeer('Esse estúdio já está aberto em outra aba. Feche a outra e recarregue esta.');
    } else if (e.type === 'peer-unavailable') {
      // ignora: aparelho saiu
    } else estadoPeer('Conexão: ' + e.type);
  });
  peer.on('disconnected', () => { estadoPeer('Reconectando…'); setTimeout(() => peer && !peer.destroyed && peer.reconnect(), 2000); });
  peer.on('connection', conn => {
    conn.on('open', () => {
      const m = conn.metadata || {};
      const r = E.remotos.get(conn.peer) || {};
      Object.assign(r, {nome: m.nome || 'Aparelho', tipo: m.tipo || 'mesa', conn});
      E.remotos.set(conn.peer, r);
      conexoes.set(conn.peer, conn);
      mostrarAparelhos();
      if (r.tipo === 'mesa') { avisar(); fundo(true); tracos(true); }
      $('#modal').classList.add('hide');
    });
    conn.on('data', d => receber(conn, d));
    const sair = () => {
      conexoes.delete(conn.peer);
      const r = E.remotos.get(conn.peer);
      if (r && r.conn === conn) {
        if (r.stream && E.pref.cam === 'remoto:' + conn.peer) { r.stream = null; E.abrirCam(); }
        E.remotos.delete(conn.peer);
      }
      mostrarAparelhos(); E.listarAparelhos();
    };
    conn.on('close', sair);
    conn.on('error', sair);
  });
  peer.on('call', call => { // celular mandando a câmera
    call.answer();
    call.on('stream', stream => {
      const r = E.remotos.get(call.peer) || {nome: call.metadata?.nome || 'Celular', tipo: 'camera'};
      r.stream = stream; r.call = call;
      E.remotos.set(call.peer, r);
      E.pref.cam = 'remoto:' + call.peer; E.salvarPref();
      if (!E.pref.atraso) { E.pref.atraso = 150; $('#atraso').value = 150; $('#atrasoval').textContent = '150 ms'; E.montarCadeia(); }
      E.abrirCam().then(() => E.listarAparelhos());
      mostrarAparelhos();
      E.info('📱 Câmera do ' + r.nome + ' ligada');
    });
    call.on('close', () => {
      const r = E.remotos.get(call.peer);
      if (r && r.call === call) {
        r.stream = null;
        if (E.pref.cam === 'remoto:' + call.peer) { E.pref.cam = ''; E.abrirCam().then(() => E.listarAparelhos()); }
      }
      mostrarAparelhos();
    });
  });
}

function mostrarAparelhos() {
  const box = $('#aparelhos');
  box.innerHTML = '';
  for (const [, r] of E.remotos) {
    const d = document.createElement('div');
    d.className = 'aparelho';
    const ic = document.createElement('span'); ic.textContent = r.tipo === 'camera' ? '📷' : '✍️';
    const b = document.createElement('b'); b.textContent = r.nome;
    const s = document.createElement('small'); s.textContent = r.tipo === 'camera' ? (r.stream ? 'câmera ligada' : 'conectando…') : 'mesa';
    d.append(ic, b, s);
    box.append(d);
  }
}

/* ---------- PC → mesa ---------- */
function enviar(d, soMesa = true) {
  for (const [id, c] of conexoes) {
    const r = E.remotos.get(id);
    if (c.open && (!soMesa || r?.tipo === 'mesa')) { try { c.send(d); } catch (e) {} }
  }
}
const temMesa = () => [...E.remotos.values()].some(r => r.tipo === 'mesa' && r.conn?.open);

function avisar(extra) {
  if (!temMesa()) return;
  enviar({t: 'estado', cena: E.cena, pagina: E.pagina, nPag: E.nPag, qPag: E.qPag, aula: E.aula,
    gravando: E.gravando, pausado: E.pausado, tempo: Math.round(E.tempo), camvis: E.camvisOn, chave: E.chaveRisco(), ...extra});
}
function mensagem(t) { enviar({t: 'msg', texto: t}); }

let ultimoFundo = '', fundoTimer = null;
async function fundo(forcar) {
  if (!temMesa()) return;
  avisar();
  const chave = E.cena + '|' + E.chaveRisco();
  if (!forcar && chave === ultimoFundo && E.cena !== 'tela') return;
  ultimoFundo = chave;
  clearTimeout(fundoTimer);
  let img = null;
  if (E.cena === 'slide' && E.nPag) img = await E.renderizar(E.pagina).catch(() => null);
  else if (E.cena === 'tela') {
    const f = E.telaFonte();
    if (f && f.img && f.w) img = f.img;
    fundoTimer = setTimeout(() => E.cena === 'tela' && fundo(true), 2500); // a tela muda: manda de novo
  }
  if (chave !== E.cena + '|' + E.chaveRisco()) return; // mudou enquanto renderizava
  if (!img) { enviar({t: 'fundo', chave, img: null}); return; }
  const c = new OffscreenCanvas(1600, 900), cx = c.getContext('2d');
  const iw = img.displayWidth || img.width, ih = img.displayHeight || img.height;
  const e = Math.min(1600 / iw, 900 / ih);
  cx.fillStyle = '#000'; cx.fillRect(0, 0, 1600, 900);
  cx.drawImage(img, (1600 - iw * e) / 2, (900 - ih * e) / 2, iw * e, ih * e);
  const blob = await c.convertToBlob({type: 'image/jpeg', quality: .82});
  enviar({t: 'fundo', chave, img: await blob.arrayBuffer()});
}

let ultimosTracos = 0;
function tracos(forcar) {
  if (!temMesa()) return true;
  const agora = performance.now();
  if (!forcar && agora - ultimosTracos < 70) return false;
  ultimosTracos = agora;
  const lista = E.podeRiscar() ? E.tracos().map(t => ({id: t.id, tipo: t.tipo, cor: t.cor, esp: t.esp, pr: !!t.pr, fim: !!t.fim,
    f: t.f || null, pts: t.tipo === 'forma' ? [] : t.pts.map(p => [Math.round(p[0]), Math.round(p[1]), Math.round((p[2] ?? .5) * 100) / 100])})) : [];
  enviar({t: 'tracos', chave: E.chaveRisco(), lista});
  return true;
}

/* ---------- mesa → PC ---------- */
const emCurso = new Map();
function receber(conn, d) {
  if (!d || typeof d !== 'object') return;
  switch (d.t) {
    case 'ini': {
      if (!E.podeRiscar()) return;
      const tipo = ['marca', 'forma'].includes(d.tipo) ? d.tipo : 'caneta';
      const t = {id: String(d.id), tipo, cor: String(d.cor).slice(0, 9), pr: !!d.pr,
        esp: Math.min(60, +d.esp || 7) * (tipo === 'marca' ? 4 : 1), pts: [[+d.p[0], +d.p[1], +(d.p[2] ?? .5)]], f: forma(d.f)};
      E.tracos().push(t); E.historico().push({add: t});
      emCurso.set(t.id, t); E.sujar();
      break;
    }
    case 'pts': {
      const t = emCurso.get(String(d.id));
      if (!t || !Array.isArray(d.pts)) return;
      for (const p of d.pts) t.pts.push([+p[0], +p[1], +(p[2] ?? .5)]);
      E.sujar();
      break;
    }
    case 'forma': { // virou forma (segurou parado) ou a forma está sendo arrastada
      const t = emCurso.get(String(d.id));
      if (!t) return;
      const f = forma(d.f);
      if (!f) return;
      t.tipo = 'forma'; t.f = f;
      if (t.esp > 40) t.esp = Math.round(t.esp / 4);
      E.sujar();
      break;
    }
    case 'fim': {
      const t = emCurso.get(String(d.id));
      if (t) t.fim = true;
      emCurso.delete(String(d.id)); E.sujar(); tracos(true); break;
    }
    case 'laser': if (Array.isArray(d.pts)) for (const p of d.pts) E.laser([+p[0], +p[1], performance.now()]); break;
    case 'apaga': if (Array.isArray(d.pts)) for (const p of d.pts) E.apagarEm(+p[0], +p[1]); break;
    case 'cmd': comando(d.c, d.v); break;
  }
}
/* forma vinda do tablet: só números, só os tipos conhecidos */
function forma(f) {
  if (!f || typeof f !== 'object') return null;
  const n = v => Number.isFinite(+v) ? +v : 0, pt = q => [n(q && q[0]), n(q && q[1])];
  if (f.k === 'reta' || f.k === 'seta') return {k: f.k, a: pt(f.a), b: pt(f.b)};
  if (f.k === 'elipse') return {k: 'elipse', cx: n(f.cx), cy: n(f.cy), rx: n(f.rx), ry: n(f.ry)};
  if (f.k === 'ret' || f.k === 'eixos') return {k: f.k, x: n(f.x), y: n(f.y), w: n(f.w), h: n(f.h)};
  if (f.k === 'poli' && Array.isArray(f.p)) return {k: 'poli', p: f.p.slice(0, 12).map(pt)};
  return null;
}
function comando(c, v) {
  if (c === 'prox') E.proximo();
  else if (c === 'ant') E.anterior();
  else if (c === 'cena' && ['camera', 'slide', 'quadro', 'vinheta', 'tela'].includes(v)) {
    if (v === 'tela' && !E.telaFonte()) return mensagem('Para a cena Tela, comece o compartilhamento no PC (tecla 4).');
    E.trocarCena(v);
  }
  else if (c === 'desfazer') E.desfazer();
  else if (c === 'limpar') E.limparSlide();
  else if (c === 'camvis') E.camvis();
  else if (c === 'gravar') E.gravar(true);
  else if (c === 'pausar') E.pausar();
  else if (c === 'parar') E.parar();
  setTimeout(() => { avisar(); tracos(true); }, 30);
}

/* ---------- pasta das gravações ---------- */
function idbPasta(valor) {
  return new Promise((ok, erro) => {
    const r = indexedDB.open('estudio', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => {
      const t = r.result.transaction('kv', valor === undefined ? 'readonly' : 'readwrite').objectStore('kv');
      const q = valor === undefined ? t.get('pastaRec') : t.put(valor, 'pastaRec');
      q.onsuccess = () => ok(q.result); q.onerror = () => erro(q.error);
    };
    r.onerror = () => erro(r.error);
  });
}
async function iniciarPastaRec() {
  if (!('showDirectoryPicker' in window)) { $('#pastarecbox').classList.add('hide'); return; }
  try {
    const h = await idbPasta();
    if (h) { E.pastaRec = h; $('#pastarecnome').textContent = h.name; $('#pastarec').textContent = 'Trocar pasta das gravações'; }
  } catch (e) {}
  $('#pastarec').onclick = async () => {
    try {
      const h = await window.showDirectoryPicker({id: 'estudio-gravacoes', mode: 'readwrite', startIn: 'videos'});
      await idbPasta(h);
      E.pastaRec = h;
      $('#pastarecnome').textContent = h.name;
      $('#pastarec').textContent = 'Trocar pasta das gravações';
    } catch (e) { if (e.name !== 'AbortError') alert(e.message); }
  };
}

export function iniciar(estudio) {
  E = estudio;
  codigo = lerCodigo();
  E.registrar({avisar, mensagem, fundo: () => fundo(), tracos: () => tracos()});
  $('#atraso').value = E.pref.atraso || 0;
  $('#atrasoval').textContent = (E.pref.atraso || 0) + ' ms';
  $('#atraso').oninput = e => {
    E.pref.atraso = +e.target.value; E.salvarPref(); E.montarCadeia();
    $('#atrasoval').textContent = E.pref.atraso + ' ms';
  };
  $('#conectar').onclick = () => {
    const url = linkAparelho();
    $('#linkaparelho').textContent = url;
    const qr = window.qrcode(0, 'M'); qr.addData(url); qr.make();
    $('#qr').innerHTML = qr.createSvgTag({cellSize: 6, margin: 2, scalable: true});
    $('#modal').classList.remove('hide');
    if (!peer || peer.destroyed) ligarPeer();
  };
  $('#fecharmodal').onclick = () => $('#modal').classList.add('hide');
  $('#modal').onclick = e => { if (e.target.id === 'modal') $('#modal').classList.add('hide'); };
  setInterval(() => { if (E.gravando) avisar(); }, 1000);
  iniciarPastaRec();
  ligarPeer(); // já fica esperando: o aparelho pareado antes conecta sozinho
  window.estudioRemoto = {get codigo() { return codigo; }, get peer() { return peer; }};
}
