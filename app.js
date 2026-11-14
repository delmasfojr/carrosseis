/* App de celular do gerador de carrosséis @delmaosimplifica.
   Tudo roda no próprio celular: a chave do Gemini fica só aqui (localStorage),
   os carrosséis ficam guardados no aparelho (IndexedDB). */
const BASE = new URL('./', location.href).href;
const MODELOS = ['gemini-3.5-flash', 'gemini-flash-latest', 'gemini-3.8-flash', 'gemini-3-flash-preview'];
const BLOCO = 30 * 60;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
let DESENHOS = new Map(), DESCRICOES = {}, PROMPT = '', PROMPT_DESENHOS = '';

/* ---------------------------------------------------------------- guardar no aparelho */
const banco = new Promise((ok, erro) => {
  const r = indexedDB.open('carrosseis', 2);  // 'c' = carrosséis, 'r' = roteiros de Reels
  r.onupgradeneeded = () => { for (const n of ['c', 'r']) if (!r.result.objectStoreNames.contains(n)) r.result.createObjectStore(n, {keyPath: 'id'}); };
  r.onsuccess = () => ok(r.result); r.onerror = () => erro(r.error);
});
async function tx(modo, f, loja = 'c') {
  const db = await banco;
  return new Promise((ok, erro) => {
    const t = db.transaction(loja, modo), st = t.objectStore(loja), r = f(st);
    t.oncomplete = () => ok(r && r.result); t.onerror = () => erro(t.error);
  });
}
const salvar = item => tx('readwrite', s => s.put(item));
const apagar = id => tx('readwrite', s => s.delete(id));
const todos = () => tx('readonly', s => s.getAll());
const um = id => tx('readonly', s => s.get(id));

const chave = () => localStorage.getItem('gemini') || '';
const fila = () => JSON.parse(localStorage.getItem('fila') || '[]');
const setFila = f => { localStorage.setItem('fila', JSON.stringify(f)); mostrarFila(); };

/* ---------------------------------------------------------------- Gemini */
const S = {type: 'STRING'}, POSE = {type: 'STRING', enum: Cards.POSES};
const obj = p => ({type: 'OBJECT', properties: p, required: Object.keys(p)});
const lista = i => ({type: 'ARRAY', items: i});  // Gemini 3.x recusa minItems/maxItems
const ESQUEMA = obj({carrosseis: lista(obj({
  tema: S,
  capa: obj({linha1: S, linha2: S, subtitulo: S, estilo: {type: 'STRING', enum: ['questao', 'quadro', 'postit']}, questao_rotulo: S,
    questao_destaque: S, conta: S, questao_emoji: S, frase: S, pose: POSE}),
  regra: obj({linha1: S, linha2: S, texto: S, itens: lista(obj({emoji: S, pergunta: S, nota: S})), frase: S, pose: POSE}),
  exemplo: obj({linha1: S, linha2: S, enunciado: S, emoji: S, pergunta: S, passos: lista(S), resposta: S, pose: POSE}),
  resumo: obj({linha1: S, linha2: S, destaque: S, etapas: lista(obj({emoji: S, rotulo: S})), frase: S, pose: POSE}),
  cta_frase: S, legenda: S,
}))});
const mmss = s => s >= 3600 ? `${Math.floor(s / 3600)}h${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}` : `${Math.floor(s / 60)} min`;

async function pedirAoGemini(link, inicio, fim, aviso) {
  let prompt = PROMPT;
  // a regra de escolha dos desenhos fica em prompt-desenhos.md (o PC usa o mesmo arquivo)
  if (DESENHOS.size) prompt += '\n\n' + PROMPT_DESENHOS +
    Object.entries(DESCRICOES).map(([n, d]) => `${n} = ${d} (palavras: ${(DESENHOS.get(n) || []).join(', ')})`).join('\n');
  const video = {fileData: {fileUri: link}};
  if (inicio != null) {
    video.videoMetadata = {startOffset: `${inicio}s`, endOffset: `${fim}s`};
    prompt += `\n\nATENÇÃO: você recebeu só um TRECHO de um vídeo longo (de ${mmss(inicio)} até ${mmss(fim)}). ` +
      'Use apenas o que aparece neste trecho.';
  }
  const corpo = JSON.stringify({
    contents: [{parts: [video, {text: prompt}]}],
    generationConfig: {responseMimeType: 'application/json', responseSchema: ESQUEMA, temperature: 0.6,
      ...(inicio != null ? {mediaResolution: 'MEDIA_RESOLUTION_LOW'} : {})},
  });
  return (await chamarGemini(corpo, aviso, inicio != null)).carrosseis;
}

