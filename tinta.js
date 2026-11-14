/* Tinta do Estúdio (PC e tablet usam o mesmo arquivo): traço de caneta com pressão, marca-texto,
   formas (reta, seta, círculo/elipse, retângulo, triângulo, polígono, eixos) e reconhecimento de forma
   ao segurar a caneta parada no fim do traço (como nas Notas da Samsung). Coordenadas em 1920×1080. */
import {getStroke} from './vendor/perfect-freehand.mjs';

const cache = new Map(); // id → {k, path}
let nId = 0;
export const novoId = () => Math.random().toString(36).slice(2, 7) + (nId++).toString(36);

/* ---------- desenho ---------- */
function caminhoTinta(t) {
  const pts = t.pts.map(p => [p[0], p[1], p[2] ?? .5]);
  const o = getStroke(pts, {size: t.esp * 1.55, thinning: t.pr ? .62 : .5, smoothing: .55, streamline: .42,
    simulatePressure: !t.pr, last: !!t.fim, start: {taper: 0, cap: true}, end: {taper: t.fim ? t.esp * 2 : 0, cap: true}});
  const path = new Path2D();
  if (o.length < 3) return path;
  path.moveTo(o[0][0], o[0][1]);
  for (let i = 1; i < o.length; i++) {
    const a = o[i], b = o[(i + 1) % o.length];
    path.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
  }
  path.closePath();
  return path;
}
function cabecaSeta(cx, a, b, esp) {
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), l = Math.max(18, esp * 4.5);
  cx.beginPath();
  cx.moveTo(b[0] - l * Math.cos(ang - .45), b[1] - l * Math.sin(ang - .45));
  cx.lineTo(b[0], b[1]);
  cx.lineTo(b[0] - l * Math.cos(ang + .45), b[1] - l * Math.sin(ang + .45));
  cx.stroke();
}
export function desenharTraco(cx, t) {
  cx.save();
  cx.lineCap = cx.lineJoin = 'round';
  cx.strokeStyle = cx.fillStyle = t.cor;
  cx.lineWidth = t.esp;
  if (t.tipo === 'marca') cx.globalAlpha = .35;
  if (t.tipo === 'forma' && t.f) {
    const f = t.f;
    if (f.k === 'eixos') {
      const {x, y, w, h} = f, ox = x + w / 2, oy = y + h / 2;
      cx.beginPath(); cx.moveTo(x, oy); cx.lineTo(x + w, oy); cx.moveTo(ox, y + h); cx.lineTo(ox, y); cx.stroke();
      cabecaSeta(cx, [x, oy], [x + w, oy], t.esp); cabecaSeta(cx, [ox, y + h], [ox, y], t.esp);
      cx.font = `italic ${Math.round(24 + t.esp * 2)}px "Times New Roman", serif`;
      cx.fillText('x', x + w - 18, oy + 34 + t.esp); cx.fillText('y', ox + 14 + t.esp, y + 22);
    } else {
      const c = contorno(t);
      cx.beginPath();
      c.forEach((p, i) => i ? cx.lineTo(p[0], p[1]) : cx.moveTo(p[0], p[1]));
      if (f.k !== 'reta' && f.k !== 'seta') cx.closePath();
      cx.stroke();
      if (f.k === 'seta') cabecaSeta(cx, f.a, f.b, t.esp);
    }
  } else if (t.pts.length === 1) {
    cx.beginPath(); cx.arc(t.pts[0][0], t.pts[0][1], t.esp / 2, 0, 7); cx.fill();
  } else if (t.tipo === 'marca') {
    cx.beginPath();
    t.pts.forEach((p, i) => i ? cx.lineTo(p[0], p[1]) : cx.moveTo(p[0], p[1]));
    cx.stroke();
  } else {
    const k = t.pts.length + (t.fim ? 'f' : '');
    let c = t.id && cache.get(t.id);
    if (!c || c.k !== k) { c = {k, path: caminhoTinta(t)}; if (t.id) cache.set(t.id, c); }
    cx.fill(c.path);
  }
  cx.restore();
}
export function limparCache() { if (cache.size > 3000) cache.clear(); }

/* pontos do traço (para a borracha e para desenhar formas) */
export function contorno(t) {
  if (t.tipo !== 'forma' || !t.f) return t.pts;
  const f = t.f;
  if (f.k === 'reta' || f.k === 'seta') return [f.a, f.b];
  if (f.k === 'elipse') {
    const r = [];
    for (let i = 0; i <= 64; i++) { const a = i / 64 * Math.PI * 2; r.push([f.cx + f.rx * Math.cos(a), f.cy + f.ry * Math.sin(a)]); }
    return r;
  }
  if (f.k === 'ret') return [[f.x, f.y], [f.x + f.w, f.y], [f.x + f.w, f.y + f.h], [f.x, f.y + f.h], [f.x, f.y]];
  if (f.k === 'poli') return [...f.p, f.p[0]];
  if (f.k === 'eixos') return [[f.x, f.y + f.h / 2], [f.x + f.w, f.y + f.h / 2], [f.x + f.w / 2, f.y + f.h / 2], [f.x + f.w / 2, f.y], [f.x + f.w / 2, f.y + f.h]];
  return t.pts;
}

