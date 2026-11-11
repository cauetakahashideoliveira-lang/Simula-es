/**
 * Bancada de óptica — instrumentos de análise (gráficos).
 * Cada gráfico desenha o que `analise.ts` mediu; nenhum número nasce aqui.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { RefObject } from 'preact';
import type { Sessao } from '../../nucleo/sessao';
import { comprimentoMm, fmtComprimentoMm, fmtFixo, fmtSig } from '../../nucleo/formato';
import { Medida, useTamanho, Icone } from '../../ui/componentes';
import { areaPadrao, desenharEixos, etiqueta, intervalo, mapa, preparar, type Area } from '../../ui/grafico';
import { cores, fontes, tracos, alfa as rgba } from '../../ui/tema';
import { perfil, pupilaDeU, type Solucao } from './analise';

type PropsI = { sessao: Sessao<Solucao> };

export const INSTRUMENTOS = [
  { id: 'perfil', titulo: 'Perfil no anteparo' },
  { id: 'mancha', titulo: 'Mancha 3D' },
  { id: 'aberracao', titulo: 'Aberração longitudinal' },
  { id: 'varredura', titulo: 'Varredura do anteparo' },
] as const;

/** unidade de exibição para um intervalo de comprimentos em mm */
function unidadePara(mm: number): { un: string; fator: number } {
  const v = fmtComprimentoMm(mm);
  return { un: v.unidade, fator: v.fator };
}

/**
 * Semijanela comum ao perfil e à mancha.
 * Manual (extras.janela) ou automática. A automática só cresce: trocar a
 * superfície ou fechar a abertura não reamplia o gráfico sozinho, para que a
 * comparação entre dois estados seja feita na mesma escala. "Ajustar" refaz.
 */
function useJanela(sessao: Sessao<Solucao>, necessaria: number): { semi: number; auto: boolean; ajustar: () => void; mult: (f: number) => void } {
  const manual = sessao.extras.value.janela;
  const guardada = useRef(0);
  const [, redesenhar] = useState(0);
  const ciclo = sessao.pedidoEnquadrar.value;
  const cicloVisto = useRef(ciclo);
  if (cicloVisto.current !== ciclo) {
    cicloVisto.current = ciclo;
    guardada.current = 0;
  }
  const R = sessao.valores.value.R as number;
  const minimo = 1e-7 * R;
  const pedida = Math.max(minimo, necessaria * 1.3);
  if (!(guardada.current >= pedida)) guardada.current = pedida;
  const semi = typeof manual === 'number' && manual > 0 ? manual : guardada.current;
  return {
    semi,
    auto: !(typeof manual === 'number' && manual > 0),
    ajustar: () => {
      guardada.current = pedida;
      sessao.definirExtras({ janela: null });
      redesenhar((n) => n + 1);
    },
    mult: (f) => sessao.definirExtras({ janela: Number((semi * f).toPrecision(3)) }),
  };
}

function ControleJanela({ j }: { j: ReturnType<typeof useJanela> }) {
  return (
    <div class="acoes">
      <span style="flex:1">Janela ±{comprimentoMm(j.semi, 3)}{j.auto ? '' : ' (fixa)'}</span>
      <button class="btn" title="Ampliar (janela menor)" aria-label="Ampliar o gráfico" onClick={() => j.mult(0.5)}><Icone.mais /></button>
      <button class="btn" title="Reduzir (janela maior)" aria-label="Reduzir o gráfico" onClick={() => j.mult(2)}><Icone.menos /></button>
      <button class="btn" title="Ajustar a janela à distribuição atual" onClick={j.ajustar}>Ajustar</button>
    </div>
  );
}

/** posição do ponteiro dentro do elemento, ou null */
function usePonteiro(ref: RefObject<HTMLElement | null>, aoArrastar?: (x: number, y: number, fase: 'inicio' | 'mover' | 'fim') => void) {
  const [p, setP] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let baixo = false;
    const pos = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const down = (e: PointerEvent) => {
      baixo = true;
      try { el.setPointerCapture(e.pointerId); } catch { /* sintético */ }
      const q = pos(e);
      setP(q);
      aoArrastar?.(q.x, q.y, 'inicio');
    };
    const move = (e: PointerEvent) => {
      const q = pos(e);
      setP(q);
      if (baixo) aoArrastar?.(q.x, q.y, 'mover');
    };
    const up = (e: PointerEvent) => {
      if (baixo) aoArrastar?.(0, 0, 'fim');
      baixo = false;
      if (e.pointerType !== 'mouse') setP(null);
    };
    const leave = () => { if (!baixo) setP(null); };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', leave);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('pointerleave', leave);
    };
  });
  return p;
}

const textoCurto = (ctx: CanvasRenderingContext2D, t: string, x: number, y: number, cor: string, align: CanvasTextAlign = 'left') => {
  ctx.font = `12.5px ${fontes.ui}`;
  ctx.fillStyle = cor;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(t, x, y);
};

// ————— comparação com o outro estado guardado —————

const cacheFantasma = new WeakMap<object, Solucao>();
const COR_FANTASMA = cores.neutro;
const TRACO_FANTASMA = [4, 3];

