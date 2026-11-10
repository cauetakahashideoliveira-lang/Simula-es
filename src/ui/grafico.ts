/**
 * Utilitários mínimos para gráficos em canvas com a linguagem visual do
 * estúdio: eixos e grade discretos, marcas finas, rótulos em pt-BR.
 */
import { fmtFixo, marcas } from '../nucleo/formato';
import { cores, fontes } from './tema';

export interface Area {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Eixo {
  min: number;
  max: number;
  /** título com unidade, ex.: "y no anteparo (mm)" */
  titulo: string;
  /** multiplica os valores antes de rotular (para mudar de unidade) */
  fator?: number;
  alvo?: number;
  /** eixo horizontal crescendo para a esquerda (para acompanhar uma cena desenhada assim) */
  inverter?: boolean;
}

/** Ajusta o tamanho real do canvas à densidade de pixels e devolve o contexto em px CSS. */
export function preparar(canvas: HTMLCanvasElement, w: number, h: number): CanvasRenderingContext2D | null {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const W = Math.max(1, Math.round(w * dpr));
  const H = Math.max(1, Math.round(h * dpr));
  if (canvas.width !== W || canvas.height !== H) {
    canvas.width = W;
    canvas.height = H;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return ctx;
}

export function areaPadrao(w: number, h: number, esq = 52, dir = 14, topo = 22, base = 38): Area {
  return { x: esq, y: topo, w: Math.max(10, w - esq - dir), h: Math.max(10, h - topo - base) };
}

export const mapa = (min: number, max: number, a: number, b: number) => (v: number) => a + ((v - min) / (max - min)) * (b - a);

/** Intervalo com folga e extremos "redondos" para um conjunto de valores. */
export function intervalo(min: number, max: number, folga = 0.08, incluirZero = false): [number, number] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (incluirZero) {
    min = Math.min(0, min);
    max = Math.max(0, max);
  }
  if (max - min < 1e-300) {
    const d = Math.abs(max) > 0 ? Math.abs(max) * 0.5 : 1;
    return [min - d, max + d];
  }
  const d = (max - min) * folga;
  return [min - (incluirZero && min === 0 ? 0 : d), max + (incluirZero && max === 0 ? 0 : d)];
}

export function desenharEixos(
  ctx: CanvasRenderingContext2D,
  a: Area,
  ex: Eixo,
  ey: Eixo,
  op: { gradeX?: boolean; gradeY?: boolean; zeroX?: boolean; zeroY?: boolean } = {},
) {
  const fx = ex.fator ?? 1;
  const fy = ey.fator ?? 1;
  const mx = marcas(ex.min * fx, ex.max * fx, ex.alvo ?? Math.max(2, Math.round(a.w / 90)));
  const my = marcas(ey.min * fy, ey.max * fy, ey.alvo ?? Math.max(2, Math.round(a.h / 34)));
  const X = ex.inverter ? mapa(ex.min * fx, ex.max * fx, a.x + a.w, a.x) : mapa(ex.min * fx, ex.max * fx, a.x, a.x + a.w);
  const Y = mapa(ey.min * fy, ey.max * fy, a.y + a.h, a.y);
  ctx.save();
  ctx.lineWidth = 1;
  ctx.font = `12px ${fontes.ui}`;
  ctx.fillStyle = cores.texto3;
  // grade
  ctx.strokeStyle = cores.linha;
  ctx.beginPath();
  if (op.gradeX !== false) for (const v of mx.valores) { const x = Math.round(X(v)) + 0.5; ctx.moveTo(x, a.y); ctx.lineTo(x, a.y + a.h); }
  if (op.gradeY !== false) for (const v of my.valores) { const y = Math.round(Y(v)) + 0.5; ctx.moveTo(a.x, y); ctx.lineTo(a.x + a.w, y); }
  ctx.stroke();
  // linhas de zero
  ctx.strokeStyle = cores.linhaForte;
  ctx.beginPath();
  if (op.zeroY !== false && ey.min < 0 && ey.max > 0) { const y = Math.round(Y(0)) + 0.5; ctx.moveTo(a.x, y); ctx.lineTo(a.x + a.w, y); }
  if (op.zeroX !== false && ex.min < 0 && ex.max > 0) { const x = Math.round(X(0)) + 0.5; ctx.moveTo(x, a.y); ctx.lineTo(x, a.y + a.h); }
  // moldura: só base e esquerda
  ctx.moveTo(a.x + 0.5, a.y); ctx.lineTo(a.x + 0.5, a.y + a.h + 0.5); ctx.lineTo(a.x + a.w, a.y + a.h + 0.5);
  ctx.stroke();
  // rótulos
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  let ultimo = -1e9;
  for (const v of ex.inverter ? [...mx.valores].reverse() : mx.valores) {
    const x = X(v);
    const t = fmtFixo(v, mx.casas);
    const lw = ctx.measureText(t).width;
    if (x - lw / 2 < ultimo + 6) continue;
    ctx.fillText(t, x, a.y + a.h + 5);
    ultimo = x + lw / 2;
  }
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const v of my.valores) {
    const y = Y(v);
    if (y < a.y - 1 || y > a.y + a.h + 1) continue;
    ctx.fillText(fmtFixo(v, my.casas), a.x - 6, y);
  }
  // títulos dos eixos
  ctx.fillStyle = cores.texto2;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText(ex.titulo, a.x + a.w, a.y + a.h + 36);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText(ey.titulo, Math.max(4, a.x - 46), a.y - 7);
  ctx.restore();
}

/** Pequena etiqueta com fundo escuro (tooltip dentro do canvas). */
export function etiqueta(ctx: CanvasRenderingContext2D, linhas: string[], x: number, y: number, limites: Area, cor = cores.texto) {
  ctx.save();
  ctx.font = `12.5px ${fontes.ui}`;
  const w = Math.max(...linhas.map((l) => ctx.measureText(l).width)) + 14;
  const h = linhas.length * 16 + 8;
  let px = x + 10;
  let py = y - h - 8;
  if (px + w > limites.x + limites.w) px = x - w - 10;
  if (px < limites.x) px = limites.x;
  if (py < limites.y - 14) py = y + 10;
  ctx.fillStyle = 'rgba(18,22,27,0.94)';
  ctx.strokeStyle = cores.linhaForte;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(Math.round(px) + 0.5, Math.round(py) + 0.5, w, h, 4);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = cor;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  linhas.forEach((l, i) => ctx.fillText(l, px + 7, py + 5 + i * 16));
  ctx.restore();
}
