/* Editor do Estúdio: depois de gravar, corta o começo, o fim e trechos do meio e salva a versão final.
   O corte é feito sem refazer a imagem (copia os quadros do vídeo original), então é rápido e não perde qualidade.
   Um trecho só pode começar num "quadro-chave" (a gravação põe um a cada meio segundo): o editor ajusta sozinho. */
import {Input, BlobSource, ALL_FORMATS, EncodedPacketSink, CanvasSink, Output, Mp4OutputFormat, WebMOutputFormat,
  StreamTarget, BufferTarget, EncodedVideoPacketSource, EncodedAudioPacketSource} from './vendor/mediabunny.min.mjs';

const $ = (s, r = document) => r.querySelector(s);
const fmt = t => {
  t = Math.max(0, t || 0);
  const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = Math.floor(t % 60), d = Math.floor(t * 10 % 10);
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0') + '.' + d;
};

const CSS = `
#editor{position:fixed;inset:0;z-index:20;background:#0B1422;display:flex;flex-direction:column;color:#fff;font:14px/1.4 'Open Sans',system-ui,sans-serif}
#editor .topo{display:flex;align-items:center;gap:12px;padding:10px 16px;background:#0F1B2D;border-bottom:1px solid #24385A}
#editor h2{font:22px 'Anton',Impact,sans-serif;margin:0;letter-spacing:.5px}
#editor h2 span{color:#FF7A00}
#editor .nome{opacity:.75;font-size:13px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#editor .palco{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding:10px;position:relative}
#editor video{max-width:100%;max-height:100%;background:#000;border-radius:6px;box-shadow:0 0 0 1px #24385A}
#editor .cortado{position:absolute;top:18px;left:50%;transform:translateX(-50%);background:#c00;padding:4px 12px;border-radius:10px;font-weight:700;display:none}
#editor .linha{padding:8px 16px;background:#0F1B2D;border-top:1px solid #24385A}
#editor canvas.tl{width:100%;height:84px;display:block;cursor:pointer;border-radius:6px;touch-action:none}
#editor .botoes{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:8px}
#editor button{border:0;border-radius:10px;padding:8px 12px;cursor:pointer;font-weight:700;background:#24385A;color:#fff;font-size:13px}
#editor button.lar{background:#FF7A00}
#editor button.verm{background:#b3261e}
#editor button:disabled{opacity:.4;cursor:default}
#editor .tempo{font:20px 'Anton',Impact,sans-serif;letter-spacing:1px;min-width:190px}
#editor .esp{flex:1}
#editor .cortes{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;font-size:12px}
#editor .cortes span{background:#3a1d1d;border:1px solid #b3261e;border-radius:8px;padding:3px 4px 3px 8px;display:inline-flex;gap:6px;align-items:center}
#editor .cortes button{padding:1px 7px;background:#b3261e}
#editor .dica{font-size:12px;opacity:.7}
#editor .final{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
#editor label{display:flex;gap:6px;align-items:center;font-size:13px}
#editor label input{accent-color:#FF7A00;width:16px;height:16px}
#editor .barra{height:10px;background:#24385A;border-radius:6px;overflow:hidden;flex:1;min-width:160px;display:none}
#editor .barra i{display:block;height:100%;width:0;background:#FF7A00}
`;