/**
 * O outro estado guardado (A ou B), resolvido para servir de referência nos
 * gráficos: com o estado atual igual a A, compara com B, e vice-versa; com um
 * estado que não é nenhum dos dois, compara com A (ou com B, se só ele existir).
 * A solução fica em cache enquanto o estado guardado não for regravado.
 */
export function useFantasma(sessao: Sessao<Solucao>): { nome: 'A' | 'B'; sol: Solucao } | null {
  const g = sessao.guardados.value;
  const atual = sessao.guardadoAtivo.value;
  const nome = atual === 'A' ? (g.B ? 'B' : null) : atual === 'B' ? (g.A ? 'A' : null) : g.A ? 'A' : g.B ? 'B' : null;
  if (!nome) return null;
  const est = g[nome]!;
  let sol = cacheFantasma.get(est);
  if (!sol) {
    sol = sessao.def.resolver(est.valores, est.extras);
    cacheFantasma.set(est, sol);
  }
  return { nome, sol };
}

function LegendaFantasma({ f }: { f: { nome: string } | null }) {
  return f ? <span data-fantasma={f.nome}><i style={`border-color:${COR_FANTASMA};border-top-style:dashed`} />estado {f.nome} (guardado)</span> : null;
}

// ————— perfil transversal —————

function Perfil({ sessao }: PropsI) {
  const sol = sessao.solucao.value;
  const fant = useFantasma(sessao);
  const [ref, tam] = useTamanho<HTMLDivElement>();
  const canvas = useRef<HTMLCanvasElement>(null);
  const m = sol.anteparo;
  const centro = sol.imagem.y * (sol.cfg.zs / sol.f);
  const necessaria = m.validos ? Math.max(Math.abs(m.yMin - centro), Math.abs(m.yMax - centro)) : 0;
  const j = useJanela(sessao, necessaria);
  const ptr = usePonteiro(ref);

  useEffect(() => {
    const c = canvas.current;
    if (!c || tam.w < 40 || tam.h < 40) return;
    const ctx = preparar(c, tam.w, tam.h);
    if (!ctx) return;
    const a = areaPadrao(tam.w, tam.h, 48, 16, 24, 38);
    const nBins = Math.max(24, Math.min(240, Math.floor(a.w / 3)));
    const p = perfil(sol.leque, sol.cfg.H, centro, j.semi, nBins);
    let cMax = 0;
    for (let k = 0; k < nBins; k++) cMax = Math.max(cMax, p.C[k]);
    const { un, fator } = unidadePara(j.semi);
    const ex = { min: centro - j.semi, max: centro + j.semi, titulo: `y no anteparo (${un})`, fator };
    const ey = { min: 0, max: cMax > 0 ? cMax * 1.12 : 1, titulo: 'concentração C (feixe incidente = 1)' };
    desenharEixos(ctx, a, ex, ey, { gradeX: false, zeroX: false });
    const X = mapa(ex.min, ex.max, a.x, a.x + a.w);
    const Y = mapa(ey.min, ey.max, a.y + a.h, a.y);
    // colunas finas, ancoradas na base
    ctx.fillStyle = rgba(cores.luz, 0.92);
    const lw = Math.max(1, a.w / nBins - 1);
    for (let k = 0; k < nBins; k++) {
      if (p.C[k] <= 0) continue;
      const x = X(p.bordas[k]) + 0.5;
      const y = Y(p.C[k]);
      ctx.fillRect(x, Math.min(y, a.y + a.h - 1), lw, Math.max(1, a.y + a.h - y));
    }
    // outro estado guardado: contorno em degraus, mesma janela e mesmos intervalos
    if (fant) {
      const pf = perfil(fant.sol.leque, fant.sol.cfg.H, centro, j.semi, nBins);
      let k0 = -1, k1 = -1;
      for (let k = 0; k < nBins; k++) if (pf.C[k] > 0) { if (k0 < 0) k0 = k; k1 = k; }
      if (k0 >= 0) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(a.x, a.y, a.w, a.h);
        ctx.clip();
        ctx.strokeStyle = COR_FANTASMA;
        ctx.lineWidth = 1.4;
        ctx.setLineDash(TRACO_FANTASMA);
        ctx.beginPath();
        ctx.moveTo(X(pf.bordas[k0]), Y(0));
        for (let k = k0; k <= k1; k++) {
          ctx.lineTo(X(pf.bordas[k]), Y(pf.C[k]));
          ctx.lineTo(X(pf.bordas[k + 1]), Y(pf.C[k]));
        }
        ctx.lineTo(X(pf.bordas[k1 + 1]), Y(0));
        ctx.stroke();
        ctx.restore();
      }
    }
    // referência teórica: imagem paraxial
    const xf = X(centro);
    ctx.strokeStyle = cores.teoria;
    ctx.lineWidth = 1.2;
    ctx.setLineDash(tracos.teoria as unknown as number[]);
    ctx.beginPath();
    ctx.moveTo(Math.round(xf) + 0.5, a.y);
    ctx.lineTo(Math.round(xf) + 0.5, a.y + a.h);
    ctx.stroke();
    ctx.setLineDash([]);
    // cota da largura total W
    if (m.validos) {
      const x0 = Math.max(a.x, Math.min(a.x + a.w, X(m.yMin)));
      const x1 = Math.max(a.x, Math.min(a.x + a.w, X(m.yMax)));
      const yc = a.y + 7;
      ctx.strokeStyle = cores.selecao;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(x0) + 0.5, yc - 4);
      ctx.lineTo(Math.round(x0) + 0.5, yc + 4);
      ctx.moveTo(Math.round(x1) + 0.5, yc - 4);
      ctx.lineTo(Math.round(x1) + 0.5, yc + 4);
      ctx.moveTo(x0, yc + 0.5);
      ctx.lineTo(x1, yc + 0.5);
      ctx.stroke();
      const rot = `W = ${comprimentoMm(m.W, 4)}`;
      ctx.font = `12.5px ${fontes.ui}`;
      const tw = ctx.measureText(rot).width;
      // ao lado da cota se couber; senão logo abaixo dela, sobre fundo escuro
      if (x1 + 8 + tw < a.x + a.w) textoCurto(ctx, rot, x1 + 8, yc + 1, cores.selecao);
      else if (x0 - 8 - tw > a.x) textoCurto(ctx, rot, x0 - 8 - tw, yc + 1, cores.selecao);
      else {
        const xm = Math.max(a.x + 4, Math.min(a.x + a.w - tw - 4, (x0 + x1) / 2 + 14));
        ctx.fillStyle = 'rgba(12,15,19,0.9)';
        ctx.fillRect(xm - 4, yc + 6, tw + 8, 17);
        textoCurto(ctx, rot, xm, yc + 15, cores.selecao);
      }
    } else {
      textoCurto(ctx, 'Nenhum raio refletido atinge o anteparo nesta posição.', a.x + a.w / 2, a.y + a.h / 2, cores.texto2, 'center');
    }
    // raio de prova
    const pr = sol.prova;
    if (pr && pr.yAnteparo !== null && pr.noAnteparo) {
      const x = X(pr.yAnteparo);
      if (x >= a.x && x <= a.x + a.w) {
        ctx.strokeStyle = cores.selecao;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, a.y + 16);
        ctx.lineTo(x, a.y + a.h);
        ctx.stroke();
        ctx.fillStyle = cores.selecao;
        ctx.beginPath();
        ctx.arc(x, a.y + a.h, 3.2, 0, 2 * Math.PI);
        ctx.fill();
      }
    }
    if (p.fora > 0) textoCurto(ctx, `${p.fora} raios fora da janela`, a.x + a.w - 4, a.y + a.h - 10, cores.alerta, 'right');
    // leitura sob o cursor
    if (ptr && ptr.x >= a.x && ptr.x <= a.x + a.w && ptr.y >= a.y - 6 && ptr.y <= a.y + a.h + 6) {
      const k = Math.max(0, Math.min(nBins - 1, Math.floor(((ptr.x - a.x) / a.w) * nBins)));
      const yc = (p.bordas[k] + p.bordas[k + 1]) / 2;
      const xc = X(yc);
      ctx.strokeStyle = rgba(cores.texto, 0.5);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(xc) + 0.5, a.y);
      ctx.lineTo(Math.round(xc) + 0.5, a.y + a.h);
      ctx.stroke();
      etiqueta(ctx, [`y = ${comprimentoMm(yc, 4)}`, `C = ${fmtSig(p.C[k], 3)}×`, `intervalo: ${comprimentoMm(p.dy, 3)}`], xc, Math.max(a.y + 30, Y(p.C[k])), a);
    }
  }, [sol, fant?.sol, tam.w, tam.h, j.semi, ptr?.x, ptr?.y]);

  return (
    <>
      <div class="grafico" ref={ref} data-instr="perfil"><canvas ref={canvas} /></div>
      <div class="lateral">
        <ControleJanela j={j} />
        {fant && <div class="legenda"><span><i style={`border-color:${cores.luz}`} />atual</span><LegendaFantasma f={fant} /></div>}
        <div class="medidas">
          <Medida simbolo="W" nome="largura total" valor={m.validos ? comprimentoMm(m.W, 4) : '—'} destaque def="y_máx − y_mín dos raios do leque de medida no anteparo." />
          {fant && <Medida simbolo="W" nome={`no estado ${fant.nome}`} valor={fant.sol.anteparo.validos ? comprimentoMm(fant.sol.anteparo.W, 4) : '—'} />}
          <Medida simbolo="\sigma_y" nome="desvio RMS" valor={m.validos ? comprimentoMm(m.rms, 4) : '—'} />
          <Medida nome="raios no anteparo" valor={`${fmtFixo(100 * m.fracao, 1)} %`} def={`${m.validos} de ${m.total} raios meridionais, pesos iguais por unidade de altura do feixe.`} />
        </div>
      </div>
    </>
  );
}

