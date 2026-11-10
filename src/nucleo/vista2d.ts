/**
 * Transformação mundo ↔ tela para cenas 2D, em precisão dupla.
 *
 * O canvas trabalha internamente com float32; por isso nada que esteja a
 * milhões de pixels de distância é entregue a ele. Toda linha é recortada
 * aqui, em double, antes de ser desenhada — é o que mantém a geometria exata
 * em zoom profundo.
 */
import type { VistaEstado } from './estado';

export interface Margens {
  esquerda: number;
  direita: number;
  topo: number;
  base: number;
}

export interface Caixa {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export class Vista2D {
  /** ponto do mundo que fica no centro da área útil */
  cx = 0;
  cy = 0;
  /** px (CSS) por unidade do mundo */
  escala = 1;
  largura = 1;
  altura = 1;
  margens: Margens = { esquerda: 0, direita: 0, topo: 0, base: 0 };
  /** sentido do eixo horizontal do mundo na tela: +1 cresce para a direita, −1 para a esquerda */
  sentidoX: 1 | -1 = 1;
  escalaMin = 1e-3;
  escalaMax = 1e7;

  get centroTelaX() {
    return (this.margens.esquerda + this.largura - this.margens.direita) / 2;
  }
  get centroTelaY() {
    return (this.margens.topo + this.altura - this.margens.base) / 2;
  }

  tx(wx: number): number {
    return this.centroTelaX + this.sentidoX * (wx - this.cx) * this.escala;
  }
  ty(wy: number): number {
    return this.centroTelaY - (wy - this.cy) * this.escala;
  }
  mx(sx: number): number {
    return this.cx + (this.sentidoX * (sx - this.centroTelaX)) / this.escala;
  }
  my(sy: number): number {
    return this.cy - (sy - this.centroTelaY) / this.escala;
  }

  /** Zoom mantendo fixo o ponto do mundo sob (sx, sy). */
  zoomEm(sx: number, sy: number, fator: number) {
    const wx = this.mx(sx);
    const wy = this.my(sy);
    const nova = Math.min(this.escalaMax, Math.max(this.escalaMin, this.escala * fator));
    this.escala = nova;
    this.cx = wx - (this.sentidoX * (sx - this.centroTelaX)) / nova;
    this.cy = wy + (sy - this.centroTelaY) / nova;
  }

  deslocar(dxTela: number, dyTela: number) {
    this.cx -= (this.sentidoX * dxTela) / this.escala;
    this.cy += dyTela / this.escala;
  }

  /** Ajusta centro e escala para que a caixa caiba inteira na área útil. */
  enquadrar(c: Caixa, folga = 0) {
    const w = Math.max(10, this.largura - this.margens.esquerda - this.margens.direita - 2 * folga);
    const h = Math.max(10, this.altura - this.margens.topo - this.margens.base - 2 * folga);
    const dx = Math.max(1e-12, c.x1 - c.x0);
    const dy = Math.max(1e-12, c.y1 - c.y0);
    this.escala = Math.min(this.escalaMax, Math.max(this.escalaMin, Math.min(w / dx, h / dy)));
    this.cx = (c.x0 + c.x1) / 2;
    this.cy = (c.y0 + c.y1) / 2;
  }

  /** Retângulo do mundo visível na tela inteira (não só na área útil). */
  visivel(): Caixa {
    const a = this.mx(0);
    const b = this.mx(this.largura);
    return {
      x0: Math.min(a, b),
      x1: Math.max(a, b),
      y0: this.my(this.altura),
      y1: this.my(0),
    };
  }

  estado(): VistaEstado {
    return { cx: this.cx, cy: this.cy, escala: this.escala };
  }
  aplicar(e: VistaEstado) {
    this.cx = e.cx;
    this.cy = e.cy;
    this.escala = Math.min(this.escalaMax, Math.max(this.escalaMin, e.escala));
  }
}

/**
 * Recorte de Liang–Barsky. Devolve o trecho do segmento dentro do retângulo
 * ou null. `infinito` trata (x1,y1) como direção de uma semirreta.
 */
export function recortar(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  xmin: number,
  ymin: number,
  xmax: number,
  ymax: number,
  out: Float64Array | number[],
  semirreta = false,
): boolean {
  const dx = semirreta ? x1 : x1 - x0;
  const dy = semirreta ? y1 : y1 - y0;
  let t0 = 0;
  let t1 = semirreta ? Infinity : 1;
  const p = [-dx, dx, -dy, dy];
  const q = [x0 - xmin, xmax - x0, y0 - ymin, ymax - y0];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
    } else {
      const r = q[i] / p[i];
      if (p[i] < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
    }
  }
  if (!Number.isFinite(t1)) return false;
  out[0] = x0 + t0 * dx;
  out[1] = y0 + t0 * dy;
  out[2] = x0 + t1 * dx;
  out[3] = y0 + t1 * dy;
  return true;
}

/** Distância de um ponto a um segmento (em px), para seleção por toque. */
export function distPontoSegmento(px: number, py: number, x0: number, y0: number, x1: number, y1: number): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - x0) * dx + (py - y0) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
}
