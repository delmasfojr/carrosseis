/* Grava o Reels dentro do app, bloco a bloco, e monta o vídeo final já editado:
   corta os silêncios do começo/fim de cada take, põe o texto de cada bloco na tela, legenda palavra por palavra,
   barra de progresso, @DELMAOSIMPLIFICA, cena "tela" com a conta grande e o professor num círculo, mascote no final.
   Tudo roda no celular (câmera + MediaRecorder + canvas), sem servidor e sem gastar IA. */
const Gravador = (() => {
  const W = 1080, H = 1920, NAVY = '#0F1B2D', LAR = '#FF7A00', CREME = '#FFF6E6';
  const TIPOS = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a', 'video/mp4',
    'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  const tipo = () => TIPOS.find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
  const CENA = {camera: '🎥 CÂMERA', quadro: '🧑‍🏫 QUADRO', tela: '📱 TELA'};
  const espera = ms => new Promise(r => setTimeout(r, ms));
  let item, salvar, aoFim, blocos, i = 0, stream = null, facing = 'user', rec = null, gravando = false, revendo = false, trava = null, t0 = 0, ui = null;
  const g = id => ui.querySelector('#' + id);

  /* ---------------------------------------------------------------- tela de gravação */
  function criarUI() {
    if (ui) return;
    const st = document.createElement('style');
    st.textContent = `
#grav{position:fixed;inset:0;z-index:60;background:#000;color:#fff;overflow:hidden}
#gprev,#grav canvas{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
#grav canvas{object-fit:contain;background:#000}
#gprev.espelho{transform:scaleX(-1)}
#gfala{position:absolute;left:0;right:0;top:0;padding:calc(12px + env(safe-area-inset-top)) 18px 46px;background:linear-gradient(#000e 72%,#0000);font:700 24px/1.32 'Open Sans',sans-serif;text-align:center}
#gfala small{display:block;color:#FF7A00;font-size:13px;letter-spacing:1px;margin-bottom:6px}
#gfala .gq{display:block;font-size:16px;font-weight:600;color:#ffe2bf;margin-top:8px}
#gconta{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:150px 'Anton',Impact,sans-serif;text-shadow:0 0 24px #000;pointer-events:none;text-align:center}
#gconta.peq{font:700 22px 'Open Sans',sans-serif;padding:0 30px}
#gbarra{position:absolute;left:0;right:0;bottom:0;background:linear-gradient(#0000,#000d 32%);padding:34px 10px calc(10px + env(safe-area-inset-bottom))}
#gpontos{display:flex;gap:7px;justify-content:center}
#gpontos span{width:13px;height:13px;border-radius:50%;background:#fff4;border:2px solid transparent}
#gpontos span.ok{background:#3c3}
#gpontos span.at{border-color:#FF7A00}
#ginfo{text-align:center;font-size:14px;margin-top:6px;font-weight:700}
.glinha{display:flex;gap:8px;justify-content:center;align-items:center;margin-top:10px}
.glinha button{background:#333d;color:#fff;padding:11px 13px;font-size:15px}
#grec{width:76px;height:76px;border-radius:50%;padding:0;background:#e22;border:6px solid #fff;transition:border-radius .2s}
#grec.on{border-radius:18px;background:#e22;animation:pisca 1s infinite}
@keyframes pisca{50%{opacity:.6}}
#gmontar{background:#FF7A00 !important}
#grav button:disabled{opacity:.35}`;
    document.head.appendChild(st);
    ui = document.createElement('div'); ui.id = 'grav'; ui.hidden = true;
    ui.innerHTML = `<video id="gprev" playsinline muted autoplay></video>
      <div id="gfala"></div><div id="gconta"></div>
      <div id="gbarra"><div id="gpontos"></div><div id="ginfo"></div>
        <div class="glinha"><button id="gant">◀</button><button id="gvirar" title="Trocar câmera">🔄</button>
          <button id="grec" title="Gravar"></button><button id="gver">▶ Ver</button><button id="gprox">▶</button></div>
        <div class="glinha"><button id="gfechar">✕ Sair</button><button id="gmontar">🎬 Montar vídeo</button></div></div>`;
    document.body.appendChild(ui);
    g('grec').onclick = () => gravando ? parar() : gravar();
    g('gant').onclick = () => irPara(i - 1);
    g('gprox').onclick = () => irPara(i + 1);
    g('gvirar').onclick = () => ligarCamera(facing === 'user' ? 'environment' : 'user').catch(erroCamera);
    g('gver').onclick = () => revendo ? voltarCamera() : rever();
    g('gfechar').onclick = fechar;
    g('gmontar').onclick = () => montar().catch(e => { conta(''); alert('Não consegui montar: ' + e.message); fechar(); });
  }

  function montarBlocos(it) {
    const c = it.conteudo;
    return [{tempo: '0–3 s', cena: 'camera', fala: c.ganchos[it.gancho || 0], quadro: '', texto_tela: c.texto_capa, gancho: true}, ...c.blocos];
  }
  const takes = () => item.takes || (item.takes = []);
  const conta = (t, peq) => { g('gconta').textContent = t; g('gconta').classList.toggle('peq', !!peq); };

  function atualizar() {
    const b = blocos[i];
    g('gfala').innerHTML = `<small>BLOCO ${i + 1} DE ${blocos.length} · ${b.gancho ? 'GANCHO' : esc(CENA[b.cena] || b.cena)} · ${esc(b.tempo)}</small>${esc(b.fala)}` +
      (b.cena !== 'camera' && b.quadro ? `<span class="gq">${b.cena === 'quadro' ? 'No quadro' : 'Na tela'}: ${esc(b.quadro)}</span>` : '');
    g('gpontos').innerHTML = blocos.map((_, k) => `<span class="${takes()[k] ? 'ok' : ''} ${k === i ? 'at' : ''}"></span>`).join('');
    const tk = takes()[i];
    g('ginfo').textContent = gravando ? 'Gravando… toque no botão para parar' :
      revendo ? 'Vendo o take' : tk ? `Take gravado (${tk.dur.toFixed(1)} s). Grave de novo se quiser.` : 'Toque no botão vermelho para gravar este bloco';
    g('grec').classList.toggle('on', gravando);
    for (const id of ['gant', 'gprox', 'gvirar', 'gver', 'gmontar', 'gfechar']) g(id).disabled = gravando;
    g('gant').disabled ||= i === 0;
    g('gprox').disabled ||= i === blocos.length - 1;
    g('gver').disabled ||= !tk;
    g('gver').textContent = revendo ? '📷 Câmera' : '▶ Ver';
    g('gmontar').disabled ||= blocos.some((_, k) => !takes()[k]);
    g('grec').disabled = revendo;
  }

  /* ---------------------------------------------------------------- câmera */
  function pararCamera() { if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; }
  async function ligarCamera(forcar) {
    const tk = takes()[i];
    const quer = forcar || (tk && tk.facing) || (blocos[i].cena === 'quadro' ? 'environment' : 'user');
    if (!(stream && facing === quer && stream.active)) {
      pararCamera(); facing = quer;
      stream = await navigator.mediaDevices.getUserMedia({
        video: {facingMode: facing, width: {ideal: 1080}, height: {ideal: 1920}, frameRate: {ideal: 30}},
        audio: {echoCancellation: true, noiseSuppression: true}});
    }
    const v = g('gprev');
    if (v.srcObject !== stream) v.srcObject = stream;
    v.classList.toggle('espelho', facing === 'user');
    await v.play().catch(() => {});
  }
  const erroCamera = e => alert('Não consegui abrir a câmera. Permita o uso da câmera e do microfone para este site.\n(' + e.message + ')');

  async function irPara(k) {
    if (k < 0 || k >= blocos.length) return;
    if (revendo) voltarCamera();
    i = k; atualizar();
    await ligarCamera().catch(erroCamera);
  }

  async function gravar() {
    if (!stream) return erroCamera(new Error('câmera desligada'));
    g('grec').disabled = true;
    for (const n of [3, 2, 1]) { conta(n); await espera(700); }
    conta('');
    const mt = tipo(), partes = [];
    rec = new MediaRecorder(stream, {...(mt ? {mimeType: mt} : {}), videoBitsPerSecond: 5e6});
    rec.ondataavailable = e => { if (e.data.size) partes.push(e.data); };
    rec.onstop = async () => {
      const blob = new Blob(partes, {type: (rec.mimeType || mt || 'video/webm').split(';')[0]});
      takes()[i] = {blob, dur: (Date.now() - t0) / 1000, facing};
      gravando = false;
      try { await salvar(item); } catch (e) { alert('Não consegui guardar o take: ' + e.message); }
      if (i < blocos.length - 1) await irPara(i + 1); else atualizar();
    };
    rec.start(1000); t0 = Date.now(); gravando = true; atualizar();
  }
  function parar() { if (rec && rec.state !== 'inactive') rec.stop(); }

  function rever() {
    const tk = takes()[i]; if (!tk) return;
    const v = g('gprev');
    revendo = true;
    v.srcObject = null; v.src = URL.createObjectURL(tk.blob); v.muted = false; v.controls = true;
    v.classList.toggle('espelho', tk.facing === 'user');
    v.onended = voltarCamera; v.play().catch(() => {});
    atualizar();
  }
  function voltarCamera() {
    const v = g('gprev');
    revendo = false; v.onended = null; v.pause();
    if (v.src) { URL.revokeObjectURL(v.src); v.removeAttribute('src'); v.load(); }
    v.controls = false; v.muted = true; v.srcObject = stream;
    v.classList.toggle('espelho', facing === 'user');
    v.play().catch(() => {});
    atualizar();
  }

  async function abrir(it, salvarFn, aoTerminar) {
    if (!(navigator.mediaDevices && window.MediaRecorder)) return alert('Este navegador não grava vídeo. Use o Chrome (Android) ou o Safari (iPhone) atualizados.');
    criarUI();
    item = it; salvar = salvarFn; aoFim = aoTerminar; blocos = montarBlocos(it);
    i = Math.max(0, blocos.findIndex((_, k) => !takes()[k]));
    if (blocos.every((_, k) => takes()[k])) i = 0;
    ui.hidden = false; document.documentElement.style.overflow = 'hidden';
    if (navigator.wakeLock) navigator.wakeLock.request('screen').then(t => { trava = t; }).catch(() => {});
    atualizar();
    await ligarCamera().catch(erroCamera);
  }
  function fechar() {
    parar(); if (revendo) voltarCamera(); pararCamera();
    g('gprev').srcObject = null;
    ui.querySelectorAll('canvas').forEach(c => c.remove());
    ui.hidden = true; document.documentElement.style.overflow = '';
    if (trava) { trava.release().catch(() => {}); trava = null; }
    if (aoFim) aoFim();
  }

  /* ---------------------------------------------------------------- análise da voz (cortes e tempo das palavras) */
  function vozes(buf) {
    const d = buf.getChannelData(0), j = Math.round(buf.sampleRate * 0.02), rms = [];
    for (let k = 0; k + j <= d.length; k += j) { let s = 0; for (let m = k; m < k + j; m++) s += d[m] * d[m]; rms.push(Math.sqrt(s / j)); }
    if (!rms.length) return null;
    const ord = [...rms].sort((a, b) => a - b);
    const piso = ord[Math.floor(ord.length * 0.1)], pico = ord[Math.floor(ord.length * 0.95)];
    if (pico < 0.004) return null;
    const lim = piso + (pico - piso) * 0.18, brutos = [];
    let ini = null;
    rms.forEach((r, k) => {
      if (r > lim) { if (ini === null) ini = k * 0.02; }
      else if (ini !== null) { brutos.push([ini, k * 0.02]); ini = null; }
    });
    if (ini !== null) brutos.push([ini, rms.length * 0.02]);
    const segs = [];  // junta pedaços separados por menos de 0,3 s (respiração entre palavras)
    for (const s of brutos) {
      const u = segs[segs.length - 1];
      if (u && s[0] - u[1] < 0.3) u[1] = s[1]; else segs.push([...s]);
    }
    return segs.filter(s => s[1] - s[0] >= 0.12);
  }
  function distribuir(texto, segs) {
    // o professor leu o roteiro: espalha as palavras dele pelos trechos com voz, proporcional ao tamanho de cada palavra
    const pal = String(texto).split(/\s+/).filter(Boolean);
    const peso = pal.map(w => w.length + 2 + (/[.,!?…:;]$/.test(w) ? 4 : 0));
    const total = peso.reduce((a, b) => a + b, 0) || 1, voz = segs.reduce((a, s) => a + s[1] - s[0], 0);
    const tempo = x => {  // fração do texto -> instante no take
      let resta = x * voz;
      for (const s of segs) { const d = s[1] - s[0]; if (resta <= d) return s[0] + resta; resta -= d; }
      return segs[segs.length - 1][1];
    };
    let acc = 0;
    return pal.map((w, k) => { const a = tempo(acc / total); acc += peso[k]; return {w, a, b: tempo(acc / total)}; });
  }
  function agrupar(pal) {  // legenda de 1 a 3 palavras por vez, quebrando na pontuação
    const grupos = [];
    let atual = [];
    for (const p of pal) {
      atual.push(p);
      if (atual.length === 3 || /[.,!?…:;]$/.test(p.w)) { grupos.push(atual); atual = []; }
    }
    if (atual.length) grupos.push(atual);
    return grupos;
  }
  async function analisar(actx, take, texto) {
    let dur = take.dur, segs = null;
    try {
      const buf = await actx.decodeAudioData(await take.blob.arrayBuffer());
      dur = buf.duration; segs = vozes(buf);
    } catch (e) { /* sem análise: usa o take inteiro */ }
    if (!segs || !segs.length) segs = [[0.15, Math.max(0.6, dur - 0.15)]];
    const ini = Math.max(0, segs[0][0] - 0.15), fim = Math.min(dur, segs[segs.length - 1][1] + 0.35);
    return {take, ini, fim, grupos: agrupar(distribuir(texto, segs))};
  }

  /* ---------------------------------------------------------------- desenho de cada quadro do vídeo */
  function cobrir(ctx, v, x, y, w, h) {
    const vw = v.videoWidth, vh = v.videoHeight; if (!vw) return;
    const s = Math.max(w / vw, h / vh), sw = w / s, sh = h / s;
    ctx.drawImage(v, (vw - sw) / 2, (vh - sh) / 2, sw, sh, x, y, w, h);
  }
  function quebrar(ctx, txt, max) {
    const linhas = []; let l = '';
    for (const w of String(txt).split(/\s+/).filter(Boolean)) {
      const t = l ? l + ' ' + w : w;
      if (ctx.measureText(t).width > max && l) { linhas.push(l); l = w; } else l = t;
    }
    if (l) linhas.push(l);
    return linhas;
  }
  function retangulo(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
  }
  function caixa(ctx, txt, yc, fundo, tam) {
    ctx.font = `${tam}px Anton, Impact, sans-serif`;
    const linhas = quebrar(ctx, String(txt).toUpperCase(), W - 220), alt = tam * 1.12;
    const larg = Math.max(...linhas.map(l => ctx.measureText(l).width)) + 70, h = linhas.length * alt + 44;
    ctx.save(); ctx.shadowColor = '#0006'; ctx.shadowBlur = 24;
    ctx.fillStyle = fundo; retangulo(ctx, (W - larg) / 2, yc - h / 2, larg, h, 26); ctx.fill(); ctx.restore();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    linhas.forEach((l, k) => ctx.fillText(l, W / 2, yc - h / 2 + 22 + alt * (k + 0.5)));
  }
  function legenda(ctx, grupos, t, yc) {
    let gr = null;
    for (const x of grupos) { if (x[0].a <= t + 0.05) gr = x; else break; }
    if (!gr || t > gr[gr.length - 1].b + 0.6) return;
    ctx.font = '96px Anton, Impact, sans-serif'; ctx.textBaseline = 'middle';
    const pal = gr.map(p => p.w.toUpperCase()), esp = 26;
    let larg = pal.reduce((s, w) => s + ctx.measureText(w).width, 0) + esp * (pal.length - 1);
    const escala = Math.min(1, (W - 120) / larg);
    ctx.save(); ctx.translate(W / 2, yc); ctx.scale(escala, escala);
    let x = -larg / 2;
    ctx.lineJoin = 'round'; ctx.lineWidth = 16; ctx.textAlign = 'left';
    gr.forEach((p, k) => {
      const w = pal[k], falando = p.a <= t && t < (gr[k + 1] ? gr[k + 1].a : p.b + 0.6);
      ctx.strokeStyle = NAVY; ctx.strokeText(w, x, 0);
      ctx.fillStyle = falando ? LAR : '#fff'; ctx.fillText(w, x, 0);
      x += ctx.measureText(w).width + esp;
    });
    ctx.restore();
  }
  function desenhar(ctx, v, s, b, t, decorrido, total, ultimo, mascote) {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    if (b.cena === 'tela') {  // fundo creme com a conta grande e o professor num círculo
      ctx.fillStyle = CREME; ctx.fillRect(0, 0, W, H);
      if (b.quadro) {
        ctx.font = '120px Anton, Impact, sans-serif';
        let linhas = quebrar(ctx, b.quadro, W - 160), tam = 120;
        while (linhas.length > 3 && tam > 70) { tam -= 10; ctx.font = `${tam}px Anton, Impact, sans-serif`; linhas = quebrar(ctx, b.quadro, W - 160); }
        ctx.fillStyle = NAVY; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        linhas.forEach((l, k) => ctx.fillText(l, W / 2, H * 0.36 + (k - (linhas.length - 1) / 2) * tam * 1.15));
      }
      const r = 200, cx = W / 2, cy = H * 0.53 + 30;
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI); ctx.clip(); cobrir(ctx, v, cx - r, cy - r, 2 * r, 2 * r); ctx.restore();
      ctx.lineWidth = 12; ctx.strokeStyle = LAR; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI); ctx.stroke();
    } else cobrir(ctx, v, 0, 0, W, H);
    // barra de progresso e assinatura
    ctx.fillStyle = '#ffffff40'; ctx.fillRect(0, 0, W, 14);
    ctx.fillStyle = LAR; ctx.fillRect(0, 0, W * Math.min(1, decorrido / total), 14);
    ctx.font = '42px Anton, Impact, sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    const a = '@DELMAO', bb = 'SIMPLIFICA', la = ctx.measureText(a).width, lb = ctx.measureText(bb).width;
    ctx.save(); ctx.shadowColor = '#000a'; ctx.shadowBlur = 10;
    ctx.fillStyle = b.cena === 'tela' ? NAVY : '#fff'; ctx.fillText(a, (W - la - lb) / 2, 80);
    ctx.fillStyle = LAR; ctx.fillText(bb, (W - la - lb) / 2 + la, 80); ctx.restore();
    if (b.texto_tela) caixa(ctx, b.texto_tela, H * 0.17, b.gancho ? LAR : NAVY, b.gancho ? 96 : 80);
    legenda(ctx, s.grupos, t, H * 0.68);
    if (ultimo && mascote && mascote.naturalWidth) {
      const h = 380, w = mascote.naturalWidth * h / mascote.naturalHeight;  // abaixo da legenda (que fica em 68% da altura)
      ctx.drawImage(mascote, 30, H * 0.92 - h, w, h);
    }
  }

  /* ---------------------------------------------------------------- montagem do vídeo final */
  async function montar() {
    if (revendo) voltarCamera();
    pararCamera(); g('gprev').srcObject = null;
    for (const id of ['gant', 'gprox', 'gvirar', 'gver', 'gmontar', 'grec']) g(id).disabled = true;
    g('gfala').innerHTML = '<small>MONTANDO O VÍDEO</small>Deixe o app aberto nesta tela até terminar.';
    conta('Analisando a sua voz…', true);
    await document.fonts.load('96px Anton').catch(() => {});
    const actx = new (window.AudioContext || window.webkitAudioContext)();
    await actx.resume();
    const segs = [];
    for (let k = 0; k < blocos.length; k++) segs.push(await analisar(actx, takes()[k], blocos[k].fala));
    const total = segs.reduce((s, x) => s + x.fim - x.ini, 0);
    const mascote = new Image(); mascote.src = BASE + 'mascote/joinha.webp';
    await mascote.decode().catch(() => {});
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    ui.insertBefore(cv, g('gfala'));
    const ctx = cv.getContext('2d');
    const dest = actx.createMediaStreamDestination();
    const saida = new MediaStream([...cv.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
    const mt = tipo(), partes = [];
    const r = new MediaRecorder(saida, {...(mt ? {mimeType: mt} : {}), videoBitsPerSecond: 6e6, audioBitsPerSecond: 128000});
    r.ondataavailable = e => { if (e.data.size) partes.push(e.data); };
    let feito = 0, comecou = false;
    for (let k = 0; k < segs.length; k++) {
      const s = segs[k], b = blocos[k];
      conta('');
      g('ginfo').textContent = `Montando: bloco ${k + 1} de ${segs.length}…`;
      const v = document.createElement('video'), u = URL.createObjectURL(s.take.blob);
      v.playsInline = true; v.preload = 'auto'; v.src = u;
      await new Promise((ok, erro) => { v.onloadeddata = ok; v.onerror = () => erro(new Error(`não consegui abrir o take ${k + 1}`)); });
      const fonte = actx.createMediaElementSource(v), ganho = actx.createGain();
      ganho.gain.value = 0; fonte.connect(ganho); ganho.connect(dest);
      await v.play();
      let ativo = false;
      await new Promise(ok => {
        const passo = () => {
          const t = v.currentTime;
          if (!ativo && t >= s.ini) {  // pula o silêncio do começo do take
            ativo = true; ganho.gain.value = 1;
            if (!comecou) { r.start(1000); comecou = true; } else if (r.state === 'paused') r.resume();
          }
          desenhar(ctx, v, s, b, t, feito + Math.max(0, t - s.ini), total, k === segs.length - 1, mascote);
          if (t >= s.fim || v.ended) {  // corta o silêncio do fim
            ganho.gain.value = 0; if (r.state === 'recording') r.pause(); v.pause(); ok(); return;
          }
          requestAnimationFrame(passo);
        };
        requestAnimationFrame(passo);
      });
      feito += s.fim - s.ini;
      fonte.disconnect(); URL.revokeObjectURL(u);
    }
    const terminou = new Promise(ok => { r.onstop = ok; });
    if (r.state === 'paused') r.resume();
    r.stop(); await terminou; actx.close();
    item.video = new Blob(partes, {type: (r.mimeType || mt || 'video/webm').split(';')[0]});
    item.videoDur = total;
    await salvar(item);
    alert(`Vídeo pronto! ${total.toFixed(0)} s.`);
    fechar();
  }

  return {abrir};
})();