// ————— mancha 3D —————

function Mancha({ sessao }: PropsI) {
  const sol = sessao.solucao.value;
  const fant = useFantasma(sessao);
  const [ref, tam] = useTamanho<HTMLDivElement>();
  const canvas = useRef<HTMLCanvasElement>(null);
  const M = sol.mancha();
  const yc = sol.imagem.y * (sol.cfg.zs / sol.f);
  let nec = 0;
  if (M.validos) nec = Math.hypot(M.cx, M.cy - yc) + M.rMax;
  const j = useJanela(sessao, nec);
  const ptr = usePonteiro(ref);

  useEffect(() => {
    const c = canvas.current;
    if (!c || tam.w < 40 || tam.h < 40) return;
    const ctx = preparar(c, tam.w, tam.h);
    if (!ctx) return;
    const { un, fator } = unidadePara(j.semi);
    // quadro quadrado à esquerda (escalas iguais), energia contida à direita
    const lado = Math.max(40, Math.min(tam.h - 24 - 38, tam.w * 0.5 - 60));
    const a: Area = { x: 50, y: 24, w: lado, h: lado };
    const ex = { min: -j.semi, max: j.semi, titulo: `x (${un})`, fator, alvo: 4 };
    const ey = { min: yc - j.semi, max: yc + j.semi, titulo: `y (${un}), mesma escala de x`, fator, alvo: 4 };
    desenharEixos(ctx, a, ex, ey, {});
    const X = mapa(ex.min, ex.max, a.x, a.x + a.w);
    const Y = mapa(ey.min, ey.max, a.y + a.h, a.y);
    ctx.save();
    ctx.beginPath();
    ctx.rect(a.x, a.y, a.w, a.h);
    ctx.clip();
    // imagem paraxial
    ctx.strokeStyle = cores.teoria;
    ctx.lineWidth = 1.2;
    const xi = X(0), yi = Y(sol.imagem.y * (sol.cfg.zs / sol.f));
    ctx.beginPath();
    ctx.moveTo(xi, yi - 6); ctx.lineTo(xi + 6, yi); ctx.lineTo(xi, yi + 6); ctx.lineTo(xi - 6, yi); ctx.closePath();
    ctx.stroke();
    // impactos
    ctx.fillStyle = rgba(cores.luz, M.n > 6000 ? 0.4 : 0.62);
    const r = M.n > 6000 ? 1 : 1.35;
    for (let i = 0; i < M.n; i++) {
      if (!M.valido[i]) continue;
      const x = X(M.x[i]);
      const y = Y(M.y[i]);
      ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    if (M.validos) {
      const cx = X(M.cx), cy = Y(M.cy);
      const esc = a.w / (2 * j.semi);
      ctx.strokeStyle = cores.selecao;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(0.5, M.rRms * esc), 0, 2 * Math.PI);
      ctx.stroke();
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(0.5, M.r80 * esc), 0, 2 * Math.PI);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(cx - 5, cy); ctx.lineTo(cx + 5, cy); ctx.moveTo(cx, cy - 5); ctx.lineTo(cx, cy + 5);
      ctx.stroke();
    }
    ctx.restore();
    if (!M.validos) textoCurto(ctx, 'Nenhum raio no anteparo.', a.x + a.w / 2, a.y + a.h / 2, cores.texto2, 'center');

    // energia contida: fração dos raios dentro do raio r em torno do centroide
    const b: Area = { x: a.x + a.w + 62, y: 24, w: tam.w - (a.x + a.w + 62) - 16, h: tam.h - 24 - 38 };
    let leitura: string[] | null = null;
    if (b.w > 90 && M.validos) {
      const d = new Float64Array(M.validos);
      let k = 0;
      for (let i = 0; i < M.n; i++) if (M.valido[i]) d[k++] = Math.hypot(M.x[i] - M.cx, M.y[i] - M.cy);
      d.sort();
      const MF = fant ? fant.sol.mancha() : null;
      const rmax = Math.max(M.rMax, MF && MF.validos ? MF.rMax : 0, 1e-12);
      const u2 = unidadePara(rmax);
      const bx = { min: 0, max: rmax * 1.04, titulo: `raio em torno do centroide (${u2.un})`, fator: u2.fator };
      const by = { min: 0, max: 1, titulo: 'fração da potência contida', alvo: 4 };
      desenharEixos(ctx, b, bx, by, {});
      const BX = mapa(bx.min, bx.max, b.x, b.x + b.w);
      const BY = mapa(0, 1, b.y + b.h, b.y);
      if (MF && MF.validos) {
        const df = new Float64Array(MF.validos);
        let q = 0;
        for (let i = 0; i < MF.n; i++) if (MF.valido[i]) df[q++] = Math.hypot(MF.x[i] - MF.cx, MF.y[i] - MF.cy);
        df.sort();
        ctx.strokeStyle = COR_FANTASMA;
        ctx.lineWidth = 1.4;
        ctx.setLineDash(TRACO_FANTASMA);
        ctx.beginPath();
        ctx.moveTo(BX(0), BY(0));
        const pf = Math.max(1, Math.floor(MF.validos / 400));
        for (let i = 0; i < MF.validos; i += pf) ctx.lineTo(BX(df[i]), BY((i + 1) / MF.validos));
        ctx.lineTo(BX(df[MF.validos - 1]), BY(1));
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.strokeStyle = cores.luz;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(BX(0), BY(0));
      const passo = Math.max(1, Math.floor(M.validos / 400));
      for (let i = 0; i < M.validos; i += passo) ctx.lineTo(BX(d[i]), BY((i + 1) / M.validos));
      ctx.lineTo(BX(d[M.validos - 1]), BY(1));
      ctx.stroke();
      // marca de 80 %
      ctx.strokeStyle = rgba(cores.selecao, 0.8);
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(b.x, BY(0.8)); ctx.lineTo(BX(M.r80), BY(0.8)); ctx.lineTo(BX(M.r80), b.y + b.h);
      ctx.stroke();
      ctx.setLineDash([]);
      if (ptr && ptr.x >= b.x && ptr.x <= b.x + b.w && ptr.y >= b.y && ptr.y <= b.y + b.h) {
        const rr = bx.min + ((ptr.x - b.x) / b.w) * (bx.max - bx.min);
        let lo = 0, hi = M.validos;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (d[mid] <= rr) lo = mid + 1; else hi = mid; }
        const fr = lo / M.validos;
        ctx.strokeStyle = rgba(cores.texto, 0.5);
        ctx.beginPath();
        ctx.moveTo(Math.round(ptr.x) + 0.5, b.y); ctx.lineTo(Math.round(ptr.x) + 0.5, b.y + b.h);
        ctx.stroke();
        ctx.fillStyle = cores.luz;
        ctx.beginPath(); ctx.arc(ptr.x, BY(fr), 3.5, 0, 2 * Math.PI); ctx.fill();
        leitura = [`r = ${comprimentoMm(rr, 4)}`, `contém ${fmtFixo(100 * fr, 1)} %`];
        etiqueta(ctx, leitura, ptr.x, BY(fr), b);
      }
    }
    if (ptr && ptr.x >= a.x && ptr.x <= a.x + a.w && ptr.y >= a.y && ptr.y <= a.y + a.h) {
      const wx = ex.min + ((ptr.x - a.x) / a.w) * (ex.max - ex.min);
      const wy = ey.max - ((ptr.y - a.y) / a.h) * (ey.max - ey.min);
      etiqueta(ctx, [`x = ${comprimentoMm(wx, 4)}`, `y = ${comprimentoMm(wy, 4)}`], ptr.x, ptr.y, a);
    }
  }, [sol, fant?.sol, tam.w, tam.h, j.semi, ptr?.x, ptr?.y]);

  return (
    <>
      <div class="grafico" ref={ref} data-instr="mancha"><canvas ref={canvas} /></div>
      <div class="lateral">
        <ControleJanela j={j} />
        <div class="legenda">
          <span><i style={`border-color:${cores.selecao}`} />raio RMS</span>
          <span><i style={`border-color:${cores.selecao};border-top-style:dotted`} />80 %</span>
          <span><i class="pt" style={`background:${cores.teoria}`} />imagem paraxial</span>
          <LegendaFantasma f={fant} />
        </div>
        <div class="medidas">
          <Medida simbolo="r_\mathrm{RMS}" nome="raio RMS" valor={M.validos ? comprimentoMm(M.rRms, 4) : '—'} destaque def="√⟨|r − r̄|²⟩ de um feixe 3D amostrado uniformemente em área." />
          {fant && <Medida simbolo="r_\mathrm{RMS}" nome={`no estado ${fant.nome}`} valor={fant.sol.mancha().validos ? comprimentoMm(fant.sol.mancha().rRms, 4) : '—'} />}
          <Medida simbolo="r_{80}" nome="contém 80 %" valor={M.validos ? comprimentoMm(M.r80, 4) : '—'} />
          <Medida nome="ganho médio em r₈₀" valor={Number.isFinite(M.ganho80) ? `${fmtSig(M.ganho80, 3)}×` : '—'} def="Irradiância média dentro de r₈₀ dividida pela do feixe incidente." />
          <Medida nome="potência no anteparo" valor={`${fmtFixo(100 * M.fracao, 1)} %`} />
        </div>
      </div>
    </>
  );
}

