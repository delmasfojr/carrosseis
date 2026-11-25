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
  // modo "só voz": grava só o microfone; o vídeo é montado com mascote, contas, desenhos e emojis
  const TIPOS_AUDIO = ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];
  const tipoAudio = () => TIPOS_AUDIO.find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
  const soVoz = () => !!opcoes().soVoz;
  const CENA = {camera: '🎥 CÂMERA', quadro: '🧑‍🏫 QUADRO', tela: '📱 TELA'};
  const espera = ms => new Promise(r => setTimeout(r, ms));
  const seg = s => `${Number(s).toFixed(1).replace('.', ',')} s`;
  let item, salvar, salvarBruto, aoFim, blocos, i = 0, sel = 0, stream = null, facing = 'user', rec = null, gravando = false, revendo = false;
  let trava = null, t0 = 0, relogio = null, vibrou = false, ui = null, actx = null, tocando = null, ocupado = false;
  const g = id => ui.querySelector('#' + id);
  const takes = () => item.takes || (item.takes = []);
  const PADRAO = {seco: false, legenda: true, legendaVoz: true, mascote: true, voz: true, filtro: 'nenhum', zoomCorte: true, volMusica: 0.15, ruido: false, limpeza: 'normal', soVoz: false, ritmo: 'normal'};
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
#gsovoz{position:absolute;inset:0;background:#FFF6E6;color:#0F1B2D;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:150px 26px 230px;text-align:center}
#gsovoz img{height:34%;object-fit:contain}
#gsovoz b{font:30px 'Anton',Impact,sans-serif;font-weight:400}
#gsovoz small{font-size:13px;color:#445}
#gnivel{width:70%;height:14px;border-radius:7px;background:#D9DDE3;overflow:hidden}
#gnivel i{display:block;height:100%;width:0;background:#FF7A00;transition:width .08s}
#gmodo{font-size:12px;padding:6px 10px}
#gmodo.on{background:#FF7A00 !important}
#gfala{position:absolute;left:0;right:0;top:0;padding:calc(10px + env(safe-area-inset-top)) 16px 40px;background:linear-gradient(#000d 70%,#0000);font-weight:700;line-height:1.3;text-align:center}
#gfala small{display:block;color:#FF7A00;font-size:12px;letter-spacing:1px;margin-bottom:4px}
#gfala .gp{transition:color .1s}
#gfala .gp.lida{color:#fff9}
#gfala .gp.agora{color:#FF7A00;text-shadow:0 0 10px #FF7A0088}
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
#ehist{position:absolute;left:10px;top:calc(8px + env(safe-area-inset-top));display:flex;gap:8px}
#grav #ehist button{width:44px;height:44px;border-radius:50% !important;background:#ffffff2e;border:2px solid #ffffff55;color:#fff;font-size:22px;padding:0;line-height:1}
#grav #ehist button:disabled{opacity:.3}
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
.gbotoes{flex:none;display:flex;gap:8px;padding:10px 12px calc(10px + env(safe-area-inset-bottom));background:#0F1B2D}
.gbotoes button{flex:1;padding:13px 6px;background:#33415a;color:#fff}
#eexportar{background:#FF7A00 !important;flex:1.4}
.eseco{background:#FFF0DD;border:2px solid #FF7A00;border-radius:12px;padding:10px 12px;margin:0 0 10px !important;font-size:14px !important;align-items:flex-start !important}
.eseco input{margin-top:2px;flex:none}
.eaviso2{background:#E6F1FF;border-radius:10px;padding:8px 12px;font-size:13px;margin:6px 0}
.eaba.apagada{opacity:.4}
.eiab button{background:linear-gradient(90deg,#FF7A00,#ff9a3c) !important;color:#fff !important;border:0 !important;font-size:15px}
.eiab button small{display:block;font-weight:400;font-size:11px;opacity:.9}
.efemo button{flex:1 0 16% !important;font-size:24px !important;padding:6px 0 !important}
#edes,#efoto{position:absolute;inset:0;background:#FFF6E6;z-index:3;display:flex;flex-direction:column}
.efonota{margin:0;padding:8px 12px;font-size:12px;color:#0F1B2D;background:#E6F1FF}
#efgrade{flex:1;overflow-y:auto;display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:10px;align-content:start}
#efgrade button{background:#fff;border:2px solid #D9DDE3 !important;padding:4px;display:flex;flex-direction:column;align-items:center;font-size:10px;font-weight:600;color:#0F1B2D}
#efgrade img{width:100%;aspect-ratio:1;object-fit:cover;background:#eee}
#efgrade span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}
#efgrade small{font-weight:400;opacity:.7}
.edtopo{display:flex;gap:8px;padding:calc(10px + env(safe-area-inset-top)) 12px 10px;background:#0F1B2D}
.edtopo input{flex:1;font:inherit;font-size:16px;padding:10px 12px;border-radius:10px;border:0}
.edtopo button{background:#33415a;color:#fff;padding:0 16px}
#edgrade{flex:1;overflow-y:auto;display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:10px}
#edgrade button{background:#fff;border:2px solid #D9DDE3 !important;padding:6px 2px;display:flex;flex-direction:column;align-items:center;font-size:10px;font-weight:600;color:#0F1B2D}
#edgrade img{width:100%;aspect-ratio:1;object-fit:contain}
#edgrade span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}
#eclipes{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:8px 0}
#eclipes button{padding:0;border:3px solid transparent !important;border-radius:10px;overflow:hidden;background:#0F1B2D;position:relative;aspect-ratio:9/14}
#eclipes button.on{border-color:#FF7A00 !important}
#eclipes img{width:100%;height:100%;object-fit:cover;display:block}
#eclipes small{position:absolute;right:4px;bottom:4px;background:#000a;color:#fff;font-size:10px;padding:1px 5px;border-radius:6px}
#ecadeia button{font-size:13px}
.ebusca{display:flex;gap:6px}.ebusca input{flex:1;font:inherit;font-size:16px;padding:8px 10px;border-radius:10px;border:2px solid #D9DDE3}
#ecanvas{touch-action:none}
#eaviso{position:absolute;inset:0;background:#000c;display:flex;align-items:center;justify-content:center;text-align:center;font-weight:700;font-size:18px;padding:30px;color:#fff;z-index:2}`;
    document.head.appendChild(st);
    ui = document.createElement('div'); ui.id = 'grav'; ui.hidden = true;
    ui.innerHTML = `
      <div id="ggrava">
        <div class="gquadro"><video id="gprev" playsinline muted autoplay></video>
          <div id="gsovoz" hidden><img src="${BASE}mascote/explicando.webp" alt=""><b>🎙 SÓ A SUA VOZ</b>
            <small>Você não aparece: o vídeo é montado com o mascote, as contas, os desenhos e os emojis.</small><div id="gnivel"><i></i></div></div>
          <div id="gconta"></div></div>
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
          <div class="glinha" style="margin-top:6px;flex-wrap:wrap;gap:6px"><button id="gmodo"></button><button id="gruido" style="font-size:12px;padding:6px 10px"></button><button id="gritmo" style="font-size:12px;padding:6px 10px"></button></div>
          <div id="ginfo"></div>
        </div>
      </div>
      <div id="gedit" hidden>
        <div class="eprev"><canvas id="ecanvas" width="${W}" height="${H}"></canvas><button id="eplay">▶</button><div id="etempo"></div>
          <div id="ehist"><button id="edesf" title="Desfazer (Ctrl+Z)" aria-label="Desfazer">↶</button><button id="erefaz" title="Refazer (Ctrl+Y)" aria-label="Refazer">↷</button></div></div>
        <div id="etl"></div>
        <div class="eabas" id="eabas">${ABAS_ED.map(([id, ic, nome]) => `<button data-aba="${id}"><i>${ic}</i>${nome}</button>`).join('')}</div>
        <div id="epainel"></div>
        <div class="gbotoes"><button id="esair">✕ Sair</button><button id="egravar">🎥 Gravar</button><button id="eexportar">⬇ Exportar vídeo</button></div>
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
    g('gritmo').onclick = () => {  // devagar → normal → rápida → devagar
      const ord = Object.keys(RITMOS), at = Math.max(0, ord.indexOf(opcoes().ritmo));
      opcoes().ritmo = ord[(at + 1) % ord.length]; salvar(item).catch(() => {});
      atualizarGravar();
    };
    g('gmodo').onclick = async () => {
      opcoes().soVoz = !opcoes().soVoz; salvar(item).catch(() => {});
      pararCamera(); await ligarCamera().catch(erroCamera);
    };
    g('geditar').onclick = () => abrirEditor(Math.min(i, blocos.length - 1));
    g('gzoom').oninput = () => {
      const t = stream && stream.getVideoTracks()[0], z = Number(g('gzoom').value);
      if (t) t.applyConstraints({advanced: [{zoom: z}]}).catch(() => {});
      g('gzoomv').textContent = z.toFixed(1) + '×';
    };
    g('eplay').onclick = () => tocando ? pararPrevia() : previa();
    g('esair').onclick = fechar;
    g('edesf').onclick = () => voltarHist(-1);
    g('erefaz').onclick = () => voltarHist(1);
    document.addEventListener('keydown', ev => {  // no PC: Ctrl+Z desfaz, Ctrl+Y (ou Ctrl+Shift+Z) refaz
      if (ui.hidden || g('gedit').hidden || !(ev.ctrlKey || ev.metaKey)) return;
      if (/^(INPUT|TEXTAREA)$/.test((ev.target || {}).tagName || '') && (ev.target.type || '') !== 'range' && (ev.target.type || '') !== 'checkbox') return;
      const kk = ev.key.toLowerCase();
      if (kk === 'z' && !ev.shiftKey) { ev.preventDefault(); voltarHist(-1); }
      else if (kk === 'y' || (kk === 'z' && ev.shiftKey)) { ev.preventDefault(); voltarHist(1); }
    });
    g('egravar').onclick = () => irGravar(sel);
    g('eexportar').onclick = () => exportar().catch(e => { aviso(''); ocupado = false; alert('Não consegui exportar: ' + e.message); });
  }
  const contador = (t, peq) => { g('gconta').textContent = t; g('gconta').classList.toggle('peq', !!peq); };

  /* ---------------------------------------------------------------- modo GRAVAR */
  /* teleprompter colorido (karaokê): durante a gravação, a palavra da vez fica laranja e as já lidas ficam apagadas,
     no ritmo da meta do bloco. O tempo de cada palavra é proporcional às sílabas (vogais), com pausa na pontuação. */
  const palavrasFala = f => String(f).split(/\s+/).filter(Boolean);
  function ritmo(fala, meta) {
    const pal = palavrasFala(fala);
    const silabas = w => /\d/.test(w)  // número se fala por extenso: "10%" = dez por cento
      ? (w.match(/\d/g).length * 1.5 + (/%/.test(w) ? 2 : 0))
      : (w.normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[aeiouy]+/gi) || []).length;
    const peso = pal.map(w => Math.max(1, silabas(w)));
    const pausa = pal.map((w, k) => k === pal.length - 1 ? 0 : /[.!?…:]$/.test(w) ? 2 : /[,;—–)]$/.test(w) ? 1 : 0);
    const total = peso.reduce((x, y) => x + y, 0) + pausa.reduce((x, y) => x + y, 0);
    // velocidade de leitura escolhida no botão 🐢/🐇 (palavras por segundo); a meta do roteiro só deixa mais devagar
    const vel = (RITMOS[opcoes().ritmo] || RITMOS.normal).v;
    const dur = Math.max(meta, pal.length / vel);
    const ini = [];
    let acc = 0.4;  // respiro depois do 3‑2‑1
    for (let k = 0; k < pal.length; k++) { ini.push(acc); acc += (peso[k] + pausa[k]) / total * dur; }
    return ini;  // segundo (desde o começo da gravação) em que cada palavra começa
  }
  const RITMOS = {devagar: {v: 1.8, nome: '🐢 Leitura: devagar'}, normal: {v: 2.2, nome: '🚶 Leitura: normal'}, rapido: {v: 2.7, nome: '🐇 Leitura: rápida'}};
  function colorirFala(s) {
    const els = g('gfala').querySelectorAll('.gp');
    if (!els.length) return;
    const ini = ritmo(blocos[i].fala, alvo(blocos[i]));
    let atual = -1;
    if (s != null) for (let k = 0; k < ini.length; k++) if (ini[k] <= s) atual = k;
    const fim = s != null && s > ini[ini.length - 1] + 0.9;  // depois da última palavra, tudo "lido"
    els.forEach((el, k) => {
      el.classList.toggle('lida', s != null && (k < atual || fim));
      el.classList.toggle('agora', !fim && k === atual);
    });
  }

  function atualizarGravar() {
    const b = blocos[i], tk = takes()[i], a = alvo(b);
    const fonte = b.fala.length > 120 ? 19 : b.fala.length > 70 ? 22 : 25;
    g('gfala').style.fontSize = fonte + 'px';
    g('gfala').innerHTML = `<small>BLOCO ${i + 1} DE ${blocos.length} · ${b.gancho ? 'GANCHO' : esc(CENA[b.cena] || b.cena)} · ${a} s</small>${palavrasFala(b.fala).map(w => `<span class="gp">${esc(w)}</span>`).join(' ')}` +
      (b.cena !== 'camera' && b.quadro ? `<span class="gq">${b.cena === 'quadro' ? 'No quadro' : 'Na tela'}: ${esc(b.quadro)}</span>` : '');
    if (gravando && t0) colorirFala((Date.now() - t0) / 1000);
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
    g('gruido').textContent = opcoes().ruido ? '🎙 Filtro do celular: LIGADO' : '🎙 Filtro do celular: desligado';
    g('gruido').title = opcoes().ruido ? 'A limpeza do app (editor, aba Som) costuma ficar melhor com este filtro desligado' : 'Recomendado: grava cru e o app limpa a voz depois';
    g('gruido').disabled = gravando || abrindo;
    g('gritmo').textContent = (RITMOS[opcoes().ritmo] || RITMOS.normal).nome;
    g('gritmo').title = 'Velocidade em que as palavras do teleprompter vão ficando laranja';
    g('gritmo').disabled = gravando;
    g('gmodo').textContent = soVoz() ? '🎙 Só a voz (sem câmera)' : '🎥 Com câmera';
    g('gmodo').title = 'Tocar para trocar entre gravar com câmera e gravar só a voz';
    g('gmodo').classList.toggle('on', soVoz());
    g('gmodo').disabled = gravando || abrindo;
    g('gsovoz').hidden = !soVoz();
    g('gvirar').disabled ||= soVoz();
    if (abrindo) for (const id of ['gvirar', 'geditar']) g(id).disabled = true;
  }

  function pararCamera() { if (typeof pararMedidor === 'function') pararMedidor(); if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; }
  // uma troca de câmera por vez: se pedirem outra no meio, espera a anterior terminar
  let fila = Promise.resolve(), abrindo = false;
  function ligarCamera(forcar) {
    const p = fila.then(() => ligarCameraJa(forcar));
    fila = p.catch(() => {});
    return p;
  }
  // filtros de "chamada" do celular (cancelamento de eco, supressão de ruído, ganho automático) deixam a voz
  // abafada e robótica: ficam desligados. "Reduzir ruído" liga só a supressão, para lugar barulhento.
  const cfgAudio = () => ({echoCancellation: false, noiseSuppression: !!opcoes().ruido, autoGainControl: false,
    channelCount: {ideal: 1}, sampleRate: {ideal: 48000}, sampleSize: {ideal: 16}});
  // medidor de volume do microfone (no modo só voz não há imagem para saber se está captando)
  let medidor = null;
  function medirNivel() {
    pararMedidor();
    if (!stream || !stream.getAudioTracks().length) return;
    const a = ac(), an = a.createAnalyser(); an.fftSize = 512;
    const src = a.createMediaStreamSource(stream); src.connect(an);
    const d = new Float32Array(an.fftSize), m = {src, ativo: true};
    const passo = () => {
      if (!m.ativo) return;
      an.getFloatTimeDomainData(d);
      let s = 0; for (const x of d) s += x * x;
      g('gnivel').firstChild.style.width = Math.min(100, Math.sqrt(s / d.length) * 600) + '%';
      setTimeout(passo, 80);
    };
    medidor = m; passo();
  }
  function pararMedidor() { if (medidor) { medidor.ativo = false; medidor.src.disconnect(); medidor = null; } }
  async function ligarMicrofone() {
    if (!(stream && stream.active && !stream.getVideoTracks().length)) {
      pararCamera();
      abrindo = true; atualizarGravar();
      g('ginfo').textContent = 'Abrindo o microfone…';
      try { stream = await navigator.mediaDevices.getUserMedia({audio: cfgAudio()}); } finally { abrindo = false; }
    }
    g('gzoomw').hidden = true;
    const v = g('gprev'); v.srcObject = null;
    medirNivel();
    atualizarGravar();
  }
  async function pedirCamera(lado) {
    const audio = cfgAudio();
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
    if (soVoz()) return ligarMicrofone();
    pararMedidor();
    if (stream && !stream.getVideoTracks().length) pararCamera();  // saindo do modo só voz
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
    const voz = !stream.getVideoTracks().length;  // modo só voz
    const mt = voz ? tipoAudio() : tipo(), partes = [], a = alvo(blocos[i]);
    rec = new MediaRecorder(stream, {...(mt ? {mimeType: mt} : {}), ...(voz ? {} : {videoBitsPerSecond: 6e6}), audioBitsPerSecond: 192000});
    rec.ondataavailable = e => { if (e.data.size) partes.push(e.data); };
    rec.onstop = async () => {
      clearInterval(relogio);
      const blob = new Blob(partes, {type: (rec.mimeType || mt || (voz ? 'audio/webm' : 'video/webm')).split(';')[0]});
      const c = {blob, dur: (Date.now() - t0) / 1000, facing, ...(voz ? {soVoz: true} : {})};
      gravando = false;
      if (blob.size < 2000) {  // a câmera não entregou imagem: não guarda um take vazio
        atualizarGravar();
        return alert(voz ? 'Esse take não gravou (o microfone não mandou som). Saia e entre de novo, e grave este bloco outra vez.'
          : 'Esse take não gravou (a câmera não mandou imagem). Toque em 🔄 ou saia e entre de novo, e grave este bloco outra vez.');
      }
      g('ginfo').textContent = 'Guardando o take…';
      await analisar(c);
      takes()[i] = c;
      prepararVoz(c);  // já vai limpando enquanto grava o próximo
      try { await salvar(item); } catch (e) { alert('Não consegui guardar o take: ' + e.message); }
      transcreverFundo(i);  // legenda pela voz real, sem travar a gravação
      const proximo = blocos.findIndex((_, k) => k > i && !takes()[k]);
      if (proximo > 0) await irPara(proximo);
      else if (blocos.every((_, k) => takes()[k])) {  // gravou tudo: vai para a edição
        abrirEditor(i);
        // vídeo só com a voz e ainda sem montagem: a IA já monta as cenas sozinha
        if (blocos.every((_, k) => takes()[k].soVoz) && !item.montouIA && chave())
          montarComIA(true).catch(e2 => { aviso(''); ocupado = false; alert('A IA não conseguiu montar agora: ' + e2.message + '\nToque em ✨ Montar com IA para tentar de novo.'); });
      }
      else atualizarGravar();
    };
    rec.start(1000); t0 = Date.now(); gravando = true; vibrou = false;
    relogio = setInterval(() => {
      const s = (Date.now() - t0) / 1000;
      g('gtempo').textContent = `${seg(s)} / ${a} s`;
      g('gtempo').classList.toggle('passou', s > a);
      g('ganel').style.strokeDashoffset = 245 * (1 - Math.min(1, s / a));
      colorirFala(s);
      if (s >= a && !vibrou) { vibrou = true; if (navigator.vibrate) navigator.vibrate(60); }
    }, 50);
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
    item = it; salvarBruto = salvarFn; aoFim = aoTerminar; blocos = montarBlocos(it);
    salvar = x => { anotarHist(); return salvarBruto(x); };  // toda alteração guardada vira um passo do ↶ desfazer
    ui.hidden = false; document.documentElement.style.overflow = 'hidden';
    if (navigator.wakeLock) navigator.wakeLock.request('screen').then(t => { trava = t; }).catch(() => {});
    for (const c of takes()) if (c && c.ini == null) await analisar(c);  // takes da versão anterior
    zerarHist();
    const falta = blocos.findIndex((_, k) => !takes()[k]);
    if (falta < 0) return abrirEditor(0);  // já tem tudo gravado: abre a edição
    await irGravar(falta);
  }
  function fechar() {
    if (ocupado) return;
    parar(); if (revendo) voltarCamera(); pararPrevia(); pararCamera();
    g('gprev').srcObject = null;
    for (const v of quadros.values()) soltar(v);
    quadros.clear(); soltarClipes();
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
  // palavras do bloco com o instante de cada uma (pela voz, se tiver; senão pelo roteiro encaixado nas frases)
  const palavrasDe = k => {
    const c = takes()[k];
    if (opcoes().legendaVoz && c.transcricao && c.transcricao.length) return c.transcricao.filter(p => p.b > c.ini - 0.05 && p.a < c.fim);
    const pal = String(blocos[k].fala).split(/\s+/).filter(Boolean);
    return alinhar(pal, pal.map(w => w.length + 2), cortados(c));
  };
  const gruposDe = k => opcoes().legenda ? agrupar(palavrasDe(k)) : [];
  const normal = x => String(x).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9%]/g, '');
  // segundos (dentro do bloco, no vídeo final) em que a palavra é falada; null se não achar
  function quandoFala(k, palavra) {
    const c = takes()[k], alvo = normal(palavra);
    if (!alvo) return null;
    const p = palavrasDe(k).find(x => normal(x.w) === alvo) || palavrasDe(k).find(x => normal(x.w).includes(alvo) || (alvo.length > 3 && alvo.includes(normal(x.w)) && normal(x.w).length > 2));
    return p ? Math.max(0, (p.a - c.ini) / vel(c)) : null;
  }
  const palavraNoTempo = (k, local) => {  // a palavra falada nesse instante do bloco
    const c = takes()[k], t = c.ini + local * vel(c);
    const ps = palavrasDe(k).filter(x => x.a <= t + 0.05);
    return ps.length ? ps[ps.length - 1].w.replace(/[.,!?…:;]+$/, '') : '';
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
    await salvarBruto(item);
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
  function medirCaixa(ctx, txt, tam) {  // largura e altura da caixa do título (mesma conta de caixa())
    ctx.font = `${tam}px Anton, Impact, sans-serif`;
    const linhas = quebrar(ctx, String(txt).toUpperCase(), W - 220);
    return [Math.max(...linhas.map(l => ctx.measureText(l).width)) + 70, linhas.length * tam * 1.12 + 44];
  }

  /* ---------------------------------------------------------------- conta que vai sendo escrita no ritmo da fala */
  // A conta é quebrada em pedaços (números, símbolos, palavras). Cada pedaço aparece, pulando, no instante em que
  // a voz fala aquilo ("6 ÷ 3 = 2": o 6 entra no "seis", o ÷ no "dividido", ...). O lugar de cada pedaço é o da conta
  // inteira desde o começo, então nada pula de posição e as figuras já desviam do espaço todo.
  const SIMB = '×÷+\\-−=≈<>≤≥→?()√/:·';
  const RE_TOK = new RegExp(`(\\d+(?:[.,]\\d+)*[%²³]?|[${SIMB}]|[^\\s\\d${SIMB}]+)`, 'g'), RE_SIMB = new RegExp(`^[${SIMB}]$`);
  function tokensConta(txt) {
    const out = []; let m; RE_TOK.lastIndex = 0;
    while ((m = RE_TOK.exec(txt))) out.push({s: m[0], esp: m.index > 0 && /\s/.test(txt[m.index - 1]), op: RE_SIMB.test(m[0])});
    return out;
  }
  const EXTENSO = {0: 'zero', 1: 'um uma', 2: 'dois duas meio metade', 3: 'tres terco', 4: 'quatro quarto', 5: 'cinco quinto', 6: 'seis sexto',
    7: 'sete setimo', 8: 'oito oitavo', 9: 'nove nono', 10: 'dez decimo', 11: 'onze', 12: 'doze', 13: 'treze', 14: 'quatorze catorze', 15: 'quinze',
    16: 'dezesseis', 17: 'dezessete', 18: 'dezoito', 19: 'dezenove', 20: 'vinte', 30: 'trinta', 40: 'quarenta', 50: 'cinquenta', 60: 'sessenta',
    70: 'setenta', 80: 'oitenta', 90: 'noventa', 100: 'cem cento', 200: 'duzentos', 300: 'trezentos', 400: 'quatrocentos', 500: 'quinhentos',
    600: 'seiscentos', 700: 'setecentos', 800: 'oitocentos', 900: 'novecentos', 1000: 'mil'};
  const FALA_SIMB = {'×': 'vezes multiplicado multiplica x', '÷': 'dividido divide dividir por', '/': 'sobre dividido por', ':': 'dividido por',
    '+': 'mais soma', '-': 'menos tira', '−': 'menos tira', '=': 'igual e da sao vale fica resulta', '≈': 'aproximadamente quase cerca',
    '<': 'menor', '>': 'maior', '≤': 'menor', '≥': 'maior', '√': 'raiz', '→': 'entao logo quer'};
  function chavesToken(tk) {  // jeitos de falar este pedaço da conta
    const s = tk.s;
    if (/^\d/.test(s)) {
      const num = s.replace(/[%²³]$/, ''), n = parseFloat(num.replace(/\.(?=\d{3})/g, '').replace(',', '.'));
      const ks = [normal(num), normal(s)];
      const ext = EXTENSO[n] || (n > 20 && n < 100 ? EXTENSO[Math.floor(n / 10) * 10] : n > 100 && n < 1000 ? EXTENSO[Math.floor(n / 100) * 100] : n > 1000 && n < 1e6 ? EXTENSO[Math.floor(n / 1000)] : '');
      if (ext) ks.push(...ext.split(' '));
      return ks;
    }
    if (FALA_SIMB[s]) return FALA_SIMB[s].split(' ');
    return [normal(s)].filter(Boolean);
  }
  const cacheTempos = new Map();
  function temposConta(k, toks) {  // segundos (dentro do bloco) em que cada pedaço da conta aparece
    const c = takes()[k], pal = palavrasDe(k), dur = tamanho(k);
    const chave_ = [toks.map(t => t.s).join(' '), pal.map(p => p.w + p.a.toFixed(2)).join(' '), c.ini, vel(c)].join('|');
    const ant = cacheTempos.get(k);
    if (ant && ant.chave === chave_) return ant.ts;
    const loc = p => Math.max(0, (p.a - c.ini) / vel(c));
    const ts = toks.map(() => null);
    let j = 0;
    toks.forEach((tk, i) => {  // casa cada pedaço com a próxima palavra falada que combina (sempre para a frente)
      const ks = chavesToken(tk), jan = tk.op ? 4 : /^\d/.test(tk.s) ? 20 : 12;  // número: procura mais longe (ex.: "um quarto de 340")
      for (let m = j; m < Math.min(pal.length, j + jan); m++) {
        const w = normal(pal[m].w), w2 = w.replace(/%$/, '');
        if (w && ks.some(x => x === w || x === w2 || (x.length >= 4 && w.startsWith(x)))) { ts[i] = loc(pal[m]); j = m + 1; break; }
      }
    });
    const ok = ts.map((t, i) => t == null ? -1 : i).filter(i => i >= 0);
    const iniFala = pal.length ? loc(pal[0]) : 0.2, fimFala = pal.length ? loc(pal[pal.length - 1]) : dur * 0.7;
    if (!ok.length)  // a fala não cita a conta: ela vai sendo escrita ao longo da fala
      toks.forEach((_, i) => { ts[i] = iniFala + Math.max(0.3, (fimFala - iniFala) * 0.8) * i / Math.max(1, toks.length); });
    else for (let i = 0; i < toks.length; i++) if (ts[i] == null) {  // pedaço não falado: entre os vizinhos
      const a = ok.filter(x => x < i).pop(), b = ok.find(x => x > i);
      if (a != null && b != null) ts[i] = ts[a] + (ts[b] - ts[a]) * (i - a) / (b - a);
      else if (b != null) ts[i] = Math.max(0, ts[b] - 0.2 * (b - i));
      else ts[i] = ts[a] + 0.2 * (i - a);
    }
    for (let i = 0; i < ts.length; i++) ts[i] = Math.min(Math.max(ts[i], i ? ts[i - 1] : 0), Math.max(0, dur - 0.6));  // completa antes do fim
    cacheTempos.set(k, {chave: chave_, ts});
    return ts;
  }
  function arrumarConta(ctx, txt, larg, maxTam, minTam = 56) {  // quebra em linhas e acha o tamanho da letra
    const toks = tokensConta(String(txt));
    let tam = maxTam, linhas = [];
    const montar = () => {
      ctx.font = `${tam}px Anton, Impact, sans-serif`;
      const sp = ctx.measureText(' ').width;
      // não cabe numa linha? quebra de preferência antes do "→" ("6 ÷ 3 = 2" / "→ 3 × 2 = 6")
      const cabe = toks.reduce((a, tk, i) => a + ctx.measureText(tk.s).width + (i && tk.esp ? sp : 0), 0) <= larg;
      linhas = []; let lin = null;
      toks.forEach((tk, i) => {
        const w = ctx.measureText(tk.s).width, gap = lin && lin.itens.length && tk.esp ? sp : 0;
        if (!lin || (gap && lin.w + gap + w > larg) || (!cabe && tk.s === '→' && lin.itens.length)) { lin = {itens: [], w: 0}; linhas.push(lin); }
        const g2 = lin.itens.length && tk.esp ? sp : 0;
        lin.itens.push({i, x: lin.w + g2, w}); lin.w += g2 + w;
      });
    };
    montar();
    while ((linhas.length > 3 || Math.max(0, ...linhas.map(l => l.w)) > larg) && tam > minTam) { tam -= 8; montar(); }
    return {toks, tam, linhas, alto: linhas.length * tam * 1.15, larg: Math.max(0, ...linhas.map(l => l.w))};
  }
  let revelarTudo = false;  // prévia parada do editor: mostra a conta inteira para dar para conferir
  function contaViva(ctx, k, txt, yc, larg, maxTam, local, cor = NAVY, corSimb = LAR, minTam) {
    if (!txt) return null;
    const L = arrumarConta(ctx, txt, larg, maxTam, minTam);
    const ts = est(k).animConta && !revelarTudo ? temposConta(k, L.toks) : null;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    L.linhas.forEach((lin, n) => {
      const y = yc + (n - (L.linhas.length - 1) / 2) * L.tam * 1.15, x0 = W / 2 - lin.w / 2;
      for (const it of lin.itens) {
        const tk = L.toks[it.i];
        let esc = 1, alfa = 1, dy = 0;
        if (ts) {
          const q = (local - ts[it.i] + 0.06) / 0.35;
          if (q <= 0) continue;
          if (q < 1) { esc = Math.max(0.01, 1 - Math.cos(q * Math.PI * 2.5) * Math.exp(-q * 5)); alfa = Math.min(1, q * 2.5); dy = (1 - q) * (1 - q) * L.tam * 0.3; }
        }
        ctx.save(); ctx.globalAlpha = alfa; ctx.translate(x0 + it.x + it.w / 2, y + dy); ctx.scale(esc, esc);
        ctx.fillStyle = tk.op ? corSimb : cor; ctx.fillText(tk.s, 0, 0); ctx.restore();
      }
    });
    return L;
  }
  // onde fica a conta em cada layout com fundo creme: altura do centro (fração da tela), largura e letra máxima
  const CONTA_POS = {circulo: [0.36, W - 160, 120], dividida: [0.3, W - 140, 120], canto: [0.38, W - 140, 140], visual: [0.42, W - 140, 150], figura: [0.865, W - 140, 110]};
  function conta(ctx, k, lay, local) {
    const [y, larg, tam] = CONTA_POS[lay];
    return contaViva(ctx, k, blocos[k].quadro, H * y, larg, tam, local);
  }
  const LOUSA_Y = 0.36;
  const alturaLousa = (ctx, txt) => arrumarConta(ctx, txt, W - 220, 110, 54).alto + 90;
  function lousa(ctx, k, local) {  // quadro-negro com a conta escrita a giz
    const txt = blocos[k].quadro, yc = H * LOUSA_Y;
    if (!txt) return;
    const h = alturaLousa(ctx, txt);
    // com a conta animada, a lousa só entra (pulando) um instante antes do primeiro pedaço ser falado: nada de lousa vazia
    let esc = 1;
    if (est(k).animConta && !revelarTudo) {
      const t0 = temposConta(k, arrumarConta(ctx, txt, W - 220, 110, 54).toks)[0] - 0.4, q = (local - t0) / 0.4;
      if (q <= 0) return;
      if (q < 1) esc = Math.max(0.01, 1 - Math.cos(q * Math.PI * 2.5) * Math.exp(-q * 5));
    }
    ctx.save(); ctx.translate(W / 2, yc); ctx.scale(esc, esc); ctx.translate(-W / 2, -yc);
    ctx.save(); ctx.shadowColor = '#0007'; ctx.shadowBlur = 30;
    ctx.fillStyle = '#1E3A2F'; retangulo(ctx, 60, yc - h / 2, W - 120, h, 28); ctx.fill(); ctx.restore();
    ctx.lineWidth = 14; ctx.strokeStyle = '#8B5A2B'; retangulo(ctx, 60, yc - h / 2, W - 120, h, 28); ctx.stroke();
    contaViva(ctx, k, txt, yc, W - 220, 110, local, '#F4F1E8', '#FFB45C', 54);
    ctx.restore();
  }
  // o mascote balança enquanto a voz fala (pela legenda) e respira quando está em silêncio
  // Animação do mascote (feita com as poses, sem arquivo de animação):
  //   entrada (pulo / desliza / gira) no começo do bloco; quica, inclina e estica enquanto a voz fala; respira nas pausas.
  function boneco(ctx, pose, lado, base, h, falando, t, entrada = 'pulo') {
    const im = poses.get(pose) || poses.get('explicando');
    if (!im || !im.naturalWidth) return;
    const w = im.naturalWidth * h / im.naturalHeight;
    const x = lado === 'dir' ? W - w - 20 : 20;
    const q = Math.min(1, t / 0.5), sai = 1 - q;  // 0 → 1 nos primeiros 0,5 s
    const mola = q >= 1 ? 1 : 1 - Math.cos(q * Math.PI * 2.5) * Math.exp(-q * 5);  // passa um pouco e volta (efeito mola)
    let dx = 0, dy = 0, rot = 0, esc = 1;
    if (entrada === 'pulo') { esc = Math.max(0.01, mola); dy = sai * sai * h * 0.25; }
    else if (entrada === 'desliza') dx = (lado === 'dir' ? 1 : -1) * (1 - mola) * (w + 40);
    else if (entrada === 'gira') { esc = Math.max(0.01, mola); rot = sai * sai * Math.PI * 2 * (lado === 'dir' ? -1 : 1); }
    const quique = falando ? Math.abs(Math.sin(t * 9)) * h * 0.022 : Math.sin(t * 2) * h * 0.006;
    const inclina = falando ? Math.sin(t * 4.5) * 0.035 : Math.sin(t * 1.3) * 0.01;
    const estica = falando ? 1 + Math.abs(Math.sin(t * 9)) * 0.025 : 1 + Math.sin(t * 2) * 0.008;
    ctx.save();
    ctx.translate(x + w / 2 + dx, base + dy); ctx.rotate(inclina + rot); ctx.scale(esc / Math.sqrt(estica), esc * estica);
    ctx.drawImage(im, -w / 2, -h - quique, w, h);
    ctx.restore();
  }
  // troca de pose a cada frase (dá a sensação de gesto): começa na pose escolhida
  function poseAgora(k, t) {
    const e = est(k);
    if (!e.trocaPose) return e.pose;
    const roda = [e.pose, ...['explicando', 'ideia', 'resolvendo', 'joinha'].filter(x => x !== e.pose)].slice(0, 3);
    const n = cortados(takes()[k]).filter(sg => sg[0] <= t + 0.05).length;
    return roda[Math.max(0, n - 1) % roda.length];
  }
  const ALTURA_MASCOTE = 680;
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
    mascote_fundo: 'Mascote comigo de fundo', alternar: 'Alternar eu ↔ mascote', visual: 'Visual: conta + mascote',
    escala: '🔭 Zoom de escala', clipe: '🎞️ Vídeo de apoio', figura: '📐 Figura animada', questao: '📄 Questão da prova'};
  // take gravado só com a voz não tem imagem: só valem os layouts sem câmera
  const SEM_CAMERA = ['visual', 'mascote', 'escala', 'clipe', 'figura', 'questao'];
  const semImagem = k => !!(takes()[k] && takes()[k].soVoz);
  const POSES = {explicando: 'Explicando', ideia: 'Ideia', resolvendo: 'Resolvendo', pensando: 'Pensando',
    desafiando: 'Desafiando', confiante: 'Confiante', estudando: 'Estudando', joinha: 'Joinha'};
  const COM_TEXTO = ['circulo', 'dividida', 'canto', 'mascote', 'mascote_fundo', 'alternar', 'visual', 'figura'];
  const COM_MASCOTE = ['mascote', 'mascote_fundo', 'alternar', 'visual'];
  const TRANSICOES = {nenhuma: 'Corte seco', zoom: 'Zoom', esmaecer: 'Esmaecer', deslizar: 'Deslizar', subir: 'Subir', flash: 'Flash', desfoque: 'Desfoque'};
  const CORES_TITULO = {laranja: [LAR, '#fff'], navy: [NAVY, '#fff'], branco: ['#fff', NAVY], amarelo: ['#FFD21F', NAVY], sem: [null, '#fff']};
  const TAM_TITULO = {P: 62, M: 80, G: 104};
  const POS_TITULO = {topo: 0.09, alto: 0.17, centro: 0.42, baixo: 0.8};
  function est(k) {  // estilo do bloco k, com os padrões
    const todos = item.estilo || (item.estilo = []);
    const e = todos[k] || (todos[k] = {});
    const b = blocos[k], c = takes()[k], op = opcoes();
    if (c && c.soVoz && !SEM_CAMERA.includes(e.layout)) e.layout = k % 3 === 2 ? 'mascote' : 'visual';
    if (!e.layout) e.layout = b.cena === 'tela' ? 'circulo' : c && c.enquadre === 'inteiro' ? 'inteira' : c && c.enquadre === 'preencher' ? 'cheia' : 'auto';
    if (!e.transicao) e.transicao = k === 0 || op.zoomCorte === false ? 'nenhuma' : 'zoom';
    if (!e.corTitulo) e.corTitulo = b.gancho ? 'laranja' : 'navy';
    if (!e.tamTitulo) e.tamTitulo = b.gancho ? 'G' : 'M';
    if (!e.posTitulo) e.posTitulo = 'alto';
    if (e.animTitulo == null) e.animTitulo = true;
    if (e.animConta == null) e.animConta = true;
    if (!e.pose) e.pose = 'explicando';
    if (e.tamMascote == null) e.tamMascote = 1;
    if (!e.ladoMascote) e.ladoMascote = 'esq';
    if (!e.entradaMascote) e.entradaMascote = 'pulo';
    if (e.trocaPose == null) e.trocaPose = true;
    if (e.mascoteCanto == null) e.mascoteCanto = false;
    if (!e.figs) e.figs = [];
    if (e.layout === 'escala' && !e.escala) e.escala = {cadeia: cadeiaPadrao(), sentido: 'sai'};
    return e;
  }
  // imagem da questão (recortada do PDF) usada no layout "questao"
  const imgQuestao = e => { const ims = item.imagens || {}, id = e.questaoImg && ims[e.questaoImg] ? e.questaoImg : ims.questao ? 'questao' : Object.keys(ims)[0];
    return id ? imgFig({tipo: 'imagem', valor: id}) : null; };
  const layoutDe = (k, v) => { const l = est(k).layout; return l !== 'auto' ? l : v && v.videoWidth / v.videoHeight > 0.8 ? 'inteira' : 'cheia'; };

  /* ---------------------------------------------------------------- cada coisa no seu lugar (nada em cima de nada) */
  // Espaços ocupados no bloco (título, conta, lousa, câmera no círculo, mascote, legenda). Valem para o bloco todo,
  // com a conta já completa, para as figuras não ficarem pulando de lugar enquanto ela é escrita.
  // No "alternar" conta o pior caso (a lousa e o mascote do lado do mascote).
  const laySeguro = k => { const l = est(k).layout; return l === 'alternar' ? 'mascote_fundo' : l === 'auto' ? 'cheia' : l; };
  function caixaMascote(k, lay) {  // [x, topo, largura, altura] do mascote nesse bloco, ou null
    const e = est(k);
    let h = 0, base = 0;
    if (lay === 'visual') { h = 560 * e.tamMascote; base = H * 0.98; }
    else if (lay === 'mascote' || lay === 'mascote_fundo') { h = ALTURA_MASCOTE * e.tamMascote; base = H * 0.97; }
    else if (lay === 'escala' || lay === 'clipe' || lay === 'questao' || (lay === 'figura' && !e.mascoteCanto && k !== blocos.length - 1)) return null;
    else if (e.mascoteCanto) { h = 430 * e.tamMascote; base = H * 0.95; }
    else if (k === blocos.length - 1 && opcoes().mascote) { h = 400 * e.tamMascote; base = H * 0.95; }
    else return null;
    const nomes = e.trocaPose ? [e.pose, 'explicando', 'ideia', 'resolvendo', 'joinha'] : [e.pose, 'joinha'];
    const w = Math.max(h * 0.75, ...nomes.map(n => poses.get(n)).filter(im => im && im.naturalWidth).map(im => im.naturalWidth * h / im.naturalHeight));
    return [e.ladoMascote === 'dir' ? W - w - 20 : 20, base - h * 1.03, w, h * 1.03];
  }
  function yLegenda(k, lay) {  // a legenda sobe para não passar na frente da cabeça do mascote
    const m = caixaMascote(k, lay), y = H * (lay === 'circulo' ? 0.71 : lay === 'figura' ? 0.77 : lay === 'questao' ? 0.93 : 0.68);  // no círculo, um pouco abaixo da câmera; na figura, abaixo dela
    return m && m[1] < y + 70 ? Math.max(H * 0.5, m[1] - 75) : y;
  }
  function zonasDoBloco(ctx, k, lay) {
    const e = est(k), b = blocos[k], z = [[0, 0, W, 120]];  // faixa do @ e da barra de progresso
    const add = (x, y, w, h, m = 24) => z.push([x - m, y - m, w + 2 * m, h + 2 * m]);
    if (b.texto_tela) {
      const [lg, h] = medirCaixa(ctx, b.texto_tela, TAM_TITULO[e.tamTitulo] || 80), y = H * (POS_TITULO[e.posTitulo] || 0.17);
      add((W - lg * 1.06) / 2, y - h * 0.53, lg * 1.06, h * 1.06);
    }
    if (b.quadro && CONTA_POS[lay]) {
      const [y, larg, tam] = CONTA_POS[lay], L = arrumarConta(ctx, b.quadro, larg, tam);
      add(W / 2 - L.larg / 2, H * y - L.alto / 2, L.larg, L.alto);
    }
    if (b.quadro && (lay === 'mascote' || lay === 'mascote_fundo')) { const h = alturaLousa(ctx, b.quadro); add(60, H * LOUSA_Y - h / 2, W - 120, h, 10); }
    if (lay === 'circulo') add(W / 2 - 200, H * 0.53 + 30 - 200, 400, 400, 16);
    if (lay === 'figura') add(...AREA_FIG, 10);
    if (lay === 'canto') add(W - 340, H * 0.56 - 150, 300, 300, 16);
    if (lay === 'dividida') add(0, H * 0.48, W, H * 0.52, 0);
    const m = caixaMascote(k, lay);
    if (m) add(m[0], m[1], m[2], m[3], 10);
    if (opcoes().legenda) { const y = yLegenda(k, lay); add(50, y - 62, W - 100, 124, 8); }
    return z;
  }
  // Figuras: ficam onde foram pedidas se ali estiver livre; senão vão para o lugar livre mais perto
  // (e diminuem um pouco se precisar). Figura que você arrastou na prévia (fixa) fica onde você pôs.
  const cacheFigs = new Map();
  let posFigs = new Map();  // id → {cx, cy, s}: onde cada figura foi desenhada (para tocar nela no editor)
  function posicionarFigs(ctx, k, lay) {
    const e = {...est(k)}, b = blocos[k], op = opcoes();
    e.figs = e.figs.filter(f => !f.cheia);  // imagem em tela cheia não disputa lugar com as figuras
    const medidas = e.figs.map(f => caixaFig(f));
    const assin = JSON.stringify([lay, b.quadro, b.texto_tela, e.tamTitulo, e.posTitulo, e.tamMascote, e.ladoMascote, e.mascoteCanto, e.pose,
      op.legenda, op.mascote, poses.size, e.figs.map((f, n) => [f.id, f.x, f.y, f.ini, f.fim, f.fixa, medidas[n]])]);
    const ant = cacheFigs.get(k);
    if (ant && ant.assin === assin) return ant.pos;
    const zonas = zonasDoBloco(ctx, k, lay), pos = new Map(), postas = [];
    const bate = (r, lista) => lista.some(z => r[0] < z[0] + z[2] && z[0] < r[0] + r[2] && r[1] < z[1] + z[3] && z[1] < r[1] + r[3]);
    const ordem = e.figs.map((f, n) => [f, medidas[n]]).sort(([a], [b2]) => (b2.fixa ? 1 : 0) - (a.fixa ? 1 : 0) || a.ini - b2.ini);
    for (const [f, [w0, h0]] of ordem) {
      const ret = (cx, cy, s) => [cx - w0 * s / 2 - 12, cy - h0 * s / 2 - 12, w0 * s + 24, h0 * s + 24];
      const juntas = postas.filter(o => o.f.ini < f.fim && f.ini < o.f.fim).map(o => o.r);  // aparecem ao mesmo tempo
      const qx = f.x * W, qy = f.y * H;
      let lugar = null;
      if (f.fixa) lugar = {cx: qx, cy: qy, s: 1};
      else {
        const obst = [...zonas, ...juntas];
        for (const s of [1, 0.85, 0.72, 0.6, 0.5]) {
          let melhor = null, dist = Infinity;
          const testa = (cx, cy) => {
            const r = ret(cx, cy, s);
            if (r[0] < 0 || r[1] < 0 || r[0] + r[2] > W || r[1] + r[3] > H || bate(r, obst)) return;
            const d = Math.hypot(cx - qx, (cy - qy) * 1.2);
            if (d < dist) { dist = d; melhor = {cx, cy, s}; }
          };
          testa(qx, qy);
          if (!melhor) for (let cy = H * 0.07; cy <= H * 0.95; cy += H * 0.02) for (let cx = W * 0.1; cx <= W * 0.9; cx += W * 0.04) testa(cx, cy);
          if (melhor) { lugar = melhor; break; }
        }
        if (!lugar) lugar = {cx: qx, cy: qy, s: 0.5};  // não há lugar livre: fica menor onde foi pedida
      }
      pos.set(f.id, lugar); postas.push({f, r: ret(lugar.cx, lugar.cy, lugar.s)});
    }
    cacheFigs.set(k, {assin, pos});
    return pos;
  }
  function desenhar(ctx, v, k, grupos, t, decorrido, total) {
    if (opcoes().seco && !semImagem(k)) {  // vídeo seco: só a câmera, sem título, legenda, mascote, filtro nem efeito
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      if (v.videoWidth / v.videoHeight > 0.8) caber(ctx, v); else cobrir(ctx, v, 0, 0, W, H);
      return;
    }
    const c = takes()[k], b = blocos[k], op = opcoes(), e = est(k);
    let lay = layoutDe(k, v);
    const local = Math.max(0, (t - c.ini) / vel(c));  // segundos desde o começo deste bloco no vídeo final
    if (lay === 'alternar') {  // a cada frase (trecho de voz) troca: eu, mascote, eu, mascote...
      const n = cortados(c).filter(sg => sg[0] <= t + 0.05).length;
      lay = n % 2 === 1 || n === 0 ? (v.videoWidth / v.videoHeight > 0.8 ? 'inteira' : 'cheia') : 'mascote_fundo';
    }
    const creme = lay === 'circulo' || lay === 'dividida' || lay === 'canto' || lay === 'mascote' || lay === 'visual' || lay === 'figura' || lay === 'questao' ||
      (lay === 'escala' && fundoEscala(e, local, tamanho(k)) < 0.5);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    const filtro = FILTROS[op.filtro] || 'none';
    // transição "zoom": 8% de zoom que volta ao normal em 0,35 s (as outras transições são feitas em tocar())
    const z = e.transicao === 'zoom' && k > 0 && local < 0.35 ? 1 + 0.08 * Math.pow(1 - local / 0.35, 2) : 1;
    ctx.save();
    if (z !== 1) { ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-W / 2, -H / 2); }
    if (creme) { ctx.fillStyle = CREME; ctx.fillRect(0, 0, W, H); }
    ctx.filter = filtro;
    if (lay === 'circulo') {  // conta grande e o professor num círculo
      ctx.filter = 'none'; conta(ctx, k, lay, local); ctx.filter = filtro;
      circulo(ctx, v, W / 2, H * 0.53 + 30, 200);
    } else if (lay === 'dividida') {  // conta em cima, câmera embaixo
      ctx.filter = 'none'; conta(ctx, k, lay, local); ctx.filter = filtro;
      ctx.save(); ctx.beginPath(); ctx.rect(0, H * 0.48, W, H * 0.52); ctx.clip(); cobrir(ctx, v, 0, H * 0.48, W, H * 0.52); ctx.restore();
      ctx.save(); ctx.filter = 'none'; ctx.fillStyle = LAR; ctx.fillRect(0, H * 0.48 - 6, W, 12); ctx.restore();
    } else if (lay === 'canto') {  // conta ocupando a tela e o rosto pequeno no canto
      ctx.filter = 'none'; conta(ctx, k, lay, local); ctx.filter = filtro;
      circulo(ctx, v, W - 190, H * 0.56, 150);
    } else if (lay === 'visual') {  // sem câmera: folha de caderno, conta grande no meio e o mascote embaixo apresentando
      ctx.filter = 'none';
      ctx.strokeStyle = '#0F1B2D14'; ctx.lineWidth = 3;
      for (let x = 60; x < W; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 60; y < H; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      conta(ctx, k, lay, local);
      boneco(ctx, poseAgora(k, t), e.ladoMascote, H * 0.98, 560 * e.tamMascote, falandoEm(grupos, t), local, e.entradaMascote);
    } else if (lay === 'figura') {  // sem câmera: folha de caderno, figura desenhada no ritmo da fala e a conta embaixo
      ctx.filter = 'none';
      ctx.strokeStyle = '#0F1B2D14'; ctx.lineWidth = 3;
      for (let x = 60; x < W; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 60; y < H; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      desenharFigura(ctx, k, local);
      conta(ctx, k, lay, local);
    } else if (lay === 'questao') {  // a questão como está na prova, num cartão entre a faixa do título e a da legenda
      ctx.filter = 'none';
      const im = imgQuestao(e);
      if (im && im.naturalWidth) {
        const [bx, by, bw, bh] = [36, H * 0.135, W - 72, H * 0.73], s0 = Math.min(bw / im.naturalWidth, bh / im.naturalHeight);
        const z = 1 + 0.035 * Math.min(1, local / Math.max(2, tamanho(k)));  // zoom bem lento: dá vida sem atrapalhar a leitura
        const w = im.naturalWidth * s0 * z, h = im.naturalHeight * s0 * z, x = W / 2 - w / 2, y = by + bh / 2 - h / 2;
        ctx.save(); ctx.shadowColor = '#0F1B2D55'; ctx.shadowBlur = 30; ctx.fillStyle = '#fff'; ctx.fillRect(x - 10, y - 10, w + 20, h + 20); ctx.restore();
        ctx.drawImage(im, x, y, w, h);
      } else {
        ctx.fillStyle = NAVY; ctx.font = '56px Anton, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('SEM A IMAGEM DA QUESTÃO', W / 2, H / 2);
      }
    } else if (lay === 'escala') {  // zoom contínuo por uma sequência de desenhos (casa → cidade → … → galáxia)
      ctx.filter = 'none'; desenharEscala(ctx, e, local, tamanho(k));
    } else if (lay === 'clipe') {  // vídeo de apoio (banco grátis) cobrindo a tela; a voz é a sua
      const vc = videoClipe(e);
      if (vc && vc.readyState >= 2) {
        cobrir(ctx, vc, 0, 0, W, H);
        ctx.filter = 'none';
        const gr = ctx.createLinearGradient(0, H * 0.45, 0, H); gr.addColorStop(0, '#0000'); gr.addColorStop(1, '#000b');
        ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
      } else {
        ctx.filter = 'none'; ctx.fillStyle = NAVY; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#fff'; ctx.font = '60px Anton, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(e.clipe ? 'CARREGANDO O VÍDEO…' : 'ESCOLHA O VÍDEO DE APOIO', W / 2, H / 2);
      }
    } else if (lay === 'mascote') {  // só o mascote apresentando, com a lousa; a voz é a sua
      ctx.filter = 'none'; lousa(ctx, k, local);
      boneco(ctx, poseAgora(k, t), e.ladoMascote, H * 0.97, ALTURA_MASCOTE * e.tamMascote, falandoEm(grupos, t), local, e.entradaMascote);
    } else if (lay === 'mascote_fundo') {  // você ao fundo (escurecido) e o mascote na frente apresentando
      ctx.save(); ctx.filter = `${filtro === 'none' ? '' : filtro} blur(3px) brightness(.5)`; cobrir(ctx, v, -20, -20, W + 40, H + 40); ctx.restore();
      ctx.filter = 'none'; lousa(ctx, k, local);
      // no "alternar", a entrada acontece a cada vez que o mascote volta (conta o tempo desde o começo da frase)
      const desde = est(k).layout === 'alternar' ? Math.max(0, (t - (cortados(c).filter(sg => sg[0] <= t + 0.05).pop() || [c.ini])[0]) / vel(c)) : local;
      boneco(ctx, poseAgora(k, t), e.ladoMascote, H * 0.97, ALTURA_MASCOTE * e.tamMascote, falandoEm(grupos, t), desde, e.entradaMascote);
    } else if (lay === 'inteira') {  // vídeo inteiro, com o fundo borrado
      ctx.save(); ctx.filter = 'blur(36px) brightness(.55)'; cobrir(ctx, v, -60, -60, W + 120, H + 120); ctx.restore();
      ctx.filter = filtro; caber(ctx, v);
    } else cobrir(ctx, v, 0, 0, W, H);
    ctx.restore(); ctx.filter = 'none';
    const sobreImagem = desenharFigsCheias(ctx, k, local);  // imagens em tela cheia: cobrem o fundo, mas não o @, o título e a legenda
    ctx.fillStyle = '#ffffff40'; ctx.fillRect(0, 0, W, 14);
    ctx.fillStyle = LAR; ctx.fillRect(0, 0, W * Math.min(1, decorrido / total), 14);
    ctx.font = '42px Anton, Impact, sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    const a = '@DELMAO', bb = 'SIMPLIFICA', la = ctx.measureText(a).width, lb = ctx.measureText(bb).width;
    const fundoClaro = creme && !sobreImagem;
    ctx.save(); ctx.shadowColor = fundoClaro ? 'transparent' : '#000a'; ctx.shadowBlur = 10;
    ctx.fillStyle = fundoClaro ? NAVY : '#fff'; ctx.fillText(a, (W - la - lb) / 2, 80);
    ctx.fillStyle = LAR; ctx.fillText(bb, (W - la - lb) / 2 + la, 80); ctx.restore();
    if (b.texto_tela) {
      const [fundo, corT] = CORES_TITULO[e.corTitulo] || CORES_TITULO.navy, y = H * (POS_TITULO[e.posTitulo] || 0.17);
      const q = e.animTitulo ? Math.min(1, local / 0.22) : 1;  // entra "pulando" no começo do bloco
      const sc = 0.7 + 0.3 * (1 - Math.pow(1 - q, 3)) + (q < 1 ? 0.06 * Math.sin(q * Math.PI) : 0);
      ctx.save(); ctx.translate(W / 2, y); ctx.scale(sc, sc); ctx.translate(-W / 2, -y); ctx.globalAlpha = Math.min(1, q * 1.6);
      caixa(ctx, b.texto_tela, y, fundo, TAM_TITULO[e.tamTitulo] || 80, corT);
      ctx.restore();
    }
    desenharFigs(ctx, k, local, laySeguro(k));
    const temMascote = COM_MASCOTE.includes(lay) || (e.layout === 'alternar' && lay === 'mascote_fundo');
    if (!temMascote && e.mascoteCanto)  // mascote pequeno no canto, em qualquer layout
      boneco(ctx, poseAgora(k, t), e.ladoMascote, H * 0.95, 430 * e.tamMascote, falandoEm(grupos, t), local, e.entradaMascote);
    else if (!temMascote && k === blocos.length - 1 && opcoes().mascote)  // joinha no final do vídeo
      boneco(ctx, 'joinha', e.ladoMascote, H * 0.95, 400 * e.tamMascote, falandoEm(grupos, t), local, 'pulo');
    legenda(ctx, grupos, t, yLegenda(k, laySeguro(k)));
  }

  /* ---------------------------------------------------------------- 🔭 zoom de escala */
  // do menor para o maior; usa o desenho do banco quando existe, senão o emoji
  const CADEIA_PADRAO = [['casa', '🏠', 'CASA'], ['mapa-cidade', '🏙️', 'CIDADE'], ['mapa-brasil', '🗺️', 'BRASIL'],
    ['planeta-terra', '🌎', 'TERRA'], ['sistema-solar', '🪐', 'SISTEMA SOLAR'], ['galaxia', '🌌', 'GALÁXIA']];
  const temDesenho = n => typeof DESCRICOES !== 'undefined' && !!(DESCRICOES || {})[n];
  const cadeiaPadrao = () => CADEIA_PADRAO.map(([d, em, r]) => temDesenho(d) ? {tipo: 'desenho', valor: d, rotulo: r} : {tipo: 'emoji', valor: em, rotulo: r});
  const suaveE = x => x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
  const progressoEscala = (local, dur) => Math.min(1, Math.max(0, local / Math.max(0.6, dur - 0.4)));
  function fundoEscala(e, local, dur) {  // 0 = creme (perto), 1 = espaço (longe)
    const p = progressoEscala(local, dur);
    return e.escala && e.escala.sentido === 'entra' ? 1 - p : p;
  }
  const mistura = (a, b, t) => {
    const h = x => [1, 3, 5].map(i => parseInt(x.slice(i, i + 2), 16));
    const [ra, ga, ba] = h(a), [rb, gb, bb] = h(b);
    return `rgb(${Math.round(ra + (rb - ra) * t)},${Math.round(ga + (gb - ga) * t)},${Math.round(ba + (bb - ba) * t)})`;
  };
  const ESTRELAS = Array.from({length: 90}, (_, n) => [(Math.sin(n * 12.9898) * 43758.5453 % 1 + 1) % 1, (Math.sin(n * 78.233) * 12345.678 % 1 + 1) % 1, 2 + (n % 4) * 1.6]);
  function pecaEscala(ctx, x, cx, cy, tam, alfa) {
    if (!x || alfa <= 0.01 || tam < 4) return;
    ctx.save(); ctx.globalAlpha = Math.min(1, alfa);
    if (x.tipo === 'emoji') {
      ctx.font = `${tam * 0.85}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(x.valor, cx, cy + tam * 0.04);
    } else {
      const im = imgFig({tipo: 'desenho', valor: x.valor});
      if (im && im.naturalWidth) {
        const s = tam / Math.max(im.naturalWidth, im.naturalHeight);
        ctx.drawImage(im, cx - im.naturalWidth * s / 2, cy - im.naturalHeight * s / 2, im.naturalWidth * s, im.naturalHeight * s);
      }
    }
    ctx.restore();
  }
  function desenharEscala(ctx, e, local, dur) {
    const sai = e.escala.sentido !== 'entra';
    const cad = sai ? e.escala.cadeia : [...e.escala.cadeia].reverse();
    const fp = fundoEscala(e, local, dur);
    ctx.fillStyle = mistura(CREME, '#070D18', fp); ctx.fillRect(0, 0, W, H);
    if (fp > 0.35) {  // estrelas aparecem quando "sai" para o espaço
      ctx.fillStyle = `rgba(255,255,255,${Math.min(1, (fp - 0.35) / 0.4) * 0.9})`;
      for (const [x, y, r] of ESTRELAS) { ctx.beginPath(); ctx.arc(x * W, y * H, r, 0, 7); ctx.fill(); }
    }
    const n = cad.length; if (!n) return;
    const s = progressoEscala(local, dur) * (n - 1), i = Math.min(n - 1, Math.floor(s)), f = s - i;
    const q = suaveE(Math.min(1, Math.max(0, (f - 0.3) / 0.7)));  // segura cada nível um pouco antes de trocar
    const T = 600, cy = H * 0.4, deriva = sai ? 1 - 0.07 * f : 1 + 0.07 * f;
    const atual = sai ? 1 - 0.86 * q : 1 + 2.2 * q, prox = sai ? 1 + 2.2 * (1 - q) : 0.14 + 0.86 * q;
    pecaEscala(ctx, cad[i], W / 2, cy, T * atual * deriva, 1 - q);
    if (i + 1 < n) pecaEscala(ctx, cad[i + 1], W / 2, cy, T * prox * deriva, q);
    const rot = (q < 0.5 ? cad[i] : cad[Math.min(n - 1, i + 1)]).rotulo;  // nome do nível, embaixo
    if (rot) {
      const a = i + 1 < n ? Math.abs(q - 0.5) * 2 : 1;
      ctx.save(); ctx.globalAlpha = a; ctx.font = '78px Anton, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 10; ctx.lineJoin = 'round'; ctx.strokeStyle = fp < 0.5 ? '#fff' : NAVY; ctx.fillStyle = fp < 0.5 ? NAVY : '#fff';
      ctx.strokeText(rot, W / 2, cy + T * 0.6); ctx.fillText(rot, W / 2, cy + T * 0.6); ctx.restore();
    }
  }

  /* ---------------------------------------------------------------- 📐 figura animada (geometria desenhada no ritmo da fala) */
  // item.figura = {vb: [x0, y0, x1, y1], camadas: [{bloco, gatilho, sai, vista, itens: [...]}]} vale para o vídeo todo.
  // Coordenadas da figura com o y para CIMA (como no caderno). Cada camada entra quando a voz fala o "gatilho" no bloco
  // dela (bloco 1 = gancho); as camadas de blocos anteriores já estão na tela. "sai" = palavra em que a camada some
  // (no bloco "saiBloco", se for outro).
  // "vista" = novo enquadramento [x0, y0, x1, y1]: a câmera desliza/afasta até ele (ex.: para mostrar a mesa desdobrada).
  // "apaga" = gatilhos de camadas anteriores que somem quando esta entra.
  // Itens: ret {x, y, w, h}, poligono {pts}, linha {pts, tracejado, seta}, bola {x, y, r}, texto {x, y, t, tam},
  // cota {de, ate, t, lado}; todos com cor/fundo/larg opcionais e "pisca" (brilha ao entrar). Linhas são traçadas aos poucos.
  const AREA_FIG = [30, H * 0.205, W - 60, H * 0.51];
  const CORES_FIG = {navy: NAVY, laranja: LAR, creme: CREME, branco: '#fff', amarelo: '#FFC928', verde: '#1E9E5A', mesa: '#2E8B57',
    madeira: '#7A4A22', azul: '#2F6FDB', vermelho: '#E0412F', cinza: '#9AA3AE', roxo: '#7B4FD6',
    // claras = transparentes, para cópias, reflexos, regiões e destaques sem esconder o que está embaixo
    mesa_clara: '#2E8B5766', azul_claro: '#2F6FDB33', laranja_claro: '#FF7A0055', verde_claro: '#1E9E5A40', amarelo_claro: '#FFC92866',
    vermelho_claro: '#E0412F40', cinza_claro: '#9AA3AE40', roxo_claro: '#7B4FD640'};
  const CLARAS = ['#fff', '#FFC928', CREME, '#FFFFFF'];  // texto nessas cores ganha contorno escuro (senão some no contorno branco)
  const corFig = (c, padrao) => c ? CORES_FIG[c] || c : padrao;
  const camadasFig = () => (item.figura && Array.isArray(item.figura.camadas)) ? item.figura.camadas : [];
  const temFigura = k => camadasFig().some(cm => (cm.bloco || 1) - 1 <= k);
  const cacheTemposFig = new Map();
  function acharFala(pal, gatilho, de) {  // índice da palavra falada que casa com o gatilho (aceita 2–3 palavras), a partir de "de"
    const alvo = String(gatilho || '').split(/\s+/).map(normal).filter(Boolean);
    if (!alvo.length) return -1;
    const casa = (w, x) => w === x || (x.length >= 4 && w.startsWith(x)) || (w.length >= 4 && x.startsWith(w));
    for (let m = de; m < pal.length; m++)
      if (alvo.every((x, n) => m + n < pal.length && casa(normal(pal[m + n].w), x))) return m;
    for (let m = de; m < pal.length; m++) if (casa(normal(pal[m].w), alvo[0])) return m;  // só a 1ª palavra
    return -1;
  }
  function temposFigura(k) {  // [entra, sai] de cada camada, em segundos dentro do bloco k (-Infinity = já estava)
    const cs = camadasFig(), c = takes()[k], pal = palavrasDe(k), dur = tamanho(k);
    const chave_ = JSON.stringify([cs.map(x => [x.bloco, x.gatilho, x.sai, x.saiBloco, x.apaga]), pal.map(p => p.w + p.a.toFixed(2)), c.ini, vel(c)]);
    const ant = cacheTemposFig.get(k);
    if (ant && ant.chave === chave_) return ant.ts;
    const loc = p => Math.max(0, (p.a - c.ini) / vel(c));
    const blocoSai = cm => cm.sai && !(cm.saiBloco && cm.saiBloco < (cm.bloco || 1)) ? Math.max(cm.saiBloco || 0, cm.bloco || 1) - 1 : Infinity;
    const ts = cs.map(cm => { const b = (cm.bloco || 1) - 1; return b < k ? [-Infinity, blocoSai(cm) < k ? -Infinity : Infinity] : b > k ? [Infinity, Infinity] : null; });
    let j = 0;
    const doBloco = cs.map((cm, n) => n).filter(n => !ts[n]);
    for (const n of doBloco) {  // sempre para a frente na fala, como a conta
      const cm = cs[n];
      if (!cm.gatilho) { ts[n] = [0, Infinity]; continue; }
      const m = acharFala(pal, cm.gatilho, j);
      ts[n] = [m < 0 ? null : loc(pal[m]), Infinity];
      if (m >= 0) j = m;
    }
    doBloco.forEach((n, i) => {  // gatilho não falado: entre as camadas vizinhas (ou espalhado pela fala)
      if (ts[n][0] != null) return;
      const a = doBloco.slice(0, i).reverse().find(x => ts[x][0] != null), b = doBloco.slice(i + 1).find(x => ts[x][0] != null);
      ts[n][0] = a != null && b != null ? (ts[a][0] + ts[b][0]) / 2 : a != null ? Math.min(dur - 0.8, ts[a][0] + 1) : b != null ? Math.max(0, ts[b][0] - 1)
        : dur * (i + 1) / (doBloco.length + 1);
    });
    cs.forEach((cm, n) => {  // quando some (no bloco dela ou num bloco depois)
      if (blocoSai(cm) !== k || ts[n][0] === Infinity) return;
      const ini = ts[n][0] === -Infinity ? 0 : pal.findIndex(p => loc(p) >= ts[n][0] + 0.05), m = ini < 0 ? -1 : acharFala(pal, cm.sai, ini);
      if (m >= 0) ts[n][1] = loc(pal[m]);
    });
    // "apaga": ao entrar, a camada tira da tela as camadas anteriores com esses gatilhos (ex.: a reta nova apaga a trajetória antiga).
    // A IA às vezes escreve isso como sai + saiBloco ANTERIOR ao bloco da camada: é o mesmo pedido.
    cs.forEach((cm, m) => {
      const alvos = [...(Array.isArray(cm.apaga) ? cm.apaga : cm.apaga ? [cm.apaga] : [])];
      if (cm.sai && cm.saiBloco && cm.saiBloco < (cm.bloco || 1)) alvos.push(cm.sai);
      if (!alvos.length || ts[m][0] === Infinity) return;
      const nomes = alvos.map(x => String(x).split(/\s+/).map(normal).join(' '));
      cs.forEach((alvo, n) => {
        if (n >= m || !nomes.includes(String(alvo.gatilho || '').split(/\s+/).map(normal).join(' '))) return;
        ts[n][1] = Math.min(ts[n][1], ts[m][0]);
      });
    });
    cacheTemposFig.set(k, {chave: chave_, ts});
    return ts;
  }
  const voltaE = x => 1 + 2.7 * Math.pow(x - 1, 3) + 1.7 * Math.pow(x - 1, 2);  // "pula" um pouco ao entrar
  function seta(ctx, [x1, y1], [x2, y2], tam) {
    const a = Math.atan2(y2 - y1, x2 - x1);
    ctx.beginPath(); ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - tam * Math.cos(a - 0.45), y2 - tam * Math.sin(a - 0.45));
    ctx.lineTo(x2 - tam * Math.cos(a + 0.45), y2 - tam * Math.sin(a + 0.45));
    ctx.closePath(); ctx.fill();
  }
  function tracar(ctx, pts, p) {  // polilinha até a fração p do comprimento; devolve o último ponto e o anterior
    const ls = pts.slice(1).map((q, i) => Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]));
    let resta = p * ls.reduce((a, b) => a + b, 0), ult = pts[0], pen = pts[0];
    ctx.beginPath(); ctx.moveTo(...pts[0]);
    for (let i = 0; i < ls.length; i++) {
      if (resta >= ls[i]) { ctx.lineTo(...pts[i + 1]); resta -= ls[i]; pen = pts[i]; ult = pts[i + 1]; continue; }
      const f = ls[i] ? resta / ls[i] : 0;
      pen = pts[i]; ult = [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f];
      ctx.lineTo(...ult); break;
    }
    ctx.stroke();
    return [pen, ult];
  }
  function fonteFig(ctx, t, tam) {  // letras gregas (α, β, θ…) e símbolos que a Anton não tem: fonte de matemática, em itálico
    ctx.font = /[Ͱ-Ͽ√∞≅≡∠°]/.test(t) ? `italic bold ${tam * 1.1}px "Cambria Math", "Times New Roman", serif` : `${tam}px Anton, Impact, sans-serif`;
  }
  function textoFig(ctx, t, x, y, tam, cor, ancora = 'center') {
    fonteFig(ctx, t, tam);
    ctx.textAlign = ancora; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(6, tam * 0.16);
    ctx.strokeStyle = CLARAS.includes(cor) ? NAVY : '#fff';
    ctx.strokeText(t, x, y); ctx.fillStyle = cor; ctx.fillText(t, x, y);
  }
  // rótulo não cai em cima de outro: tenta o lugar pedido e, se estiver ocupado, acima, abaixo, dos lados (sempre na mesma ordem,
  // então nada fica pulando de um quadro para o outro). Devolve o deslocamento [dx, dy].
  function lugarRotulo(ctx, ocupa, t, tam, x, y, ancora) {
    fonteFig(ctx, t, tam);
    const w = ctx.measureText(t).width + 16, h = tam * 1.05, x0 = ancora === 'left' ? x - 8 : ancora === 'right' ? x - w + 8 : x - w / 2;
    const [ax, ay, aw, ah] = AREA_FIG;
    const tenta = [[0, 0], [0, -h * 1.1], [0, h * 1.1], [w * 0.6 + 10, 0], [-w * 0.6 - 10, 0], [0, -h * 2.2], [0, h * 2.2], [w * 0.6, -h * 1.1], [-w * 0.6, -h * 1.1]];
    const bate = r => ocupa.some(o => r[0] < o[0] + o[2] && o[0] < r[0] + r[2] && r[1] < o[1] + o[3] && o[1] < r[1] + r[3]);
    const fora = r => r[0] < ax - 20 || r[0] + r[2] > ax + aw + 20 || r[1] < ay - 50 || r[1] + r[3] > ay + ah + 50;
    const d = tenta.find(([dx, dy]) => { const r = [x0 + dx, y - h / 2 + dy, w, h]; return !bate(r) && !fora(r); }) || [0, 0];
    ocupa.push([x0 + d[0], y - h / 2 + d[1], w, h]);
    return d;
  }
  function itemFig(ctx, it, P, s, dt, alfa, ocupa = []) {
    const linhaTipo = it.tipo === 'linha' || it.tipo === 'cota' || it.tipo === 'elipse';
    const p = Math.min(1, Math.max(0, dt / (it.dur || (linhaTipo ? 0.9 : 0.35))));
    if (p <= 0) return;
    ctx.save();
    ctx.globalAlpha = alfa * (linhaTipo ? 1 : Math.min(1, p * 1.5));
    if (it.pisca && dt < 1.8) { ctx.shadowColor = LAR; ctx.shadowBlur = 40 * Math.abs(Math.sin(dt * Math.PI * 1.6)); }
    const cor = corFig(it.cor, NAVY), larg = it.larg || 6;
    ctx.strokeStyle = cor; ctx.fillStyle = cor; ctx.lineWidth = larg; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (it.tipo === 'ret' || it.tipo === 'poligono') {
      const pts = it.tipo === 'ret' ? [[it.x, it.y], [it.x + it.w, it.y], [it.x + it.w, it.y + it.h], [it.x, it.y + it.h]].map(P) : (it.pts || []).map(P);
      if (pts.length < 2) { ctx.restore(); return; }
      ctx.beginPath(); ctx.moveTo(...pts[0]); pts.slice(1).forEach(q => ctx.lineTo(...q)); ctx.closePath();
      if (it.fundo) { ctx.fillStyle = corFig(it.fundo); ctx.fill(); }
      if (it.cor || !it.fundo) { ctx.shadowBlur = 0; ctx.stroke(); }
    } else if (it.tipo === 'elipse') {  // desenhada aos poucos, como a linha; ini/fim (graus) = só um arco
      const [cx0, cy0] = P([it.x, it.y]), rx = Math.max(2, (it.rx || it.r || 1) * s), ry = Math.max(2, (it.ry || it.r || it.rx || 1) * s);
      const a0 = -(it.ini || 0) * Math.PI / 180, giro = ((it.fim == null ? 360 : it.fim) - (it.ini || 0)) * Math.PI / 180;
      const q = suaveE(Math.min(1, dt / (it.dur || 0.8)));
      if (it.fundo) { ctx.save(); ctx.globalAlpha *= Math.min(1, q * 1.4); ctx.beginPath(); ctx.ellipse(cx0, cy0, rx, ry, 0, a0, a0 - giro, true); ctx.fillStyle = corFig(it.fundo); ctx.fill(); ctx.restore(); }
      if (it.cor || !it.fundo) {
        if (it.tracejado) ctx.setLineDash([larg * 2.2, larg * 1.8]);
        ctx.shadowBlur = it.pisca && dt < 1.8 ? ctx.shadowBlur : 0;
        ctx.beginPath(); ctx.ellipse(cx0, cy0, rx, ry, 0, a0, a0 - giro * q, true); ctx.stroke(); ctx.setLineDash([]);
      }
    } else if (it.tipo === 'linha') {
      const pts = (it.pts || []).map(P); if (pts.length < 2) { ctx.restore(); return; }
      if (it.tracejado) ctx.setLineDash([larg * 2.2, larg * 1.8]);
      const [pen, ult] = tracar(ctx, pts, suaveE(p));
      ctx.setLineDash([]);
      if (it.seta) seta(ctx, pen, ult, larg * 4.5);
    } else if (it.tipo === 'bola') {
      const [x, y] = P([it.x, it.y]), r = Math.max(10, (it.r || 4) * s) * voltaE(p);
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = corFig(it.fundo, '#fff'); ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = corFig(it.cor, NAVY); ctx.shadowBlur = 0; ctx.stroke();
    } else if (it.tipo === 'texto') {
      const [x, y] = P([it.x, it.y]), sc = voltaE(p), anc = it.ancora === 'esq' ? 'left' : it.ancora === 'dir' ? 'right' : 'center';
      const tam = Math.max(48, it.tam || 54);  // menor que isso some na tela do celular
      const [dx, dy] = lugarRotulo(ctx, ocupa, String(it.t), tam, x, y, anc);
      ctx.translate(x + dx, y + dy); ctx.scale(sc, sc);
      textoFig(ctx, String(it.t), 0, 0, tam, cor, anc);
    } else if (it.tipo === 'cota') {
      const a = P(it.de), b = P(it.ate), ex = Math.max(0, Math.min(1, p * 1.25));
      const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], ab = [m[0] + (a[0] - m[0]) * suaveE(ex), m[1] + (a[1] - m[1]) * suaveE(ex)],
        bb = [m[0] + (b[0] - m[0]) * suaveE(ex), m[1] + (b[1] - m[1]) * suaveE(ex)];
      ctx.lineWidth = it.larg || 4;
      ctx.beginPath(); ctx.moveTo(...ab); ctx.lineTo(...bb); ctx.stroke();
      seta(ctx, bb, ab, 22); seta(ctx, ab, bb, 22);
      if (it.t && p > 0.4) {
        const tam = Math.max(48, it.tam || 56), d = tam * 0.75 + 8, o = {cima: [0, -d], baixo: [0, d], esq: [-d, 0], dir: [d, 0]}[it.lado || 'cima'] || [0, -d];
        const q = Math.min(1, (p - 0.4) / 0.4), sc = voltaE(q), anc = it.lado === 'esq' ? 'right' : it.lado === 'dir' ? 'left' : 'center';
        const [dx, dy] = lugarRotulo(ctx, ocupa, String(it.t), tam, m[0] + o[0], m[1] + o[1], anc);
        ctx.translate(m[0] + o[0] + dx, m[1] + o[1] + dy); ctx.scale(sc, sc);
        textoFig(ctx, String(it.t), 0, 0, tam, cor, anc);
      }
    }
    ctx.restore();
  }
  // Enquadramentos de verdade: camada a camada, se o que entra não cabe no enquadramento atual, a câmera afasta NA HORA em que
  // aquilo entra (vista automática), com folga para os rótulos. Assim nada nasce cortado, mesmo se a IA errar ou esquecer a vista,
  // e a figura não começa pequena por causa de algo que só aparece depois.
  function caixaItem(it) {
    const pts = it.tipo === 'ret' ? [[it.x, it.y], [it.x + it.w, it.y + it.h]] : it.tipo === 'cota' ? [it.de, it.ate]
      : it.tipo === 'bola' ? [[it.x - (it.r || 0), it.y - (it.r || 0)], [it.x + (it.r || 0), it.y + (it.r || 0)]]
      : it.tipo === 'elipse' ? [[it.x - (it.rx || it.r || 0), it.y - (it.ry || it.r || it.rx || 0)], [it.x + (it.rx || it.r || 0), it.y + (it.ry || it.r || it.rx || 0)]] : it.pts || [[it.x, it.y]];
    return (pts || []).filter(q => Array.isArray(q) && isFinite(q[0]) && isFinite(q[1]));
  }
  const cacheVistas = new WeakMap();
  function vistasFig(F) {
    if (cacheVistas.has(F)) return cacheVistas.get(F);
    const cs = F.camadas || [], ok = v => Array.isArray(v) && v.length === 4 && v.every(isFinite) && v[2] > v[0] && v[3] > v[1];
    const res = {base: ok(F.vb) ? F.vb.slice() : [0, 0, 10, 10], por: new Map()};
    const junta = (v, cm) => {  // v crescido para caber os itens da camada (com folga de 10% para os rótulos)
      const pts = (cm.itens || []).flatMap(caixaItem);
      if (!pts.length) return v;
      const mx = Math.max(v[2] - v[0], v[3] - v[1]) * 0.1, xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
      const cabe = Math.min(...xs) >= v[0] + mx * 0.3 && Math.max(...xs) <= v[2] - mx * 0.3 && Math.min(...ys) >= v[1] + mx * 0.3 && Math.max(...ys) <= v[3] - mx * 0.3;
      return cabe ? v : [Math.min(v[0], Math.min(...xs) - mx), Math.min(v[1], Math.min(...ys) - mx), Math.max(v[2], Math.max(...xs) + mx), Math.max(v[3], Math.max(...ys) + mx)];
    };
    let atual = res.base;
    cs.forEach((cm, n) => {
      if (n === 0) { atual = junta(ok(cm.vista) ? cm.vista.slice() : atual, cm); res.base = atual; return; }
      const v = junta(ok(cm.vista) ? cm.vista.slice() : atual, cm);
      if (ok(cm.vista) || v !== atual) res.por.set(n, v);  // vista pedida, ou automática (o que entrou não cabia)
      atual = v;
    });
    cacheVistas.set(F, res);
    return res;
  }
  function desenharFigura(ctx, k, local) {
    const F = item.figura; if (!F || !F.vb) return;
    pintarFigura(ctx, F, camadasFig(), temposFigura(k), local);
  }
  function pintarFigura(ctx, F, cs, ts, local) {
    const VF = vistasFig(F);
    // enquadramento: a última "vista" que já entrou; desliza da anterior até ela em 1 s
    const vistas = cs.map((cm, n) => [{vista: VF.por.get(n)}, ts[n][0]]).filter(([v, a]) => v.vista && a <= local).sort((x, y) => x[1] === y[1] ? 0 : x[1] - y[1]);
    const vAt = vistas.length ? vistas[vistas.length - 1] : [{vista: VF.base}, -Infinity], vAn = vistas.length > 1 ? vistas[vistas.length - 2][0].vista : VF.base;
    const q = suaveE(Math.min(1, Math.max(0, (local - vAt[1]) / 1)));
    const vb = vAt[0].vista.map((v, i) => vAn[i] + (v - vAn[i]) * q);
    const [ax, ay, aw, ah] = AREA_FIG, fw = vb[2] - vb[0] || 1, fh = vb[3] - vb[1] || 1, s = Math.min(aw / fw, ah / fh);
    const ox = ax + (aw - fw * s) / 2, oy = ay + (ah - fh * s) / 2;
    const P = ([x, y]) => [ox + (x - vb[0]) * s, oy + (vb[3] - y) * s];
    ctx.save(); ctx.beginPath(); ctx.rect(0, ay - 30, W, ah + 60); ctx.clip();  // zoom não vaza para o título nem para a legenda (dos lados pode ir até a borda)
    const ROTULO = ['texto', 'cota'], ocupa = [];  // rótulos e medidas por cima de tudo (nada cobre um número), sem se encavalar
    const nomeDe = t => { const m = String(t || '').match(/^\s*(.+?)\s*=\s*(.*)$/); return m ? [m[1].trim(), m[2].trim()] : null; };
    const respondidos = new Set();  // nomes cuja resposta já está na tela
    cs.forEach((cm, n) => { if (local >= ts[n][0] && local <= ts[n][1]) for (const it of cm.itens || []) {
      const nm = nomeDe(it.t); if (nm && nm[1] && nm[1] !== '?') respondidos.add(nm[0]);
    } });
    const perguntaRespondida = it => { const nm = nomeDe(it.t); return nm && nm[1] === '?' && respondidos.has(nm[0]); };
    for (const rotulos of [false, true]) cs.forEach((cm, n) => {
      const [a, b] = ts[n]; if (local < a) return;
      const alfa = local > b ? Math.max(0, 1 - (local - b) / 0.45) : 1; if (alfa <= 0) return;
      for (const it of cm.itens || []) if (ROTULO.includes(it.tipo) === rotulos && !perguntaRespondida(it)) itemFig(ctx, it, P, s, local - a - (it.atraso || 0), alfa, ocupa);
    });
    ctx.restore();
  }

  // Prévia na tela do roteiro, antes de gravar: a figura depois do passo n (camada n já entrou), sem relógio nem voz.
  function previaFigura(cv, F, n) {
    const cs = (F && F.camadas) || []; if (!F || !F.vb || !cs.length) return;
    n = Math.max(0, Math.min(cs.length - 1, n));
    const norm = x => String(x || '').split(/\s+/).map(normal).join(' ');
    const blocoN = cs[n].bloco || 1;
    const ts = cs.map((cm, i) => {
      if (i > n) return [Infinity, Infinity];
      const apagada = cs.slice(i + 1, n + 1).some(m => [].concat(m.apaga || []).map(norm).includes(norm(cm.gatilho)));
      const blocoSai = Math.max(cm.saiBloco || 0, cm.bloco || 1);  // some em algum ponto desse bloco: na prévia, já no começo dele
      const saiu = cm.sai && (blocoN > blocoSai || (blocoN === blocoSai && (cm.bloco || 1) < blocoSai));
      return [-Infinity, apagada || saiu ? -Infinity : Infinity];
    });
    const tela = document.createElement('canvas'); tela.width = W; tela.height = H;
    const ctx = tela.getContext('2d');
    ctx.fillStyle = CREME; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#0F1B2D14'; ctx.lineWidth = 3;
    for (let x = 60; x < W; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 60; y < H; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    pintarFigura(ctx, F, cs, ts, 0);
    const [, ay, , ah] = AREA_FIG, y0 = ay - 30, h0 = ah + 60;
    cv.width = W; cv.height = h0;
    cv.getContext('2d').drawImage(tela, 0, y0, W, h0, 0, 0, W, h0);
  }
  // A IA às vezes desenha a figura espelhada: devolve a figura desvirada (pontos, retângulos, cotas, enquadramentos)
  function espelharFigura(F0, eixo) {
    const F = JSON.parse(JSON.stringify(F0)), i = eixo === 'x' ? 0 : 1, c = F.vb[i] + F.vb[i + 2];
    const pt = q => { if (Array.isArray(q)) q[i] = +(c - q[i]).toFixed(2); };
    const caixa = v => { if (Array.isArray(v) && v.length === 4) { const a = c - v[i + 2], b = c - v[i]; v[i] = +a.toFixed(2); v[i + 2] = +b.toFixed(2); } };
    for (const cm of F.camadas || []) {
      caixa(cm.vista);
      for (const it of cm.itens || []) {
        (it.pts || []).forEach(pt); pt(it.de); pt(it.ate);
        if (it.tipo === 'ret') { if (eixo === 'x') it.x = +(c - it.x - it.w).toFixed(2); else it.y = +(c - it.y - it.h).toFixed(2); }
        else if ('x' in it && eixo === 'x') it.x = +(c - it.x).toFixed(2);
        else if ('y' in it && eixo === 'y') it.y = +(c - it.y).toFixed(2);
        if (it.lado) it.lado = eixo === 'x' ? ({esq: 'dir', dir: 'esq'}[it.lado] || it.lado) : ({cima: 'baixo', baixo: 'cima'}[it.lado] || it.lado);
        if (it.ancora && eixo === 'x') it.ancora = {esq: 'dir', dir: 'esq'}[it.ancora] || it.ancora;
        if (it.tipo === 'elipse' && (it.ini != null || it.fim != null)) {  // arco: espelha os ângulos
          const a = it.ini || 0, b = it.fim == null ? 360 : it.fim;
          [it.ini, it.fim] = eixo === 'x' ? [180 - b, 180 - a] : [-b, -a];
        }
      }
    }
    return F;
  }

  /* ---------------------------------------------------------------- 🎞️ vídeo de apoio (Pexels / Pixabay, grátis) */
  async function buscarClipes(termo) {
    const px = localStorage.getItem('pexels'), pb = localStorage.getItem('pixabay');
    if (!px && !pb) throw new Error('falta a chave do Pexels ou do Pixabay (em Chaves).');
    const q = encodeURIComponent(String(termo).trim().slice(0, 90));
    if (px) {
      const r = await fetch(`https://api.pexels.com/videos/search?query=${q}&orientation=portrait&size=medium&per_page=15`, {headers: {Authorization: px}});
      if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? 'a chave do Pexels não foi aceita.' : `o Pexels respondeu ${r.status}.`);
      const j = await r.json();
      return (j.videos || []).map(v => {
        const fs = (v.video_files || []).filter(f => f.link && f.width && (f.file_type || '').includes('mp4'));
        fs.sort((a, b) => Math.abs(Math.min(a.width, a.height) - 720) - Math.abs(Math.min(b.width, b.height) - 720));
        return {id: 'px' + v.id, capa: v.image, url: fs[0] && fs[0].link, dur: v.duration, autor: v.user && v.user.name, fonte: 'Pexels', pagina: v.url};
      }).filter(x => x.url);
    }
    const r = await fetch(`https://pixabay.com/api/videos/?key=${encodeURIComponent(pb)}&q=${q}&per_page=15&safesearch=true`);
    if (!r.ok) throw new Error(r.status === 400 || r.status === 401 ? 'a chave do Pixabay não foi aceita.' : `o Pixabay respondeu ${r.status}.`);
    const j = await r.json();
    return (j.hits || []).map(h => {
      const vs = h.videos || {}, f = (vs.small && vs.small.url) ? vs.small : vs.medium || vs.tiny || {};
      return {id: 'pb' + h.id, capa: f.thumbnail || (vs.tiny || {}).thumbnail, url: f.url, dur: h.duration, autor: h.user, fonte: 'Pixabay', pagina: h.pageURL};
    }).filter(x => x.url);
  }
  async function baixarClipe(e, x, termo) {
    const r = await fetch(x.url);
    if (!r.ok) throw new Error(`não consegui baixar o vídeo (${r.status}).`);
    const blob = await r.blob();
    if (blob.size > 60e6) throw new Error('esse vídeo é grande demais; escolha outro.');
    const cl = item.clipes || (item.clipes = {});
    cl[x.id] = blob;
    e.clipe = {id: x.id, termo, autor: x.autor || '', fonte: x.fonte, pagina: x.pagina || ''};
    const usados = new Set((item.estilo || []).map(z => z && z.clipe && z.clipe.id).filter(Boolean));
    for (const id of Object.keys(cl)) if (!usados.has(id)) { delete cl[id]; soltarClipe(id); }
  }
  const clipeVid = new Map();  // id do clipe → elemento <video> (sem som, em loop)
  function videoClipe(e) {
    const id = e.clipe && e.clipe.id, blob = id && (item.clipes || {})[id];
    if (!blob) return null;
    let v = clipeVid.get(id);
    if (!v) {
      v = document.createElement('video'); v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto';
      v.setAttribute('playsinline', ''); v.src = URL.createObjectURL(blob);
      v.onloadeddata = () => { if (!tocando && ui && !ui.hidden && takes()[sel]) mostrarQuadro(sel); };
      clipeVid.set(id, v);
    }
    return v;
  }
  function soltarClipe(id) {
    const v = clipeVid.get(id); if (!v) return;
    v.pause(); URL.revokeObjectURL(v.src); v.removeAttribute('src'); v.load(); clipeVid.delete(id);
  }
  const soltarClipes = () => [...clipeVid.keys()].forEach(soltarClipe);

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
  /* ---------------------------------------------------------------- limpeza da voz (ruído e eco)
     Cada take passa uma vez por voz-nucleo.mjs (num worker) e vira uma cópia com o som limpo. O take original não muda. */
  let falhouVoz = false, operario = null, pedidoVoz = 0;
  const esperandoVoz = new Map(), limpos = new WeakMap();  // blob do take -> {modo: promessa do blob limpo}
  const modoVoz = () => opcoes().voz ? (opcoes().limpeza || 'normal') : '';
  function limparSom(som, modo) {
    if (!operario) {
      operario = new Worker(BASE + 'voz-worker.mjs', {type: 'module'});
      operario.onmessage = e => {
        const p = esperandoVoz.get(e.data.id); if (!p) return;
        esperandoVoz.delete(e.data.id);
        if (e.data.erro) p.erro(new Error(e.data.erro)); else p.ok(e.data.som);
      };
      operario.onerror = () => {
        for (const p of esperandoVoz.values()) p.erro(new Error('o limpador de voz não abriu'));
        esperandoVoz.clear(); operario.terminate(); operario = null;
      };
    }
    return new Promise((ok, erro) => {
      const id = ++pedidoVoz;
      esperandoVoz.set(id, {ok, erro});
      operario.postMessage({id, som, modo}, [som.buffer]);
    });
  }
  async function mono48(blob) {
    const buf = await ac().decodeAudioData(await blob.arrayBuffer());
    const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(buf.duration * 48000)), 48000);
    const f = off.createBufferSource(); f.buffer = buf; f.connect(off.destination); f.start();
    return (await off.startRendering()).getChannelData(0).slice();
  }
  function wav(d, taxa) {
    const out = new DataView(new ArrayBuffer(44 + d.length * 2));
    const txt = (o, t) => [...t].forEach((ch, n) => out.setUint8(o + n, ch.charCodeAt(0)));
    txt(0, 'RIFF'); out.setUint32(4, 36 + d.length * 2, true); txt(8, 'WAVE'); txt(12, 'fmt ');
    out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true); out.setUint32(24, taxa, true);
    out.setUint32(28, taxa * 2, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true); txt(36, 'data'); out.setUint32(40, d.length * 2, true);
    for (let n = 0; n < d.length; n++) out.setInt16(44 + n * 2, Math.max(-1, Math.min(1, d[n])) * 32767, true);
    return new Blob([out.buffer], {type: 'audio/wav'});
  }
  // copia a imagem sem refazer e troca só o som
  async function trocarSom(blob, som) {
    const mb = await import(new URL(BASE + 'vendor/mediabunny.min.mjs', location.href).href);
    const entrada = new mb.Input({source: new mb.BlobSource(blob), formats: mb.ALL_FORMATS});
    const vt = await entrada.getPrimaryVideoTrack(), at = await entrada.getPrimaryAudioTrack();
    const mp4 = vt.codec === 'avc' || vt.codec === 'hevc';
    let codec = null;
    for (const c of ['opus', 'aac']) if (!codec && await mb.canEncodeAudio(c, {numberOfChannels: 1, sampleRate: 48000, bitrate: 160000})) codec = c;
    if (!codec) throw new Error('este aparelho não regrava o som');
    const saida = new mb.Output({format: mp4 ? new mb.Mp4OutputFormat({fastStart: 'in-memory'}) : new mb.WebMOutputFormat(), target: new mb.BufferTarget()});
    const vs = new mb.EncodedVideoPacketSource(vt.codec), as = new mb.AudioBufferSource({codec, bitrate: 160000});
    saida.addVideoTrack(vs, {rotation: vt.rotation || 0}); saida.addAudioTrack(as);
    await saida.start();
    const desloc = Math.max(0, Math.round((at ? await at.getFirstTimestamp() : 0) * 48000));  // o som às vezes começa depois da imagem
    const buf = new AudioBuffer({length: som.length + desloc, numberOfChannels: 1, sampleRate: 48000});
    buf.copyToChannel(som, 0, desloc);
    const imagem = async () => {
      const conf = await vt.getDecoderConfig();
      let primeiro = true;
      for await (const p of new mb.EncodedPacketSink(vt).packets()) { await vs.add(p, primeiro ? {decoderConfig: conf} : undefined); primeiro = false; }
      vs.close();
    };
    const voz = async () => { await as.add(buf); as.close(); };
    await Promise.all([imagem(), voz()]);
    await saida.finalize();
    return new Blob([saida.target.buffer], {type: mp4 ? 'video/mp4' : 'video/webm'});
  }
  // devolve o take com a voz limpa (faz uma vez só por take e modo)
  function vozLimpa(c, modo) {
    let m = limpos.get(c.blob);
    if (!m) limpos.set(c.blob, m = {});
    if (!m[modo]) {
      m[modo] = (async () => {
        const som = await limparSom(await mono48(c.blob), modo);
        return c.soVoz ? wav(som, 48000) : trocarSom(c.blob, som);
      })();
      m[modo].catch(e => { console.warn('limpeza da voz:', e); delete m[modo]; });
    }
    return m[modo];
  }
  const prepararVoz = c => { const m = modoVoz(); if (m && c) vozLimpa(c, m).catch(() => {}); };
  /* reserva, se o aparelho não conseguir limpar: só corta o ronco e dá presença. Sem compressor: o do navegador
     aumenta tudo sozinho (subia o ruído e o eco junto com a voz). */
  function cadeiaVoz(a, saida) {
    const n = (tipo, f, q, ganho) => {
      const x = a.createBiquadFilter(); x.type = tipo; x.frequency.value = f;
      if (q) x.Q.value = q; if (ganho != null) x.gain.value = ganho; return x;
    };
    const etapas = [n('highpass', 85, 0.7), n('peaking', 250, 1, -3), n('peaking', 3200, 0.9, 3)];
    etapas.reduce((x, y) => { x.connect(y); return y; }).connect(saida);
    return {entrada: etapas[0], nos: etapas};
  }
  // próximo quadro: normalmente acompanha a tela; se o celular "congelar" o desenho, um relógio garante que continue
  function proximo(f) {
    let feito = false;
    const vai = () => { if (!feito) { feito = true; f(); } };
    requestAnimationFrame(vai); setTimeout(vai, 40);
  }
  async function tocar(ks, saida, gravador, controle, aoTempo) {
    const ctx = g('ecanvas').getContext('2d'), total = totalDur(), op = opcoes();
    await carregarFigs();
    const voz = op.voz ? cadeiaVoz(ac(), saida) : null;  // só entra se a limpeza falhar
    // música de fundo: toca só enquanto o vídeo anda, em volume baixo, e recomeça se acabar
    let musica = null, fonteM = null;
    if (item.musica && !op.seco) {
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
      if (opcoes().seco) { desenhar(ctx, v, k, grupos, t, dec, total); return; }
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
      let limpo = null;
      if (modoVoz()) {
        if (!gravador) aviso('Limpando a sua voz…');  // na primeira vez demora alguns segundos
        try { limpo = await abrirVideo(await vozLimpa(c, modoVoz())); } catch (e) { falhouVoz = true; }
        if (!gravador) aviso('');
        if (controle.parar) { if (limpo) soltar(limpo); break; }
      }
      try { v = limpo || await abrirVideo(c.blob); } catch (e) { throw new Error(`o take do bloco ${k + 1} está com defeito. Toque nesse bloco e em 🎥 Regravar.`); }
      const a = ac();
      const fonte = a.createMediaElementSource(v), ganho = a.createGain();
      ganho.gain.value = 0; fonte.connect(ganho); ganho.connect(voz && !limpo ? voz.entrada : saida);
      v.playbackRate = vel(c); v.preservesPitch = true;
      await irAoTempo(v, c.ini);  // se o celular não conseguir pular, toca do zero e espera chegar no corte
      const grupos = gruposDe(k);
      const vc = layoutDe(k) === 'clipe' ? videoClipe(est(k)) : null;
      if (vc) {
        if (vc.readyState < 2) await noMaximo(new Promise(ok => vc.addEventListener('loadeddata', ok, {once: true})), 5000);
        try { vc.currentTime = 0; } catch (e) { /* segue */ }
      }
      await v.play();
      let ativo = false;
      await new Promise(ok => {
        const passo = () => {
          if (controle.parar) { v.pause(); if (vc) vc.pause(); ok(); return; }
          const t = v.currentTime;
          if (!ativo && t >= c.ini - 0.02) {
            ativo = true; ganho.gain.value = 1; if (musica) musica.play().catch(() => {}); if (vc) vc.play().catch(() => {});
            if (gravador) { if (gravador.state === 'inactive') gravador.start(1000); else if (gravador.state === 'paused') gravador.resume(); }
          }
          if (ativo) {
            const dec = antes(k) + Math.max(0, t - c.ini) / vel(c);
            compor(k, v, grupos, t, dec);
            if (aoTempo) aoTempo(dec, total, k);
          }
          if (t >= c.fim || v.ended) {
            ganho.gain.value = 0; if (musica) musica.pause(); if (vc) vc.pause(); if (gravador && gravador.state === 'recording') gravador.pause();
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

  /* ---------------------------------------------------------------- figuras na tela (emoji, desenho do banco, imagem do celular) */
  const figImg = new Map();
  let figSel = null, marcarSel = false;  // figura escolhida no editor (o contorno tracejado só aparece no editor)
  function imgFig(f) {
    const chave_ = f.tipo === 'desenho' ? 'd:' + f.valor : 'i:' + f.valor;
    let im = figImg.get(chave_);
    if (!im) {
      const blob = f.tipo === 'imagem' ? (item.imagens || {})[f.valor] : null;
      if (f.tipo === 'imagem' && !blob) return null;
      im = new Image(); im.src = f.tipo === 'desenho' ? BASE + `desenhos/${f.valor}.webp` : URL.createObjectURL(blob);
      figImg.set(chave_, im);
    }
    return im;
  }
  async function carregarFigs() {
    const ps = [];
    blocos.forEach((_, k) => {
      const e = est(k), lista = [...e.figs];
      if (e.layout === 'escala' && e.escala) lista.push(...e.escala.cadeia);
      if (e.layout === 'questao') { const im = imgQuestao(e); if (im && !im.complete) ps.push(noMaximo(im.decode(), 2500)); }
      lista.forEach(f => { const im = f.tipo !== 'emoji' && imgFig(f); if (im && !im.complete) ps.push(noMaximo(im.decode(), 2500)); });
    });
    await Promise.all(ps);
  }
  function caixaFig(f) {  // largura e altura da figura (para desenhar e para tocar nela)
    if (f.tipo === 'emoji') return [f.tam * 1.15, f.tam * 1.15];
    const im = imgFig(f);
    return im && im.naturalWidth ? [im.naturalWidth * f.tam / im.naturalHeight, f.tam] : [f.tam, f.tam];
  }
  // imagem do celular em tela cheia: "preencher" corta as bordas; "inteira" mostra tudo com a própria imagem borrada atrás.
  // Animações: flutua = zoom lento (Ken Burns); pop = entra com zoom; nenhuma = corte seco. Devolve true se cobriu a tela.
  function desenharFigsCheias(ctx, k, local) {
    let cobriu = false;
    for (const f of est(k).figs) {
      if (!f.cheia) continue;
      const sel = marcarSel && figSel === f.id;
      if (!sel && (local < f.ini - 0.01 || local > f.fim)) continue;
      const im = imgFig(f); if (!im || !im.naturalWidth) continue;
      const iw = im.naturalWidth, ih = im.naturalHeight, dur = Math.max(0.3, f.fim - f.ini);
      const q = Math.min(1, Math.max(0, (local - f.ini) / 0.35)), sai = Math.min(1, Math.max(0, (local - (f.fim - 0.25)) / 0.25));
      let alfa = 1, zoom = 1;
      if (f.anim === 'pop') { const e3 = 1 - Math.pow(1 - q, 3); alfa = Math.min(1, q * 2) * (1 - sai); zoom = 1.12 - 0.12 * e3; }
      else if (f.anim === 'flutua') { alfa = Math.min(1, q * 1.5) * (1 - sai); zoom = 1 + 0.1 * Math.min(1, Math.max(0, (local - f.ini) / dur)); }
      if (sel) { alfa = 1; zoom = 1; }
      if (alfa <= 0) continue;
      ctx.save(); ctx.globalAlpha = alfa;
      ctx.translate(W / 2, H / 2); ctx.scale(zoom, zoom); ctx.translate(-W / 2, -H / 2);
      if (f.encaixe === 'inteira') {
        ctx.save(); ctx.filter = 'blur(36px) brightness(.55)';
        const s0 = Math.max((W + 120) / iw, (H + 120) / ih); ctx.drawImage(im, (W - iw * s0) / 2, (H - ih * s0) / 2, iw * s0, ih * s0);
        ctx.restore();
        const s1 = Math.min(W / iw, H / ih); ctx.drawImage(im, (W - iw * s1) / 2, (H - ih * s1) / 2, iw * s1, ih * s1);
      } else {
        const s1 = Math.max(W / iw, H / ih), sw = W / s1, sh = H / s1;
        ctx.drawImage(im, (iw - sw) / 2, (ih - sh) / 2, sw, sh, 0, 0, W, H);
      }
      ctx.restore();
      if (f.credito) { ctx.save(); ctx.globalAlpha = alfa; creditoFoto(ctx, f.credito, W / 2, 128, W - 80, true); ctx.restore(); }
      if (alfa > 0.5) cobriu = true;
      if (sel) { ctx.save(); ctx.setLineDash([18, 12]); ctx.lineWidth = 8; ctx.strokeStyle = LAR; ctx.strokeRect(10, 10, W - 20, H - 20); ctx.restore(); }
    }
    return cobriu;
  }
  function molduraFoto(ctx, w, h, comCredito) {  // foto real: moldura branca de "foto revelada", com sombra
    const m = Math.max(10, h * 0.03), base = comCredito ? 52 : m;
    ctx.save(); ctx.shadowColor = '#0007'; ctx.shadowBlur = 26; ctx.shadowOffsetY = 10; ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.roundRect(-w / 2 - m, -h / 2 - m, w + 2 * m, h + m + base, 10); ctx.fill(); ctx.restore();
  }
  function creditoFoto(ctx, t, x, y, larg, sobreImagem) {
    ctx.save(); ctx.font = '600 21px "Open Sans", "Segoe UI", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    while (t.length > 12 && ctx.measureText(t).width > larg) t = t.slice(0, -2).trimEnd() + '…';
    if (sobreImagem) { ctx.shadowColor = '#000c'; ctx.shadowBlur = 8; ctx.fillStyle = '#fff'; } else ctx.fillStyle = '#5a6270';
    ctx.fillText(t, x, y); ctx.restore();
  }
  function desenharFigs(ctx, k, local, lay) {
    const pos = posicionarFigs(ctx, k, lay);
    posFigs = pos;
    for (const f of est(k).figs) {
      if (f.cheia) continue;
      const sel = marcarSel && figSel === f.id;
      if (!sel && (local < f.ini - 0.01 || local > f.fim)) continue;
      const q = Math.min(1, Math.max(0, (local - f.ini) / 0.35)), sai = Math.min(1, Math.max(0, (local - (f.fim - 0.2)) / 0.2));
      let esc = 1, dy = 0, alfa = 1;
      if (f.anim === 'pop') esc = q >= 1 ? 1 : Math.max(0.01, 1 - Math.cos(q * Math.PI * 2.5) * Math.exp(-q * 5));
      else if (f.anim === 'flutua') { dy = Math.sin(local * 2.4) * 14; alfa = Math.min(1, q * 1.4); }
      if (f.anim !== 'nenhuma') esc *= 1 - sai;
      if (sel) { esc = 1; alfa = 1; dy = 0; }
      const lugar = pos.get(f.id) || {cx: f.x * W, cy: f.y * H, s: 1}, s = lugar.s;
      const [w0, h0] = caixaFig(f), w = w0 * s, h = h0 * s, cx = lugar.cx, cy = lugar.cy;
      ctx.save(); ctx.globalAlpha = alfa; ctx.translate(cx, cy + dy); ctx.scale(Math.max(0.01, esc * s), Math.max(0.01, esc * s));
      if (f.tipo === 'emoji') {
        ctx.font = `${f.tam}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(f.valor, 0, f.tam * 0.05);
      } else { const im = imgFig(f); if (im && im.naturalWidth) {
        if (f.foto) molduraFoto(ctx, w0, h0, !!f.credito);
        ctx.drawImage(im, -w0 / 2, -h0 / 2, w0, h0);
        if (f.foto && f.credito) creditoFoto(ctx, f.credito, 0, h0 / 2 + 31, w0, false);
      } }
      ctx.restore();
      if (sel) {
        ctx.save(); ctx.setLineDash([18, 12]); ctx.lineWidth = 6; ctx.strokeStyle = LAR;
        ctx.strokeRect(cx - w / 2 - 10, cy - h / 2 - 10, w + 20, h + 20); ctx.restore();
      }
    }
  }

  /* ---------------------------------------------------------------- editor: aba Figuras */
  function configurarFiguras(k, c) {
    const e = est(k), dur = Math.max(0.5, tamanho(k)), guardar = () => salvar(item).catch(() => {});
    const verNoTempo = local => mostrarQuadro(k, c.ini + Math.min(local, dur - 0.05) * vel(c));
    const nova = (tipo, valor, tam, extra) => {
      const local = Math.max(0, Math.min(dur - 0.5, (tQuadro - c.ini) / vel(c)));
      const f = {id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), tipo, valor, x: 0.5, y: 0.45, tam,
        ini: +local.toFixed(2), fim: +Math.min(dur, local + (extra && extra.cheia ? 4 : 2.5)).toFixed(2), anim: 'pop', ...extra};
      e.figs.push(f); figSel = f.id; guardar(); lista(); verNoTempo(f.ini + 0.4);
    };
    ui.querySelectorAll('[data-emo]').forEach(b => b.onclick = () => nova('emoji', b.dataset.emo, 220));
    g('efoutro').onclick = () => { const x = prompt('Digite ou cole o emoji:'); if (x && x.trim()) nova('emoji', x.trim().slice(0, 8), 220); };
    g('efdes').onclick = () => escolherDesenho(nome => nova('desenho', nome, 300));
    let emTelaCheia = false;
    g('efimg').onclick = () => { emTelaCheia = false; g('efarq').click(); };
    g('efcheia').onclick = () => { emTelaCheia = true; g('efarq').click(); };
    g('effoto').onclick = () => escolherFoto((blob, x) => {
      const id = 'img' + Date.now().toString(36);
      (item.imagens || (item.imagens = {}))[id] = blob;
      nova('imagem', id, 480, {foto: true, credito: x.credito || ''});
    });
    g('efarq').onchange = async () => {
      const f = g('efarq').files[0]; g('efarq').value = ''; if (!f) return;
      if (f.size > 12e6) return alert('Imagem grande demais (mais de 12 MB).');
      const id = 'img' + Date.now().toString(36);
      (item.imagens || (item.imagens = {}))[id] = f;
      if (emTelaCheia) nova('imagem', id, 420, {cheia: true, encaixe: 'preencher', anim: 'flutua'});
      else nova('imagem', id, 420);
    };
    function lista() {
      g('eflista').innerHTML = e.figs.length ? '<label>Figuras deste bloco <small>(toque para ajustar)</small></label><div class="ebot" style="flex-wrap:wrap">' +
        e.figs.map(f => `<button data-fig="${f.id}" class="${f.id === figSel ? 'on' : ''}" style="flex:0 0 auto">${f.tipo === 'emoji' ? esc(f.valor) : f.tipo === 'desenho' ? '🎨 ' + esc(f.valor) : f.cheia ? '🖼️ tela cheia' : f.foto ? '📸 foto' : '📷 imagem'}${f.ia ? ' ✨' : ''}</button>`).join('') + '</div>' : '';
      g('eflista').querySelectorAll('[data-fig]').forEach(b => b.onclick = () => { figSel = b.dataset.fig; lista(); const f = e.figs.find(x => x.id === figSel); verNoTempo(f.ini + 0.4); });
      configFig();
    }
    function configFig() {
      const f = e.figs.find(x => x.id === figSel);
      if (!f) { g('efcfg').innerHTML = e.figs.length ? '' : '<p class="eaviso2">Escolha um emoji, um desenho do banco, uma foto real (📸) ou uma imagem do celular (PNG recortado fica sem fundo). Depois toque ou arraste na prévia para mudar de lugar.</p>'; return; }
      const ANIMS = f.cheia ? {flutua: 'Zoom lento', pop: 'Entra com zoom', nenhuma: 'Corte seco'} : {pop: 'Pula', flutua: 'Flutua', nenhuma: 'Parada'};
      g('efcfg').innerHTML = (f.tipo === 'imagem' ? `<label>Mostrar como</label><div class="ebot"><button data-fc="0" class="${f.cheia ? '' : 'on'}">📷 Figura</button><button data-fc="1" class="${f.cheia ? 'on' : ''}">🖼️ Tela cheia</button></div>` : '') +
        (f.cheia ? `<label>Encaixe</label><div class="ebot"><button data-fe="preencher" class="${f.encaixe !== 'inteira' ? 'on' : ''}">Preencher a tela</button><button data-fe="inteira" class="${f.encaixe === 'inteira' ? 'on' : ''}">Imagem inteira</button></div>
        <p class="eaviso2">“Preencher” corta as bordas; “Imagem inteira” não corta nada (bom para foto de questão). O @, o título e a legenda ficam por cima.</p>`
        : `<p class="eaviso2">👆 Arraste a figura na prévia (ou toque onde ela deve ficar).</p>
        <label>Tamanho</label><input id="eftam" type="range" min="80" max="900" step="10" value="${f.tam}">`) + `
        <label>Aparece em <b id="vfini"></b></label><input id="efini" type="range" min="0" max="${dur.toFixed(2)}" step="0.05" value="${f.ini}">
        <label>Some em <b id="vffim"></b></label><input id="effim" type="range" min="0" max="${dur.toFixed(2)}" step="0.05" value="${f.fim}">
        <label>Animação</label><div class="ebot">${Object.entries(ANIMS).map(([x, n]) => `<button data-fa="${x}" class="${f.anim === x ? 'on' : ''}">${n}</button>`).join('')}</div>
        <div class="ebot"><button id="efok">✓ Pronto</button><button id="efdel" style="color:#b00">🗑 Apagar</button></div>`;
      const tempos = () => {
        g('vfini').textContent = `${seg(f.ini)}` + (palavraNoTempo(k, f.ini) ? ` — “${palavraNoTempo(k, f.ini)}”` : '');
        g('vffim').textContent = seg(f.fim);
      };
      tempos();
      if (g('eftam')) g('eftam').oninput = () => { f.tam = Number(g('eftam').value); verNoTempo(f.ini + 0.4); };
      ui.querySelectorAll('[data-fc]').forEach(b => b.onclick = () => {
        f.cheia = b.dataset.fc === '1';
        if (f.cheia) { f.encaixe = f.encaixe || 'preencher'; if (f.anim === 'pop') f.anim = 'flutua'; }
        guardar(); configFig(); lista(); verNoTempo(f.ini + 0.4);
      });
      ui.querySelectorAll('[data-fe]').forEach(b => b.onclick = () => { f.encaixe = b.dataset.fe; guardar(); configFig(); verNoTempo(f.ini + 0.4); });
      g('efini').oninput = () => { f.ini = Math.min(Number(g('efini').value), f.fim - 0.3); g('efini').value = f.ini; tempos(); verNoTempo(f.ini + 0.05); };
      g('effim').oninput = () => { f.fim = Math.max(Number(g('effim').value), f.ini + 0.3); g('effim').value = f.fim; tempos(); verNoTempo(f.fim - 0.05); };
      if (g('eftam')) g('eftam').onchange = guardar;
      g('efini').onchange = g('effim').onchange = guardar;
      ui.querySelectorAll('[data-fa]').forEach(b => b.onclick = () => { f.anim = b.dataset.fa; guardar(); configFig(); previa([k]); });
      g('efok').onclick = () => { figSel = null; lista(); mostrarQuadro(k, tQuadro); };
      g('efdel').onclick = () => { e.figs = e.figs.filter(x => x !== f); figSel = null; guardar(); lista(); mostrarQuadro(k, tQuadro); };
    }
    lista();
    // arrastar (ou tocar) na prévia
    const cv = g('ecanvas');
    const ponto = ev => {
      const r = cv.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0)) return [0.5, 0.45];  // prévia sem tamanho (tela escondida): não estraga a posição
      return [Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height))];
    };
    let arrastando = null, pendente = false;
    cv.onpointerdown = ev => {
      if (tocando || abaEd !== 'figuras') return;
      const [px, py] = ponto(ev), local = (tQuadro - c.ini) / vel(c);
      const toque = [...e.figs].reverse().find(f => {
        if (f.cheia || (f.id !== figSel && (local < f.ini || local > f.fim))) return false;
        const [w0, h0] = caixaFig(f), l = posFigs.get(f.id) || {cx: f.x * W, cy: f.y * H, s: 1};
        return Math.abs(px * W - l.cx) < w0 * l.s / 2 + 20 && Math.abs(py * H - l.cy) < h0 * l.s / 2 + 20;
      });
      // figura que você mexe fica onde você pôs (sai do posicionamento automático)
      const fixar = f => { const l = posFigs.get(f.id); if (l && !f.fixa) { f.x = l.cx / W; f.y = l.cy / H; f.tam = Math.round(f.tam * l.s); } f.fixa = true; };
      if (toque) { fixar(toque); figSel = toque.id; arrastando = {f: toque, dx: toque.x - px, dy: toque.y - py}; lista(); }
      else if (figSel) { const f = e.figs.find(x => x.id === figSel && !x.cheia); if (f) { f.fixa = true; f.x = px; f.y = py; arrastando = {f, dx: 0, dy: 0}; } }
      if (arrastando) { cv.setPointerCapture(ev.pointerId); ev.preventDefault(); mostrarQuadro(k, tQuadro); }
    };
    cv.onpointermove = ev => {
      if (!arrastando) return;
      const [px, py] = ponto(ev);
      arrastando.f.x = Math.min(0.98, Math.max(0.02, px + arrastando.dx));
      arrastando.f.y = Math.min(0.98, Math.max(0.02, py + arrastando.dy));
      if (!pendente) { pendente = true; mostrarQuadro(k, tQuadro).finally(() => { pendente = false; }); }
    };
    cv.onpointerup = cv.onpointercancel = () => { if (arrastando) { arrastando = null; guardar(); mostrarQuadro(k, tQuadro); } };
  }
  /* ---------------------------------------------------------------- 📸 foto real
     Wikipédia/Wikimedia Commons (sem chave; SÓ imagem de licença livre, com o crédito que a licença pede) e Pixabay (com a chave). */
  const semHtml = x => String(x || '').replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();
  function creditoWiki(m) {  // m = extmetadata da imagem; null = não é livre (não usa)
    const v = x => m && m[x] ? semHtml(m[x].value) : '';
    const lic = v('LicenseShortName');
    if (v('NonFree') === 'true' || !lic || /fair use|non-free/i.test(lic)) return null;
    if (/public domain|dom[ií]nio p[uú]blico|^pd\b|^cc0/i.test(lic)) return 'Foto: domínio público';
    const autor = v('Artist').replace(/^(unknown|autor desconhecido|desconhecido).*$/i, '').slice(0, 40);
    return `Foto: ${autor ? autor + ' · ' : ''}${lic} · Wikimedia`;
  }
  const miniWiki = u => u.replace(/\/(\d+)px-([^/]+)$/, '/320px-$2');
  async function jsonDe(url) { const r = await fetch(url); if (!r.ok) throw new Error(`a busca respondeu ${r.status}`); return r.json(); }
  async function buscarFotos(termo, {soPrimeira = false} = {}) {
    const q = encodeURIComponent(termo.trim()), achou = [], vistos = new Set();
    const por = x => { const nome = normal(decodeURIComponent((x.arquivo || x.url).split('/').pop()).replace(/^(file|arquivo|ficheiro):/i, '')); if (!vistos.has(nome)) { vistos.add(nome); achou.push(x); } };
    // 1) a foto principal dos artigos da Wikipédia (português e inglês)
    for (const l of ['pt', 'en']) {
      try {
        const api = `https://${l}.wikipedia.org/w/api.php?format=json&origin=*&action=query`;
        const j = await jsonDe(`${api}&generator=search&gsrsearch=${q}&gsrlimit=6&prop=pageimages&piprop=thumbnail|name&pithumbsize=1400&pilicense=free`);
        const pags = Object.values((j.query || {}).pages || {}).filter(p => p.thumbnail && p.pageimage).sort((a, b) => a.index - b.index);
        if (!pags.length) continue;
        const li = await jsonDe(`${api}&prop=imageinfo&iiprop=extmetadata&iiextmetadatafilter=LicenseShortName|Artist|NonFree&titles=` +
          encodeURIComponent(pags.map(p => 'File:' + p.pageimage).join('|')));
        const meta = {};
        Object.values((li.query || {}).pages || {}).forEach(p => { if (p.imageinfo) meta[normal(p.title.replace(/^[^:]+:/, ''))] = p.imageinfo[0].extmetadata; });
        for (const p of pags) {
          const cr = creditoWiki(meta[normal(p.pageimage.replace(/_/g, ' '))]);
          if (cr) por({fonte: 'Wikipédia', titulo: p.title, url: p.thumbnail.source, capa: miniWiki(p.thumbnail.source), arquivo: p.pageimage, credito: cr});
        }
      } catch (err) { /* sem internet ou a busca falhou: segue para a próxima fonte */ }
      if (soPrimeira && achou.length) return achou;
    }
    // 2) arquivos do Wikimedia Commons
    try {
      const j = await jsonDe(`https://commons.wikimedia.org/w/api.php?format=json&origin=*&action=query&generator=search&gsrnamespace=6&gsrsearch=${q}&gsrlimit=18` +
        '&prop=imageinfo&iiprop=url|mime|extmetadata&iiurlwidth=1400&iiextmetadatafilter=LicenseShortName|Artist|NonFree');
      Object.values((j.query || {}).pages || {}).sort((a, b) => a.index - b.index).forEach(p => {
        const ii = p.imageinfo && p.imageinfo[0];
        if (!ii || !/^image\/(jpeg|png|webp|gif|tiff)/.test(ii.mime || '') || !ii.thumburl) return;
        const cr = creditoWiki(ii.extmetadata);
        if (cr) por({fonte: 'Wikimedia', titulo: p.title.replace(/^File:/, '').replace(/\.\w+$/, ''), url: ii.thumburl, capa: miniWiki(ii.thumburl), arquivo: p.title, credito: cr});
      });
    } catch (err) {}
    if (soPrimeira && achou.length) return achou;
    // 3) Pixabay (fotos genéricas: sala de aula, quadro-negro…), se houver a chave
    const pb = localStorage.getItem('pixabay');
    if (pb) try {
      const j = await jsonDe(`https://pixabay.com/api/?key=${encodeURIComponent(pb)}&q=${q}&image_type=photo&per_page=12&safesearch=true&lang=pt`);
      (j.hits || []).forEach(h => por({fonte: 'Pixabay', titulo: (h.tags || '').split(',')[0], url: h.largeImageURL || h.webformatURL, capa: h.previewURL || h.webformatURL,
        credito: `Foto: ${h.user || 'Pixabay'} · Pixabay`}));
    } catch (err) {}
    return achou;
  }
  async function baixarFoto(x) {
    const r = await fetch(x.url);
    if (!r.ok) throw new Error(`o site respondeu ${r.status}`);
    const blob = await r.blob();
    if (!/^image\//.test(blob.type)) throw new Error('não veio uma imagem');
    if (blob.size > 12e6) throw new Error('imagem grande demais');
    return blob;
  }
  function escolherFoto(aoEscolher, termo0 = '') {
    let cx = g('efoto');
    if (!cx) {
      cx = document.createElement('div'); cx.id = 'efoto';
      cx.innerHTML = `<div class="edtopo"><input id="efobusca" type="search" enterkeyhint="search" placeholder="Quem ou o quê? (ex.: George Dantzig)"><button id="efoir">🔎</button><button id="efofechar">✕</button></div>
        <p class="efonota">Só fotos de licença livre (Wikipédia/Wikimedia e, com a chave, Pixabay). Quando a licença pede, o crédito sai pequeno no vídeo.</p><div id="efgrade"></div>`;
      g('gedit').appendChild(cx);
      g('efofechar').onclick = () => { cx.hidden = true; };
    }
    let vez = 0;
    const buscar = async () => {
      const t = g('efobusca').value.trim(); if (!t) return;
      const minha = ++vez;
      g('efgrade').innerHTML = '<p style="padding:20px;grid-column:1/-1">Buscando fotos…</p>';
      const lista = await buscarFotos(t);
      if (minha !== vez) return;
      if (!lista.length) { g('efgrade').innerHTML = '<p style="padding:20px;grid-column:1/-1">Nenhuma foto livre encontrada. Tente o nome completo, em inglês, ou mais curto.</p>'; return; }
      g('efgrade').innerHTML = lista.map((x, n) => `<button data-n="${n}" title="${esc(x.credito)}"><img src="${esc(x.capa)}" loading="lazy" alt=""><span>${esc(x.titulo)}</span><small>${esc(x.fonte)}</small></button>`).join('');
      g('efgrade').querySelectorAll('[data-n]').forEach(b => b.onclick = async () => {
        const x = lista[b.dataset.n], sp = b.querySelector('span');
        b.disabled = true; sp.textContent = 'Baixando…';
        try { const blob = await baixarFoto(x); cx.hidden = true; aoEscolher(blob, x); }
        catch (err) { b.disabled = false; sp.textContent = x.titulo; alert(`Não consegui baixar essa foto (${err.message}). Escolha outra.`); }
      });
    };
    g('efoir').onclick = buscar;
    g('efobusca').onkeydown = ev => { if (ev.key === 'Enter') buscar(); };
    g('efobusca').value = termo0; g('efgrade').innerHTML = ''; cx.hidden = false;
    if (termo0) buscar(); else g('efobusca').focus();
  }
  function escolherDesenho(aoEscolher) {
    let caixa_ = g('edes');
    if (!caixa_) {
      caixa_ = document.createElement('div'); caixa_.id = 'edes';
      caixa_.innerHTML = `<div class="edtopo"><input id="edbusca" type="search" placeholder="Buscar desenho (ex.: relógio, dinheiro, pizza)"><button id="edfechar">✕</button></div><div id="edgrade"></div>`;
      g('gedit').appendChild(caixa_);
      g('edfechar').onclick = () => { caixa_.hidden = true; };
    }
    const nomes = Object.keys(typeof DESCRICOES !== 'undefined' ? DESCRICOES : {});
    const mostrar = () => {
      const q = normal(g('edbusca').value);
      const achados = nomes.filter(n => !q || normal(n + ' ' + (DESCRICOES[n] || '') + ' ' + ((DESENHOS.get(n) || []).join(' '))).includes(q));
      g('edgrade').innerHTML = achados.map(n => `<button data-d="${esc(n)}" title="${esc(DESCRICOES[n] || n)}"><img src="${BASE}desenhos/${encodeURIComponent(n)}.webp" loading="lazy" alt=""><span>${esc(n)}</span></button>`).join('') ||
        '<p style="padding:20px">Nenhum desenho com esse nome.</p>';
      g('edgrade').querySelectorAll('[data-d]').forEach(b => b.onclick = () => { caixa_.hidden = true; aoEscolher(b.dataset.d); });
    };
    g('edbusca').oninput = mostrar;
    g('edbusca').value = ''; mostrar();
    caixa_.hidden = false;
  }

  /* ---------------------------------------------------------------- ✨ Montar com IA */
  async function montarComIA(sozinho = false) {
    if (!chave()) return alert('Para montar com IA, cole a chave do Gemini em "Chaves".');
    if (blocos.some((_, k) => !takes()[k])) return alert('Grave todos os blocos antes de montar com IA.');
    if (!sozinho && !confirm('A IA vai sugerir layout, mascote, título, transição e figuras para TODOS os blocos, pelo que você falou.\nDá para desfazer depois. Continuar?')) return;
    const semVideo = blocos.every((_, k) => semImagem(k));  // vídeo só com a voz: tudo o que se vê vem daqui
    pararPrevia(); ocupado = true;
    if (opcoes().legendaVoz) {  // para a IA "ouvir" o que você falou de verdade
      const faltam = blocos.map((_, k) => k).filter(k => !takes()[k].transcricao);
      for (const [n, k] of faltam.entries()) {
        aviso(`Ouvindo a sua voz… (${n + 1} de ${faltam.length})`);
        if (transcrevendo.has(k)) while (transcrevendo.has(k)) await espera(300); else await transcreverFundo(k);
      }
    }
    aviso('✨ A IA está montando as cenas…');
    const desenhos = Object.entries(DESCRICOES || {}).map(([n, d]) => `${n} = ${d}`).join('\n');
    const textoBlocos = blocos.map((b, k) => `BLOCO ${k + 1}${b.gancho ? ' (GANCHO, abre o vídeo)' : ''} — ${seg(tamanho(k))} — fala: "${palavrasDe(k).map(p => p.w).join(' ') || b.fala}"` +
      (b.quadro ? ` — conta do roteiro: "${b.quadro}"` : '')).join('\n');
    const regrasLayout = semVideo ? `- O PROFESSOR NÃO APARECE neste vídeo: só a voz dele. Tudo o que se vê é o mascote, a conta, o título e as figuras, então capriche nas figuras.
- layout: "visual" (folha de caderno, conta grande no meio, mascote embaixo apresentando) ou "mascote" (mascote grande ao lado de uma lousa com a conta).
  Use "visual" na maioria dos blocos e "mascote" em 1 ou 2 blocos para variar (nunca três blocos seguidos iguais).
- conta: o texto curto da conta ou do número em destaque (até 24 caracteres, símbolos Unicode como × ÷ ² √ %), em TODOS os blocos, avançando a conta passo a passo.`
      : `- layout: "cheia" (professor falando, use no gancho e no final), "dividida" (conta em cima, professor embaixo), "circulo" (conta grande + professor num círculo),
  "canto" (conta ocupando a tela + rosto no canto), "mascote" (só o mascote apresentando com lousa; a voz é do professor), "mascote_fundo" (mascote na frente, professor ao fundo),
  "alternar" (alterna professor e mascote a cada frase). Varie: no máximo 2 blocos com mascote em destaque; nunca dois blocos seguidos com o mesmo layout de conta.
- conta: o texto curto da lousa/quadro (até 24 caracteres, símbolos Unicode como × ÷ ² √ %), só quando o layout mostra conta ou lousa; senão "".`;
    const temClipe = !!(localStorage.getItem('pexels') || localStorage.getItem('pixabay'));
    const regrasApoio = `- layout "escala": zoom contínuo por uma sequência de desenhos, do menor para o maior (ex.: casa → cidade → Brasil → Terra → sistema solar → galáxia).
  Use SÓ quando a fala comparar tamanhos, distâncias, escalas, potências de 10 ou notação científica; no máximo 1 bloco no vídeo.
  Preencha escala_cadeia (3 a 6 itens, do MENOR para o MAIOR, cada um com valor = nome exato de desenho da lista ou um emoji, e rotulo curto em CAIXA ALTA)
  e escala_sentido ("sai" = afastando, do pequeno para o grande; "entra" = aproximando, do grande para o pequeno). Nesse bloco, figuras = [].` +
      (temClipe ? `
- layout "clipe": um vídeo REAL de banco de imagens cobre a tela (ex.: planeta girando, dinheiro, trânsito, mercado), com a voz por cima.
  Use quando uma cena do mundo real prende mais que um desenho (ótimo no gancho); no máximo 2 blocos no vídeo e nunca seguidos.
  Preencha busca_clipe com 2 a 4 palavras em INGLÊS que acham esse vídeo (ex.: "earth rotating space", "counting money cash"). Nesse bloco, figuras = [].` : '');
    const regrasFig = semVideo ? `- figuras: 1 a 3 por bloco (o vídeo depende delas), cada uma ligada a UMA palavra que o professor fala naquele bloco (copie a palavra exatamente como está na fala).
  Prefira "desenho" (use SÓ nomes exatos da lista abaixo); use "emoji" quando nenhum desenho combinar. posicao: alto_esquerda, alto_direita, baixo_esquerda ou baixo_direita
  (o meio é da conta); duas figuras do mesmo bloco em posições diferentes.`
      : `- figuras: 0 a 2 por bloco, cada uma ligada a UMA palavra que o professor fala naquele bloco (copie a palavra exatamente como está na fala).
  tipo "emoji" (um emoji só) ou "desenho" (use SÓ nomes exatos da lista abaixo). posicao: alto_esquerda, alto_direita, meio_esquerda, meio_direita ou centro.`;
    const regraFoto = `- tipo "foto": FOTO REAL buscada na Wikipédia, só para PESSOA, LUGAR, OBRA ou FATO HISTÓRICO real que a fala cita pelo nome
  (ex.: "George Dantzig", "Jerzy Neyman", "Universidade da Califórnia em Berkeley", "Pirâmide de Quéops"). valor = o nome como está na Wikipédia, completo.
  Quando a fala cita alguém real pelo nome, use a foto dele no bloco em que o nome aparece. No máximo 1 foto por bloco e 4 no vídeo.
  NUNCA use foto para coisa genérica (dinheiro, pizza, aluno, prova): para isso use desenho ou emoji.`;
    const prompt = `Você é editor de vídeos curtos (Reels) de matemática do professor Delmão (@delmaosimplifica), com mascote.
Tema do vídeo: "${item.conteudo.tema}". Abaixo, o que o professor FALOU em cada bloco. Monte a cena de cada bloco para o vídeo prender a atenção,
sem poluir. Regras:
${regrasLayout}
  A conta tem de ser MATEMATICAMENTE CERTA e igual ao que o professor fala (confira duas vezes; ex.: "25% = 1/4" está certo, "25% de 8 = 1/4" está errado).
  Se a resposta só aparece depois, use "?" (ex.: "8% de 25 = ?").
- titulo: frase curtíssima em CAIXA ALTA (até 22 caracteres) que resume o bloco; o do gancho tem de prender. Pode ser "" se não precisar.
- cor_titulo: laranja, navy, branco, amarelo ou sem. transicao: nenhuma, zoom, esmaecer, deslizar, subir, flash ou desfoque (prefira zoom; varie com moderação).
- pose do mascote: explicando, ideia, resolvendo, pensando, desafiando, confiante, estudando ou joinha (combine com o que é falado).
- mascote_canto: true se o mascote pequeno no canto ajuda naquele bloco (não use em blocos com layout de mascote).
${regrasApoio}
${regrasFig}
${regraFoto}
Desenhos disponíveis (nome = o que mostra):
${desenhos}

BLOCOS:
${textoBlocos}`;
    const E = (...v) => ({type: 'STRING', enum: v});
    const esquema = {type: 'OBJECT', properties: {blocos: {type: 'ARRAY', items: {type: 'OBJECT', properties: {
      bloco: {type: 'INTEGER'}, layout: E(...(semVideo ? ['visual', 'mascote'] : ['cheia', 'dividida', 'circulo', 'canto', 'mascote', 'mascote_fundo', 'alternar']), 'escala', ...(temClipe ? ['clipe'] : [])),
      escala_cadeia: {type: 'ARRAY', items: {type: 'OBJECT', properties: {valor: {type: 'STRING'}, rotulo: {type: 'STRING'}}, required: ['valor', 'rotulo']}},
      escala_sentido: E('sai', 'entra'), busca_clipe: {type: 'STRING'},
      pose: E(...Object.keys(POSES)), mascote_canto: {type: 'BOOLEAN'}, titulo: {type: 'STRING'}, cor_titulo: E(...Object.keys(CORES_TITULO)),
      conta: {type: 'STRING'}, transicao: E(...Object.keys(TRANSICOES)),
      figuras: {type: 'ARRAY', items: {type: 'OBJECT', properties: {tipo: E('emoji', 'desenho', 'foto'), valor: {type: 'STRING'}, palavra: {type: 'STRING'},
        posicao: semVideo ? E('alto_esquerda', 'alto_direita', 'baixo_esquerda', 'baixo_direita') : E('alto_esquerda', 'alto_direita', 'meio_esquerda', 'meio_direita', 'centro')}, required: ['tipo', 'valor', 'palavra', 'posicao']}}},
      required: ['bloco', 'layout', 'pose', 'mascote_canto', 'titulo', 'cor_titulo', 'conta', 'transicao', 'figuras']}}}, required: ['blocos']};
    const r = await chamarGemini(JSON.stringify({contents: [{parts: [{text: prompt}]}],
      generationConfig: {responseMimeType: 'application/json', responseSchema: esquema, temperature: 0.7}}), t => aviso('✨ ' + t));
    // guarda como estava, para desfazer
    const c0 = item.conteudo;
    item.antesIA = JSON.parse(JSON.stringify({estilo: item.estilo || [], texto_capa: c0.texto_capa, gancho_quadro: c0.gancho_quadro || '',
      blocos: c0.blocos.map(b => ({texto_tela: b.texto_tela, quadro: b.quadro}))}));
    const POS = {alto_esquerda: [0.24, 0.3], alto_direita: [0.76, 0.3], meio_esquerda: [0.22, 0.5], meio_direita: [0.78, 0.5], centro: [0.5, 0.46],
      baixo_esquerda: [0.25, 0.58], baixo_direita: [0.75, 0.58]};
    let nFig = 0;
    const pedirClipe = [], pedirFoto = [];
    const ehEmoji = v => /\p{Extended_Pictographic}/u.test(v || '');
    for (const x of r.blocos || []) {
      const k = x.bloco - 1; if (!(k >= 0 && k < blocos.length)) continue;
      const e = est(k);
      const lay = e.layout === 'figura' && temFigura(k) ? 'figura' : semImagem(k) && !SEM_CAMERA.includes(x.layout) ? 'visual' : x.layout;  // a figura animada fica
      Object.assign(e, {layout: lay, pose: x.pose, mascoteCanto: !!x.mascote_canto && !COM_MASCOTE.includes(lay), corTitulo: x.cor_titulo});
      if (k > 0) e.transicao = x.transicao;
      setTexto(k, 'texto_tela', (x.titulo || '').slice(0, 40));
      if (x.conta && lay !== 'figura') setTexto(k, 'quadro', x.conta.slice(0, 40));
      e.figs = e.figs.filter(f => !f.ia);  // troca só as figuras que a IA tinha posto; as suas ficam
      if (lay === 'figura') continue;  // a figura já ocupa o meio da tela
      if (lay === 'escala') {
        const cad = (x.escala_cadeia || []).map(c => temDesenho(c.valor) ? {tipo: 'desenho', valor: c.valor, rotulo: (c.rotulo || '').toUpperCase().slice(0, 20)}
          : ehEmoji(c.valor) ? {tipo: 'emoji', valor: [...c.valor.trim()].slice(0, 2).join(''), rotulo: (c.rotulo || '').toUpperCase().slice(0, 20)} : null).filter(Boolean);
        e.escala = {cadeia: cad.length >= 2 ? cad : cadeiaPadrao(), sentido: x.escala_sentido === 'entra' ? 'entra' : 'sai'};
        continue;
      }
      if (lay === 'clipe') {
        if (x.busca_clipe && !(e.clipe && e.clipe.termo === x.busca_clipe && (item.clipes || {})[e.clipe.id])) pedirClipe.push([k, x.busca_clipe]);
        else if (!x.busca_clipe && !e.clipe) e.layout = semImagem(k) ? 'visual' : 'circulo';
        continue;
      }
      const dur = tamanho(k);
      for (const fg of x.figuras || []) {
        if (fg.tipo === 'desenho' && !(DESCRICOES || {})[fg.valor]) continue;
        const ini = quandoFala(k, fg.palavra);
        const [px, py] = POS[fg.posicao] || POS.centro;
        const inicio = ini == null ? 0.3 : Math.max(0, ini - 0.1);
        if (fg.tipo === 'foto') { if (fg.valor && pedirFoto.length < 4) pedirFoto.push({k, termo: fg.valor, px, py, inicio, dur}); continue; }
        e.figs.push({id: 'ia' + Date.now().toString(36) + nFig++, tipo: fg.tipo, valor: fg.valor, x: px, y: py, tam: fg.tipo === 'emoji' ? 200 : 280,
          ini: +inicio.toFixed(2), fim: +Math.min(dur, inicio + 2.4).toFixed(2), anim: 'pop', ia: true});
      }
    }
    const fotoAchada = new Map();
    for (const [n, p] of pedirFoto.entries()) {  // busca as fotos reais que a IA pediu (a 1ª foto livre da Wikipédia)
      aviso(`📸 Buscando foto: ${p.termo}… (${n + 1} de ${pedirFoto.length})`);
      try {
        let ach = fotoAchada.get(p.termo);
        if (!ach) {
          const x = (await buscarFotos(p.termo, {soPrimeira: true})).find(z => z.fonte !== 'Pixabay');
          if (!x) continue;
          const id = 'img' + Date.now().toString(36) + n;
          (item.imagens || (item.imagens = {}))[id] = await baixarFoto(x);
          fotoAchada.set(p.termo, ach = {id, credito: x.credito});
        }
        est(p.k).figs.push({id: 'ia' + Date.now().toString(36) + nFig++, tipo: 'imagem', valor: ach.id, foto: true, credito: ach.credito, x: p.px, y: p.py, tam: 520,
          ini: +p.inicio.toFixed(2), fim: +Math.min(p.dur, p.inicio + 3).toFixed(2), anim: 'pop', ia: true});
      } catch (err) { /* sem foto livre: o bloco fica sem ela */ }
    }
    for (const [n, [k, termo]] of pedirClipe.entries()) {  // baixa os vídeos de apoio que a IA pediu
      aviso(`🎞️ Buscando vídeo de apoio… (${n + 1} de ${pedirClipe.length})`);
      const e = est(k);
      try {
        const lista = await buscarClipes(termo);
        if (!lista.length) throw new Error('nada encontrado');
        await baixarClipe(e, lista[0], termo);
      } catch (err) { e.layout = semImagem(k) ? 'visual' : 'circulo'; delete e.clipe; }
    }
    opcoes().seco = false;
    item.montouIA = true;
    await salvar(item);
    aviso(''); ocupado = false;
    selecionar(sel);
    alert(`✨ Pronto! A IA montou ${r.blocos ? r.blocos.length : 0} blocos e pôs ${nFig} figuras. Veja na prévia (▶) e ajuste o que quiser. Não gostou? Toque em ↩ Desfazer.`);
  }
  // 📐 a IA desenha UMA figura para o vídeo todo, em camadas que entram nas palavras que você falou
  // 📐 pede ao Gemini a figura animada (usada no editor e na criação do roteiro a partir de uma questão em PDF)
  async function pedirFigura(tema, enunciado, textoBlocos, avisar = () => {}, imagens = []) {
    const pedido = `Você desenha a FIGURA de um Reels de matemática (vídeo vertical) do professor Delmão. A figura vai sendo desenhada
no ritmo da fala dele, como num quadro: cada camada aparece quando ele fala a palavra-gatilho. Tema: "${tema}".
${enunciado ? `Enunciado da questão (e a figura dela, descrita):\n"""${enunciado}"""\n` : ''}
O que ele fala em cada bloco:
${textoBlocos}

Regras:
- UMA figura para o vídeo todo, em coordenadas do problema (ex.: centímetros), com o y para CIMA. Use as medidas REAIS do problema
  e confira cada conta duas vezes: a figura tem de estar matematicamente certa.
- vb = [x0, y0, x1, y1]: enquadramento inicial, com folga de ~10% em volta (a área da tela é quase quadrada, um pouco mais larga que alta).
- camadas: na ordem da fala. bloco = número do bloco em que entra. gatilho = UMA ou DUAS palavras copiadas EXATAMENTE da fala desse
  bloco (o momento em que ela aparece); "" = no começo do bloco. A 1ª camada (bloco 1, gatilho "") é a base da figura.
  Uma ideia por camada (6 a 14 camadas no total); nada de mostrar a resposta antes de ele falar.
- apaga: lista de gatilhos de camadas ANTERIORES que somem quando esta entra (ex.: a reta nova apaga a trajetória antiga: "apaga": ["três"]).
- sai: palavra (desta camada em diante) em que ELA MESMA some; "" = fica. saiBloco: o bloco dessa palavra, se for depois do bloco da camada.
- vista: [x0, y0, x1, y1] quando a câmera precisa afastar/aproximar (ex.: a figura cresce para o lado, ou zoom num detalhe); senão [].
- itens de cada camada (tipo e só os campos dele):
  ret: x, y (canto de baixo à esquerda), w, h, fundo e/ou cor (borda).  poligono: pts [[x,y],...], fundo, cor.
  linha: pts [[x,y],...] (é traçada aos poucos), cor, larg (px, padrão 6), tracejado, seta.
  elipse: x, y (centro), rx, ry (círculo: só r), fundo, cor, tracejado; ini e fim em graus para desenhar só um arco (0° = direita,
  sentido anti-horário). Use para cilindro (elipse em cima e embaixo + 2 linhas), cone, circunferência, setor, arco de ângulo.  bola: x, y, r (no tamanho do problema), fundo, cor.
  texto: x, y, t (curto: número, letra, "d = ?"), tam (px, 40 a 70), cor.  cota: de [x,y], ate [x,y], t (a medida), lado (cima, baixo, esq, dir).
  pisca: true para destacar algo importante no instante em que aparece. atraso: segundos depois do gatilho (para encadear 2 itens).
- contas: para cada bloco que mostra uma conta, a conta curta escrita embaixo da figura (até 26 caracteres, símbolos × ÷ − = →), igual ao que ele fala.
  Números no padrão brasileiro: vírgula decimal (6,3; 158,40), nunca ponto.

COMO FAZER UMA FIGURA BONITA E CLARA (o professor reprova figura poluída):
1. A figura conta a mesma história da fala: cada ideia que ele fala vira algo novo na tela, na hora em que ele fala.
2. Ideia de refletir, espelhar, desdobrar, girar, repetir ou empilhar: desenhe TODAS as cópias (ex.: 3 batidas = 3 mesas espelhadas),
   com as coordenadas espelhadas certas, na versão CLARA da cor do original, cada cópia com atraso 0,4 s maior que a anterior.
3. Rótulos curtíssimos (até 8 caracteres: "d = ?", "400", "α", "BRANCA"). NUNCA ponha frase nem conta dentro da figura: conta vai em "contas".
   No máximo 1 rótulo por objeto, colado nele. Medida é sempre "cota" (com setinhas), não texto solto.
4. Contraste: texto em cima de fundo escuro (mesa, navy, verde) = branco ou amarelo; em cima do creme = navy, laranja ou azul.
5. A ideia-chave (a reta, o lado procurado, o triângulo semelhante) em laranja, larg 9 a 10, com pisca. O resto em navy, sem pisca.
6. Regiões e cópias: cores claras (transparentes): mesa_clara, azul_claro, laranja_claro, verde_claro, amarelo_claro, vermelho_claro,
   roxo_claro, cinza_claro. Objeto principal nunca em cinza.
7. vista: tem de conter TUDO o que vai estar visível até a próxima vista, com folga para os rótulos. Ao voltar a um detalhe, use vista
   e tire ("apaga") o que ficou para trás, para a tela não ficar cheia.
   O que é perguntado leva "?" ("d = ?"); quando a resposta entrar com o mesmo nome ("d = 58"), o "?" some sozinho.
8. Objetos minúsculos (bola de 3 cm numa mesa de 2 m, um ponto): use o tamanho real; o app aumenta sozinho para ficar visível.
8b. FORA DE ESCALA quando precisar: se as medidas reais deixam a figura fina, achatada ou com o detalhe invisível (ex.: cilindro de
   raio 10 e altura 100; espessura de 1 cm), desenhe esquemático, como a prova faz, com proporções que deixem tudo legível,
   e ponha as medidas REAIS nos rótulos. O detalhe que a questão discute (espessura, diferença) tem de aparecer grande.
9. MENOS É MAIS: nunca escreva coordenadas como "(103, 143)" na figura; cada medida aparece UMA vez (cota OU texto, nunca os dois);
   no máximo 5 rótulos na tela ao mesmo tempo; o que já foi usado e não ajuda mais sai ("apaga").
10. Linhas e pontos importantes nas coordenadas EXATAS (pontos de batida, pés de altura, interseções): calcule antes de escrever.
Cores: navy (padrão), laranja, verde, mesa (verde de mesa de bilhar), madeira, amarelo, azul, vermelho, roxo, cinza, branco, creme + as claras.
Fundo da tela: creme quadriculado.`;
    // sem responseSchema: com o esquema cheio de campos opcionais o Gemini preenchia tudo e se perdia; um exemplo curto funciona melhor
    // Exemplo completo de OUTRO problema (sombra do poste x sombra do prédio, semelhança), no padrão de qualidade que o professor aprovou
    const exSombra = {vb: [-2, -2, 24, 8], camadas: [
      {bloco: 1, gatilho: '', itens: [{tipo: 'linha', pts: [[-1, 0], [23, 0]], cor: 'madeira', larg: 8, dur: 0.5},
        {tipo: 'linha', pts: [[2, 0], [2, 3]], cor: 'navy', larg: 10, atraso: 0.3}, {tipo: 'texto', x: 2, y: 3.8, t: 'POSTE', tam: 44}]},
      {bloco: 1, gatilho: 'sombra', itens: [{tipo: 'poligono', pts: [[2, 0], [4, 0], [2, 3]], fundo: 'cinza_claro'},
        {tipo: 'linha', pts: [[2, 3], [4, 0]], cor: 'amarelo', larg: 6, tracejado: true}]},
      {bloco: 2, gatilho: 'três', itens: [{tipo: 'cota', de: [1.2, 0], ate: [1.2, 3], t: '3 m', lado: 'esq'}]},
      {bloco: 2, gatilho: 'dois', itens: [{tipo: 'cota', de: [2, -0.8], ate: [4, -0.8], t: '2 m', lado: 'baixo'}]},
      {bloco: 3, gatilho: 'prédio', vista: [-2, -3, 36, 30], itens: [{tipo: 'ret', x: 12, y: 0, w: 4, h: 27, fundo: 'azul_claro', cor: 'navy'},
        {tipo: 'cota', de: [16, -1.5], ate: [34, -1.5], t: '18 m', lado: 'baixo', atraso: 0.6}, {tipo: 'linha', pts: [[16, 27], [34, 0]], cor: 'amarelo', larg: 6, tracejado: true, atraso: 0.6}]},
      {bloco: 4, gatilho: 'mesmo', itens: [{tipo: 'poligono', pts: [[16, 0], [34, 0], [16, 27]], fundo: 'laranja_claro', cor: 'laranja', larg: 6, pisca: true}]},
      {bloco: 4, gatilho: 'seis', itens: [{tipo: 'texto', x: 26, y: 18, t: '× 9', tam: 64, cor: 'laranja', pisca: true}]},
      {bloco: 5, gatilho: 'vinte', itens: [{tipo: 'cota', de: [11, 0], ate: [11, 27], t: 'h = 27', lado: 'esq', cor: 'laranja', pisca: true}]}],
      contas: [{bloco: 4, conta: '18 ÷ 2 = 9'}, {bloco: 5, conta: 'h = 3 × 9 = 27 m'}]};
    // exemplos bons por tipo de questão (o mais parecido com a questão vai como modelo; tipo diferente = sombra)
    const EXEMPLOS = {"semelhanca": null, "reflexao": {"vb": [-40, -30, 270, 245], "camadas": [{"bloco": 1, "gatilho": "", "itens": [{"tipo": "ret", "x": -9, "y": -9, "w": 224, "h": 224, "fundo": "madeira"}, {"tipo": "ret", "x": 0, "y": 0, "w": 206, "h": 206, "fundo": "mesa"}, {"tipo": "bola", "x": 103, "y": 143, "r": 6, "fundo": "branco", "atraso": 0.3}, {"tipo": "bola", "x": 103, "y": 200, "r": 6, "fundo": "amarelo", "atraso": 0.6}]}, {"bloco": 1, "gatilho": "três", "sai": "reta", "saiBloco": 4, "itens": [{"tipo": "linha", "pts": [[103, 143], [203, 58], [138.3, 3], [3, 118], [103, 200]], "cor": "branco", "larg": 7, "tracejado": true, "seta": true, "dur": 2.2}]}, {"bloco": 2, "gatilho": "branca", "itens": [{"tipo": "texto", "x": 103, "y": 168, "t": "BRANCA", "tam": 44}]}, {"bloco": 2, "gatilho": "amarela", "itens": [{"tipo": "texto", "x": 103, "y": 225, "t": "AMARELA", "tam": 44}]}, {"bloco": 2, "gatilho": "esse d", "sai": "58", "saiBloco": 7, "itens": [{"tipo": "cota", "de": [225, 0], "ate": [225, 58], "t": "d = ?", "lado": "dir", "cor": "laranja", "pisca": true}]}, {"bloco": 3, "gatilho": "espelho", "itens": [{"tipo": "texto", "x": 186, "y": 76, "t": "α", "tam": 50, "cor": "laranja", "pisca": true}, {"tipo": "texto", "x": 186, "y": 40, "t": "α", "tam": 50, "cor": "laranja", "pisca": true, "atraso": 0.3}], "sai": "E", "saiBloco": 7}, {"bloco": 3, "gatilho": "reflete", "vista": [-25, -225, 640, 240], "itens": [{"tipo": "ret", "x": 203, "y": 3, "w": 200, "h": 200, "fundo": "#2E8B5766", "cor": "#7A4A2299", "larg": 4, "atraso": 0.5, "dur": 0.5}, {"tipo": "ret", "x": 203, "y": -197, "w": 200, "h": 200, "fundo": "#2E8B5766", "cor": "#7A4A2299", "larg": 4, "atraso": 1.0, "dur": 0.5}, {"tipo": "ret", "x": 403, "y": -197, "w": 200, "h": 200, "fundo": "#2E8B5766", "cor": "#7A4A2299", "larg": 4, "atraso": 1.5, "dur": 0.5}, {"tipo": "bola", "x": 503, "y": -194, "r": 6, "fundo": "#FFC928AA", "atraso": 1.9}], "sai": "E", "saiBloco": 7}, {"bloco": 4, "gatilho": "reta", "itens": [{"tipo": "linha", "pts": [[103, 143], [503, -194]], "cor": "laranja", "larg": 10, "seta": true, "dur": 1.4, "pisca": true}]}, {"bloco": 5, "gatilho": "400", "itens": [{"tipo": "cota", "de": [103, 143], "ate": [503, 143], "t": "400", "lado": "cima", "cor": "navy"}], "sai": "E", "saiBloco": 7}, {"bloco": 5, "gatilho": "340", "itens": [{"tipo": "cota", "de": [503, 143], "ate": [503, -194], "t": "340", "lado": "dir", "cor": "navy"}], "sai": "E", "saiBloco": 7}, {"bloco": 6, "gatilho": "100", "itens": [{"tipo": "poligono", "pts": [[103, 143], [203, 143], [203, 58]], "fundo": "#FF7A0066", "cor": "laranja", "larg": 5, "pisca": true}, {"tipo": "texto", "x": 153, "y": 112, "t": "100", "tam": 50, "cor": "laranja"}]}, {"bloco": 6, "gatilho": "85", "itens": [{"tipo": "texto", "x": 222, "y": 100, "t": "85", "tam": 50, "cor": "laranja", "ancora": "esq", "pisca": true}]}, {"bloco": 7, "gatilho": "", "vista": [-60, -30, 300, 245], "itens": []}, {"bloco": 7, "gatilho": "143", "itens": [{"tipo": "cota", "de": [-22, 0], "ate": [-22, 143], "t": "143", "lado": "esq", "cor": "azul"}]}, {"bloco": 7, "gatilho": "58", "itens": [{"tipo": "cota", "de": [225, 0], "ate": [225, 58], "t": "d = 58", "lado": "dir", "cor": "laranja", "pisca": true}]}], "contas": [{"bloco": 6, "conta": "340 ÷ 4 = 85"}, {"bloco": 7, "conta": "d = 143 − 85 = 58"}]}, "pitagoras": {"vb": [-1.5, -1, 6, 5.5], "camadas": [{"bloco": 1, "gatilho": "", "itens": [{"tipo": "linha", "pts": [[-0.5, 0], [5.5, 0]], "cor": "madeira", "larg": 8, "dur": 0.5}, {"tipo": "ret", "x": -0.5, "y": 0, "w": 0.5, "h": 5, "fundo": "cinza_claro", "cor": "navy", "larg": 4}, {"tipo": "texto", "x": -0.25, "y": 5.3, "t": "MURO", "tam": 44}]}, {"bloco": 1, "gatilho": "escada", "itens": [{"tipo": "linha", "pts": [[3, 0], [0, 4]], "cor": "navy", "larg": 11}]}, {"bloco": 2, "gatilho": "pé", "itens": [{"tipo": "cota", "de": [0, -0.45], "ate": [3, -0.45], "t": "3 m", "lado": "baixo"}]}, {"bloco": 2, "gatilho": "cinco", "itens": [{"tipo": "texto", "x": 2, "y": 2.4, "t": "5 m", "tam": 56}]}, {"bloco": 3, "gatilho": "altura", "itens": [{"tipo": "cota", "de": [-0.9, 0], "ate": [-0.9, 4], "t": "h = ?", "lado": "esq", "cor": "laranja", "pisca": true}]}, {"bloco": 3, "gatilho": "quatro", "itens": [{"tipo": "cota", "de": [-0.9, 0], "ate": [-0.9, 4], "t": "h = 4", "lado": "esq", "cor": "laranja"}]}, {"bloco": 4, "gatilho": "escorrega", "apaga": ["escada", "pé", "cinco"], "itens": [{"tipo": "linha", "pts": [[4, 0], [0, 3]], "cor": "laranja", "larg": 11, "pisca": true}, {"tipo": "cota", "de": [0, -0.45], "ate": [4, -0.45], "t": "4 m", "lado": "baixo", "atraso": 0.6}]}, {"bloco": 5, "gatilho": "três", "itens": [{"tipo": "cota", "de": [0.45, 0], "ate": [0.45, 3], "t": "3", "lado": "dir", "cor": "azul"}]}, {"bloco": 6, "gatilho": "desceu", "itens": [{"tipo": "cota", "de": [0.45, 3], "ate": [0.45, 4], "t": "1 m", "lado": "dir", "cor": "vermelho", "pisca": true}]}], "contas": [{"bloco": 3, "conta": "3² + h² = 5² → h = 4"}, {"bloco": 5, "conta": "4² + h² = 5² → h = 3"}, {"bloco": 6, "conta": "4 − 3 = 1 m"}]}, "funcao": {"vb": [-1.5, -2, 5.5, 5], "camadas": [{"bloco": 1, "gatilho": "", "itens": [{"tipo": "linha", "pts": [[-1, 0], [5, 0]], "cor": "navy", "larg": 4, "seta": true, "dur": 0.5}, {"tipo": "linha", "pts": [[0, -1.6], [0, 4.6]], "cor": "navy", "larg": 4, "seta": true, "dur": 0.5}, {"tipo": "texto", "x": 5.1, "y": -0.45, "t": "x", "tam": 48}, {"tipo": "texto", "x": 0.35, "y": 4.6, "t": "y", "tam": 48}]}, {"bloco": 2, "gatilho": "parábola", "itens": [{"tipo": "linha", "pts": [[-0.2, 3.84], [0.2, 2.24], [0.6, 0.96], [1.0, 0.0], [1.4, -0.64], [1.8, -0.96], [2.2, -0.96], [2.6, -0.64], [3.0, 0.0], [3.4, 0.96], [3.8, 2.24], [4.2, 3.84]], "cor": "azul", "larg": 8, "dur": 1.6}]}, {"bloco": 3, "gatilho": "raízes", "itens": [{"tipo": "bola", "x": 1, "y": 0, "r": 0.12, "fundo": "laranja", "pisca": true}, {"tipo": "bola", "x": 3, "y": 0, "r": 0.12, "fundo": "laranja", "pisca": true, "atraso": 0.4}, {"tipo": "texto", "x": 1, "y": 0.55, "t": "1", "tam": 52, "cor": "laranja"}, {"tipo": "texto", "x": 3, "y": 0.55, "t": "3", "tam": 52, "cor": "laranja", "atraso": 0.4}]}, {"bloco": 4, "gatilho": "vértice", "itens": [{"tipo": "linha", "pts": [[2, 0], [2, -1]], "cor": "cinza", "larg": 4, "tracejado": true}, {"tipo": "bola", "x": 2, "y": -1, "r": 0.12, "fundo": "laranja", "pisca": true}, {"tipo": "texto", "x": 2, "y": -1.6, "t": "V(2, −1)", "tam": 52, "cor": "laranja"}]}], "contas": [{"bloco": 3, "conta": "x² − 4x + 3 = 0 → x = 1 ou 3"}, {"bloco": 4, "conta": "xv = (1 + 3) ÷ 2 = 2"}]}};
    const txt = (tema + ' ' + enunciado + ' ' + textoBlocos).toLowerCase();
    const tipoEx = /bilhar|sinuca|reflex|espelh|rebat|tabela da|desdobr/.test(txt) ? 'reflexao'
      : /fun[cç][aã]o|gr[aá]fico|par[aá]bola|plano cartesiano|v[eé]rtice|ra[ií]zes|eixo/.test(txt) ? 'funcao'
      : /escada|pit[aá]goras|hipotenusa|tri[aâ]ngulo ret|cateto/.test(txt) ? 'pitagoras' : 'semelhanca';
    const exemplo = EXEMPLOS[tipoEx] || exSombra;
    const pedidoFinal = pedido + `
- Responda SÓ o JSON, compacto, neste formato. Exemplo de OUTRO problema, no padrão de qualidade que o professor aprovou
  (copie o ESTILO: poucas coisas na tela, uma ideia por camada, cores, cotas, o que entra e o que sai; NÃO copie os números):
${JSON.stringify(exemplo)}
- Em cada item, ponha SÓ os campos que ele usa. Números com no máximo 1 casa decimal. No máximo 6 itens por camada.`;
    let r = null, erro = null;
    for (let tent = 0; tent < 2 && !r; tent++) {
      try {
        r = await chamarGemini(JSON.stringify({contents: [{parts: [...imagens, {text: (imagens.length ? `ACIMA ESTÁ A PÁGINA ORIGINAL DA QUESTÃO.
Copie a DISPOSIÇÃO da figura original: o que está à direita fica à direita, o que está em cima fica em cima, a mesma orientação,
os mesmos rótulos e a mesma ordem dos acontecimentos. A figura animada é a figura da prova ganhando vida, não uma figura nova.

` : '') + pedidoFinal}]}],
          generationConfig: {responseMimeType: 'application/json', temperature: 0.3, maxOutputTokens: 16000}}), t => avisar('📐 ' + t));
        if (!r || !Array.isArray(r.vb) || r.vb.length !== 4 || !Array.isArray(r.camadas) || !r.camadas.length) throw new Error('a figura veio incompleta');
      } catch (e) { r = null; erro = e; if (tent === 0) avisar('📐 A resposta veio com defeito; pedindo de novo…'); }
    }
    if (!r) throw erro;
    const limpa = o => { for (const [x, v] of Object.entries(o)) if (v === '' || v === 0 && x === 'saiBloco' || (Array.isArray(v) && !v.length)) delete o[x]; return o; };
    return {figura: {vb: r.vb, camadas: (r.camadas || []).map(cm => { limpa(cm); cm.itens = (cm.itens || []).map(limpa); return cm; })}, contas: r.contas || []};
  }
  async function desenharFiguraIA() {
    if (!chave()) return alert('Para desenhar com IA, cole a chave do Gemini na ⚙️.');
    if (blocos.some((_, k) => !takes()[k])) return alert('Grave todos os blocos antes.');
    const enunciado = window.prompt('Cole o enunciado da questão (com as medidas da figura). Pode deixar em branco: a IA usa só o que você falou.', item.enunciado || '');
    if (enunciado === null) return;
    item.enunciado = enunciado.trim();
    pararPrevia(); ocupado = true;
    if (opcoes().legendaVoz) {
      const faltam = blocos.map((_, k) => k).filter(k => !takes()[k].transcricao);
      for (const [n, k] of faltam.entries()) {
        aviso(`Ouvindo a sua voz… (${n + 1} de ${faltam.length})`);
        if (transcrevendo.has(k)) while (transcrevendo.has(k)) await espera(300); else await transcreverFundo(k);
      }
    }
    aviso('📐 A IA está desenhando a figura…');
    const textoBlocos = blocos.map((b, k) => `Bloco ${k + 1}: "${palavrasDe(k).map(p => p.w).join(' ')}"`).join('\n');
    const r = await pedirFigura(item.conteudo.tema, item.enunciado, textoBlocos, aviso);
    item.figura = r.figura;
    cacheTemposFig.clear();
    const usados = new Set(item.figura.camadas.map(cm => (cm.bloco || 1) - 1));
    blocos.forEach((_, k) => { if (usados.has(k) || (k > 0 && est(k - 1).layout === 'figura' && k < blocos.length - 1)) est(k).layout = 'figura'; });
    for (const x of r.contas || []) if (x.bloco >= 1 && x.bloco <= blocos.length) setTexto(x.bloco - 1, 'quadro', String(x.conta).slice(0, 40));
    await salvar(item);
    aviso(''); ocupado = false;
    selecionar(sel);
  }
  async function desfazerIA() {
    const a = item.antesIA; if (!a) return;
    item.estilo = a.estilo; item.conteudo.texto_capa = a.texto_capa; item.conteudo.gancho_quadro = a.gancho_quadro;
    a.blocos.forEach((b, n) => { if (item.conteudo.blocos[n]) Object.assign(item.conteudo.blocos[n], b); });
    delete item.antesIA; blocos = montarBlocos(item);
    await salvar(item); selecionar(sel);
  }

  /* ---------------------------------------------------------------- ↶ desfazer / ↷ refazer
     Cada vez que o editor guarda uma alteração, a "foto" anterior vai para a pilha. Vídeos, áudios e imagens (Blob)
     entram por referência (não duplica memória); o resto é copiado em JSON. */
  const HIST_MAX = 60;
  let hist = {antes: [], depois: [], atual: null};
  const idBlob = new WeakMap(); let nBlob = 0;
  function foto() {
    blocos.forEach((_, k) => est(k));  // completa os padrões antes (senão abrir um bloco já pareceria uma alteração)
    const blobs = {};
    const s = JSON.stringify({estilo: item.estilo || [], conteudo: item.conteudo, edicao: item.edicao || {}, takes: takes(),
      musica: item.musica || null, musicaNome: item.musicaNome || null, clipes: item.clipes || {}, antesIA: item.antesIA || null, montouIA: !!item.montouIA, figura: item.figura || null},
    (k, v) => {
      if (v instanceof Blob) { if (!idBlob.has(v)) idBlob.set(v, ++nBlob); const id = idBlob.get(v); blobs[id] = v; return {__blob: id}; }
      return v;
    });
    return {s, blobs};
  }
  function zerarHist() { hist = {antes: [], depois: [], atual: foto()}; botoesHist(); }
  function anotarHist() {  // chamada antes de cada salvar: se algo mudou desde a última foto, vira um passo
    if (!hist.atual) return zerarHist();
    const f = foto();
    if (f.s === hist.atual.s) return;
    hist.antes.push(hist.atual); if (hist.antes.length > HIST_MAX) hist.antes.shift();
    hist.atual = f; hist.depois = [];
    botoesHist();
  }
  function botoesHist() {
    if (!ui) return;
    g('edesf').disabled = !hist.antes.length; g('erefaz').disabled = !hist.depois.length;
  }
  function aplicarFoto(f) {
    const d = JSON.parse(f.s, (k, v) => v && typeof v === 'object' && v.__blob ? f.blobs[v.__blob] : v);
    const tAgora = takes();
    // a legenda feita pela voz não é alteração sua: se a foto é de antes dela, a legenda continua
    d.takes.forEach((c, n) => {
      const a = tAgora[n];
      if (c && a && a.blob === c.blob && !(c.transcricao && c.transcricao.length) && a.transcricao && a.transcricao.length) c.transcricao = a.transcricao;
    });
    item.estilo = d.estilo; item.conteudo = d.conteudo;
    const op = item.edicao || (item.edicao = {});  // mesmo objeto (outras partes guardam a referência)
    for (const k of Object.keys(op)) delete op[k];
    Object.assign(op, d.edicao);
    tAgora.length = 0; tAgora.push(...d.takes);
    if (d.musica) { item.musica = d.musica; item.musicaNome = d.musicaNome; } else { delete item.musica; delete item.musicaNome; }
    item.clipes = d.clipes;
    if (d.antesIA) item.antesIA = d.antesIA; else delete item.antesIA;
    item.montouIA = d.montouIA;
    if (d.figura) item.figura = d.figura; else delete item.figura;
    blocos = montarBlocos(item);
  }
  async function voltarHist(dir) {
    if (ocupado || gravando) return;
    anotarHist();  // o que foi mexido e ainda não guardado (ex.: texto sendo digitado) também conta
    const de = dir < 0 ? hist.antes : hist.depois, para = dir < 0 ? hist.depois : hist.antes;
    if (!de.length) return;
    pararPrevia();
    para.push(hist.atual);
    hist.atual = de.pop();
    aplicarFoto(hist.atual);
    hist.atual = foto();  // refaz a foto (a legenda pela voz pode ter sido mantida)
    try { await salvarBruto(item); } catch (e) { alert('Não consegui guardar: ' + e.message); }
    botoesHist();
    sel = Math.min(sel, blocos.length - 1);
    selecionar(sel);
  }

  /* ---------------------------------------------------------------- modo EDITAR */
  const quadros = new Map();  // vídeo de cada take só para mostrar um quadro parado (sem som)
  let tQuadro = 0;  // instante do take mostrado parado na prévia
  async function mostrarQuadro(k, t) {
    const c = takes()[k]; if (!c) return;
    await carregarMascote();
    let v = quadros.get(k);
    if (!v || v.dataset.blob !== String(c.blob.size)) {
      if (v) soltar(v);
      v = await abrirVideo(c.blob); v.muted = true; v.dataset.blob = String(c.blob.size); quadros.set(k, v);
    }
    const alvoT = t == null ? c.ini + Math.min(0.8, (c.fim - c.ini) / 2) : t;  // depois da entrada animada
    await irAoTempo(v, alvoT);
    if (tocando) return;
    const dec = antes(k) + Math.max(0, alvoT - c.ini) / vel(c);
    await carregarFigs();
    if (tocando) return;
    tQuadro = alvoT; marcarSel = true; revelarTudo = t == null;  // quadro parado ao abrir o bloco: conta inteira, para conferir
    try { desenhar(g('ecanvas').getContext('2d'), v, k, gruposDe(k), alvoT, dec, totalDur()); }
    finally { marcarSel = false; revelarTudo = false; }
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
    ['visual', '🎨', 'Layout'], ['figuras', '🖼️', 'Figuras'], ['efeitos', '✨', 'Efeitos'], ['som', '🎵', 'Som']];
  const EMOJIS = ['🔥', '✅', '❌', '⚠️', '💡', '🤯', '😱', '👉', '👆', '🎯', '💯', '🧠', '📌', '⏱️', '➕', '➖', '✖️', '➗', '🟰', '❓'];
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
    botoesHist();
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
    p.innerHTML = `<label class="echeck eseco" ${c.soVoz ? 'hidden' : ''}><input id="eseco" type="checkbox" ${op.seco ? 'checked' : ''}>
        <span><b>🎬 Vídeo seco</b> — só os cortes, sem título, legenda, mascote nem efeitos (vale para o vídeo todo)</span></label>
      <h4>Bloco ${k + 1} <span>${b.gancho ? 'GANCHO' : esc(CENA[b.cena] || b.cena)}</span></h4>
      <div class="ebot eiab"><button id="eia">✨ Montar com IA <small>(cena, mascote e figuras pela sua fala)</small></button>
        ${item.antesIA ? '<button id="eiadesf" style="flex:0 0 96px">↩ Desfazer</button>' : ''}</div>
      <p id="esecoaviso" class="eaviso2" ${op.seco ? '' : 'hidden'}>No vídeo seco só valem o corte, a velocidade e o som da voz. O resto fica guardado para quando você desligar.</p>
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
      <label>Layout deste bloco${c.soVoz ? ' <small>(gravado só com a voz: layouts sem câmera)</small>' : ''}</label>
      <div class="ebot" style="flex-wrap:wrap">${Object.keys(LAYOUTS).filter(x => !c.soVoz || SEM_CAMERA.includes(x)).map(x => `<button data-l="${x}" style="flex:1 0 30%">${LAYOUTS[x]}</button>`).join('')}</div>
      <div id="eescalaw" hidden><label>Sequência do zoom <small>(do menor para o maior; toque num item para tirar)</small></label>
      <div id="ecadeia" class="ebot" style="flex-wrap:wrap"></div>
      <div class="ebot"><button id="ecdes">＋ Desenho</button><button id="ecemo">＋ Emoji</button><button id="ecpad">↺ Casa → galáxia</button></div>
      <div class="ebot"><button data-se="sai">🔭 Afastando</button><button data-se="entra">🔬 Aproximando</button></div></div>
      <div id="eclipew" hidden><label>Vídeo de apoio <small>(Pexels/Pixabay, grátis; em inglês acha mais)</small></label>
      <div class="ebusca"><input id="ecbusca" type="search" placeholder="ex.: earth from space, money, traffic"><button id="ecachar">Buscar</button></div>
      <div id="eclipes"></div><small id="ecred"></small></div>
      <div id="efigw" hidden><label>📐 Figura animada <small>(uma figura para o vídeo todo; cada parte entra quando você fala a palavra dela)</small></label>
      <div class="ebot"><button id="efigia">✨ Desenhar a figura com IA</button></div>
      <div class="ebot"><button id="efigx">↔ Espelhar (esquerda/direita)</button><button id="efigy">↕ Espelhar (cima/baixo)</button></div>
      <div id="efiginfo" style="font-size:13px;line-height:1.45"></div>
      <details style="margin-top:8px"><summary style="font-size:13px">Editar à mão (avançado)</summary>
      <textarea id="efigjson" spellcheck="false" style="min-height:220px;font:12px/1.35 monospace"></textarea>
      <div class="ebot"><button id="efigok">Aplicar</button></div></details></div>
      <label class="echeck"><input id="ecanto" type="checkbox" ${est(k).mascoteCanto ? 'checked' : ''}> 🦸 Mascote no canto (em qualquer layout)</label>
      <div id="eposew"><label>Pose do mascote</label>
      <div class="ebot" style="flex-wrap:wrap">${Object.keys(POSES).map(x => `<button data-po="${x}" style="flex:1 0 22%;font-size:12px">${POSES[x]}</button>`).join('')}</div>
      <label class="echeck"><input id="etroca" type="checkbox" ${est(k).trocaPose ? 'checked' : ''}> Trocar de pose a cada frase</label>
      <label>Tamanho do mascote <b id="vtamm"></b></label><input id="etamm" type="range" min="0.5" max="1.4" step="0.05" value="${est(k).tamMascote}">
      <div class="ebot"><button data-lm="esq">◀ Esquerda</button><button data-lm="dir">Direita ▶</button></div>
      <label>Como o mascote entra</label>
      <div class="ebot">${Object.entries({pulo: 'Pulando', desliza: 'Deslizando', gira: 'Girando', nenhuma: 'Parado'}).map(([x, n]) => `<button data-em="${x}">${n}</button>`).join('')}</div></div>
      <div id="econtaw"><label for="econta">Conta / texto grande (vai na lousa nos layouts do mascote)</label><input id="econta" type="text" value="${esc(b.quadro || '')}" placeholder="ex.: 8% de 25 = 25% de 8"><label class="echeck"><input id="eanimc" type="checkbox" ${est(k).animConta ? 'checked' : ''}> ✍️ Conta vai aparecendo junto com a fala</label></div>
      </div>
      <div class="eaba" data-aba="figuras">
      <label>Pôr na tela <small>(toque num emoji)</small></label>
      <div class="ebot efemo" style="flex-wrap:wrap">${EMOJIS.map(x => `<button data-emo="${x}">${x}</button>`).join('')}</div>
      <div class="ebot"><button id="efoutro">😀 Outro emoji</button><button id="efdes">🎨 Desenho</button><button id="efimg">📷 Imagem</button></div>
      <div class="ebot"><button id="effoto">📸 Foto real <small>(pessoa, lugar, fato)</small></button><button id="efcheia">🖼️ Imagem em tela cheia</button></div>
      <input id="efarq" type="file" accept="image/*" hidden>
      <div id="eflista"></div>
      <div id="efcfg"></div>
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
      <label class="echeck"><input id="evoz" type="checkbox" ${op.voz ? 'checked' : ''}> 🎙 Melhorar voz (tira ruído e eco)</label>
      <div class="ebot" id="elimpw"><button data-limp="normal">Natural</button><button data-limp="forte">Forte (muito eco)</button></div>
      <label>🎵 Música de fundo</label>
      <div class="ebot"><button id="emus">${item.musica ? '🎵 ' + esc(item.musicaNome || 'música') : 'Escolher música do celular'}</button>
        ${item.musica ? '<button id="emusx" style="flex:0 0 52px">✕</button>' : ''}</div>
      ${item.musica ? `<label>Volume da música <b id="vmus"></b></label><input id="evolm" type="range" min="0" max="0.6" step="0.01" value="${op.volMusica}">` : ''}
      <input id="earq" type="file" accept="audio/*" hidden>
      <div class="ebot" style="margin-top:22px"><button id="etudo" style="color:#b00;border-color:#e8b4b4 !important">🔁 Regravar tudo do início</button></div>
      </div>`;
    mostrarAba();
    const aplicarSeco = () => {
      g('eexportar').textContent = op.seco ? '⬇ Exportar vídeo seco' : '⬇ Exportar vídeo';
      g('esecoaviso').hidden = !op.seco;
      g('epainel').querySelectorAll('.eaba:not([data-aba="cortar"])').forEach(d => d.classList.toggle('apagada', !!op.seco));
    };
    aplicarSeco();
    configurarFiguras(k, c);
    g('eia').onclick = () => montarComIA().catch(e2 => { aviso(''); ocupado = false; alert('A IA não conseguiu montar agora: ' + e2.message); });
    if (g('eiadesf')) g('eiadesf').onclick = desfazerIA;
    g('eseco').onchange = () => { op.seco = g('eseco').checked; salvar(item).catch(() => {}); aplicarSeco(); mostrarQuadro(k); };
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
      const txt = g('efala').value;
      const daVoz = c.transcricao && c.transcricao.length;
      if (daVoz) c.transcricao = retemporizar(c, txt);
      if (txt.trim() || !daVoz) setTexto(k, 'fala', txt.trim());  // o texto corrigido é também o que se lê ao regravar
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
    const marcarLimpeza = () => {
      g('elimpw').hidden = !op.voz;
      g('elimpw').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.limp === op.limpeza));
    };
    marcarLimpeza();
    g('evoz').onchange = () => { op.voz = g('evoz').checked; marcarLimpeza(); guardar(); };
    g('elimpw').querySelectorAll('button').forEach(b => b.onclick = () => { op.limpeza = b.dataset.limp; marcarLimpeza(); guardar(); });
    g('elvoz').onchange = () => { op.legendaVoz = g('elvoz').checked; guardar(); mostrarQuadro(k); };
    const e = est(k);
    const marcar = (attr, valor) => ui.querySelectorAll(`[data-${attr}]`).forEach(x => x.classList.toggle('on', x.dataset[attr] === valor));
    const opcao = (attr, campo, depois) => {
      marcar(attr, String(e[campo]));
      ui.querySelectorAll(`[data-${attr}]`).forEach(x => x.onclick = () => {
        e[campo] = x.dataset[attr]; marcar(attr, e[campo]); guardar(); if (depois) depois(); mostrarQuadro(k);
      });
    };
    const mostrarConta = () => {
      g('econtaw').hidden = !COM_TEXTO.includes(e.layout);
      g('eposew').hidden = !(COM_MASCOTE.includes(e.layout) || e.mascoteCanto);
      est(k);  // cria a sequência padrão do zoom, se for o caso
      g('eescalaw').hidden = e.layout !== 'escala'; g('eclipew').hidden = e.layout !== 'clipe'; g('efigw').hidden = e.layout !== 'figura';
      if (e.layout === 'escala') mostrarCadeia();
      if (e.layout === 'figura') mostrarFig();
      if (e.layout === 'clipe') mostrarCredito();
    };
    const mostrarFig = () => {
      const cs = camadasFig().filter(cm => (cm.bloco || 1) - 1 === k);
      g('efiginfo').innerHTML = !item.figura ? 'Ainda não tem figura. Toque em ✨ para a IA desenhar pelo que você falou (dá para colar o enunciado da questão).'
        : cs.length ? `Neste bloco entram ${cs.length} parte(s): ` + cs.map(cm => `<b>${esc(cm.gatilho || 'no começo')}</b>` + (cm.vista ? ' 🎥' : '')).join(' → ')
        : 'Neste bloco a figura fica como estava (nenhuma parte nova).';
      if (document.activeElement !== g('efigjson')) g('efigjson').value = item.figura ? JSON.stringify(item.figura, null, 1) : '';
    };
    g('efigia').onclick = () => desenharFiguraIA().then(() => { mostrarFig(); previa([k]); })
      .catch(err => { aviso(''); ocupado = false; alert('A IA não conseguiu desenhar agora: ' + err.message); });
    const espelhar = async eixo => {
      if (!item.figura) return alert('Ainda não tem figura.');
      item.figura = espelharFigura(item.figura, eixo); cacheTemposFig.clear();
      await salvar(item); mostrarFig(); previa([k]);
    };
    g('efigx').onclick = () => espelhar('x');
    g('efigy').onclick = () => espelhar('y');
    g('efigok').onclick = async () => {
      let f;
      try { f = JSON.parse(g('efigjson').value); if (!f.vb || !Array.isArray(f.camadas)) throw new Error('falta "vb" ou "camadas"'); }
      catch (err) { return alert('O texto não está no formato certo: ' + err.message); }
      item.figura = f; cacheTemposFig.clear(); await salvar(item); mostrarFig(); previa([k]);
    };
    const mostrarCadeia = () => {
      g('ecadeia').innerHTML = e.escala.cadeia.map((x, n) => `<button data-cn="${n}">${x.tipo === 'emoji' ? esc(x.valor) : '🖼️'} ${esc(x.rotulo || x.valor)} ✕</button>`).join('') ||
        '<small>Nenhum item: ponha pelo menos dois.</small>';
      g('ecadeia').querySelectorAll('[data-cn]').forEach(b => b.onclick = () => { e.escala.cadeia.splice(Number(b.dataset.cn), 1); guardar(); mostrarCadeia(); mostrarQuadro(k); });
      ui.querySelectorAll('[data-se]').forEach(b => b.classList.toggle('on', b.dataset.se === e.escala.sentido));
    };
    const porNaCadeia = x => { const r = prompt('Nome que aparece na tela (ex.: CIDADE)', x.rotulo || ''); if (r === null) return; x.rotulo = r.trim().toUpperCase().slice(0, 20); e.escala.cadeia.push(x); guardar(); mostrarCadeia(); previa([k]); };
    g('ecdes').onclick = () => escolherDesenho(nome => porNaCadeia({tipo: 'desenho', valor: nome, rotulo: nome.replace(/-/g, ' ').toUpperCase()}));
    g('ecemo').onclick = () => { const em = (prompt('Cole um emoji (ex.: 🌎)') || '').trim(); if (em) porNaCadeia({tipo: 'emoji', valor: [...em].slice(0, 2).join(''), rotulo: ''}); };
    g('ecpad').onclick = () => { e.escala.cadeia = cadeiaPadrao(); guardar(); mostrarCadeia(); previa([k]); };
    ui.querySelectorAll('[data-se]').forEach(b => b.onclick = () => { e.escala.sentido = b.dataset.se; guardar(); mostrarCadeia(); previa([k]); });
    const mostrarCredito = () => {
      const cl = e.clipe;
      g('ecred').innerHTML = cl ? `Escolhido: vídeo de ${esc(cl.autor || 'autor')} no ${esc(cl.fonte)} (“${esc(cl.termo || '')}”).` : 'Busque e toque num vídeo para usar neste bloco.';
      if (cl && !g('ecbusca').value) g('ecbusca').value = cl.termo || '';
    };
    g('ecachar').onclick = async () => {
      const termo = g('ecbusca').value.trim(); if (!termo) return g('ecbusca').focus();
      g('eclipes').innerHTML = '<small>Buscando…</small>';
      let lista;
      try { lista = await buscarClipes(termo); } catch (err) { g('eclipes').innerHTML = ''; return alert('Não deu para buscar: ' + err.message); }
      g('eclipes').innerHTML = lista.map((x, n) => `<button data-cl="${n}" class="${e.clipe && e.clipe.id === x.id ? 'on' : ''}"><img src="${esc(x.capa || '')}" alt="" loading="lazy"><small>${Math.round(x.dur || 0)} s</small></button>`).join('') ||
        '<small>Nada encontrado. Tente outras palavras (em inglês costuma achar mais).</small>';
      g('eclipes').querySelectorAll('[data-cl]').forEach(b => b.onclick = async () => {
        aviso('Baixando o vídeo de apoio…');
        try { await baixarClipe(e, lista[Number(b.dataset.cl)], termo); await guardar(); }
        catch (err) { aviso(''); return alert('Não deu: ' + err.message); }
        aviso('');
        g('eclipes').querySelectorAll('[data-cl]').forEach(x => x.classList.toggle('on', x === b));
        mostrarCredito(); mostrarQuadro(k);
      });
    };
    g('ecbusca').onkeydown = ev => { if (ev.key === 'Enter') g('ecachar').click(); };
    opcao('tc', 'corTitulo'); opcao('tt', 'tamTitulo'); opcao('tp', 'posTitulo'); opcao('l', 'layout', mostrarConta); opcao('po', 'pose');
    opcao('lm', 'ladoMascote'); opcao('em', 'entradaMascote', () => previa([k]));
    g('ecanto').onchange = () => { e.mascoteCanto = g('ecanto').checked; guardar(); mostrarConta(); mostrarQuadro(k, c.ini + 0.8); };
    g('etroca').onchange = () => { e.trocaPose = g('etroca').checked; guardar(); };
    const mostrarTam = () => { g('vtamm').textContent = Math.round(e.tamMascote * 100) + '%'; };
    mostrarTam();
    g('etamm').oninput = () => { e.tamMascote = Number(g('etamm').value); mostrarTam(); mostrarQuadro(k, c.ini + 0.8); };
    g('etamm').onchange = guardar;
    mostrarConta();
    g('eanim').onchange = () => { e.animTitulo = g('eanim').checked; guardar(); };
    g('eanimc').onchange = () => { e.animConta = g('eanimc').checked; guardar(); previa([k]); };
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
    if (!opcoes().seco && opcoes().legenda && opcoes().legendaVoz && chave()) {
      const faltam = blocos.map((_, k) => k).filter(k => !takes()[k].transcricao);
      for (const [n, k] of faltam.entries()) {
        aviso(`Fazendo a legenda pela sua voz… (${n + 1} de ${faltam.length})`);
        if (transcrevendo.has(k)) while (transcrevendo.has(k)) await espera(300);
        else await transcreverFundo(k);
      }
    }
    falhouVoz = false;
    if (modoVoz()) for (const k of blocos.keys()) {  // tudo limpo antes de começar a montar
      aviso(`Limpando a sua voz… (${k + 1} de ${blocos.length})`);
      await vozLimpa(takes()[k], modoVoz()).catch(() => { falhouVoz = true; });
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
    item.videoDur = totalDur(); delete item.youtube;
    await salvar(item);
    aviso(''); ocupado = false;
    alert(`Vídeo pronto! ${Math.round(item.videoDur)} s. Ele aparece no roteiro, com o botão de compartilhar.${falhouVoz ? '\n⚠️ Não deu para limpar a voz neste aparelho: o som ficou como foi gravado.' : ''}`);
    fechar();
  }

  return {abrir, buscarClipes, pedirFigura, previaFigura, espelharFigura};
})();
