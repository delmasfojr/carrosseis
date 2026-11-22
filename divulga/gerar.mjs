/* Robô dos roteiros de divulgação do App de Revisão (roda no GitHub Actions todo dia, de graça; ver .github/workflows/divulga.yml).
   Escreve 3 roteiros de Reels "só com visual" por dia com a chave grátis do Gemini (segredo GEMINI_API_KEY do repositório)
   e grava divulga/roteiros.json. O app do celular puxa os roteiros novos ao abrir (Meus posts › Roteiros, marcados com 🤖).
   Regras do roteiro = prompt-roteiro.md (as mesmas do app) + divulga/prompt-app.md (o que o app tem e como divulgar).
   Rodar à mão: GEMINI_API_KEY=... node divulga/gerar.mjs   (QTD=3 por padrão; FORCAR=1 gera de novo no mesmo dia) */
import {readFileSync, writeFileSync, existsSync} from 'node:fs';

const CHAVE = process.env.GEMINI_API_KEY || '';
const QTD = Number(process.env.QTD || 3);
const GUARDAR = 30;            // roteiros que ficam no arquivo (os mais novos)
const ARQ = 'divulga/roteiros.json';
const MODELOS = ['gemini-3.5-flash', 'gemini-flash-latest', 'gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3-flash-preview'];

// ângulos e recursos giram dia a dia (combinações diferentes todo dia)
const ANGULOS = [
  'DOR DO ALUNO: começa por um problema real de quem estuda (esquece tudo na semana seguinte, erra sempre a mesma coisa, não sabe por onde começar) e mostra o recurso resolvendo',
  'DESAFIO RELÂMPAGO: abre com uma questão rápida e curiosa, pede para pausar, resolve, e conta que no app tem muito mais desse tipo',
  'CIÊNCIA DO ESTUDO: explica um fato real sobre memória e aprendizado (curva do esquecimento, revisão espaçada, aprender errando, poucos minutos todo dia) e liga ao recurso',
  'TOUR RÁPIDO: mostra o recurso em ação, passo a passo, como se o aluno estivesse com o celular na mão',
  'MITO x VERDADE: derruba uma crença comum sobre estudar matemática ("estudar mais horas é estudar melhor", "reler resolve", "decorar fórmula basta") e mostra o jeito certo com o recurso',
  'PEGADINHA: mostra um erro clássico de matemática que quase todo mundo comete e como o recurso faz o aluno parar de cair nele',
  'ROTINA DE 10 MINUTOS: monta uma rotina curta de estudo diário usando o recurso',
];
const RECURSOS = [
  'Caderno de erros', 'Flashcards com revisão espaçada e Revisão do dia', 'Quiz relâmpago', 'Verdade ou mentira',
  'Banco de questões com resolução comentada', 'Trilha de estudo com lições, vidas e CONFERIR', 'Plano ENEM (43 ilhas e nivelamento)',
  'Meu progresso, sequência de dias e conquistas',
];

// só com visual: o professor grava só a voz (mesma regra do app, roteiro.js SO_VISUAL)
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
const DURACAO = `

DURAÇÃO: 45 s (vale ACIMA da regra 7)
- Fala total: cerca de 110 palavras (2,5 por segundo), contando o gancho.
- blocos: cerca de 5 blocos (sem contar o gancho), cada um com 5 a 10 s de fala (até 160 caracteres).
- duracao: "45 s".`;

const S = {type: 'STRING'};
const obj = p => ({type: 'OBJECT', properties: p, required: Object.keys(p)});
const lista = i => ({type: 'ARRAY', items: i});
const ESQUEMA = obj({prova_citada: S, roteiros: lista(obj({
  tema: S, nota_viral: {type: 'INTEGER'}, por_que: S, ganchos: lista(S), texto_capa: S,
  blocos: lista(obj({tempo: S, cena: {type: 'STRING', enum: ['camera', 'quadro', 'tela']}, fala: S, quadro: S, texto_tela: S})),
  comentario_fixado: S, duracao: S, legenda: S,
}))});
ESQUEMA.propertyOrdering = ['prova_citada', 'roteiros'];

