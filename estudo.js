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
    trilhas: {principal: true, enem: true, concursos: true, mb: true},
    reforco: ['principal:61 - Análise Combinatória', 'principal:63 - Probabilidade'],
    feito: {}, erros: {}, revisado: {},
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
  function tarefas() {
    const fila = [];
    for (const a of dados.aulas) {
      if (!st.trilhas[a.trilha]) continue;
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
    }
    return fila;
  }

  // encaixa as tarefas que faltam nos dias, a partir de hoje (o que já foi feito hoje continua na lista de hoje)
  function agenda(fila, dias = 4000) {
    const pend = fila.filter(t => !st.feito[t.id]), out = [];
    const errosAbertos = Object.keys(st.erros).filter(k => st.erros[k] && !st.revisado[k]);
    let i = 0;
    for (let n = 0; n < dias && (i < pend.length || n === 0); n++) {
      const d = mais(new Date(), n), chave = iso(d), cap = st.min[d.getDay()] || 0, lista = [];
      if (n === 0) lista.push(...fila.filter(t => st.feito[t.id] === chave));
      const sab = d.getDay() === 6 && cap > 0;
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

  function mostrar() {
    if (!dados) { carregar(); return; }
    const fila = tarefas(), total = fila.reduce((s, t) => s + t.min, 0);
    const feito = fila.filter(t => st.feito[t.id]).reduce((s, t) => s + t.min, 0);
    const ag = agenda(fila), fim = ag[ag.length - 1], semana = st.min.reduce((a, b) => a + b, 0);
    const pct = total ? Math.round(100 * feito / total) : 0;
    q('#eresumo').innerHTML = `<div class="ebarra"><i style="width:${pct}%"></i></div>
      <p><b>${pct}% feito</b> · faltam ${hm(total - feito)} de estudo (${hm(semana)} por semana)<br>
      Nesse ritmo você termina tudo por volta de <b>${fim.d.toLocaleDateString('pt-BR', {day: 'numeric', month: 'long', year: 'numeric'})}</b>.</p>`;
    const h = ag[0];
    q('#ehojetit').textContent = `Hoje · ${DIAS[h.d.getDay()]}, ${br(h.d)} · ${hm(h.usado)}`;
    q('#ehoje').innerHTML = h.lista.length ? h.lista.map(t => cartao(t, true)).join('')
      : `<p class="dica">${h.cap ? 'Tudo feito! 🎉' : 'Hoje está sem horário de estudo. Ajuste em “⚙️ Ajustar o plano” se quiser estudar.'}</p>`;
    const prox = h.lista.length && h.lista.every(t => st.feito[t.id]) && ag[1] ? ag[1].lista.find(t => !t.id.startsWith('rev:')) : null;
    q('#eadiantar').innerHTML = prox ? `<button class="sec" data-adiantar="${esc(prox.id)}">⏩ Terminei cedo: adiantar “${esc(prox.nome)} · ${esc(prox.txt)}”</button>` : '';
    q('#esemana').innerHTML = ag.slice(1, 8).map(x => `<div class="edia"><b>${DIAS[x.d.getDay()]}, ${br(x.d)}</b> <span>${hm(x.usado)}</span>
      <ul>${x.lista.map(t => `<li>${ICONE[t.tipo]} ${esc(t.nome)} — ${esc(t.txt)}</li>`).join('') || '<li>sem estudo</li>'}</ul></div>`).join('');
    trilhaCompleta(fila);
    ajustes();
  }

  function trilhaCompleta(fila) {
    const por = {};
    fila.forEach(t => (por[t.aula] = por[t.aula] || []).push(t));
    let html = '';
    for (const tr of dados.trilhas) {
      const aulas = dados.aulas.filter(a => a.trilha === tr.id);
      if (!st.trilhas[tr.id]) { html += `<h4>${esc(tr.nome)} <small>(fora do plano)</small></h4>`; continue; }
      html += `<h4>${esc(tr.nome)}</h4>`;
      let grupo = '';
      for (const a of aulas) {
        if (a.grupo !== grupo) { grupo = a.grupo; if (tr.id === 'principal') html += `<div class="egrupo">${esc(grupo)}</div>`; }
        const ts = por[a.id] || [], ok = ts.filter(t => st.feito[t.id]).length, ref = st.reforco.includes(a.id);
        html += `<div class="eaula${ok === ts.length && ts.length ? ' ok' : ''}" data-aula="${esc(a.id)}">
          <span><b>${esc(a.num)}</b> ${esc(a.titulo)}<small>${a.slides} slides · ${a.questoes} questões · ${ok}/${ts.length} etapas</small></span>
          <button class="eref${ref ? ' on' : ''}" title="Reforço: entra a leitura no livro e a aula em voz alta">⭐</button>
          <button class="ejasei">${ok === ts.length && ts.length ? '↺' : '✓ Já sei'}</button></div>`;
      }
    }
    q('#etrilha').innerHTML = html;
  }

  function ajustes() {
    q('#edias').innerHTML = [1, 2, 3, 4, 5, 6, 0].map(d => `<label>${DIAS[d].slice(0, 3)}<input type="number" min="0" max="600" step="10" data-dia="${d}" value="${st.min[d]}"></label>`).join('');
    q('#etrilhas').innerHTML = dados.trilhas.map(t => `<label class="check"><input type="checkbox" data-trilha="${t.id}" ${st.trilhas[t.id] ? 'checked' : ''}> ${esc(t.nome)}</label>`).join('');
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
      else if (el.dataset.trilha) st.trilhas[el.dataset.trilha] = el.checked;
      else if (el.id === 'eslide') st.porSlide = Math.max(0.2, +el.value || 1);
      else if (el.id === 'equestao') st.porQuestao = Math.max(0.5, +el.value || 3);
      else if (el.id === 'evoz') st.voz = Math.max(0, +el.value || 0);
      else return;
      gravar(); mostrar();
    });
    tela.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.adiantar) { st.feito[b.dataset.adiantar] = hoje(); gravar(); return mostrar(); }
      const linha = b.closest('.eaula');
      if (!linha) return;
      const id = linha.dataset.aula;
      if (b.classList.contains('eref')) {
        st.reforco = st.reforco.includes(id) ? st.reforco.filter(x => x !== id) : [...st.reforco, id];
      } else if (b.classList.contains('ejasei')) {
        const ts = tarefas().filter(t => t.aula === id), todas = ts.every(t => st.feito[t.id]);
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
  return {mostrar, _agenda: () => agenda(tarefas()), _tarefas: () => tarefas()};
})();
