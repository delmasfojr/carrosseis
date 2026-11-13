/* App de celular do gerador de carrosséis @delmaosimplifica.
   Tudo roda no próprio celular: a chave do Gemini fica só aqui (localStorage),
   os carrosséis ficam guardados no aparelho (IndexedDB). */
const BASE = new URL('./', location.href).href;
const MODELOS = ['gemini-3.5-flash', 'gemini-flash-latest', 'gemini-3.8-flash', 'gemini-3-flash-preview'];
const BLOCO = 30 * 60;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
let DESENHOS = new Set(), PROMPT = '';

/* ---------------------------------------------------------------- guardar no aparelho */
const banco = new Promise((ok, erro) => {
  const r = indexedDB.open('carrosseis', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('c', {keyPath: 'id'});
  r.onsuccess = () => ok(r.result); r.onerror = () => erro(r.error);
});
async function tx(modo, f) {
  const db = await banco;
  return new Promise((ok, erro) => {
    const t = db.transaction('c', modo), st = t.objectStore('c'), r = f(st);
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
  capa: obj({linha1: S, linha2: S, subtitulo: S, questao_rotulo: S, questao_destaque: S, questao_emoji: S, frase: S, pose: POSE}),
  regra: obj({linha1: S, linha2: S, texto: S, itens: lista(obj({emoji: S, pergunta: S, nota: S})), frase: S, pose: POSE}),
  exemplo: obj({linha1: S, linha2: S, enunciado: S, emoji: S, pergunta: S, passos: lista(S), resposta: S, pose: POSE}),
  resumo: obj({linha1: S, linha2: S, destaque: S, etapas: lista(obj({emoji: S, rotulo: S})), frase: S, pose: POSE}),
  cta_frase: S, legenda: S,
}))});
const mmss = s => s >= 3600 ? `${Math.floor(s / 3600)}h${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}` : `${Math.floor(s / 60)} min`;

async function pedirAoGemini(link, inicio, fim, aviso) {
  let prompt = PROMPT;
  if (DESENHOS.size) prompt += '\n\nDESENHOS: nos campos "emoji" e "questao_emoji", prefira escrever o NOME EXATO de um ' +
    'desenho desta lista (o que melhor ilustrar o card, sem repetir no mesmo carrossel). ' +
    'Só use um emoji se nenhum desenho combinar.\nLista: ' + [...DESENHOS].sort().join(', ');
  const video = {fileData: {fileUri: link}};
  if (inicio != null) {
    video.videoMetadata = {startOffset: `${inicio}s`, endOffset: `${fim}s`};
    prompt += `\n\nATENÇÃO: você recebeu só um TRECHO de um vídeo longo (de ${mmss(inicio)} até ${mmss(fim)}). ` +
      'Use apenas o que aparece neste trecho.';
  }
  const corpo = JSON.stringify({
    contents: [{parts: [video, {text: prompt}]}],
    generationConfig: {responseMimeType: 'application/json', responseSchema: ESQUEMA, temperature: 0.7,
      mediaResolution: 'MEDIA_RESOLUTION_LOW'},
  });
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
      if (r.ok) return JSON.parse(JSON.parse(texto).candidates[0].content.parts[0].text).carrosseis;
      ultimo = `${modelo} (${r.status}): ${texto.slice(0, 300)}`;
      if (r.status === 400 && inicio != null) {  // o trecho começa depois do fim do vídeo
        const e = new Error('O vídeo é mais curto que o trecho pedido.'); e.trecho = true; throw e;
      }
      if (![404, 429, 500, 503].includes(r.status)) throw new Error(ultimo);  // ex.: chave errada
    }
    if (rodada === 0) { aviso('Todos os modelos ocupados; tentando de novo em 60 s…'); await new Promise(r => setTimeout(r, 60000)); }
  }
  throw new Error('O Gemini não respondeu. Tente mais tarde.\n' + ultimo);
}

/* ---------------------------------------------------------------- desenhar os cards */
let fonteCSS = null;
const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
async function desenharCard(conteudo, n) {
  const ifr = document.createElement('iframe');
  ifr.style.cssText = 'position:fixed;left:-4000px;top:0;width:1080px;height:1350px;border:0';
  document.body.appendChild(ifr);
  ifr.srcdoc = Cards.html(conteudo, n, BASE, DESENHOS)
    .replace('</body>', `<script src="${BASE}vendor/html-to-image.js"><\/script></body>`);
  try {
    const t0 = Date.now();
    while (!(ifr.contentWindow && ifr.contentWindow.AJUSTADO && ifr.contentWindow.htmlToImage)) {
      if (Date.now() - t0 > 30000) throw new Error('O card ' + n + ' não carregou.');
      await new Promise(r => setTimeout(r, 100));
    }
    const w = ifr.contentWindow, no = w.document.querySelector('.card');
    if (!fonteCSS) fonteCSS = await w.htmlToImage.getFontEmbedCSS(no);
    const op = {width: 1080, height: 1350, pixelRatio: 1, fontEmbedCSS: fonteCSS};
    if (IOS) await w.htmlToImage.toBlob(no, op);  // o Safari às vezes erra as imagens na 1ª vez
    return await w.htmlToImage.toBlob(no, op);
  } finally { ifr.remove(); }
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
    for (const [k, conteudo] of carrosseis.entries()) {
      const item = {id: `${Date.now()}-${k}`, criado: new Date().toISOString(), link, conteudo};
      await desenharCarrossel(item, aviso);
    }
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
  $('#itens').innerHTML = itens.map(i => `<button class="cartao ${i.postado ? 'postado' : ''}" data-id="${i.id}">
    <img src="${url(i.imagens[0])}" alt=""><span><b>${esc(i.conteudo.tema)}</b><small>${new Date(i.criado).toLocaleDateString('pt-BR')}${i.postado ? ' · postado ✓' : ''}</small></span></button>`).join('');
  $('#itens').querySelectorAll('.cartao').forEach(b => b.onclick = () => abrir(b.dataset.id));
}

let atual = null;
async function abrir(id) {
  atual = await um(id);
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
  [PROMPT, DESENHOS] = await Promise.all([
    fetch(BASE + 'prompt.md').then(r => r.text()),
    fetch(BASE + 'desenhos.json').then(r => r.json()).then(l => new Set(l)),
  ]);
  document.querySelectorAll('nav button').forEach(b => b.onclick = () => tela(b.dataset.tela));
  $('#gerar').onclick = () => {
    const link = linkPadrao($('#link').value);
    if (!link) return alert('Cole um link do YouTube.');
    gerar(link, Math.max(0, Number($('#minuto').value || 0)) * 60, $('#longo').checked);
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
  $('#compartilhar').onclick = async () => {
    const copiou = await copiarLegenda();
    const files = arquivos();
    if (navigator.canShare && navigator.canShare({files})) {
      if (copiou) alert('A legenda foi copiada. No Instagram, é só colar.');
      try { await navigator.share({files}); } catch (e) { if (e.name !== 'AbortError') alert('Não deu para compartilhar: ' + e.message); }
    } else alert('Este navegador não compartilha imagens. Use "Baixar imagens".');
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
  tela(chave() ? 'lista' : 'config');
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
iniciar().catch(e => alert('Erro ao abrir o app: ' + e.message));
