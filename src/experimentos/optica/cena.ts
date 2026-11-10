/**
 * Bancada de óptica — cena (apresentação e interação).
 *
 * Três telas empilhadas: fundo (grade da bancada), luz (densidade de raios,
 * WebGL) e vetor (espelho, raios, construções, alças, rótulos). Nada aqui
 * altera a física: a cena lê a solução da sessão e escreve apenas parâmetros
 * (ao arrastar uma alça) e o enquadramento.
 */
import { effect } from '@preact/signals';
import type { Sessao } from '../../nucleo/sessao';
import { Vista2D, recortar, distPontoSegmento } from '../../nucleo/vista2d';
import { comprimentoMm, fmtFixo, marcas, passoRedondo, radParaGraus, grausParaRad } from '../../nucleo/formato';
import { cores, fontes, tracos, alfa as rgba } from '../../ui/tema';
import { CamadaLuz, coefTom, curvaTom, corTom, type ModoLuz } from '../../ui/luz';
import { canvasParaBlob } from '../../ui/exportar';
import { Estado, flecha, inclinacao } from './modelo';
import { MAXP, tracarLeque, pupilaDeU, type Leque, type Solucao } from './analise';
import { configDeValores } from './definicao';

type IdAlca = 'abertura+' | 'abertura-' | 'anteparo' | 'curvatura' | 'incidencia' | 'feixe+' | 'feixe-' | 'prova';

interface Alca {
  id: IdAlca;
  x: number;
  y: number;
  cursor: string;
}

type Arraste =
  | { tipo: 'alca'; id: IdAlca; ponteiro: number; /** diferença entre o dedo e a grandeza arrastada, para a alça não saltar */ off: number; moveu: boolean }
  | { tipo: 'pan'; ponteiro: number; x0: number; y0: number; x: number; y: number; moveu: boolean; toque: boolean; naLinhaAnteparo: boolean }
  | { tipo: 'pinca'; a: number; b: number; d0: number; cx: number; cy: number };

export interface OpcoesCena {
  /** força o caminho Canvas 2D da camada de luz (teste do modo de compatibilidade) */
  luz2d?: boolean;
}

const TIPO_INC = 0;
const TIPO_REF = 1;
const TIPO_PERD = 2;

type Emitir = (z0: number, y0: number, z1: number, y1: number, semirreta: boolean, tipo: number) => void;

/**
 * Percorre os trechos desenháveis do raio i de um leque. Coordenadas do mundo;
 * em semirretas (z1, y1) é a direção. Com anteparo opaco, o raio termina no impacto.
 */
function percorrer(L: Leque, i: number, sa: number, ca: number, zs: number, H: number, opaco: boolean, emit: Emitir) {
  const nr = L.nRefl[i];
  if (nr === 0) {
    // não atinge o espelho: reta inteira pelo ponto p0 = (y = u cos α, z = −u sen α)
    const u = L.u[i];
    const y0 = u * ca;
    const z0 = -u * sa;
    if (L.estado[i] === Estado.Bloqueado) {
      emit(L.pFinal[3 * i + 2], L.pFinal[3 * i + 1], ca, sa, true, TIPO_INC);
      return;
    }
    emit(z0, y0, ca, sa, true, TIPO_PERD);
    emit(z0, y0, -ca, -sa, true, TIPO_PERD);
    return;
  }
  const base = i * MAXP * 3;
  // trecho incidente: semirreta do primeiro ponto de reflexão para trás (−d0)
  emit(L.pontos[base + 2], L.pontos[base + 1], ca, sa, true, TIPO_INC);
  const guardados = Math.min(nr, MAXP);
  const seg = L.segImp[i];
  const corta = opaco && seg >= 0 && Math.abs(L.yImp[i]) <= H;
  for (let k = 0; k < guardados; k++) {
    const o = base + 3 * k;
    const py = L.pontos[o + 1];
    const pz = L.pontos[o + 2];
    if (corta && seg === k) {
      emit(pz, py, zs, L.yImp[i], false, TIPO_REF);
      return;
    }
    if (k + 1 < nr) {
      if (k + 1 >= guardados) return;
      emit(pz, py, L.pontos[o + 5], L.pontos[o + 4], false, TIPO_REF);
    } else if (L.estado[i] === Estado.Refletido) {
      emit(pz, py, L.dirs[o + 2], L.dirs[o + 1], true, TIPO_REF);
    }
  }
}

/** Trecho de um rótulo: itálico matemático, romano matemático, subscrito ou texto da interface. */
type Parte = [texto: string, estilo: 'it' | 'reta' | 'sub' | 'ui'];

function fonteParte(estilo: Parte[1], tam: number): string {
  if (estilo === 'it') return `italic ${tam + 2}px ${fontes.mat}`;
  if (estilo === 'reta') return `${tam + 1}px ${fontes.matReta}`;
  if (estilo === 'sub') return `italic ${Math.round(tam * 0.82)}px ${fontes.mat}`;
  return `${tam}px ${fontes.ui}`;
}

function larguraPartes(ctx: CanvasRenderingContext2D, partes: Parte[], tam: number): number {
  let w = 0;
  for (const [t, e] of partes) {
    ctx.font = fonteParte(e, tam);
    w += ctx.measureText(t).width + (e === 'sub' ? 1 : 0);
  }
  return w;
}

