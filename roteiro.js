/* Roteiros de Reels (vídeos de 20–45 s com teor viral) e busca de vídeos virais no YouTube.
   Usa as funções do app.js ($, esc, tx, chave, tela, aviso, chamarGemini, linkPadrao, BLOCO, mmss).
   A chave do YouTube, como a do Gemini, fica só no aparelho (localStorage). */
const Roteiro = (() => {
  let PROMPT_R = '';
  const salvarR = i => tx('readwrite', s => s.put(i), 'r');
  const apagarR = id => tx('readwrite', s => s.delete(id), 'r');
  const todosR = () => tx('readonly', s => s.getAll(), 'r');
  const umR = id => tx('readonly', s => s.get(id), 'r');
  const chaveYT = () => localStorage.getItem('youtube') || '';
  const ler = (k, padrao) => { try { return JSON.parse(localStorage.getItem(k)) ?? padrao; } catch { return padrao; } };
  const gravar = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  /* ---------------------------------------------------------------- gerar roteiro com o Gemini */
  const S = {type: 'STRING'};
  const obj = p => ({type: 'OBJECT', properties: p, required: Object.keys(p)});
  const lista = i => ({type: 'ARRAY', items: i});
  const ESQUEMA = obj({prova_citada: S, roteiros: lista(obj({
    tema: S, nota_viral: {type: 'INTEGER'}, por_que: S, ganchos: lista(S), texto_capa: S,
    blocos: lista(obj({tempo: S, cena: {type: 'STRING', enum: ['camera', 'quadro', 'tela']}, fala: S, quadro: S, texto_tela: S})),
    comentario_fixado: S, duracao: S, legenda: S,
  }))});
  ESQUEMA.propertyOrdering = ['prova_citada', 'roteiros'];

  // Reels "só com visual": o professor só grava a voz; o app monta com mascote, contas, desenhos e emojis
  const SO_VISUAL = `

VÍDEO SÓ COM VISUAL (vale acima da parte "GRAVAÇÃO"; o professor NÃO aparece)
Este Reels será montado só com elementos visuais: o mascote Delmão apresentando, a conta grande na tela,
desenhos e emojis que surgem quando a palavra é falada. O professor grava SÓ A VOZ.
- cena: sempre "tela".
- fala: narração para quem está OLHANDO A TELA ("olha essa conta", "repara nesse número").
  Nada de "olha pra mim", "aqui no quadro", "na minha mão", "vou escrever".
- Use objetos concretos e fáceis de desenhar quando ajudarem (pizza, dinheiro, relógio, celular, carro, prova, calendário...):
  cada um vira uma figura na tela na hora em que é falado.
- quadro: em TODOS os blocos, a conta ou o número que aparece grande na tela (até 24 caracteres),
  avançando a conta passo a passo de um bloco para o outro; no bloco que pede para pausar, a conta com "?".
- texto_tela: título curto em todos os blocos.`;
  // todo roteiro termina chamando para seguir a página (se o Gemini esquecer, o app acrescenta um bloco)
  const SEGUIR = /(^|[^\p{L}])(segue|siga|seguir|sigam)(?![\p{L}])/iu;  // não pega 'consegue'
  const FALAS_SEGUIR = ['Segue o Delmão Simplifica pra mais macete assim!', 'Me segue que amanhã tem outro truque!',
    'Segue o Delmão Simplifica e nunca mais erra essa!', 'Gostou? Segue o Delmão Simplifica pra não perder o próximo!'];
  function garantirSeguir(roteiros) {
    for (const [n, r] of roteiros.entries()) {
      const bl = r.blocos || (r.blocos = []), ult = bl[bl.length - 1];
      if (ult && SEGUIR.test(ult.fala || '')) { if (!ult.texto_tela) ult.texto_tela = 'SIGA @DELMAOSIMPLIFICA'; continue; }
      const nums = ult ? String(ult.tempo).match(/\d+(?:[.,]\d+)?/g) : null;
      const ini = nums ? Math.round(parseFloat(nums[nums.length - 1].replace(',', '.'))) : 30;
      bl.push({tempo: `${ini}–${ini + 3} s`, cena: ult && ult.cena === 'tela' ? 'tela' : 'camera',
        fala: FALAS_SEGUIR[n % FALAS_SEGUIR.length], quadro: ult && ult.cena === 'tela' ? (ult.quadro || '') : '', texto_tela: 'SIGA @DELMAOSIMPLIFICA'});
    }
    return roteiros;
  }
  const soVisual = () => !!(document.querySelector('#visual') && document.querySelector('#visual').checked);

  async function pedir(link, inicio, fim) {
    const video = {fileData: {fileUri: link}};
    let prompt = PROMPT_R + (soVisual() ? SO_VISUAL : '');
    if (inicio != null) {
      video.videoMetadata = {startOffset: `${inicio}s`, endOffset: `${fim}s`};
      prompt += `\n\nATENÇÃO: você recebeu só um TRECHO de um vídeo longo (de ${mmss(inicio)} até ${mmss(fim)}). Use apenas este trecho.`;
    }
    const corpo = JSON.stringify({
      contents: [{parts: [video, {text: prompt}]}],
      generationConfig: {responseMimeType: 'application/json', responseSchema: ESQUEMA, temperature: 0.8,
        ...(inicio != null ? {mediaResolution: 'MEDIA_RESOLUTION_LOW'} : {})},
    });
    return garantirSeguir(limparProvas(await chamarGemini(corpo, aviso, inicio != null), 'roteiros'));
  }

  // sem vídeo: o Gemini cria os roteiros a partir de um assunto que o professor escreveu (sempre só com visual)
  async function pedirAssunto(assunto) {
    const prompt = PROMPT_R + SO_VISUAL + `

NÃO HÁ VÍDEO DO YOUTUBE NESTE PEDIDO (vale acima de tudo o que fala em "vídeo enviado")
Crie os roteiros a partir deste ASSUNTO pedido pelo professor:
"""${assunto}"""
- Se ele deu uma ideia, um exemplo ou um macete, use-o; se deu só o tema, escolha você os macetes,
  pegadinhas e curiosidades que mais prendem a atenção nesse tema.
- Faça 3 roteiros com ângulos DIFERENTES (ex.: um macete, uma pegadinha, um desafio).
- prova_citada: "" e não cite prova nenhuma, a não ser que o assunto acima cite.`;
    const corpo = JSON.stringify({
      contents: [{parts: [{text: prompt}]}],
      generationConfig: {responseMimeType: 'application/json', responseSchema: ESQUEMA, temperature: 0.9},
    });
    return garantirSeguir(limparProvas(await chamarGemini(corpo, aviso), 'roteiros'));
  }
  async function gerarAssunto(assunto) {
    if (!chave()) { tela('config'); return alert('Primeiro cole a sua chave do Gemini.'); }
    $('#gerar').disabled = true;
    try {
      aviso('Escrevendo os roteiros…');
      const roteiros = await pedirAssunto(assunto);
      const agora = Date.now();
      for (const [k, conteudo] of roteiros.entries())
        await salvarR({id: `${agora}-${k}`, criado: new Date().toISOString(), link: '', assunto, conteudo, gancho: 0, visual: true, edicao: {soVoz: true}});
      aviso('');
      alert(`Pronto! ${roteiros.length} roteiro(s) só com visual. Abra um e toque em 🎙 Gravar a voz.`);
      tela('roteiros');
    } catch (e) {
      aviso('');
      alert('Deu erro: ' + e.message);
    } finally { $('#gerar').disabled = false; }
  }

  async function gerar(link, inicio = 0, longo = false) {
    if (!chave()) { tela('config'); return alert('Primeiro cole a sua chave do Gemini.'); }
    $('#gerar').disabled = true;
    try {
      let roteiros;
      try { roteiros = await pedir(link, longo ? inicio : null, longo ? inicio + BLOCO : null); }
      catch (e) { if (!e.trecho) throw e; roteiros = await pedir(link, null, null); }
      const agora = Date.now(), visual = soVisual();
      for (const [k, conteudo] of roteiros.entries())
        await salvarR({id: `${agora}-${k}`, criado: new Date().toISOString(), link, conteudo, gancho: 0,
          ...(visual ? {visual: true, edicao: {soVoz: true}} : {})});
      marcarUsado(link);
      aviso('');
      alert(`Pronto! ${roteiros.length} roteiro(s) novo(s).`);
      tela('roteiros');
    } catch (e) {
      aviso('');
      alert('Deu erro: ' + e.message);
    } finally { $('#gerar').disabled = false; }
  }

  /* ---------------------------------------------------------------- lista e tela do roteiro */
  const fogo = n => n >= 8 ? '🔥🔥🔥' : n >= 6 ? '🔥🔥' : '🔥';
  async function mostrarLista() {
    const itens = (await todosR()).sort((a, b) => b.id.localeCompare(a.id));
    $('#rvazio').hidden = itens.length > 0;
    $('#rlimpar').hidden = itens.length === 0;
    $('#rapagargravados').hidden = !itens.some(i => i.gravado);
    document.querySelectorAll('.nroteiros').forEach(e => e.textContent = itens.length ? `(${itens.length})` : '');
    $('#ritens').innerHTML = itens.map(i => `<button class="rcartao ${i.gravado ? 'postado' : ''}" data-id="${i.id}">
      <span class="nota">${fogo(i.conteudo.nota_viral)} ${i.conteudo.nota_viral}/10</span>
      <b>${i.visual ? '🎨 ' : ''}${esc(i.conteudo.tema)}</b>
      <small>${esc(i.conteudo.ganchos[i.gancho] || '')}</small>
      <small>${esc(i.conteudo.duracao)} · ${new Date(i.criado).toLocaleDateString('pt-BR')}${i.gravado ? ' · gravado ✓' : ''}</small></button>`).join('');
    $('#ritens').querySelectorAll('.rcartao').forEach(b => b.onclick = () => abrir(b.dataset.id));
  }

  const CENA = {camera: '🎥 CÂMERA', quadro: '🧑‍🏫 QUADRO', tela: '📱 TELA'};
  let atual = null;
  async function abrir(id) {
    atual = await umR(id);
    const c = atual.conteudo;
    tela('verroteiro');
    $('#rtitulo').textContent = c.tema;
    $('#rcorpo').innerHTML = `
      <p class="rnota">${fogo(c.nota_viral)} <b>${c.nota_viral}/10</b> · ${esc(c.duracao)}<br><small>${esc(c.por_que)}</small></p>
      <p class="rcapa">Capa do Reels: <b>${esc(c.texto_capa)}</b></p>
      <h3>Gancho (0–3 s) <small>escolha um</small></h3>
      ${c.ganchos.map((g, k) => `<label class="gancho"><input type="radio" name="gancho" value="${k}" ${k === atual.gancho ? 'checked' : ''}> <span>${esc(g)}</span></label>`).join('')}
      <h3>Roteiro</h3>
      ${c.blocos.map(b => `<div class="bloco">
        <div class="btopo"><span class="tempo">${esc(b.tempo)}</span><span class="cena">${CENA[b.cena] || esc(b.cena)}</span></div>
        <p class="fala">“${esc(b.fala)}”</p>
        ${b.quadro ? `<p class="bq"><b>No quadro/tela:</b> ${esc(b.quadro)}</p>` : ''}
        ${b.texto_tela ? `<p class="bq"><b>Texto na tela:</b> ${esc(b.texto_tela)}</p>` : ''}
      </div>`).join('')}
      <h3>Comentário para fixar</h3><p class="bloco">${esc(c.comentario_fixado)}</p>`;
    $('#rcorpo').querySelectorAll('input[name=gancho]').forEach(r => r.onchange = async () => { atual.gancho = Number(r.value); await salvarR(atual); });
    $('#rlegenda').value = (c.legenda || '').replace(/\\n/g, '\n');
    $('#rmarcar').textContent = atual.gravado ? 'Desmarcar gravado' : 'Marcar como gravado';
    $('#rvideo').href = atual.link || '#'; $('#rvideo').hidden = !atual.link;  // roteiro por assunto não tem vídeo de origem
    // gravação e vídeo pronto
    const nt = (atual.takes || []).filter(Boolean).length, nb = c.blocos.length + 1;
    const vz = atual.edicao && atual.edicao.soVoz;
    $('#rgravar').textContent = atual.video ? '🎥 Regravar ou remontar' : nt ? `🎥 Continuar a gravação (${nt} de ${nb} blocos)` : vz ? '🎙 Gravar a voz (vídeo só com visual)' : '🎥 Gravar o vídeo';
    $('#rdenovo').hidden = !(nt || atual.video);
    if (urlVideo) { URL.revokeObjectURL(urlVideo); urlVideo = null; }
    if (atual.video) {
      urlVideo = URL.createObjectURL(atual.video);
      $('#rvideofinal').innerHTML = `<video controls playsinline src="${urlVideo}"></video>
        <div class="acoes"><button id="rcompvid" class="principal">Compartilhar vídeo no Instagram</button>
        <button id="rbaixvid" class="sec" style="grid-column:1/-1">Baixar vídeo</button></div>`;
      const arquivo = () => new File([atual.video], `${atual.conteudo.tema}.${atual.video.type.includes('mp4') ? 'mp4' : 'webm'}`, {type: atual.video.type});
      $('#rcompvid').onclick = () => {  // o share tem de sair já no toque
        const files = [arquivo()];
        if (!(navigator.canShare && navigator.canShare({files}))) return alert('Este navegador não compartilha vídeo. Use "Baixar vídeo".');
        const cop = copiar($('#rlegenda').value);
        navigator.share({files}).catch(e => { if (e.name !== 'AbortError') alert('Não deu para compartilhar: ' + e.message); });
        cop.then(ok => { aviso(ok ? 'Legenda copiada: no Instagram, escolha "Reels" e cole a legenda.' : ''); setTimeout(() => aviso(''), 8000); });
      };
      $('#rbaixvid').onclick = () => { const a = document.createElement('a'); a.href = urlVideo; a.download = arquivo().name; a.click(); };
    } else $('#rvideofinal').innerHTML = '';
  }
  let urlVideo = null;

  function textoRoteiro() {
    const c = atual.conteudo;
    return [`${c.tema} (${c.duracao})`, `CAPA: ${c.texto_capa}`, '', `0–3 s [CÂMERA] ${c.ganchos[atual.gancho]}`,
      ...c.blocos.map(b => `${b.tempo} [${(CENA[b.cena] || b.cena).replace(/^\S+ /, '')}] ${b.fala}` +
        (b.quadro ? `\n   quadro: ${b.quadro}` : '') + (b.texto_tela ? `\n   tela: ${b.texto_tela}` : '')),
      '', `COMENTÁRIO FIXADO: ${c.comentario_fixado}`, '', 'LEGENDA:', $('#rlegenda').value].join('\n');
  }
  const copiar = async t => { try { await navigator.clipboard.writeText(t); return true; } catch { return false; } };

  /* ---------------------------------------------------------------- teleprompter */
  let rolando = false, vel = Number(localStorage.getItem('tpvel') || 40), fonte = Number(localStorage.getItem('tpfonte') || 40);
  let trava = null, ultimoT = 0, resto = 0;
  function abrirTP() {
    const c = atual.conteudo;
    $('#tptexto').innerHTML = [`<p>${esc(c.ganchos[atual.gancho])}</p>`,
      ...c.blocos.map(b => `<p><span>${CENA[b.cena] || ''}</span>${esc(b.fala)}</p>`)].join('') + '<p class="fim">— FIM —</p>';
    $('#tp').hidden = false; $('#tp').scrollTop = 0;
    aplicarTP(); rolando = false; $('#tpplay').textContent = '▶';
    if (navigator.wakeLock) navigator.wakeLock.request('screen').then(t => { trava = t; }).catch(() => {});
  }
  function fecharTP() { rolando = false; $('#tp').hidden = true; if (trava) { trava.release().catch(() => {}); trava = null; } }
  function aplicarTP() {
    $('#tptexto').style.fontSize = fonte + 'px';
    $('#tpinfo').textContent = `vel. ${vel} · letra ${fonte}`;
    localStorage.setItem('tpvel', vel); localStorage.setItem('tpfonte', fonte);
  }
  function passo(t) {
    if (!rolando) return;
    const dt = ultimoT ? (t - ultimoT) / 1000 : 0; ultimoT = t;
    resto += vel * dt;  // vel = pixels por segundo
    const px = Math.floor(resto); resto -= px;
    const el = $('#tp');
    el.scrollTop += px;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) { rolando = false; $('#tpplay').textContent = '▶'; return; }
    requestAnimationFrame(passo);
  }
  function playTP() {
    rolando = !rolando; $('#tpplay').textContent = rolando ? '⏸' : '▶';
    if (rolando) { ultimoT = 0; requestAnimationFrame(passo); }
  }

  /* ---------------------------------------------------------------- busca de vídeos virais */
  const TERMOS = ['macete matemática enem', 'truque de matemática', 'matemática básica dica', 'porcentagem macete',
    'questão enem matemática', 'raciocínio lógico concurso'];
  const termos = () => ler('termos', TERMOS);
  const usados = () => new Set(ler('usados', []));
  function marcarUsado(link) {
    const id = (link.match(/v=([\w-]{11})/) || [])[1];
    if (id) gravar('usados', [...usados(), id].slice(-500));
  }
  const compacto = n => new Intl.NumberFormat('pt-BR', {notation: 'compact', maximumFractionDigits: 1}).format(n);
  function duracao(iso) {
    const m = String(iso).match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/) || [];
    const s = (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
    return s >= 3600 ? `${Math.floor(s / 3600)}h${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  async function yt(caminho, params) {
    const u = new URL('https://www.googleapis.com/youtube/v3/' + caminho);
    for (const [k, v] of Object.entries({...params, key: chaveYT()})) u.searchParams.set(k, v);
    const r = await fetch(u);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const motivo = j.error && j.error.errors && j.error.errors[0] && j.error.errors[0].reason;
      if (motivo === 'quotaExceeded') throw new Error('A cota grátis de hoje do YouTube acabou. Amanhã ela volta (zera às 5h, horário de Brasília).');
      if (r.status === 400 || r.status === 403) throw new Error('A chave do YouTube não funcionou. Confira em ⚙️ (no alto, à direita). (' + (j.error && j.error.message || r.status) + ')');
      throw new Error(`YouTube respondeu ${r.status}.`);
    }
    return j;
  }
  const emPartes = (a, n) => Array.from({length: Math.ceil(a.length / n)}, (_, i) => a.slice(i * n, i * n + n));

  async function buscar() {
    if (!chaveYT()) { tela('config'); return alert('Primeiro cole a sua chave do YouTube (⚙️ no alto, à direita).'); }
    const lista_ = $('#termos').value.split('\n').map(t => t.trim()).filter(Boolean);
    if (!lista_.length) return alert('Escreva pelo menos um termo de busca.');
    gravar('termos', lista_);
    const dias = Number($('#periodo').value), curtos = $('#soshorts').checked;
    const depois = new Date(Date.now() - dias * 864e5).toISOString();
    $('#buscar').disabled = true;
    $('#vlista').innerHTML = '<p class="dica">🔎 Buscando os vídeos que estão bombando… (uns 10 segundos)</p>';
    try {
      const ids = new Set();
      for (const [k, q] of lista_.entries()) {
        aviso(`Buscando no YouTube: “${q}” (${k + 1} de ${lista_.length})…`);
        const r = await yt('search', {part: 'id', type: 'video', q, order: 'viewCount', publishedAfter: depois, regionCode: 'BR',
          relevanceLanguage: 'pt', maxResults: 25, ...(curtos ? {videoDuration: 'short'} : {})});
        r.items.forEach(i => ids.add(i.id.videoId));
      }
      aviso('Calculando quais viralizaram…');
      const videos = [];
      for (const parte of emPartes([...ids], 50))
        videos.push(...(await yt('videos', {part: 'snippet,statistics,contentDetails', id: parte.join(',')})).items);
      const inscritos = new Map();
      for (const parte of emPartes([...new Set(videos.map(v => v.snippet.channelId))], 50))
        (await yt('channels', {part: 'statistics', id: parte.join(',')})).items
          .forEach(c => inscritos.set(c.id, Number(c.statistics.subscriberCount || 0)));
      const res = videos.map(v => {
        const views = Number(v.statistics.viewCount || 0), subs = inscritos.get(v.snippet.channelId) || 0;
        const idade = Math.max(1, (Date.now() - new Date(v.snippet.publishedAt)) / 864e5);
        return {id: v.id, titulo: v.snippet.title, canal: v.snippet.channelTitle, thumb: (v.snippet.thumbnails.medium || v.snippet.thumbnails.default).url,
          views, subs, dias: Math.round(idade), dur: duracao(v.contentDetails.duration),
          // viralizou = muito mais views que o tamanho do canal (piso de 1 000 para canal minúsculo não distorcer)
          vezes: views / Math.max(subs, 1000), comentarios: Number(v.statistics.commentCount || 0)};
      }).filter(v => v.views >= 5000).sort((a, b) => b.vezes - a.vezes).slice(0, 40);
      gravar('virais', {quando: new Date().toISOString(), res});
      mostrarVirais();
      aviso('');
    } catch (e) {
      aviso('');
      $('#vlista').innerHTML = `<p class="dica">Não deu para buscar: ${esc(e.message)}</p>`;
      alert(e.message);
    }
    finally { $('#buscar').disabled = false; }
  }

  // ao abrir a aba: busca sozinho se ainda não buscou nas últimas 12 h
  function abrirVirais() {
    if (!$('#vlista')) return;
    const v = ler('virais', null);
    if (!chaveYT()) {
      $('#vlista').innerHTML = '<p class="dica">Falta a <b>chave do YouTube</b>: toque na <b>⚙️</b> (no alto, à direita), cole a chave na parte “Chave do YouTube” e toque em Salvar.</p>';
      return;
    }
    if (!v || Date.now() - new Date(v.quando) > 12 * 3600e3) buscar();
    else mostrarVirais();
  }

  function mostrarVirais() {
    const v = ler('virais', null), u = usados();
    if (!v) { $('#vlista').innerHTML = '<p class="dica">Toque em <b>🔥 Buscar virais</b> para ver os vídeos.</p>'; return; }
    if (!v.res.length) { $('#vlista').innerHTML = '<p class="dica">Nenhum vídeo com 5 mil visualizações ou mais nesse período. Escolha um período maior ou troque os termos e busque de novo.</p>'; return; }
    const quando = new Date(v.quando);
    $('#vlista').innerHTML = `<p class="dica">Busca de ${quando.toLocaleDateString('pt-BR')} às ${quando.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})}. ` +
      `<b>“× o canal”</b> = visualizações divididas pelos inscritos: quanto maior, mais o vídeo furou a bolha.</p>` +
      v.res.map(x => `<div class="viral ${u.has(x.id) ? 'usado' : ''}">
        <a href="https://www.youtube.com/watch?v=${x.id}" target="_blank" rel="noopener"><img src="${esc(x.thumb)}" alt="" loading="lazy"><span class="dur">${x.dur}</span></a>
        <div><b>${esc(x.titulo)}</b>
        <small>${esc(x.canal)} · ${compacto(x.subs)} inscritos</small>
        <small><span class="vez">${x.vezes >= 20 ? '🔥🔥🔥' : x.vezes >= 5 ? '🔥🔥' : '🔥'} ${compacto(x.vezes)}× o canal</span> · ${compacto(x.views)} views · há ${x.dias} d${u.has(x.id) ? ' · já usado ✓' : ''}</small>
        <div class="vacoes"><button class="principal" data-r="${x.id}">Roteiro</button><button class="sec" data-c="${x.id}">Carrossel</button></div></div>
      </div>`).join('');
    $('#vlista').querySelectorAll('[data-r]').forEach(b => b.onclick = () => gerar(`https://www.youtube.com/watch?v=${b.dataset.r}`));
    $('#vlista').querySelectorAll('[data-c]').forEach(b => b.onclick = () => {
      const link = `https://www.youtube.com/watch?v=${b.dataset.c}`; marcarUsado(link); gerar_carrossel(link);
    });
  }
  // gerar() do app.js (carrossel) tem o mesmo nome do gerar daqui: guardo a referência antes
  const gerar_carrossel = link => window.gerar(link, 0, false);

  /* ---------------------------------------------------------------- início */
  async function iniciar() {
    // página velha (guardada no celular) com este arquivo novo: baixa a página de novo e recarrega uma vez
    if (!document.querySelector('#vlista') || !document.querySelector('#rgravar')) {
      if (!sessionStorage.getItem('recarregou')) {
        sessionStorage.setItem('recarregou', '1');
        await fetch(BASE + 'index.html', {cache: 'reload'}).catch(() => {});
        await fetch(BASE, {cache: 'reload'}).catch(() => {});
        location.reload();
      }
      return;  // sem as telas novas: o resto do app funciona normalmente
    }
    sessionStorage.removeItem('recarregou');
    PROMPT_R = await fetch(BASE + 'prompt-roteiro.md').then(r => r.text());
    $('#termos').value = termos().join('\n');
    $('#buscar').onclick = buscar;
    mostrarVirais();
    $('#rvoltar').onclick = () => tela('roteiros');
    $('#rtp').onclick = abrirTP;
    $('#rgravar').onclick = () => Gravador.abrir(atual, salvarR, () => abrir(atual.id));
    $('#rcopiar').onclick = async () => alert(await copiar(textoRoteiro()) ? 'Roteiro copiado!' : 'Não consegui copiar.');
    $('#rcopiarleg').onclick = async () => alert(await copiar($('#rlegenda').value) ? 'Legenda copiada!' : 'Selecione e copie à mão.');
    $('#rlegenda').onchange = async () => { atual.conteudo.legenda = $('#rlegenda').value; await salvarR(atual); };
    $('#rmarcar').onclick = async () => { atual.gravado = !atual.gravado; await salvarR(atual); abrir(atual.id); };
    // apaga takes e vídeo pronto e abre o gravador no bloco 1; textos, legenda, estilos e música ficam
    $('#rdenovo').onclick = async () => {
      if (!confirm('Apagar tudo o que já foi gravado deste roteiro e começar do bloco 1?\nO roteiro, a legenda, os estilos e a música ficam. (não dá para desfazer)')) return;
      atual.takes = []; delete atual.video; atual.gravado = false;
      await salvarR(atual);
      Gravador.abrir(atual, salvarR, () => abrir(atual.id));
    };
    $('#rapagargravados').onclick = async () => {
      const g = (await todosR()).filter(i => i.gravado);
      if (!confirm(`Apagar do celular os ${g.length} roteiros marcados como gravados? (não dá para desfazer)`)) return;
      for (const i of g) await apagarR(i.id);
      mostrarLista();
    };
    $('#rapagartodos').onclick = async () => {
      const n = (await todosR()).length;
      if (!confirm(`Apagar do celular TODOS os ${n} roteiros (e os vídeos gravados deles)? (não dá para desfazer)`)) return;
      await tx('readwrite', s => s.clear(), 'r');
      mostrarLista();
    };
    $('#rexcluir').onclick = async () => { if (confirm('Excluir este roteiro do celular? (não dá para desfazer)')) { await apagarR(atual.id); tela('roteiros'); } };
    $('#tpplay').onclick = playTP;
    $('#tptexto').onclick = playTP;
    $('#tpfechar').onclick = fecharTP;
    $('#tpmenos').onclick = () => { vel = Math.max(10, vel - 10); aplicarTP(); };
    $('#tpmais').onclick = () => { vel = Math.min(200, vel + 10); aplicarTP(); };
    $('#tpamenos').onclick = () => { fonte = Math.max(24, fonte - 4); aplicarTP(); };
    $('#tpamais').onclick = () => { fonte = Math.min(80, fonte + 4); aplicarTP(); };
    $('#tpvolta').onclick = () => { $('#tp').scrollTop = 0; };
    $('#chaveyt').value = chaveYT();
    $('#salvaryt').onclick = () => { localStorage.setItem('youtube', $('#chaveyt').value.trim()); alert('Chave do YouTube salva só neste celular.'); };
    $('#testaryt').onclick = async () => {
      const r = await fetch(`https://www.googleapis.com/youtube/v3/videoCategories?part=id&regionCode=BR&key=${encodeURIComponent($('#chaveyt').value.trim())}`);
      alert(r.ok ? 'A chave do YouTube funciona! ✅' : `A chave não funcionou (${r.status}).`);
    };
  }
  return {iniciar, gerar, gerarAssunto, mostrarLista, abrirVirais, contar: async () => (await todosR()).length};
})();
