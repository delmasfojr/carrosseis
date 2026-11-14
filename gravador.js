/* Gravador e editor de Reels dentro do app (no estilo do Edits do Instagram).
   GRAVAR: câmera no quadro 9:16, teleprompter no alto, cronômetro com o tempo de cada bloco (anel em volta do botão),
           linha do tempo com os blocos, zoom e troca de câmera.
   EDITAR: prévia do vídeo pronto, corte de começo/fim de cada take, texto na tela, legenda, enquadramento,
           legenda automática e mascote liga/desliga, regravar um bloco.
   EXPORTAR: monta o MP4 1080×1920 já editado. Tudo no celular, sem servidor e sem gastar IA. */
const Gravador = (() => {
  const W = 1080, H = 1920, NAVY = '#0F1B2D', LAR = '#FF7A00', CREME = '#FFF6E6';
  const TIPOS = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a', 'video/mp4',
    'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  const tipo = () => TIPOS.find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
  const CENA = {camera: '🎥 CÂMERA', quadro: '🧑‍🏫 QUADRO', tela: '📱 TELA'};
  const espera = ms => new Promise(r => setTimeout(r, ms));
  const seg = s => `${Number(s).toFixed(1).replace('.', ',')} s`;
  let item, salvar, aoFim, blocos, i = 0, sel = 0, stream = null, facing = 'user', rec = null, gravando = false, revendo = false;
  let trava = null, t0 = 0, relogio = null, vibrou = false, ui = null, actx = null, tocando = null, ocupado = false;
  const g = id => ui.querySelector('#' + id);
  const takes = () => item.takes || (item.takes = []);
  const PADRAO = {legenda: true, mascote: true, voz: true, filtro: 'nenhum', zoomCorte: true, volMusica: 0.15, ruido: false};
  const opcoes = () => {  // completa o que faltar SEM trocar o objeto (quem já tem a referência continua valendo)
    const op = item.edicao || (item.edicao = {});
    for (const [k, v] of Object.entries(PADRAO)) if (!(k in op)) op[k] = v;
    return op;
  };
  const ac = () => { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); actx.resume(); return actx; };

  /* tempo que o roteiro dá para cada bloco ("8–15 s" = 7 s; gancho = 3 s) */
  function alvo(b) {
    if (b.gancho) return 3;
    const m = String(b.tempo).match(/(\d+(?:[.,]\d+)?)\s*[–-]\s*(\d+(?:[.,]\d+)?)/);
    if (!m) return 5;
    return Math.min(20, Math.max(2, parseFloat(m[2].replace(',', '.')) - parseFloat(m[1].replace(',', '.'))));
  }
  function montarBlocos(it) {
    const c = it.conteudo;
    return [{tempo: '0–3 s', cena: 'camera', fala: c.ganchos[it.gancho || 0], quadro: '', texto_tela: c.texto_capa, gancho: true}, ...c.blocos];
  }
  // edição de texto vai direto para o roteiro (o gancho mora em ganchos[] e texto_capa)
  function setTexto(k, campo, valor) {
    const c = item.conteudo;
    if (k === 0) { if (campo === 'fala') c.ganchos[item.gancho || 0] = valor; else c.texto_capa = valor; }
    else c.blocos[k - 1][campo] = valor;
    blocos = montarBlocos(item);
  }

  /* ---------------------------------------------------------------- tela */
  function criarUI() {
    if (ui) return;
    const st = document.createElement('style');
    st.textContent = `
#grav{position:fixed;inset:0;z-index:60;background:#000;color:#fff;overflow:hidden;font-family:'Open Sans',system-ui,sans-serif}
#grav [hidden],#grav[hidden]{display:none !important}
#grav button{font:inherit;font-weight:700;border:0;border-radius:12px;cursor:pointer}
#grav button:disabled{opacity:.35}
.gquadro{position:absolute;top:0;left:50%;transform:translateX(-50%);width:min(100vw,calc(100dvh * 9 / 16));aspect-ratio:9/16;overflow:hidden;background:#111}
#gprev{width:100%;height:100%;object-fit:cover;display:block}
#gprev.inteiro{object-fit:contain}
#gprev.espelho{transform:scaleX(-1)}
#gfala{position:absolute;left:0;right:0;top:0;padding:calc(10px + env(safe-area-inset-top)) 16px 40px;background:linear-gradient(#000d 70%,#0000);font-weight:700;line-height:1.3;text-align:center}
#gfala small{display:block;color:#FF7A00;font-size:12px;letter-spacing:1px;margin-bottom:4px}
#gfala .gq{display:block;font-size:.66em;font-weight:600;color:#ffe2bf;margin-top:6px}
#gconta{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:140px 'Anton',Impact,sans-serif;text-shadow:0 0 24px #000;pointer-events:none;text-align:center}
#gconta.peq{font:700 20px 'Open Sans',sans-serif;padding:0 30px}
#gbarra{position:absolute;left:0;right:0;bottom:0;background:linear-gradient(#0000,#000e 26%);padding:26px 10px calc(8px + env(safe-area-inset-bottom))}
#gtempo{text-align:center;font:700 22px 'Open Sans',sans-serif;font-variant-numeric:tabular-nums}
#gtempo.passou{color:#FF7A00}
.glinha{display:flex;gap:10px;justify-content:center;align-items:center;margin-top:6px}
.glinha>button{background:#333d;color:#fff;padding:11px 12px;font-size:15px;min-width:48px}
#grecw{position:relative;width:86px;height:86px;flex:none}
#grecw svg{position:absolute;inset:0;transform:rotate(-90deg)}
#grec{position:absolute;left:11px;top:11px;width:64px;height:64px;border-radius:50% !important;padding:0;background:#e22;transition:all .2s}
#grec.on{left:23px;top:23px;width:40px;height:40px;border-radius:8px !important}
#gzoomw{display:flex;gap:8px;align-items:center;justify-content:center;font-size:13px;margin-top:4px}
#gzoom{width:55%;accent-color:#FF7A00}
#gtl{display:flex;gap:3px;margin-top:8px}
#gtl button{flex-basis:0;min-width:22px;height:30px;padding:0;font-size:11px;background:#fff3;color:#fff;border-radius:6px !important;border:2px solid transparent}
#gtl button.ok{background:#FF7A00}
#gtl button.at{border-color:#fff}
#ginfo{text-align:center;font-size:12px;color:#ccc;margin-top:5px}
#geditar{background:#FF7A00 !important}
/* editor */
#gedit{position:absolute;inset:0;display:flex;flex-direction:column;background:#FFF6E6;color:#0F1B2D}
.eprev{position:relative;flex:none;height:44dvh;background:#000;display:flex;justify-content:center;padding-top:env(safe-area-inset-top)}
#ecanvas{height:100%;aspect-ratio:9/16}
#eplay{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:64px;height:64px;border-radius:50% !important;background:#000a;color:#fff;font-size:26px}
#etempo{position:absolute;right:10px;bottom:8px;background:#000a;color:#fff;font-size:12px;padding:2px 8px;border-radius:8px}
#etl{display:flex;gap:4px;overflow-x:auto;padding:10px 12px;background:#0F1B2D;flex:none}
#etl button{flex:none;height:46px;padding:0 6px;background:#33415a;color:#fff;font-size:12px;border:3px solid transparent;border-radius:8px !important;text-align:left;line-height:1.15}
#etl button.at{border-color:#FF7A00}
#etl button.falta{background:#7a1f1f}
#epainel{flex:1;overflow-y:auto;padding:12px 16px 16px}
#epainel h4{margin:0 0 6px;font:22px 'Anton',Impact,sans-serif;font-weight:400}
#epainel h4 span{color:#FF7A00}
#epainel label{display:block;font-weight:700;font-size:14px;margin:12px 0 4px}
#epainel input[type=range]{width:100%;accent-color:#FF7A00}
#epainel input[type=text],#epainel textarea{width:100%;font:inherit;font-size:15px;padding:10px 12px;border:2px solid #D9DDE3;border-radius:10px;background:#fff;color:#0F1B2D}
#epainel textarea{min-height:76px}
.ebot{display:flex;gap:8px;margin-top:10px}
.ebot button{flex:1;padding:11px 8px;background:#fff;color:#0F1B2D;border:2px solid #D9DDE3 !important}
.ebot button.on{border-color:#FF7A00 !important;color:#FF7A00}
.echeck{display:flex !important;gap:10px;align-items:center;font-weight:400 !important}
.echeck input{width:20px;height:20px;accent-color:#FF7A00}
.ebarra{flex:none;display:flex;gap:8px;padding:10px 12px calc(10px + env(safe-area-inset-bottom));background:#0F1B2D}
.ebarra button{flex:1;padding:13px 6px;background:#33415a;color:#fff}
#eexportar{background:#FF7A00 !important;flex:1.4}
#eaviso{position:absolute;inset:0;background:#000c;display:flex;align-items:center;justify-content:center;text-align:center;font-weight:700;font-size:18px;padding:30px;color:#fff;z-index:2}`;
    document.head.appendChild(st);
    ui = document.createElement('div'); ui.id = 'grav'; ui.hidden = true;
    ui.innerHTML = `
      <div id="ggrava">
        <div class="gquadro"><video id="gprev" playsinline muted autoplay></video><div id="gconta"></div></div>
        <div id="gfala"></div>
        <div id="gbarra">
          <div id="gtempo"></div>
          <div class="glinha">
            <button id="gfechar" title="Sair">✕</button>
            <button id="gvirar" title="Trocar câmera">🔄</button>
            <div id="grecw"><svg viewBox="0 0 86 86"><circle cx="43" cy="43" r="39" fill="none" stroke="#fff5" stroke-width="5"/>
              <circle id="ganel" cx="43" cy="43" r="39" fill="none" stroke="#FF7A00" stroke-width="5" stroke-linecap="round" stroke-dasharray="245" stroke-dashoffset="245"/></svg>
              <button id="grec" title="Gravar"></button></div>
            <button id="gver" title="Ver o take">▶</button>
            <button id="geditar">✂️ Editar</button>
          </div>
          <div id="gzoomw" hidden>🔍 <input id="gzoom" type="range"> <span id="gzoomv"></span></div>
          <div id="gtl"></div>
          <div class="glinha" style="margin-top:6px"><button id="gruido" style="font-size:12px;padding:6px 10px"></button></div>
          <div id="ginfo"></div>
        </div>
      </div>
      <div id="gedit" hidden>
        <div class="eprev"><canvas id="ecanvas" width="${W}" height="${H}"></canvas><button id="eplay">▶</button><div id="etempo"></div></div>
        <div id="etl"></div>
        <div id="epainel"></div>
        <div class="ebarra"><button id="esair">✕ Sair</button><button id="egravar">🎥 Gravar</button><button id="eexportar">⬇ Exportar vídeo</button></div>
        <div id="eaviso" hidden></div>
      </div>`;
    document.body.appendChild(ui);
    g('grec').onclick = () => gravando ? parar() : gravar();
    g('gvirar').onclick = () => ligarCamera(facing === 'user' ? 'environment' : 'user').catch(erroCamera);
    g('gver').onclick = () => revendo ? voltarCamera() : rever();
    g('gfechar').onclick = fechar;
    g('gruido').onclick = async () => {
      opcoes().ruido = !opcoes().ruido; salvar(item).catch(() => {});
      const lado = facing; pararCamera(); await ligarCamera(lado).catch(erroCamera);
    };
    g('geditar').onclick = () => abrirEditor(Math.min(i, blocos.length - 1));
    g('gzoom').oninput = () => {
      const t = stream && stream.getVideoTracks()[0], z = Number(g('gzoom').value);
      if (t) t.applyConstraints({advanced: [{zoom: z}]}).catch(() => {});
      g('gzoomv').textContent = z.toFixed(1) + '×';
    };
    g('eplay').onclick = () => tocando ? pararPrevia() : previa();
    g('esair').onclick = fechar;
    g('egravar').onclick = () => irGravar(sel);
    g('eexportar').onclick = () => exportar().catch(e => { aviso(''); ocupado = false; alert('Não consegui exportar: ' + e.message); });
  }
  const conta = (t, peq) => { g('gconta').textContent = t; g('gconta').classList.toggle('peq', !!peq); };

  /* ---------------------------------------------------------------- modo GRAVAR */
  function atualizarGravar() {
    const b = blocos[i], tk = takes()[i], a = alvo(b);
    const fonte = b.fala.length > 120 ? 19 : b.fala.length > 70 ? 22 : 25;
    g('gfala').style.fontSize = fonte + 'px';
    g('gfala').innerHTML = `<small>BLOCO ${i + 1} DE ${blocos.length} · ${b.gancho ? 'GANCHO' : esc(CENA[b.cena] || b.cena)} · ${a} s</small>${esc(b.fala)}` +
      (b.cena !== 'camera' && b.quadro ? `<span class="gq">${b.cena === 'quadro' ? 'No quadro' : 'Na tela'}: ${esc(b.quadro)}</span>` : '');
    if (!gravando) {
      g('gtempo').textContent = tk ? `✓ ${seg(tk.fim - tk.ini)} (meta ${a} s)` : `meta: ${a} s`;
      g('gtempo').classList.remove('passou');
      g('ganel').style.strokeDashoffset = 245;
    }
    g('gtl').innerHTML = blocos.map((x, k) => `<button data-k="${k}" style="flex-grow:${alvo(x)}" class="${takes()[k] ? 'ok' : ''} ${k === i ? 'at' : ''}">${k + 1}</button>`).join('');
    g('gtl').querySelectorAll('button').forEach(bt => { bt.disabled = gravando; bt.onclick = () => irPara(Number(bt.dataset.k)); });
    g('ginfo').textContent = gravando ? 'Gravando… toque no quadrado para parar' : revendo ? 'Vendo o take' :
      tk ? 'Take gravado. Grave de novo se quiser, ou toque em ✂️ Editar.' : 'Toque no botão vermelho para gravar este bloco';
    g('grec').classList.toggle('on', gravando);
    for (const id of ['gvirar', 'gver', 'geditar', 'gfechar']) g(id).disabled = gravando;
    g('gver').disabled ||= !tk;
    g('gver').textContent = revendo ? '📷' : '▶';
    g('geditar').disabled ||= !takes().some(Boolean);
    g('grec').disabled = revendo || abrindo;
    g('gruido').textContent = opcoes().ruido ? '🎙 Reduzir ruído: LIGADO (lugar barulhento)' : '🎙 Reduzir ruído: desligado (voz mais natural)';
    g('gruido').disabled = gravando || abrindo;
    if (abrindo) for (const id of ['gvirar', 'geditar']) g(id).disabled = true;
  }

  function pararCamera() { if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; }
  // uma troca de câmera por vez: se pedirem outra no meio, espera a anterior terminar
  let fila = Promise.resolve(), abrindo = false;
  function ligarCamera(forcar) {
    const p = fila.then(() => ligarCameraJa(forcar));
    fila = p.catch(() => {});
    return p;
  }
  async function pedirCamera(lado) {
    // filtros de "chamada" do celular (cancelamento de eco, supressão de ruído, ganho automático) deixam a voz
    // abafada e robótica: ficam desligados. "Reduzir ruído" liga só a supressão, para lugar barulhento.
    const audio = {echoCancellation: false, noiseSuppression: !!opcoes().ruido, autoGainControl: false,
      channelCount: {ideal: 1}, sampleRate: {ideal: 48000}, sampleSize: {ideal: 16}};
    const tentativas = [
      // resizeMode 'none' = formato nativo da câmera, sem recorte (o recorte era o "zoom" exagerado)
      {facingMode: lado, resizeMode: {ideal: 'none'}, width: {ideal: 1920}, height: {ideal: 1440}, frameRate: {ideal: 30}},
      {facingMode: lado},  // celular que recusa as opções acima
    ];
    let erro;
    for (let n = 0; n < 3; n++) {  // o Android às vezes demora a soltar a câmera anterior
      for (const video of tentativas) {
        try { return await navigator.mediaDevices.getUserMedia({video, audio}); } catch (e) {
          erro = e;
          if (e.name === 'NotAllowedError' || e.name === 'SecurityError') throw e;  // permissão negada: não adianta insistir
        }
      }
      await espera(600);
    }
    throw erro;
  }
  async function ligarCameraJa(forcar) {
    const tk = takes()[i];
    const quer = forcar || (tk && tk.facing) || (blocos[i].cena === 'quadro' ? 'environment' : 'user');
    if (!(stream && facing === quer && stream.active)) {
      pararCamera();
      abrindo = true; atualizarGravar();
      g('ginfo').textContent = quer === 'environment' ? 'Abrindo a câmera de trás…' : 'Abrindo a câmera…';
      await espera(250);  // dá tempo de o celular soltar a câmera anterior
      try {
        stream = await pedirCamera(quer); facing = quer;
      } catch (e) {
        if (quer === 'environment' && e.name !== 'NotAllowedError') {  // câmera de trás falhou: usa a da frente
          stream = await pedirCamera('user'); facing = 'user';
          alert('Não consegui abrir a câmera de trás; vou usar a da frente. Use 🔄 para tentar de novo.');
        } else throw e;
      } finally { abrindo = false; }
      const t = stream.getVideoTracks()[0], cap = t.getCapabilities ? t.getCapabilities() : {};
      if (cap.zoom && cap.zoom.max > cap.zoom.min) {
        g('gzoomw').hidden = false;
        Object.assign(g('gzoom'), {min: cap.zoom.min, max: Math.min(cap.zoom.max, cap.zoom.min * 4), step: cap.zoom.step || 0.1});
        g('gzoom').value = cap.zoom.min; g('gzoom').oninput();  // começa no mais aberto possível
      } else g('gzoomw').hidden = true;
    }
    const v = g('gprev');
    if (v.srcObject !== stream) v.srcObject = stream;
    v.classList.toggle('espelho', facing === 'user');
    v.onloadedmetadata = () => {
      v.classList.toggle('inteiro', v.videoWidth / v.videoHeight > 0.8);  // câmera deitada: mostra inteiro
      g('ginfo').dataset.res = `${v.videoWidth}×${v.videoHeight}`;
    };
    await v.play().catch(() => {});
    atualizarGravar();
  }
  const erroCamera = e => {
    abrindo = false; if (ui) atualizarGravar();
    alert(e.name === 'NotAllowedError'
      ? 'O celular bloqueou a câmera ou o microfone. Toque no cadeado ao lado do endereço (ou em Configurações do site) e permita câmera e microfone.'
      : `Não consegui abrir a câmera (${e.name || ''} ${e.message}). Feche outros apps que usam a câmera e toque em 🔄.`);
  };

  async function irPara(k) {
    if (k < 0 || k >= blocos.length || gravando) return;
    if (revendo) voltarCamera();
    i = k; atualizarGravar();
    await ligarCamera().catch(erroCamera);
  }
  async function irGravar(k) {
    pararPrevia();
    g('gedit').hidden = true; g('ggrava').hidden = false;
    i = k; atualizarGravar();
    await ligarCamera().catch(erroCamera);
  }

  async function gravar() {
    if (abrindo || !(stream && stream.active)) {  // câmera ainda abrindo (ou caiu): abre antes de gravar
      try { await ligarCamera(); } catch (e) { return erroCamera(e); }
    }
    ac();  // libera o áudio no toque (iPhone)
    g('grec').disabled = true;
    for (const n of [3, 2, 1]) { conta(n); await espera(650); }
    conta('');
    const mt = tipo(), partes = [], a = alvo(blocos[i]);
    rec = new MediaRecorder(stream, {...(mt ? {mimeType: mt} : {}), videoBitsPerSecond: 6e6, audioBitsPerSecond: 192000});
    rec.ondataavailable = e => { if (e.data.size) partes.push(e.data); };
    rec.onstop = async () => {
      clearInterval(relogio);
      const blob = new Blob(partes, {type: (rec.mimeType || mt || 'video/webm').split(';')[0]});
      const c = {blob, dur: (Date.now() - t0) / 1000, facing};
      gravando = false;
      g('ginfo').textContent = 'Guardando o take…';
      await analisar(c);
      takes()[i] = c;
      try { await salvar(item); } catch (e) { alert('Não consegui guardar o take: ' + e.message); }
      const proximo = blocos.findIndex((_, k) => k > i && !takes()[k]);
      if (proximo > 0) await irPara(proximo);
      else if (blocos.every((_, k) => takes()[k])) abrirEditor(i);  // gravou tudo: vai para a edição
      else atualizarGravar();
    };
    rec.start(1000); t0 = Date.now(); gravando = true; vibrou = false;
    relogio = setInterval(() => {
      const s = (Date.now() - t0) / 1000;
      g('gtempo').textContent = `${seg(s)} / ${a} s`;
      g('gtempo').classList.toggle('passou', s > a);
      g('ganel').style.strokeDashoffset = 245 * (1 - Math.min(1, s / a));
      if (s >= a && !vibrou) { vibrou = true; if (navigator.vibrate) navigator.vibrate(60); }
    }, 100);
    atualizarGravar();
  }
  function parar() { if (rec && rec.state !== 'inactive') rec.stop(); }

  function rever() {
    const tk = takes()[i]; if (!tk) return;
    const v = g('gprev');
    revendo = true;
    v.srcObject = null; v.src = URL.createObjectURL(tk.blob); v.muted = false; v.controls = true;
    v.classList.toggle('espelho', tk.facing === 'user');
    v.onended = voltarCamera; v.play().catch(() => {});
    atualizarGravar();
  }
  function voltarCamera() {
    const v = g('gprev');
    revendo = false; v.onended = null; v.pause();
    if (v.src) { URL.revokeObjectURL(v.src); v.removeAttribute('src'); v.load(); }
    v.controls = false; v.muted = true; v.srcObject = stream;
    v.classList.toggle('espelho', facing === 'user');
    v.play().catch(() => {});
    atualizarGravar();
  }

  /* ---------------------------------------------------------------- abrir / fechar */
  async function abrir(it, salvarFn, aoTerminar) {
    if (!(navigator.mediaDevices && window.MediaRecorder)) return alert('Este navegador não grava vídeo. Use o Chrome (Android) ou o Safari (iPhone) atualizados.');
    criarUI();
    item = it; salvar = salvarFn; aoFim = aoTerminar; blocos = montarBlocos(it);
    ui.hidden = false; document.documentElement.style.overflow = 'hidden';
    if (navigator.wakeLock) navigator.wakeLock.request('screen').then(t => { trava = t; }).catch(() => {});
    for (const c of takes()) if (c && c.ini == null) await analisar(c);  // takes da versão anterior
    const falta = blocos.findIndex((_, k) => !takes()[k]);
    if (falta < 0) return abrirEditor(0);  // já tem tudo gravado: abre a edição
    await irGravar(falta);
  }
  function fechar() {
    if (ocupado) return;
    parar(); if (revendo) voltarCamera(); pararPrevia(); pararCamera();
    g('gprev').srcObject = null;
    for (const v of quadros.values()) { URL.revokeObjectURL(v.src); v.removeAttribute('src'); }
    quadros.clear();
    ui.hidden = true; document.documentElement.style.overflow = '';
    if (trava) { trava.release().catch(() => {}); trava = null; }
    if (aoFim) aoFim();
  }

  /* ---------------------------------------------------------------- análise da voz (corte automático e tempo das palavras) */
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
  async function analisar(c) {
    let segs = null;
    try {
      const buf = await ac().decodeAudioData(await c.blob.arrayBuffer());
      c.dur = buf.duration; segs = vozes(buf);
    } catch (e) { /* sem análise: usa o take inteiro */ }
    if (!segs || !segs.length) segs = [[0.15, Math.max(0.6, c.dur - 0.15)]];
    c.segs = segs;
    c.ini = Math.max(0, segs[0][0] - 0.15);
    c.fim = Math.min(c.dur, segs[segs.length - 1][1] + 0.35);
  }
  const cortados = c => {  // trechos com voz dentro do corte escolhido
    const s = (c.segs || []).map(([a, b]) => [Math.max(a, c.ini), Math.min(b, c.fim)]).filter(([a, b]) => b - a > 0.05);
    return s.length ? s : [[c.ini, c.fim]];
  };
  function distribuir(texto, segs) {
    // o professor leu o roteiro: espalha as palavras pelos trechos com voz, proporcional ao tamanho de cada palavra
    const pal = String(texto).split(/\s+/).filter(Boolean);
    const peso = pal.map(w => w.length + 2 + (/[.,!?…:;]$/.test(w) ? 4 : 0));
    const total = peso.reduce((a, b) => a + b, 0) || 1, voz = segs.reduce((a, s) => a + s[1] - s[0], 0);
    const tempo = x => {
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
  const gruposDe = k => opcoes().legenda ? agrupar(distribuir(blocos[k].fala, cortados(takes()[k]))) : [];

  /* ---------------------------------------------------------------- desenho de cada quadro */
  function cobrir(ctx, v, x, y, w, h) {
    const vw = v.videoWidth, vh = v.videoHeight; if (!vw) return;
    const s = Math.max(w / vw, h / vh), sw = w / s, sh = h / s;
    ctx.drawImage(v, (vw - sw) / 2, (vh - sh) / 2, sw, sh, x, y, w, h);
  }
  function caber(ctx, v) {
    const vw = v.videoWidth, vh = v.videoHeight; if (!vw) return;
    const s = Math.min(W / vw, H / vh), w = vw * s, h = vh * s;
    ctx.drawImage(v, (W - w) / 2, (H - h) / 2, w, h);
  }
  const enquadre = (c, v) => c.enquadre || (v.videoWidth / v.videoHeight > 0.8 ? 'inteiro' : 'preencher');
  function quebrar(ctx, txt, max) {
    const linhas = []; let l = '';
    for (const w of String(txt).split(/\s+/).filter(Boolean)) {
      const t = l ? l + ' ' + w : w;
      if (ctx.measureText(t).width > max && l) { linhas.push(l); l = w; } else l = t;
    }
    if (l) linhas.push(l);
    return linhas;
  }
  function retangulo(ctx, x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
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
    const larg = pal.reduce((s, w) => s + ctx.measureText(w).width, 0) + esp * (pal.length - 1);
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
  let mascote = null;
  const FILTROS = {nenhum: 'none', vivo: 'saturate(1.35) contrast(1.08)', quente: 'sepia(.22) saturate(1.25) brightness(1.04)',
    claro: 'brightness(1.13) contrast(1.05)', frio: 'saturate(1.1) hue-rotate(-8deg) brightness(1.03)', pb: 'grayscale(1) contrast(1.15)'};
  const NOMES_FILTRO = {nenhum: 'Normal', vivo: 'Vivo', quente: 'Quente', claro: 'Claro', frio: 'Frio', pb: 'P&B'};
  const vel = c => c.vel || 1;
  function desenhar(ctx, v, k, grupos, t, decorrido, total) {
    const c = takes()[k], b = blocos[k], op = opcoes();
    const local = Math.max(0, (t - c.ini) / vel(c));  // segundos desde o começo deste bloco no vídeo final
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    const filtro = FILTROS[op.filtro] || 'none';
    // "zoom de impacto" no começo de cada corte (como nos Reels): 8% de zoom que volta ao normal em 0,35 s
    const z = op.zoomCorte && k > 0 && b.cena !== 'tela' && local < 0.35 ? 1 + 0.08 * Math.pow(1 - local / 0.35, 2) : 1;
    ctx.save();
    if (z !== 1) { ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-W / 2, -H / 2); }
    ctx.filter = filtro;
    if (b.cena === 'tela') {  // fundo creme com a conta grande e o professor num círculo
      ctx.fillStyle = CREME; ctx.fillRect(0, 0, W, H);
      if (b.quadro) {
        let tam = 120; ctx.font = `${tam}px Anton, Impact, sans-serif`;
        let linhas = quebrar(ctx, b.quadro, W - 160);
        while (linhas.length > 3 && tam > 70) { tam -= 10; ctx.font = `${tam}px Anton, Impact, sans-serif`; linhas = quebrar(ctx, b.quadro, W - 160); }
        ctx.fillStyle = NAVY; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        linhas.forEach((l, n) => ctx.fillText(l, W / 2, H * 0.36 + (n - (linhas.length - 1) / 2) * tam * 1.15));
      }
      const r = 200, cx = W / 2, cy = H * 0.53 + 30;
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI); ctx.clip(); cobrir(ctx, v, cx - r, cy - r, 2 * r, 2 * r); ctx.restore();
      ctx.lineWidth = 12; ctx.strokeStyle = LAR; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI); ctx.stroke();
    } else if (enquadre(c, v) === 'inteiro') {  // vídeo inteiro, com o fundo borrado
      ctx.save(); ctx.filter = 'blur(36px) brightness(.55)'; cobrir(ctx, v, -60, -60, W + 120, H + 120); ctx.restore();
      ctx.filter = filtro; caber(ctx, v);
    } else cobrir(ctx, v, 0, 0, W, H);
    ctx.restore(); ctx.filter = 'none';
    ctx.fillStyle = '#ffffff40'; ctx.fillRect(0, 0, W, 14);
    ctx.fillStyle = LAR; ctx.fillRect(0, 0, W * Math.min(1, decorrido / total), 14);
    ctx.font = '42px Anton, Impact, sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    const a = '@DELMAO', bb = 'SIMPLIFICA', la = ctx.measureText(a).width, lb = ctx.measureText(bb).width;
    ctx.save(); ctx.shadowColor = '#000a'; ctx.shadowBlur = 10;
    ctx.fillStyle = b.cena === 'tela' ? NAVY : '#fff'; ctx.fillText(a, (W - la - lb) / 2, 80);
    ctx.fillStyle = LAR; ctx.fillText(bb, (W - la - lb) / 2 + la, 80); ctx.restore();
    if (b.texto_tela) {  // texto entra "pulando" no começo do bloco
      const e = Math.min(1, local / 0.22), s = 0.7 + 0.3 * (1 - Math.pow(1 - e, 3)) + (e < 1 ? 0.06 * Math.sin(e * Math.PI) : 0);
      ctx.save(); ctx.translate(W / 2, H * 0.17); ctx.scale(s, s); ctx.translate(-W / 2, -H * 0.17); ctx.globalAlpha = Math.min(1, e * 1.6);
      caixa(ctx, b.texto_tela, H * 0.17, b.gancho ? LAR : NAVY, b.gancho ? 96 : 80);
      ctx.restore();
    }
    legenda(ctx, grupos, t, H * 0.68);
    if (k === blocos.length - 1 && opcoes().mascote && mascote && mascote.naturalWidth) {
      const h = 380, w = mascote.naturalWidth * h / mascote.naturalHeight;  // abaixo da legenda
      ctx.drawImage(mascote, 30, H * 0.92 - h, w, h);
    }
  }

  /* ---------------------------------------------------------------- tocar os takes (prévia e exportação) */
  const tamanho = k => { const c = takes()[k]; return c ? Math.max(0, c.fim - c.ini) / vel(c) : 0; };
  const totalDur = () => blocos.reduce((s, _, k) => s + tamanho(k), 0);
  const antes = k => blocos.slice(0, k).reduce((s, _, n) => s + tamanho(n), 0);
  async function abrirVideo(blob) {
    const v = document.createElement('video');
    v.playsInline = true; v.preload = 'auto'; v.src = URL.createObjectURL(blob);
    await new Promise((ok, erro) => { v.onloadeddata = ok; v.onerror = () => erro(new Error('não consegui abrir um take')); });
    return v;
  }
  function irAoTempo(v, t) {
    if (Math.abs(v.currentTime - t) < 0.03) return Promise.resolve();
    return new Promise(ok => {
      const fim = () => { clearTimeout(z); v.removeEventListener('seeked', fim); ok(); };
      const z = setTimeout(fim, 1500);
      v.addEventListener('seeked', fim); v.currentTime = t;
    });
  }
  async function carregarMascote() {
    if (mascote) return;
    mascote = new Image(); mascote.src = BASE + 'mascote/joinha.webp';
    await mascote.decode().catch(() => {});
    await document.fonts.load('96px Anton').catch(() => {});
  }
  /* "Melhorar voz" (como no Edits): corta o ronco grave, tira o abafado, dá presença, comprime e sobe o volume */
  function cadeiaVoz(a, saida) {
    const n = (tipo, f, q, ganho) => {
      const x = a.createBiquadFilter(); x.type = tipo; x.frequency.value = f;
      if (q) x.Q.value = q; if (ganho != null) x.gain.value = ganho; return x;
    };
    const etapas = [n('highpass', 85, 0.7), n('peaking', 250, 1, -3), n('peaking', 3200, 0.9, 4), n('highshelf', 9000, null, 2.5)];
    const comp = a.createDynamicsCompressor();
    comp.threshold.value = -26; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.18;
    const volume = a.createGain(); volume.gain.value = 1.6;
    const limite = a.createDynamicsCompressor();
    limite.threshold.value = -4; limite.knee.value = 0; limite.ratio.value = 20; limite.attack.value = 0.001; limite.release.value = 0.08;
    [...etapas, comp, volume, limite].reduce((x, y) => { x.connect(y); return y; }).connect(saida);
    return {entrada: etapas[0], nos: [...etapas, comp, volume, limite]};
  }
  // próximo quadro: normalmente acompanha a tela; se o celular "congelar" o desenho, um relógio garante que continue
  function proximo(f) {
    let feito = false;
    const vai = () => { if (!feito) { feito = true; f(); } };
    requestAnimationFrame(vai); setTimeout(vai, 40);
  }
  async function tocar(ks, saida, gravador, controle, aoTempo) {
    const ctx = g('ecanvas').getContext('2d'), total = totalDur(), op = opcoes();
    const voz = op.voz ? cadeiaVoz(ac(), saida) : null, entradaVoz = voz ? voz.entrada : saida;
    // música de fundo: toca só enquanto o vídeo anda, em volume baixo, e recomeça se acabar
    let musica = null, fonteM = null;
    if (item.musica) {
      musica = document.createElement('audio'); musica.src = URL.createObjectURL(item.musica); musica.loop = true;
      await new Promise(ok => { musica.oncanplay = ok; musica.onerror = ok; setTimeout(ok, 3000); });
      fonteM = ac().createMediaElementSource(musica);
      const gm = ac().createGain(); gm.gain.value = op.volMusica; fonteM.connect(gm); gm.connect(saida);
      if (musica.duration) musica.currentTime = antes(ks[0]) % musica.duration;
    }
    try { await tocarBlocos(); } finally {
      if (musica) { musica.pause(); fonteM.disconnect(); URL.revokeObjectURL(musica.src); }
      if (voz) voz.nos.forEach(x => x.disconnect());
    }
    async function tocarBlocos() {
    for (const k of ks) {
      if (controle.parar) break;
      const c = takes()[k]; if (!c) continue;
      const v = await abrirVideo(c.blob), a = ac();
      const fonte = a.createMediaElementSource(v), ganho = a.createGain();
      ganho.gain.value = 0; fonte.connect(ganho); ganho.connect(entradaVoz);
      v.playbackRate = vel(c); v.preservesPitch = true;
      await irAoTempo(v, c.ini);  // se o celular não conseguir pular, toca do zero e espera chegar no corte
      const grupos = gruposDe(k);
      await v.play();
      let ativo = false;
      await new Promise(ok => {
        const passo = () => {
          if (controle.parar) { v.pause(); ok(); return; }
          const t = v.currentTime;
          if (!ativo && t >= c.ini - 0.02) {
            ativo = true; ganho.gain.value = 1; if (musica) musica.play().catch(() => {});
            if (gravador) { if (gravador.state === 'inactive') gravador.start(1000); else if (gravador.state === 'paused') gravador.resume(); }
          }
          if (ativo) {
            const dec = antes(k) + Math.max(0, t - c.ini) / vel(c);
            desenhar(ctx, v, k, grupos, t, dec, total);
            if (aoTempo) aoTempo(dec, total, k);
          }
          if (t >= c.fim || v.ended) {
            ganho.gain.value = 0; if (musica) musica.pause(); if (gravador && gravador.state === 'recording') gravador.pause();
            v.pause(); ok(); return;
          }
          proximo(passo);
        };
        proximo(passo);
      });
      fonte.disconnect(); URL.revokeObjectURL(v.src); v.removeAttribute('src');
    }
    }
  }

  /* ---------------------------------------------------------------- modo EDITAR */
  const quadros = new Map();  // vídeo de cada take só para mostrar um quadro parado (sem som)
  async function mostrarQuadro(k, t) {
    const c = takes()[k]; if (!c) return;
    await carregarMascote();
    let v = quadros.get(k);
    if (!v || v.dataset.blob !== String(c.blob.size)) {
      if (v) URL.revokeObjectURL(v.src);
      v = await abrirVideo(c.blob); v.muted = true; v.dataset.blob = String(c.blob.size); quadros.set(k, v);
    }
    const alvoT = t == null ? c.ini + 0.05 : t;
    await irAoTempo(v, alvoT);
    if (tocando) return;
    const dec = antes(k) + Math.max(0, alvoT - c.ini) / vel(c);
    desenhar(g('ecanvas').getContext('2d'), v, k, gruposDe(k), alvoT, dec, totalDur());
    g('etempo').textContent = `${seg(dec)} / ${seg(totalDur())}`;
  }
  function desenharTimeline() {
    g('etl').innerHTML = blocos.map((b, k) => {
      const c = takes()[k];
      return `<button data-k="${k}" class="${k === sel ? 'at' : ''} ${c ? '' : 'falta'}" style="width:${Math.max(58, Math.round((c ? tamanho(k) : alvo(b)) * 16))}px">
        <b>${k + 1}</b> ${b.gancho ? 'gancho' : esc(b.cena)}<br>${c ? seg(tamanho(k)) : 'falta'}</button>`;
    }).join('');
    g('etl').querySelectorAll('button').forEach(bt => bt.onclick = () => selecionar(Number(bt.dataset.k)));
  }
  function abrirEditor(k) {
    if (gravando) return;
    if (revendo) voltarCamera();
    pararCamera(); g('gprev').srcObject = null;
    g('ggrava').hidden = true; g('gedit').hidden = false;
    selecionar(k);
  }
  function selecionar(k) {
    pararPrevia();
    sel = k;
    desenharTimeline();
    const b = blocos[k], c = takes()[k], op = opcoes();
    const p = g('epainel');
    if (!c) {
      p.innerHTML = `<h4>Bloco ${k + 1} <span>${b.gancho ? 'GANCHO' : esc(CENA[b.cena] || b.cena)}</span></h4>
        <p>Este bloco ainda não foi gravado.</p><div class="ebot"><button id="eregravar" class="on">🎥 Gravar este bloco</button></div>`;
      g('eregravar').onclick = () => irGravar(k);
      const ctx = g('ecanvas').getContext('2d'); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      return;
    }
    p.innerHTML = `<h4>Bloco ${k + 1} <span>${b.gancho ? 'GANCHO' : esc(CENA[b.cena] || b.cena)}</span></h4>
      <label>✂️ Começa em <b id="vini"></b></label><input id="rini" type="range" min="0" max="${c.dur}" step="0.05" value="${c.ini}">
      <label>✂️ Termina em <b id="vfim"></b> <small>(take de ${seg(c.dur)})</small></label><input id="rfim" type="range" min="0" max="${c.dur}" step="0.05" value="${c.fim}">
      <div class="ebot"><button id="etrecho">▶ Ver este bloco</button><button id="eregravar">🎥 Regravar</button></div>
      <label for="etexto">Texto na tela</label><input id="etexto" type="text" value="${esc(b.texto_tela)}">
      <label for="efala">Legenda (o que você falou)</label><textarea id="efala">${esc(b.fala)}</textarea>
      ${b.cena === 'tela' ? '' : `<label>Enquadramento</label>
      <div class="ebot"><button data-e="preencher">Preencher a tela</button><button data-e="inteiro">Vídeo inteiro</button></div>`}
      <label>Velocidade deste bloco</label>
      <div class="ebot">${[1, 1.15, 1.3, 1.5].map(x => `<button data-v="${x}">${String(x).replace('.', ',')}×</button>`).join('')}</div>
      <label style="margin-top:20px;font:20px Anton,Impact,sans-serif">VÍDEO TODO</label>
      <label class="echeck"><input id="evoz" type="checkbox" ${op.voz ? 'checked' : ''}> 🎙 Melhorar voz (mais clara e mais alta)</label>
      <label class="echeck"><input id="eleg" type="checkbox" ${op.legenda ? 'checked' : ''}> Legenda automática (palavra por palavra)</label>
      <label class="echeck"><input id="ezoom" type="checkbox" ${op.zoomCorte ? 'checked' : ''}> Zoom de impacto em cada corte</label>
      <label class="echeck"><input id="emasc" type="checkbox" ${op.mascote ? 'checked' : ''}> Mascote no final</label>
      <label>Filtro de cor</label>
      <div class="ebot" style="flex-wrap:wrap">${Object.keys(FILTROS).map(f => `<button data-f="${f}" style="flex:1 0 28%">${NOMES_FILTRO[f]}</button>`).join('')}</div>
      <label>🎵 Música de fundo</label>
      <div class="ebot"><button id="emus">${item.musica ? '🎵 ' + esc(item.musicaNome || 'música') : 'Escolher música do celular'}</button>
        ${item.musica ? '<button id="emusx" style="flex:0 0 52px">✕</button>' : ''}</div>
      ${item.musica ? `<label>Volume da música <b id="vmus"></b></label><input id="evolm" type="range" min="0" max="0.6" step="0.01" value="${op.volMusica}">` : ''}
      <input id="earq" type="file" accept="audio/*" hidden>`;
    const mostrarCorte = () => { g('vini').textContent = seg(c.ini); g('vfim').textContent = seg(c.fim); };
    mostrarCorte();
    const guardar = () => salvar(item).catch(() => {});
    g('rini').oninput = () => { c.ini = Math.min(Number(g('rini').value), c.fim - 0.3); g('rini').value = c.ini; mostrarCorte(); mostrarQuadro(k, c.ini); };
    g('rfim').oninput = () => { c.fim = Math.max(Number(g('rfim').value), c.ini + 0.3); g('rfim').value = c.fim; mostrarCorte(); mostrarQuadro(k, c.fim - 0.05); };
    g('rini').onchange = g('rfim').onchange = () => { desenharTimeline(); guardar(); };
    g('etrecho').onclick = () => previa([k]);
    g('eregravar').onclick = () => irGravar(k);
    g('etexto').oninput = () => { setTexto(k, 'texto_tela', g('etexto').value); mostrarQuadro(k); };
    g('efala').oninput = () => { setTexto(k, 'fala', g('efala').value); mostrarQuadro(k); };
    g('etexto').onchange = g('efala').onchange = guardar;
    ui.querySelectorAll('[data-e]').forEach(bt => {
      bt.classList.toggle('on', (c.enquadre || 'auto') === bt.dataset.e);
      bt.onclick = () => { c.enquadre = bt.dataset.e; guardar(); selecionar(k); };
    });
    g('eleg').onchange = () => { op.legenda = g('eleg').checked; guardar(); mostrarQuadro(k); };
    g('emasc').onchange = () => { op.mascote = g('emasc').checked; guardar(); mostrarQuadro(k); };
    g('evoz').onchange = () => { op.voz = g('evoz').checked; guardar(); };
    g('ezoom').onchange = () => { op.zoomCorte = g('ezoom').checked; guardar(); };
    ui.querySelectorAll('[data-v]').forEach(bt => {
      bt.classList.toggle('on', vel(c) === Number(bt.dataset.v));
      bt.onclick = () => { c.vel = Number(bt.dataset.v); guardar(); selecionar(k); };
    });
    ui.querySelectorAll('[data-f]').forEach(bt => {
      bt.classList.toggle('on', op.filtro === bt.dataset.f);
      bt.onclick = () => { op.filtro = bt.dataset.f; guardar(); ui.querySelectorAll('[data-f]').forEach(x => x.classList.toggle('on', x === bt)); mostrarQuadro(k); };
    });
    g('emus').onclick = () => g('earq').click();
    g('earq').onchange = async () => {
      const f = g('earq').files[0]; if (!f) return;
      if (f.size > 25e6) return alert('Música grande demais (mais de 25 MB). Escolha um arquivo menor.');
      item.musica = f; item.musicaNome = f.name.replace(/\.[^.]+$/, ''); await guardar(); selecionar(k);
    };
    if (g('emusx')) g('emusx').onclick = async () => { delete item.musica; delete item.musicaNome; await guardar(); selecionar(k); };
    if (g('evolm')) {
      const mostrarVol = () => { g('vmus').textContent = Math.round(op.volMusica * 100 / 0.6) + '%'; };
      mostrarVol();
      g('evolm').oninput = () => { op.volMusica = Number(g('evolm').value); mostrarVol(); };
      g('evolm').onchange = guardar;
    }
    mostrarQuadro(k);
  }

  async function previa(ks) {
    if (ocupado) return;
    pararPrevia();
    const lista = ks || blocos.map((_, k) => k).filter(k => k >= sel && takes()[k]);
    if (!lista.length) return;
    await carregarMascote();
    const controle = {parar: false};
    tocando = controle; g('eplay').textContent = '⏸';
    await tocar(lista, ac().destination, null, controle, (dec, tot, k) => {
      g('etempo').textContent = `${seg(dec)} / ${seg(tot)}`;
      if (k !== sel) { sel = k; desenharTimeline(); }
    });
    if (tocando === controle) { tocando = null; g('eplay').textContent = '▶'; }
  }
  function pararPrevia() {
    if (tocando) tocando.parar = true;
    tocando = null;
    if (ui) g('eplay').textContent = '▶';
  }

  /* ---------------------------------------------------------------- exportar o vídeo final */
  const aviso = t => { g('eaviso').hidden = !t; g('eaviso').textContent = t; };
  async function exportar() {
    if (blocos.some((_, k) => !takes()[k])) {
      const k = blocos.findIndex((_, n) => !takes()[n]);
      selecionar(k);
      return alert(`Falta gravar o bloco ${k + 1}.`);
    }
    pararPrevia(); ocupado = true;
    aviso('Montando o vídeo…\nDeixe o app aberto nesta tela.');
    await carregarMascote();
    const a = ac(), dest = a.createMediaStreamDestination();
    const saida = new MediaStream([...g('ecanvas').captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
    const mt = tipo(), partes = [];
    const r = new MediaRecorder(saida, {...(mt ? {mimeType: mt} : {}), videoBitsPerSecond: 6e6, audioBitsPerSecond: 128000});
    r.ondataavailable = e => { if (e.data.size) partes.push(e.data); };
    await tocar(blocos.map((_, k) => k), dest, r, {parar: false}, (dec, tot) => {
      aviso(`Montando o vídeo… ${Math.round(100 * dec / tot)}%\nDeixe o app aberto nesta tela.`);
    });
    const terminou = new Promise(ok => { r.onstop = ok; });
    if (r.state === 'paused') r.resume();
    if (r.state !== 'inactive') r.stop();
    await terminou;
    item.video = new Blob(partes, {type: (r.mimeType || mt || 'video/webm').split(';')[0]});
    item.videoDur = totalDur();
    await salvar(item);
    aviso(''); ocupado = false;
    alert(`Vídeo pronto! ${Math.round(item.videoDur)} s. Ele aparece no roteiro, com o botão de compartilhar.`);
    fechar();
  }

  return {abrir};
})();