/** Desenha as partes a partir de x (à esquerda), centradas verticalmente em y. */
function desenharPartes(ctx: CanvasRenderingContext2D, partes: Parte[], x: number, y: number, tam: number, cor: string) {
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
function caixaPartes(ctx: CanvasRenderingContext2D, partes: Parte[], x: number, y: number, tam: number, cor: string) {
  const w = larguraPartes(ctx, partes, tam);
  ctx.fillStyle = 'rgba(5,7,10,0.84)';
  ctx.fillRect(Math.round(x - w / 2 - 5), Math.round(y - tam * 0.72), Math.round(w + 10), Math.round(tam * 1.5));
  desenharPartes(ctx, partes, x - w / 2, y, tam, cor);
}

export class CenaOptica {
  readonly vista = new Vista2D();
  readonly luz: CamadaLuz;
  private cFundo: HTMLCanvasElement;
  private cLuz: HTMLCanvasElement;
  private cVet: HTMLCanvasElement;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private pendente = 0;
  private descartes: (() => void)[] = [];
  private arraste: Arraste | null = null;
  private ponteiros = new Map<number, { x: number; y: number; toque: boolean }>();
  private realce: IdAlca | 'raio' | null = null;
  private raioRealce = -1;
  private alcas: Alca[] = [];
  private enquadrada = true;
  private iniciou = false;
  private interagindo = false;
  private tRefino = 0;
  private ultimoToque = { t: 0, x: 0, y: 0 };
  private pulso0 = 0;
  private lequeDes: { sol: Solucao; n: number; L: Leque } | null = null;
  private instLuz = new Float32Array(5 * 4096);
  private chaveLuz = '';
  private chaveFundo = '';
  private solLuz: Solucao | null = null;
  /** estatística do último quadro (para o medidor de desempenho) */
  ultimoQuadro = { ms: 0, raiosLuz: 0, segmentosLuz: 0 };
  modoLuz: ModoLuz;

  constructor(private el: HTMLElement, private s: Sessao<Solucao>, op: OpcoesCena = {}) {
    this.vista.sentidoX = -1;
    this.vista.escalaMin = 0.02;
    this.vista.escalaMax = 5e6;
    const mk = (cls: string) => {
      const c = document.createElement('canvas');
      c.className = cls;
      el.appendChild(c);
      return c;
    };
    this.cFundo = mk('fundo');
    this.cLuz = mk('luz');
    this.cVet = mk('vetor');
    this.luz = new CamadaLuz(this.cLuz, cores.luz, cores.luzQuente, () => {
      this.chaveLuz = '';
      this.pedir();
    }, op.luz2d);
    this.modoLuz = this.luz.modo;

    const ro = new ResizeObserver(() => this.medir());
    ro.observe(el);
    this.descartes.push(() => ro.disconnect());
    this.medir();

    this.descartes.push(effect(() => {
      // qualquer mudança de estado pede um novo quadro
      void this.s.valores.value;
      void this.s.extras.value;
      this.pedir();
    }));
    let primeiro = true;
    this.descartes.push(effect(() => {
      void this.s.pedidoEnquadrar.value;
      if (primeiro) {
        primeiro = false;
        return;
      }
      this.enquadrar();
      this.pulsar();
    }));
    let primeiraVista = true;
    this.descartes.push(effect(() => {
      void this.s.pedidoVista.value;
      if (primeiraVista) {
        primeiraVista = false;
        return;
      }
      const v = this.s.vista.peek();
      if (v) {
        this.vista.aplicar(v);
        this.enquadrada = false;
        this.pedir();
      }
    }));

    const on = <K extends keyof HTMLElementEventMap>(t: K, f: (e: HTMLElementEventMap[K]) => void, o?: AddEventListenerOptions) => {
      el.addEventListener(t, f as EventListener, o);
      this.descartes.push(() => el.removeEventListener(t, f as EventListener, o));
    };
    on('pointerdown', (e) => this.aoBaixar(e));
    on('pointermove', (e) => this.aoMover(e));
    on('pointerup', (e) => this.aoSoltar(e));
    on('pointercancel', (e) => this.aoSoltar(e, true));
    on('pointerleave', () => {
      if (this.realce) {
        this.realce = null;
        this.raioRealce = -1;
        this.pedir();
      }
    });
    on('wheel', (e) => this.aoRolar(e), { passive: false });
    on('dblclick', (e) => {
      const r = this.el.getBoundingClientRect();
      if (!this.alcaEm(e.clientX - r.left, e.clientY - r.top, false)) this.enquadrar();
    });
    on('contextmenu', (e) => e.preventDefault());
    // impede o zoom de página do Safari sobre a cena
    on('gesturestart' as any, (e: Event) => e.preventDefault());
    // os rótulos da cena usam as fontes do KaTeX; redesenha quando chegarem
    const fs = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (fs) {
      Promise.all([fs.load(`italic 16px KaTeX_Math`), fs.load(`500 14px Barlow`), fs.load(`13px Barlow`)]).then(() => this.pedir(), () => {});
    }
    this.pulsar();
  }

  destruir() {
    cancelAnimationFrame(this.pendente);
    clearTimeout(this.tRefino);
    for (const d of this.descartes) d();
    this.cFundo.remove();
    this.cLuz.remove();
    this.cVet.remove();
  }

  // ————— tamanho e enquadramento —————

  private medir() {
    const r = this.el.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    if (w === this.w && h === this.h && this.iniciou) return;
    const antes = { w: this.w, h: this.h };
    this.w = w;
    this.h = h;
    this.dpr = Math.min(3, window.devicePixelRatio || 1);
    this.vista.largura = w;
    this.vista.altura = h;
    for (const c of [this.cFundo, this.cVet]) {
      c.width = Math.round(w * this.dpr);
      c.height = Math.round(h * this.dpr);
    }
    this.chaveFundo = '';
    this.chaveLuz = '';
    if (!this.iniciou) {
      if (w < 8 || h < 8) return;
      this.iniciou = true;
      const v = this.s.vista.peek();
      if (v) {
        this.vista.aplicar(v);
        this.enquadrada = false;
      } else this.enquadrar();
    } else if (this.enquadrada) {
      this.enquadrar();
    } else if (antes.w > 8) {
      // mantém o centro e a largura de mundo visível (rotação do tablet, redimensionamento)
      this.vista.escala *= Math.min(w, h) / Math.min(antes.w, antes.h);
      this.guardarVista();
    }
    this.pedir();
  }

  /** Caixa do mundo que contém espelho, centro de curvatura, anteparo e alça de incidência. */
  private caixa() {
    const v = this.s.valores.peek();
    const R = v.R as number;
    const a = v.a as number;
    const zs = v.zs as number;
    const H = v.H as number;
    const alfa = grausParaRad(v.alfa as number);
    const zEsq = Math.max(1.34 * R, Math.min(zs, 2.2 * R) + 0.1 * R);
    const yMax = Math.max(1.16 * a, 1.1 * Math.min(H, 1.6 * a), Math.abs(1.25 * R * Math.tan(alfa)) + 0.08 * R, 0.16 * R);
    return { x0: -0.1 * R, x1: zEsq, y0: -yMax, y1: yMax };
  }

  enquadrar() {
    if (this.w < 8) return;
    // área útil: desconta a legenda do topo e a régua/escala da base
    this.vista.margens = { esquerda: 10, direita: 10, topo: 46, base: 62 };
    this.vista.enquadrar(this.caixa());
    this.enquadrada = true;
    this.guardarVista();
    this.pedir();
  }

  zoom(fator: number) {
    this.vista.zoomEm(this.w / 2, this.h / 2, fator);
    this.enquadrada = false;
    this.guardarVista();
    this.marcarInteracao();
    this.pedir();
  }

  private guardarVista() {
    this.s.vista.value = this.enquadrada ? null : this.vista.estado();
  }

  private pulsar() {
    this.pulso0 = performance.now();
    this.pedir();
  }

  // ————— ponteiros —————

  private pos(e: PointerEvent | WheelEvent | MouseEvent) {
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private alcaEm(x: number, y: number, toque: boolean): Alca | null {
    const raio = toque ? 26 : 13;
    let melhor: Alca | null = null;
    let dm = raio;
    for (const a of this.alcas) {
      const d = Math.hypot(a.x - x, a.y - y) - (a.id === 'prova' ? 3 : 0);
      if (d < dm) {
        dm = d;
        melhor = a;
      }
    }
    return melhor;
  }

  private naLinhaDoAnteparo(x: number, y: number, toque: boolean): boolean {
    const v = this.s.valores.peek();
    const sx = this.vista.tx(v.zs as number);
    const y0 = this.vista.ty(v.H as number);
    const y1 = this.vista.ty(-(v.H as number));
    return Math.abs(x - sx) <= (toque ? 15 : 7) && y >= Math.max(0, y0) - 10 && y <= Math.min(this.h, y1) + 10;
  }

  private aoBaixar(e: PointerEvent) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const p = this.pos(e);
    const toque = e.pointerType !== 'mouse';
    this.ponteiros.set(e.pointerId, { ...p, toque });
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      /* ponteiro sintético */
    }
    if (this.ponteiros.size === 2) {
      // segundo dedo: vira pinça, a menos que uma alça esteja sendo arrastada
      if (this.arraste?.tipo === 'alca') return;
      const [a, b] = [...this.ponteiros.entries()];
      this.arraste = {
        tipo: 'pinca', a: a[0], b: b[0],
        d0: Math.hypot(a[1].x - b[1].x, a[1].y - b[1].y),
        cx: (a[1].x + b[1].x) / 2, cy: (a[1].y + b[1].y) / 2,
      };
      return;
    }
    if (this.ponteiros.size > 2) return;
    const alca = this.alcaEm(p.x, p.y, toque);
    if (alca) {
      this.arraste = { tipo: 'alca', id: alca.id, ponteiro: e.pointerId, off: this.desvioAlca(alca.id, p.x, p.y), moveu: false };
      this.s.inicioGesto();
      this.realce = alca.id;
      this.pedir();
      e.preventDefault();
      return;
    }
    this.arraste = {
      tipo: 'pan', ponteiro: e.pointerId, x0: p.x, y0: p.y, x: p.x, y: p.y, moveu: false, toque,
      naLinhaAnteparo: this.naLinhaDoAnteparo(p.x, p.y, toque),
    };
  }

  private aoMover(e: PointerEvent) {
    const p = this.pos(e);
    const reg = this.ponteiros.get(e.pointerId);
    if (reg) {
      reg.x = p.x;
      reg.y = p.y;
    }
    const ar = this.arraste;
    if (!ar) {
      if (e.pointerType === 'mouse') this.atualizarRealce(p.x, p.y);
      return;
    }
    if (ar.tipo === 'pinca') {
      const a = this.ponteiros.get(ar.a);
      const b = this.ponteiros.get(ar.b);
      if (!a || !b) return;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      this.vista.deslocar(cx - ar.cx, cy - ar.cy);
      if (ar.d0 > 4 && d > 4) this.vista.zoomEm(cx, cy, d / ar.d0);
      ar.d0 = d;
      ar.cx = cx;
      ar.cy = cy;
      this.enquadrada = false;
      this.marcarInteracao();
      this.pedir();
      return;
    }
    if (ar.ponteiro !== e.pointerId) return;
    if (ar.tipo === 'alca') {
      ar.moveu = true;
      this.arrastarAlca(ar, p.x, p.y, e);
      this.marcarInteracao();
      return;
    }
    // pan (ou anteparo, se o gesto começou sobre a linha dele)
    const dx = p.x - ar.x;
    const dy = p.y - ar.y;
    if (!ar.moveu && Math.hypot(p.x - ar.x0, p.y - ar.y0) < (ar.toque ? 7 : 3)) return;
    if (!ar.moveu && ar.naLinhaAnteparo) {
      // o gesto começou sobre o anteparo e virou arraste: move o anteparo
      const v = this.s.valores.peek();
      this.arraste = { tipo: 'alca', id: 'anteparo', ponteiro: ar.ponteiro, off: this.vista.mx(ar.x0) - (v.zs as number), moveu: true };
      this.s.inicioGesto();
      this.realce = 'anteparo';
      this.arrastarAlca(this.arraste, p.x, p.y, e);
      return;
    }
    ar.moveu = true;
    ar.x = p.x;
    ar.y = p.y;
    this.vista.deslocar(dx, dy);
    this.enquadrada = false;
    this.marcarInteracao();
    this.pedir();
  }

  private aoSoltar(e: PointerEvent, cancelado = false) {
    const p = this.pos(e);
    const reg = this.ponteiros.get(e.pointerId);
    this.ponteiros.delete(e.pointerId);
    const ar = this.arraste;
    if (!ar) return;
    if (ar.tipo === 'pinca') {
      if (e.pointerId === ar.a || e.pointerId === ar.b) {
        this.arraste = null;
        this.guardarVista();
      }
      return;
    }
    if (ar.ponteiro !== e.pointerId) return;
    this.arraste = null;
    if (ar.tipo === 'alca') {
      this.s.fimGesto();
      if (reg?.toque) this.realce = null;
      this.pedir();
      return;
    }
    if (ar.moveu) {
      this.guardarVista();
      return;
    }
    if (cancelado) return;
    // toque sem arrasto: seleciona um raio, ou (toque duplo no vazio) reenquadra
    const agora = performance.now();
    const duplo = agora - this.ultimoToque.t < 320 && Math.hypot(p.x - this.ultimoToque.x, p.y - this.ultimoToque.y) < 28;
    this.ultimoToque = { t: agora, x: p.x, y: p.y };
    const i = this.raioEm(p.x, p.y, ar.toque);
    if (i >= 0) {
      const sol = this.s.solucao.peek();
      const L = this.lequeDesenho(sol);
      this.s.definirExtras({ prova: pupilaDeU(sol.intervalo, L.u[i]) }, true);
      this.ultimoToque.t = 0;
    } else if (duplo && ar.toque) {
      this.enquadrar();
      this.ultimoToque.t = 0;
    } else if (this.s.extras.peek().prova !== null && !ar.naLinhaAnteparo) {
      this.s.definirExtras({ prova: null }, true);
    }
  }

  private aoRolar(e: WheelEvent) {
    e.preventDefault();
    const p = this.pos(e);
    const bruto = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    const f = Math.exp(-bruto * (e.ctrlKey ? 0.012 : 0.0016));
    this.vista.zoomEm(p.x, p.y, f);
    this.enquadrada = false;
    this.guardarVista();
    this.marcarInteracao();
    this.pedir();
  }

  private marcarInteracao() {
    this.interagindo = true;
    clearTimeout(this.tRefino);
    this.tRefino = window.setTimeout(() => {
      this.interagindo = false;
      this.pedir();
    }, 140);
  }

  private atualizarRealce(x: number, y: number) {
    const a = this.alcaEm(x, y, false);
    let novo: typeof this.realce = a ? a.id : null;
    let raio = -1;
    if (!a) {
      if (this.naLinhaDoAnteparo(x, y, false)) novo = 'anteparo';
      else {
        raio = this.raioEm(x, y, false);
        if (raio >= 0) novo = 'raio';
      }
    }
    const cursor = a ? a.cursor : novo === 'anteparo' ? 'ew-resize' : novo === 'raio' ? 'pointer' : 'grab';
    if (this.el.style.cursor !== cursor) this.el.style.cursor = cursor;
    if (novo !== this.realce || raio !== this.raioRealce) {
      this.realce = novo;
      this.raioRealce = raio;
      this.pedir();
    }
  }

  /** Índice do raio desenhado mais próximo de (x, y) dentro da tolerância, ou −1. */
  private raioEm(x: number, y: number, toque: boolean): number {
    const sol = this.s.solucao.peek();
    const L = this.lequeDesenho(sol);
    const cfg = sol.cfg;
    const sa = Math.sin(cfg.feixe.alfa);
    const ca = Math.cos(cfg.feixe.alfa);
    const V = this.vista;
    const tol = toque ? 20 : 8;
    let melhor = -1;
    let dm = tol;
    const out = [0, 0, 0, 0];
    for (let i = 0; i < L.n; i++) {
      if (L.nRefl[i] === 0) continue;
      percorrer(L, i, sa, ca, cfg.zs, cfg.H, cfg.opaco, (z0, y0, z1, y1, semi) => {
        const X0 = V.tx(z0);
        const Y0 = V.ty(y0);
        let ok: boolean;
        if (semi) ok = recortar(X0, Y0, -z1, -y1, -tol, -tol, this.w + tol, this.h + tol, out, true);
        else ok = recortar(X0, Y0, V.tx(z1), V.ty(y1), -tol, -tol, this.w + tol, this.h + tol, out);
        if (!ok) return;
        const d = distPontoSegmento(x, y, out[0], out[1], out[2], out[3]);
        if (d < dm) {
          dm = d;
          melhor = i;
        }
      });
    }
    return melhor;
  }

  /** Valor que a alça teria se o dedo estivesse exatamente sobre a grandeza (antes de aplicar o desvio). */
  private valorSobDedo(id: IdAlca, x: number, y: number): number {
    const V = this.vista;
    const v = this.s.valores.peek();
    const wz = V.mx(x);
    const wy = V.my(y);
    const al = grausParaRad(v.alfa as number);
    switch (id) {
      case 'abertura+': return wy;
      case 'abertura-': return -wy;
      case 'anteparo':
      case 'curvatura': return wz;
      case 'incidencia': return radParaGraus(Math.atan2(wy, Math.max(1e-9, wz)));
      // distância (com sinal) do dedo ao raio central, que passa por V com a direção do feixe
      case 'feixe+': return wy * Math.cos(al) - wz * Math.sin(al);
      case 'feixe-': return -(wy * Math.cos(al) - wz * Math.sin(al));
      case 'prova': return wy * Math.cos(al) - wz * Math.sin(al);
    }
  }

  private desvioAlca(id: IdAlca, x: number, y: number): number {
    const v = this.s.valores.peek();
    const sob = this.valorSobDedo(id, x, y);
    switch (id) {
      case 'abertura+':
      case 'abertura-': return sob - (v.a as number);
      case 'anteparo': return sob - (v.zs as number);
      case 'curvatura': return sob - (v.R as number);
      case 'incidencia': return sob - (v.alfa as number);
      case 'feixe+':
      case 'feixe-': return sob - (v.w as number);
      case 'prova': {
        const pr = this.s.solucao.peek().prova;
        return pr ? sob - pr.u : 0;
      }
    }
  }

  private arrastarAlca(ar: Extract<Arraste, { tipo: 'alca' }>, x: number, y: number, e: PointerEvent) {
    const V = this.vista;
    const v = this.s.valores.peek();
    const alvo = this.valorSobDedo(ar.id, x, y) - ar.off;
    switch (ar.id) {
      case 'abertura+':
      case 'abertura-':
        this.s.definir({ a: alvo });
        break;
      case 'anteparo': {
        let z = alvo;
        // ímã suave no foco paraxial (±5 px); Alt ou Shift desligam
        const f = (v.R as number) / 2;
        if (!e.altKey && !e.shiftKey && Math.abs(V.tx(z) - V.tx(f)) < 5) z = f;
        this.s.definir({ zs: z });
        break;
      }
      case 'curvatura':
        this.s.definir({ R: alvo });
        break;
      case 'incidencia': {
        // ímã em α = 0 (incidência paralela ao eixo)
        const g = Math.abs(alvo) < 0.12 ? 0 : alvo;
        this.s.definir({ alfa: Math.round(g * 100) / 100 });
        break;
      }
      case 'feixe+':
      case 'feixe-':
        this.s.definir({ w: Math.abs(alvo) });
        break;
      case 'prova':
        // o raio incidente que passa sob o dedo
        this.s.definirExtras({ prova: pupilaDeU(this.s.solucao.peek().intervalo, alvo) });
        break;
    }
  }

  // ————— desenho —————

  pedir() {
    if (this.pendente) return;
    this.pendente = requestAnimationFrame(() => {
      this.pendente = 0;
      this.desenhar();
    });
  }

  private lequeDesenho(sol: Solucao): Leque {
    const n = this.s.valores.peek().nRaios as number;
    if (!this.lequeDes || this.lequeDes.sol !== sol || this.lequeDes.n !== n) {
      const cfg = sol.cfg;
      this.lequeDes = { sol, n, L: tracarLeque(cfg.espelho, cfg.feixe.alfa, sol.intervalo[0], sol.intervalo[1], n, 'extremos', cfg.zs) };
    }
    return this.lequeDes.L;
  }

  private desenhar() {
    if (!this.iniciou) return;
    const t0 = performance.now();
    const sol = this.s.solucao.value;
    const v = this.s.valores.value;
    const pulso = (t0 - this.pulso0) / 1000;
    this.desenharFundo();
    this.desenharLuz(sol, v.luz as boolean, v.exposicao as number);
    this.desenharVetor(sol, pulso);
    this.ultimoQuadro.ms = performance.now() - t0;
    if (pulso < 2.6) this.pedir();
  }

  private desenharFundo() {
    const V = this.vista;
    const chave = `${V.cx}|${V.cy}|${V.escala}|${this.w}|${this.h}|${this.dpr}`;
    if (chave === this.chaveFundo) return;
    this.chaveFundo = chave;
    const ctx = this.cFundo.getContext('2d')!;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    // grade da bancada: pontos em passo redondo (1–2–5), ~44 px
    const passo = passoRedondo(44 / V.escala);
    const vis = V.visivel();
    const i0 = Math.floor(vis.x0 / passo);
    const i1 = Math.ceil(vis.x1 / passo);
    const j0 = Math.floor(vis.y0 / passo);
    const j1 = Math.ceil(vis.y1 / passo);
    if ((i1 - i0) * (j1 - j0) > 6000) return;
    ctx.fillStyle = rgba(cores.gravado, 0.2);
    for (let i = i0; i <= i1; i++) {
      const x = Math.round(V.tx(i * passo) * this.dpr) / this.dpr;
      for (let j = j0; j <= j1; j++) {
        const y = Math.round(V.ty(j * passo) * this.dpr) / this.dpr;
        ctx.fillRect(x - 0.6, y - 0.6, 1.2, 1.2);
      }
    }
  }

  /**
   * Camada de luz. Só é refeita quando muda algo de que ela depende (solução,
   * enquadramento, exposição, tamanho) — realces e leituras não a redesenham.
   *
   * Custo limitado por um orçamento de preenchimento: se os raios visíveis
   * cobririam mais pixels do que o orçamento (zoom profundo numa região onde
   * todos os raios se sobrepõem), desenham-se menos raios com peso maior. A
   * densidade média continua calibrada; perde-se só suavidade.
   */
  private desenharLuz(sol: Solucao, ligada: boolean, ev: number, forcar = false) {
    const luz = this.luz;
    // custo visual reduzido durante a interação; a solução física não muda
    const sb = this.interagindo ? 1 : Math.min(this.dpr, 1.5);
    const V = this.vista;
    const chave = `${V.cx}|${V.cy}|${V.escala}|${this.w}|${this.h}|${sb}|${ev}|${ligada}`;
    if (!forcar && chave === this.chaveLuz && sol === this.solLuz) return;
    this.chaveLuz = chave;
    this.solLuz = sol;
    luz.redimensionar(this.w, this.h, sb);
    this.modoLuz = luz.modo;
    this.ultimoQuadro.raiosLuz = 0;
    this.ultimoQuadro.segmentosLuz = 0;
    if (!ligada || luz.modo === 'desligada') {
      luz.limpar();
      return;
    }
    const cfg = sol.cfg;
    const sa = Math.sin(cfg.feixe.alfa);
    const ca = Math.cos(cfg.feixe.alfa);
    const W = this.w;
    const Hh = this.h;
    const out = [0, 0, 0, 0];
    // 1) faixa de u cujos raios passam pela tela (usa o leque de medida, já calculado)
    const D = sol.leque;
    let iMin = -1;
    let iMax = -1;
    for (let i = 0; i < D.n; i++) {
      let visivel = false;
      percorrer(D, i, sa, ca, cfg.zs, cfg.H, cfg.opaco, (z0, y0, z1, y1, semi) => {
        if (visivel) return;
        const X0 = V.tx(z0);
        const Y0 = V.ty(y0);
        visivel = semi ? recortar(X0, Y0, -z1, -y1, 0, 0, W, Hh, out, true) : recortar(X0, Y0, V.tx(z1), V.ty(y1), 0, 0, W, Hh, out);
      });
      if (visivel) {
        if (iMin < 0) iMin = i;
        iMax = i;
      }
    }
    if (iMin < 0) {
      luz.limpar();
      return;
    }
    const uLo = Math.max(sol.intervalo[0], D.u[iMin] - D.du);
    const uHi = Math.min(sol.intervalo[1], D.u[iMax] + D.du);
    // 2) quantos raios para que faixas vizinhas se sobreponham
    const gl = luz.modo === 'webgl2-16f';
    const nMax = gl ? (this.interagindo ? 2200 : 9000) : this.interagindo ? 500 : 1400;
    const orcamento = (gl ? (this.interagindo ? 3.5e6 : 1.0e7) : this.interagindo ? 0.8e6 : 2.5e6);
    const larguraPx = (uHi - uLo) * V.escala * sb;
    let n = Math.max(24, Math.min(nMax, Math.ceil(larguraPx / 1.25)));
    const m = 4;
    let k = 0;
    let meia = 1;
    let inst = this.instLuz;
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      const espac = larguraPx / n;
      // faixas sobrepostas até 6 px de largura; além disso viram linhas separadas (e mais intensas)
      meia = Math.min(3, Math.max(0.8, 0.62 * espac));
      const peso = espac / (2 * meia);
      const L = tracarLeque(cfg.espelho, cfg.feixe.alfa, uLo, uHi, n, 'centros', cfg.zs);
      // 3) segmentos recortados, em px do buffer
      k = 0;
      let comprimento = 0;
      const emit: Emitir = (z0, y0, z1, y1, semi, tipo) => {
        if (tipo === TIPO_PERD) return;
        const X0 = V.tx(z0);
        const Y0 = V.ty(y0);
        const ok = semi
          ? recortar(X0, Y0, -z1, -y1, -m, -m, W + m, Hh + m, out, true)
          : recortar(X0, Y0, V.tx(z1), V.ty(y1), -m, -m, W + m, Hh + m, out);
        if (!ok) return;
        if (5 * (k + 1) > inst.length) {
          const maior = new Float32Array(inst.length * 2);
          maior.set(inst);
          inst = maior;
        }
        inst[5 * k] = out[0] * sb;
        inst[5 * k + 1] = out[1] * sb;
        inst[5 * k + 2] = out[2] * sb;
        inst[5 * k + 3] = out[3] * sb;
        inst[5 * k + 4] = peso;
        comprimento += Math.hypot(out[2] - out[0], out[3] - out[1]) * sb;
        k++;
      };
      for (let i = 0; i < L.n; i++) percorrer(L, i, sa, ca, cfg.zs, cfg.H, cfg.opaco, emit);
      const preenchimento = comprimento * (2 * meia + 2);
      if (preenchimento <= orcamento || n <= 24) break;
      n = Math.max(24, Math.floor((n * orcamento) / preenchimento));
    }
    this.instLuz = inst;
    luz.desenhar(inst, k, meia, coefTom(ev));
    this.ultimoQuadro.raiosLuz = n;
    this.ultimoQuadro.segmentosLuz = k;
  }

  private desenharVetor(sol: Solucao, pulso: number) {
    const ctx = this.cVet.getContext('2d')!;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    this.pintar(ctx, sol, pulso, false);
  }

  /** Desenha a camada vetorial. `limpo` omite alças e dicas (imagem exportada). */
  private pintar(ctx: CanvasRenderingContext2D, sol: Solucao, pulso: number, limpo: boolean) {
    const V = this.vista;
    const v = this.s.valores.value;
    const cfg = sol.cfg;
    const e = cfg.espelho;
    const R = e.R;
    const f = sol.f;
    const W = this.w;
    const H = this.h;
    const sa = Math.sin(cfg.feixe.alfa);
    const ca = Math.cos(cfg.feixe.alfa);
    const out = [0, 0, 0, 0];
    const eixoY = V.ty(0);
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'round';
    const alcas: Alca[] = [];

    const linha = (z0: number, y0: number, z1: number, y1: number) => {
      if (recortar(V.tx(z0), V.ty(y0), V.tx(z1), V.ty(y1), -20, -20, W + 20, H + 20, out)) {
        ctx.moveTo(out[0], out[1]);
        ctx.lineTo(out[2], out[3]);
        return true;
      }
      return false;
    };

    // ——— eixo óptico e régua
    ctx.strokeStyle = rgba(cores.gravado, 0.55);
    ctx.lineWidth = 1;
    ctx.setLineDash(tracos.eixo as unknown as number[]);
    ctx.beginPath();
    ctx.moveTo(0, Math.round(eixoY) + 0.5);
    ctx.lineTo(W, Math.round(eixoY) + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
    if (eixoY > 8 && eixoY < H - 24) {
      const vis = V.visivel();
      const mk = marcas(vis.x0, vis.x1, Math.max(3, Math.round(W / 110)));
      ctx.beginPath();
      ctx.font = `11.5px ${fontes.ui}`;
      ctx.fillStyle = rgba(cores.gravado, 0.85);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const yb = Math.round(eixoY) + 0.5;
      for (const z of mk.valores) {
        const x = Math.round(V.tx(z)) + 0.5;
        ctx.moveTo(x, yb - 3.5);
        ctx.lineTo(x, yb + 3.5);
      }
      ctx.strokeStyle = rgba(cores.gravado, 0.8);
      ctx.stroke();
      // rótulos da régua ficam junto à borda inferior para não disputar com a óptica
      const yr = H - 17;
      ctx.beginPath();
      for (const z of mk.valores) {
        const x = V.tx(z);
        if (x < 64 || x > W - 60) continue;
        ctx.fillText(fmtFixo(z, mk.casas), x, yr);
        ctx.moveTo(Math.round(x) + 0.5, yr - 5);
        ctx.lineTo(Math.round(x) + 0.5, yr - 1);
      }
      ctx.strokeStyle = rgba(cores.gravado, 0.5);
      ctx.stroke();
      ctx.textAlign = 'left';
      ctx.fillText('z (mm)', 10, yr);
    }

    // ——— espelho: substrato hachurado e superfície refletora
    {
      const vis = V.visivel();
      const y0 = Math.max(-e.a, vis.y0 - 2 / V.escala);
      const y1 = Math.min(e.a, vis.y1 + 2 / V.escala);
      const esp = 0.045 * R;
      if (y1 > y0) {
        const N = 96;
        const px: number[] = [];
        const py: number[] = [];
        for (let i = 0; i <= N; i++) {
          const y = y0 + ((y1 - y0) * i) / N;
          px.push(V.tx(flecha(e, Math.abs(y))));
          py.push(V.ty(y));
        }
        const lim = (x: number) => Math.max(-4000, Math.min(W + 4000, x));
        const xTras = lim(V.tx(-esp));
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(lim(px[0]), py[0]);
        for (let i = 1; i <= N; i++) ctx.lineTo(lim(px[i]), py[i]);
        ctx.lineTo(xTras, py[N]);
        ctx.lineTo(xTras, py[0]);
        ctx.closePath();
        ctx.fillStyle = '#0e1319';
        ctx.fill();
        ctx.clip();
        // hachura a 45° (convenção de desenho técnico para o lado não refletor)
        ctx.strokeStyle = rgba(cores.gravado, 0.34);
        ctx.lineWidth = 1;
        ctx.beginPath();
        const xa = Math.max(-10, Math.min(...px.map(lim), xTras));
        const xb = Math.min(W + 10, Math.max(...px.map(lim), xTras));
        const ya = Math.max(-10, py[N]);
        const yb = Math.min(H + 10, py[0]);
        for (let c = xa - (yb - ya); c < xb; c += 7) {
          ctx.moveTo(c, yb);
          ctx.lineTo(c + (yb - ya), ya);
        }
        ctx.stroke();
        ctx.restore();
        // contorno do substrato
        ctx.strokeStyle = rgba(cores.gravado, 0.6);
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (y1 >= e.a) { ctx.moveTo(lim(px[N]), py[N]); ctx.lineTo(xTras, py[N]); } else ctx.moveTo(xTras, py[N]);
        ctx.lineTo(xTras, py[0]);
        if (y0 <= -e.a) ctx.lineTo(lim(px[0]), py[0]);
        ctx.stroke();
        // superfície refletora
        ctx.strokeStyle = cores.equipamento;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        let aberto = false;
        for (let i = 0; i < N; i++) {
          if (recortar(px[i], py[i], px[i + 1], py[i + 1], -20, -20, W + 20, H + 20, out)) {
            if (!aberto) ctx.moveTo(out[0], out[1]);
            ctx.lineTo(out[2], out[3]);
            aberto = true;
          } else aberto = false;
        }
        ctx.stroke();
      }
    }

    // ——— cáustica (envoltória), se pedida
    if (v.caustica) {
      ctx.strokeStyle = rgba(cores.construcao, 0.95);
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      for (const t of sol.caustica()) {
        let aberto = false;
        for (let i = 0; i + 3 < t.length; i += 2) {
          if (recortar(V.tx(t[i]), V.ty(t[i + 1]), V.tx(t[i + 2]), V.ty(t[i + 3]), -20, -20, W + 20, H + 20, out)) {
            if (!aberto) ctx.moveTo(out[0], out[1]);
            ctx.lineTo(out[2], out[3]);
            aberto = true;
          } else aberto = false;
        }
      }
      ctx.stroke();
    }

    // ——— raios desenhados
    const L = this.lequeDesenho(sol);
    const denso = L.n > 61;
    const impactos: number[] = [];
    {
      const cam = new Path2D();
      const perd = new Path2D();
      const setas: number[] = [];
      for (let i = 0; i < L.n; i++) {
        let nInc = 0;
        percorrer(L, i, sa, ca, cfg.zs, cfg.H, cfg.opaco, (z0, y0, z1, y1, semi, tipo) => {
          const X0 = V.tx(z0);
          const Y0 = V.ty(y0);
          const ok = semi
            ? recortar(X0, Y0, -z1, -y1, -20, -20, W + 20, H + 20, out, true)
            : recortar(X0, Y0, V.tx(z1), V.ty(y1), -20, -20, W + 20, H + 20, out);
          if (!ok) return;
          const p = tipo === TIPO_PERD ? perd : cam;
          p.moveTo(out[0], out[1]);
          p.lineTo(out[2], out[3]);
          // seta de sentido no trecho incidente (aponta para o espelho)
          if (tipo === TIPO_INC && nInc++ === 0 && !denso) {
            const len = Math.hypot(out[2] - out[0], out[3] - out[1]);
            if (len > 120) {
              const t = Math.max(0.12, Math.min(0.5, 1 - 110 / len));
              setas.push(out[0] + (out[2] - out[0]) * t, out[1] + (out[3] - out[1]) * t, out[0] - out[2], out[1] - out[3]);
            }
          }
        });
        const yi = L.yImp[i];
        if (!Number.isNaN(yi) && Math.abs(yi) <= cfg.H) impactos.push(yi);
      }
      ctx.strokeStyle = rgba(cores.luz, denso ? 0.5 : 0.92);
      ctx.lineWidth = denso ? 0.8 : 1.15;
      ctx.stroke(cam);
      ctx.strokeStyle = rgba(cores.luz, 0.4);
      ctx.setLineDash(tracos.perdido as unknown as number[]);
      ctx.stroke(perd);
      ctx.setLineDash([]);
      ctx.fillStyle = rgba(cores.luz, 0.95);
      for (let i = 0; i < setas.length; i += 4) {
        const m = Math.hypot(setas[i + 2], setas[i + 3]) || 1;
        const ux = setas[i + 2] / m;
        const uy = setas[i + 3] / m;
        const x = setas[i];
        const y = setas[i + 1];
        ctx.beginPath();
        ctx.moveTo(x + ux * 5, y + uy * 5);
        ctx.lineTo(x - ux * 4 - uy * 3.2, y - uy * 4 + ux * 3.2);
        ctx.lineTo(x - ux * 4 + uy * 3.2, y - uy * 4 - ux * 3.2);
        ctx.closePath();
        ctx.fill();
      }
      // raio sob o cursor (pré-seleção)
      if (this.realce === 'raio' && this.raioRealce >= 0 && this.raioRealce < L.n && !limpo) {
        ctx.strokeStyle = rgba(cores.selecao, 0.75);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        percorrer(L, this.raioRealce, sa, ca, cfg.zs, cfg.H, cfg.opaco, (z0, y0, z1, y1, semi) => {
          const X0 = V.tx(z0);
          const Y0 = V.ty(y0);
          const ok = semi ? recortar(X0, Y0, -z1, -y1, -20, -20, W + 20, H + 20, out, true) : recortar(X0, Y0, V.tx(z1), V.ty(y1), -20, -20, W + 20, H + 20, out);
          if (ok) {
            ctx.moveTo(out[0], out[1]);
            ctx.lineTo(out[2], out[3]);
          }
        });
        ctx.stroke();
      }
    }

    // ——— anteparo
    const xs = V.tx(cfg.zs);
    {
      const yt = V.ty(cfg.H);
      const yb = V.ty(-cfg.H);
      const ativo = this.realce === 'anteparo' && !limpo;
      if (xs > -30 && xs < W + 30) {
        const a0 = Math.max(-10, yt);
        const a1 = Math.min(H + 10, yb);
        ctx.strokeStyle = ativo ? cores.selecao : cores.equipamento;
        ctx.lineWidth = ativo ? 2.6 : 2;
        ctx.beginPath();
        ctx.moveTo(xs, a0);
        ctx.lineTo(xs, a1);
        // remates nas extremidades
        ctx.moveTo(xs - 6, yt);
        ctx.lineTo(xs + 6, yt);
        ctx.moveTo(xs - 6, yb);
        ctx.lineTo(xs + 6, yb);
        ctx.stroke();
        // marcas de impacto dos raios desenhados
        ctx.fillStyle = cores.luzQuente;
        for (const y of impactos) {
          const sy = V.ty(y);
          if (sy < -4 || sy > H + 4) continue;
          ctx.beginPath();
          ctx.arc(xs, sy, denso ? 1.4 : 2.1, 0, 2 * Math.PI);
          ctx.fill();
        }
        if (!limpo) {
          // pegadores: ficam dentro da tela mesmo quando o anteparo é mais alto que ela
          for (const sinal of [1, -1]) {
            const yy = sinal > 0 ? Math.max(24, yt - 15) : Math.min(H - 40, yb + 15);
            if (sinal < 0 && Math.abs(yy - Math.max(24, yt - 15)) < 60) continue;
            ctx.fillStyle = '#10151b';
            ctx.strokeStyle = ativo ? cores.selecao : cores.equipamento;
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.roundRect(xs - 8, yy - 11, 16, 22, 4);
            ctx.fill();
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(xs - 2.5, yy - 5);
            ctx.lineTo(xs - 2.5, yy + 5);
            ctx.moveTo(xs + 2.5, yy - 5);
            ctx.lineTo(xs + 2.5, yy + 5);
            ctx.stroke();
            alcas.push({ id: 'anteparo', x: xs, y: yy, cursor: 'ew-resize' });
          }
        }
      }
    }

    // ——— referências teóricas: V, C, F (e imagem paraxial fora do eixo)
    const rotulo = (txt: string, x: number, y: number, cor: string, italico = true) => {
      ctx.font = `${italico ? 'italic ' : ''}16px ${italico ? fontes.mat : fontes.matReta}`;
      ctx.fillStyle = cor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(txt, x, y);
    };
    const losango = (x: number, y: number, r: number, cheio: boolean) => {
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r, y);
      ctx.closePath();
      if (cheio) ctx.fill();
      ctx.stroke();
    };
    const dentro = (x: number, y: number) => x > -20 && x < W + 20 && y > -20 && y < H + 20;
    {
      const xV = V.tx(0);
      if (dentro(xV, eixoY)) {
        ctx.strokeStyle = cores.gravado;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(xV, eixoY - 6);
        ctx.lineTo(xV, eixoY + 6);
        ctx.stroke();
        rotulo('V', V.tx(-0.045 * R) + 13, eixoY + 6, cores.gravado);
      }
      const xF = V.tx(f);
      ctx.strokeStyle = cores.teoria;
      ctx.fillStyle = cores.fundo;
      ctx.lineWidth = 1.5;
      if (dentro(xF, eixoY)) {
        losango(xF, eixoY, 5.5, true);
        const inclinado = Math.abs(sol.imagem.y) > 1e-9;
        // com o feixe inclinado, F e F′ ficam próximos: cada rótulo vai para um lado do eixo
        const acima = inclinado && sol.imagem.y < 0;
        rotulo('F', xF + (Math.abs(xF - xs) < 22 ? -14 : 0), acima ? eixoY - 27 : eixoY + 9, cores.teoria);
      }
      if (Math.abs(sol.imagem.y) > 1e-9) {
        const xi = V.tx(sol.imagem.z);
        const yi = V.ty(sol.imagem.y);
        if (dentro(xi, yi)) {
          ctx.strokeStyle = cores.teoria;
          ctx.fillStyle = cores.fundo;
          losango(xi, yi, 5.5, true);
          rotulo('F′', xi + (Math.abs(xi - xs) < 22 ? -15 : 0), sol.imagem.y < 0 ? yi + 9 : yi - 27, cores.teoria);
        }
        // plano focal paraxial
        ctx.strokeStyle = rgba(cores.teoria, 0.5);
        ctx.lineWidth = 1;
        ctx.setLineDash(tracos.teoria as unknown as number[]);
        ctx.beginPath();
        linha(f, 0, f, sol.imagem.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      const xC = V.tx(R);
      if (dentro(xC, eixoY)) {
        const ativo = this.realce === 'curvatura' && !limpo;
        ctx.strokeStyle = ativo ? cores.selecao : cores.teoria;
        ctx.fillStyle = cores.fundo;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(xC, eixoY, limpo ? 4 : 6, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
        if (!limpo) {
          ctx.beginPath();
          ctx.arc(xC, eixoY, 1.5, 0, 2 * Math.PI);
          ctx.fillStyle = ativo ? cores.selecao : cores.teoria;
          ctx.fill();
          alcas.push({ id: 'curvatura', x: xC, y: eixoY, cursor: 'ew-resize' });
        }
        rotulo('C', xC, eixoY + 10, cores.teoria);
      }
    }

    // ——— raio de prova: traço, normal, tangente, ângulos, cruzamento
    const prova = sol.prova;
    if (prova) {
      const tr = prova.traco;
      const cam = new Path2D();
      const seg = (z0: number, y0: number, z1: number, y1: number, semi: boolean) => {
        const ok = semi
          ? recortar(V.tx(z0), V.ty(y0), -z1, -y1, -20, -20, W + 20, H + 20, out, true)
          : recortar(V.tx(z0), V.ty(y0), V.tx(z1), V.ty(y1), -20, -20, W + 20, H + 20, out);
        if (ok) {
          cam.moveTo(out[0], out[1]);
          cam.lineTo(out[2], out[3]);
        }
      };
      const nr = tr.reflexoes.length;
      if (nr === 0) {
        seg(tr.origem[2], tr.origem[1], ca, sa, true);
        if (tr.estado !== 'bloqueado') seg(tr.origem[2], tr.origem[1], -ca, -sa, true);
      } else {
        const p0 = tr.reflexoes[0].p;
        seg(p0[2], p0[1], ca, sa, true);
        const impK = prova.yAnteparo !== null && prova.noAnteparo && cfg.opaco;
        let terminou = false;
        for (let k = 0; k < nr && !terminou; k++) {
          const p = tr.reflexoes[k].p;
          const d = tr.reflexoes[k].dSai;
          // o raio cruza o anteparo neste trecho?
          const t = d[2] !== 0 ? (cfg.zs - p[2]) / d[2] : -1;
          const q = k + 1 < nr ? tr.reflexoes[k + 1].p : null;
          const tMax = q ? Math.hypot(q[1] - p[1], q[2] - p[2]) : Infinity;
          if (impK && t > 0 && t <= tMax) {
            seg(p[2], p[1], cfg.zs, p[1] + t * d[1], false);
            terminou = true;
          } else if (q) seg(p[2], p[1], q[2], q[1], false);
          else if (tr.estado === 'refletido') seg(p[2], p[1], d[2], d[1], true);
        }
      }
      ctx.strokeStyle = rgba(cores.fundo, 0.85);
      ctx.lineWidth = 5;
      ctx.stroke(cam);
      ctx.strokeStyle = cores.selecao;
      ctx.lineWidth = 2;
      ctx.stroke(cam);

      const r0 = tr.reflexoes[0];
      if (r0) {
        const Px = V.tx(r0.p[2]);
        const Py = V.ty(r0.p[1]);
        if (v.construcoes && dentro(Px, Py)) {
          // direções em tela: z cresce para a esquerda ⇒ (−dz, −dy)
          const nx = -r0.n[2];
          const ny = -r0.n[1];
          const tx = -ny;
          const ty = nx;
          const compN = Math.min(Math.max(70, 0.36 * R * V.escala), 0.42 * Math.hypot(W, H));
          const compT = Math.min(Math.max(46, 0.2 * R * V.escala), 150);
          ctx.strokeStyle = cores.construcao;
          ctx.lineWidth = 1.25;
          ctx.setLineDash(tracos.normal as unknown as number[]);
          ctx.beginPath();
          ctx.moveTo(Px - nx * 16, Py - ny * 16);
          ctx.lineTo(Px + nx * compN, Py + ny * compN);
          ctx.stroke();
          ctx.setLineDash(tracos.tangente as unknown as number[]);
          ctx.beginPath();
          ctx.moveTo(Px - tx * compT, Py - ty * compT);
          ctx.lineTo(Px + tx * compT, Py + ty * compT);
          ctx.stroke();
          ctx.setLineDash([]);
          // arcos dos ângulos, medidos a partir da normal
          const aN = Math.atan2(ny, nx);
          const aI = Math.atan2(r0.dEntra[1], r0.dEntra[2]); // direção de −dEntra na tela
          const aR = Math.atan2(-r0.dSai[1], -r0.dSai[2]);
          const arco = (a0: number, a1: number, raio: number) => {
            let d = a1 - a0;
            while (d > Math.PI) d -= 2 * Math.PI;
            while (d < -Math.PI) d += 2 * Math.PI;
            ctx.beginPath();
            ctx.arc(Px, Py, raio, a0, a0 + d, d < 0);
            ctx.stroke();
            return a0 + d / 2;
          };
          const graus = radParaGraus(r0.thetaI);
          if (graus > 0.4) {
            const rA = Math.min(compN * 0.62, Math.max(30, 34 + 240 / Math.max(6, graus)));
            ctx.strokeStyle = cores.construcao;
            ctx.lineWidth = 1.25;
            const mI = arco(aN, aI, rA);
            const mR = arco(aN, aR, rA + 5);
            // rótulos afastados da normal para não se sobreporem em ângulos pequenos
            const sep = Math.max(0, (16 - graus) * 0.02);
            const sI = Math.sign(Math.sin(mI - aN)) || 1;
            const et = (sub: string, valor: number, ang: number, raio: number) =>
              caixaPartes(ctx, [['θ', 'it'], [sub, 'sub'], [` = ${fmtFixo(valor, 2)}°`, 'ui']], Px + Math.cos(ang) * raio, Py + Math.sin(ang) * raio, 13, cores.construcao);
            et('i', graus, mI + sI * sep, rA + 36);
            et('r', radParaGraus(r0.thetaR), mR - sI * sep, rA + 41);
          }
          // rótulos da normal e da tangente
          ctx.font = `italic 14px ${fontes.mat}`;
          ctx.fillStyle = cores.construcao;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('n', Px + nx * (compN + 11), Py + ny * (compN + 11));
          ctx.fillText('t', Px + tx * (compT + 10) * (ty < 0 ? 1 : -1), Py + ty * (compT + 10) * (ty < 0 ? 1 : -1));
        }
        // cruzamento com o eixo e cota Δz até F
        if (prova.zCruz !== null) {
          const xX = V.tx(prova.zCruz);
          const xF = V.tx(f);
          if (dentro(xX, eixoY)) {
            ctx.strokeStyle = cores.selecao;
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.moveTo(xX - 5, eixoY - 5);
            ctx.lineTo(xX + 5, eixoY + 5);
            ctx.moveTo(xX - 5, eixoY + 5);
            ctx.lineTo(xX + 5, eixoY - 5);
            ctx.stroke();
          }
          const yc = eixoY + 36;
          if (yc < H - 26 && Math.abs(sol.imagem.y) < 1e-9 && (dentro(xX, yc) || dentro(xF, yc))) {
            const dz = prova.zCruz - f;
            const a0 = Math.max(-10, Math.min(W + 10, Math.min(xX, xF)));
            const a1 = Math.max(-10, Math.min(W + 10, Math.max(xX, xF)));
            ctx.strokeStyle = rgba(cores.selecao, 0.8);
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (const x of [xX, xF]) {
              if (x > -10 && x < W + 10) {
                ctx.moveTo(Math.round(x) + 0.5, eixoY + 8);
                ctx.lineTo(Math.round(x) + 0.5, yc + 5);
              }
            }
            if (a1 - a0 > 3) {
              ctx.moveTo(a0, yc + 0.5);
              ctx.lineTo(a1, yc + 0.5);
            }
            ctx.stroke();
            const partes: Parte[] = [['Δ', 'reta'], ['z', 'it'], [` = ${comprimentoMm(dz, 4)}`, 'ui']];
            const tw = larguraPartes(ctx, partes, 13) + 12;
            let xm = (a0 + a1) / 2;
            // se o anteparo passa pelo rótulo, o rótulo vai para o lado do espelho
            if (Math.abs(xs - xm) < tw / 2 + 6) xm = Math.max(a1, xs) + tw / 2 + 10;
            xm = Math.max(tw / 2 + 6, Math.min(W - tw / 2 - 6, xm));
            caixaPartes(ctx, partes, xm, yc + 17, 13, cores.selecao);
          }
        }
        // impacto no anteparo
        if (prova.yAnteparo !== null && prova.noAnteparo && xs > -10 && xs < W + 10) {
          const sy = V.ty(prova.yAnteparo);
          ctx.fillStyle = cores.selecao;
          ctx.strokeStyle = cores.fundo;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(xs, sy, 3.6, 0, 2 * Math.PI);
          ctx.fill();
          ctx.stroke();
        }
        // ponto de incidência (alça do raio de prova)
        if (dentro(Px, Py)) {
          const ativo = this.realce === 'prova' && !limpo;
          ctx.fillStyle = cores.fundo;
          ctx.strokeStyle = cores.selecao;
          ctx.lineWidth = ativo ? 2.4 : 1.8;
          ctx.beginPath();
          ctx.arc(Px, Py, limpo ? 4 : ativo ? 8.5 : 7, 0, 2 * Math.PI);
          ctx.fill();
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(Px, Py, 1.8, 0, 2 * Math.PI);
          ctx.fillStyle = cores.selecao;
          ctx.fill();
          if (!limpo) alcas.push({ id: 'prova', x: Px, y: Py, cursor: 'ns-resize' });
        }
      }
    }

    // ——— alças: abertura, incidência, largura do feixe
    if (!limpo) {
      const zb = flecha(e, e.a);
      const m = inclinacao(e, e.a);
      const desenharAlca = (id: IdAlca, x: number, y: number, cursor: string, dirx: number, diry: number) => {
        if (!dentro(x, y)) return;
        const ativo = this.realce === id;
        // um único pulso ao abrir: mostra onde pegar
        if (pulso < 2.4) {
          const fase = (pulso % 1.2) / 1.2;
          ctx.strokeStyle = rgba(cores.selecao, 0.55 * (1 - fase));
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(x, y, 8 + 16 * fase, 0, 2 * Math.PI);
          ctx.stroke();
        }
        ctx.fillStyle = cores.fundo;
        ctx.strokeStyle = cores.selecao;
        ctx.lineWidth = ativo ? 2.4 : 1.7;
        ctx.beginPath();
        ctx.arc(x, y, ativo ? 8 : 6.5, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
        // setas discretas indicando a direção do arraste
        ctx.strokeStyle = rgba(cores.selecao, ativo ? 0.95 : 0.6);
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        for (const s of [1, -1]) {
          const bx = x + dirx * 13 * s;
          const by = y + diry * 13 * s;
          ctx.moveTo(bx - diry * 3.2 - dirx * 3 * s, by + dirx * 3.2 - diry * 3 * s);
          ctx.lineTo(bx, by);
          ctx.lineTo(bx + diry * 3.2 - dirx * 3 * s, by - dirx * 3.2 - diry * 3 * s);
        }
        ctx.stroke();
        alcas.push({ id, x, y, cursor });
      };
      // a alça da abertura fica logo além da borda, sobre a continuação da tangente
      const afast = 15;
      const nrm = Math.hypot(1, m);
      for (const s of [1, -1] as const) {
        const x = V.tx(zb) - (m / nrm) * afast;
        const y = V.ty(s * e.a) - (s / nrm) * afast;
        desenharAlca(s > 0 ? 'abertura+' : 'abertura-', x, y, 'ns-resize', 0, 1);
      }
      // incidência: sobre o raio central, a 1,25 R do vértice
      const Lh = 1.25 * R;
      const hx = V.tx(Lh * ca);
      const hy = V.ty(Lh * sa);
      desenharAlca('incidencia', hx, hy, 'ns-resize', 0, 1);
      if (dentro(hx, hy)) {
        ctx.font = `italic 15px ${fontes.mat}`;
        ctx.fillStyle = rgba(cores.selecao, 0.85);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('α', hx - 20, hy - 6);
      }
      if (!(v.feixeAuto as boolean)) {
        const w = v.w as number;
        for (const s of [1, -1] as const) {
          const z = Lh * ca - s * w * sa;
          const y = Lh * sa + s * w * ca;
          desenharAlca(s > 0 ? 'feixe+' : 'feixe-', V.tx(z), V.ty(y), 'ns-resize', 0, 1);
        }
      }
    }

    // ——— barra de escala e legenda da camada de luz
    {
      const comp = passoRedondo(96 / V.escala);
      const px = comp * V.escala;
      const x0 = 12;
      const y0 = H - 40;
      const comLuz = (v.luz as boolean) && this.luz.modo !== 'desligada' && W > 430;
      ctx.fillStyle = 'rgba(5,7,10,0.78)';
      ctx.fillRect(0, y0 - 28, x0 + Math.max(96, px) + (comLuz ? 34 + 112 + 22 : 14), H - (y0 - 28));
      ctx.strokeStyle = cores.texto2;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x0 + 0.5, y0 - 4);
      ctx.lineTo(x0 + 0.5, y0 + 0.5);
      ctx.lineTo(x0 + px + 0.5, y0 + 0.5);
      ctx.lineTo(x0 + px + 0.5, y0 - 4);
      ctx.stroke();
      ctx.font = `12.5px ${fontes.ui}`;
      ctx.fillStyle = cores.texto2;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(comprimentoMm(comp, 3), x0 + 1, y0 - 6);
    }
    if ((v.luz as boolean) && this.luz.modo !== 'desligada' && W > 430) {
      const ev = v.exposicao as number;
      const lw = 112;
      const x0 = 12 + Math.max(96, passoRedondo(96 / V.escala) * V.escala) + 34;
      const y0 = H - 40;
      const g = ctx.createLinearGradient(x0, 0, x0 + lw, 0);
      const xMax = 30;
      const pos = (x: number) => Math.log(1 + x) / Math.log(1 + xMax);
      for (let i = 0; i <= 16; i++) {
        const x = Math.expm1((i / 16) * Math.log(1 + xMax));
        const c = corTom(curvaTom(x, ev), this.luz.cor, this.luz.quente);
        g.addColorStop(i / 16, `rgb(${c[0]},${c[1]},${c[2]})`);
      }
      ctx.fillStyle = g;
      ctx.fillRect(x0, y0 - 6, lw, 6);
      ctx.strokeStyle = cores.linhaForte;
      ctx.lineWidth = 1;
      ctx.strokeRect(x0 - 0.5, y0 - 6.5, lw + 1, 7);
      ctx.font = `11.5px ${fontes.ui}`;
      ctx.fillStyle = cores.texto3;
      ctx.textBaseline = 'top';
      ctx.textAlign = 'center';
      for (const x of [1, 5, 20]) {
        const px = x0 + pos(x) * lw;
        ctx.fillText(`${x}×`, px, y0 + 3);
        ctx.fillRect(Math.round(px), y0 - 6, 1, 8);
      }
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.font = `12.5px ${fontes.ui}`;
      ctx.fillStyle = cores.texto2;
      ctx.fillText('densidade de raios', x0, y0 - 10);
    }

    // ——— leitura junto ao dedo durante o arraste
    if (!limpo && this.arraste?.tipo === 'alca') {
      const id = this.arraste.id;
      const al = alcas.find((a) => a.id === id);
      let simb = '';
      let txt = '';
      if (id.startsWith('abertura')) {
        simb = 'a';
        txt = `= ${fmtFixo(e.a, 1)} mm   f/${fmtFixo(f / (2 * e.a), 2)}`;
      } else if (id === 'anteparo') {
        simb = 'z';
        const d = cfg.zs - f;
        txt = `= ${fmtFixo(cfg.zs, 2)} mm   ${Math.abs(d) < 5e-7 ? 'em F' : `F ${d > 0 ? '+' : '−'} ${comprimentoMm(Math.abs(d), 3)}`}`;
      } else if (id === 'curvatura') {
        simb = 'R';
        txt = `= ${fmtFixo(R, 1)} mm   f = ${fmtFixo(f, 1)} mm`;
      } else if (id === 'incidencia') {
        simb = 'α';
        txt = `= ${fmtFixo(v.alfa as number, 2)}°`;
      } else if (id.startsWith('feixe')) {
        simb = 'w';
        txt = `= ${fmtFixo(v.w as number, 1)} mm`;
      } else if (id === 'prova' && prova) {
        simb = 'h';
        txt = `= ${fmtFixo(prova.u, 2)} mm   ρ = ${fmtFixo(prova.rho, 3)}`;
      }
      if (al && txt) {
        // para o anteparo a leitura acompanha o dedo; nas demais, a alça
        const p = [...this.ponteiros.values()][0];
        const ax = al.x;
        const ay = id === 'anteparo' && p ? p.y : al.y;
        this.pilula(ctx, ax, ay, simb, txt);
      }
    }
    if (!limpo) this.alcas = alcas;
  }

  private pilula(ctx: CanvasRenderingContext2D, x: number, y: number, simb: string, txt: string) {
    ctx.save();
    ctx.font = `italic 16px ${fontes.mat}`;
    const ws = ctx.measureText(simb).width;
    ctx.font = `500 14px ${fontes.ui}`;
    const wt = ctx.measureText(txt).width;
    const w = ws + wt + 24;
    const h = 28;
    let px = x - w - 22;
    if (px < 8) px = x + 22;
    if (px + w > this.w - 8) px = this.w - 8 - w;
    let py = y - h - 20;
    if (py < 8) py = y + 24;
    ctx.fillStyle = 'rgba(16,20,26,0.95)';
    ctx.strokeStyle = cores.linhaForte;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(Math.round(px) + 0.5, Math.round(py) + 0.5, w, h, 5);
    ctx.fill();
    ctx.stroke();
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = cores.texto;
    ctx.font = `italic 16px ${fontes.mat}`;
    ctx.fillText(simb, px + 10, py + h / 2);
    ctx.font = `500 14px ${fontes.ui}`;
    ctx.fillText(txt, px + 15 + ws, py + h / 2 + 0.5);
    ctx.restore();
  }

  // ————— exportação —————

  /** Imagem limpa da cena (sem alças nem dicas), com legenda dos parâmetros. */
  async exportarPNG(escala = 2): Promise<Blob> {
    const sol = this.s.solucao.peek();
    const v = this.s.valores.peek();
    const rodape = 34;
    const c = document.createElement('canvas');
    c.width = Math.round(this.w * escala);
    c.height = Math.round((this.h + rodape) * escala);
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = cores.fundo;
    ctx.fillRect(0, 0, c.width, c.height);
    // camadas na mesma ordem da tela
    const interagindo = this.interagindo;
    this.interagindo = false;
    this.chaveFundo = '';
    this.desenharFundo();
    this.desenharLuz(sol, v.luz as boolean, v.exposicao as number, true);
    ctx.drawImage(this.cFundo, 0, 0, this.w * escala, this.h * escala);
    ctx.drawImage(this.cLuz, 0, 0, this.w * escala, this.h * escala);
    this.interagindo = interagindo;
    ctx.setTransform(escala, 0, 0, escala, 0, 0);
    const realce = this.realce;
    this.realce = null;
    this.pintar(ctx, sol, 99, true);
    this.realce = realce;
    this.chaveLuz = '';
    // legenda
    ctx.fillStyle = cores.painel;
    ctx.fillRect(0, this.h, this.w, rodape);
    ctx.fillStyle = cores.linha;
    ctx.fillRect(0, this.h, this.w, 1);
    const k = v.kappa as number;
    const sup = k === 0 ? 'esférico' : k === -1 ? 'parabólico' : `cônico κ = ${fmtFixo(k, 3)}`;
    const partes = [
      `Espelho ${sup}`,
      `R = ${fmtFixo(v.R as number, 1)} mm`,
      `a = ${fmtFixo(v.a as number, 1)} mm`,
      `α = ${fmtFixo(v.alfa as number, 2)}°`,
      `anteparo em z = ${fmtFixo(v.zs as number, 2)} mm`,
    ];
    if (!Number.isNaN(sol.anteparo.W)) partes.push(`W = ${comprimentoMm(sol.anteparo.W, 4)}`);
    ctx.font = `13px ${fontes.ui}`;
    ctx.fillStyle = cores.texto2;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    let txt = partes.join('    ');
    while (ctx.measureText(txt).width > this.w - 150 && partes.length > 2) {
      partes.pop();
      txt = partes.join('    ');
    }
    ctx.fillText(txt, 12, this.h + rodape / 2 + 1);
    ctx.textAlign = 'right';
    ctx.fillStyle = cores.texto3;
    ctx.fillText('seção meridional', this.w - 12, this.h + rodape / 2 + 1);
    this.pedir();
    return canvasParaBlob(c);
  }

  /** posições das alças em px CSS relativos à cena (usado pelos testes de navegador) */
  posicoesAlcas(): { id: string; x: number; y: number }[] {
    return this.alcas.map((a) => ({ id: a.id, x: a.x, y: a.y }));
  }

  /** estado atual da configuração (para o painel de diagnóstico) */
  get config() {
    return configDeValores(this.s.valores.peek(), this.s.extras.peek());
  }
}
