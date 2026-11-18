/* 📡 Radar de concursos: ao abrir o app, o Gemini pesquisa no Google as notícias de concursos das áreas e
   estados escolhidos e o app avisa o que é NOVO ou mudou de fase (ex.: "autorizado" → "banca definida").
   Cada concurso vira carrossel (mesmo layout dos outros) ou roteiro de Reels com um toque.
   Tudo fica neste celular (localStorage 'radar'). Usa a mesma chave grátis do Gemini. */
const Radar = (() => {
  const AREAS = ['Polícia Militar', 'Polícia Civil', 'Bombeiros', 'Polícia Penal', 'PRF e PF', 'Guarda Municipal',
    'Forças Armadas', 'Tribunais', 'INSS e federais', 'Bancos', 'Prefeituras', 'Professores'];
  const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI',
    'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
  const FASES = ['previsto', 'pedido feito', 'autorizado', 'banca definida', 'edital publicado', 'inscrições abertas',
    'prova marcada', 'resultado'];


  const ler = (k, padrao) => { try { return JSON.parse(localStorage.getItem(k)) ?? padrao; } catch { return padrao; } };
  const gravar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const filtros = () => ler('radarFiltros', {areas: ['Polícia Militar', 'Polícia Civil'], ufs: [], todos: true});
  const estado = () => ler('radar', {quando: 0, itens: []});
  const sem = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const chaveDe = c => sem(c.orgao || c.nome).replace(/[^a-z0-9]/g, '');
  let buscando = false;

  /* ---------------------------------------------------------------- manchetes reais + Gemini organizando
     A busca no Google pelo Gemini NÃO é liberada na chave grátis (429), e pedir para ele "ler um link" faz ele inventar
     notícia velha. Por isso um robô do GitHub (radar/buscar.mjs, a cada 6 h) junta as manchetes do Google Notícias em
     radar/noticias.json, e aqui o Gemini só agrupa e classifica ESSAS manchetes. */
  async function manchetes() {
    const r = await fetch(BASE + 'radar/noticias.json', {cache: 'no-store'});
    if (!r.ok) throw new Error('não achei as manchetes do radar (o robô do GitHub ainda não rodou?)');
    return r.json();
  }

  const C = {type: 'STRING'};
  const ESQ_RADAR = {type: 'OBJECT', required: ['concursos'], properties: {concursos: {type: 'ARRAY', items: {type: 'OBJECT',
    required: ['orgao', 'nome', 'uf', 'area', 'fase', 'novidade', 'vagas', 'salario', 'escolaridade', 'banca', 'datas', 'noticias'],
    properties: {orgao: C, nome: C, uf: C, area: {type: 'STRING', enum: AREAS}, fase: {type: 'STRING', enum: FASES}, novidade: C,
      vagas: C, salario: C, escolaridade: C, banca: C, datas: C, noticias: {type: 'ARRAY', items: {type: 'INTEGER'}}}}}}};

  function pedidoRadar(f, lista) {
    const hoje = new Date().toLocaleDateString('pt-BR');
    const onde = f.todos || !f.ufs.length ? 'de todo o Brasil' : `dos estados ${f.ufs.join(', ')} (e os federais/nacionais com vagas para todo o país)`;
    return `Hoje é ${hoje}. Você ajuda um professor de matemática que posta sobre concursos públicos.
Abaixo estão MANCHETES REAIS de notícias (número, data, site, título). Agrupe-as por concurso e devolva os concursos
${onde}, das áreas: ${f.areas.join(', ')}.

REGRAS RÍGIDAS
- Use SÓ o que está escrito nas manchetes. Não complete com o que você "lembra": vagas, salário, banca, datas e escolaridade
  só se aparecerem nas manchetes; senão deixe "".
- Um item por concurso (ex.: todas as manchetes da Polícia Penal de Pernambuco viram 1 item). Fase = a MAIS RECENTE pelas datas.
- Ignore concursos de outros estados/áreas, processos seletivos temporários pequenos e notícias que não são de concurso.
- "orgao": sigla curta e padronizada (PM-AL, PC-BA, PPPE, PRF, TJ-PE, Prefeitura do Recife). "nome": órgão e cargo.
- "uf": sigla do estado ou "BR". "novidade": a notícia em 1 frase. "datas": inscrições/prova se as manchetes disserem.
- "noticias": os NÚMEROS das manchetes usadas (as mais informativas primeiro).
- No máximo 25 concursos, do mais recente para o mais antigo.

MANCHETES
${lista.map((m, k) => `${k} | ${m.data} | ${m.fonte} | ${m.t}`).join('\n')}`;
  }

  async function organizar(f, avisar) {
    avisar('📡 Lendo as manchetes de concursos…');
    const dados = await manchetes();
    const lista = dados.itens.filter(m => m.areas.some(a => f.areas.includes(a))).slice(0, 600);
    if (!lista.length) return {dados, achados: []};
    const corpo = JSON.stringify({contents: [{parts: [{text: pedidoRadar(f, lista)}]}],
      generationConfig: {responseMimeType: 'application/json', responseSchema: ESQ_RADAR, temperature: 0.2}});
    // organizar manchetes é tarefa leve: o Flash-Lite (cota grátis à parte) entra no fim da fila
    const resp = await chamarGemini(corpo, t => avisar(t.replace('Pedindo ao Gemini', '📡 Organizando os concursos')), false, [...MODELOS, 'gemini-flash-lite-latest']);
    const achados = (resp.concursos || []).map(c => {
      const usadas = (c.noticias || []).map(k => lista[k]).filter(Boolean);
      const recente = usadas.map(m => m.data).sort().pop() || '';
      return {...c, data_noticia: recente, site: (usadas[0] || {}).fonte || '',
        fontes: usadas.filter(m => /^https:\/\//.test(m.link)).slice(0, 4).map(m => ({uri: m.link, titulo: m.fonte || 'notícia'})),
        manchetes: usadas.slice(0, 6).map(m => `${m.data.split('-').reverse().slice(0, 2).join('/')} ${m.t}`)};
    });
    return {dados, achados};
  }

  /* Junta o que veio com o que já estava guardado e marca NOVO / MUDOU DE FASE. */
  function juntar(achados) {
    const st = estado(), velhos = new Map(st.itens.map(i => [i.id, i]));
    for (const c of achados) {
      const id = chaveDe(c); if (!id) continue;
      const v = velhos.get(id);
      if (!v) { velhos.set(id, {...c, id, visto: false, novo: true, primeiro: Date.now(), atualizado: Date.now()}); continue; }
      const mudou = c.fase && sem(c.fase) !== sem(v.fase);
      const novo = {...v, ...Object.fromEntries(Object.entries(c).filter(([, x]) => x !== '' && x != null))};
      if (mudou) Object.assign(novo, {faseAntiga: v.fase, mudou: true, visto: false, dispensado: false, atualizado: Date.now()});
      velhos.set(id, novo);
    }
    // guarda no máximo 80 (os mais recentes)
    st.itens = [...velhos.values()].sort((a, b) => (b.atualizado || 0) - (a.atualizado || 0)).slice(0, 80);
    st.quando = Date.now();
    gravar('radar', st);
    return st;
  }

  const assinatura = f => JSON.stringify([f.areas.slice().sort(), f.todos ? [] : f.ufs.slice().sort()]);

  async function buscar(silencioso = false) {
    if (buscando) return;
    if (!chave()) { if (!silencioso) { tela('config'); alert('Primeiro cole a sua chave do Gemini.'); } return; }
    const f = filtros();
    if (!f.areas.length) { if (!silencioso) alert('Escolha pelo menos uma área.'); return; }
    buscando = true;
    const avisar = silencioso ? () => {} : aviso;
    if ($('#rbuscar')) $('#rbuscar').disabled = true;
    try {
      if (silencioso) {  // ao abrir: só gasta Gemini se o robô trouxe manchetes novas (ou os filtros mudaram)
        const st = estado(), d = await manchetes();
        if (d.atualizado === st.fonte && st.filtro === assinatura(f)) return;
      }
      const {dados, achados} = await organizar(f, avisar);
      const antes = novidades().length;
      const st = juntar(achados.map(({noticias, ...c}) => c));
      st.fonte = dados.atualizado; st.filtro = assinatura(f); gravar('radar', st);
      const n = novidades().length;
      marcarBadge();
      if (!$('#concursos').hidden) mostrar();
      if (silencioso && n > antes) aviso(`📡 ${n} novidade${n > 1 ? 's' : ''} de concurso! Toque em 📡 Concursos.`), setTimeout(() => aviso(''), 7000);
    } catch (e) {
      if (!silencioso) alert('Não deu para buscar: ' + e.message);
    } finally {
      buscando = false; if (!silencioso) aviso('');
      if ($('#rbuscar')) $('#rbuscar').disabled = false;
    }
  }

  /* ---------------------------------------------------------------- tela */
  const novidades = () => estado().itens.filter(i => !i.visto && !i.dispensado);
  function marcarBadge() {
    const n = novidades().length, b = $('#nconcursos');
    if (b) { b.textContent = n > 9 ? '9+' : n; b.hidden = !n; }
  }
  const ordemFase = f => { const i = FASES.indexOf(sem(f).replace('inscricoes', 'inscrições')); return i < 0 ? 0 : i; };
  const quandoTxt = t => {
    if (!t) return 'nunca';
    const min = Math.round((Date.now() - t) / 60000);
    return min < 60 ? `há ${min} min` : min < 1440 ? `há ${Math.round(min / 60)} h` : new Date(t).toLocaleDateString('pt-BR');
  };

  function chips(sel, valores, marcados, aoTocar) {
    $(sel).innerHTML = valores.map(v => `<button class="chip ${marcados.includes(v) ? 'on' : ''}" data-v="${esc(v)}">${esc(v)}</button>`).join('');
    $(sel).querySelectorAll('.chip').forEach(b => b.onclick = () => aoTocar(b.dataset.v));
  }
  function mostrarFiltros() {
    const f = filtros();
    chips('#rareas', AREAS, f.areas, v => {
      f.areas = f.areas.includes(v) ? f.areas.filter(x => x !== v) : [...f.areas, v]; gravar('radarFiltros', f); mostrarFiltros();
    });
    chips('#rufs', ['Todo o Brasil', ...UFS], f.todos ? ['Todo o Brasil'] : f.ufs, v => {
      if (v === 'Todo o Brasil') { f.todos = true; f.ufs = []; }
      else { f.ufs = f.ufs.includes(v) ? f.ufs.filter(x => x !== v) : [...f.ufs, v]; f.todos = !f.ufs.length; }
      gravar('radarFiltros', f); mostrarFiltros();
    });
    $('#rresumo').textContent = `${f.areas.join(', ') || 'nenhuma área'} · ${f.todos ? 'todo o Brasil' : f.ufs.join(', ')}`;
  }

  function mostrar() {
    mostrarFiltros();
    const st = estado();
    $('#rquando').textContent = `Última busca: ${quandoTxt(st.quando)}`;
    const ver = $('#rmostrar').value;
    let itens = st.itens.filter(i => ver === 'dispensados' ? i.dispensado : !i.dispensado);
    if (ver === 'novos') itens = itens.filter(i => !i.visto);
    itens.sort((a, b) => (a.visto - b.visto) || (b.atualizado || 0) - (a.atualizado || 0));
    $('#rvaziocon').hidden = itens.length > 0;
    $('#rvaziocon').innerHTML = st.quando ? (ver === 'novos' ? 'Nenhuma novidade desde a última vez. 🎉' : 'Nada aqui.')
      : 'Escolha as áreas e os estados e toque em <b>🔎 Buscar agora</b>. Depois disso, o app procura sozinho toda vez que você abre (no máximo a cada 6 h).';
    $('#rcon').innerHTML = itens.map(i => {
      const etq = i.mudou && !i.visto ? `<span class="tag mudou">MUDOU: ${esc(i.faseAntiga)} → ${esc(i.fase)}</span>`
        : !i.visto ? '<span class="tag novo">NOVO</span>' : '';
      const linha = (r, v) => v ? `<div><small>${r}</small> ${esc(v)}</div>` : '';
      const fts = (i.fontes || []).map(f => `<a href="${esc(f.uri)}" target="_blank" rel="noopener">${esc(f.titulo)}</a>`).join(' · ');
      const pesq = `https://www.google.com/search?q=${encodeURIComponent('concurso ' + (i.nome || i.orgao))}&tbm=nws`;
      return `<div class="concurso ${i.visto ? 'visto' : ''}" data-id="${esc(i.id)}">
        <div class="ctopo"><b>${esc(i.orgao)}</b><span class="fase f${ordemFase(i.fase)}">${esc(i.fase || '?')}</span></div>
        ${etq}<div class="cnome">${esc(i.nome)}</div>
        <p>${esc(i.novidade)}</p>
        <div class="cdados">${linha('Vagas', i.vagas)}${linha('Salário', i.salario)}${linha('Banca', i.banca)}${linha('Escolaridade', i.escolaridade)}${linha('Datas', i.datas)}</div>
        ${i.manchetes?.length ? `<details class="cman"><summary>Manchetes (${i.manchetes.length})</summary>${i.manchetes.map(m => `<div>${esc(m)}</div>`).join('')}</details>` : ''}
        <small class="cfonte">${i.site ? esc(i.site) + (i.data_noticia ? ', ' + esc(i.data_noticia.split('-').reverse().join('/')) : '') + ' · ' : ''}${fts || ''} ${fts ? '· ' : ''}<a href="${pesq}" target="_blank" rel="noopener">🔎 conferir no Google</a></small>
        <div class="vacoes">
          <button class="principal" data-a="carrossel">🖼️ Carrossel</button>
          <button class="sec" data-a="roteiro">🎬 Reels</button>
          <button class="sec" data-a="${i.dispensado ? 'voltar' : i.visto ? 'dispensar' : 'visto'}" title="${i.visto ? 'Tirar da lista' : 'Marcar como visto'}">${i.dispensado ? '↩' : i.visto ? '✕' : '✓ Visto'}</button>
        </div></div>`;
    }).join('');
    $('#rcon').querySelectorAll('.concurso').forEach(d => d.querySelectorAll('[data-a]').forEach(b => b.onclick = () => acao(d.dataset.id, b.dataset.a)));
    marcarBadge();
  }

  function mexer(id, f) {
    const st = estado(), i = st.itens.find(x => x.id === id);
    if (i) { f(i); gravar('radar', st); }
    return i;
  }
  async function acao(id, a) {
    if (a === 'visto') mexer(id, i => { i.visto = true; i.mudou = false; });
    if (a === 'dispensar') mexer(id, i => { i.dispensado = true; i.visto = true; });
    if (a === 'voltar') mexer(id, i => { i.dispensado = false; });
    if (a === 'carrossel') { const i = mexer(id, i => { i.visto = true; i.mudou = false; }); mostrar(); return carrossel(i); }
    if (a === 'roteiro') {
      const i = mexer(id, i => { i.visto = true; i.mudou = false; });
      return Roteiro.gerarAssunto(`ANÚNCIO DE CONCURSO (use SÓ estes dados, não invente nada; o que estiver vazio é "a definir"):\n${fatos(i)}\n` +
        'Faça um Reels avisando do concurso (gancho: "Vai ter concurso da ' + i.orgao + '!"), dizendo a fase atual e o que já se sabe, ' +
        'e mostre uma questão curta de matemática/raciocínio lógico no estilo que costuma cair nesse tipo de concurso (questão original, ' +
        'sem dizer que é de prova real). Termine pedindo para marcar quem vai prestar.');
    }
    mostrar();
  }

  const fatos = i => [['Órgão', i.nome || i.orgao], ['Sigla', i.orgao], ['Estado', i.uf], ['Fase atual', i.fase], ['Novidade', i.novidade],
    ['Vagas', i.vagas], ['Salário', i.salario], ['Escolaridade', i.escolaridade], ['Banca', i.banca], ['Datas', i.datas],
    ['Fonte', `${i.site || ''} ${i.data_noticia || ''}`.trim()]]
    .map(([r, v]) => `- ${r}: ${v || ''}`).join('\n') +
    (i.manchetes?.length ? '\n- Manchetes das notícias:\n' + i.manchetes.map(m => `  • ${m}`).join('\n') : '');

  /* ---------------------------------------------------------------- carrossel do concurso */
  const PROMPT_CONCURSO = `Você é o professor Delmão, do perfil @delmaosimplifica: professor de matemática de cursinho que prepara para
concursos. Linguagem clara, direta, animada, português do Brasil impecável (com todos os acentos).

Faça UM carrossel de Instagram de 5 cards ANUNCIANDO este concurso, com os DADOS abaixo.
DADOS DO CONCURSO (fonte: notícia; use SÓ isto):
{FATOS}

REGRAS RÍGIDAS
- Não invente NADA: vagas, salário, banca, datas e escolaridade só se estiverem nos DADOS. O que faltar = "a definir"/"ainda não saiu".
- Não diga que o edital saiu se a fase não for "edital publicado" ou depois.
- prova_citada = "concurso". Matemática sem LaTeX (×, ÷, ², %, √). Confira cada conta duas vezes.
- Destaque em laranja com **asteriscos duplos** (1 ou 2 por texto).

O QUE VAI EM CADA CARD (respeite os tamanhos: a arte é pequena)
1. capa: linha1 e linha2 em CAIXA ALTA, até 16 caracteres cada (ex.: "VAI TER" / "CONCURSO PM-AL"; ou "EDITAL" / "PUBLICADO!").
   subtitulo: até 90 caracteres com o dado mais forte (vagas/salário/fase). estilo: "postit".
   questao_rotulo: a sigla do órgão (até 16 caracteres). questao_destaque: o número mais chamativo (ex.: "1.000 VAGAS") ou a fase.
   conta: "" (vazio). questao_emoji: "" ou um desenho que combine. frase: grito do mascote até 22 caracteres (ex.: "BORA PRA FARDA!").
2. regra: linha1/linha2 "O QUE" / "JÁ SABEMOS". texto: a fase atual e a novidade (até 110 caracteres).
   itens: EXATAMENTE 2: pergunta em CAIXA ALTA até 32 caracteres (ex.: "**1.000** VAGAS DE SOLDADO") e nota até 40 caracteres
   (ex.: "(salário de R$ 5.000)", "(banca: a definir)"). frase: até 24 caracteres.
3. exemplo: linha1/linha2 "COMO CAI" / "MATEMÁTICA". Uma questão ORIGINAL e curta no estilo do que costuma cair nesse tipo de concurso
   (porcentagem, regra de três, razão, raciocínio lógico...), com contexto da carreira (viatura, ocorrências, plantão...).
   Nunca diga que a questão é de uma prova real. enunciado até 130 caracteres com números em **negrito**; pergunta até 22 caracteres;
   passos: 2 a 4, cada um até 30 caracteres; resposta até 12 caracteres.
4. resumo: linha1/linha2 "PRÓXIMOS" / "PASSOS". destaque até 80 caracteres em CAIXA ALTA (ex.: "COMECE A ESTUDAR **ANTES** DO EDITAL!").
   etapas: 3 ou 4 (rotulo 1 palavra em CAIXA ALTA até 10 caracteres, ex.: EDITAL, INSCRIÇÃO, ESTUDO, PROVA). frase até 24 caracteres.
5. cta_frase: até 90 caracteres, ex.: "Marca quem vai prestar a **PM-AL** e salva o post!".
legenda: 4 a 8 linhas: a notícia com os dados que existem, "Fonte: {SITE}. Confira sempre o edital oficial.", convite para seguir
@delmaosimplifica e 5 a 8 hashtags (#concurso #concursopublico #${'{SIGLA}'} ...).
tema: "Concurso {SIGLA}: {FASE}".`;

  async function carrossel(i) {
    if (!chave()) { tela('config'); return alert('Primeiro cole a sua chave do Gemini.'); }
    let prompt = PROMPT_CONCURSO.replace('{FATOS}', fatos(i)).replaceAll('{SITE}', i.site || 'notícia na internet')
      .replaceAll('{SIGLA}', i.orgao || '').replaceAll('{FASE}', i.fase || '');
    if (DESENHOS.size) prompt += '\n\n' + PROMPT_DESENHOS +
      Object.entries(DESCRICOES).map(([n, d]) => `${n} = ${d} (palavras: ${(DESENHOS.get(n) || []).join(', ')})`).join('\n');
    try {
      const resp = await chamarGemini(JSON.stringify({contents: [{parts: [{text: prompt}]}],
        generationConfig: {responseMimeType: 'application/json', responseSchema: ESQUEMA, temperature: 0.5}}), aviso);
      const conteudo = (resp.carrosseis || [])[0];
      if (!conteudo) throw new Error('o Gemini não devolveu o carrossel');
      conteudo.legenda = (conteudo.legenda || '').replace(/**/g, '');  // no Instagram os ** apareceriam
      const item = {id: `${Date.now()}-0`, criado: new Date().toISOString(), link: '', concurso: i.id, conteudo, imagens: []};
      await salvar(item);
      await desenharCarrossel(item, aviso);
      aviso('');
      abrir(item.id);
    } catch (e) { aviso(''); alert('Deu erro: ' + e.message); }
  }

  /* ---------------------------------------------------------------- início */
  function iniciar() {
    $('#rbuscar').onclick = () => buscar(false);
    $('#rmostrar').onchange = mostrar;
    $('#rtodosvistos').onclick = () => {
      const st = estado(); st.itens.forEach(i => { i.visto = true; i.mudou = false; }); gravar('radar', st); mostrar();
    };
    marcarBadge();
    // ao abrir o app: confere sozinho, sem travar nada (depois da 1ª busca feita à mão)
    if (chave() && estado().quando) setTimeout(() => buscar(true), 3000);
  }

  return {iniciar, mostrar, buscar, organizar, carrossel};
})();
