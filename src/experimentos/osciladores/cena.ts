/**
 * Osciladores — cena.
 *
 * Em cima, o sistema mecânico em escala (parede, molas, massas). Embaixo, um
 * registrador: o tempo corre para baixo e a posição de cada massa deixa um
 * traço na MESMA escala horizontal da cena, de modo que o traço sai
 * literalmente de baixo da massa. Tudo é lido do histórico do motor no passo
 * do cursor.
 */
import { effect } from '@preact/signals';
import { fmtFixo, passoRedondo } from '../../nucleo/formato';
import { cores, fontes, alfa as rgba } from '../../ui/tema';
import { canvasParaBlob } from '../../ui/exportar';
import type { Motor } from './motor';
import { energia } from './modelo';

/** meia distância entre as posições de equilíbrio e posição das paredes (m) */
const D_EQ = 0.36;
const PAREDE = 1.02;

export const corMassa = [cores.serie1, cores.serie2] as const;

type Arraste = { massa: 0 | 1; ponteiro: number; off: number; rodava: boolean };

export class CenaOsc {
  private c: HTMLCanvasElement;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private pendente = 0;
  private descartes: (() => void)[] = [];
  private arraste: Arraste | null = null;
  private realce: -1 | 0 | 1 = -1;
  private pulso0 = performance.now();
  /** px por metro e posição em px do centro */
  private esc = 300;
  private xc = 0;
  private yMassa = 0;
  /** segundos de histórico visíveis no registrador */
  janelaTraco = 8;
  ultimoQuadroMs = 0;

  constructor(private el: HTMLElement, private motor: Motor) {
    this.c = document.createElement('canvas');
    el.appendChild(this.c);
    const ro = new ResizeObserver(() => this.medir());
    ro.observe(el);
    this.descartes.push(() => ro.disconnect());
    this.medir();
    this.descartes.push(effect(() => {
      void motor.cursor.value;
      void motor.versao.value;
      void motor.rodando.value;
      void motor.sessao.valores.value;
      // dentro do quadro do motor a cena é desenhada na hora: cena, gráficos e
      // leituras mostram o mesmo passo no mesmo quadro
      if (motor.noQuadro) this.desenharAgora();
      else this.pedir();
    }));
    const on = <K extends keyof HTMLElementEventMap>(t: K, f: (e: HTMLElementEventMap[K]) => void) => {
      el.addEventListener(t, f as EventListener);
      this.descartes.push(() => el.removeEventListener(t, f as EventListener));
    };
    on('pointerdown', (e) => this.aoBaixar(e));
    on('pointermove', (e) => this.aoMover(e));
    on('pointerup', (e) => this.aoSoltar(e));
    on('pointercancel', (e) => this.aoSoltar(e));
    on('pointerleave', () => {
      if (this.realce >= 0 && !this.arraste) {
        this.realce = -1;
        this.pedir();
      }
    });
    on('contextmenu', (e) => e.preventDefault());
    const fs = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (fs) Promise.all([fs.load(`italic 16px KaTeX_Math`), fs.load(`500 14px Barlow`), fs.load('13px Barlow')]).then(() => this.pedir(), () => {});
  }

  destruir() {
    cancelAnimationFrame(this.pendente);
    for (const d of this.descartes) d();
    this.c.remove();
  }

  private medir() {
    const r = this.el.getBoundingClientRect();
    this.w = Math.max(1, Math.round(r.width));
    this.h = Math.max(1, Math.round(r.height));
    this.dpr = Math.min(3, window.devicePixelRatio || 1);
    this.c.width = Math.round(this.w * this.dpr);
    this.c.height = Math.round(this.h * this.dpr);
    this.pedir();
  }

  pedir() {
    if (this.pendente) return;
    this.pendente = requestAnimationFrame(() => {
      this.pendente = 0;
      this.desenharAgora();
      if (performance.now() - this.pulso0 < 2400) this.pedir();
    });
  }

  private desenharAgora() {
    const t0 = performance.now();
    const ctx = this.c.getContext('2d')!;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    this.pintar(ctx, this.w, this.h, false);
    this.ultimoQuadroMs = performance.now() - t0;
  }

  private layout(w: number, h: number) {
    this.esc = Math.min((w - 24) / (2 * PAREDE + 0.12), 520);
    this.xc = w / 2;
    this.yMassa = Math.max(96, Math.min(h * 0.3, 190));
  }

  private X(m: number) {
    return this.xc + m * this.esc;
  }

