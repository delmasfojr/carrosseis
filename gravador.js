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
  const PADRAO = {legenda: true, legendaVoz: true, mascote: true, voz: true, filtro: 'nenhum', zoomCorte: true, volMusica: 0.15, ruido: false};
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
    return [{tempo: '0–3 s', cena: 'camera', fala: c.ganchos[it.gancho || 0], quadro: c.gancho_quadro || '', texto_tela: c.texto_capa, gancho: true}, ...c.blocos];
  }
  // edição de texto vai direto para o roteiro (o gancho mora em ganchos[] e texto_capa)
  function setTexto(k, campo, valor) {
    const c = item.conteudo;
    if (k === 0) { if (campo === 'fala') c.ganchos[item.gancho || 0] = valor; else if (campo === 'quadro') c.gancho_quadro = valor; else c.texto_capa = valor; }
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
.eprev{position:relative;flex:none;height:40dvh;background:#000;display:flex;justify-content:center;padding-top:env(safe-area-inset-top)}
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
.eabas{display:flex;gap:2px;overflow-x:auto;padding:6px 6px;background:#fff;border-bottom:2px solid #D9DDE3;flex:none;scrollbar-width:none}
#grav .eabas button{flex:1 1 0;min-width:0;display:flex;flex-direction:column;align-items:center;gap:1px;padding:6px 2px;background:none;color:#556;font-size:11px;border-radius:10px !important}
#grav .eabas button i{font-style:normal;font-size:20px;line-height:1.1}
#grav .eabas button.on{background:#0F1B2D;color:#fff}
.eaba>label:first-child{margin-top:4px}
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
        <div class="eabas" id="eabas">${ABAS_ED.map(([id, ic, nome]) => `<button data-aba="${id}"><i>${ic}</i>${nome}</button>`).join('')}</div>
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
  const contador = (t, peq) => { g('gconta').textContent = t; g('gconta').classList.toggle('peq', !!peq); };

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
    g('gruido').textContent = opcoes().ruido ? '🎙 Reduzir ruído: LIGADO' : '🎙 Reduzir ruído: desligado';
    g('gruido').title = opcoes().ruido ? 'Bom para lugar barulhento' : 'Voz mais natural (lugar silencioso)';
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
    for (const n of [3, 2, 1]) { contador(n); await espera(650); }
    contador('');
    const mt = tipo(), partes = [], a = alvo(blocos[i]);
    rec = new MediaRecorder(stream, {...(mt ? {mimeType: mt} : {}), videoBitsPerSecond: 6e6, audioBitsPerSecond: 192000});
    rec.ondataavailable = e => { if (e.data.size) partes.push(e.data); };
    rec.onstop = async () => {
      clearInterval(relogio);
      const blob = new Blob(partes, {type: (rec.mimeType || mt || 'video/webm').split(';')[0]});
      const c = {blob, dur: (Date.now() - t0) / 1000, facing};
      gravando = false;
      if (blob.size < 2000) {  // a câmera não entregou imagem: não guarda um take vazio
        atualizarGravar();
        return alert('Esse take não gravou (a câmera não mandou imagem). Toque em 🔄 ou saia e entre de novo, e grave este bloco outra vez.');
      }
      g('ginfo').textContent = 'Guardando o take…';
      await analisar(c);
      takes()[i] = c;
      try { await salvar(item); } catch (e) { alert('Não consegui guardar o take: ' + e.message); }
      transcreverFundo(i);  // legenda pela voz real, sem travar a gravação
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
    for (const v of quadros.values()) soltar(v);
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
  function distribuir(texto, segs, pesos) {
    // espalha as palavras pelos trechos com voz, proporcional ao tamanho de cada palavra (ou aos pesos dados)
    const pal = Array.isArray(texto) ? texto : String(texto).split(/\s+/).filter(Boolean);
    const peso = pesos || pal.map(w => w.length + 2 + (/[.,!?…:;]$/.test(w) ? 4 : 0));
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
  const gruposDe = k => {
    const c = takes()[k], op = opcoes();
    if (!op.legenda) return [];
    if (op.legendaVoz && c.transcricao && c.transcricao.length)
      return agrupar(c.transcricao.filter(p => p.b > c.ini - 0.05 && p.a < c.fim));
    const pal = String(blocos[k].fala).split(/\s+/).filter(Boolean);  // pelo roteiro: mesmo encaixe por frases
    return agrupar(alinhar(pal, pal.map(w => w.length + 2), cortados(c)));
  };

  /* ---------------------------------------------------------------- legenda pela voz real (Gemini) */
  // o áudio vai leve: mono, 16 kHz, WAV (10 s ≈ 320 KB)
  async function wav16k(blob) {
    const buf = await ac().decodeAudioData(await blob.arrayBuffer());
    const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(buf.duration * 16000)), 16000);
    const fonte = off.createBufferSource(); fonte.buffer = buf; fonte.connect(off.destination); fonte.start();
    const d = (await off.startRendering()).getChannelData(0);
    const out = new DataView(new ArrayBuffer(44 + d.length * 2));
    const txt = (o, t) => [...t].forEach((ch, n) => out.setUint8(o + n, ch.charCodeAt(0)));
    txt(0, 'RIFF'); out.setUint32(4, 36 + d.length * 2, true); txt(8, 'WAVE'); txt(12, 'fmt ');
    out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true); out.setUint32(24, 16000, true);
    out.setUint32(28, 32000, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true); txt(36, 'data'); out.setUint32(40, d.length * 2, true);
    for (let n = 0; n < d.length; n++) out.setInt16(44 + n * 2, Math.max(-1, Math.min(1, d[n])) * 32767, true);
    return out.buffer;
  }
  function base64(buf) {
    const b = new Uint8Array(buf); let t = '';
    for (let n = 0; n < b.length; n += 0x8000) t += String.fromCharCode.apply(null, b.subarray(n, n + 0x8000));
    return btoa(t);
  }
  const ESQ_T = {type: 'OBJECT', properties: {palavras: {type: 'ARRAY', items: {type: 'OBJECT',
    properties: {palavra: {type: 'STRING'}, inicio: {type: 'NUMBER'}, fim: {type: 'NUMBER'}}, required: ['palavra', 'inicio', 'fim']}}},
    required: ['palavras']};
  const PROMPT_T = `Transcreva este áudio em português do Brasil, PALAVRA POR PALAVRA, exatamente como foi falado
(inclusive repetições), com pontuação correta e todos os acentos. Para cada palavra, dê o instante em que ela começa
e termina, em segundos (com duas casas decimais) contados do início do áudio.
Números, porcentagens e contas: escreva como aparecem numa legenda de vídeo de matemática (ex.: "25%", "8", "1/4", "x²").
Se não houver fala, devolva a lista vazia.`;
  async function transcrever(k) {
    const c = takes()[k];
    const dados = base64(await wav16k(c.blob));
    const corpo = JSON.stringify({
      contents: [{parts: [{inlineData: {mimeType: 'audio/wav', data: dados}},
        {text: PROMPT_T + `\n\nTexto que a pessoa pretendia ler (só como referência para a grafia de termos e números; ` +
          `transcreva o que foi DE FATO falado): "${blocos[k].fala}"`}]}],
      generationConfig: {responseMimeType: 'application/json', responseSchema: ESQ_T, temperature: 0},
    });
    const r = await chamarGemini(corpo, () => {});
    c.transcricao = ajustarTempos((r.palavras || []).map(x => ({w: String(x.palavra || '').trim(), a: Number(x.inicio), b: Number(x.fim)})), c);
    if (!c.corteManual && c.transcricao.length) {  // a transcrição sabe melhor onde a fala começa e termina
      c.ini = Math.max(0, c.transcricao[0].a - 0.15);
      c.fim = Math.min(c.dur, c.transcricao[c.transcricao.length - 1].b + 0.35);
    }
    await salvar(item);
  }
  // O Gemini acerta as PALAVRAS, mas o relógio dele costuma vir comprimido ou deslocado. Então: as palavras são dele,
  // a duração relativa de cada uma também, e o tempo real vem dos trechos com voz medidos no próprio áudio
  // (as pausas da fala ficam nos silêncios de verdade).
  function ajustarTempos(pal, c) {
    pal = pal.filter(p => p.w);
    if (!pal.length) return [];
    const voz = c.segs && c.segs.length ? c.segs : [[0, c.dur]];
    const bons = pal.every(p => isFinite(p.a) && isFinite(p.b) && p.b > p.a);
    const pesos = pal.map(p => bons ? Math.max(0.06, p.b - p.a) : p.w.length + 2);
    const pausas = pal.map((p, n) => bons && n > 0 && p.a - pal[n - 1].b > 0.1 ? 1 : 0);
    return alinhar(pal.map(p => p.w), pesos, voz, pausas);
  }
  /* Encaixa as frases nos trechos de voz: cada trecho entre pausas recebe um grupo de palavras seguidas.
     Escolhe os pontos de quebra (de preferência em vírgula, ponto ou pausa) para que o tamanho de cada grupo
     combine com a duração do trecho; dentro do trecho, as palavras se espalham pelos pesos. */
  function alinhar(pal, pesos, segs, pausas) {
    const n = pal.length, m = segs.length;
    if (!n) return [];
    if (m === 1) return distribuir(pal, segs, pesos);
    const D = segs.map(s => s[1] - s[0]), pre = [0];
    pesos.forEach(p => pre.push(pre[pre.length - 1] + p));
    const escala = D.reduce((a, b) => a + b, 0) / pre[n];
    const bonus = h => (/[.,!?…:;]$/.test(pal[h - 1]) ? 0.8 : 0) + (pausas && pausas[h] ? 0.5 : 0);
    const custo = (h, i, j) => 2 * Math.log((escala * (pre[i] - pre[h]) + 0.15) / (D[j] + 0.15)) ** 2;
    const dp = Array.from({length: m + 1}, () => new Array(n + 1).fill(Infinity)), de = dp.map(l => l.map(() => -1));
    dp[0][0] = 0;
    for (let j = 1; j <= m; j++) for (let i = 0; i <= n; i++) {
      dp[j][i] = dp[j - 1][i] + 1.2; de[j][i] = i;  // trecho sem fala (barulho): pula
      for (let h = 0; h < i; h++) {
        const v = dp[j - 1][h] + custo(h, i, j - 1) - (h > 0 ? bonus(h) : 0);
        if (v < dp[j][i]) { dp[j][i] = v; de[j][i] = h; }
      }
    }
    const out = [];
    for (let j = m, i = n; j > 0; j--) {
      const h = de[j][i];
      if (h < i) out.unshift(...distribuir(pal.slice(h, i), [segs[j - 1]], pesos.slice(h, i)));
      i = h;
    }
    return out;
  }
  const transcrevendo = new Set();
  async function transcreverFundo(k) {
    if (!chave() || !opcoes().legendaVoz || transcrevendo.has(k)) return;
    const c = takes()[k];
    transcrevendo.add(k);
    try { await transcrever(k); } catch (e) { c.erroTranscricao = e.message; }
    finally {
      transcrevendo.delete(k);
      if (takes()[k] === c && !g('gedit').hidden) { desenharTimeline(); if (sel === k) selecionar(k); }
    }
  }
  // texto da legenda corrigido à mão: mantém os tempos (mesmo nº de palavras) ou redistribui no mesmo trecho
  function retemporizar(c, texto) {
    const velhas = c.transcricao, novas = texto.split(/\s+/).filter(Boolean);
    if (!novas.length) return [];
    if (novas.length === velhas.length) return velhas.map((p, n) => ({...p, w: novas[n]}));
    const a = velhas[0].a, b = velhas[velhas.length - 1].b;
    const trechos = (c.segs || []).map(([x, y]) => [Math.max(x, a), Math.min(y, b)]).filter(([x, y]) => y - x > 0.05);
    return distribuir(novas.join(' '), trechos.length ? trechos : [[a, b]]);
  }

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
  function caixa(ctx, txt, yc, fundo, tam, corTexto = '#fff') {
    ctx.font = `${tam}px Anton, Impact, sans-serif`;
    const linhas = quebrar(ctx, String(txt).toUpperCase(), W - 220), alt = tam * 1.12;
    const larg = Math.max(...linhas.map(l => ctx.measureText(l).width)) + 70, h = linhas.length * alt + 44;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (fundo) {
      ctx.save(); ctx.shadowColor = '#0006'; ctx.shadowBlur = 24;
      ctx.fillStyle = fundo; retangulo(ctx, (W - larg) / 2, yc - h / 2, larg, h, 26); ctx.fill(); ctx.restore();
    } else {  // sem caixa: letra branca com contorno, como legenda
      ctx.lineJoin = 'round'; ctx.lineWidth = tam * 0.17; ctx.strokeStyle = NAVY;
      linhas.forEach((l, k) => ctx.strokeText(l, W / 2, yc - h / 2 + 22 + alt * (k + 0.5)));
    }
    ctx.fillStyle = corTexto;
    linhas.forEach((l, k) => ctx.fillText(l, W / 2, yc - h / 2 + 22 + alt * (k + 0.5)));
  }
  function conta(ctx, txt, yc, larg, maxTam) {  // texto grande da conta (layouts com fundo creme)
    if (!txt) return;
    let tam = maxTam; ctx.font = `${tam}px Anton, Impact, sans-serif`;
    let linhas = quebrar(ctx, txt, larg);
    while ((linhas.length > 3 || Math.max(...linhas.map(l => ctx.measureText(l).width)) > larg) && tam > 56) {
      tam -= 8; ctx.font = `${tam}px Anton, Impact, sans-serif`; linhas = quebrar(ctx, txt, larg);
    }
    ctx.fillStyle = NAVY; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    linhas.forEach((l, n) => ctx.fillText(l, W / 2, yc + (n - (linhas.length - 1) / 2) * tam * 1.15));
  }
  function lousa(ctx, txt, yc) {  // quadro-negro com a conta escrita a giz
    if (!txt) return;
    let tam = 110; ctx.font = `${tam}px Anton, Impact, sans-serif`;
    let linhas = quebrar(ctx, txt, W - 220);
    while ((linhas.length > 3 || Math.max(...linhas.map(l => ctx.measureText(l).width)) > W - 220) && tam > 54) {
      tam -= 8; ctx.font = `${tam}px Anton, Impact, sans-serif`; linhas = quebrar(ctx, txt, W - 220);
    }
    const h = linhas.length * tam * 1.15 + 90;
    ctx.save(); ctx.shadowColor = '#0007'; ctx.shadowBlur = 30;
    ctx.fillStyle = '#1E3A2F'; retangulo(ctx, 60, yc - h / 2, W - 120, h, 28); ctx.fill(); ctx.restore();
    ctx.lineWidth = 14; ctx.strokeStyle = '#8B5A2B'; retangulo(ctx, 60, yc - h / 2, W - 120, h, 28); ctx.stroke();
    ctx.fillStyle = '#F4F1E8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    linhas.forEach((l, n) => ctx.fillText(l, W / 2, yc + (n - (linhas.length - 1) / 2) * tam * 1.15));
  }
  // o mascote balança enquanto a voz fala (pela legenda) e respira quando está em silêncio
  function boneco(ctx, pose, x, base, h, falando, t) {
    const im = poses.get(pose) || poses.get('explicando');
    if (!im || !im.naturalWidth) return;
    const pulo = falando ? Math.abs(Math.sin(t * 9)) * 14 : Math.sin(t * 2) * 4;
    const w = im.naturalWidth * h / im.naturalHeight, inc = falando ? Math.sin(t * 4.5) * 0.025 : 0;
    ctx.save(); ctx.translate(x + w / 2, base); ctx.rotate(inc); ctx.drawImage(im, -w / 2, -h - pulo, w, h); ctx.restore();
  }
  const falandoEm = (grupos, t) => grupos.some(gr => gr.some(p => p.a - 0.05 <= t && t <= p.b + 0.08));
  function circulo(ctx, v, cx, cy, r) {
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI); ctx.clip(); cobrir(ctx, v, cx - r, cy - r, 2 * r, 2 * r); ctx.restore();
    ctx.save(); ctx.filter = 'none'; ctx.lineWidth = 12; ctx.strokeStyle = LAR; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI); ctx.stroke(); ctx.restore();
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
  const LAYOUTS = {auto: 'Automático', cheia: 'Câmera cheia', inteira: 'Câmera inteira', circulo: 'Conta + círculo',
    dividida: 'Tela dividida', canto: 'Conta + rosto no canto', mascote: 'Mascote + lousa',
    mascote_fundo: 'Mascote comigo de fundo', alternar: 'Alternar eu ↔ mascote'};
  const POSES = {explicando: 'Explicando', ideia: 'Ideia', resolvendo: 'Resolvendo', pensando: 'Pensando',
    desafiando: 'Desafiando', confiante: 'Confiante', estudando: 'Estudando', joinha: 'Joinha'};
  const COM_TEXTO = ['circulo', 'dividida', 'canto', 'mascote', 'mascote_fundo', 'alternar'];
  const COM_MASCOTE = ['mascote', 'mascote_fundo', 'alternar'];
  const TRANSICOES = {nenhuma: 'Corte seco', zoom: 'Zoom', esmaecer: 'Esmaecer', deslizar: 'Deslizar', subir: 'Subir', flash: 'Flash', desfoque: 'Desfoque'};
  const CORES_TITULO = {laranja: [LAR, '#fff'], navy: [NAVY, '#fff'], branco: ['#fff', NAVY], amarelo: ['#FFD21F', NAVY], sem: [null, '#fff']};
  const TAM_TITULO = {P: 62, M: 80, G: 104};
  const POS_TITULO = {alto: 0.17, centro: 0.42, baixo: 0.8};
  function est(k) {  // estilo do bloco k, com os padrões
    const todos = item.estilo || (item.estilo = []);
    const e = todos[k] || (todos[k] = {});
    const b = blocos[k], c = takes()[k], op = opcoes();
    if (!e.layout) e.layout = b.cena === 'tela' ? 'circulo' : c && c.enquadre === 'inteiro' ? 'inteira' : c && c.enquadre === 'preencher' ? 'cheia' : 'auto';
    if (!e.transicao) e.transicao = k === 0 || op.zoomCorte === false ? 'nenhuma' : 'zoom';
    if (!e.corTitulo) e.corTitulo = b.gancho ? 'laranja' : 'navy';
    if (!e.tamTitulo) e.tamTitulo = b.gancho ? 'G' : 'M';
    if (!e.posTitulo) e.posTitulo = 'alto';
    if (e.animTitulo == null) e.animTitulo = true;
    if (!e.pose) e.pose = 'explicando';
    return e;
  }
  const layoutDe = (k, v) => { const l = est(k).layout; return l !== 'auto' ? l : v && v.videoWidth / v.videoHeight > 0.8 ? 'inteira' : 'cheia'; };
  function desenhar(ctx, v, k, grupos, t, decorrido, total) {
    const c = takes()[k], b = blocos[k], op = opcoes(), e = est(k);
    let lay = layoutDe(k, v);
    const local = Math.max(0, (t - c.ini) / vel(c));  // segundos desde o começo deste bloco no vídeo final
    if (lay === 'alternar') {  // a cada frase (trecho de voz) troca: eu, mascote, eu, mascote...
      const n = cortados(c).filter(sg => sg[0] <= t + 0.05).length;
      lay = n % 2 === 1 || n === 0 ? (v.videoWidth / v.videoHeight > 0.8 ? 'inteira' : 'cheia') : 'mascote_fundo';
    }
    const creme = lay === 'circulo' || lay === 'dividida' || lay === 'canto' || lay === 'mascote';
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    const filtro = FILTROS[op.filtro] || 'none';
    // transição "zoom": 8% de zoom que volta ao normal em 0,35 s (as outras transições são feitas em tocar())
    const z = e.transicao === 'zoom' && k > 0 && local < 0.35 ? 1 + 0.08 * Math.pow(1 - local / 0.35, 2) : 1;
    ctx.save();
    if (z !== 1) { ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-W / 2, -H / 2); }
    if (creme) { ctx.fillStyle = CREME; ctx.fillRect(0, 0, W, H); }
    ctx.filter = filtro;
    if (lay === 'circulo') {  // conta grande e o professor num círculo
      ctx.filter = 'none'; conta(ctx, b.quadro, H * 0.36, W - 160, 120); ctx.filter = filtro;
      circulo(ctx, v, W / 2, H * 0.53 + 30, 200);
    } else if (lay === 'dividida') {  // conta em cima, câmera embaixo
      ctx.filter = 'none'; conta(ctx, b.quadro, H * 0.3, W - 140, 120); ctx.filter = filtro;
      ctx.save(); ctx.beginPath(); ctx.rect(0, H * 0.48, W, H * 0.52); ctx.clip(); cobrir(ctx, v, 0, H * 0.48, W, H * 0.52); ctx.restore();
      ctx.save(); ctx.filter = 'none'; ctx.fillStyle = LAR; ctx.fillRect(0, H * 0.48 - 6, W, 12); ctx.restore();
    } else if (lay === 'canto') {  // conta ocupando a tela e o rosto pequeno no canto
      ctx.filter = 'none'; conta(ctx, b.quadro, H * 0.38, W - 140, 140); ctx.filter = filtro;
      circulo(ctx, v, W - 190, H * 0.56, 150);
    } else if (lay === 'mascote') {  // só o mascote apresentando, com a lousa; a voz é a sua
      ctx.filter = 'none'; lousa(ctx, b.quadro, H * 0.36);
      boneco(ctx, e.pose, 30, H * 0.97, 680, falandoEm(grupos, t), local);
    } else if (lay === 'mascote_fundo') {  // você ao fundo (escurecido) e o mascote na frente apresentando
      ctx.save(); ctx.filter = `${filtro === 'none' ? '' : filtro} blur(3px) brightness(.5)`; cobrir(ctx, v, -20, -20, W + 40, H + 40); ctx.restore();
      ctx.filter = 'none'; lousa(ctx, b.quadro, H * 0.36);
      boneco(ctx, e.pose, 30, H * 0.97, 680, falandoEm(grupos, t), local);
    } else if (lay === 'inteira') {  // vídeo inteiro, com o fundo borrado
      ctx.save(); ctx.filter = 'blur(36px) brightness(.55)'; cobrir(ctx, v, -60, -60, W + 120, H + 120); ctx.restore();
      ctx.filter = filtro; caber(ctx, v);
    } else cobrir(ctx, v, 0, 0, W, H);
    ctx.restore(); ctx.filter = 'none';
    ctx.fillStyle = '#ffffff40'; ctx.fillRect(0, 0, W, 14);
    ctx.fillStyle = LAR; ctx.fillRect(0, 0, W * Math.min(1, decorrido / total), 14);
    ctx.font = '42px Anton, Impact, sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    const a = '@DELMAO', bb = 'SIMPLIFICA', la = ctx.measureText(a).width, lb = ctx.measureText(bb).width;
    ctx.save(); ctx.shadowColor = creme ? 'transparent' : '#000a'; ctx.shadowBlur = 10;
    ctx.fillStyle = creme ? NAVY : '#fff'; ctx.fillText(a, (W - la - lb) / 2, 80);
    ctx.fillStyle = LAR; ctx.fillText(bb, (W - la - lb) / 2 + la, 80); ctx.restore();
    if (b.texto_tela) {
      const [fundo, corT] = CORES_TITULO[e.corTitulo] || CORES_TITULO.navy, y = H * (POS_TITULO[e.posTitulo] || 0.17);
      const q = e.animTitulo ? Math.min(1, local / 0.22) : 1;  // entra "pulando" no começo do bloco
      const sc = 0.7 + 0.3 * (1 - Math.pow(1 - q, 3)) + (q < 1 ? 0.06 * Math.sin(q * Math.PI) : 0);
      ctx.save(); ctx.translate(W / 2, y); ctx.scale(sc, sc); ctx.translate(-W / 2, -y); ctx.globalAlpha = Math.min(1, q * 1.6);
      caixa(ctx, b.texto_tela, y, fundo, TAM_TITULO[e.tamTitulo] || 80, corT);
      ctx.restore();
    }
    legenda(ctx, grupos, t, H * 0.68);
    if (k === blocos.length - 1 && opcoes().mascote && mascote && mascote.naturalWidth && !COM_MASCOTE.includes(est(k).layout)) {
      const h = 380, w = mascote.naturalWidth * h / mascote.naturalHeight;  // abaixo da legenda
      ctx.drawImage(mascote, 30, H * 0.92 - h, w, h);
    }
  }

  /* ---------------------------------------------------------------- tocar os takes (prévia e exportação) */
  const tamanho = k => { const c = takes()[k]; return c ? Math.max(0, c.fim - c.ini) / vel(c) : 0; };
  const totalDur = () => blocos.reduce((s, _, k) => s + tamanho(k), 0);
  const antes = k => blocos.slice(0, k).reduce((s, _, n) => s + tamanho(n), 0);
  // o celular só aguenta poucos vídeos abertos ao mesmo tempo: cada um é solto (soltar) assim que deixa de ser usado
  function soltar(v) {
    if (!v) return;
    try { v.pause(); } catch (e) { /* já parado */ }
    if (v.src && v.src.startsWith('blob:')) URL.revokeObjectURL(v.src);
    v.removeAttribute('src'); v.load();
  }
  async function abrirVideo(blob, tentativa = 0) {
    const v = document.createElement('video');
    v.playsInline = true; v.preload = 'auto'; v.src = URL.createObjectURL(blob);
    try {
      await new Promise((ok, erro) => { v.onloadeddata = ok; v.onerror = () => erro(new Error('não consegui abrir um take')); });
    } catch (e) {
      soltar(v);
      if (tentativa >= 2) throw e;
      await espera(600);  // dá tempo de o navegador liberar os vídeos anteriores
      return abrirVideo(blob, tentativa + 1);
    }
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
  // com a tela sem desenhar, o navegador pode nunca terminar de preparar uma imagem: espera no máximo um tempo
  const noMaximo = (p, ms) => Promise.race([Promise.resolve(p).catch(() => {}), espera(ms)]);
  const poses = new Map();
  async function carregarMascote() {
    const carregando = [];
    for (const nome of Object.keys(POSES)) if (!poses.has(nome)) {
      const im = new Image(); im.src = BASE + `mascote/${nome}.webp`; poses.set(nome, im);
      carregando.push(noMaximo(im.decode(), 2500));
    }
    await Promise.all(carregando);
    if (mascote) return;
    mascote = new Image(); mascote.src = BASE + 'mascote/joinha.webp';
    await noMaximo(mascote.decode(), 2500);
    await noMaximo(document.fonts.load('96px Anton'), 2500);
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
    // quadro final do bloco anterior (para as transições que misturam os dois)
    const foto = document.createElement('canvas'); foto.width = W; foto.height = H;
    const buf = document.createElement('canvas'); buf.width = W; buf.height = H;
    let temFoto = false;
    if (ks[0] > 0 && takes()[ks[0] - 1]) {  // vendo um bloco só: prepara o fim do anterior para mostrar a transição
      try {
        const ca = takes()[ks[0] - 1], va = await abrirVideo(ca.blob); va.muted = true;
        await irAoTempo(va, Math.max(0, ca.fim - 0.05));
        desenhar(foto.getContext('2d'), va, ks[0] - 1, gruposDe(ks[0] - 1), ca.fim - 0.05, antes(ks[0]), total);
        temFoto = true; soltar(va);
      } catch (e) { /* sem transição na prévia */ }
    }
    const T = 0.4, suave = x => x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
    function compor(k, v, grupos, t, dec) {
      const c = takes()[k], tr = est(k).transicao, local = Math.max(0, (t - c.ini) / vel(c));
      const cruzada = ['esmaecer', 'deslizar', 'subir', 'desfoque'].includes(tr) && temFoto && k > 0 && local < T;
      if (!cruzada) {
        desenhar(ctx, v, k, grupos, t, dec, total);
        if (tr === 'flash' && k > 0 && local < T) { ctx.fillStyle = `rgba(255,255,255,${0.95 * Math.pow(1 - local / T, 2)})`; ctx.fillRect(0, 0, W, H); }
        return;
      }
      const p = suave(local / T);
      desenhar(buf.getContext('2d'), v, k, grupos, t, dec, total);
      if (tr === 'esmaecer') { ctx.drawImage(foto, 0, 0); ctx.globalAlpha = p; ctx.drawImage(buf, 0, 0); ctx.globalAlpha = 1; }
      else if (tr === 'deslizar') { ctx.drawImage(foto, -W * p, 0); ctx.drawImage(buf, W * (1 - p), 0); }
      else if (tr === 'subir') { ctx.drawImage(foto, 0, -H * p); ctx.drawImage(buf, 0, H * (1 - p)); }
      else if (tr === 'desfoque') {
        ctx.save(); ctx.filter = `blur(${Math.round(28 * (1 - p))}px)`; ctx.drawImage(buf, 0, 0); ctx.restore();
        ctx.globalAlpha = 1 - p; ctx.drawImage(foto, 0, 0); ctx.globalAlpha = 1;
      }
    }
    try { await tocarBlocos(); } finally {
      if (musica) { musica.pause(); fonteM.disconnect(); URL.revokeObjectURL(musica.src); }
      if (voz) voz.nos.forEach(x => x.disconnect());
    }
    async function tocarBlocos() {
    for (const k of ks) {
      if (controle.parar) break;
      const c = takes()[k]; if (!c) continue;
      let v;
      try { v = await abrirVideo(c.blob); } catch (e) { throw new Error(`o take do bloco ${k + 1} está com defeito. Toque nesse bloco e em 🎥 Regravar.`); }
      const a = ac();
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
            compor(k, v, grupos, t, dec);
            if (aoTempo) aoTempo(dec, total, k);
          }
          if (t >= c.fim || v.ended) {
            ganho.gain.value = 0; if (musica) musica.pause(); if (gravador && gravador.state === 'recording') gravador.pause();
            foto.getContext('2d').drawImage(ctx.canvas, 0, 0); temFoto = true;  // guarda o último quadro para a próxima transição
            v.pause(); ok(); return;
          }
          proximo(passo);
        };
        proximo(passo);
      });
      fonte.disconnect(); soltar(v);
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
      if (v) soltar(v);
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
        <b>${k + 1}</b> ${b.gancho ? 'gancho' : esc(b.cena)}<br>${c ? seg(tamanho(k)) + (transcrevendo.has(k) ? ' ⏳' : c.transcricao ? ' 💬' : '') : 'falta'}</button>`;
    }).join('');
    g('etl').querySelectorAll('button').forEach(bt => bt.onclick = () => selecionar(Number(bt.dataset.k)));
  }
  const ABAS_ED = [['cortar', '✂️', 'Cortar'], ['titulo', '🔤', 'Título'], ['legenda', '💬', 'Legenda'],
    ['visual', '🎨', 'Layout'], ['efeitos', '✨', 'Efeitos'], ['som', '🎵', 'Som']];
  let abaEd = 'cortar';  // a aba fica a mesma ao trocar de bloco
  function mostrarAba() {
    ui.querySelectorAll('#eabas [data-aba]').forEach(b => {
      b.classList.toggle('on', b.dataset.aba === abaEd);
      b.onclick = () => { abaEd = b.dataset.aba; mostrarAba(); g('epainel').scrollTop = 0; };
    });
    g('epainel').querySelectorAll('.eaba').forEach(d => d.hidden = d.dataset.aba !== abaEd);
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
    g('eabas').hidden = !c;
    if (!c) {
      p.innerHTML = `<h4>Bloco ${k + 1} <span>${b.gancho ? 'GANCHO' : esc(CENA[b.cena] || b.cena)}</span></h4>
        <p>Este bloco ainda não foi gravado.</p><div class="ebot"><button id="eregravar" class="on">🎥 Gravar este bloco</button></div>`;
      g('eregravar').onclick = () => irGravar(k);
      const ctx = g('ecanvas').getContext('2d'); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      return;
    }
    p.innerHTML = `<h4>Bloco ${k + 1} <span>${b.gancho ? 'GANCHO' : esc(CENA[b.cena] || b.cena)}</span></h4>
      <div class="eaba" data-aba="cortar">
      <label>✂️ Começa em <b id="vini"></b></label><input id="rini" type="range" min="0" max="${c.dur}" step="0.05" value="${c.ini}">
      <label>✂️ Termina em <b id="vfim"></b> <small>(take de ${seg(c.dur)})</small></label><input id="rfim" type="range" min="0" max="${c.dur}" step="0.05" value="${c.fim}">
      <div class="ebot"><button id="etrecho">▶ Ver este bloco</button><button id="eregravar">🎥 Regravar</button></div>
      <label>Velocidade deste bloco</label>
      <div class="ebot">${[1, 1.15, 1.3, 1.5].map(x => `<button data-v="${x}">${String(x).replace('.', ',')}×</button>`).join('')}</div>
      </div>
      <div class="eaba" data-aba="titulo">
      <label for="etexto">Título na tela</label><input id="etexto" type="text" value="${esc(b.texto_tela)}" placeholder="(sem título neste bloco)">
      <div class="ebot" style="flex-wrap:wrap">${Object.keys(CORES_TITULO).map(x => `<button data-tc="${x}" style="flex:1 0 18%">${{laranja: '🟧', navy: '🟦', branco: '⬜', amarelo: '🟨', sem: 'Sem caixa'}[x]}</button>`).join('')}</div>
      <div class="ebot">${Object.keys(TAM_TITULO).map(x => `<button data-tt="${x}">${{P: 'Pequeno', M: 'Médio', G: 'Grande'}[x]}</button>`).join('')}</div>
      <div class="ebot">${Object.keys(POS_TITULO).map(x => `<button data-tp="${x}">${{alto: 'No alto', centro: 'No meio', baixo: 'Embaixo'}[x]}</button>`).join('')}</div>
      <label class="echeck"><input id="eanim" type="checkbox" ${est(k).animTitulo ? 'checked' : ''}> Título entra com animação</label>
      </div>
      <div class="eaba" data-aba="legenda">
      <label for="efala">Legenda <small id="eslg"></small></label>
      <textarea id="efala">${esc(c.transcricao && c.transcricao.length ? c.transcricao.map(p => p.w).join(' ') : b.fala)}</textarea>
      <div class="ebot"><button id="etransc"></button></div>
      <label class="echeck" style="margin-top:16px"><input id="eleg" type="checkbox" ${op.legenda ? 'checked' : ''}> Mostrar legenda (vale para o vídeo todo)</label>
      <label class="echeck"><input id="elvoz" type="checkbox" ${op.legendaVoz ? 'checked' : ''}> Legenda pela minha voz (senão, usa o texto do roteiro)</label>
      </div>
      <div class="eaba" data-aba="visual">
      <label>Layout deste bloco</label>
      <div class="ebot" style="flex-wrap:wrap">${Object.keys(LAYOUTS).map(x => `<button data-l="${x}" style="flex:1 0 30%">${LAYOUTS[x]}</button>`).join('')}</div>
      <div id="eposew"><label>Pose do mascote</label>
      <div class="ebot" style="flex-wrap:wrap">${Object.keys(POSES).map(x => `<button data-po="${x}" style="flex:1 0 22%;font-size:12px">${POSES[x]}</button>`).join('')}</div></div>
      <div id="econtaw"><label for="econta">Conta / texto grande (vai na lousa nos layouts do mascote)</label><input id="econta" type="text" value="${esc(b.quadro || '')}" placeholder="ex.: 8% de 25 = 25% de 8"></div>
      </div>
      <div class="eaba" data-aba="efeitos">
      ${k > 0 ? `<label>Transição para este bloco</label>
      <div class="ebot" style="flex-wrap:wrap">${Object.keys(TRANSICOES).map(x => `<button data-tr="${x}" style="flex:1 0 22%">${TRANSICOES[x]}</button>`).join('')}</div>
      <div class="ebot"><button id="etrtodos">Usar esta transição em todos os cortes</button></div>` : '<p>O primeiro bloco não tem transição (é onde o vídeo começa).</p>'}
      <label>Filtro de cor <small>(vídeo todo)</small></label>
      <div class="ebot" style="flex-wrap:wrap">${Object.keys(FILTROS).map(f => `<button data-f="${f}" style="flex:1 0 28%">${NOMES_FILTRO[f]}</button>`).join('')}</div>
      <label class="echeck" style="margin-top:16px"><input id="emasc" type="checkbox" ${op.mascote ? 'checked' : ''}> Mascote no final do vídeo</label>
      </div>
      <div class="eaba" data-aba="som">
      <label class="echeck"><input id="evoz" type="checkbox" ${op.voz ? 'checked' : ''}> 🎙 Melhorar voz (mais clara e mais alta)</label>
      <label>🎵 Música de fundo</label>
      <div class="ebot"><button id="emus">${item.musica ? '🎵 ' + esc(item.musicaNome || 'música') : 'Escolher música do celular'}</button>
        ${item.musica ? '<button id="emusx" style="flex:0 0 52px">✕</button>' : ''}</div>
      ${item.musica ? `<label>Volume da música <b id="vmus"></b></label><input id="evolm" type="range" min="0" max="0.6" step="0.01" value="${op.volMusica}">` : ''}
      <input id="earq" type="file" accept="audio/*" hidden>
      <div class="ebot" style="margin-top:22px"><button id="etudo" style="color:#b00;border-color:#e8b4b4 !important">🔁 Regravar tudo do início</button></div>
      </div>`;
    mostrarAba();
    const mostrarCorte = () => { g('vini').textContent = seg(c.ini); g('vfim').textContent = seg(c.fim); };
    mostrarCorte();
    const guardar = () => salvar(item).catch(() => {});
    g('rini').oninput = () => { c.corteManual = true; c.ini = Math.min(Number(g('rini').value), c.fim - 0.3); g('rini').value = c.ini; mostrarCorte(); mostrarQuadro(k, c.ini); };
    g('rfim').oninput = () => { c.corteManual = true; c.fim = Math.max(Number(g('rfim').value), c.ini + 0.3); g('rfim').value = c.fim; mostrarCorte(); mostrarQuadro(k, c.fim - 0.05); };
    g('rini').onchange = g('rfim').onchange = () => { desenharTimeline(); guardar(); };
    g('etrecho').onclick = () => previa([k]);
    g('eregravar').onclick = () => irGravar(k);
    g('etexto').oninput = () => { setTexto(k, 'texto_tela', g('etexto').value); mostrarQuadro(k); };
    g('efala').oninput = () => {
      if (c.transcricao && c.transcricao.length) c.transcricao = retemporizar(c, g('efala').value);
      else setTexto(k, 'fala', g('efala').value);
      mostrarQuadro(k);
    };
    const estado = () => {
      const tem = c.transcricao && c.transcricao.length;
      g('eslg').textContent = transcrevendo.has(k) ? '(ouvindo a sua voz…)' : tem ? '(feita pela sua voz ✓ — corrija se precisar)' :
        c.erroTranscricao ? '(pelo roteiro: não deu para ouvir a voz)' : '(pelo roteiro)';
      g('etransc').textContent = transcrevendo.has(k) ? '⏳ Ouvindo a sua voz…' : tem ? '🎙 Refazer legenda pela voz' : '🎙 Fazer legenda pela minha voz';
      g('etransc').disabled = transcrevendo.has(k);
    };
    estado();
    g('etransc').onclick = async () => {
      if (!chave()) return alert('Para a legenda pela voz, cole a chave do Gemini na ⚙️ (no alto da tela inicial).');
      delete c.erroTranscricao;
      const p = transcreverFundo(k); estado(); desenharTimeline(); await p;
      if (c.erroTranscricao && sel === k) alert('Não consegui ouvir a voz agora: ' + c.erroTranscricao);
    };
    g('etexto').onchange = g('efala').onchange = guardar;
    g('eleg').onchange = () => { op.legenda = g('eleg').checked; guardar(); mostrarQuadro(k); };
    g('emasc').onchange = () => { op.mascote = g('emasc').checked; guardar(); mostrarQuadro(k); };
    g('evoz').onchange = () => { op.voz = g('evoz').checked; guardar(); };
    g('elvoz').onchange = () => { op.legendaVoz = g('elvoz').checked; guardar(); mostrarQuadro(k); };
    const e = est(k);
    const marcar = (attr, valor) => ui.querySelectorAll(`[data-${attr}]`).forEach(x => x.classList.toggle('on', x.dataset[attr] === valor));
    const opcao = (attr, campo, depois) => {
      marcar(attr, String(e[campo]));
      ui.querySelectorAll(`[data-${attr}]`).forEach(x => x.onclick = () => {
        e[campo] = x.dataset[attr]; marcar(attr, e[campo]); guardar(); if (depois) depois(); mostrarQuadro(k);
      });
    };
    const mostrarConta = () => { g('econtaw').hidden = !COM_TEXTO.includes(e.layout); g('eposew').hidden = !COM_MASCOTE.includes(e.layout); };
    opcao('tc', 'corTitulo'); opcao('tt', 'tamTitulo'); opcao('tp', 'posTitulo'); opcao('l', 'layout', mostrarConta); opcao('po', 'pose');
    mostrarConta();
    g('eanim').onchange = () => { e.animTitulo = g('eanim').checked; guardar(); };
    g('econta').oninput = () => { setTexto(k, 'quadro', g('econta').value); mostrarQuadro(k); };
    g('econta').onchange = guardar;
    if (k > 0) {
      opcao('tr', 'transicao', () => previa([k]));  // ao escolher, já mostra a transição
      g('etrtodos').onclick = () => { blocos.forEach((_, n) => { if (n > 0) est(n).transicao = e.transicao; }); guardar(); alert(`Transição “${TRANSICOES[e.transicao]}” em todos os cortes.`); };
    }
    g('etudo').onclick = async () => {
      if (!confirm('Apagar TODOS os takes e gravar de novo a partir do bloco 1?\nOs textos, a legenda corrigida à mão, os estilos e a música ficam.')) return;
      item.takes = []; await guardar();
      for (const v of quadros.values()) soltar(v);
      quadros.clear();
      irGravar(0);
    };
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
    if (opcoes().legenda && opcoes().legendaVoz && chave()) {
      const faltam = blocos.map((_, k) => k).filter(k => !takes()[k].transcricao);
      for (const [n, k] of faltam.entries()) {
        aviso(`Fazendo a legenda pela sua voz… (${n + 1} de ${faltam.length})`);
        if (transcrevendo.has(k)) while (transcrevendo.has(k)) await espera(300);
        else await transcreverFundo(k);
      }
    }
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
