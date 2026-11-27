/* 🎙️ GRAVAR — o professor grava a narração dos vídeos que o Claude monta no PC (Gerador de Vídeo-aulas).
 *
 * 1. No PC, o fazer.py publica cada roteiro "minha voz" em gravar/roteiros.json (este app lê ao abrir a aba).
 * 2. Aqui: escolhe o roteiro, "Só a voz" ou "Com o rosto" (câmera da frente), e lê no teleprompter.
 *    Grava tudo de uma vez; errou, é só repetir a frase (no PC vale a ÚLTIMA vez que ela foi dita).
 *    Teleprompter karaokê: cada palavra acende no ritmo certo para o vídeo (🐢/🚶/🐇); gravando, as frases passam
 *    sozinhas. Tocar numa frase recomeça nela (para repetir); tocar no resto pula para a próxima.
 * 3. "📤 Mandar para o Drive": abre o compartilhar do celular; escolher Drive › pasta "Delmão - Minha voz".
 *    O nome do arquivo começa com o nome do vídeo, e é por ele que o PC acha a gravação certa.
 * EM BLOCOS (modo "Só a voz, em blocos"; o professor também pode escolher "tudo de uma vez", um take só): cada cena do roteiro é um bloco; grava um de cada vez (errou, regrava só aquele),
 *    e no fim o app junta os blocos num WAV só (0,4 s de silêncio entre eles) para mandar ao Drive.
 *    "Com o rosto" continua sendo uma gravação inteira (juntar vídeo no celular é pesado).
 * A gravação fica guardada neste celular (IndexedDB) até ser apagada, mesmo fechando o app.
 * Microfone sem os filtros de chamada (eco/ruído/ganho): eles estragam a voz; a limpeza é feita no PC.
 */
