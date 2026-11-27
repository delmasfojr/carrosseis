/* 🎬 ROTINA — o cronograma de vídeos do professor (semana temática).
 *
 * Cada semana tem um assunto (na ordem do ranking do ENEM) e 7 vídeos, um por dia:
 *   seg ENEM fácil · ter curiosidade · qua ENEM médio · qui concurso · sex ENEM difícil · sáb vestibular · dom aula resumida.
 * Grava tudo no DOMINGO anterior (~1 h) e posta 1 por dia, de segunda a domingo.
 *
 * O plano vem de rotina/semanas.json (o Claude atualiza no PC e dá push).
 * Etapas de cada vídeo: ideia → roteiro → gravado → pronto → postado.
 *   - "gravado" também vem sozinho da aba 🎙️ Gravar (quando ele manda a gravação ao Drive);
 *   - "postado" ele marca aqui no app (fica guardado neste aparelho).
 */
const Rotina = (() => {
  const $ = s => document.querySelector(s);
  const BASE_R = new URL('./', location.href).href;
  const ETAPAS = ['ideia', 'roteiro', 'gravado', 'pronto', 'postado'];
  const ROTULO = {ideia: '💡 Escolhido', roteiro: '📝 Roteiro pronto', gravado: '🎙️ Gravado · Claude edita', pronto: '🎬 Vídeo pronto', postado: '✅ Postado'};
  const TIPO = {enem: '📘 ENEM', curiosidade: '🧠 Curiosidade', concurso: '🏛️ Concurso', vestibular: '🎓 Vestibular', aula: '🖥️ Aula'};
  const DIAS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
  const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  let plano = null, vista = 'hoje';

  const lerLS = (k, p) => { try { return JSON.parse(localStorage.getItem(k)) ?? p; } catch { return p; } };
  const gravarLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  try { vista = localStorage.getItem('rotinaVista') || 'hoje'; } catch {}

  const data = s => { const [a, m, d] = s.split('-').map(Number); return new Date(a, m - 1, d); };
  const mais = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const hoje0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const fmt = d => `${d.getDate()} ${MES[d.getMonth()]}`;
  const chave = (s, i) => `${s.grava}#${i}`;
  const esc = t => String(t).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));

  /** etapa real do vídeo: a maior entre a do plano, a da aba Gravar e a marcada aqui */
  function etapa(s, i) {
    const x = s.itens[i];
    let e = ETAPAS.indexOf(x.etapa || 'ideia');
    const gs = lerLS('gravarStatus', {})[x.roteiro];
    if (gs === 'enviado') e = Math.max(e, 2);
    if (lerLS('rotinaPostado', {})[chave(s, i)]) e = 4;
    return ETAPAS[Math.max(0, e)];
  }
  const diaPost = (s, i) => mais(data(s.grava), 1 + s.itens[i].dia);

  async function carregar() {
    try {
      const r = await fetch(BASE_R + 'rotina/semanas.json', {cache: 'no-store'});
      if (r.ok) { plano = await r.json(); gravarLS('rotinaCache', plano); }
    } catch {}
    if (!plano) plano = lerLS('rotinaCache', null);
  }

  /** semana "atual": a que tem postagem hoje; senão, a próxima a gravar */
  function semanaDe(d) {
    const ss = plano.semanas;
    for (const s of ss) { const g = data(s.grava); if (d > g && d <= mais(g, 7)) return s; }
    return ss.find(s => data(s.grava) >= d) || ss[ss.length - 1];
  }

  function cartao(s, i, comData = true) {
    const x = s.itens[i], e = etapa(s, i), d = diaPost(s, i);
    const div = document.createElement('div');
    div.className = 'rotitem e-' + e;
    div.innerHTML = `<div class="rottopo"><span>${TIPO[x.tipo] || x.tipo}</span>${comData ? `<span>${DIAS[x.dia]} · ${fmt(d)}</span>` : ''}</div>
      <b>${esc(x.titulo)}</b>${x.obs ? `<small>${esc(x.obs)}</small>` : ''}
      <div class="rotbarra">${ETAPAS.map((n, k) => `<i class="${k <= ETAPAS.indexOf(e) ? 'on' : ''}"></i>`).join('')}</div>
      <div class="rotacoes"><em>${ROTULO[e]}</em></div>`;
    const ac = div.querySelector('.rotacoes');
    if (e === 'roteiro' && x.roteiro) {
      const b = document.createElement('button'); b.className = 'sec'; b.textContent = '🎙️ Gravar';
      b.onclick = () => tela('gravar'); ac.append(b);
    }
    if (e === 'pronto' || e === 'gravado' || e === 'postado') {
      const b = document.createElement('button'); b.className = e === 'postado' ? 'sec' : 'principal';
      b.textContent = e === 'postado' ? '↩︎ Desmarcar' : '✅ Postei';
      b.onclick = () => { const p = lerLS('rotinaPostado', {}); if (p[chave(s, i)]) delete p[chave(s, i)]; else p[chave(s, i)] = Date.now(); gravarLS('rotinaPostado', p); desenhar(); };
      ac.append(b);
    }
    return div;
  }

  function cabecalho(s) {
    const g = data(s.grava);
    const feitos = s.itens.filter((_, i) => etapa(s, i) === 'postado').length;
    const h = document.createElement('div');
    h.className = 'rotsemana';
    h.innerHTML = `<small>Semana de ${fmt(mais(g, 1))} a ${fmt(mais(g, 7))} · aula ${s.aula}</small><b>${esc(s.tema)}</b>
      <small>${esc(s.porque)}</small>${s.itens.length ? `<div class="ebarra" style="margin-top:8px"><i style="width:${Math.round(100 * feitos / s.itens.length)}%"></i></div><small>${feitos} de ${s.itens.length} postados</small>` : ''}`;
    return h;
  }

  function vistaHoje(c) {
    const d = hoje0(), s = semanaDe(d);
    const domingo = d.getDay() === 0;
    // 1. postar hoje
    const h3 = t => { const h = document.createElement('h3'); h.textContent = t; c.append(h); };
    h3(`📲 Postar hoje · ${DIAS[(d.getDay() + 6) % 7]}, ${fmt(d)}`);
    let achou = false;
    for (const sem of plano.semanas) sem.itens.forEach((x, i) => { if (+diaPost(sem, i) === +d) { c.append(cartao(sem, i, false)); achou = true; } });
    if (!achou) c.insertAdjacentHTML('beforeend', '<p class="dica">Nada para postar hoje. A semana começa na segunda.</p>');
    // 2. gravar (domingo = dia de gravação da semana seguinte)
    const prox = plano.semanas.find(x => data(x.grava) >= d);
    if (prox && prox.itens.length) {
      const dg = data(prox.grava), falta = Math.round((dg - d) / 864e5);
      h3(domingo && falta === 0 ? '🎙️ Gravar hoje' : `🎙️ Próxima gravação · dom, ${fmt(dg)}${falta ? ` (em ${falta} dia${falta > 1 ? 's' : ''})` : ''}`);
      c.append(cabecalho(prox));
      const pg = prox.itens.map((_, i) => i).filter(i => ETAPAS.indexOf(etapa(prox, i)) < 2);
      const prontos = pg.filter(i => etapa(prox, i) === 'roteiro' && prox.itens[i].roteiro).length;
      c.insertAdjacentHTML('beforeend', `<p class="dica">${prontos} de ${pg.length} roteiros já estão na aba 🎙️ Gravar. Os outros o Claude ainda vai preparar antes do domingo.</p>`);
      pg.forEach(i => c.append(cartao(prox, i)));
    }
    // 3. atrasados: dia já passou e não foi postado
    const atr = [];
    for (const sem of plano.semanas) sem.itens.forEach((x, i) => { if (diaPost(sem, i) < d && etapa(sem, i) !== 'postado') atr.push([sem, i]); });
    if (atr.length) { h3('⏰ Ficou para trás'); atr.forEach(([sem, i]) => c.append(cartao(sem, i))); }
    if (s && s !== prox && s.itens.length) { h3('📅 Esta semana'); c.append(cabecalho(s)); }
  }

  function vistaSemana(c) {
    const s = semanaDe(hoje0());
    c.append(cabecalho(s));
    if (!s.itens.length) { c.insertAdjacentHTML('beforeend', '<p class="dica">O Claude ainda vai escolher as questões desta semana.</p>'); return; }
    s.itens.forEach((_, i) => c.append(cartao(s, i)));
  }

  function vistaCalendario(c) {
    const d = hoje0();
    for (const s of plano.semanas) {
      const passou = mais(data(s.grava), 7) < d;
      const det = document.createElement('details');
      det.className = 'mais rotcal' + (passou ? ' passou' : '');
      const n = s.itens.length, feitos = s.itens.filter((_, i) => etapa(s, i) === 'postado').length;
      det.innerHTML = `<summary><span>🎙️ dom ${fmt(data(s.grava))}</span> <b>${esc(s.tema)}</b> <small>${n ? `${feitos}/${n} postados` : 'a planejar'}</small></summary>`;
      det.append(cabecalho(s));
      s.itens.forEach((_, i) => det.append(cartao(s, i)));
      if (!n) det.insertAdjacentHTML('beforeend', '<p class="dica">Questões ainda não escolhidas.</p>');
      if (s === semanaDe(d)) det.open = true;
      c.append(det);
    }
  }

  function desenhar() {
    const c = $('#rotconteudo');
    c.innerHTML = '';
    document.querySelectorAll('[data-rv]').forEach(b => b.classList.toggle('on', b.dataset.rv === vista));
    if (!plano || !plano.semanas || !plano.semanas.length) { c.innerHTML = '<p class="dica">O cronograma ainda não chegou. Abra com internet.</p>'; return; }
    ({hoje: vistaHoje, semana: vistaSemana, calendario: vistaCalendario})[vista](c);
    c.insertAdjacentHTML('beforeend', `<p class="dica" style="margin-top:18px">Toda semana: <b>3 ENEM</b> (fácil → difícil), <b>1 concurso</b>, <b>1 vestibular</b>, <b>1 curiosidade</b> e <b>1 aula resumida</b>. Grava no domingo (~1 h) e posta 1 por dia. Plano atualizado em ${plano.atualizado.split('-').reverse().join('/')}.</p>`);
  }

  async function mostrar() {
    document.querySelectorAll('[data-rv]').forEach(b => b.onclick = () => { vista = b.dataset.rv; try { localStorage.setItem('rotinaVista', vista); } catch {} desenhar(); });
    if (!plano) $('#rotconteudo').innerHTML = '<p class="dica">Buscando o cronograma…</p>';
    await carregar();
    desenhar();
  }
  return {mostrar};
})();