const HTML = `
<div class="topo"><h2>EDITAR <span>GRAVAÇÃO</span></h2><span class="nome"></span>
  <button class="fechar">✕ Fechar sem editar</button></div>
<div class="palco"><video playsinline preload="auto"></video><div class="cortado">✂️ trecho cortado</div></div>
<div class="linha">
  <canvas class="tl"></canvas>
  <div class="botoes">
    <button class="play lar">▶ Tocar</button>
    <button class="volta" title="Voltar 5 s (←)">⏪ 5 s</button>
    <button class="avanca" title="Avançar 5 s (→)">5 s ⏩</button>
    <span class="tempo">0:00.0 / 0:00.0</span>
    <span class="esp"></span>
    <button class="comeco" title="Apaga do início do vídeo até onde está a agulha">✂️ Cortar o começo até aqui</button>
    <button class="marca lar" title="Marca o início do trecho a cortar; aperte de novo no fim do trecho (tecla C)">✂️ Início do corte</button>
    <button class="fim" title="Apaga daqui até o fim do vídeo">✂️ Cortar daqui até o fim</button>
    <button class="desfaz" title="Ctrl+Z">↶ Desfazer</button>
  </div>
  <div class="cortes"></div>
  <div class="dica">Clique na linha do tempo para ir até um ponto. Espaço toca e pausa; ← → andam 1 s (com Shift, 5 s); C marca o corte. Ao tocar, os trechos cortados já são pulados.</div>
</div>
<div class="linha final">
  <b class="durfinal"></b>
  <span class="esp"></span>
  <label><input type="checkbox" class="apagar" checked> Apagar a gravação original depois de salvar a editada</label>
  <div class="barra"><i></i></div>
  <button class="salvar lar">💾 Salvar vídeo editado</button>
</div>`;

