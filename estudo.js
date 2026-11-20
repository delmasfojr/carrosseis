/* 📚 Trilha de estudos do professor: rever TODO o material (slides do Professor + listas) no tempo que ele tem.
   estudo.json (montar_estudo.py) traz cada aula com o número de slides e de questões; aqui isso vira uma fila de
   tarefas curtas (≤ ~40 slides ou 10 questões) que é encaixada nos dias a partir de HOJE. Atrasou? A fila só anda:
   o plano se refaz sozinho, sem "dívida". Tudo fica neste aparelho (localStorage 'estudo'). */
const Estudo = (() => {
  const q = s => document.querySelector(s);
  const CHAVE = 'estudo';
  const PADRAO = {
    min: [180, 60, 60, 60, 60, 60, 180],  // domingo..sábado, em minutos
    porSlide: 1, porQuestao: 3, voz: 10,
    minLivros: [60, 60, 60, 60, 60, 60, 60],  // trilha dos livros: 1 h a mais por dia, em paralelo à das aulas
    prioridade: ['FME 5'],  // volumes que abrem a trilha dos livros (inteiros, na ordem marcada): os assuntos difíceis
    livros: 2, porPagina: 1.5,  // livros inteiros (FME + Lacerda): 1 = todos os exercícios, 2 = ímpares, 3 = 1 a cada 3, 0 = fora
    trilhas: {principal: true, enem: true, concursos: true, mb: true},
    reforco: ['principal:61 - Análise Combinatória', 'principal:63 - Probabilidade'],
    feito: {}, erros: {}, revisado: {},
    tempo: {}, rel: null,  // ⏱️ tempo estudado por dia {data: {A: seg, L: seg}} e o relógio ligado {t: 'A'|'L', ini: ms}
  };
  const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  const LIVRO_TRILHA = {mb: 'Lacerda, Praticando a Aritmética (capítulo do tema)', concursos: 'Manual Completo de RLM ou o FME do tema',
    enem: 'refaça as questões erradas olhando a resolução comentada'};
  let dados = null, st = null;

  const ler = () => { try { return {...PADRAO, ...JSON.parse(localStorage.getItem(CHAVE) || '{}')}; } catch { return {...PADRAO}; } };
  const gravar = () => { try { localStorage.setItem(CHAVE, JSON.stringify(st)); } catch {} };
  const dia = d => { const x = new Date(d); x.setHours(12, 0, 0, 0); return x; };
  const iso = d => { const x = dia(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
  const hoje = () => iso(new Date());
  const mais = (d, n) => { const x = dia(d); x.setDate(x.getDate() + n); return x; };
  const br = d => dia(d).toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'});
  const hm = m => m < 60 ? `${Math.round(m)} min` : `${Math.floor(m / 60)} h${m % 60 ? ' ' + String(Math.round(m % 60)).padStart(2, '0') : ''}`;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  const partes = (total, alvo) => {  // divide 1..total em pedaços parecidos de ~alvo (o último não fica minúsculo)
    const n = Math.max(1, Math.round(total / alvo)), r = [];
    for (let i = 0; i < n; i++) r.push([Math.floor(i * total / n) + 1, Math.floor((i + 1) * total / n)]);
    return r;
  };

  /* ---------------------------------------------------------------- a fila de tarefas */
  const VOLUMES = {'FME 1': 'Conjuntos e Funções', 'FME 2': 'Logaritmos', 'FME 3': 'Trigonometria',
    'FME 4': 'Sequências, Matrizes e Sistemas', 'FME 5': 'Combinatória e Probabilidade', 'FME 6': 'Complexos e Polinômios',
    'FME 7': 'Geometria Analítica', 'FME 9': 'Geometria Plana', 'FME 10': 'Geometria Espacial',
    'FME 11': 'Financeira e Estatística', 'Lacerda': 'Aritmética (Matemática Básica)'};
  const FRAC = {1: '', 2: ' (só os ímpares)', 3: ' (1 a cada 3: o 1º, o 4º, o 7º…)'};
  const conta = (i, f, fr) => Math.ceil((f - i + 1) / fr);  // quantos exercícios de i..f entram com a fração fr
  // um capítulo de livro vira: leitura em pedaços de ~30 páginas + exercícios em blocos fixos de 20 números
  // (blocos fixos: mudar "todos/ímpares" não bagunça o que já foi marcado)
  function tarefasCap(c, base, fase2) {
    const out = [], fr = st.livros, b = {...base, nome: c.nome, doLivro: true, fase2};
    if (c.pag) partes(c.pag[1] - c.pag[0] + 1, 30).forEach(([i, f], k) => out.push({...b, id: `${c.id}#p${k + 1}`, tipo: 'livro',
      min: (f - i + 1) * st.porPagina, txt: `Ler as páginas ${c.pag[0] + i - 1}–${c.pag[0] + f - 1}`,
      det: 'Teoria, demonstrações e exercícios resolvidos. Os propostos vêm na tarefa seguinte.'}));
    const blocos = (ini, fim, rotulo, det) => { for (let i = ini, k = 1; i <= fim; i += 20, k++) {
      const f = Math.min(fim, i + 19), n = conta(i, f, fr);
      out.push({...b, id: `${c.id}#e${k}`, tipo: 'lista', min: n * st.porQuestao, txt: `${rotulo} ${i}–${f}${FRAC[fr]}`, det}); } };
    if (c.ex) blocos(c.ex[0], c.ex[1], 'Exercícios', 'Respostas no fim do livro. Anote os que errou.');
    if (c.vest) blocos(1, c.vest, 'Questões de vestibular', 'Revisão do volume. Respostas no fim do livro.');
    if (c.nex) { const n = Math.max(1, Math.round(c.nex / 20));
      for (let k = 1; k <= n; k++) { const q = Math.ceil(Math.round(c.nex / n) / fr);
        out.push({...b, id: `${c.id}#e${k}`, tipo: 'lista', min: q * st.porQuestao,
          txt: `Exercícios propostos: parte ${k} de ${n}${FRAC[fr]}`, det: `Cerca de ${q} exercícios. Respostas no próprio livro. Anote os que errou.`}); } }
    return out;
  }

  function tarefas() {
    const fila = [], depois = [], caps = {};  // depois = fase 2: livros das aulas sem ⭐, depois de todas as aulas
    const prio = st.livros ? st.prioridade.filter(l => VOLUMES[l]) : [];
    if (st.livros) (dados.capitulos || []).forEach(c => prio.includes(c.livro) || (caps[c.aula] = caps[c.aula] || []).push(c));
    for (const a of dados.aulas) {
      if (st.trilhas[a.trilha] === false) continue;
      const nome = `${a.num} · ${a.titulo}`, reforco = st.reforco.includes(a.id), base = {aula: a.id, nome};
      if (reforco) fila.push({...base, id: a.id + '#livro', tipo: 'livro', min: 50,
        txt: 'Ler a teoria no livro', det: a.livro || LIVRO_TRILHA[a.trilha] || 'livro do tema'});
      partes(a.slides, 40).forEach(([i, f], k, arr) => a.slides && fila.push({...base, id: `${a.id}#s${k + 1}`, tipo: 'slides',
        min: (f - i + 1) * st.porSlide, txt: arr.length > 1 ? `Slides ${i}–${f} (versão do Professor)` : 'Slides da aula (versão do Professor)',
        det: 'Leia cada exemplo tentando resolver antes de olhar a resolução.'}));
      const prova = /^[SR]0/.test(a.num);
      partes(a.questoes, prova ? 15 : 10).forEach(([i, f], k) => a.questoes && fila.push({...base, id: `${a.id}#l${k + 1}`, tipo: 'lista',
        min: (f - i + 1) * st.porQuestao, txt: `${prova ? 'Prova' : 'Lista'}: questões ${i}–${f}`,
        det: 'Resolva sem olhar o gabarito; depois confira e anote as que errou.'}));
      if (a.slides && st.voz) fila.push({...base, id: a.id + '#voz', tipo: 'voz', min: reforco ? 30 : st.voz,
        txt: reforco ? 'Dar a aula em voz alta (grave no celular)' : 'Explicar em voz alta, sem o slide',
        det: reforco ? 'Apresente a aula inteira como se a turma estivesse na sua frente.' : 'Escolha 2 exemplos e explique o porquê de cada passo. Onde travar, volte ao slide.'});
      (caps[a.id] || []).forEach(c => (reforco ? fila : depois).push(...tarefasCap(c, base, !reforco)));
    }
    // volumes priorizados: inteiros, no começo da trilha dos livros (mesmo os capítulos de aulas com ⭐)
    const primeiro = prio.flatMap(l => dados.capitulos.filter(c => c.livro === l).flatMap(c => tarefasCap(c, {aula: c.aula, nome: c.nome}, true)));
    return fila.concat(primeiro, depois);
  }

  // encaixa as tarefas que faltam nos dias, a partir de hoje (o que já foi feito hoje continua na lista de hoje)
  function agenda(fila, minutos = st.min, comRev = true, dias = 4000) {
    const pend = fila.filter(t => !st.feito[t.id]), out = [];
    const errosAbertos = Object.keys(st.erros).filter(k => st.erros[k] && !st.revisado[k]);
    let i = 0;
    for (let n = 0; n < dias && (i < pend.length || n === 0); n++) {
      const d = mais(new Date(), n), chave = iso(d), cap = minutos[d.getDay()] || 0, lista = [];
      if (n === 0) lista.push(...fila.filter(t => st.feito[t.id] === chave));
      const sab = comRev && d.getDay() === 6 && cap > 0;
      if (sab && (n > 0 || errosAbertos.length || st.feito['rev:' + chave]))
        lista.push({id: 'rev:' + chave, tipo: 'rev', min: 30, nome: 'Revisão da semana', txt: 'Refazer as questões que você errou',
          det: n === 0 ? (errosAbertos.length ? errosAbertos.map(k => `${(fila.find(t => t.id === k) || {nome: k}).nome.split(' · ')[0]}: ${st.erros[k]}`).join(' · ') : 'Nenhum erro anotado nesta semana. 👏') : 'As questões anotadas como erradas durante a semana.'});
      let usado = lista.reduce((s, t) => s + t.min, 0);
      while (i < pend.length && cap > 0 && (usado + pend[i].min <= cap + 10 || usado === 0)) { lista.push(pend[i]); usado += pend[i].min; i++; }
      out.push({d, chave, cap, lista, usado});
    }
    return out;
  }

  /* ---------------------------------------------------------------- telas */
  const ICONE = {livro: '📚', slides: '🖥️', lista: '✏️', voz: '🎤', rev: '🔁'};
  function cartao(t, podeMarcar) {
    const f = !!st.feito[t.id];
    return `<div class="etarefa${f ? ' ok' : ''}" data-id="${esc(t.id)}">
      <label class="echeck">${podeMarcar ? `<input type="checkbox" ${f ? 'checked' : ''}>` : ''}
        <span><small>${esc(t.nome)} · ${hm(t.min)}</small><b>${ICONE[t.tipo]} ${esc(t.txt)}</b><em>${esc(t.det)}</em></span></label>
      ${t.tipo === 'lista' && f ? `<input class="eerros" type="text" inputmode="numeric" placeholder="Errou alguma? Anote os números (ex.: 3, 7, 12)" value="${esc(st.erros[t.id] || '')}">` : ''}
    </div>`;
  }

  // duas trilhas em paralelo, cada uma com o seu horário: aulas (slides + listas) e livros (FME + Lacerda).
  // Os capítulos das aulas com ⭐ ficam na trilha das aulas, junto da aula.
  function duas(fila) {
    const A = fila.filter(t => !t.fase2), L = fila.filter(t => t.fase2);
    return {A, L, agA: agenda(A, st.min, true), agL: L.length ? agenda(L, st.minLivros, false) : []};
  }
  const data = d => d.toLocaleDateString('pt-BR', {day: 'numeric', month: 'long', year: 'numeric'});
  function resumo(nome, f, ag, minutos) {
    const total = f.reduce((s, t) => s + t.min, 0), feito = f.filter(t => st.feito[t.id]).reduce((s, t) => s + t.min, 0);
    const pct = total ? Math.round(100 * feito / total) : 0, semana = minutos.reduce((a, b) => a + b, 0);
    return `<p><b>${nome} · ${pct}% feito</b></p><div class="ebarra"><i style="width:${pct}%"></i></div>
      <p>Faltam ${hm(total - feito)} (${hm(semana)} por semana). Termina por volta de <b>${data(ag[ag.length - 1].d)}</b>.</p>`;
  }
  function blocoDia(titulo, x, podeMarcar) {
    if (!x) return '';
    return `<h4 class="etrilhatit">${titulo} <span>${hm(x.usado)}</span></h4>` + (x.lista.length ? x.lista.map(t => cartao(t, podeMarcar)).join('')
      : `<p class="dica">${x.cap ? 'Tudo feito! 🎉' : 'Sem horário hoje para esta trilha.'}</p>`);
  }

  /* ---------------------------------------------------------------- ⏱️ relógio de estudo
     Conta o tempo de cada trilha. Guarda a hora em que começou, então continua contando com o app fechado. */
  const TR = {A: '🖥️ Aulas', L: '📗 Livros'};
  const relo = s => `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(Math.floor(s) % 60).padStart(2, '0')}`;
  const somaDia = (dia, t) => ((st.tempo[dia] || {})[t] || 0) + (st.rel && st.rel.t === t && iso(st.rel.ini) === dia ? (Date.now() - st.rel.ini) / 1000 : 0);
  const metaDia = (t, d = new Date()) => ((t === 'A' ? st.min : st.minLivros)[dia(d).getDay()] || 0) * 60;
  function somar(dia, t, seg) { const x = st.tempo[dia] = st.tempo[dia] || {}; x[t] = Math.max(0, (x[t] || 0) + seg); }
  function pararRelogio() {
    if (!st.rel) return;
    let seg = (Date.now() - st.rel.ini) / 1000;
    if (seg > 4 * 3600 && !confirm(`O relógio ficou ligado ${hm(seg / 60)}. Contar esse tempo todo?\n(Cancelar = não conta esta sessão; dá para corrigir com o +5 min.)`)) seg = 0;
    somar(iso(st.rel.ini), st.rel.t, seg); st.rel = null;
  }
  function relogio() {
    const d = hoje(), sem = [...Array(7)].map((_, n) => mais(new Date(), -n));
    const feitoSem = sem.reduce((s, x) => s + somaDia(iso(x), 'A') + somaDia(iso(x), 'L'), 0);
    const metaSem = sem.reduce((s, x) => s + metaDia('A', x) + metaDia('L', x), 0);
    q('#erelogio').innerHTML = Object.entries(TR).map(([t, nome]) => {
      const seg = somaDia(d, t), meta = metaDia(t), on = st.rel && st.rel.t === t, pct = meta ? Math.min(100, 100 * seg / meta) : 0;
      return `<div class="erel${on ? ' on' : ''}" data-t="${t}">
        <button class="erelbt" data-rel="${t}">${on ? '⏸️' : '▶️'}</button>
        <span><b>${nome}</b> <i class="erelt">${relo(seg)}</i><small>${meta ? `meta de hoje: ${hm(meta / 60)}${seg >= meta ? ' ✅' : ''}` : 'sem meta hoje'}</small>
        <em class="ebarra"><i style="width:${pct}%"></i></em></span>
        <span class="erelaj"><button data-aj="${t}:-5">−5</button><button data-aj="${t}:5">+5</button></span></div>`;
    }).join('') + `<p class="dica">Últimos 7 dias: <b>${hm(feitoSem / 60)}</b> estudados de ${hm(metaSem / 60)} planejados.</p>`;
  }
  setInterval(() => {  // atualiza só o número do relógio ligado, e avisa quando bater a meta do dia
    if (!st || !st.rel || !q('#erelogio') || q('#estudo').hidden) return;
    const box = q(`.erel[data-t="${st.rel.t}"] .erelt`), seg = somaDia(hoje(), st.rel.t), meta = metaDia(st.rel.t);
    if (box) box.textContent = relo(seg);
    if (meta && seg >= meta && !st.rel.avisou) { st.rel.avisou = true; gravar(); try { navigator.vibrate && navigator.vibrate([300, 150, 300]); } catch {} relogio(); }
  }, 1000);

  function mostrar() {
    if (!dados) { carregar(); return; }
    relogio();
    const fila = tarefas(), {A, L, agA, agL} = duas(fila);
    q('#eresumo').innerHTML = resumo('🖥️ Aulas: slides e listas', A, agA, st.min) + (L.length ? resumo('📗 Livros: FME e Lacerda', L, agL, st.minLivros) : '');
    const hA = agA[0], hL = agL[0];
    q('#ehojetit').textContent = `Hoje · ${DIAS[hA.d.getDay()]}, ${br(hA.d)} · ${hm(hA.usado + (hL ? hL.usado : 0))}`;
    q('#ehoje').innerHTML = blocoDia('🖥️ Aulas', hA, true) + blocoDia('📗 Livros', hL, true);
    const adiantar = (h, ag, rot) => {
      const prox = h && h.lista.length && h.lista.every(t => st.feito[t.id]) && ag[1] ? ag[1].lista.find(t => !t.id.startsWith('rev:')) : null;
      return prox ? `<button class="sec" data-adiantar="${esc(prox.id)}">⏩ ${rot}: adiantar “${esc(prox.nome)} · ${esc(prox.txt)}”</button>` : '';
    };
    q('#eadiantar').innerHTML = adiantar(hA, agA, 'Aulas') + adiantar(hL, agL, 'Livros');
    const li = x => x ? x.lista.map(t => `<li>${ICONE[t.tipo]} ${esc(t.nome)} — ${esc(t.txt)}</li>`).join('') : '';
    q('#esemana').innerHTML = [1, 2, 3, 4, 5, 6, 7].map(n => { const a = agA[n], l = agL[n], d = mais(new Date(), n);
      return `<div class="edia"><b>${DIAS[d.getDay()]}, ${br(d)}</b> <span>${hm((a ? a.usado : 0) + (l ? l.usado : 0))}</span>
      <ul>${li(a) + li(l) || '<li>sem estudo</li>'}</ul></div>`; }).join('');
    trilhaCompleta(fila);
    ajustes();
  }

  function trilhaCompleta(fila) {
    const por = {};
    fila.forEach(t => (por[t.aula] = por[t.aula] || []).push(t));
    let html = '';
    for (const tr of dados.trilhas) {
      const aulas = dados.aulas.filter(a => a.trilha === tr.id);
      if (st.trilhas[tr.id] === false) { html += `<h4>${esc(tr.nome)} <small>(fora do plano)</small></h4>`; continue; }
      html += `<h4>${esc(tr.nome)}</h4>`;
      let grupo = '';
      for (const a of aulas) {
        if (a.grupo !== grupo) { grupo = a.grupo; if (tr.id === 'principal' || tr.id === 'mbr') html += `<div class="egrupo">${esc(grupo)}</div>`; }
        const ts = por[a.id] || [], ok = ts.filter(t => st.feito[t.id]).length, ref = st.reforco.includes(a.id);
        const lv = [...new Set(ts.filter(t => t.doLivro).map(t => t.nome.split(' · ')[0]))];
        html += `<div class="eaula${ok === ts.length && ts.length ? ' ok' : ''}" data-aula="${esc(a.id)}">
          <span><b>${esc(a.num)}</b> ${esc(a.titulo)}<small>${a.slides} slides · ${a.questoes} questões · ${ok}/${ts.length} etapas</small>${lv.length ? `<small>📗 + ${esc(lv.join(', '))}</small>` : ''}</span>
          <button class="eref${ref ? ' on' : ''}" title="Reforço: entra a leitura no livro e a aula em voz alta">⭐</button>
          <button class="ejasei">${ok === ts.length && ts.length ? '↺' : '✓ Já sei'}</button></div>`;
      }
    }
    q('#etrilha').innerHTML = html;
  }

  function ajustes() {
    q('#edias').innerHTML = [1, 2, 3, 4, 5, 6, 0].map(d => `<label>${DIAS[d].slice(0, 3)}<input type="number" min="0" max="600" step="10" data-dia="${d}" value="${st.min[d]}"></label>`).join('');
    q('#ediaslivros').innerHTML = [1, 2, 3, 4, 5, 6, 0].map(d => `<label>${DIAS[d].slice(0, 3)}<input type="number" min="0" max="600" step="10" data-dial="${d}" value="${st.minLivros[d]}"></label>`).join('');
    q('#etrilhas').innerHTML = dados.trilhas.map(t => `<label class="check"><input type="checkbox" data-trilha="${t.id}" ${st.trilhas[t.id] !== false ? 'checked' : ''}> ${esc(t.nome)}</label>`).join('');
    q('#eprio').innerHTML = Object.entries(VOLUMES).map(([l, nome]) => { const n = st.prioridade.indexOf(l);
      return `<button class="eprio${n >= 0 ? ' on' : ''}" data-prio="${esc(l)}">${n >= 0 ? `📌 ${n + 1}º` : '📌'} <b>${esc(l)}</b> ${esc(nome)}</button>`; }).join('');
    q('#elivros').value = st.livros; q('#epagina').value = st.porPagina;
    q('#eslide').value = st.porSlide; q('#equestao').value = st.porQuestao; q('#evoz').value = st.voz;
  }

  /* ---------------------------------------------------------------- ações */
  function marcar(id, sim) {
    if (sim) st.feito[id] = hoje(); else delete st.feito[id];
    if (id.startsWith('rev:') && sim) Object.keys(st.erros).forEach(k => { if (st.erros[k]) st.revisado[k] = true; });
    gravar(); mostrar();
  }

  function ligar() {
    const tela = q('#estudo');
    tela.addEventListener('change', e => {
      const el = e.target, card = el.closest('.etarefa');
      if (card && el.type === 'checkbox') return marcar(card.dataset.id, el.checked);
      if (el.classList.contains('eerros')) { st.erros[card.dataset.id] = el.value.trim(); delete st.revisado[card.dataset.id]; gravar(); return; }
      if (el.dataset.dia) st.min[+el.dataset.dia] = Math.max(0, +el.value || 0);
      else if (el.dataset.dial) st.minLivros[+el.dataset.dial] = Math.max(0, +el.value || 0);
      else if (el.dataset.trilha) st.trilhas[el.dataset.trilha] = el.checked;
      else if (el.id === 'eslide') st.porSlide = Math.max(0.2, +el.value || 1);
      else if (el.id === 'equestao') st.porQuestao = Math.max(0.5, +el.value || 3);
      else if (el.id === 'evoz') st.voz = Math.max(0, +el.value || 0);
      else if (el.id === 'elivros') st.livros = +el.value;
      else if (el.id === 'epagina') st.porPagina = Math.max(0.2, +el.value || 1.5);
      else return;
      gravar(); mostrar();
    });
    tela.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.rel) { const t = b.dataset.rel, era = st.rel && st.rel.t; pararRelogio();
        if (era !== t) st.rel = {t, ini: Date.now()}; gravar(); return relogio(); }
      if (b.dataset.aj) { const [t, m] = b.dataset.aj.split(':'); somar(hoje(), t, +m * 60); gravar(); return relogio(); }
      if (b.dataset.adiantar) { st.feito[b.dataset.adiantar] = hoje(); gravar(); return mostrar(); }
      if (b.dataset.prio) { const l = b.dataset.prio;
        st.prioridade = st.prioridade.includes(l) ? st.prioridade.filter(x => x !== l) : [...st.prioridade, l]; gravar(); return mostrar(); }
      const linha = b.closest('.eaula');
      if (!linha) return;
      const id = linha.dataset.aula;
      if (b.classList.contains('eref')) {
        st.reforco = st.reforco.includes(id) ? st.reforco.filter(x => x !== id) : [...st.reforco, id];
      } else if (b.classList.contains('ejasei')) {
        const ts = tarefas().filter(t => t.aula === id && !t.doLivro), todas = ts.every(t => st.feito[t.id]);
        if (todas) { if (!confirm('Voltar esta aula para a trilha (desmarcar tudo)?')) return; ts.forEach(t => delete st.feito[t.id]); }
        else ts.forEach(t => st.feito[t.id] = st.feito[t.id] || 'pulado');
      }
      gravar(); mostrar();
    });
    q('#ezerar').addEventListener('click', () => {
      if (!confirm('Apagar todo o progresso da trilha e começar do zero? (os ajustes de horário continuam)')) return;
      st.feito = {}; st.erros = {}; st.revisado = {}; gravar(); mostrar();
    });
  }

  async function carregar() {
    st = ler();
    q('#ehoje').innerHTML = '<p class="dica">Carregando a trilha…</p>';
    try {
      const r = await fetch(BASE + 'estudo.json', {cache: 'no-cache'});
      dados = await r.json();
    } catch (e) { q('#ehoje').innerHTML = `<p class="dica">Não consegui abrir a trilha (${esc(e.message)}).</p>`; return; }
    mostrar();
  }

  document.addEventListener('DOMContentLoaded', ligar);
  if (document.readyState !== 'loading') ligar();
  return {mostrar, _agenda: () => agenda(tarefas()), _duas: () => duas(tarefas()), _tarefas: () => tarefas()};
})();
