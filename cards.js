/* Desenho dos 5 cards do carrossel @delmaosimplifica.
   Usado pelo app do celular (index.html) e pelo gerador do PC (carrossel.py).
   Cards.html(conteudo, n, base, desenhos) -> página HTML completa (1080×1350) do card n (1 a 5).
     base: endereço da pasta app/ (terminado em "/"); desenhos: Set com os nomes do banco. */
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
  document.querySelectorAll('.titulo div,.resp,.etapa .r').forEach(el=>{
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

  function html(c, n, base, desenhos) {
    const ilu = (valor, tam) => {
      const v = String(valor ?? '').trim();
      if (v && desenhos.has(v))
        return `<img src="${base}desenhos/${encodeURIComponent(v)}.webp" style="width:${tam}px;height:${tam}px;object-fit:contain;display:block">`;
      return `<span style="font-size:${tam}px">${t(v)}</span>`;
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
    if (n === 1) return moldura(titulo(cp.linha1, cp.linha2, false), `
  <p class="sub">${t(cp.subtitulo)}</p>
  <div class="zona" style="min-height:calc(var(--s)*500px);margin-top:10px">
    <img class="mascote" src="${pose(cp.pose, 'explicando')}" style="left:-30px;max-height:560px">
    <div class="questao">
      <div class="qtopo"><span class="qrot">${t(cp.questao_rotulo)}</span><span class="qnum">Questão</span></div>
      <div class="qdest">${t(cp.questao_destaque)}</div>
      <div class="qcorpo"><div class="linhas"><i></i><i style="width:90%"></i><i></i><i style="width:70%"></i></div>
        <div class="qemoji">${ilu(cp.questao_emoji, 130)}</div></div>
    </div>
    <div class="capa-frase mao">${t(cp.frase)}<span class="sublinhado"></span></div>
  </div>`);

    if (n === 2) {
      const tres = rg.itens.length >= 3;
      const itens = rg.itens.map(i => `<div class="item"><div class="iemoji">${ilu(i.emoji, 110)}</div><div class="div"></div>
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
  <div class="box enun"><span class="tag">EXEMPLO</span><p>${t(ex.enunciado)}</p><span class="e">${ilu(ex.emoji, 170)}</span></div>
  <div><div class="perg">${t(ex.pergunta)}</div></div>
  <div class="zona" style="min-height:calc(var(--s)*440px);margin-top:20px">
    <img class="mascote" src="${pose(ex.pose, 'resolvendo')}" style="left:-30px;max-height:480px">
    <div class="coldir"><div class="box resol"><span class="tag">RESOLUÇÃO</span>${passos}</div>
    <div class="resp">RESPOSTA: <span>${t(ex.resposta)}</span></div></div>
  </div>`);
    }

    if (n === 4) {
      const etapas = rs.etapas.map((e, k) => `<div class="etapa"><span class="n">${k + 1}</span><div class="r">${t(e.rotulo)}</div>
      <div class="e" style="display:flex;justify-content:center">${ilu(e.emoji, 110)}</div></div>`).join('<span class="seta">&#10140;</span>');
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