// ————— aberração longitudinal —————

function Aberracao({ sessao }: PropsI) {
  const sol = sessao.solucao.value;
  const fant = useFantasma(sessao);
  const [ref, tam] = useTamanho<HTMLDivElement>();
  const canvas = useRef<HTMLCanvasElement>(null);
  const areaRef = useRef<{ a: Area; u0: number; u1: number } | null>(null);
  const ptr = usePonteiro(ref, (x, _y, fase) => {
    const g = areaRef.current;
    if (fase === 'fim') { sessao.fimGesto(); return; }
    if (!g) return;
    if (fase === 'inicio') sessao.inicioGesto();
    const u = g.u0 + ((x - g.a.x) / g.a.w) * (g.u1 - g.u0);
    sessao.definirExtras({ prova: pupilaDeU(sessao.solucao.peek().intervalo, u) });
  });
  const L = sol.leque;
  const noEixo = Math.abs(sol.cfg.feixe.alfa) < 1e-12;
  const e = sol.cfg.espelho;

  useEffect(() => {
    const c = canvas.current;
    if (!c || tam.w < 40 || tam.h < 40) return;
    const ctx = preparar(c, tam.w, tam.h);
    if (!ctx) return;
    const a = areaPadrao(tam.w, tam.h, 58, 16, 24, 38);
    let dMin = 0, dMax = 0;
    for (let i = 0; i < L.n; i++) {
      const z = L.zCruz[i];
      if (Number.isNaN(z)) continue;
      const d = z - sol.f;
      // a escala vem dos raios de reflexão única; os demais aparecem recortados
      if (L.nRefl[i] !== 1 || Math.abs(d) > 3 * e.R) continue;
      if (d < dMin) dMin = d;
      if (d > dMax) dMax = d;
    }
    const LF = fant ? fant.sol.leque : null;
    if (LF && fant) {
      for (let i = 0; i < LF.n; i++) {
        const d = LF.zCruz[i] - fant.sol.f;
        if (Number.isNaN(d) || LF.nRefl[i] !== 1 || Math.abs(d) > 3 * fant.sol.cfg.espelho.R) continue;
        if (d < dMin) dMin = d;
        if (d > dMax) dMax = d;
      }
    }
    const amp = Math.max(Math.abs(dMin), Math.abs(dMax), 1e-9 * e.R);
    const [y0, y1] = intervalo(dMin, dMax, 0.12, true);
    const { un, fator } = unidadePara(amp);
    const u0 = Math.min(sol.intervalo[0], fant ? fant.sol.intervalo[0] : Infinity);
    const u1 = Math.max(sol.intervalo[1], fant ? fant.sol.intervalo[1] : -Infinity);
    const ex = { min: u0, max: u1, titulo: noEixo ? 'altura h do raio no feixe (mm)' : 'coordenada u do raio no feixe (mm)' };
    const ey = { min: Math.min(y0, -amp * 0.08), max: Math.max(y1, amp * 0.08), titulo: `Δz = z× − f (${un})`, fator };
    areaRef.current = { a, u0: ex.min, u1: ex.max };
    desenharEixos(ctx, a, ex, ey, {});
    const X = mapa(ex.min, ex.max, a.x, a.x + a.w);
    const Y = mapa(ey.min, ey.max, a.y + a.h, a.y);
    ctx.save();
    ctx.beginPath();
    ctx.rect(a.x, a.y - 1, a.w, a.h + 2);
    ctx.clip();
    // referência de 3ª ordem (só faz sentido com o feixe paralelo ao eixo)
    if (noEixo) {
      ctx.strokeStyle = cores.teoria;
      ctx.lineWidth = 1.4;
      ctx.setLineDash(tracos.teoria as unknown as number[]);
      ctx.beginPath();
      for (let i = 0; i <= 80; i++) {
        const u = ex.min + ((ex.max - ex.min) * i) / 80;
        const d = (-(1 + e.kappa) * u * u) / (4 * e.R);
        if (i === 0) ctx.moveTo(X(u), Y(d)); else ctx.lineTo(X(u), Y(d));
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
    const curva = (Lc: typeof L, f: number) => {
      ctx.beginPath();
      let ab = false;
      let na = -1;
      for (let i = 0; i < Lc.n; i++) {
        const z = Lc.zCruz[i];
        if (Number.isNaN(z) || (Lc.nRefl[i] !== na && ab)) ab = false;
        na = Lc.nRefl[i];
        if (Number.isNaN(z)) continue;
        if (!ab) ctx.moveTo(X(Lc.u[i]), Y(z - f)); else ctx.lineTo(X(Lc.u[i]), Y(z - f));
        ab = true;
      }
      ctx.stroke();
    };
    if (LF && fant) {
      ctx.strokeStyle = COR_FANTASMA;
      ctx.lineWidth = 1.4;
      ctx.setLineDash(TRACO_FANTASMA);
      curva(LF, fant.sol.f);
      ctx.setLineDash([]);
    }
    // traçado exato
    ctx.strokeStyle = cores.luz;
    ctx.lineWidth = 2;
    ctx.beginPath();
    let aberto = false;
    let nAnt = -1;
    for (let i = 0; i < L.n; i++) {
      const z = L.zCruz[i];
      if (Number.isNaN(z) || L.nRefl[i] !== nAnt && aberto) aberto = false;
      nAnt = L.nRefl[i];
      if (Number.isNaN(z)) continue;
      const x = X(L.u[i]);
      const y = Y(z - sol.f);
      if (!aberto) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      aberto = true;
    }
    ctx.stroke();
    ctx.restore();
    // raio de prova
    const pr = sol.prova;
    if (pr) {
      const x = X(pr.u);
      ctx.strokeStyle = rgba(cores.selecao, 0.7);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, a.y);
      ctx.lineTo(Math.round(x) + 0.5, a.y + a.h);
      ctx.stroke();
      if (pr.zCruz !== null) {
        const y = Y(pr.zCruz - sol.f);
        if (y >= a.y - 2 && y <= a.y + a.h + 2) {
          ctx.fillStyle = cores.fundo;
          ctx.strokeStyle = cores.selecao;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x, y, 5, 0, 2 * Math.PI);
          ctx.fill();
          ctx.stroke();
        }
        etiqueta(ctx, [`h = ${fmtFixo(pr.u, 2)} mm`, `Δz = ${comprimentoMm(pr.zCruz - sol.f, 4)}`], x, Y(pr.zCruz - sol.f), a);
      }
    } else if (ptr && ptr.x >= a.x && ptr.x <= a.x + a.w) {
      textoCurto(ctx, 'toque para escolher o raio', ptr.x + 8, a.y + 10, cores.texto2);
    }
  }, [sol, fant?.sol, tam.w, tam.h, ptr?.x]);

  const pr = sol.prova;
  return (
    <>
      <div class="grafico" ref={ref} data-instr="aberracao" style="cursor:crosshair"><canvas ref={canvas} /></div>
      <div class="lateral">
        <div class="legenda">
          <span><i style={`border-color:${cores.luz}`} />traçado exato</span>
          {noEixo && <span><i style={`border-color:${cores.teoria};border-top-style:dashed`} />3ª ordem</span>}
          <LegendaFantasma f={fant} />
        </div>
        <div class="medidas">
          <Medida simbolo="f" nome="foco paraxial" valor={`${fmtFixo(sol.f, 2)}`} unidade="mm" />
          <Medida simbolo="\Delta z^{m}" nome="raio marginal" valor={sol.marginalSup.zCruz === null ? '—' : comprimentoMm(sol.marginalSup.zCruz - sol.f, 4)} destaque
            def="z× − f: negativo quando o raio cruza o eixo antes de F (mais perto do espelho)." />
          {fant && <Medida simbolo="\Delta z^{m}" nome={`no estado ${fant.nome}`} valor={fant.sol.marginalSup.zCruz === null ? '—' : comprimentoMm(fant.sol.marginalSup.zCruz - fant.sol.f, 4)} />}
          {pr && <Medida simbolo="\Delta z" nome="raio de prova" valor={pr.zCruz === null ? 'não cruza' : comprimentoMm(pr.zCruz - sol.f, 4)} />}
        </div>
        {!pr && <div class="def" style="color:var(--texto-3);margin-top:6px">Toque ou arraste no gráfico para escolher o raio de prova.</div>}
      </div>
    </>
  );
}