/* ---------- formas desenhadas pelo arrasto (ferramenta Formas) ---------- */
export function formaArrasto(k, a, b, igual) {
  let x = Math.min(a[0], b[0]), y = Math.min(a[1], b[1]), w = Math.abs(b[0] - a[0]), h = Math.abs(b[1] - a[1]);
  if (igual || k === 'circulo') { const m = Math.max(w, h); w = h = m; if (b[0] < a[0]) x = a[0] - m; if (b[1] < a[1]) y = a[1] - m; }
  if (k === 'reta' || k === 'seta') return {k, a: [...a], b: igual ? retaReta(a, b) : [...b]};
  if (k === 'circulo' || k === 'elipse') return {k: 'elipse', cx: x + w / 2, cy: y + h / 2, rx: w / 2, ry: h / 2};
  if (k === 'ret') return {k: 'ret', x, y, w, h};
  if (k === 'tri') return {k: 'poli', p: [[x + w / 2, y], [x + w, y + h], [x, y + h]]};
  if (k === 'eixos') return {k: 'eixos', x, y, w, h};
  return null;
}
function retaReta(a, b) { // trava em 0°, 45°, 90°
  const dx = b[0] - a[0], dy = b[1] - a[1], ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI / 4, r = Math.hypot(dx, dy);
  return [a[0] + r * Math.cos(ang), a[1] + r * Math.sin(ang)];
}

/* ---------- reconhecimento: segurou parado no fim do traço ---------- */
function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  let max = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = distSeg(pts[i], a, b);
    if (d > max) { max = d; idx = i; }
  }
  if (max <= eps) return [a, b];
  return [...rdp(pts.slice(0, idx + 1), eps).slice(0, -1), ...rdp(pts.slice(idx), eps)];
}
function distSeg(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
function comprimento(p) { let s = 0; for (let i = 1; i < p.length; i++) s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return s; }

export function reconhecer(pts) {
  if (pts.length < 4) return null;
  const P = pts.map(p => [p[0], p[1]]);
  const L = comprimento(P);
  if (L < 40) return null;
  const a = P[0], b = P[P.length - 1];
  const reto = Math.hypot(b[0] - a[0], b[1] - a[1]);
  // reta: quase todo o caminho é a distância entre as pontas
  if (reto / L > .9) {
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), passo = Math.PI / 4;
    const perto = Math.round(ang / passo) * passo;
    const fim = Math.abs(ang - perto) < .1 ? [a[0] + reto * Math.cos(perto), a[1] + reto * Math.sin(perto)] : b;
    return {k: 'reta', a, b: fim};
  }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of P) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
  const w = x1 - x0, h = y1 - y0, diag = Math.hypot(w, h);
  const fechado = reto < Math.max(40, diag * .28);
  if (!fechado) {
    // seta "à mão": reta com um ganchinho no fim → seta
    const s = rdp(P, diag * .08);
    if (s.length >= 3 && s.length <= 4) {
      const corpo = Math.hypot(s[1][0] - s[0][0], s[1][1] - s[0][1]);
      const resto = comprimento(s.slice(1));
      if (corpo > resto * 2.2) return {k: 'seta', a: s[0], b: s[1]};
    }
    return null;
  }
  // fechado: círculo/elipse se for "redondo"; senão polígono pelos cantos
  let area = 0;
  for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; area += p[0] * q[1] - q[0] * p[1]; }
  area = Math.abs(area) / 2;
  const circ = 4 * Math.PI * area / (L * L);
  const s = rdp([...P, P[0]], diag * .09).slice(0, -1);
  const cantos = s.length;
  if (circ > .8 || cantos > 5) {
    const r = (w + h) / 4, quaseCirculo = Math.abs(w - h) / Math.max(w, h) < .18;
    return quaseCirculo ? {k: 'elipse', cx: x0 + w / 2, cy: y0 + h / 2, rx: r, ry: r}
      : {k: 'elipse', cx: x0 + w / 2, cy: y0 + h / 2, rx: w / 2, ry: h / 2};
  }
  if (cantos === 3) return {k: 'poli', p: s};
  if (cantos === 4) {
    // retângulo "em pé": lados quase horizontais/verticais → usa a caixa
    const alinhado = s.every((p, i) => { const q = s[(i + 1) % 4]; const ang = Math.abs(Math.atan2(q[1] - p[1], q[0] - p[0])) % (Math.PI / 2); return ang < .22 || ang > Math.PI / 2 - .22; });
    return alinhado ? {k: 'ret', x: x0, y: y0, w, h} : {k: 'poli', p: s};
  }
  if (cantos === 5) return {k: 'poli', p: s};
  return null;
}
