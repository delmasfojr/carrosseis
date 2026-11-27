/* 🎬 ROTINA — o cronograma de vídeos do professor, em duas trilhas: 📘 ENEM e 🏛️ Concurso.
 *
 * Cada semana tem um assunto e um vídeo por dia (seg a dom); grava no DOMINGO anterior e posta 1 por dia.
 *   ENEM:     seg/qua/qui/sex questões do ENEM (fácil → difícil), ter curiosidade, dom aula resumida.
 *   Concurso: seg/qua/qui/sex questões das bancas (FGV, Cebraspe, Vunesp, Cesgranrio), ter macete, dom aula resumida.
 * O plano vem de rotina/semanas.json (montado no PC por montar_rotina.py; o Claude atualiza e dá push).
 *
 * ✨ Criar roteiro: o PRÓPRIO APP cria o roteiro com o Gemini (Roteiro.daRotina): questão do ENEM pelo banco do app,
 * questão de concurso pelo cartão rotina/q/<id>.jpg, curiosidade/macete/aula pelo assunto.
 * Os roteiros criados ficam ligados ao item (localStorage rotinaRoteiros) e a etapa anda sozinha:
 *   ideia → roteiro (criado) → gravado → pronto (vídeo montado) → postado (YouTube, ou ✅ Postei).
 */