const SEGUIR = /(^|[^\p{L}])(segue|siga|seguir|sigam)(?![\p{L}])/iu;
function garantirFinal(r) {
  const bl = r.blocos || (r.blocos = []), ult = bl[bl.length - 1];
  if (ult && SEGUIR.test(ult.fala || '')) { ult.texto_tela ||= 'LINK NA BIO'; return r; }
  bl.push({tempo: '42–45 s', cena: 'tela', fala: 'O link do app está na bio. Segue o Delmão Simplifica!', quadro: ult ? ult.quadro || '' : '', texto_tela: 'LINK NA BIO'});
  return r;
}

async function gemini(corpo) {
  let ultimo = '';
  for (let rodada = 0; rodada < 2; rodada++)
    for (const m of MODELOS) {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`,
        {method: 'POST', headers: {'Content-Type': 'application/json', 'x-goog-api-key': CHAVE}, body: corpo});
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { ultimo = `${m}: ${r.status} ${j.error?.message || ''}`.slice(0, 200); console.log('  ' + ultimo); continue; }
      const txt = j.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
      try { return {m, resp: JSON.parse(txt)}; } catch { ultimo = `${m}: resposta não é JSON`; console.log('  ' + ultimo); }
    }
  throw new Error('Nenhum modelo respondeu. Último erro: ' + ultimo);
}

const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);   // dia de Brasília
const antigo = existsSync(ARQ) ? JSON.parse(readFileSync(ARQ, 'utf8')) : {roteiros: []};
if (!CHAVE) { console.log('Sem GEMINI_API_KEY (segredo do repositório): nada a fazer.'); process.exit(0); }
if (!process.env.FORCAR && antigo.roteiros.some(x => x.id.startsWith(hoje))) { console.log(`Já tem roteiros de ${hoje}.`); process.exit(0); }

const dia = Math.floor(Date.parse(hoje) / 864e5);
const pares = Array.from({length: QTD}, (_, k) => ({
  angulo: ANGULOS[(dia * QTD + k) % ANGULOS.length],
  recurso: RECURSOS[(dia * QTD + k * 3) % RECURSOS.length],
}));
const recentes = antigo.roteiros.slice(0, 15).map(x => `- ${x.conteudo.tema}: ${x.conteudo.ganchos[0]}`).join('\n');

const prompt = readFileSync('prompt-roteiro.md', 'utf8') + SO_VISUAL + '\n\n' + readFileSync('divulga/prompt-app.md', 'utf8') + `

PEDIDO DE HOJE: faça EXATAMENTE ${QTD} roteiros, nesta ordem:
${pares.map((p, k) => `${k + 1}. ÂNGULO: ${p.angulo}\n   RECURSO DO APP: ${p.recurso}`).join('\n')}
- prova_citada: "ENEM" se algum roteiro falar do Plano ENEM, senão "".
${recentes ? `
ROTEIROS DOS ÚLTIMOS DIAS (NÃO repita gancho, exemplo nem conta destes):
${recentes}` : ''}` + DURACAO;

console.log(`Gerando ${QTD} roteiros de ${hoje}…`);
const {m, resp} = await gemini(JSON.stringify({
  contents: [{parts: [{text: prompt}]}],
  generationConfig: {responseMimeType: 'application/json', responseSchema: ESQUEMA, temperature: 0.95},
}));
const novos = (resp.roteiros || []).slice(0, QTD).map((c, k) => ({
  id: `${hoje}-${k + 1}`, criado: new Date().toISOString(), modelo: m,
  angulo: pares[k] ? pares[k].angulo.split(':')[0] : '', recurso: pares[k] ? pares[k].recurso : '',
  conteudo: garantirFinal(c),
}));
if (!novos.length) throw new Error('O Gemini não devolveu roteiro.');
const roteiros = [...novos, ...antigo.roteiros.filter(x => !novos.some(n => n.id === x.id))].slice(0, GUARDAR);
writeFileSync(ARQ, JSON.stringify({atualizado: new Date().toISOString(), roteiros}, null, 1));
for (const n of novos) console.log(`  ✓ ${n.conteudo.tema} — ${n.conteudo.ganchos[0]}`);