// ————— varredura do anteparo —————

function Varredura({ sessao }: PropsI) {
  const sol = sessao.solucao.value;
  const fant = useFantasma(sessao);
  const [ref, tam] = useTamanho<HTMLDivElement>();
  const canvas = useRef<HTMLCanvasElement>(null);
  const areaRef = useRef<{ a: Area; z0: number; z1: number } | null>(null);
  const ptr = usePonteiro(ref, (x, _y, fase) => {
    const g = areaRef.current;
    if (fase === 'fim') { sessao.fimGesto(); return; }
    if (!g) return;
    if (fase === 'inicio') sessao.inicioGesto();
    // z cresce para a esquerda, como na cena
    const z = g.z1 - ((x - g.a.x) / g.a.w) * (g.z1 - g.z0);
    sessao.definir({ zs: Math.max(g.z0, Math.min(g.z1, z)) });
  });
  // faixa fixa pelos focos paraxial e marginal: não depende de onde o anteparo está
  const f = sol.f;
  // com um estado guardado, a faixa cobre também o foco e os cruzamentos marginais dele
  const pontos: number[] = [];
  for (const r of fant ? [sol, fant.sol] : [sol]) {
    pontos.push(r.f);
    for (const z of [r.marginalSup.zCruz, r.marginalInf.zCruz]) if (z !== null && Math.abs(z - r.f) < 0.6 * r.f) pontos.push(z);
  }
  const pMin = Math.min(...pontos);
  const pMax = Math.max(...pontos);
  const ext = Math.max(0.02 * f, pMax - f, f - pMin);
  const lo = pMin - 0.55 * ext;
  const hi = pMax + 0.55 * ext;
  const z0 = Math.max(0, lo);
  const z1 = hi;
  const N = 161;
  const V = sol.varredura(z0, z1, N);

  useEffect(() => {
    const c = canvas.current;
    if (!c || tam.w < 40 || tam.h < 40) return;
    const ctx = preparar(c, tam.w, tam.h);
    if (!ctx) return;
    const a = areaPadrao(tam.w, tam.h, 54, 16, 24, 38);
    const VF = fant ? fant.sol.varredura(z0, z1, N) : null;
    let wMax = 0;
    for (let i = 0; i < N; i++) wMax = Math.max(wMax, V.W[i] || 0, VF ? VF.W[i] || 0 : 0);
    const { un, fator } = unidadePara(wMax || 1);
    // eixo z invertido para coincidir com a cena (espelho à direita)
    const ex = { min: z0, max: z1, titulo: 'posição do anteparo z (mm), crescendo para a esquerda como na cena', inverter: true };
    const ey = { min: 0, max: (wMax || 1) * 1.1, titulo: `largura no anteparo (${un})`, fator };
    areaRef.current = { a, z0, z1 };
    desenharEixos(ctx, a, ex, ey, { zeroX: false });
    const X = (z: number) => a.x + ((z1 - z) / (z1 - z0)) * a.w;
    const Y = mapa(ey.min, ey.max, a.y + a.h, a.y);
    const serie = (dados: Float64Array, cor: string) => {
      ctx.strokeStyle = cor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      let aberto = false;
      for (let i = 0; i < N; i++) {
        if (Number.isNaN(dados[i])) { aberto = false; continue; }
        const x = X(V.z[i]);
        const y = Y(dados[i]);
        if (!aberto) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        aberto = true;
      }
      ctx.stroke();
    };
    if (VF) {
      ctx.setLineDash(TRACO_FANTASMA);
      serie(VF.W, COR_FANTASMA);
      ctx.setLineDash([]);
    }
    serie(V.W, cores.serie1);
    serie(V.rms, cores.serie2);
    // rótulos diretos no fim das séries (lado do espelho)
    const rot = (dados: Float64Array, nome: string) => {
      for (let i = 0; i < N; i++) {
        if (!Number.isNaN(dados[i])) {
          textoCurto(ctx, nome, X(V.z[i]) - 4, Math.max(a.y + 8, Y(dados[i]) - 9), cores.texto2, 'right');
          return;
        }
      }
    };
    rot(V.W, 'W');
    rot(V.rms, 'σ');
    // foco paraxial
    const xf = X(f);
    ctx.strokeStyle = cores.teoria;
    ctx.lineWidth = 1.2;
    ctx.setLineDash(tracos.teoria as unknown as number[]);
    ctx.beginPath();
    ctx.moveTo(Math.round(xf) + 0.5, a.y);
    ctx.lineTo(Math.round(xf) + 0.5, a.y + a.h);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = `italic 14px ${fontes.mat}`;
    ctx.fillStyle = cores.teoria;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('F', xf, a.y - 2);
    // posição atual do anteparo
    const zs = sol.cfg.zs;
    if (zs >= z0 && zs <= z1) {
      const x = X(zs);
      ctx.strokeStyle = cores.selecao;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, a.y);
      ctx.lineTo(x, a.y + a.h);
      ctx.stroke();
      if (!Number.isNaN(sol.anteparo.W)) {
        ctx.fillStyle = cores.fundo;
        ctx.strokeStyle = cores.selecao;
        ctx.beginPath();
        ctx.arc(x, Y(sol.anteparo.W), 4.5, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
        etiqueta(ctx, [`z = ${fmtFixo(zs, 2)} mm`, `W = ${comprimentoMm(sol.anteparo.W, 4)}`, `σ = ${comprimentoMm(sol.anteparo.rms, 4)}`], x, Y(sol.anteparo.W), a);
      }
    } else {
      textoCurto(ctx, zs > z1 ? '◀ anteparo fora da faixa' : 'anteparo fora da faixa ▶', zs > z1 ? a.x + 6 : a.x + a.w - 6, a.y + 10, cores.texto2, zs > z1 ? 'left' : 'right');
    }
  }, [sol, fant?.sol, tam.w, tam.h, ptr?.x]);

  return (
    <>
      <div class="grafico" ref={ref} data-instr="varredura" style="cursor:ew-resize"><canvas ref={canvas} /></div>
      <div class="lateral">
        <div class="legenda">
          <span><i style={`border-color:${cores.serie1}`} />W, largura total</span>
          <span><i style={`border-color:${cores.serie2}`} />σ, desvio RMS</span>
          {fant && <span data-fantasma={fant.nome}><i style={`border-color:${COR_FANTASMA};border-top-style:dashed`} />W no estado {fant.nome}</span>}
        </div>
        <div class="medidas">
          <Medida simbolo="z_s" nome="anteparo" valor={fmtFixo(sol.cfg.zs, 2)} unidade="mm" />
          <Medida simbolo="W" nome="largura total" valor={Number.isNaN(sol.anteparo.W) ? '—' : comprimentoMm(sol.anteparo.W, 4)} destaque />
          <Medida simbolo="\sigma_y" nome="desvio RMS" valor={Number.isNaN(sol.anteparo.rms) ? '—' : comprimentoMm(sol.anteparo.rms, 4)} />
        </div>
        <div class="def" style="color:var(--texto-3);margin-top:6px">Arraste no gráfico para mover o anteparo. Seção meridional, {sol.leque.n} raios.</div>
      </div>
    </>
  );
}

export function Instrumentos({ sessao }: PropsI) {
  const id = (sessao.extras.value.instr as string) || 'perfil';
  const atual = INSTRUMENTOS.some((i) => i.id === id) ? id : 'perfil';
  return (
    <section class="instr" aria-label="Instrumentos de análise">
      <div class="abas" role="tablist">
        {INSTRUMENTOS.map((i) => (
          <button role="tab" aria-selected={atual === i.id} onClick={() => sessao.definirExtras({ instr: i.id })}>{i.titulo}</button>
        ))}
      </div>
      <div class="corpo">
        {atual === 'perfil' && <Perfil sessao={sessao} />}
        {atual === 'mancha' && <Mancha sessao={sessao} />}
        {atual === 'aberracao' && <Aberracao sessao={sessao} />}
        {atual === 'varredura' && <Varredura sessao={sessao} />}
      </div>
    </section>
  );
}
