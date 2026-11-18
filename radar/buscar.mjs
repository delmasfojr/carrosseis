/* Robô do Radar de concursos (roda no GitHub Actions a cada 6 h, de graça; ver .github/workflows/radar.yml).
   Junta as manchetes REAIS de concursos do Google Notícias (sem chave nenhuma) e grava radar/noticias.json.
   O app do celular lê esse arquivo e o Gemini do professor só organiza as manchetes (não inventa notícia).
   Rodar à mão: node radar/buscar.mjs */
import {writeFileSync, readFileSync, existsSync} from 'node:fs';

const DIAS = 21;  // manchetes mais velhas que isso ficam de fora
// área do app -> busca no Google Notícias
const BUSCAS = {
  'Polícia Militar': 'concurso ("Polícia Militar" OR PM) soldado OR oficial OR edital OR autorizado OR banca',
  'Polícia Civil': 'concurso "Polícia Civil" OR "concurso PC"',
  'Bombeiros': 'concurso "Corpo de Bombeiros" OR "concurso CBM"',
  'Polícia Penal': 'concurso "Polícia Penal" OR "policial penal"',
  'PRF e PF': 'concurso PRF OR "Polícia Federal" OR "Polícia Rodoviária Federal"',
  'Guarda Municipal': 'concurso "Guarda Municipal" OR "Guarda Civil Municipal"',
  'Forças Armadas': 'concurso OR seleção Exército OR Marinha OR Aeronáutica OR EsPCEx OR EEAR OR ESA',
  'Tribunais': 'concurso "Tribunal de Justiça" OR TRT OR TRE OR TRF OR "Ministério Público"',
  'INSS e federais': 'concurso INSS OR "Receita Federal" OR IBGE OR "concurso federal" OR CNU',
  'Bancos': 'concurso "Banco do Brasil" OR "Caixa Econômica" OR BNB OR Banrisul OR BNDES',
  'Prefeituras': 'concurso prefeitura edital publicado OR inscrições abertas',
  'Professores': 'concurso professor rede estadual OR municipal edital',
};

const ent = s => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/<[^>]+>/g, '').trim();
const tag = (x, t) => { const m = x.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)); return m ? ent(m[1]) : ''; };

async function feed(q) {
  const u = `https://news.google.com/rss/search?q=${encodeURIComponent(q + ` when:${DIAS}d`)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    try {
      const r = await fetch(u, {headers: {'User-Agent': 'Mozilla/5.0 (radar de concursos)'}});
      if (r.ok) return (await r.text()).split('<item>').slice(1);
      console.error(q, r.status);
    } catch (e) { console.error(q, e.message); }
    await new Promise(r => setTimeout(r, 3000));
  }
  return [];
}

const limite = Date.now() - DIAS * 864e5, vistos = new Map();
for (const [area, q] of Object.entries(BUSCAS)) {
  for (const x of await feed(q)) {
    const fonte = tag(x, 'source');
    let t = tag(x, 'title');
    if (fonte && t.endsWith(' - ' + fonte)) t = t.slice(0, -(fonte.length + 3));
    const data = new Date(tag(x, 'pubDate'));
    if (!t || isNaN(data) || data < limite || !/concurs|edital|sele[cç][aã]o|vagas|banca|inscri/i.test(t)) continue;
    const id = t.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '').slice(0, 80);
    const velho = vistos.get(id);
    if (velho) { if (!velho.areas.includes(area)) velho.areas.push(area); continue; }
    vistos.set(id, {t, fonte, data: data.toISOString().slice(0, 10), link: tag(x, 'link'), areas: [area]});
  }
  await new Promise(r => setTimeout(r, 1500));  // educado com o Google
}

const itens = [...vistos.values()].sort((a, b) => b.data.localeCompare(a.data));
const arq = new URL('./noticias.json', import.meta.url);
// só regrava se mudou alguma manchete (o "atualizado" diz ao app que há coisa nova)
const antes = existsSync(arq) ? JSON.parse(readFileSync(arq, 'utf8')) : {itens: []};
if (JSON.stringify(antes.itens) === JSON.stringify(itens)) { console.log('nada novo'); process.exit(0); }
if (itens.length < 20 && antes.itens.length > 100) { console.error('veio pouca coisa: o Google pode ter bloqueado; mantenho o arquivo'); process.exit(0); }
writeFileSync(arq, JSON.stringify({atualizado: new Date().toISOString(), itens}, null, 0));
console.log(itens.length, 'manchetes');