  private ladoMassa(m: number) {
    // lado cresce devagar com a massa (m^(1/3) limitado), para caber entre as molas
    return (0.075 + 0.045 * Math.log(1 + m)) * this.esc;
  }

  private estado() {
    const s = this.motor.sim;
    const i = Math.min(this.motor.cursor.value, s.passos);
    return { i, x1: s.qEm(i, 0), x2: s.qEm(i, 1), v1: s.vEm(i, 0), v2: s.vEm(i, 1) };
  }

  /** centro (px) e meio lado de cada massa no instante do cursor */
  posicoesMassas(): { x: number; y: number; meio: number }[] {
    const e = this.estado();
    const p = this.motor.cfg.p;
    this.layout(this.w, this.h);
    return [
      { x: this.X(-D_EQ + e.x1), y: this.yMassa, meio: this.ladoMassa(p.m1) / 2 },
      { x: this.X(D_EQ + e.x2), y: this.yMassa, meio: this.ladoMassa(p.m2) / 2 },
    ];
  }

  // ————— interação: puxar uma massa —————

  private pos(e: PointerEvent) {
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private massaEm(x: number, y: number, toque: boolean): -1 | 0 | 1 {
    const ms = this.posicoesMassas();
    const folga = toque ? 20 : 8;
    let melhor: -1 | 0 | 1 = -1;
    let dm = Infinity;
    ms.forEach((m, k) => {
      const dx = Math.abs(x - m.x);
      const dy = Math.abs(y - m.y);
      if (dx <= m.meio + folga && dy <= m.meio + folga && dx < dm) {
        dm = dx;
        melhor = k as 0 | 1;
      }
    });
    return melhor;
  }

  private aoBaixar(e: PointerEvent) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (this.arraste) return;
    const p = this.pos(e);
    const k = this.massaEm(p.x, p.y, e.pointerType !== 'mouse');
    if (k < 0) return;
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      /* ponteiro sintético */
    }
    const rodava = this.motor.rodando.peek();
    this.motor.pausar();
    const s = this.motor.sessao;
    const est = this.estado();
    s.inicioGesto();
    // segurar a massa: as posições atuais viram condição inicial; a massa segurada fica em repouso
    const cm = (m: number) => Math.round(m * 1000) / 10;
    const v = s.valores.peek();
    const novo = {
      x1: Math.max(-25, Math.min(25, cm(est.x1))),
      x2: Math.max(-25, Math.min(25, cm(est.x2))),
      v1: k === 0 ? 0 : (v.v1 as number),
      v2: k === 1 ? 0 : (v.v2 as number),
    };
    if (est.i > 0) {
      // pegou em pleno movimento: a outra massa também parte do repouso, da posição em que estava
      novo.v1 = 0;
      novo.v2 = 0;
    }
    s.definir(novo);
    const ms = this.posicoesMassas();
    this.arraste = { massa: k as 0 | 1, ponteiro: e.pointerId, off: p.x - ms[k].x, rodava };
    this.realce = k;
    this.pedir();
    e.preventDefault();
  }

  private aoMover(e: PointerEvent) {
    const p = this.pos(e);
    const ar = this.arraste;
    if (!ar) {
      if (e.pointerType === 'mouse') {
        const k = this.massaEm(p.x, p.y, false);
        if (k !== this.realce) {
          this.realce = k;
          this.el.style.cursor = k >= 0 ? 'grab' : 'default';
          this.pedir();
        }
      }
      return;
    }
    if (ar.ponteiro !== e.pointerId) return;
    const eq = ar.massa === 0 ? -D_EQ : D_EQ;
    const x = (p.x - ar.off - this.xc) / this.esc - eq;
    const cmv = Math.round(x * 1000) / 10;
    this.motor.sessao.definir({ [ar.massa === 0 ? 'x1' : 'x2']: Math.max(-25, Math.min(25, cmv)) });
  }

  private aoSoltar(e: PointerEvent) {
    const ar = this.arraste;
    if (!ar || ar.ponteiro !== e.pointerId) return;
    this.arraste = null;
    this.motor.sessao.fimGesto();
    if (e.pointerType !== 'mouse') this.realce = -1;
    // soltar a massa inicia o movimento
    this.motor.tocar();
    this.pedir();
  }

  // ————— desenho —————

  private mola(ctx: CanvasRenderingContext2D, x0: number, x1: number, y: number, k: number, ativa: boolean) {
    const n = 11;
    const amp = 9;
    const ponta = Math.min(12, Math.abs(x1 - x0) * 0.12);
    const a = x0 + ponta;
    const b = x1 - ponta;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(a, y);
    for (let i = 0; i < n * 2; i++) {
      const t = (i + 0.5) / (n * 2);
      ctx.lineTo(a + (b - a) * t, y + (i % 2 ? amp : -amp));
    }
    ctx.lineTo(b, y);
    ctx.lineTo(x1, y);
    ctx.strokeStyle = ativa ? cores.equipamento : rgba(cores.gravado, 0.5);
    // a espessura cresce com a rigidez (escala logarítmica, 1 a 3 px)
    ctx.lineWidth = ativa ? 1 + 2 * Math.min(1, Math.log10(1 + k) / Math.log10(201)) : 1;
    ctx.lineJoin = 'round';
    if (!ativa) ctx.setLineDash([2, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private pintar(ctx: CanvasRenderingContext2D, w: number, h: number, limpo: boolean) {
    this.layout(w, h);
    const motor = this.motor;
    const s = motor.sim;
    const p = motor.cfg.p;
    const e = this.estado();
    const yM = this.yMassa;
    const X = (m: number) => this.X(m);
    const l1 = this.ladoMassa(p.m1);
    const l2 = this.ladoMassa(p.m2);
    const c1 = X(-D_EQ + e.x1);
    const c2 = X(D_EQ + e.x2);

    // ——— barra de energia: como a energia total se reparte agora
    {
      const en = energia(p, e.x1, e.x2, e.v1, e.v2);
      const E0 = s.energiaEm(0) || en.total || 1;
      // à direita: o canto esquerdo fica livre para o convite da predefinição
      const larg = Math.min(330, w * 0.42);
      const x0 = w - larg - 22;
      const y0 = 30;
      const total = Math.max(en.total, 1e-300);
      const partes = [
        { v: en.E1, cor: cores.serie1, nome: 'massa 1' },
        { v: en.Ec, cor: cores.serie3, nome: 'acoplamento' },
        { v: en.E2, cor: cores.serie2, nome: 'massa 2' },
      ];
      // a largura total acompanha E/E₀: se o integrador criar ou perder energia, a barra muda de tamanho
      const fator = Math.max(0, Math.min(1.5, total / E0));
      let x = x0;
      for (const q of partes) {
        const lw = (q.v / total) * larg * Math.min(1, fator);
        if (lw > 0.5) {
          ctx.fillStyle = q.cor;
          ctx.fillRect(x, y0, Math.max(0, lw - 2), 9);
        }
        x += lw;
      }
      ctx.strokeStyle = cores.linhaForte;
      ctx.lineWidth = 1;
      ctx.strokeRect(x0 - 3.5, y0 - 3.5, larg + 5, 16);
      ctx.font = `12.5px ${fontes.ui}`;
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = cores.texto2;
      ctx.textAlign = 'left';
      ctx.fillText('energia da massa 1', x0 - 3, y0 - 8);
      ctx.textAlign = 'right';
      ctx.fillText('massa 2', x0 + larg + 2, y0 - 8);
      ctx.textAlign = 'center';
      if (larg > 300) ctx.fillText('acoplamento', x0 + larg / 2 + 34, y0 - 8);
    }

    // ——— paredes
    const xpe = X(-PAREDE);
    const xpd = X(PAREDE);
    for (const [x, sinal] of [[xpe, -1], [xpd, 1]] as const) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(sinal < 0 ? x - 12 : x, yM - 46, 12, 92);
      ctx.fillStyle = '#0e1319';
      ctx.fill();
      ctx.clip();
      ctx.strokeStyle = rgba(cores.gravado, 0.4);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let k = -100; k < 100; k += 7) {
        ctx.moveTo(x - 14, yM + k + 14);
        ctx.lineTo(x + 14, yM + k - 14);
      }
      ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = cores.equipamento;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, yM - 46);
      ctx.lineTo(x, yM + 46);
      ctx.stroke();
    }

    // ——— trilho e posições de equilíbrio
    ctx.strokeStyle = rgba(cores.gravado, 0.5);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(xpe, yM + 46.5);
    ctx.lineTo(xpd, yM + 46.5);
    ctx.stroke();
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    for (const eq of [-D_EQ, D_EQ]) {
      const x = Math.round(X(eq)) + 0.5;
      ctx.moveTo(x, yM - 58);
      ctx.lineTo(x, h - 8);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // ——— molas
    this.mola(ctx, xpe, c1 - l1 / 2, yM, p.k1, true);
    this.mola(ctx, c1 + l1 / 2, c2 - l2 / 2, yM, p.kc, p.kc > 0);
    this.mola(ctx, c2 + l2 / 2, xpd, yM, p.k2, true);
    ctx.font = `italic 15px ${fontes.mat}`;
    ctx.fillStyle = cores.texto2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const rotMola = (txt: string, sub: string, x: number) => {
      ctx.font = `italic 15px ${fontes.mat}`;
      ctx.fillText(txt, x - 3, yM - 16);
      ctx.font = `italic 11px ${fontes.mat}`;
      ctx.fillText(sub, x + 5, yM - 12);
    };
    rotMola('k', '1', (xpe + c1 - l1 / 2) / 2);
    rotMola('k', 'c', (c1 + l1 / 2 + c2 - l2 / 2) / 2);
    rotMola('k', '2', (c2 + l2 / 2 + xpd) / 2);

    // ——— massas
    const massa = (k: 0 | 1, cx: number, lado: number, x: number) => {
      const ativo = this.realce === k && !limpo;
      const cor = corMassa[k];
      if (!limpo) {
        const pulso = (performance.now() - this.pulso0) / 1000;
        if (pulso < 2.4 && e.i === 0 && !motor.rodando.peek()) {
          const fase = (pulso % 1.2) / 1.2;
          ctx.strokeStyle = rgba(cores.selecao, 0.5 * (1 - fase));
          ctx.lineWidth = 1.5;
          ctx.strokeRect(cx - lado / 2 - 4 - 12 * fase, yM - lado / 2 - 4 - 12 * fase, lado + 8 + 24 * fase, lado + 8 + 24 * fase);
        }
      }
      ctx.fillStyle = cor;
      ctx.beginPath();
      ctx.roundRect(cx - lado / 2, yM - lado / 2, lado, lado, 3);
      ctx.fill();
      if (ativo) {
        ctx.strokeStyle = cores.selecao;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.fillStyle = '#05070a';
      ctx.font = `italic 600 17px ${fontes.mat}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('m', cx - 3, yM);
      ctx.font = `600 11px ${fontes.ui}`;
      ctx.fillText(String(k + 1), cx + 8, yM + 6);
      // deslocamento em relação ao equilíbrio
      const eq = X(k === 0 ? -D_EQ : D_EQ);
      const yv = yM - lado / 2 - 13;
      if (Math.abs(cx - eq) > 2) {
        ctx.strokeStyle = cor;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(eq, yv);
        ctx.lineTo(cx, yv);
        const sn = Math.sign(cx - eq);
        ctx.moveTo(cx - sn * 6, yv - 4);
        ctx.lineTo(cx, yv);
        ctx.lineTo(cx - sn * 6, yv + 4);
        ctx.stroke();
      }
      ctx.font = `13px ${fontes.ui}`;
      ctx.fillStyle = cores.texto;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`${x >= 0 ? '+' : '−'}${fmtFixo(Math.abs(x * 100), 1)} cm`, cx, yv - 8);
    };
    massa(0, c1, l1, e.x1);
    massa(1, c2, l2, e.x2);

    // ——— régua em cm (mesma escala do registrador)
    const yR = yM + 47;
    {
      const passoCm = passoRedondo(70 / this.esc * 100);
      ctx.strokeStyle = rgba(cores.gravado, 0.8);
      ctx.fillStyle = cores.texto3;
      ctx.font = `11.5px ${fontes.ui}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const nMarcas = Math.floor(25 / passoCm + 1e-9);
      for (const eq of [-D_EQ, D_EQ]) {
        for (let q = -nMarcas; q <= nMarcas; q++) {
          const cmv = q * passoCm;
          const x = Math.round(X(eq + cmv / 100)) + 0.5;
          ctx.moveTo(x, yR);
          ctx.lineTo(x, yR + (q === 0 ? 7 : 4));
          if (q === 0 || q % 2 === 0 || passoCm >= 10) ctx.fillText(q === 0 ? '0' : `${cmv > 0 ? '+' : '−'}${Math.abs(cmv)}`, x, yR + 9);
        }
      }
      ctx.stroke();
      ctx.textAlign = 'left';
      ctx.fillText('cm', X(D_EQ + 0.25) + 12, yR + 9);
    }

    // ——— registrador: o tempo corre para baixo
    const y0 = yR + 30;
    const yFim = h - (limpo ? 8 : 58);
    if (yFim - y0 > 40) {
      const dt = s.dt;
      const T = this.janelaTraco;
      const pxPorS = (yFim - y0) / T;
      // marcas de tempo
      ctx.font = `11.5px ${fontes.ui}`;
      ctx.fillStyle = cores.texto3;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.strokeStyle = cores.linha;
      ctx.lineWidth = 1;
      const tAgora = e.i * dt;
      const passoT = passoRedondo(52 / pxPorS);
      ctx.beginPath();
      for (let k = 0; k * passoT <= T + 1e-9; k++) {
        const y = Math.round(y0 + k * passoT * pxPorS) + 0.5;
        ctx.moveTo(xpe, y);
        ctx.lineTo(xpd, y);
        const tt = tAgora - k * passoT;
        if (tt >= -1e-9) ctx.fillText(k === 0 ? `t = ${fmtFixo(tAgora, 2)} s` : `${fmtFixo(Math.max(0, tt), 2)} s`, xpe + 8, y - 3);
      }
      ctx.stroke();
      // traços: do instante do cursor para o passado
      const nJanela = Math.min(e.i, Math.ceil(T / dt));
      const salto = Math.max(1, Math.floor(nJanela / ((yFim - y0) * 2)));
      for (const k of [0, 1] as const) {
        const eq = k === 0 ? -D_EQ : D_EQ;
        ctx.strokeStyle = corMassa[k];
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(X(eq + s.qEm(e.i, k)), y0);
        for (let j = salto; j <= nJanela; j += salto) {
          ctx.lineTo(X(eq + s.qEm(e.i - j, k)), y0 + j * dt * pxPorS);
        }
        ctx.stroke();
        // ligação entre a massa e a ponta do traço
        ctx.strokeStyle = rgba(corMassa[k], 0.55);
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        const cx = k === 0 ? c1 : c2;
        ctx.moveTo(cx, yM + (k === 0 ? l1 : l2) / 2);
        ctx.lineTo(cx, y0);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = corMassa[k];
        ctx.beginPath();
        ctx.arc(cx, y0, 3.5, 0, 2 * Math.PI);
        ctx.fill();
      }
    }

    // ——— leitura durante o arraste
    if (this.arraste && !limpo) {
      const k = this.arraste.massa;
      const cx = k === 0 ? c1 : c2;
      const v = motor.sessao.valores.peek();
      const txt = `(0) = ${fmtFixo(v[k === 0 ? 'x1' : 'x2'] as number, 1)} cm, solta do repouso`;
      ctx.font = `500 14px ${fontes.ui}`;
      const wt = ctx.measureText(txt).width;
      const wb = wt + 40;
      let px = cx - wb / 2;
      px = Math.max(8, Math.min(w - wb - 8, px));
      const py = yM + (k === 0 ? l1 : l2) / 2 + 60;
      ctx.fillStyle = 'rgba(16,20,26,0.95)';
      ctx.strokeStyle = cores.linhaForte;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(px + 0.5, py + 0.5, wb, 28, 5);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = cores.texto;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = `italic 16px ${fontes.mat}`;
      ctx.fillText('x', px + 10, py + 14);
      ctx.font = `italic 11px ${fontes.mat}`;
      ctx.fillText(String(k + 1), px + 19, py + 19);
      ctx.font = `500 14px ${fontes.ui}`;
      ctx.fillText(txt, px + 27, py + 14.5);
    }
  }

  async exportarPNG(escala = 2): Promise<Blob> {
    const rodape = 34;
    const c = document.createElement('canvas');
    c.width = Math.round(this.w * escala);
    c.height = Math.round((this.h + rodape) * escala);
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = cores.fundo;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.setTransform(escala, 0, 0, escala, 0, 0);
    this.pintar(ctx, this.w, this.h, true);
    ctx.fillStyle = cores.painel;
    ctx.fillRect(0, this.h, this.w, rodape);
    ctx.fillStyle = cores.linha;
    ctx.fillRect(0, this.h, this.w, 1);
    const p = this.motor.cfg.p;
    const v = this.motor.sessao.valores.peek();
    const txt = [
      `m₁ = ${fmtFixo(p.m1, 2)} kg`, `m₂ = ${fmtFixo(p.m2, 2)} kg`,
      `k₁ = ${fmtFixo(p.k1, 1)}`, `k_c = ${fmtFixo(p.kc, 1)}`, `k₂ = ${fmtFixo(p.k2, 1)} N/m`,
      `t = ${fmtFixo(this.motor.t, 3)} s`, `${String(v.integrador)}, Δt = ${fmtFixo(v.dt as number, 1)} ms`,
    ].join('    ');
    ctx.font = `13px ${fontes.ui}`;
    ctx.fillStyle = cores.texto2;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(txt, 12, this.h + rodape / 2 + 1);
    return canvasParaBlob(c);
  }
}
