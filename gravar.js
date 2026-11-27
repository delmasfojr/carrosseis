/* 🎙️ GRAVAR — o professor grava a narração dos vídeos que o Claude monta no PC (Gerador de Vídeo-aulas).
 *
 * 1. No PC, o fazer.py publica cada roteiro "minha voz" em gravar/roteiros.json (este app lê ao abrir a aba).
 * 2. Aqui: escolhe o roteiro, "Só a voz" ou "Com o rosto" (câmera da frente), e lê no teleprompter.
 *    Grava tudo de uma vez; errou, é só repetir a frase (no PC vale a ÚLTIMA vez que ela foi dita).
 *    Teleprompter karaokê: cada palavra acende no ritmo certo para o vídeo (🐢/🚶/🐇); gravando, as frases passam
 *    sozinhas. Tocar numa frase recomeça nela (para repetir); tocar no resto pula para a próxima.
 * 3. "📤 Mandar para o Drive": abre o compartilhar do celular; escolher Drive › pasta "Delmão - Minha voz".
 *    O nome do arquivo começa com o nome do vídeo, e é por ele que o PC acha a gravação certa.
 * A gravação fica guardada neste celular (IndexedDB) até ser apagada, mesmo fechando o app.
 * Microfone sem os filtros de chamada (eco/ruído/ganho): eles estragam a voz; a limpeza é feita no PC.
 */