/* Manda o pedido ao Gemini, trocando de modelo quando um está ocupado. Devolve o JSON da resposta.
   Usado pelos carrosséis e pelos roteiros (roteiro.js). */
async function chamarGemini(corpo, aviso, trecho = false) {
  let ultimo = '';
  for (let rodada = 0; rodada < 2; rodada++) {
    for (const modelo of MODELOS) {
      aviso(`Pedindo ao Gemini (${modelo})… pode levar alguns minutos. Deixe o app aberto.`);
      const ctl = new AbortController(), relogio = setTimeout(() => ctl.abort(), 15 * 60 * 1000);
      let r, texto;
      try {
        r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`,
          {method: 'POST', headers: {'Content-Type': 'application/json', 'x-goog-api-key': chave()}, body: corpo, signal: ctl.signal});
        texto = await r.text();
      } catch (e) {  // sem internet ou demorou demais: tenta o próximo modelo
        ultimo = e.name === 'AbortError' ? `${modelo}: demorou demais` : `${modelo}: falha de conexão (${e.message})`;
        continue;
      } finally { clearTimeout(relogio); }
      if (r.ok) return JSON.parse(JSON.parse(texto).candidates[0].content.parts[0].text);
      ultimo = `${modelo} (${r.status}): ${texto.slice(0, 300)}`;
      if (r.status === 400 && trecho) {  // o trecho começa depois do fim do vídeo
        const e = new Error('O vídeo é mais curto que o trecho pedido.'); e.trecho = true; throw e;
      }
      if (![404, 429, 500, 503].includes(r.status)) throw new Error(ultimo);  // ex.: chave errada
    }
    if (rodada === 0) { aviso('Todos os modelos ocupados; tentando de novo em 60 s…'); await new Promise(r => setTimeout(r, 60000)); }
  }
  throw new Error('O Gemini não respondeu. Tente mais tarde.\n' + ultimo);
}

/* ---------------------------------------------------------------- desenhar os cards */
// O card (num iframe) NÃO baixa nada sozinho: no celular esses downloads de dentro do quadro travavam.
// O app baixa cada arquivo uma vez (fontes, desenhos, mascote, biblioteca) e entrega tudo embutido.
const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
const baixados = new Map();
function baixar(u, comoTexto) {
  if (!baixados.has(u)) baixados.set(u, (async () => {
    const ctl = new AbortController(), relogio = setTimeout(() => ctl.abort(), 45000);
    try {
      const r = await fetch(u, {signal: ctl.signal});
      if (!r.ok) throw new Error(`erro ${r.status}`);
      if (comoTexto) return await r.text();
      const b = await r.blob();
      return await new Promise((ok, erro) => {
        const f = new FileReader(); f.onload = () => ok(f.result); f.onerror = () => erro(f.error); f.readAsDataURL(b);
      });
    } catch (e) {
      baixados.delete(u);
      throw new Error(`não consegui baixar ${u.replace(BASE, '')} (${e.name === 'AbortError' ? 'demorou demais' : e.message})`);
    } finally { clearTimeout(relogio); }
  })());
  return baixados.get(u);
}
async function embutir(html) {
  // acha cada endereço BASE + (fontes|desenhos|mascote)/arquivo e troca pelo conteúdo embutido
  const urls = new Set();
  for (const parte of html.split(BASE).slice(1)) {
    const m = parte.match(/^(fontes|desenhos|mascote)\/[^'")\s]+/);
    if (m) urls.add(BASE + m[0]);
  }
  const lista = [...urls], dados = await Promise.all(lista.map(u => baixar(u)));
  lista.forEach((u, i) => { html = html.split(u).join(dados[i]); });
  const lib = (await baixar(BASE + 'vendor/html-to-image.js', true)).split('</script').join('<\\/script');
  return html.replace('</body>', `<script>${lib}<\/script></body>`);
}
async function desenharCard(conteudo, n) {
  const html = await embutir(Cards.html(conteudo, n, BASE, DESENHOS));
  const fonteCSS = (html.match(/@font-face\{[^}]*\}/g) || []).join('');
  // desenhado NA tela, mas invisível: fora da tela o Android "adormece" o quadro
  const ifr = document.createElement('iframe');
  ifr.style.cssText = 'position:fixed;left:0;top:0;width:1080px;height:1350px;border:0;opacity:0;pointer-events:none;z-index:-1';
  document.documentElement.style.overflow = 'hidden';
  document.body.appendChild(ifr);
  ifr.srcdoc = html;
  try {
    const t0 = Date.now();
    while (!(ifr.contentWindow && ifr.contentWindow.AJUSTADO && ifr.contentWindow.htmlToImage)) {
      if (Date.now() - t0 > 60000) {
        const w = ifr.contentWindow, d = w && w.document;
        throw new Error(`O card ${n} não carregou (página: ${d && d.readyState}; fontes: ${d && d.fonts && d.fonts.status}; ` +
          `ajuste: ${!!(w && w.AJUSTADO)}; imagem: ${!!(w && w.htmlToImage)}).`);
      }
      await new Promise(r => setTimeout(r, 100));
    }
    const w = ifr.contentWindow, no = w.document.querySelector('.card');
    const op = {width: 1080, height: 1350, pixelRatio: 1, fontEmbedCSS: fonteCSS};
    if (IOS) await w.htmlToImage.toBlob(no, op);  // o Safari às vezes erra as imagens na 1ª vez
    return await w.htmlToImage.toBlob(no, op);
  } finally { ifr.remove(); document.documentElement.style.overflow = ''; }
}
async function desenharCarrossel(item, aviso) {
  item.imagens = [];
  for (let n = 1; n <= Cards.TOTAL; n++) {
    aviso(`Desenhando “${item.conteudo.tema}”: card ${n} de ${Cards.TOTAL}…`);
    item.imagens.push(await desenharCard(item.conteudo, n));
  }
  await salvar(item);
}

/* ---------------------------------------------------------------- telas */
function tela(id) {
  document.querySelectorAll('.tela').forEach(t => t.hidden = t.id !== id);
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.tela === id));
  if (id === 'lista') mostrarLista();
  if (id === 'roteiros' && typeof Roteiro !== 'undefined') Roteiro.mostrarLista();
  window.scrollTo(0, 0);
}
const aviso = txt => { $('#status').textContent = txt; $('#status').hidden = !txt; };

async function gerar(link, inicio, longo, daFila = false) {
  if (!chave()) { tela('config'); return alert('Primeiro cole a sua chave do Gemini.'); }
  $('#gerar').disabled = true;
  try {
    const fim = longo ? inicio + BLOCO : null;
    let carrosseis;
    try {
      carrosseis = await pedirAoGemini(link, longo ? inicio : null, fim, aviso);
    } catch (e) {
      if (!e.trecho) throw e;
      if (daFila) {  // continuação de vídeo longo que já acabou
        setFila(fila().filter(f => f.link !== link)); aviso('');
        return alert('Esse vídeo já acabou: não há mais partes para ler. Tirei da fila.');
      }
      longo = false;  // vídeo curto marcado como longo: lê o vídeo inteiro
      carrosseis = await pedirAoGemini(link, null, null, aviso);
    }
    if (longo) setFila([{link, inicio: fim}, ...fila().filter(f => f.link !== link)]);
    else setFila(fila().filter(f => f.link !== link));
    // guarda o texto ANTES de desenhar: se o desenho falhar, não se perde o trabalho do Gemini
    const novos = carrosseis.map((conteudo, k) =>
      ({id: `${Date.now()}-${k}`, criado: new Date().toISOString(), link, conteudo, imagens: []}));
    for (const item of novos) await salvar(item);
    for (const item of novos) await desenharCarrossel(item, aviso);
    aviso('');
    alert(`Pronto! ${carrosseis.length} carrossel(éis) novo(s).` + (longo ? '\nO resto do vídeo ficou na fila (“Continuar”).' : ''));
    tela('lista');
  } catch (e) {
    aviso('');
    alert('Deu erro: ' + e.message);
  } finally { $('#gerar').disabled = false; }
}

function mostrarFila() {
  const f = fila();
  $('#fila').innerHTML = f.length ? '<h3>Continuar vídeos longos</h3>' + f.map((x, i) =>
    `<div class="filaitem"><span>${esc(x.link.replace(/^https?:\/\/(www\.)?/, ''))}<br><small>a partir de ${mmss(x.inicio)}</small></span>
     <button data-i="${i}" class="cont">Continuar</button><button data-i="${i}" class="tirar" title="Tirar da fila">✕</button></div>`).join('') : '';
  $('#fila').querySelectorAll('.cont').forEach(b => b.onclick = () => { const x = fila()[b.dataset.i]; gerar(x.link, x.inicio, true, true); });
  $('#fila').querySelectorAll('.tirar').forEach(b => b.onclick = () => setFila(fila().filter((_, i) => i != b.dataset.i)));
}

const urls = [];
function limparUrls() { while (urls.length) URL.revokeObjectURL(urls.pop()); }
const url = blob => { const u = URL.createObjectURL(blob); urls.push(u); return u; };

async function mostrarLista() {
  limparUrls();
  const itens = (await todos()).sort((a, b) => b.id.localeCompare(a.id));
  $('#vazio').hidden = itens.length > 0;
  $('#limpar').hidden = itens.length === 0;
  $('#apagarpostados').hidden = !itens.some(i => i.postado);
  $('#itens').innerHTML = itens.map(i => `<button class="cartao ${i.postado ? 'postado' : ''}" data-id="${i.id}">
    ${i.imagens && i.imagens.length ? `<img src="${url(i.imagens[0])}" alt="">` : '<em class="semimg">Toque para desenhar</em>'}<span><b>${esc(i.conteudo.tema)}</b><small>${new Date(i.criado).toLocaleDateString('pt-BR')}${i.postado ? ' · postado ✓' : ''}</small></span></button>`).join('');
  $('#itens').querySelectorAll('.cartao').forEach(b => b.onclick = () => abrir(b.dataset.id));
}

let atual = null;
async function abrir(id) {
  atual = await um(id);
  if (!atual.imagens || atual.imagens.length < Cards.TOTAL) {  // texto salvo, mas ainda sem imagens
    try { await desenharCarrossel(atual, aviso); aviso(''); }
    catch (e) { aviso(''); return alert('Não consegui desenhar: ' + e.message); }
  }
  tela('ver');
  $('#vertitulo').textContent = atual.conteudo.tema;
  $('#slides').innerHTML = atual.imagens.map(b => `<img src="${url(b)}" alt="">`).join('');
  $('#slides').scrollLeft = 0;
  $('#legenda').value = (atual.conteudo.legenda || '').replace(/\\n/g, '\n');
  $('#marcar').textContent = atual.postado ? 'Desmarcar postado' : 'Marcar como postado';
}
const arquivos = () => atual.imagens.map((b, k) => new File([b], `${String(k + 1).padStart(2, '0')}.png`, {type: 'image/png'}));
async function copiarLegenda() {
  try { await navigator.clipboard.writeText($('#legenda').value); return true; } catch { return false; }
}

/* Qualquer formato de link do YouTube (youtu.be, shorts, live, m., com ?si=…) vira o padrão
   https://www.youtube.com/watch?v=ID, que é o único que o Gemini aceita sem reclamar. */
function linkPadrao(texto) {
  const m = String(texto).trim().match(
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? `https://www.youtube.com/watch?v=${m[1]}` : null;
}

/* ---------------------------------------------------------------- início */
async function iniciar() {
  [PROMPT, PROMPT_DESENHOS, DESENHOS] = await Promise.all([
    fetch(BASE + 'prompt.md').then(r => r.text()),
    fetch(BASE + 'prompt-desenhos.md').then(r => r.text()),
    // nome do desenho -> palavras-gatilho (o card só usa o adesivo se o texto tiver uma delas)
    Promise.all([fetch(BASE + 'desenhos.json').then(r => r.json()), fetch(BASE + 'gatilhos.json').then(r => r.json())])
      .then(([d, g]) => { DESCRICOES = d; return new Map(Object.keys(d).map(n => [n, g[n] || []])); }),
  ]);
  document.querySelectorAll('nav button').forEach(b => b.onclick = () => tela(b.dataset.tela));
  const modo = () => (document.querySelector('input[name=modo]:checked') || {}).value || 'carrossel';
  const textoBotao = () => { $('#gerar').textContent = {carrossel: 'Gerar carrosséis', roteiro: 'Gerar roteiros', dois: 'Gerar carrosséis e roteiros'}[modo()]; };
  document.querySelectorAll('input[name=modo]').forEach(r => r.onchange = textoBotao); textoBotao();
  $('#gerar').onclick = async () => {
    const link = linkPadrao($('#link').value);
    if (!link) return alert('Cole um link do YouTube.');
    const inicio = Math.max(0, Number($('#minuto').value || 0)) * 60, longo = $('#longo').checked;
    if (modo() === 'roteiro') return Roteiro.gerar(link, inicio, longo);
    await gerar(link, inicio, longo);
    if (modo() === 'dois') await Roteiro.gerar(link, inicio, longo);
  };
  const mostrarMinuto = () => { $('#blocominuto').hidden = !$('#longo').checked; };
  $('#longo').onchange = mostrarMinuto; mostrarMinuto();
  $('#chave').value = chave();
  $('#salvarchave').onclick = () => { localStorage.setItem('gemini', $('#chave').value.trim()); alert('Chave salva só neste celular.'); tela('novo'); };
  $('#testar').onclick = async () => {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', {headers: {'x-goog-api-key': $('#chave').value.trim()}});
    alert(r.ok ? 'A chave funciona! ✅' : `A chave não funcionou (${r.status}).`);
  };
  $('#voltar').onclick = () => tela('lista');
  $('#apagarpostados').onclick = async () => {
    const postados = (await todos()).filter(i => i.postado);
    if (!confirm(`Apagar do celular os ${postados.length} carrosséis marcados como postados? (não dá para desfazer)`)) return;
    for (const i of postados) await apagar(i.id);
    mostrarLista();
  };
  $('#apagartodos').onclick = async () => {
    const n = (await todos()).length;
    if (!confirm(`Apagar do celular TODOS os ${n} carrosséis? (não dá para desfazer)`)) return;
    await tx('readwrite', s => s.clear());
    mostrarLista();
  };
  $('#compartilhar').onclick = () => {
    // o share tem de sair JÁ no toque: qualquer alert/espera antes faz o Android recusar
    const files = arquivos();
    if (!(navigator.canShare && navigator.canShare({files})))
      return alert('Este navegador não compartilha imagens. Use "Baixar imagens".');
    const copia = copiarLegenda();
    navigator.share({files}).catch(e => { if (e.name !== 'AbortError') alert('Não deu para compartilhar: ' + e.message); });
    copia.then(ok => aviso(ok ? 'Legenda copiada: no Instagram, escolha "Feed" e cole a legenda.' : ''));
    setTimeout(() => aviso(''), 8000);
  };
  $('#baixar').onclick = () => arquivos().forEach(f => {
    const a = document.createElement('a'); a.href = url(f); a.download = `${atual.conteudo.tema} - ${f.name}`; a.click();
  });
  $('#copiar').onclick = async () => alert(await copiarLegenda() ? 'Legenda copiada!' : 'Selecione o texto e copie à mão.');
  $('#legenda').onchange = async () => { atual.conteudo.legenda = $('#legenda').value; await salvar(atual); };
  $('#marcar').onclick = async () => { atual.postado = !atual.postado; await salvar(atual); abrir(atual.id); };
  $('#excluir').onclick = async () => {
    if (confirm('Excluir este carrossel do celular? (não dá para desfazer)')) { await apagar(atual.id); tela('lista'); }
  };
  mostrarFila();
  await Roteiro.iniciar();
  tela(chave() ? 'lista' : 'config');
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
iniciar().catch(e => alert('Erro ao abrir o app: ' + e.message));
