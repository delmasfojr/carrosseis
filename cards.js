/* Desenho dos 5 cards do carrossel @delmaosimplifica.
   Usado pelo app do celular (index.html) e pelo gerador do PC (carrossel.py).
   Cards.html(conteudo, n, base, desenhos) -> página HTML completa (1080×1350) do card n (1 a 5).
     base: endereço da pasta app/ (terminado em "/");
     desenhos: Map nome -> palavras-gatilho (desenhos/gatilhos.json). Um adesivo só entra se o texto
     daquele pedaço do card tiver uma palavra dele; senão o código procura outro que tenha; se nenhum tiver, fica sem adesivo. */
const Cards = (() => {
  const NAVY = '#0F1B2D', LAR = '#FF7A00', TOTAL = 5;
  const POSES = ['explicando', 'ideia', 'joinha', 'resolvendo', 'pensando', 'desafiando', 'confiante', 'estudando'];
  const ICONES = {
    coracao: 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
    comentar: 'M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z',
    enviar: 'M2.01 21L23 12 2.01 3 2 10l15 2-15 2z',
    salvar: 'M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2z',
  };
  // Impact/Segoe só existem no Windows; no celular entram Anton/Open Sans (fontes do app)
  const IMP = "Impact,'Anton',sans-serif", TXT = "'Segoe UI','Open Sans',sans-serif", MAO = "'Kalam','Segoe Print',cursive";

  const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1080px;height:1350px;overflow:hidden;background:#FFF6E6}
body{--s:1;font-family:${TXT};color:${NAVY}}
.card{position:relative;width:1080px;height:1350px;padding:46px 60px 0;display:flex;flex-direction:column;background:#FFF6E6}
.top{text-align:right;font-family:${IMP};font-size:46px;letter-spacing:.5px;height:58px;line-height:58px}
.top span,.hl,.l2{color:${LAR}}
.titulo{font-family:${IMP};text-transform:uppercase;line-height:1.02;margin-top:6px}
.titulo div{white-space:nowrap;font-size:calc(var(--s)*150px)}
.barra{width:300px;height:14px;border-radius:7px;background:${LAR};margin:14px 0 26px;flex:none}
.main{flex:1;min-height:0;position:relative;display:flex;flex-direction:column}
.zona{position:relative;flex:1}
.foot{height:96px;flex:none;position:relative}
.dots{position:absolute;left:50%;top:30px;transform:translateX(-50%);display:flex;gap:14px}
.dots i{width:24px;height:24px;border-radius:50%;background:#D9DDE3}
.dots i.on{background:${LAR}}
.arrasta{position:absolute;right:0;top:12px;font-family:${IMP};font-size:50px;color:${LAR}}
.faixa{position:absolute;left:0;right:0;bottom:0;height:22px;background:${LAR}}
.mascote{position:absolute;bottom:0;height:100%;object-fit:contain;object-position:bottom left;max-width:430px}
.mascote.dir{object-position:bottom right}
.mao{font-family:${MAO};font-weight:bold;color:${NAVY};line-height:1.15}
b{font-weight:800}
.sub{font-size:calc(var(--s)*54px);line-height:1.22}
.sub .hl{font-weight:900}
.questao{position:absolute;right:0;top:0;width:540px;z-index:2;background:#fff;border:6px solid ${NAVY};
  border-radius:30px;padding:28px 30px 30px;transform:rotate(2deg);box-shadow:10px 12px 0 #D9DDE3}
.qtopo{display:flex;justify-content:space-between;align-items:center}
.qrot{font-family:${IMP};font-style:italic;font-size:50px}
.qnum{background:#E6F1FF;border-radius:14px;padding:4px 16px;font-weight:700;font-size:28px}
.qdest{margin:22px 0 22px;background:#FFE9A8;border:5px solid ${LAR};border-radius:60px;
  padding:14px 20px;font-weight:800;font-size:calc(var(--s)*36px);text-align:center}
.qcorpo{display:flex;gap:20px;align-items:center}
.linhas{flex:1;display:flex;flex-direction:column;gap:18px}
.linhas i{display:block;height:16px;border-radius:8px;background:#D9DDE3}
.qemoji{font-size:100px;line-height:1}
.qconta{flex:1;min-width:0;font-size:calc(var(--s)*62px);text-align:center;white-space:nowrap;color:${NAVY}}
.quadro{position:absolute;right:0;top:0;width:560px;z-index:2;background:#1F4D3A;border:16px solid #B8763C;
  border-radius:20px;padding:24px 26px 30px;transform:rotate(-2deg);box-shadow:10px 12px 0 #D9DDE3;text-align:center}
.qrot2{font-family:${IMP};font-size:42px;color:#FFD95A;letter-spacing:1px}
.giz{font-size:calc(var(--s)*74px);color:#fff;margin:6px 0 0;white-space:nowrap;line-height:1.15}
.gizlinha{display:block;margin:4px auto 14px;width:70%;height:6px;border-radius:3px;background:#FFFFFFAA}
.giz.solta{white-space:normal;font-size:calc(var(--s)*58px);line-height:1.12;margin:10px 0 0}
.qperg{font-size:calc(var(--s)*32px);font-weight:700;color:#E6F1FF;line-height:1.25}
.postit{position:absolute;right:16px;top:6px;width:500px;z-index:2;background:#FFE066;padding:46px 30px 26px;
  transform:rotate(3deg);box-shadow:8px 12px 0 #D9DDE3;text-align:center;border-radius:4px 4px 30px 4px}
.fita{position:absolute;top:-24px;left:50%;width:190px;height:48px;margin-left:-95px;background:#FFB46ACC;transform:rotate(-4deg)}
.prot{font-family:${IMP};font-size:42px;color:${LAR};letter-spacing:1px}
.pconta{font-size:calc(var(--s)*66px);margin:4px 0 6px;white-space:nowrap;line-height:1.15}
.pperg{font-size:calc(var(--s)*32px);font-weight:700;line-height:1.25}
.pemoji{display:flex;justify-content:center;margin-top:12px}
.celular{position:absolute;right:10px;top:8px;width:500px;z-index:2;background:${NAVY};border-radius:56px;padding:18px 16px 22px;
  transform:rotate(3deg);box-shadow:10px 12px 0 #D9DDE3}
.celular .tela{background:#F4F7FB;border-radius:38px;padding:46px 22px 18px;position:relative}
.celular .notch{position:absolute;top:14px;left:50%;width:110px;height:22px;margin-left:-55px;border-radius:11px;background:${NAVY}}
.celular .app{display:flex;align-items:center;gap:12px;font-family:${IMP};font-size:34px;color:${NAVY};letter-spacing:1px;
  border-bottom:3px solid #D9DDE3;padding-bottom:12px;margin-bottom:18px}
.celular .app i{width:44px;height:44px;border-radius:50%;background:${LAR};flex:none}
.balao{background:#fff;border:4px solid ${NAVY};border-radius:30px 30px 30px 6px;padding:14px 18px;font-weight:800;
  font-size:calc(var(--s)*44px);line-height:1.15;margin-right:20px}
.balao.eu{background:#FFE9A8;border-color:${LAR};border-radius:30px 30px 6px 30px;margin:14px 0 0 50px;text-align:center;
  font-size:calc(var(--s)*54px);white-space:nowrap}
.celular .linha{display:flex;align-items:flex-end;gap:10px}
.celular .linha .balao{flex:1;margin-right:0}
.caderno{position:absolute;right:0;top:0;width:540px;z-index:2;border-radius:10px 24px 24px 10px;transform:rotate(-2deg);
  box-shadow:10px 12px 0 #D9DDE3;padding:26px 28px 26px 92px;border:5px solid ${NAVY};
  background:#fff repeating-linear-gradient(#fff 0 52px,#9CC3F0 52px 55px);background-position:0 22px}
.caderno:before{content:'';position:absolute;left:62px;top:0;bottom:0;width:4px;background:#F08A8A}
.caderno .espiral{position:absolute;left:14px;top:22px;bottom:22px;display:flex;flex-direction:column;justify-content:space-between}
.caderno .espiral i{display:block;width:34px;height:16px;border-radius:8px;border:5px solid #8A94A3;background:#fff}
.crot{font-family:${IMP};font-size:40px;color:${LAR};letter-spacing:1px;line-height:52px}
.cperg{font-size:calc(var(--s)*54px);line-height:1.08;color:${NAVY}}
.cconta{font-size:calc(var(--s)*62px);white-space:nowrap;line-height:1.15;color:${LAR}}
.caderno .cemoji{position:absolute;right:20px;bottom:16px}
.branco{position:absolute;right:0;top:0;width:560px;z-index:2;background:#fff;border:14px solid #B9C1CC;border-radius:18px;
  padding:22px 28px 34px;transform:rotate(2deg);box-shadow:10px 12px 0 #D9DDE3;text-align:center}
.branco .ima{position:absolute;top:-22px;width:38px;height:38px;border-radius:50%;box-shadow:0 4px 0 #0002}
.branco .bandeja{position:absolute;left:40px;right:40px;bottom:-34px;height:20px;border-radius:6px;background:#9AA3AF}
.branco .marcador{position:absolute;right:70px;bottom:-30px;width:120px;height:20px;border-radius:10px;background:${LAR}}
.brot{font-family:${IMP};font-size:40px;color:${LAR};letter-spacing:1px}
.bconta{font-size:calc(var(--s)*72px);white-space:nowrap;line-height:1.15;color:#2F7DE1;margin:6px 0}
.bperg{font-size:calc(var(--s)*58px);line-height:1.1;color:${NAVY};margin:10px 0}
.branco .bemoji{position:absolute;right:18px;bottom:14px}
.branco .bperg{margin:10px 70px 0 30px}
.capa-frase{position:absolute;right:10px;bottom:6px;width:540px;z-index:3;text-align:center;font-size:calc(var(--s)*56px);
  transform:rotate(-5deg);color:${NAVY}}
.sublinhado{display:block;margin:6px auto 0;width:80%;height:10px;border-radius:5px;background:${LAR}}
.texto{font-size:calc(var(--s)*52px);line-height:1.22;margin-bottom:30px}
.texto .hl{font-weight:800}
.itens{display:flex;flex-direction:column;gap:26px}
.item{display:flex;align-items:center;border-radius:30px;padding:30px 26px;gap:24px}
.item:nth-child(odd){background:#E6F1FF}.item:nth-child(even){background:#FFE9D6}
.iemoji{font-size:calc(var(--s)*92px);line-height:1;width:120px;text-align:center;flex:none}
.div{width:6px;align-self:stretch;border-radius:3px;background:${LAR};flex:none}
.iperg{font-family:${IMP};font-size:calc(var(--s)*58px);line-height:1.02;flex:1}
.inota{font-size:calc(var(--s)*34px);width:290px;flex:none;color:${NAVY}}
.inota:before{content:'\\2192';color:${LAR};font-family:${TXT};font-weight:900;margin-right:8px}
.oval{position:absolute;right:30px;bottom:60px;width:520px;padding:36px 30px;border:6px solid ${LAR};
  border-radius:50%;text-align:center;font-size:calc(var(--s)*50px);transform:rotate(-5deg)}
.box{position:relative;border-radius:30px;background:#fff}
.tag{position:absolute;top:-34px;left:34px;background:${LAR};color:#fff;font-family:${IMP};font-size:44px;
  padding:4px 26px;border-radius:16px;transform:rotate(-3deg)}
.enun{border:5px solid ${NAVY};padding:40px 34px 32px;display:flex;align-items:center;gap:20px}
.enun p{flex:1;font-size:calc(var(--s)*44px);line-height:1.25}
.enun .e{font-size:150px;line-height:1}
.perg{display:inline-block;margin:36px 0 0 120px;background:#FFE3B3;border-radius:50px;padding:8px 44px;
  font-family:${IMP};font-style:italic;font-size:calc(var(--s)*66px);transform:rotate(-2deg)}
.coldir{position:absolute;right:0;top:0;width:620px;display:flex;flex-direction:column;gap:24px}
.resol{border:5px solid ${LAR};padding:46px 30px 26px}
.passo{display:flex;align-items:center;gap:18px;font-size:calc(var(--s)*44px);font-weight:600;margin:8px 0}
.num{flex:none;width:58px;height:58px;border-radius:50%;background:${NAVY};color:#fff;font-weight:800;
  font-size:34px;display:flex;align-items:center;justify-content:center}
.resp{background:${NAVY};border:7px solid ${LAR};border-radius:34px;color:#fff;font-family:${IMP};
  font-size:calc(var(--s)*86px);text-align:center;padding:8px 20px;white-space:nowrap}
.resp span{color:${LAR}}
.dest{background:${NAVY};border-radius:40px;padding:36px 40px;display:flex;align-items:center;gap:30px}
.dest .e{font-size:150px;line-height:1}
.dest p{color:#fff;font-family:${IMP};font-size:calc(var(--s)*62px);line-height:1.08;border-left:7px solid ${LAR};padding-left:30px}
.etapas{display:flex;align-items:center;justify-content:space-between;margin-top:66px;margin-bottom:20px}
.etapa{position:relative;flex:1;border:5px solid ${LAR};border-radius:30px;background:#fff;padding:52px 6px 22px;text-align:center}
.etapa .n{position:absolute;top:-38px;left:50%;transform:translateX(-50%);width:72px;height:72px;border-radius:50%;
  background:${LAR};color:#fff;font-family:${IMP};font-size:44px;display:flex;align-items:center;justify-content:center}
.etapa .r{font-family:${IMP};font-size:calc(var(--s)*42px);white-space:nowrap}
.etapa .e{font-size:100px;line-height:1.2}
.seta{color:${LAR};font-size:60px;font-weight:900;padding:0 8px;flex:none}
.res-frase{position:absolute;left:10px;bottom:80px;width:520px;font-size:calc(var(--s)*64px);transform:rotate(-6deg)}
.ctatexto{font-size:calc(var(--s)*58px);line-height:1.22;font-style:italic}
.ctatexto .hl{font-weight:900}
.grade{position:absolute;right:20px;top:40px;display:grid;grid-template-columns:200px 200px;gap:24px}
.grade div{width:200px;height:200px;border-radius:46px;display:flex;align-items:center;justify-content:center}
.grade svg{width:120px;height:120px;fill:#fff}
.siga{position:absolute;left:0;right:0;bottom:30px;background:${NAVY};border-radius:34px;color:#fff;
  font-family:'Segoe UI Black',${TXT};font-weight:900;font-size:72px;text-align:center;padding:14px 0}
.siga span{color:${LAR}}`;

  // encolhe títulos largos e reduz o texto todo (--s) se o card estourar; avisa quando terminar
  const AJUSTE = `<script>
function ajustar(){
  const main=document.querySelector('.main');
  document.querySelectorAll('.titulo div,.resp,.etapa .r,.qconta,.giz,.pconta,.cconta,.bconta,.balao.eu').forEach(el=>{
    let s=parseFloat(getComputedStyle(el).fontSize);
    while(el.scrollWidth>el.clientWidth+1&&s>20){s-=2;el.style.fontSize=s+'px';}
  });
  function estoura(){
    const lim=main.getBoundingClientRect().bottom+1;
    for(const el of main.querySelectorAll('*')){
      if(el.closest('.mascote,.mao'))continue;
      if(el.getBoundingClientRect().bottom>lim+4)return true;
    }
    return false;
  }
  let s=1;
  while(estoura()&&s>0.6){s-=0.03;document.body.style.setProperty('--s',s);}
  window.AJUSTADO=true;
}
// espera fontes e imagens, mas sem travar: no máximo 8 s pelas fontes e 20 s no total
let feito=false;
const uma=()=>{if(!feito){feito=true;ajustar();}};
const depois=()=>Promise.race([document.fonts.ready,new Promise(r=>setTimeout(r,8000))]).then(uma);
if(document.readyState==='complete')depois();else window.addEventListener('load',depois);
setTimeout(uma,20000);
<\/script>`;

  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const t = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b class="hl">$1</b>');

  // símbolos que não são desenhos do banco, também com palavras-gatilho
  const SIMBOLOS = {
    '✖️': ['multiplic*', 'produto*', 'vezes', 'cruzad*', 'cruzar', 'dobro', 'triplo', 'quadruplo'],
    '➕': ['soma', 'somar', 'somando', 'adicion*', 'acrescent*'],
    '➖': ['subtra*', 'diferenca entre', 'tirar de'],
    '➗': ['divid*', 'divis*', 'quociente*', 'repart*'],
    '≈': ['aproxim*', 'estim*', 'arredond*', 'cerca de', 'mais ou menos'],
  };
  const GLIFO = {'✖️': '×', '➕': '+', '➖': '−', '➗': '÷', '≈': '≈'};
  const norm = s => String(s ?? '').replace(/\*\*/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const RX = new Map();
  const regex = g => {  // 'palavra' (aceita plural), 'radical*', 'duas palavras'
    if (!RX.has(g)) {
      const fim = g.endsWith('*'), corpo = (fim ? g.slice(0, -1) : g).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      RX.set(g, new RegExp(`(^|[^a-z0-9])${corpo}${fim ? '[a-z0-9]*' : '(s|es)?'}(?![a-z0-9])`));
    }
    return RX.get(g);
  };
  // quanto o adesivo combina com o texto: tamanho da maior palavra-gatilho encontrada (0 = não combina)
  const nota = (gatilhos, texto) => Math.max(0, ...(gatilhos || []).filter(g => regex(g).test(texto)).map(g => g.replace('*', '').length));

  // A pose da capa é sorteada pelo próprio carrossel (tema + título): cada carrossel sai com uma,
  // sempre a mesma se for redesenhado. No quadro-negro não vai "explicando" (ele já aponta para um quadro).
  const CAPA_POSES = ['capa', 'pensativo', 'confuso', 'desconfiado', 'cafe', 'desafiando', 'pensando',
    'confiante', 'estudando', 'ideia', 'explicando'];
  const sorteio = (c, sal) => {
    const cp = c.capa || {};
    let h = sal;
    for (const ch of `${c.tema}|${cp.linha1}|${cp.linha2}|${cp.questao_destaque}`) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    return h;
  };
  // modelo do quadrinho ao lado do mascote: também sorteado (o Gemini quase sempre pedia a folha de prova)
  const CAPA_ESTILOS = ['questao', 'quadro', 'postit', 'celular', 'caderno', 'branco'];
  const estiloCapa = c => CAPA_ESTILOS[sorteio(c, 13) % CAPA_ESTILOS.length];
  function poseCapa(c) {
    const quadro = ['quadro', 'branco'].includes(estiloCapa(c));
    const lista = CAPA_POSES.filter(p => !(quadro && p === 'explicando'));
    return lista[sorteio(c, 7) % lista.length];
  }

  const PLANOS = new WeakMap();
  function plano(c, desenhos) {  // escolhe os adesivos do carrossel inteiro de uma vez (sem repetir)
    if (PLANOS.has(c)) return PLANOS.get(c);
    const semGatilho = !(desenhos instanceof Map);
    const todos = [...(semGatilho ? [] : desenhos), ...Object.entries(SIMBOLOS)];
    const usados = new Set();
    // grupos de texto em ordem de prioridade: primeiro o texto principal do pedaço; os outros só se ele não der nada.
    // Em cada grupo: fica o desenho que o Gemini pediu, se combinar; senão, o que combinar melhor.
    const escolher = (pedido, ...grupos) => {
      const v = String(pedido ?? '').trim();
      if (semGatilho) return v;  // lista antiga, sem gatilhos: aceita o que veio
      for (const partes of grupos) {
        const texto = ' ' + norm(partes.join(' ')) + ' ';
        let melhor = v && !usados.has(v) && nota(desenhos.get(v) || SIMBOLOS[v], texto) ? v : '', pontos = 0;
        if (!melhor) for (const [nome, g] of todos) {
          const p = usados.has(nome) ? 0 : nota(g, texto);
          if (p > pontos) { melhor = nome; pontos = p; }
        }
        if (melhor) { usados.add(melhor); return melhor; }
      }
      return '';
    };
    const {capa: cp = {}, regra: rg = {}, exemplo: ex = {}, resumo: rs = {}} = c;
    const r = {
      capa: escolher(cp.questao_emoji, [cp.questao_destaque, cp.conta], [cp.linha1, cp.linha2, cp.subtitulo]),
      regra: (rg.itens || []).map(i => escolher(i.emoji, [i.pergunta, i.nota])),
      exemplo: escolher(ex.emoji, [ex.enunciado, ex.pergunta]),
      etapas: (rs.etapas || []).map(e => escolher(e.emoji, [e.rotulo])),
    };
    PLANOS.set(c, r);
    return r;
  }

  function html(c, n, base, desenhos) {
    const P = plano(c, desenhos);
    const ilu = (v, tam) => {
      if (!v) return '';
      if (desenhos.has(v))
        return `<img src="${base}desenhos/${encodeURIComponent(v)}.webp" style="width:${tam}px;height:${tam}px;object-fit:contain;display:block">`;
      // símbolo: desenhado como letra laranja (o emoji colorido do sistema fugia da paleta)
      return `<span style="font-family:Arial,sans-serif;font-size:${Math.round(tam * 1.1)}px;line-height:1;color:${LAR};font-weight:900">${GLIFO[v] || t(v)}</span>`;
    };
    const pose = (nome, padrao) => `${base}mascote/${POSES.includes(nome) ? nome : padrao}.webp`;
    const titulo = (l1, l2, junto) => {
      l1 = String(l1 ?? '').trim(); l2 = String(l2 ?? '').trim();
      if (junto === undefined) junto = l1.length + l2.length <= 13;
      if (!l2) return `<div>${t(l1)}</div>`;
      if (junto) return `<div>${t(l1)} <span class="l2">${t(l2)}</span></div>`;
      return `<div>${t(l1)}</div><div class="l2">${t(l2)}</div>`;
    };
    const moldura = (tit, miolo, ultimo) => {
      const dots = Array.from({length: TOTAL}, (_, i) => `<i class="${i + 1 === n ? 'on' : ''}"></i>`).join('');
      const fontes = [['Kalam', 'Kalam-Bold.ttf'], ['Anton', 'Anton-Regular.ttf'], ['Open Sans', 'OpenSans.ttf']]
        .map(([f, a]) => `@font-face{font-family:'${f}';font-weight:300 900;src:url('${base}fontes/${a}')}`).join('');
      return `<!doctype html><html><head><meta charset="utf-8"><meta name="color-scheme" content="light dark"><style>:root{color-scheme:light dark}${fontes}${CSS}</style></head><body>
<div class="card">
  <div class="top">@DELMAO<span>SIMPLIFICA</span></div>
  <div class="titulo">${tit}</div><div class="barra"></div>
  <div class="main">${miolo}</div>
  <div class="foot"><div class="dots">${dots}</div>${ultimo ? '' : '<div class="arrasta">ARRASTA &#10142;</div>'}</div>
  <div class="faixa"></div>
</div>${AJUSTE}</body></html>`;
    };

    const {capa: cp, regra: rg, exemplo: ex, resumo: rs} = c;
    if (n === 1) {
      // 6 modelos de capa, sorteados por carrossel: cartão de questão, quadro-negro, post-it, celular, caderno, quadro branco.
      // rótulo = assunto (ÁLGEBRA, FRAÇÕES...); "conta" = a conta/fórmula do exemplo, escrita à mão.
      const conta = String(cp.conta ?? '').trim();
      const estilo = estiloCapa(c);
      let cartao;
      if (estilo === 'celular') cartao = `<div class="celular"><div class="tela"><i class="notch"></i>
      <div class="app"><i></i>${t(cp.questao_rotulo)}</div>
      <div class="linha"><div class="balao">${t(cp.questao_destaque)}</div>${ilu(P.capa, 100)}</div>
      ${conta ? `<div class="balao eu mao">${t(conta)}</div>` : ''}
    </div></div>`;
      else if (estilo === 'caderno') cartao = `<div class="caderno"><div class="espiral">${'<i></i>'.repeat(6)}</div>
      <div class="crot">${t(cp.questao_rotulo)}</div>
      ${conta ? `<div class="cconta mao">${t(conta)}</div>` : ''}
      <div class="cperg mao">${t(cp.questao_destaque)}</div>
      <div style="height:${conta ? 90 : 120}px"></div>
      <div class="cemoji">${ilu(P.capa, conta ? 90 : 120)}</div>
    </div>`;
      else if (estilo === 'branco') cartao = `<div class="branco">
      <i class="ima" style="left:40px;background:${LAR}"></i><i class="ima" style="right:40px;background:#2F7DE1"></i>
      <div class="brot">${t(cp.questao_rotulo)}</div>
      ${conta ? `<div class="bconta mao">${t(conta)}</div>` : ''}
      <div class="bperg mao">${t(cp.questao_destaque)}</div>
      <div class="bemoji">${ilu(P.capa, 90)}</div>
      <i class="bandeja"></i><i class="marcador"></i>
    </div>`;
      else if (estilo === 'quadro') cartao = `<div class="quadro">
      <div class="qrot2">${t(cp.questao_rotulo)}</div>
      <div class="giz mao${conta ? "" : " solta"}">${t(conta || cp.questao_destaque)}</div><span class="gizlinha"></span>
      ${conta ? `<div class="qperg">${t(cp.questao_destaque)}</div>` : ''}
    </div>`;
      else if (estilo === 'postit') cartao = `<div class="postit"><i class="fita"></i>
      <div class="prot">${t(cp.questao_rotulo)}</div>
      ${conta ? `<div class="pconta mao">${t(conta)}</div>` : ''}
      <div class="pperg">${t(cp.questao_destaque)}</div>
      <div class="pemoji">${ilu(P.capa, conta ? 90 : 130)}</div>
    </div>`;
      else cartao = `<div class="questao">
      <div class="qtopo"><span class="qrot">${t(cp.questao_rotulo)}</span><span class="qnum">Questão</span></div>
      <div class="qdest">${t(cp.questao_destaque)}</div>
      <div class="qcorpo">${conta ? `<div class="qconta mao">${t(conta)}</div>`
        : '<div class="linhas"><i></i><i style="width:90%"></i><i></i><i style="width:70%"></i></div>'}
        <div class="qemoji">${ilu(P.capa, conta ? 100 : 130)}</div></div>
    </div>`;
      return moldura(titulo(cp.linha1, cp.linha2, false), `
  <p class="sub">${t(cp.subtitulo)}</p>
  <div class="zona" style="min-height:calc(var(--s)*500px);margin-top:10px">
    <img class="mascote" src="${base}mascote/${poseCapa(c)}.webp" style="left:-30px;max-height:560px">
    ${cartao}
    <div class="capa-frase mao">${t(cp.frase)}<span class="sublinhado"></span></div>
  </div>`);
    }

    if (n === 2) {
      const tres = rg.itens.length >= 3;
      const itens = rg.itens.map((i, k) => `<div class="item">${P.regra[k] ? `<div class="iemoji">${ilu(P.regra[k], 110)}</div>` : ""}<div class="div"></div>
      <div class="iperg">${t(i.pergunta)}</div><div class="inota mao">${t(i.nota)}</div></div>`).join('');
      return moldura(titulo(rg.linha1, rg.linha2), `
  <p class="texto">${t(rg.texto)}</p>
  <div class="itens">${itens}</div>
  <div class="zona" style="min-height:calc(var(--s)*${tres ? 200 : 330}px);margin-top:20px">
    <img class="mascote" src="${pose(rg.pose, 'ideia')}" style="left:-10px;max-height:${tres ? 330 : 440}px">
    <div class="oval mao">${t(rg.frase)}</div>
  </div>`);
    }

    if (n === 3) {
      const passos = ex.passos.map((p, k) => `<div class="passo"><span class="num">${k + 1}</span><span>${t(p)}</span></div>`).join('');
      return moldura(titulo(ex.linha1, ex.linha2), `
  <div class="box enun"><span class="tag">EXEMPLO</span><p>${t(ex.enunciado)}</p><span class="e">${ilu(P.exemplo, 170)}</span></div>
  <div><div class="perg">${t(ex.pergunta)}</div></div>
  <div class="zona" style="min-height:calc(var(--s)*440px);margin-top:20px">
    <img class="mascote" src="${pose(ex.pose, 'resolvendo')}" style="left:-30px;max-height:480px">
    <div class="coldir"><div class="box resol"><span class="tag">RESOLUÇÃO</span>${passos}</div>
    <div class="resp">RESPOSTA: <span>${t(ex.resposta)}</span></div></div>
  </div>`);
    }

    if (n === 4) {
      const etapas = rs.etapas.map((e, k) => `<div class="etapa"><span class="n">${k + 1}</span><div class="r">${t(e.rotulo)}</div>
      <div class="e" style="display:flex;justify-content:center">${ilu(P.etapas[k], 110)}</div></div>`).join('<span class="seta">&#10140;</span>');
      return moldura(titulo(rs.linha1, rs.linha2), `
  <div class="dest"><span class="e">${ilu(desenhos.has('prancheta') ? 'prancheta' : '📋', 150)}</span><p>${t(rs.destaque)}</p></div>
  <div class="etapas">${etapas}</div>
  <div class="zona" style="min-height:calc(var(--s)*330px)">
    <div class="res-frase mao">${t(rs.frase)}<span class="sublinhado" style="margin-left:0"></span></div>
    <img class="mascote dir" src="${pose(rs.pose, 'ideia')}" style="right:0;max-height:420px">
  </div>`);
    }

    const svg = (nome, cor) => `<div style="background:${cor}"><svg viewBox="0 0 24 24"><path d="${ICONES[nome]}"/></svg></div>`;
    return moldura(titulo('CURTIU A', 'DICA?', true), `
  <p class="ctatexto">${t(c.cta_frase)}</p>
  <div class="zona" style="min-height:calc(var(--s)*700px);margin-top:20px">
    <img class="mascote" src="${pose('joinha', 'joinha')}" style="left:-20px;bottom:150px;height:auto;max-height:520px;max-width:470px">
    <div class="grade">${svg('coracao', LAR)}${svg('comentar', NAVY)}${svg('enviar', NAVY)}${svg('salvar', LAR)}</div>
    <div class="siga">Siga <span>@delmaosimplifica</span></div>
  </div>`, true);
  }

  return {html, TOTAL, POSES};
})();
if (typeof module !== 'undefined') module.exports = Cards;
