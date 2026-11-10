/**
 * Rótulos matemáticos em canvas: símbolo em itálico, subscritos e texto da
 * interface na mesma linha, com as fontes do KaTeX — a mesma notação das fórmulas.
 */
import { fontes } from './tema';

/** Trecho de um rótulo: itálico matemático, romano matemático, subscrito ou texto da interface. */
export type Parte = [texto: string, estilo: 'it' | 'reta' | 'sub' | 'ui'];

export function fonteParte(estilo: Parte[1], tam: number): string {
  if (estilo === 'it') return `italic ${tam + 2}px ${fontes.mat}`;
  if (estilo === 'reta') return `${tam + 1}px ${fontes.matReta}`;
  if (estilo === 'sub') return `italic ${Math.round(tam * 0.82)}px ${fontes.mat}`;
  return `${tam}px ${fontes.ui}`;
}

export function larguraPartes(ctx: CanvasRenderingContext2D, partes: Parte[], tam: number): number {
  let w = 0;
  for (const [t, e] of partes) {
    ctx.font = fonteParte(e, tam);
    w += ctx.measureText(t).width + (e === 'sub' ? 1 : 0);
  }
  return w;
}

/** Desenha as partes a partir de x (à esquerda), centradas verticalmente em y. */
export function desenharPartes(ctx: CanvasRenderingContext2D, partes: Parte[], x: number, y: number, tam: number, cor: string) {
  ctx.fillStyle = cor;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (const [t, e] of partes) {
    ctx.font = fonteParte(e, tam);
    ctx.fillText(t, x, y + (e === 'sub' ? tam * 0.3 : 0.5));
    x += ctx.measureText(t).width + (e === 'sub' ? 1 : 0);
  }
}

/** Rótulo com fundo escuro, centrado em (x, y). */
export function caixaPartes(ctx: CanvasRenderingContext2D, partes: Parte[], x: number, y: number, tam: number, cor: string) {
  const w = larguraPartes(ctx, partes, tam);
  ctx.fillStyle = 'rgba(5,7,10,0.84)';
  ctx.fillRect(Math.round(x - w / 2 - 5), Math.round(y - tam * 0.72), Math.round(w + 10), Math.round(tam * 1.5));
  desenharPartes(ctx, partes, x - w / 2, y, tam, cor);
}