export async function abrirEditor({arquivo, nome, pasta = null, handle = null, aoFechar = () => {}}) {
  if (!document.getElementById('editor-css')) {
    const st = document.createElement('style'); st.id = 'editor-css'; st.textContent = CSS; document.head.appendChild(st);
  }
  const el = document.createElement('div');
  el.id = 'editor'; el.innerHTML = HTML;
  document.body.appendChild(el);
  $('.nome', el).textContent = nome;
  const video = $('video', el), tl = $('canvas.tl', el), ctl = tl.getContext('2d');
  const url = URL.createObjectURL(arquivo);
  video.src = url;

  const input = new Input({source: new BlobSource(arquivo), formats: ALL_FORMATS});
  const vt = await input.getPrimaryVideoTrack(), at = await input.getPrimaryAudioTrack();
  if (!vt) { alert('Não consegui ler este vídeo.'); fechar(); return; }
  const dur = await input.computeDuration();
  const vsink = new EncodedPacketSink(vt);
  const ehMp4 = /mp4|m4v|mov/i.test(arquivo.type || nome);

  let cortes = [];   // [{a, b}] em segundos, já ajustados aos quadros-chave
  let marcaIni = null, historico = [];
  let fechado = false;

  /* miniaturas na linha do tempo */
  const miniaturas = [];
  (async () => {
    try {
      const n = 16, sink = new CanvasSink(vt, {width: 160, height: 90, fit: 'cover', poolSize: 0});
      const tempos = Array.from({length: n}, (_, i) => (i + .5) * dur / n);
      let i = 0;
      for await (const c of sink.canvasesAtTimestamps(tempos)) {
        if (fechado) return;
        miniaturas[i++] = c && c.canvas; desenhar();
      }
    } catch (e) { console.warn('miniaturas', e); }
  })();

  /* trecho cortado começa onde pediram; termina no próximo quadro-chave (o trecho seguinte só pode começar nele) */
  async function chaveDepois(t) {
    if (t >= dur - .05) return dur;
    const k = await vsink.getKeyPacket(t);
    if (k && Math.abs(k.timestamp - t) < .02) return k.timestamp;
    const prox = k ? await vsink.getNextKeyPacket(k) : await vsink.getFirstKeyPacket();
    return prox ? prox.timestamp : dur;
  }
  function juntar() {
    cortes.sort((x, y) => x.a - y.a);
    const r = [];
    for (const c of cortes) {
      if (c.b - c.a < .05) continue;
      const u = r[r.length - 1];
      if (u && c.a <= u.b + .01) u.b = Math.max(u.b, c.b); else r.push({...c});
    }
    cortes = r;
  }
  async function cortar(a, b) {
    if (b < a) [a, b] = [b, a];
    a = Math.max(0, a); b = Math.min(dur, b);
    historico.push(JSON.stringify(cortes));
    cortes.push({a, b: await chaveDepois(b)});
    juntar(); atualizar();
  }
  const sobra = () => dur - cortes.reduce((s, c) => s + (c.b - c.a), 0);

  function atualizar() {
    const box = $('.cortes', el);
    box.innerHTML = '';
    cortes.forEach((c, i) => {
      const s = document.createElement('span');
      s.innerHTML = `✂️ ${fmt(c.a)} → ${fmt(c.b)} <button title="Desfazer este corte">✕</button>`;
      s.querySelector('button').onclick = () => { historico.push(JSON.stringify(cortes)); cortes.splice(i, 1); atualizar(); };
      s.onclick = e => { if (e.target.tagName !== 'BUTTON') video.currentTime = Math.max(0, c.a - 2); };
      box.appendChild(s);
    });
    $('.marca', el).textContent = marcaIni == null ? '✂️ Início do corte' : `✂️ Fim do corte (começou em ${fmt(marcaIni)})`;
    $('.marca', el).classList.toggle('verm', marcaIni != null);
    $('.durfinal', el).textContent = cortes.length
      ? `Vídeo final: ${fmt(sobra())} (tirou ${fmt(dur - sobra())})` : `Vídeo: ${fmt(dur)} (nada cortado ainda)`;
    $('.salvar', el).disabled = !cortes.length || sobra() < .5;
    desenhar();
  }

  function desenhar() {
    const r = tl.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    if (tl.width !== Math.round(r.width * dpr)) { tl.width = Math.round(r.width * dpr); tl.height = Math.round(r.height * dpr); }
    const W = tl.width, H = tl.height, X = t => t / dur * W;
    ctl.fillStyle = '#15243A'; ctl.fillRect(0, 0, W, H);
    const n = 16, mw = W / n, ty = 14 * dpr, th = H - ty;
    for (let i = 0; i < n; i++) if (miniaturas[i]) ctl.drawImage(miniaturas[i], i * mw, ty, mw, th);
    ctl.fillStyle = '#0F1B2D'; ctl.fillRect(0, 0, W, ty);
    ctl.fillStyle = '#9fb0c8'; ctl.font = `${10 * dpr}px system-ui`;
    const passo = [5, 10, 30, 60, 120, 300, 600, 1200].find(p => dur / p < 14) || 1800;
    for (let t = 0; t < dur; t += passo) { ctl.fillRect(X(t), 0, 1, ty * .5); ctl.fillText(fmt(t).replace(/\.\d$/, ''), X(t) + 3, ty - 3 * dpr); }
    for (const c of cortes) {
      ctl.fillStyle = '#b3261ecc'; ctl.fillRect(X(c.a), ty, Math.max(2, X(c.b) - X(c.a)), th);
      ctl.strokeStyle = '#fff8'; ctl.lineWidth = dpr; ctl.beginPath();
      for (let x = X(c.a) - th; x < X(c.b); x += 8 * dpr) { ctl.moveTo(Math.max(x, X(c.a)), ty + Math.max(0, X(c.a) - x)); ctl.lineTo(Math.min(x + th, X(c.b)), ty + th - Math.max(0, x + th - X(c.b))); }
      ctl.stroke();
    }
    if (marcaIni != null) {
      const a = Math.min(marcaIni, video.currentTime), b = Math.max(marcaIni, video.currentTime);
      ctl.fillStyle = '#ff7a0055'; ctl.fillRect(X(a), ty, X(b) - X(a), th);
      ctl.fillStyle = '#FF7A00'; ctl.fillRect(X(marcaIni) - dpr, ty, 2 * dpr, th);
    }
    const x = X(video.currentTime);
    ctl.fillStyle = '#FF7A00'; ctl.fillRect(x - 1.5 * dpr, 0, 3 * dpr, H);
    ctl.beginPath(); ctl.moveTo(x - 7 * dpr, 0); ctl.lineTo(x + 7 * dpr, 0); ctl.lineTo(x, 9 * dpr); ctl.fill();
    $('.tempo', el).textContent = fmt(video.currentTime) + ' / ' + fmt(dur);
  }

  /* toca pulando os trechos cortados */
  let laco = 0;
  function rodar() {
    if (fechado) return;
    const t = video.currentTime;
    const c = cortes.find(c => t >= c.a - .02 && t < c.b - .05);
    if (c && !video.paused) video.currentTime = c.b;
    $('.cortado', el).style.display = c && video.paused ? 'block' : 'none';
    desenhar();
    laco = requestAnimationFrame(rodar);
  }
  laco = requestAnimationFrame(rodar);

  const tocar = () => { if (video.paused) video.play(); else video.pause(); };
  video.onplay = () => { $('.play', el).textContent = '⏸ Pausar'; };
  video.onpause = () => { $('.play', el).textContent = '▶ Tocar'; };
  video.onclick = tocar;
  $('.play', el).onclick = tocar;
  const andar = d => { video.currentTime = Math.max(0, Math.min(dur, video.currentTime + d)); };
  $('.volta', el).onclick = () => andar(-5);
  $('.avanca', el).onclick = () => andar(5);
  $('.comeco', el).onclick = () => cortar(0, video.currentTime);
  $('.fim', el).onclick = () => { historico.push(JSON.stringify(cortes)); cortes.push({a: video.currentTime, b: dur}); juntar(); atualizar(); };
  const marcar = async () => {
    if (marcaIni == null) { marcaIni = video.currentTime; video.pause(); atualizar(); return; }
    const a = marcaIni; marcaIni = null;
    await cortar(a, video.currentTime);
  };
  $('.marca', el).onclick = marcar;
  const desfazer = () => {
    if (marcaIni != null) { marcaIni = null; atualizar(); return; }
    if (historico.length) { cortes = JSON.parse(historico.pop()); atualizar(); }
  };
  $('.desfaz', el).onclick = desfazer;

  let arrastando = false;
  const irPara = e => { const r = tl.getBoundingClientRect(); video.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * dur; };
  tl.onpointerdown = e => { arrastando = true; tl.setPointerCapture(e.pointerId); irPara(e); };
  tl.onpointermove = e => { if (arrastando) irPara(e); };
  tl.onpointerup = () => { arrastando = false; };

  const teclas = e => {
    if (e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') return;
    if (e.code === 'Space') { e.preventDefault(); tocar(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); andar(e.shiftKey ? -5 : -1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); andar(e.shiftKey ? 5 : 1); }
    else if (e.key === 'c' || e.key === 'C') marcar();
    else if (e.key === 'z' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); desfazer(); }
    else if (e.key === 'Escape' && marcaIni != null) { marcaIni = null; atualizar(); }
    e.stopPropagation();
  };
  window.addEventListener('keydown', teclas, true);
  const redimensionar = () => desenhar();
  window.addEventListener('resize', redimensionar);

  function fechar() {
    fechado = true;
    cancelAnimationFrame(laco);
    window.removeEventListener('keydown', teclas, true);
    window.removeEventListener('resize', redimensionar);
    video.pause(); video.removeAttribute('src'); video.load();
    URL.revokeObjectURL(url);
    input.dispose?.();
    el.remove();
  }
  $('.fechar', el).onclick = () => {
    if (cortes.length && !confirm('Fechar sem salvar os cortes? A gravação original continua salva.')) return;
    fechar(); aoFechar(null);
  };

  /* ---------- salvar ---------- */
  $('.salvar', el).onclick = async () => {
    video.pause();
    const ext = ehMp4 ? 'mp4' : 'webm';
    const nomeNovo = nome.replace(/\.\w+$/, '') + ' (editado).' + ext;
    let destino = null, nomeFinal = nomeNovo, handleNovo = null;
    try {
      if (pasta && (await pasta.queryPermission({mode: 'readwrite'})) === 'granted') {
        let n = 2;
        while (await pasta.getFileHandle(nomeFinal).then(() => true, () => false)) nomeFinal = nomeNovo.replace(/(\.\w+)$/, ` (${n++})$1`);
        handleNovo = await pasta.getFileHandle(nomeFinal, {create: true});
      } else if ('showSaveFilePicker' in window) {
        handleNovo = await window.showSaveFilePicker({id: 'estudio-gravacoes', suggestedName: nomeNovo,
          types: [{description: 'Vídeo', accept: {[ehMp4 ? 'video/mp4' : 'video/webm']: ['.' + ext]}}]});
        nomeFinal = handleNovo.name;
      }
      if (handleNovo) destino = await handleNovo.createWritable();
    } catch (e) { if (e.name === 'AbortError') return; console.warn(e); }

    const bt = $('.salvar', el), barra = $('.barra', el), fill = barra.querySelector('i');
    bt.disabled = true; bt.textContent = 'Salvando…'; barra.style.display = 'block';
    $('.fechar', el).disabled = true;
    try {
      const alvo = destino ? new StreamTarget(destino, {chunked: true}) : new BufferTarget();
      const out = new Output({format: ehMp4 ? new Mp4OutputFormat() : new WebMOutputFormat(), target: alvo});
      const vsrc = new EncodedVideoPacketSource(vt.codec);
      out.addVideoTrack(vsrc, {frameRate: 30});
      let asrc = null, asink = null;
      if (at) { asrc = new EncodedAudioPacketSource(at.codec); out.addAudioTrack(asrc); asink = new EncodedPacketSink(at); }
      await out.start();
      const vconf = await vt.getDecoderConfig(), aconf = at ? await at.getDecoderConfig() : null;
      let vPrimeiro = true, aPrimeiro = true;

      // trechos que ficam
      const ficam = []; let t = 0;
      for (const c of cortes) { if (c.a > t + .01) ficam.push([t, c.a]); t = Math.max(t, c.b); }
      if (t < dur - .01) ficam.push([t, dur]);
      const total = ficam.reduce((s, [a, b]) => s + b - a, 0);
      let desloc = 0;
      for (const [a, b] of ficam) {
        const k = await vsink.getKeyPacket(a + .001) || await vsink.getFirstKeyPacket();
        const ini = k.timestamp;
        const vit = vsink.packets(k)[Symbol.asyncIterator]();
        let aIt = null;
        if (asink) {
          const p0 = await asink.getPacket(ini) || await asink.getFirstPacket();
          aIt = p0 ? asink.packets(p0)[Symbol.asyncIterator]() : null;
        }
        let v = (await vit.next()).value, au = aIt ? (await aIt.next()).value : null;
        // intercala vídeo e áudio pela ordem do tempo
        while ((v && v.timestamp < b - .001) || (au && au.timestamp < b - .001)) {
          const usarV = v && v.timestamp < b - .001 && (!au || au.timestamp >= b - .001 || v.timestamp <= au.timestamp);
          if (usarV) {
            await vsrc.add(v.clone({timestamp: v.timestamp - ini + desloc}), vPrimeiro ? {decoderConfig: vconf} : undefined);
            vPrimeiro = false;
            fill.style.width = Math.min(100, (desloc + v.timestamp - ini) / total * 100) + '%';
            v = (await vit.next()).value;
          } else {
            if (au.timestamp >= ini - .001) {
              await asrc.add(au.clone({timestamp: au.timestamp - ini + desloc}), aPrimeiro ? {decoderConfig: aconf} : undefined);
              aPrimeiro = false;
            }
            au = (await aIt.next()).value;
          }
        }
        await vit.return?.(); await aIt?.return?.();
        desloc += b - ini;
      }
      await out.finalize();
      if (!destino) { // navegador sem acesso a pastas: baixa o arquivo
        const blob = new Blob([alvo.buffer], {type: ehMp4 ? 'video/mp4' : 'video/webm'});
        Object.assign(document.createElement('a'), {href: URL.createObjectURL(blob), download: nomeFinal}).click();
      }
      let apagou = false;
      if ($('.apagar', el).checked && destino) {
        try {
          if (pasta) { await pasta.removeEntry(nome); apagou = true; }
          else if (handle && handle.remove) { await handle.remove(); apagou = true; }
        } catch (e) { console.warn('apagar original', e); }
      }
      fechar();
      aoFechar({nome: nomeFinal, duracao: desloc, apagouOriginal: apagou});
    } catch (e) {
      console.error(e);
      try { await destino?.abort?.(); } catch (_) {}
      try { if (pasta && handleNovo) await pasta.removeEntry(nomeFinal); } catch (_) {}
      alert('Não consegui salvar o vídeo editado: ' + e.message + '\nA gravação original continua salva.');
      bt.disabled = false; bt.textContent = '💾 Salvar vídeo editado'; barra.style.display = 'none';
      $('.fechar', el).disabled = false;
    }
  };

  atualizar();
  video.currentTime = 0;
}