const Rotina = (() => {
  const $ = s => document.querySelector(s);
  const BASE_R = new URL('./', location.href).href;
  const ETAPAS = ['ideia', 'roteiro', 'gravado', 'pronto', 'postado'];
  const ROTULO = {ideia: '💡 Falta o roteiro', roteiro: '📝 Roteiro pronto', gravado: '🎙️ Gravado', pronto: '🎬 Vídeo pronto', postado: '✅ Postado'};
  const TIPO = {enem: '📘 ENEM', curiosidade: '🧠 Curiosidade', concurso: '🏛️ Concurso', macete: '⚡ Macete', vestibular: '🎓 Vestibular', aula: '🖥️ Aula'};
  const DIAS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
  const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  let plano = null, doApp = new Map(), criando = false;
  let vista = 'hoje', trilha = 'enem';

  const lerLS = (k, p) => { try { return JSON.parse(localStorage.getItem(k)) ?? p; } catch { return p; } };
  const gravarLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  try { vista = localStorage.getItem('rotinaVista') || 'hoje'; trilha = localStorage.getItem('rotinaTrilha') || 'enem'; } catch {}

  const data = s => { const [a, m, d] = s.split('-').map(Number); return new Date(a, m - 1, d); };
  const mais = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const hoje0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const fmt = d => `${d.getDate()} ${MES[d.getMonth()]}`;
  const esc = t => String(t).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  const semanas = () => (plano && plano.trilhas && plano.trilhas[trilha]) || [];

  /** roteiros do app ligados a este item (os criados pelo ✨) */
  const ligados = x => (lerLS('rotinaRoteiros', {})[x.id] || []).map(id => doApp.get(id)).filter(Boolean);

  /** etapa real: a maior entre a do plano, a dos roteiros do app, a da aba Gravar e a marcada aqui */
  function etapa(x) {
    let e = ETAPAS.indexOf(x.etapa || 'ideia');
    for (const r of ligados(x)) e = Math.max(e, r.youtube ? 4 : r.video ? 3 : r.gravado ? 2 : 1);
    if (lerLS('gravarStatus', {})[x.roteiro] === 'enviado') e = Math.max(e, 2);
    if (lerLS('rotinaPostado', {})[x.id]) e = 4;
    return ETAPAS[Math.max(0, e)];
  }
  const diaPost = (s, x) => mais(data(s.grava), 1 + x.dia);

  async function carregar() {
    try {
      const r = await fetch(BASE_R + 'rotina/semanas.json', {cache: 'no-store'});
      if (r.ok) { plano = await r.json(); gravarLS('rotinaCache', plano); }
    } catch {}
    if (!plano || !plano.trilhas) plano = lerLS('rotinaCache', null);
    try { doApp = new Map((await Roteiro.todos()).map(r => [r.id, r])); } catch { doApp = new Map(); }
  }

  /** semana "atual": a que tem postagem hoje; senão, a próxima a gravar */
  function semanaDe(d) {
    const ss = semanas();
    for (const s of ss) { const g = data(s.grava); if (d > g && d <= mais(g, 7)) return s; }
    return ss.find(s => data(s.grava) >= d) || ss[ss.length - 1];
  }

  async function criar(x, botao) {
    if (criando) return;
    if (typeof Roteiro === 'undefined' || !Roteiro.daRotina) return alert('Atualize o app (feche e abra de novo).');
    criando = true;
    const t0 = new Date().toISOString();
    if (x.gerar.assunto) botao.textContent = '⏳ Escrevendo o roteiro… (até 1 min)';
    botao.disabled = true;
    try {
      await Roteiro.daRotina(x.gerar, botao);
      const novos = (await Roteiro.todos()).filter(r => r.criado >= t0).map(r => r.id);
      if (novos.length) { const m = lerLS('rotinaRoteiros', {}); m[x.id] = [...new Set([...(m[x.id] || []), ...novos])]; gravarLS('rotinaRoteiros', m); }
    } finally { criando = false; }
    // gerarPdf/gerarAssunto já levam para o roteiro pronto; a Rotina se redesenha quando ele voltar
  }

  function cartao(s, x, comData = true) {
    const e = etapa(x), d = diaPost(s, x), rs = ligados(x);
    const div = document.createElement('div');
    div.className = 'rotitem e-' + e;
    div.innerHTML = `<div class="rottopo"><span>${TIPO[x.tipo] || x.tipo}</span>${comData ? `<span>${DIAS[x.dia]} · ${fmt(d)}</span>` : ''}</div>
      <b>${esc(x.titulo)}</b>
      <div class="rotbarra">${ETAPAS.map((n, k) => `<i class="${k <= ETAPAS.indexOf(e) ? 'on' : ''}"></i>`).join('')}</div>
      <div class="rotacoes"><em>${ROTULO[e]}</em></div>`;
    const ac = div.querySelector('.rotacoes');
    const bt = (txt, cls, fn) => { const b = document.createElement('button'); b.className = cls; b.textContent = txt; b.onclick = () => fn(b); ac.append(b); return b; };
    if (rs.length) bt(rs.length > 1 ? `📂 Abrir (${rs.length})` : '📂 Abrir', 'sec', () => {
      if (rs.length > 1) { tela('roteiros'); return; }
      tela('roteiros'); Roteiro.abrir(rs[0].id);
    });
    else if (x.roteiro && e !== 'postado') bt('🎙️ Gravar', 'sec', () => tela('gravar'));
    if (e === 'ideia' && x.gerar) bt('✨ Criar roteiro', 'principal', b => criar(x, b));
    if (e !== 'ideia') bt(e === 'postado' ? '↩︎' : '✅ Postei', e === 'postado' ? 'sec' : 'sec', () => {
      const p = lerLS('rotinaPostado', {}); if (p[x.id]) delete p[x.id]; else p[x.id] = Date.now(); gravarLS('rotinaPostado', p); desenhar();
    });
    return div;
  }

  function cabecalho(s) {
    const g = data(s.grava);
    const feitos = s.itens.filter(x => etapa(x) === 'postado').length;
    const h = document.createElement('div');
    h.className = 'rotsemana';
    h.innerHTML = `<small>Semana de ${fmt(mais(g, 1))} a ${fmt(mais(g, 7))} · aula ${esc(s.aula)}</small><b>${esc(s.tema)}</b>
      ${s.porque ? `<small>${esc(s.porque)}</small>` : ''}${s.itens.length ? `<div class="ebarra" style="margin-top:8px"><i style="width:${Math.round(100 * feitos / s.itens.length)}%"></i></div><small>${feitos} de ${s.itens.length} postados</small>` : ''}`;
    return h;
  }

  function vistaHoje(c) {
    const d = hoje0();
    const h3 = t => { const h = document.createElement('h3'); h.textContent = t; c.append(h); };
    h3(`📲 Postar hoje · ${DIAS[(d.getDay() + 6) % 7]}, ${fmt(d)}`);
    let achou = false;
    for (const s of semanas()) s.itens.forEach(x => { if (+diaPost(s, x) === +d) { c.append(cartao(s, x, false)); achou = true; } });
    if (!achou) c.insertAdjacentHTML('beforeend', '<p class="dica">Nada para postar hoje. A semana começa na segunda.</p>');
    const prox = semanas().find(s => data(s.grava) >= d);
    if (prox && prox.itens.length) {
      const dg = data(prox.grava), falta = Math.round((dg - d) / 864e5);
      h3(falta === 0 ? '🎙️ Gravar hoje' : `🎙️ Próxima gravação · dom, ${fmt(dg)} (em ${falta} dia${falta > 1 ? 's' : ''})`);
      c.append(cabecalho(prox));
      const sem = prox.itens.filter(x => etapa(x) === 'ideia').length;
      if (sem) c.insertAdjacentHTML('beforeend', `<p class="dica">${sem} vídeo${sem > 1 ? 's' : ''} ainda sem roteiro: toque em <b>✨ Criar roteiro</b> e o app monta com o Gemini (de graça).</p>`);
      prox.itens.filter(x => ETAPAS.indexOf(etapa(x)) < 2).forEach(x => c.append(cartao(prox, x)));
    }
    const atr = [];
    for (const s of semanas()) s.itens.forEach(x => { if (diaPost(s, x) < d && etapa(x) !== 'postado') atr.push([s, x]); });
    if (atr.length) { h3('⏰ Ficou para trás'); atr.forEach(([s, x]) => c.append(cartao(s, x))); }
  }

  function vistaSemana(c) {
    const s = semanaDe(hoje0());
    if (!s) return;
    c.append(cabecalho(s));
    if (!s.itens.length) { c.insertAdjacentHTML('beforeend', '<p class="dica">O Claude ainda vai escolher as questões desta semana.</p>'); return; }
    s.itens.forEach(x => c.append(cartao(s, x)));
  }

  function vistaCalendario(c) {
    const d = hoje0(), atual = semanaDe(d);
    for (const s of semanas()) {
      const passou = mais(data(s.grava), 7) < d;
      const det = document.createElement('details');
      det.className = 'mais rotcal' + (passou ? ' passou' : '');
      const n = s.itens.length, feitos = s.itens.filter(x => etapa(x) === 'postado').length;
      det.innerHTML = `<summary><span>🎙️ dom ${fmt(data(s.grava))}</span> <b>${esc(s.tema)}</b> <small>${n ? `${feitos}/${n} postados` : 'a planejar'}</small></summary>`;
      det.append(cabecalho(s));
      s.itens.forEach(x => det.append(cartao(s, x)));
      if (!n) det.insertAdjacentHTML('beforeend', '<p class="dica">Questões ainda não escolhidas.</p>');
      if (s === atual) det.open = true;
      c.append(det);
    }
  }

  const EXPLICA = {
    enem: 'Toda semana: <b>4 questões do ENEM</b> (fácil → difícil), <b>1 curiosidade</b> e <b>1 aula resumida</b>, no assunto que mais cai.',
    concurso: 'Toda semana: <b>4 questões de concurso</b> (FGV, Cebraspe, Vunesp, Cesgranrio), <b>1 macete</b> e <b>1 aula resumida</b>, na ordem do módulo de concursos.',
  };
  function desenhar() {
    const c = $('#rotconteudo');
    c.innerHTML = '';
    document.querySelectorAll('[data-rv]').forEach(b => b.classList.toggle('on', b.dataset.rv === vista));
    document.querySelectorAll('[data-rt]').forEach(b => b.classList.toggle('on', b.dataset.rt === trilha));
    if (!semanas().length) { c.innerHTML = '<p class="dica">O cronograma ainda não chegou. Abra com internet.</p>'; return; }
    ({hoje: vistaHoje, semana: vistaSemana, calendario: vistaCalendario})[vista](c);
    c.insertAdjacentHTML('beforeend', `<p class="dica" style="margin-top:18px">${EXPLICA[trilha]} Grava no domingo e posta 1 por dia. Plano de ${plano.atualizado.split('-').reverse().join('/')}.</p>`);
  }

  async function mostrar() {
    document.querySelectorAll('[data-rv]').forEach(b => b.onclick = () => { vista = b.dataset.rv; try { localStorage.setItem('rotinaVista', vista); } catch {} desenhar(); });
    document.querySelectorAll('[data-rt]').forEach(b => b.onclick = () => { trilha = b.dataset.rt; try { localStorage.setItem('rotinaTrilha', trilha); } catch {} desenhar(); });
    if (!plano) $('#rotconteudo').innerHTML = '<p class="dica">Buscando o cronograma…</p>';
    await carregar();
    desenhar();
  }
  return {mostrar};
})();
