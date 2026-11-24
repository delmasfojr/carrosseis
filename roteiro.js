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
  const FALAS_SEGUIR = ['Segue o Delmão Simplifica aí, que tem mais macete desse.', 'Me segue aí, que amanhã tem outro.',
    'Gostou? Segue o Delmão Simplifica, que a gente vai junto.', 'Bora junto, segue o Delmão Simplifica.'];
  // o professor fala "você" inteiro, nunca "cê"
  const semCe = t => String(t || '').replace(/(?<!\p{L})cê(?!\p{L})/giu, x => x[0] === 'C' ? 'Você' : 'você');
  function garantirSeguir(roteiros) {
    for (const [n, r] of roteiros.entries()) {
      r.ganchos = (r.ganchos || []).map(semCe); for (const b of r.blocos || []) b.fala = semCe(b.fala);
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

  /* ---------------------------------------------------------------- duração escolhida pelo professor */
  const DURACOES = {30: '30 s', 45: '45 s', 60: '1 min', 90: '1min30', 120: '2 min', 180: '3 min'};
  const duracaoEscolhida = () => { const n = Number(localStorage.getItem('duracao')); return DURACOES[n] ? n : 45; };
  function regraDuracao(seg = duracaoEscolhida()) {
    const rot = DURACOES[seg] || `${seg} s`, nb = Math.max(4, Math.round((seg - 3) / 8));
    return `

DURAÇÃO ESCOLHIDA PELO PROFESSOR: ${rot} (vale ACIMA da regra 7, do número de blocos e do limite de caracteres da fala)
- Fala total: cerca de ${Math.round(seg * 2.5)} palavras (2,5 por segundo), contando o gancho.
- blocos: cerca de ${nb} blocos (sem contar o gancho), cada um com 5 a 10 s de fala (até ${seg > 60 ? 220 : 160} caracteres).
- tempo de cada bloco coerente com essa duração; duracao: "${rot}".` + (seg >= 60 ? `
- Vídeo mais longo: a cada 15 a 20 s, uma virada que renova a curiosidade ("mas tem um detalhe…", "agora vem o pulo do gato",
  "e aqui quase todo mundo erra"). O tempo a mais é para explicar com calma, passo a passo, nunca para repetir ou enrolar.` : '');
  }

  /* ---------------------------------------------------------------- 📄 questão de um PDF (ou foto) */
  // PDF pequeno vai inteiro (o Gemini lê texto e imagens). PDF grande (ex.: prova digitalizada de 35 MB) ou com página indicada:
  // as páginas viram imagens aqui no aparelho (pdf.js) e vão como fotos, então as figuras das questões continuam legíveis.
  const LIMITE_INLINE = 14 * 1024 * 1024;
  const b64 = async blob => { const u = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  async function paginasComoImagens(arquivo, pagina, avisar) {
    const pdfjs = await import(BASE + 'vendor/pdfjs/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = BASE + 'vendor/pdfjs/pdf.worker.min.mjs';
    const doc = await pdfjs.getDocument({data: new Uint8Array(await arquivo.arrayBuffer()), isEvalSupported: false}).promise;
    const n = doc.numPages;
    let nums = pagina ? [pagina, pagina + 1].filter(x => x >= 1 && x <= n) : Array.from({length: n}, (_, i) => i + 1);
    if (!nums.length) throw new Error(`o PDF tem ${n} páginas; a página ${pagina} não existe.`);
    if (nums.length > 40) throw new Error(`o PDF tem ${n} páginas. Diga em que página está a questão (campo "Página").`);
    // página indicada: alta resolução (a figura sai nítida); PDF inteiro: o bastante para ler texto e figuras
    for (const [larg, qual] of (pagina ? [[2400, 0.88], [1800, 0.82]] : [[1200, 0.75], [1000, 0.68], [800, 0.6]])) {
      const partes = []; let total = 0;
      for (const [i, p] of nums.entries()) {
        avisar(`Preparando a página ${p} (${i + 1} de ${nums.length})…`);
        const pg = await doc.getPage(p), v0 = pg.getViewport({scale: 1}), v = pg.getViewport({scale: larg / v0.width});
        const cv = Object.assign(document.createElement('canvas'), {width: Math.round(v.width), height: Math.round(v.height)});
        const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height);
        await pg.render({canvasContext: cx, viewport: v}).promise;
        const dado = cv.toDataURL('image/jpeg', qual).split(',')[1];
        total += dado.length;
        partes.push({text: `Página ${p} do documento:`}, {inlineData: {mimeType: 'image/jpeg', data: dado}});
      }
      if (total < 15 * 1024 * 1024) return partes;
    }
    throw new Error('o PDF é grande demais. Diga em que página está a questão (campo "Página").');
  }
  async function partesDoArquivo(arquivo, pagina, avisar) {
    if (/^image\//.test(arquivo.type)) {
      if (arquivo.size > LIMITE_INLINE) throw new Error('a foto é grande demais (mais de 14 MB).');
      return [{inlineData: {mimeType: arquivo.type, data: await b64(arquivo)}}];
    }
    if (!pagina && arquivo.size <= LIMITE_INLINE) return [{inlineData: {mimeType: 'application/pdf', data: await b64(arquivo)}}];
    return paginasComoImagens(arquivo, pagina, avisar);
  }
  const ROTEIRO_OBJ = ESQUEMA.properties.roteiros.items;
  const ESQUEMA_PDF = obj({prova_citada: S, questao: obj({achou: {type: 'BOOLEAN'}, numero: S, pagina: S, enunciado: S, figura_descricao: S,
    alternativas: S, resolucao: S, resposta: S, gabarito_documento: S, confere: {type: 'STRING', enum: ['sim', 'nao', 'sem_gabarito']}, alerta: S,
    figura_pagina: {type: 'INTEGER'}, figura_caixa: lista({type: 'NUMBER'}), questao_pagina: {type: 'INTEGER'}, questao_caixa: lista({type: 'NUMBER'})}),
    roteiros: lista(ROTEIRO_OBJ)});
  ESQUEMA_PDF.propertyOrdering = ['prova_citada', 'questao', 'roteiros'];
  ESQUEMA_PDF.properties.questao.propertyOrdering = ['achou', 'numero', 'pagina', 'enunciado', 'figura_descricao', 'alternativas', 'resolucao', 'resposta', 'gabarito_documento', 'confere', 'alerta', 'figura_pagina', 'figura_caixa', 'questao_pagina', 'questao_caixa'];
  async function acharPagina(arquivo, numero, obs) {
    const partes = await partesDoArquivo(arquivo, 0, aviso);
    aviso('📄 Procurando a questão no arquivo…');
    const corpo = JSON.stringify({contents: [{parts: [...partes, {text: `Em que página deste documento está a questão número ${numero}
(a que o documento numera como ${numero}: "QUESTÃO ${numero}", "${numero}.", "${numero})" etc.)?${obs ? ` Dica do professor: "${obs}".` : ''}
pagina = número da página no ARQUIVO, contando a partir de 1 (se as páginas vieram como imagens, é o número escrito antes de cada imagem).
Se a questão começa numa página e continua na outra, dê a primeira. achou = false se ela não estiver no documento.`}]}],
      generationConfig: {responseMimeType: 'application/json', temperature: 0,
        responseSchema: {type: 'OBJECT', properties: {achou: {type: 'BOOLEAN'}, pagina: {type: 'INTEGER'}}, required: ['achou', 'pagina']}}});
    const r = await chamarGemini(corpo, t => aviso('📄 ' + t));
    return r.achou && r.pagina > 0 ? r.pagina : 0;
  }
  const letraDe = r => { const m = String(r || '').toUpperCase().match(/(?:^|[^A-Z])([A-E])(?:\)|\s|$|[^A-Z])/); return m ? m[1] : String(r || '').trim(); };
  async function resolverDeNovo(partes, numero, modelos, n) {
    const corpo = JSON.stringify({contents: [{parts: [...partes, {text: `Resolva a questão número ${numero} deste documento, sozinho, do zero.
1. Primeiro DESCREVA a figura em figura: onde está cada ponto/objeto, de onde sai e aonde chega cada linha, o que cada medida indica
   (com as coordenadas). Confira essa descrição com a imagem antes de seguir.
2. Depois resolva em resolucao, passo a passo, numerado. A resposta TEM DE SAIR DA CONTA: proibido escolher alternativa por eliminação
   ou por "parecer coerente". Confira por um segundo caminho. Ignore marcas de caneta de quem fez a prova.
3. resposta: a letra e o valor (ex.: "C) 58").`}]}],
      generationConfig: {responseMimeType: 'application/json', temperature: 0.3, responseSchema: {type: 'OBJECT',
        properties: {figura: {type: 'STRING'}, resolucao: {type: 'STRING'}, resposta: {type: 'STRING'}}, required: ['figura', 'resolucao', 'resposta'],
        propertyOrdering: ['figura', 'resolucao', 'resposta']}}});
    return chamarGemini(corpo, t => aviso(`🔎 Conferência ${n} de 2: ` + t), false, modelos);
  }
  // Votação: a resolução principal + 2 conferências independentes, cada uma num modelo diferente (o mesmo modelo tende a repetir o mesmo erro).
  async function conferirResolucao(partes, numero, questao) {
    const ordens = [[...MODELOS_PRO, ...MODELOS_CONFERE], [...MODELOS_PRO, ...MODELOS_CONFERE.slice(1), MODELOS_CONFERE[0]]];
    const extras = [];
    for (const [n, ordem] of ordens.entries()) {
      try { extras.push(await resolverDeNovo(partes, numero, ordem, n + 1)); } catch (e) { extras.push({erro: e.message}); }
    }
    const votos = [questao.resposta, ...extras.filter(x => !x.erro).map(x => x.resposta)].map(letraDe);
    const conta = {}; votos.forEach(v => { conta[v] = (conta[v] || 0) + 1; });
    const [maioria, nMaioria] = Object.entries(conta).sort((a, b) => b[1] - a[1])[0] || ['', 0];
    return {votos: votos.length, maioria, nMaioria, unanime: votos.length === 3 && nMaioria === 3,
      principalNaMaioria: letraDe(questao.resposta) === maioria && nMaioria >= 2, extras};
  }
  async function pedirPdf(arquivo, numero, pagina, obs, res) {
    // PDF sem página informada: primeiro acha a página; depois só ela (e a seguinte) vai em alta resolução,
    // para a IA enxergar os detalhes da figura (com 30 páginas de uma vez, cada figura chega pequena demais)
    if (!pagina && !/^image\//.test(arquivo.type)) {
      pagina = await acharPagina(arquivo, numero, obs);
      if (!pagina) throw new Error(`não achei a questão ${numero} no arquivo. Confira o número ou diga a página.`);
    }
    const partes = await partesDoArquivo(arquivo, pagina, aviso);
    const prompt = PROMPT_R + SO_VISUAL + `

NÃO HÁ VÍDEO DO YOUTUBE NESTE PEDIDO (vale acima de tudo o que fala em "vídeo enviado")
O professor mandou um DOCUMENTO (PDF ou foto de uma prova/lista) e quer um Reels resolvendo UMA questão dele:
a questão número ${numero}${pagina ? ` (na página ${pagina} do arquivo)` : ''}.${obs ? `\nObservação do professor: """${obs}"""` : ''}

1. ACHE a questão${pagina ? ` (ela está na página ${pagina} enviada)` : ''}: é a que o documento numera como ${numero} ("QUESTÃO ${numero}", "${numero}.", "${numero})" etc.), não a ${numero}ª que
   aparece na página. Se não achar, achou = false e explique em enunciado o que encontrou; o resto pode ficar vazio.
2. LEIA TUDO, inclusive as IMAGENS: figura, gráfico, tabela, desenho, mapa. Dados que só aparecem na figura (medidas, rótulos,
   ângulos, posições, valores de eixos) são essenciais: transcreva TODOS em figura_descricao, com a posição de cada coisa,
   de um jeito que dê para redesenhar a figura sem vê-la. Se algum dado da figura estiver ilegível, diga qual.
3. enunciado: o enunciado completo com suas palavras e todos os dados (sem as alternativas). alternativas: "A) … B) …" ou "" se for aberta.
${res ? `4. NÃO RESOLVA SOZINHO. A resolução CERTA, conferida pelo professor, é esta:
"""${res}"""
   Organize-a em resolucao (passo a passo, numerado, com os MESMOS números e o MESMO caminho) e copie a resposta dela em resposta
   (letra e valor). O roteiro segue EXATAMENTE essa resolução. Se algo nela parecer errado ou não bater com a questão, NÃO corrija:
   explique em alerta (senão alerta = ""). Ignore o item 4b.
4b. ` : '4. '}RESOLVA passo a passo em resolucao (texto corrido, numerado), conferindo cada conta duas vezes. resposta: a letra e o valor.
   A resposta TEM DE SAIR DA CONTA. Proibido escolher alternativa por eliminação, por "parecer coerente" ou testando a alternativa
   e achando que "encaixa". Antes de responder, confira por um SEGUNDO caminho (ex.: refaça o último trecho de trás para frente,
   ou substitua o resultado nos dados). Se os dois caminhos não baterem, releia a figura: a posição de cada ponto importa.
   Antes de resolver, monte a figura em coordenadas (onde está cada ponto, de onde sai e aonde chega cada linha) e confira com a imagem.
5. GABARITO: só vale um gabarito IMPRESSO no documento (página ou tabela de gabarito, "Resposta: C" impresso no fim da lista).
   Marcas de caneta, letras riscadas, círculos ou rabiscos de quem fez a prova NÃO são gabarito: ignore-as por completo
   (inclusive na resolução). Achou gabarito impresso: copie em gabarito_documento e diga em confere se bate ("sim"/"nao");
   se não bater, revise a resolução. Não achou: gabarito_documento = "" e confere = "sem_gabarito". Nunca invente gabarito.
6. pagina: em que página do arquivo a questão está.
6b. figura_pagina e figura_caixa: se a questão tem figura, gráfico ou tabela, a página dela (o número escrito antes da imagem) e a caixa
   da figura nessa imagem, [ymin, xmin, ymax, xmax] de 0 a 1000, pegando a figura inteira com os rótulos e medidas (sem o texto
   do enunciado nem as alternativas). Sem figura: figura_pagina = 0 e figura_caixa = [].
6c. questao_pagina e questao_caixa: a página e a caixa da QUESTÃO INTEIRA como está na prova, do título ("QUESTÃO ${numero}") até a
   última alternativa, com enunciado, figura e alternativas, [ymin, xmin, ymax, xmax] de 0 a 1000. Ela vai aparecer no vídeo
   do jeito que está na prova, então não corte nada dela nem pegue pedaço de outra questão.
7. Faça EXATAMENTE 1 roteiro: o Reels da RESOLUÇÃO dessa questão (não um macete genérico).
   - A QUESTÃO DA PROVA aparece inteira na tela durante o gancho: os ganchos convidam a olhar e tentar ("Olha essa questão do
     ENEM: pausa e tenta antes de eu resolver!"), até 110 caracteres.
   - Gancho que prende ligado à questão ("A questão que derrubou metade da sala…"). prova_citada: a prova que o documento diz
     ser (ENEM, Fuvest, concurso…), ou "" se o documento não disser; só cite essa.
   - Os blocos seguem a resolução, um passo por bloco, na ordem; o penúltimo revela a resposta (a letra).
   - O vídeo terá uma FIGURA ANIMADA desenhada no ritmo da fala: na fala, diga os NÚMEROS e os NOMES das partes da figura
     (ex.: "a bola branca", "a tabela de baixo", "o lado de 6 metros") no momento em que eles importam.
   - Não leia o enunciado inteiro: resuma os dados que importam, em frases curtas.` + regraDuracao();
    const corpo = JSON.stringify({contents: [{parts: [...partes, {text: prompt}]}],
      generationConfig: {responseMimeType: 'application/json', responseSchema: ESQUEMA_PDF, temperature: 0.4}});
    const r = await chamarGemini(corpo, aviso, false, [...MODELOS_PRO, ...MODELOS]);
    if (!r.questao || r.questao.achou === false) throw new Error(`não achei a questão ${numero}. ` + ((r.questao && r.questao.enunciado) || '') + '\nTente informar a página.');
    if (res) r.questao.conferencia = {professor: true};  // a resolução é do professor: não há o que votar
    else try { r.questao.conferencia = await conferirResolucao(partes, numero, r.questao); } catch (e) { r.questao.conferencia = {erro: e.message}; }
    return {questao: r.questao, roteiros: garantirSeguir(limparProvas(r, 'roteiros')).slice(0, 1), partes};
  }
  // recorta um pedaço ORIGINAL da página (a questão inteira ou só a figura): é a própria prova, 100% fiel.
  // Foto de uma questão sem caixa: a foto inteira.
  async function recortarFigura(partes, pagina, caixa) {
    const cx = caixa || [];
    const fotos = partes.filter(x => x.inlineData && /^image\//.test(x.inlineData.mimeType));
    const inteira = cx.length !== 4 && fotos.length === 1 && !partes.some(x => x.text && /^Página/.test(x.text));
    if (inteira) return new Blob([Uint8Array.from(atob(fotos[0].inlineData.data), c => c.charCodeAt(0))], {type: fotos[0].inlineData.mimeType});
    if (cx.length !== 4 || !(cx[2] > cx[0] && cx[3] > cx[1]) || (cx[2] - cx[0]) * (cx[3] - cx[1]) < 4000) return null;
    const questao = {figura_pagina: pagina};
    let img = null;
    for (let i = 0; i < partes.length; i++) {
      const pt = partes[i];
      if (!pt.inlineData || !/^image\//.test(pt.inlineData.mimeType)) continue;
      const rot = partes[i - 1] && partes[i - 1].text, m = rot && rot.match(/Página (\d+)/);
      if (!img || (m && Number(m[1]) === questao.figura_pagina)) img = pt.inlineData;
    }
    if (!img) return null;
    const im = new Image(); im.src = `data:${img.mimeType};base64,${img.data}`; await im.decode();
    const folga = 12, y0 = Math.max(0, cx[0] / 1000 * im.height - folga), x0 = Math.max(0, cx[1] / 1000 * im.width - folga);
    const y1 = Math.min(im.height, cx[2] / 1000 * im.height + folga), x1 = Math.min(im.width, cx[3] / 1000 * im.width + folga);
    const cv = Object.assign(document.createElement('canvas'), {width: Math.round(x1 - x0), height: Math.round(y1 - y0)});
    cv.getContext('2d').drawImage(im, x0, y0, x1 - x0, y1 - y0, 0, 0, cv.width, cv.height);
    return new Promise(ok => cv.toBlob(ok, 'image/jpeg', 0.9));
  }
  function resumoVotos(cf, questao) {
    if (cf && cf.professor) return questao.alerta ? `⚠️ A IA achou algo estranho na sua resolução: ${questao.alerta}` : '✅ Resolução sua: a IA só montou o vídeo em cima dela.';
    if (!cf || !cf.votos || cf.votos < 2) return '⚠️ As conferências não saíram (Gemini ocupado): confira você.';
    const outras = (cf.extras || []).filter(x => !x.erro).map(x => x.resposta).join(' e ');
    if (cf.unanime) return '✅ 3 resoluções independentes deram a mesma resposta.';
    if (cf.principalNaMaioria) return `⚠️ ${cf.nMaioria} de ${cf.votos} resoluções deram ${cf.maioria}; as conferências deram ${outras}. Dê uma olhada.`;
    if (cf.nMaioria >= 2) return `⚠️ A MAIORIA (${cf.nMaioria} de ${cf.votos}) deu ${cf.maioria}, diferente do roteiro (${questao.resposta}). Confira antes de gravar!`;
    return `⚠️ As resoluções deram respostas diferentes (${questao.resposta} e ${outras}). Confira com calma antes de gravar!`;
  }
  async function gerarPdf(arquivo, numero, pagina, obs, res = '') {
    if (!chave()) { tela('config'); return alert('Primeiro cole a sua chave do Gemini.'); }
    $('#gerar').disabled = true;
    try {
      aviso('📄 Lendo o arquivo…');
      const {questao, roteiros, partes} = await pedirPdf(arquivo, numero, pagina, obs, res);
      const conteudo = roteiros[0];
      const item = {id: `${Date.now()}-0`, criado: new Date().toISOString(), link: '', assunto: `Questão ${numero} de ${arquivo.name}`,
        conteudo, gancho: 0, visual: true, edicao: {soVoz: true}, questao,
        enunciado: [questao.enunciado, questao.alternativas, questao.figura_descricao ? 'FIGURA: ' + questao.figura_descricao : ''].filter(Boolean).join('\n')};
      // a figura animada já sai junto, presa às palavras do roteiro (o professor lê o roteiro ao gravar)
      try {
        aviso('📐 Desenhando a figura da questão…');
        const falas = [conteudo.ganchos[0], ...conteudo.blocos.map(b => b.fala)];
        const textoBlocos = falas.map((f, k) => `Bloco ${k + 1}: "${f}"`).join('\n');
        const r = await Gravador.pedirFigura(conteudo.tema, item.enunciado + '\nRESOLUÇÃO: ' + questao.resolucao, textoBlocos, aviso,
          partes.filter(x => x.inlineData && /^image\//.test(x.inlineData.mimeType)));
        item.figura = r.figura;
        const usados = new Set(r.figura.camadas.map(cm => (cm.bloco || 1) - 1)), ult = Math.max(...usados);
        item.estilo = falas.map((_, k) => (k <= ult && (usados.has(k) || k > 0)) ? {layout: 'figura'} : {});
        for (const x of r.contas) {
          const k = x.bloco - 1, conta = String(x.conta || '').slice(0, 40);
          if (k === 0) conteudo.gancho_quadro = conta; else if (conteudo.blocos[k - 1]) conteudo.blocos[k - 1].quadro = conta;
        }
      } catch (e) { item.erroFigura = e.message; }
      // gancho com a figura ORIGINAL da prova (recortada da página); a figura animada entra a partir do bloco 2
      try {
        const q = await recortarFigura(partes, questao.questao_pagina, questao.questao_caixa);  // a questão inteira, como na prova
        const real = await recortarFigura(partes, questao.figura_pagina, questao.figura_caixa);  // só a figura
        item.imagens = {...(q ? {questao: q} : {}), ...(real ? {real} : {})};
        const mostra = q ? 'questao' : real ? 'real' : null;
        if (mostra) {
          item.estilo = item.estilo || [];
          // gancho = a questão como está na prova, num cartão entre o título (no topo) e a legenda (embaixo)
          item.estilo[0] = {layout: 'questao', questaoImg: mostra, posTitulo: 'topo', tamTitulo: 'M'};
          conteudo.gancho_quadro = '';
        }
      } catch (e) { /* sem o recorte: o gancho fica com a figura animada */ }
      // o último bloco (comentar + seguir) fecha com o mascote, sem figura (o joinha não cobre a conta)
      if (item.estilo && item.estilo.length > 1) item.estilo[item.estilo.length - 1] = {layout: 'visual', pose: 'joinha'};
      const ehConta = q => /\d/.test(q || '') && String(q).length <= 30 && !/@/.test(q);
      if (!ehConta(conteudo.gancho_quadro)) conteudo.gancho_quadro = '';
      for (const b of conteudo.blocos) if (!ehConta(b.quadro)) b.quadro = '';
      await salvarR(item);
      aviso('');
      const cf = questao.conferencia || {};
      const conf = (questao.confere === 'sim' ? '✅ Bate com o gabarito do documento.' : questao.confere === 'nao' ? '⚠️ NÃO bate com o gabarito do documento: confira!' : 'O documento não trouxe gabarito.')
        + '\n' + resumoVotos(cf, questao);
      alert(`Pronto! Questão ${numero}: resposta ${questao.resposta}.\n${conf}` + (item.erroFigura ? `\n(A figura não saiu: ${item.erroFigura}. Dá para desenhar depois no editor.)` : '\nA figura animada já está montada.'));
      tela('roteiros'); abrir(item.id);
    } catch (e) {
      aviso('');
      alert('Deu erro: ' + e.message);
    } finally { $('#gerar').disabled = false; }
  }

  async function pedir(link, inicio, fim) {
    const video = {fileData: {fileUri: link}};
    let prompt = PROMPT_R + (soVisual() ? SO_VISUAL : '') + regraDuracao();
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
- prova_citada: "" e não cite prova nenhuma, a não ser que o assunto acima cite.` + regraDuracao();
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
      <b>${i.robo ? '🤖 ' : ''}${i.visual ? '🎨 ' : ''}${esc(i.conteudo.tema)}</b>
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
      ${atual.questao ? `<div class="bloco rquestao"><b>📄 Questão ${esc(atual.questao.numero)}</b> · resposta da IA: <b>${esc(atual.questao.resposta)}</b><br>
        <small>${atual.questao.confere === 'sim' ? '✅ bate com o gabarito do documento' : atual.questao.confere === 'nao' ? '⚠️ NÃO bate com o gabarito do documento (' + esc(atual.questao.gabarito_documento) + '): confira!' : 'o documento não trouxe gabarito'}</small>
        ${(cf => !cf ? '' : `<br>${cf.unanime || (cf.professor && !atual.questao.alerta) ? '<small>' : '<b style="color:#c0392b">'}${esc(resumoVotos(cf, atual.questao))}${cf.unanime || (cf.professor && !atual.questao.alerta) ? '</small>' : '</b>'}
          ${(cf.extras || []).map((x, n) => x.erro ? '' : `<details><summary>Conferência ${n + 1}: ${esc(x.resposta)}</summary>
            <p style="white-space:pre-wrap"><b>Figura:</b> ${esc(x.figura)}\n\n${esc(x.resolucao)}</p></details>`).join('')}`)(atual.questao.conferencia)}
        ${atual.imagens && (atual.imagens.questao || atual.imagens.real) ? `<img id="rfigreal" style="width:100%;margin:8px 0;border-radius:8px;border:1px solid #ddd" alt="questão da prova"><small>${atual.imagens.questao ? 'A questão como está na prova' : 'Figura original da prova'}: aparece no gancho do vídeo.</small>` : ''}
        <details><summary>Enunciado e figura (como a IA leu)</summary><p style="white-space:pre-wrap">${esc(atual.enunciado || '')}</p></details>
        <details><summary>Resolução da IA</summary><p style="white-space:pre-wrap">${esc(atual.questao.resolucao)}</p></details>
        ${atual.figura ? '<small>📐 Figura animada pronta: grave a voz lendo o roteiro.</small>' : atual.erroFigura ? '<small>📐 A figura não saiu; dá para desenhar no editor.</small>' : ''}</div>` : ''}
      ${atual.figura ? `<div class="bloco"><b>📐 Prévia da figura</b> <small>(confira antes de gravar)</small>
        <canvas id="rfigcv" style="width:100%;display:block;margin:8px 0;border-radius:10px"></canvas>
        <div style="display:flex;gap:6px;align-items:center"><button id="rfigant" class="sec" style="flex:0 0 46px">◀</button>
          <small id="rfigtx" style="flex:1;text-align:center"></small><button id="rfigprox" class="sec" style="flex:0 0 46px">▶</button></div>
        <div style="display:flex;gap:6px;margin-top:6px"><button id="rfigx" class="sec" style="flex:1">↔ Espelhar</button><button id="rfigy" class="sec" style="flex:1">↕ Espelhar</button></div></div>` : ''}
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
    if ($('#rfigreal')) $('#rfigreal').src = URL.createObjectURL(atual.imagens.questao || atual.imagens.real);
    if (atual.figura && $('#rfigcv')) {  // prévia da figura: um passo por camada, com a palavra que faz cada uma entrar
      let passo = (atual.figura.camadas || []).length - 1;
      const falas = [c.ganchos[atual.gancho] || c.ganchos[0], ...c.blocos.map(b => b.fala)];
      const mostrar = () => {
        const cs = atual.figura.camadas || []; passo = Math.max(0, Math.min(cs.length - 1, passo));
        Gravador.previaFigura($('#rfigcv'), atual.figura, passo);
        const cm = cs[passo] || {};
        $('#rfigtx').textContent = `Passo ${passo + 1} de ${cs.length} · bloco ${cm.bloco || 1} · ` + (cm.gatilho ? `entra em “${cm.gatilho}”` : 'entra no começo do bloco') +
          (cm.gatilho && !(falas[(cm.bloco || 1) - 1] || '').toLowerCase().includes(String(cm.gatilho).toLowerCase().split(' ')[0]) ? ' ⚠️ palavra não está na fala' : '');
      };
      $('#rfigant').onclick = () => { passo--; mostrar(); };
      $('#rfigprox').onclick = () => { passo++; mostrar(); };
      const espelhar = async e => { atual.figura = Gravador.espelharFigura(atual.figura, e); await salvarR(atual); mostrar(); };
      $('#rfigx').onclick = () => espelhar('x'); $('#rfigy').onclick = () => espelhar('y');
      document.fonts.load('60px Anton').then(mostrar, mostrar);
    }
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

  function segundos(iso) {
    const m = String(iso).match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/) || [];
    return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
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

  /* dois modos: "virais" (termos do professor, ordena por views ÷ inscritos) e "curioso" (conteúdo de matemática:
     sem exigir que tenha viralizado; sorteia temas diferentes a cada busca) */
  const TEMAS = ['curiosidades da matemática', 'história da matemática documentário', 'problemas do milênio matemática', 'hipótese de Riemann explicada',
    'último teorema de Fermat história', 'conjectura de Collatz', 'conjectura de Goldbach', 'números primos mistério', 'infinito Cantor tamanhos de infinito',
    'paradoxos matemáticos', 'paradoxo de Monty Hall', 'proporção áurea verdade ou mito', 'sequência de Fibonacci na natureza', 'número pi curiosidades',
    'teoria dos jogos explicada', 'teoria do caos efeito borboleta', 'fractais Mandelbrot', 'criptografia matemática números primos', 'topologia fita de Möbius',
    'Gödel teorema da incompletude', 'Euler identidade mais bonita', 'Ramanujan história', 'Gauss história matemático', 'Évariste Galois história',
    'Emmy Noether matemática', 'história do zero', 'matemática da música', 'probabilidade contraintuitiva', 'problema das quatro cores', 'geometria não euclidiana',
    'medalha Fields', 'números imaginários origem', 'matemática na inteligência artificial como funciona', 'problema P versus NP'];
  const TEMAS_EN = ['Numberphile', '3Blue1Brown math', 'Veritasium math', 'Quanta Magazine mathematics', 'unsolved math problem explained', 'math paradox explained',
    'history of mathematics documentary', 'beautiful math proof', 'Riemann hypothesis explained', 'Stand-up Maths'];
  const NOVIDADES = ['descoberta matemática', 'inteligência artificial matemática problema resolvido', 'matemáticos provam conjectura'];
  const NOVIDADES_EN = ['new math breakthrough', 'AI solves math problem', 'Riemann hypothesis news', 'mathematicians prove conjecture'];
  const sorteia = (a, n) => a.map(x => [Math.random(), x]).sort((x, y) => x[0] - y[0]).slice(0, n).map(x => x[1]);
  // propaganda de faculdade/curso (as palavras têm de vir no contexto de venda: "universidade" sozinha pode ser aula boa)
  const PROPAGANDA = new RegExp(['inscri[çc](ões|ão)', 'inscreva-se no (curso|vestibular)', 'matr[íi]cul(a|e-se|as) (aberta|abertas|j[áa])', 'matr[íi]culas', 'bolsas? de (estudo|at[ée])',
    '(curso|gradua[çc][ãa]o|faculdade|licenciatura|p[óo]s)[^.]{0,20} (ead|a dist[âa]ncia)', 'vestibular (20\\d\\d|agendado|online|de ver[ãa]o|de inverno)',
    'conhe[çc]a o curso', '(por que|porque|vale a pena) (fazer|cursar|estudar) (o curso|a faculdade|licenciatura|engenharia)', 'curso de (gradua[çc][ãa]o|licenciatura|bacharelado)',
    'processo seletivo', 'aula inaugural', 'cupom', 'black friday', 'lan[çc]amento do curso', 'compre (j[áa]|agora)', 'colação de grau', 'tour pel[ao]', 'mentoria'].join('|'), 'i');
  const PROVA = /enem|vestibular|concurso|quest[ãa]o|JEE|SAT|lista de exerc|resolvid[ao]s? passo/i;
  const FORA = new Set(['10', '20', '17', '2', '15', '19', '23', '24']);  // categorias do YouTube que não são aula: música, jogos, esportes, carros, animais, viagem, humor, entretenimento
  const MATEMATICA = /matem|math|n[úu]mero|number|teorema|theorem|conjectur|hip[óo]tese|hypothesis|equa[çc]|equation|geometr|[áa]lgebra|algebra|primo|prime|infinit|paradox|probabil|fractal|fibonacci|\bpi\b|riemann|euler|gauss|ramanujan|fermat|galois|g[öo]del|cantor|noether|topolog|cripto|crypto|l[óo]gica|logic|prova|proof|collatz|goldbach|\bzero\b|c[áa]lculo|calculus|teoria|theory|fields|p vs|p versus/i;
  const modoV = () => localStorage.getItem('vmodo') === 'curioso' ? 'curioso' : 'virais';
  const guardaV = () => modoV() === 'curioso' ? 'curiosos' : 'virais';
  const vistos = () => new Set(ler('vistos', []));
  function aplicarModoV() {
    const c = modoV() === 'curioso';
    document.querySelectorAll('#vmodo button').forEach(b => b.classList.toggle('on', b.dataset.vm === modoV()));
    $('#vsovirais').hidden = c; $('#vsocurioso').hidden = !c; $('#vshorts').hidden = c;
    $('#periodo').value = c ? '3650' : '30';
    $('#vexpl').textContent = c ? 'Conteúdo de matemática de verdade: história, mistérios, problemas em aberto e novidades. Não precisa ter viralizado. Cada busca sorteia temas diferentes.'
      : 'Vídeos que furaram a bolha: muito mais visualizações que o tamanho do canal.';
    $('#buscar').textContent = c ? '🧠 Buscar curiosidades' : '🔥 Buscar virais';
  }
  function pedidosCuriosos() {  // o que procurar: assunto do professor, ou 3 temas + novidades
    const tema = $('#vtema').value.trim(), en = $('#vingles').checked;
    const pt = {relevanceLanguage: 'pt', regionCode: 'BR'}, ing = {relevanceLanguage: 'en'};
    const recente = {publishedAfter: new Date(Date.now() - 60 * 864e5).toISOString(), nov: 1};
    if (tema) return [{q: tema, ...pt, order: 'relevance'}, {q: tema + ' matemática', ...pt, order: 'date', nov: 1}, ...(en ? [{q: tema + ' mathematics', ...ing, order: 'relevance'}] : [])];
    return [...sorteia(TEMAS, 3).map(q => ({q, ...pt, order: 'relevance'})), {q: sorteia(NOVIDADES, 1)[0], ...pt, ...recente, order: 'relevance'},
      ...(en ? [{q: sorteia(TEMAS_EN, 1)[0], ...ing, order: 'relevance'}, {q: sorteia(NOVIDADES_EN, 1)[0], ...ing, ...recente, order: 'relevance'}] : [])];
  }

  async function buscar() {
    if (!chaveYT()) { tela('config'); return alert('Primeiro cole a sua chave do YouTube (⚙️ no alto, à direita).'); }
    const curioso = modoV() === 'curioso';
    const lista_ = $('#termos').value.split('\n').map(t => t.trim()).filter(Boolean);
    if (!curioso && !lista_.length) return alert('Escreva pelo menos um termo de busca.');
    if (!curioso) gravar('termos', lista_);
    const dias = Number($('#periodo').value), curtos = !curioso && $('#soshorts').checked;
    const depois = new Date(Date.now() - dias * 864e5).toISOString();
    const pedidos = curioso ? pedidosCuriosos()
      : lista_.map(q => ({q, order: 'viewCount', regionCode: 'BR', relevanceLanguage: 'pt', ...(curtos ? {videoDuration: 'short'} : {})}));
    const chaveGuarda = guardaV();
    $('#buscar').disabled = true;
    $('#vlista').innerHTML = `<p class="dica">🔎 ${curioso ? 'Procurando curiosidades de matemática' : 'Buscando os vídeos que estão bombando'}… (uns 10 segundos)</p>`;
    try {
      const ids = new Map();  // id -> é novidade?
      for (const [k, {nov, ...x}] of pedidos.entries()) {
        aviso(`Buscando no YouTube: “${x.q}” (${k + 1} de ${pedidos.length})…`);
        // quem quer só o que ainda não viu busca mais fundo (o YouTube devolve até 50 pelo mesmo preço)
        const r = await yt('search', {part: 'id', type: 'video', publishedAfter: depois, maxResults: 50, ...x});
        r.items.forEach(i => ids.set(i.id.videoId, ids.get(i.id.videoId) || !!nov));
      }
      aviso(curioso ? 'Separando o que é conteúdo…' : 'Calculando quais viralizaram…');
      const videos = [];
      for (const parte of emPartes([...ids.keys()], 50))
        videos.push(...(await yt('videos', {part: 'snippet,statistics,contentDetails', id: parte.join(',')})).items);
      const inscritos = new Map();
      for (const parte of emPartes([...new Set(videos.map(v => v.snippet.channelId))], 50))
        (await yt('channels', {part: 'statistics', id: parte.join(',')})).items
          .forEach(c => inscritos.set(c.id, Number(c.statistics.subscriberCount || 0)));
      const ja = $('#vnovos').checked ? new Set([...vistos(), ...usados()]) : new Set();
      let escondidos = 0;
      const todos = videos.filter(v => {
        if (PROPAGANDA.test(v.snippet.title)) return false;
        if (curioso) {
          const seg_ = segundos(v.contentDetails.duration);
          if (FORA.has(v.snippet.categoryId) && !/^(numberphile|veritasium|3blue1brown)/i.test(v.snippet.channelTitle)) return false;
          if (seg_ < 60 || seg_ > 5400) return false;  // ao vivo em andamento (0 s) e aula de horas ficam fora
          if (PROVA.test(v.snippet.title)) return false;  // resolução de prova não é curiosidade
          const lingua = (v.snippet.defaultAudioLanguage || v.snippet.defaultLanguage || '').slice(0, 2);
          if (lingua && lingua !== 'pt' && !(lingua === 'en' && $('#vingles').checked)) return false;
          if (!MATEMATICA.test(v.snippet.title + ' ' + v.snippet.channelTitle)) return false;
        }
        if (ja.has(v.id)) { escondidos++; return false; }
        return true;
      }).map(v => {
        const views = Number(v.statistics.viewCount || 0), subs = inscritos.get(v.snippet.channelId) || 0;
        const idade = Math.max(1, (Date.now() - new Date(v.snippet.publishedAt)) / 864e5);
        const likes = Number(v.statistics.likeCount || 0);
        return {id: v.id, titulo: v.snippet.title, canal: v.snippet.channelTitle, thumb: (v.snippet.thumbnails.medium || v.snippet.thumbnails.default).url,
          views, subs, dias: Math.round(idade), dur: duracao(v.contentDetails.duration), novidade: ids.get(v.id) && idade <= 60,
          // curiosidade: vale a aprovação de quem viu (curtidas por visualização), não o tamanho. +50 no divisor: 3 views com 3 curtidas não ganha de todo mundo
          gosto: likes / (views + 50),
          // viralizou = muito mais views que o tamanho do canal (piso de 1 000 para canal minúsculo não distorcer)
          vezes: views / Math.max(subs, 1000), comentarios: Number(v.statistics.commentCount || 0)};
      });
      let res;
      if (curioso) {
        const porCanal = new Map();  // no máximo 3 por canal, para variar
        res = todos.filter(v => v.views >= (v.novidade ? 200 : 1000)).sort((a, b) => (b.gosto + (b.novidade ? 0.04 : 0)) - (a.gosto + (a.novidade ? 0.04 : 0)))
          .filter(v => { const n = (porCanal.get(v.canal) || 0) + 1; porCanal.set(v.canal, n); return n <= 3; }).slice(0, 30);
      } else res = todos.filter(v => v.views >= 5000).sort((a, b) => b.vezes - a.vezes).slice(0, 40);
      gravar(chaveGuarda, {quando: new Date().toISOString(), res, escondidos, temas: curioso ? pedidos.map(p => p.q) : null});
      gravar('vistos', [...new Set([...vistos(), ...res.map(v => v.id)])].slice(-2000));
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
    const v = ler(guardaV(), null);
    if (!chaveYT()) {
      $('#vlista').innerHTML = '<p class="dica">Falta a <b>chave do YouTube</b>: toque na <b>⚙️</b> (no alto, à direita), cole a chave na parte “Chave do YouTube” e toque em Salvar.</p>';
      return;
    }
    if ($('#buscar').disabled) return;
    if (!v || Date.now() - new Date(v.quando) > 12 * 3600e3) buscar();
    else mostrarVirais();
  }

  function mostrarVirais() {
    const v = ler(guardaV(), null), u = usados(), curioso = modoV() === 'curioso';
    if (!v) { $('#vlista').innerHTML = `<p class="dica">Toque em <b>${curioso ? '🧠 Buscar curiosidades' : '🔥 Buscar virais'}</b> para ver os vídeos.</p>`; return; }
    const esc_ = v.escondidos ? ` ${v.escondidos} que você já tinha visto ficaram escondidos.` : '';
    if (!v.res.length) { $('#vlista').innerHTML = `<p class="dica">Nada novo nessa busca.${esc_} ${curioso ? 'Busque de novo: saem outros temas.' : 'Escolha um período maior, troque os termos ou desmarque “Esconder os vídeos que já apareceram”.'}</p>`; return; }
    const quando = new Date(v.quando);
    $('#vlista').innerHTML = `<p class="dica">Busca de ${quando.toLocaleDateString('pt-BR')} às ${quando.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})}.${esc_} ` +
      (curioso ? `Temas desta vez: ${esc((v.temas || []).join(' · '))}.</p>`
        : `<b>“× o canal”</b> = visualizações divididas pelos inscritos: quanto maior, mais o vídeo furou a bolha.</p>`) +
      v.res.map(x => `<div class="viral ${u.has(x.id) ? 'usado' : ''}">
        <a href="https://www.youtube.com/watch?v=${x.id}" target="_blank" rel="noopener"><img src="${esc(x.thumb)}" alt="" loading="lazy"><span class="dur">${x.dur}</span></a>
        <div><b>${esc(x.titulo)}</b>
        <small>${esc(x.canal)} · ${compacto(x.subs)} inscritos</small>
        <small><span class="vez">${curioso ? `${x.novidade ? '🆕 ' : ''}👍 ${Math.round(x.gosto * 100)}% curtiram` : `${x.vezes >= 20 ? '🔥🔥🔥' : x.vezes >= 5 ? '🔥🔥' : '🔥'} ${compacto(x.vezes)}× o canal`}</span> · ${compacto(x.views)} views · há ${x.dias > 730 ? Math.floor(x.dias / 365) + ' anos' : x.dias + ' d'}${u.has(x.id) ? ' · já usado ✓' : ''}</small>
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
    aplicarModoV();
    document.querySelectorAll('#vmodo button').forEach(b => b.onclick = () => {
      if ($('#buscar').disabled) return;
      localStorage.setItem('vmodo', b.dataset.vm); aplicarModoV(); abrirVirais();
    });
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
    // roteiro pronto em arquivo (ex.: feito pelo Claude no computador): entra na lista como qualquer outro
    $('#rimportar').onchange = async e => {
      const arq = e.target.files[0]; e.target.value = ''; if (!arq) return;
      let it;
      try {
        it = JSON.parse(await arq.text());
        const c = it.conteudo;
        if (!c || !Array.isArray(c.ganchos) || !c.ganchos.length || !Array.isArray(c.blocos) || !c.blocos.length) throw new Error('falta conteudo.ganchos ou conteudo.blocos');
      } catch (err) { return alert('Esse arquivo não é um roteiro do app: ' + err.message); }
      Object.assign(it, {id: `${Date.now()}-imp`, criado: new Date().toISOString(), gancho: it.gancho || 0, takes: [], gravado: false});
      delete it.video;
      if (it.visual !== false) { it.visual = true; it.edicao = Object.assign({soVoz: true}, it.edicao || {}); }
      const c = it.conteudo;
      for (const [k, v] of Object.entries({tema: 'Roteiro importado', nota_viral: 0, por_que: '', texto_capa: '', comentario_fixado: '', duracao: '', legenda: ''})) if (c[k] == null) c[k] = v;
      await salvarR(it);
      alert(`Roteiro “${c.tema}” importado${it.figura ? ', com a figura animada' : ''}.`);
      await mostrarLista(); abrir(it.id);
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
    $('#chavepx').value = localStorage.getItem('pexels') || '';
    $('#chavepb').value = localStorage.getItem('pixabay') || '';
    const guardarClipe = () => {
      for (const [id, nome] of [['#chavepx', 'pexels'], ['#chavepb', 'pixabay']]) {
        const v = $(id).value.trim(); if (v) localStorage.setItem(nome, v); else localStorage.removeItem(nome);
      }
    };
    $('#salvarclipe').onclick = () => { guardarClipe(); alert('Chave dos vídeos de apoio salva só neste celular.'); };
    $('#testarclipe').onclick = async () => {
      guardarClipe();
      try { const r = await Gravador.buscarClipes('earth'); alert(r.length ? `Funciona! ✅ Achei ${r.length} vídeos de teste.` : 'A chave funciona, mas a busca veio vazia.'); }
      catch (e) { alert('Não funcionou: ' + e.message); }
    };
    puxarRobo();  // não espera: o app abre normal mesmo sem internet
  }

  /* ---------------------------------------------------------------- 🤖 roteiros do robô (divulgação do App de Revisão)
     O robô do GitHub (divulga/gerar.mjs) escreve 3 por dia em divulga/roteiros.json; aqui entram os que o celular
     ainda não viu (dos últimos 3 dias). Apagar um roteiro não o traz de volta (ids vistos em localStorage 'roboVistos'). */
  async function puxarRobo() {
    try {
      const r = await fetch(BASE + 'divulga/roteiros.json', {cache: 'no-store'});
      if (!r.ok) return;
      const d = await r.json(), vistos = ler('roboVistos', []), limite = Date.now() - 3 * 864e5;
      let n = 0;
      for (const [k, x] of (d.roteiros || []).entries()) {
        if (vistos.includes(x.id)) continue;
        vistos.push(x.id);
        const quando = Date.parse(x.criado) || Date.now();
        if (quando < limite || !x.conteudo || !Array.isArray(x.conteudo.ganchos) || !Array.isArray(x.conteudo.blocos)) continue;
        await salvarR({id: `${quando}-robo${k}`, criado: x.criado, link: '', assunto: `App de Revisão · ${x.recurso || ''}`,
          conteudo: x.conteudo, gancho: 0, visual: true, edicao: {soVoz: true}, robo: true});
        n++;
      }
      gravar('roboVistos', vistos.slice(-300));
      if (n) { await mostrarLista(); aviso(`🤖 ${n} roteiro(s) novo(s) do App de Revisão em Meus posts › Roteiros`); setTimeout(() => aviso(''), 8000); }
    } catch (e) { console.warn('roteiros do robô:', e); }
  }
  return {iniciar, gerar, gerarAssunto, gerarPdf, DURACOES, mostrarLista, abrirVirais, contar: async () => (await todosR()).length};
})();