const Gravar = (() => {
  const $ = s => document.querySelector(s);
  const BASE_G = new URL('./', location.href).href;
  let bloco = 0;  // bloco (cena) atual no modo em blocos
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
    // os roteiros montados aqui no app (aba Roteiros) também entram, depois dos que vieram do PC
    let doApp = [];
    try { doApp = (await tx('readonly', s => s.getAll(), 'r')).sort((a, b) => b.id.localeCompare(a.id)).map(deRoteiro).filter(Boolean); } catch {}
    if (!lista.length && !doApp.length) { $('#glista').innerHTML = '<p class="dica">Nenhum roteiro para gravar ainda. Monte um na aba Roteiros, ou espere o Claude preparar um vídeo com a sua voz.</p>'; return; }
    $('#glista').innerHTML = '';
    const titulo = t => { const h = document.createElement('h3'); h.textContent = t; $('#glista').append(h); };
    if (lista.length && doApp.length) titulo('💻 Do computador');
    if (doApp.length) { lista = lista.concat(doApp); }
    let primeiroApp = true;
    for (const x of lista) {
      if (x.doApp && primeiroApp) { titulo('🎬 Meus roteiros do app'); primeiroApp = false; }
      const st = status[x.id] || '';
      const b = document.createElement('button');
      b.className = 'gitem' + (st === 'enviado' ? ' feito' : '');
      b.innerHTML = `<b>${x.titulo}</b><small>${x.tipo || 'Vídeo'} · ${x.frases.length} frases · ~${Math.max(1, Math.round(x.segundos / 60))} min</small>` +
        `<em>${st === 'enviado' ? '✅ Enviado' : st === 'gravado' ? '🎙️ Gravado (falta mandar)' : '⏺ Gravar'}</em>`;
      b.onclick = () => abrir(x);
      $('#glista').append(b);
    }
  }

  /** Converte um roteiro da aba Roteiros (gancho escolhido + falas dos blocos) no formato do teleprompter:
      cada bloco vira uma cena (gravada à parte) e cada fala é quebrada em frases. */
  function deRoteiro(item) {
    const c = item && item.conteudo;
    if (!c || !c.blocos) return null;
    const falas = [(c.ganchos || [])[item.gancho || 0] || (c.ganchos || [])[0], ...c.blocos.map(b => b.fala)].filter(f => f && f.trim());
    const frases = [], cenas = [];
    for (const f of falas) {
      cenas.push(frases.length);
      const pedacos = (f.replace(/\s+/g, ' ').match(/[^.!?…]+[.!?…]*["”']?/g) || [f]).map(t => t.trim()).filter(Boolean);
      frases.push(...pedacos);
    }
    if (!frases.length) return null;
    const tema = c.tema || 'Roteiro';
    const palavras = frases.join(' ').split(/\s+/).length;
    return {id: 'app-' + item.id, titulo: tema, arquivo: tema.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90) + ' (minha voz)',
      tipo: 'Roteiro do app', frases, cenas, segundos: Math.round(palavras / 2.2), doApp: true};
  }

  async function abrir(x) {
    atual = x; frase = 0;
    $('#glista').hidden = true; $('#gfaixa').hidden = false;
    $('#gtitulo').textContent = x.titulo;
    $('#gmodo').value = lerLS('gravarModo', x.rosto ? 'rosto' : 'voz');
    montarTexto();
    bloco = 0;
    const salvo = await pegar(x.id);
    mostrarPronto(salvo);
    await mostrarBlocos();
    window.scrollTo(0, 0);
  }

  /* ---------- blocos (uma cena = um bloco) ---------- */
  const emBlocos = () => $('#gmodo').value === 'voz';  // 'vozinteira' e 'rosto' gravam tudo num take só
  const blocos = () => {
    const c = (atual.cenas && atual.cenas.length ? atual.cenas : [0]).concat(atual.frases.length);
    return c.slice(0, -1).map((ini, k) => [ini, c[k + 1]]).filter(([a, b]) => b > a);
  };
  const chaveB = k => `${atual.id}#b${k}`;

  async function mostrarBlocos() {
    const box = $('#gblocos');
    box.hidden = !emBlocos();
    $('#gtexto').querySelectorAll('p, hr').forEach(el => { el.style.display = ''; });
    $('#gtake').innerHTML = '';
    $('#gfaltam').hidden = !emBlocos();
    if (!emBlocos()) { $('#gbotao').textContent = '⏺ Gravar'; return; }
    const bs = blocos();
    bloco = Math.min(bloco, bs.length - 1);
    const feitos = await Promise.all(bs.map((_, k) => pegar(chaveB(k))));
    box.innerHTML = '';
    bs.forEach((_, k) => {
      const b = document.createElement('button');
      b.className = 'gbloco' + (k === bloco ? ' on' : '') + (feitos[k] ? ' ok' : '');
      b.textContent = `${feitos[k] ? '✅' : '⏺'} ${k + 1}`;
      b.onclick = () => { if (!(rec && rec.state === 'recording')) { bloco = k; mostrarBlocos(); } };
      box.append(b);
    });
    // só as frases do bloco atual no teleprompter
    const [a, z] = bs[bloco];
    $('#gtexto').querySelectorAll('p').forEach((el, i) => { el.style.display = i >= a && i < z ? '' : 'none'; });
    $('#gtexto').querySelectorAll('hr').forEach(el => { el.style.display = 'none'; });
    const tk = feitos[bloco];
    if (tk) $('#gtake').innerHTML = `<audio src="${URL.createObjectURL(tk.blob)}" controls></audio>`;
    $('#gbotao').textContent = tk ? `🔁 Regravar o bloco ${bloco + 1}` : `⏺ Gravar o bloco ${bloco + 1}`;
    const faltam = feitos.filter(x => !x).length;
    $('#gfaltam').textContent = faltam ? `Bloco ${bloco + 1} de ${bs.length} · faltam ${faltam}` : 'Todos os blocos gravados! Confira abaixo e mande para o Drive.';
    irPara(a);
    if (!faltam) await juntarBlocos(feitos);
  }

  /** Junta os blocos num WAV mono (0,4 s de silêncio entre eles), que vira a gravação a mandar. */
  async function juntarBlocos(feitos) {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const taxa = ctx.sampleRate, partes = [];
    for (const f of feitos) {
      const buf = await ctx.decodeAudioData(await f.blob.arrayBuffer());
      const mono = new Float32Array(buf.length);
      for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) mono[i] += d[i] / buf.numberOfChannels; }
      partes.push(mono, new Float32Array(Math.round(taxa * 0.4)));
    }
    ctx.close();
    const n = partes.reduce((s, x) => s + x.length, 0);
    const dv = new DataView(new ArrayBuffer(44 + n * 2));
    const txt = (o, t) => [...t].forEach((ch, i) => dv.setUint8(o + i, ch.charCodeAt(0)));
    txt(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); txt(8, 'WAVE'); txt(12, 'fmt ');
    dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, taxa, true);
    dv.setUint32(28, taxa * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); txt(36, 'data'); dv.setUint32(40, n * 2, true);
    let o = 44;
    for (const x of partes) for (let i = 0; i < x.length; i++, o += 2) dv.setInt16(o, Math.max(-1, Math.min(1, x[i])) * 32767, true);
    const g = {blob: new Blob([dv], {type: 'audio/wav'}), ext: 'wav', quando: Date.now(), segundos: Math.round(n / taxa), video: false};
    await guardar(atual.id, g);
    const st = lerLS('gravarStatus', {}); st[atual.id] = 'gravado'; gravarLS('gravarStatus', st);
    mostrarPronto(g);
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
    const limite = emBlocos() ? blocos()[bloco][1] - 1 : atual.frases.length - 1;
    if (tf && t > tf.dur + PAUSA_FRASE && frase < limite) irPara(frase + 1);
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
    irPara(emBlocos() ? blocos()[bloco][0] : 0);
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
    if (atual && emBlocos() && descartar) mostrarBlocos();
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
    if (emBlocos()) {  // guarda o bloco e vai para o próximo que falta
      await guardar(chaveB(bloco), g);
      const bs = blocos(), feitos = await Promise.all(bs.map((_, k) => pegar(chaveB(k))));
      const prox = feitos.findIndex((x, k) => !x && k > bloco);
      const qualquer = feitos.findIndex(x => !x);
      bloco = prox >= 0 ? prox : qualquer >= 0 ? qualquer : bloco;
      return mostrarBlocos();
    }
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
    if (emBlocos()) for (let k = 0; k < blocos().length; k++) await apagarG(chaveB(k));
    const st = lerLS('gravarStatus', {}); delete st[atual.id]; gravarLS('gravarStatus', st);
    bloco = 0;
    mostrarPronto(null);
    mostrarBlocos();
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
    $('#gmodo').onchange = () => { gravarLS('gravarModo', $('#gmodo').value); if (atual) { irPara(0); mostrarBlocos(); } };
    $('#gmandar').onclick = mandar;
    $('#gbaixar').onclick = baixar;
    $('#gdescartar').onclick = descartar;
    $('#gamais').onclick = () => { const t = $('#gtexto'); const v = Math.min(44, (parseFloat(getComputedStyle(t).fontSize) || 26) + 3); t.style.fontSize = v + 'px'; gravarLS('gravarFonte', v); };
    $('#gamenos').onclick = () => { const t = $('#gtexto'); const v = Math.max(16, (parseFloat(getComputedStyle(t).fontSize) || 26) - 3); t.style.fontSize = v + 'px'; gravarLS('gravarFonte', v); };
    const f = lerLS('gravarFonte', 0); if (f) $('#gtexto').style.fontSize = f + 'px';
  }

  return {iniciar, mostrar, abrir, deRoteiro};
})();
Gravar.iniciar();