const Gravar = (() => {
  const $ = s => document.querySelector(s);
  const BASE_G = new URL('./', location.href).href;
  let lista = [], atual = null, frase = 0, rec = null, pedacos = [], stream = null, inicio = 0, relogio = null;

  /* ---------- guarda local (gravações e status) ---------- */
  const db = () => new Promise((ok, erro) => {
    const r = indexedDB.open('gravar', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('g');
    r.onsuccess = () => ok(r.result);
    r.onerror = () => erro(r.error);
  });
  const guardar = async (id, v) => { const d = await db(); return new Promise(ok => { const t = d.transaction('g', 'readwrite'); t.objectStore('g').put(v, id); t.oncomplete = ok; }); };
  const pegar = async id => { const d = await db(); return new Promise(ok => { const r = d.transaction('g').objectStore('g').get(id); r.onsuccess = () => ok(r.result); r.onerror = () => ok(null); }); };
  const apagarG = async id => { const d = await db(); return new Promise(ok => { const t = d.transaction('g', 'readwrite'); t.objectStore('g').delete(id); t.oncomplete = ok; }); };
  const lerLS = (k, p) => { try { return JSON.parse(localStorage.getItem(k)) ?? p; } catch { return p; } };
  const gravarLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

  /* ---------- lista de roteiros ---------- */
  async function mostrar() {
    $('#gpronto').hidden = true;
    $('#glista').innerHTML = '<p class="dica">Buscando os roteiros…</p>';
    try {
      const r = await fetch(BASE_G + 'gravar/roteiros.json', {cache: 'no-store'});
      lista = r.ok ? (await r.json()).roteiros || [] : [];
    } catch { lista = lerLS('gravarCache', []); }
    if (lista.length) gravarLS('gravarCache', lista);
    const status = lerLS('gravarStatus', {});
    if (!lista.length) { $('#glista').innerHTML = '<p class="dica">Nenhum roteiro para gravar ainda. Quando o Claude preparar um vídeo com a sua voz, ele aparece aqui.</p>'; return; }
    $('#glista').innerHTML = '';
    for (const x of lista) {
      const st = status[x.id] || '';
      const b = document.createElement('button');
      b.className = 'gitem' + (st === 'enviado' ? ' feito' : '');
      b.innerHTML = `<b>${x.titulo}</b><small>${x.tipo || 'Vídeo'} · ${x.frases.length} frases · ~${Math.max(1, Math.round(x.segundos / 60))} min</small>` +
        `<em>${st === 'enviado' ? '✅ Enviado' : st === 'gravado' ? '🎙️ Gravado (falta mandar)' : '⏺ Gravar'}</em>`;
      b.onclick = () => abrir(x);
      $('#glista').append(b);
    }
  }

  async function abrir(x) {
    atual = x; frase = 0;
    $('#glista').hidden = true; $('#gfaixa').hidden = false;
    $('#gtitulo').textContent = x.titulo;
    $('#gmodo').value = lerLS('gravarModo', x.rosto ? 'rosto' : 'voz');
    montarTexto();
    const salvo = await pegar(x.id);
    mostrarPronto(salvo);
    window.scrollTo(0, 0);
  }

  function voltar() { parar(true); atual = null; $('#gfaixa').hidden = true; $('#glista').hidden = false; mostrar(); }

  function montarTexto() {
    const t = $('#gtexto');
    t.innerHTML = '';
    atual.frases.forEach((f, i) => {
      if (atual.cenas && atual.cenas.includes(i) && i > 0) t.append(document.createElement('hr'));
      const p = document.createElement('p');
      for (const w of f.split(/\s+/).filter(Boolean)) {
        const s = document.createElement('span');
        s.className = 'w';
        s.textContent = w + ' ';
        p.append(s);
      }
      p.onclick = e => { e.stopPropagation(); irPara(i, true); };
      t.append(p);
    });
    tempos = atual.frases.map(ritmo);
    irPara(0);
  }

  /* ---------- karaokê: cada palavra acende no tempo certo (ritmo do vídeo) ----------
     O tempo de cada palavra é proporcional às sílabas, com pausa na pontuação, na velocidade escolhida
     (🐢 1,8 / 🚶 2,2 / 🐇 3,3 palavras por segundo). Gravando, a frase passa sozinha. Tocar numa frase
     recomeça o karaokê nela (para repetir depois de errar); tocar no resto do texto pula para a próxima. */
  const RITMOS = {devagar: {v: 1.8, nome: '🐢 Devagar'}, normal: {v: 2.2, nome: '🚶 Normal'}, rapido: {v: 3.3, nome: '🐇 Rápido'}};
  const PAUSA_FRASE = 0.45;  // respiro entre uma frase e outra (s)
  let tempos = [], inicioFrase = 0, laco = null;
  const vel = () => (RITMOS[lerLS('gravarRitmo', 'normal')] || RITMOS.normal).v;
  function ritmo(f) {
    const pal = f.split(/\s+/).filter(Boolean);
    const silabas = w => /\d/.test(w) ? w.match(/\d/g).length * 1.5 + (/%/.test(w) ? 2 : 0)
      : (w.normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[aeiouy]+/gi) || []).length;
    const peso = pal.map(w => Math.max(1, silabas(w)));
    const pausa = pal.map((w, k) => k === pal.length - 1 ? 0 : /[.!?…:]$/.test(w) ? 2 : /[,;—–)]$/.test(w) ? 1 : 0);
    const total = peso.reduce((x, y) => x + y, 0) + pausa.reduce((x, y) => x + y, 0);
    const dur = pal.length / vel();
    const ini = [];
    let acc = 0;
    for (let k = 0; k < pal.length; k++) { ini.push(acc); acc += (peso[k] + pausa[k]) / total * dur; }
    return {ini, dur};
  }

  function irPara(i, reiniciar) {
    frase = Math.max(0, Math.min(atual.frases.length - 1, i));
    inicioFrase = performance.now();
    const ps = [...$('#gtexto').querySelectorAll('p')];
    ps.forEach((p, k) => {
      p.className = k < frase ? 'lida' : k === frase ? 'agora' : '';
      p.querySelectorAll('.w').forEach(w => w.className = 'w');
    });
    if (ps[frase]) ps[frase].scrollIntoView({block: 'center', behavior: 'smooth'});
  }

  function karaoke() {
    if (!rec || rec.state !== 'recording') return;
    const t = (performance.now() - inicioFrase) / 1000;
    const tf = tempos[frase];
    if (tf && t > tf.dur + PAUSA_FRASE && frase < atual.frases.length - 1) irPara(frase + 1);
    else if (tf) {
      const ws = $('#gtexto').querySelectorAll('p')[frase].querySelectorAll('.w');
      ws.forEach((w, k) => w.className = 'w' + (t >= tf.ini[k] ? (k === ws.length - 1 || t < tf.ini[k + 1] ? ' ja agora' : ' ja') : ''));
    }
    laco = setTimeout(karaoke, 50);
  }

  /* ---------- gravação ---------- */
  const tipos = video => (video
    ? ['video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm']
    : ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm']).find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';

  async function comecar() {
    const video = $('#gmodo').value === 'rosto';
    gravarLS('gravarModo', $('#gmodo').value);
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1},
        video: video ? {facingMode: 'user', width: {ideal: 1080}, height: {ideal: 1920}} : false,
      });
    } catch (e) { return alert('Não consegui abrir o ' + (video ? 'microfone/câmera' : 'microfone') + ': ' + e.message); }
    const prev = $('#gcam');
    prev.hidden = !video;
    if (video) { prev.srcObject = stream; prev.muted = true; prev.play().catch(() => {}); }
    pedacos = [];
    const mime = tipos(video);
    rec = new MediaRecorder(stream, mime ? {mimeType: mime, audioBitsPerSecond: 128000, videoBitsPerSecond: 4_000_000} : undefined);
    rec.ondataavailable = e => e.data.size && pedacos.push(e.data);
    rec.onstop = terminou;
    rec.start(1000);
    inicio = Date.now();
    $('#gbotao').textContent = '⏹ Parar';
    $('#gbotao').classList.add('gravando');
    $('#gpronto').hidden = true;
    document.body.classList.add('gravando-voz');
    irPara(0);
    clearTimeout(laco); karaoke();
    relogio = setInterval(() => { const s = Math.round((Date.now() - inicio) / 1000); $('#grelogio').textContent = `⏺ ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }, 500);
    try { await navigator.wakeLock?.request('screen'); } catch {}
  }

  function parar(descartar) {
    clearInterval(relogio);
    clearTimeout(laco);
    $('#grelogio').textContent = '';
    document.body.classList.remove('gravando-voz');
    $('#gbotao').textContent = '⏺ Gravar';
    $('#gbotao').classList.remove('gravando');
    if (rec && rec.state !== 'inactive') { if (descartar) rec.onstop = null; rec.stop(); }
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null;
    $('#gcam').hidden = true;
  }

  async function terminou() {
    const tipo = rec.mimeType || (pedacos[0] && pedacos[0].type) || 'audio/webm';
    const blob = new Blob(pedacos, {type: tipo});
    const ext = tipo.includes('mp4') ? (tipo.startsWith('video') ? 'mp4' : 'm4a') : 'webm';
    const g = {blob, ext, quando: Date.now(), segundos: Math.round((Date.now() - inicio) / 1000), video: tipo.startsWith('video')};
    if (blob.size < 2000) return alert('A gravação ficou vazia. Tente de novo.');
    await guardar(atual.id, g);
    const st = lerLS('gravarStatus', {}); st[atual.id] = 'gravado'; gravarLS('gravarStatus', st);
    mostrarPronto(g);
  }

  function mostrarPronto(g) {
    const box = $('#gpronto');
    if (!g) { box.hidden = true; return; }
    box.hidden = false;
    const url = URL.createObjectURL(g.blob);
    $('#gplay').innerHTML = g.video ? `<video src="${url}" controls playsinline></video>` : `<audio src="${url}" controls></audio>`;
    $('#ginfo').textContent = `Gravado em ${new Date(g.quando).toLocaleString('pt-BR')} · ${Math.floor(g.segundos / 60)}:${String(g.segundos % 60).padStart(2, '0')} · ${(g.blob.size / 1e6).toFixed(1)} MB`;
  }

  const nomeArquivo = g => `${atual.arquivo} - GRAVAÇÃO.${g.ext}`;

  async function mandar() {
    const g = await pegar(atual.id);
    if (!g) return;
    const arq = new File([g.blob], nomeArquivo(g), {type: g.blob.type});
    if (navigator.canShare && navigator.canShare({files: [arq]})) {
      try {
        await navigator.share({files: [arq], title: atual.titulo});
        const st = lerLS('gravarStatus', {}); st[atual.id] = 'enviado'; gravarLS('gravarStatus', st);
        alert('Pronto! Se escolheu o Drive, confira se foi para a pasta "Delmão - Minha voz". Depois é só avisar o Claude.');
      } catch (e) { if (e.name !== 'AbortError') alert('Não deu para compartilhar: ' + e.message + '\nUse o ⬇️ Baixar.'); }
    } else baixar();
  }

  async function baixar() {
    const g = await pegar(atual.id);
    if (!g) return;
    const a = Object.assign(document.createElement('a'), {href: URL.createObjectURL(g.blob), download: nomeArquivo(g)});
    document.body.append(a); a.click(); a.remove();
  }

  async function descartar() {
    if (!confirm('Apagar esta gravação do celular?')) return;
    await apagarG(atual.id);
    const st = lerLS('gravarStatus', {}); delete st[atual.id]; gravarLS('gravarStatus', st);
    mostrarPronto(null);
  }

  function iniciar() {
    $('#gvoltar').onclick = voltar;
    $('#gbotao').onclick = () => (rec && rec.state === 'recording' ? parar(false) : comecar());
    $('#gtexto').onclick = () => irPara(frase + 1);
    const nomeRitmo = () => { $('#gritmo').textContent = (RITMOS[lerLS('gravarRitmo', 'normal')] || RITMOS.normal).nome; };
    $('#gritmo').onclick = () => {
      const ord = Object.keys(RITMOS), at = Math.max(0, ord.indexOf(lerLS('gravarRitmo', 'normal')));
      gravarLS('gravarRitmo', ord[(at + 1) % ord.length]);
      nomeRitmo();
      if (atual) tempos = atual.frases.map(ritmo);
    };
    nomeRitmo();
    $('#gproxima').onclick = () => irPara(frase + 1);
    $('#ganterior').onclick = () => irPara(frase - 1);
    $('#gmandar').onclick = mandar;
    $('#gbaixar').onclick = baixar;
    $('#gdescartar').onclick = descartar;
    $('#gamais').onclick = () => { const t = $('#gtexto'); const v = Math.min(44, (parseFloat(getComputedStyle(t).fontSize) || 26) + 3); t.style.fontSize = v + 'px'; gravarLS('gravarFonte', v); };
    $('#gamenos').onclick = () => { const t = $('#gtexto'); const v = Math.max(16, (parseFloat(getComputedStyle(t).fontSize) || 26) - 3); t.style.fontSize = v + 'px'; gravarLS('gravarFonte', v); };
    const f = lerLS('gravarFonte', 0); if (f) $('#gtexto').style.fontSize = f + 'px';
  }

  return {iniciar, mostrar};
})();
Gravar.iniciar();
