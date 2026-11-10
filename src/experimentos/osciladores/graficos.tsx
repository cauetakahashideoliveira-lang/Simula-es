/**
 * Osciladores — gráficos. Todos leem o histórico do motor e marcam o passo
 * do cursor: o instante mostrado é o mesmo da cena, sempre.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { RefObject } from 'preact';
import { fmtFixo, fmtSig } from '../../nucleo/formato';
import { Icone, Medida, useTamanho } from '../../ui/componentes';
import { areaPadrao, desenharEixos, etiqueta, mapa, preparar, type Area } from '../../ui/grafico';
import { cores, fontes, tracos, alfa as rgba } from '../../ui/tema';
import type { Motor } from './motor';
import { energia, energiaModal, modais, modosNormais, periodoBatimento, solucaoExata } from './modelo';

type P = { motor: Motor };

export const GRAFICOS = [
  { id: 'posicoes', titulo: 'Posições' },
  { id: 'energia', titulo: 'Energia' },
  { id: 'modos', titulo: 'Modos normais' },
  { id: 'plano', titulo: 'Plano x₁–x₂' },
] as const;

const JANELAS = [6, 12, 24, 48, 96, 0];

/** assina os sinais de que os gráficos dependem */
function useQuadro(motor: Motor) {
  void motor.cursor.value;
  void motor.versao.value;
  return motor.sessao.valores.value;
}

/** Janela de tempo [t0, t1] que mantém o cursor visível; T = 0 mostra tudo. */
function janelaTempo(motor: Motor, T: number, ancora: { t0: number }): [number, number] {
  const t = motor.cursor.peek() * motor.cfg.dt;
  const fim = motor.sim.passos * motor.cfg.dt;
  if (T <= 0) return [0, Math.max(fim, 1)];
  let t0 = ancora.t0;
  if (t > t0 + T) t0 = t - 0.9 * T;
  if (t < t0) t0 = Math.max(0, t - 0.1 * T);
  if (fim < T) t0 = 0;
  ancora.t0 = Math.max(0, t0);
  return [ancora.t0, ancora.t0 + T];
}

/**
 * Série temporal com decimação mín/máx por coluna de pixel (não perde picos).
 * O trecho depois do cursor (futuro já calculado) sai atenuado.
 */
function serie(
  ctx: CanvasRenderingContext2D, a: Area, motor: Motor, f: (i: number) => number,
  t0: number, t1: number, Y: (v: number) => number, cor: string, largura = 2, traco?: number[],
) {
  const dt = motor.cfg.dt;
  const n = motor.sim.passos;
  const cur = motor.cursor.peek();
  const i0 = Math.max(0, Math.floor(t0 / dt));
  const i1 = Math.min(n, Math.ceil(t1 / dt));
  if (i1 <= i0) return;
  const X = (i: number) => a.x + ((i * dt - t0) / (t1 - t0)) * a.w;
  const porPx = (i1 - i0) / a.w;
  // janelas enormes: amostra no máximo ~8 pontos por pixel
  const salto = Math.max(1, Math.floor(porPx / 8));
  ctx.save();
  ctx.beginPath();
  ctx.rect(a.x, a.y - 2, a.w, a.h + 4);
  ctx.clip();
  ctx.lineWidth = largura;
  ctx.lineJoin = 'round';
  if (traco) ctx.setLineDash(traco);
  for (const parte of [0, 1]) {
    const de = parte === 0 ? i0 : Math.max(i0, cur);
    const ate = parte === 0 ? Math.min(i1, cur) : i1;
    if (ate <= de) continue;
    ctx.strokeStyle = parte === 0 ? cor : rgba(cor, 0.32);
    ctx.beginPath();
    if (porPx <= 1.5) {
      for (let i = de; i <= ate; i++) {
        const x = X(i);
        const y = Y(f(i));
        if (i === de) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    } else {
      let col = -1;
      let lo = 0;
      let hi = 0;
      let ult = 0;
      for (let i = de; i <= ate; i += salto) {
        const c = Math.floor(X(i));
        const v = f(i);
        if (c !== col) {
          if (col >= 0) {
            ctx.lineTo(col + 0.5, Y(lo));
            ctx.lineTo(col + 0.5, Y(hi));
            ctx.lineTo(col + 0.5, Y(ult));
          } else ctx.moveTo(c + 0.5, Y(v));
          col = c;
          lo = hi = v;
        } else {
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
        ult = v;
      }
      ctx.lineTo(col + 0.5, Y(lo));
      ctx.lineTo(col + 0.5, Y(hi));
      ctx.lineTo(col + 0.5, Y(ult));
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** Arrastar sobre um gráfico de tempo leva o cursor àquele instante (e pausa). */
function useArrasto(ref: RefObject<HTMLElement | null>, aoArrastar: (x: number, fase: 'inicio' | 'mover' | 'fim') => void) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let baixo = false;
    const px = (e: PointerEvent) => e.clientX - el.getBoundingClientRect().left;
    const down = (e: PointerEvent) => {
      baixo = true;
      try { el.setPointerCapture(e.pointerId); } catch { /* sintético */ }
      aoArrastar(px(e), 'inicio');
    };
    const move = (e: PointerEvent) => { if (baixo) aoArrastar(px(e), 'mover'); };
    const up = () => { if (baixo) aoArrastar(0, 'fim'); baixo = false; };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
  });
}

function cursorVertical(ctx: CanvasRenderingContext2D, a: Area, x: number) {
  if (x < a.x - 1 || x > a.x + a.w + 1) return;
  ctx.strokeStyle = cores.selecao;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(Math.round(x) + 0.5, a.y);
  ctx.lineTo(Math.round(x) + 0.5, a.y + a.h);
  ctx.stroke();
}

function ponto(ctx: CanvasRenderingContext2D, x: number, y: number, cor: string) {
  ctx.fillStyle = cor;
  ctx.strokeStyle = cores.painel;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 4.5, 0, 2 * Math.PI);
  ctx.fill();
  ctx.stroke();
}

function ControleJanela({ T, setT }: { T: number; setT: (t: number) => void }) {
  const i = JANELAS.indexOf(T);
  return (
    <div class="acoes">
      <span style="flex:1">Janela {T > 0 ? `${T} s` : 'completa'}</span>
      <button class="btn" aria-label="Janela de tempo menor" title="Janela menor" disabled={i <= 0} onClick={() => setT(JANELAS[Math.max(0, i - 1)])}><Icone.mais /></button>
      <button class="btn" aria-label="Janela de tempo maior" title="Janela maior" disabled={i >= JANELAS.length - 1} onClick={() => setT(JANELAS[Math.min(JANELAS.length - 1, i + 1)])}><Icone.menos /></button>
    </div>
  );
}

function GraficoTempo({ motor, id, desenhar }: {
  motor: Motor;
  id: string;
  T: number;
  desenhar: (ctx: CanvasRenderingContext2D, a: Area, w: number, h: number) => { t0: number; t1: number } | null;
}) {
  const [ref, tam] = useTamanho<HTMLDivElement>();
  const canvas = useRef<HTMLCanvasElement>(null);
  const geo = useRef<{ a: Area; t0: number; t1: number } | null>(null);
  const rodava = useRef(false);
  useArrasto(ref, (x, fase) => {
    const g = geo.current;
    if (fase === 'fim') return;
    if (!g) return;
    if (fase === 'inicio') {
      rodava.current = motor.rodando.peek();
      motor.pausar();
    }
    const t = g.t0 + ((x - g.a.x) / g.a.w) * (g.t1 - g.t0);
    motor.irPara(Math.max(0, Math.min(motor.sim.passos, Math.round(t / motor.cfg.dt))));
  });
  // antes da pintura do quadro: o gráfico mostra o mesmo passo que a cena e as leituras
  useLayoutEffect(() => {
    const c = canvas.current;
    if (!c || tam.w < 40 || tam.h < 40) return;
    const ctx = preparar(c, tam.w, tam.h);
    if (!ctx) return;
    const a = areaPadrao(tam.w, tam.h, 56, 16, 24, 38);
    const r = desenhar(ctx, a, tam.w, tam.h);
    geo.current = r ? { a, ...r } : null;
  });
  return <div class="grafico" ref={ref} data-grafico={id} style="cursor:ew-resize"><canvas ref={canvas} /></div>;
}

// ————— posições —————

function Posicoes({ motor }: P) {
  useQuadro(motor);
  const [T, setT] = useState(24);
  const ancora = useRef({ t0: 0 });
  const s = motor.sim;
  const cfg = motor.cfg;
  const i = Math.min(motor.cursor.value, s.passos);
  const t = i * cfg.dt;
  const modos = modosNormais(cfg.p);
  const exata = solucaoExata(cfg.p, modos, cfg.ci, t);
  const E0 = s.energiaEm(0);
  // limites rigorosos enquanto a energia se conserva: ½k₁x₁² ≤ E ⇒ |x₁| ≤ √(2E/k₁)
  const limite = Math.max(Math.sqrt((2 * E0) / cfg.p.k1), Math.sqrt((2 * E0) / cfg.p.k2), 0.01);

  return (
    <>
      <GraficoTempo motor={motor} id="posicoes" T={T} desenhar={(ctx, a) => {
        const [t0, t1] = janelaTempo(motor, T, ancora.current);
        let amp = limite;
        const iA = Math.max(0, Math.floor(t0 / cfg.dt));
        const iB = Math.min(s.passos, Math.ceil(t1 / cfg.dt));
        const salto = Math.max(1, Math.floor((iB - iA) / 4000));
        for (let k = iA; k <= iB; k += salto) amp = Math.max(amp, Math.abs(s.qEm(k, 0)), Math.abs(s.qEm(k, 1)));
        amp = Math.min(amp, 5) * 1.08;
        const ex = { min: t0, max: t1, titulo: 'tempo t (s)' };
        const ey = { min: -amp, max: amp, titulo: 'deslocamento (cm)', fator: 100 };
        desenharEixos(ctx, a, ex, ey, { zeroX: false });
        const Y = mapa(-amp, amp, a.y + a.h, a.y);
        serie(ctx, a, motor, (k) => s.qEm(k, 0), t0, t1, Y, cores.serie1);
        serie(ctx, a, motor, (k) => s.qEm(k, 1), t0, t1, Y, cores.serie2);
        const xc = a.x + ((t - t0) / (t1 - t0)) * a.w;
        cursorVertical(ctx, a, xc);
        if (xc >= a.x && xc <= a.x + a.w) {
          ponto(ctx, xc, Y(s.qEm(i, 0)), cores.serie1);
          ponto(ctx, xc, Y(s.qEm(i, 1)), cores.serie2);
          etiqueta(ctx, [`t = ${fmtFixo(t, 3)} s`, `x₁ = ${fmtFixo(100 * s.qEm(i, 0), 2)} cm`, `x₂ = ${fmtFixo(100 * s.qEm(i, 1), 2)} cm`], xc, a.y + 26, a);
        }
        return { t0, t1 };
      }} />
      <div class="lateral">
        <ControleJanela T={T} setT={setT} />
        <div class="legenda">
          <span><i style={`border-color:${cores.serie1}`} />x₁, massa 1</span>
          <span><i style={`border-color:${cores.serie2}`} />x₂, massa 2</span>
        </div>
        <div class="medidas">
          <Medida simbolo="t" nome="instante" valor={fmtFixo(t, 3)} unidade="s" destaque />
          <Medida simbolo="x_1" nome="massa 1" valor={fmtFixo(100 * s.qEm(i, 0), 3)} unidade="cm" />
          <Medida simbolo="x_2" nome="massa 2" valor={fmtFixo(100 * s.qEm(i, 1), 3)} unidade="cm" />
          <Medida nome="erro em x₁" valor={fmtSig(100 * (s.qEm(i, 0) - exata[0]), 2)} unidade="cm" def="Integração numérica menos a solução exata por modos normais." />
        </div>
      </div>
    </>
  );
}

// ————— energia —————

function Energia({ motor }: P) {
  useQuadro(motor);
  const [T, setT] = useState(24);
  const ancora = useRef({ t0: 0 });
  const s = motor.sim;
  const cfg = motor.cfg;
  const i = Math.min(motor.cursor.value, s.passos);
  const t = i * cfg.dt;
  const E0 = s.energiaEm(0);
  const en = (k: number) => energia(cfg.p, s.qEm(k, 0), s.qEm(k, 1), s.vEm(k, 0), s.vEm(k, 1));
  const agora = en(i);
  // unidade: mJ para energias pequenas
  const emMili = E0 < 1;
  const f = emMili ? 1000 : 1;
  const un = emMili ? 'mJ' : 'J';
  const deriva = E0 > 0 ? agora.total / E0 - 1 : 0;

  return (
    <>
      <GraficoTempo motor={motor} id="energia" T={T} desenhar={(ctx, a) => {
        const [t0, t1] = janelaTempo(motor, T, ancora.current);
        let max = E0;
        const iA = Math.max(0, Math.floor(t0 / cfg.dt));
        const iB = Math.min(s.passos, Math.ceil(t1 / cfg.dt));
        const salto = Math.max(1, Math.floor((iB - iA) / 2000));
        for (let k = iA; k <= iB; k += salto) max = Math.max(max, s.energiaEm(k));
        max = (Number.isFinite(max) && max > 0 ? Math.min(max, 1e6 * Math.max(E0, 1e-12)) : 1) * 1.1;
        const ex = { min: t0, max: t1, titulo: 'tempo t (s)' };
        const ey = { min: 0, max, titulo: `energia (${un})`, fator: f };
        desenharEixos(ctx, a, ex, ey, { zeroX: false });
        const Y = mapa(0, max, a.y + a.h, a.y);
        serie(ctx, a, motor, (k) => en(k).Ec, t0, t1, Y, cores.serie3, 1.6);
        serie(ctx, a, motor, (k) => en(k).E1, t0, t1, Y, cores.serie1);
        serie(ctx, a, motor, (k) => en(k).E2, t0, t1, Y, cores.serie2);
        serie(ctx, a, motor, (k) => s.energiaEm(k), t0, t1, Y, cores.neutro, 1.4, [5, 3]);
        const xc = a.x + ((t - t0) / (t1 - t0)) * a.w;
        cursorVertical(ctx, a, xc);
        if (xc >= a.x && xc <= a.x + a.w) {
          ponto(ctx, xc, Y(agora.Ec), cores.serie3);
          ponto(ctx, xc, Y(agora.E1), cores.serie1);
          ponto(ctx, xc, Y(agora.E2), cores.serie2);
        }
        return { t0, t1 };
      }} />
      <div class="lateral">
        <ControleJanela T={T} setT={setT} />
        <div class="legenda">
          <span><i style={`border-color:${cores.serie1}`} />massa 1</span>
          <span><i style={`border-color:${cores.serie2}`} />massa 2</span>
          <span><i style={`border-color:${cores.serie3}`} />acoplamento</span>
          <span><i style={`border-color:${cores.neutro};border-top-style:dashed`} />total</span>
        </div>
        <div class="medidas">
          <Medida simbolo="E" nome="total" valor={fmtSig(agora.total * f, 5)} unidade={un} />
          <Medida simbolo="\Delta E/E_0" nome="deriva" valor={fmtSig(deriva, 3)} destaque
            def="O sistema é conservativo: qualquer variação da energia total é erro do integrador." />
          <Medida simbolo="E_1" nome="massa 1 + mola k₁" valor={fmtSig(agora.E1 * f, 4)} unidade={un} />
          <Medida simbolo="E_2" nome="massa 2 + mola k₂" valor={fmtSig(agora.E2 * f, 4)} unidade={un} />
          <Medida simbolo="E_c" nome="mola de acoplamento" valor={fmtSig(agora.Ec * f, 4)} unidade={un} />
        </div>
      </div>
    </>
  );
}

// ————— modos normais: frequências em função do acoplamento —————

function Modos({ motor }: P) {
  const v = useQuadro(motor);
  const [ref, tam] = useTamanho<HTMLDivElement>();
  const canvas = useRef<HTMLCanvasElement>(null);
  const geo = useRef<{ a: Area; kMax: number } | null>(null);
  const cfg = motor.cfg;
  const m = modosNormais(cfg.p);
  const [, kcMax] = motor.sessao.dominioDe('kc');
  // faixa do eixo: cobre o valor atual com folga, em degraus (não fica mudando a cada toque)
  const kMax = [20, 50, 100, 200].find((k) => k >= cfg.p.kc * 1.25) ?? kcMax;
  useArrasto(ref, (x, fase) => {
    const g = geo.current;
    if (fase === 'fim') { motor.sessao.fimGesto(); return; }
    if (!g) return;
    if (fase === 'inicio') motor.sessao.inicioGesto();
    const kc = ((x - g.a.x) / g.a.w) * g.kMax;
    motor.sessao.definir({ kc: Math.round(Math.max(0, Math.min(g.kMax, kc)) * 10) / 10 });
  });

  useEffect(() => {
    const c = canvas.current;
    if (!c || tam.w < 40 || tam.h < 40) return;
    const ctx = preparar(c, tam.w, tam.h);
    if (!ctx) return;
    const a = areaPadrao(tam.w, tam.h, 52, 20, 24, 38);
    geo.current = { a, kMax };
    const N = 120;
    const lo: number[] = [];
    const hi: number[] = [];
    let wMax = 0;
    for (let k = 0; k <= N; k++) {
      const mk = modosNormais({ ...cfg.p, kc: (kMax * k) / N });
      lo.push(mk.omegaBaixa);
      hi.push(mk.omegaAlta);
      wMax = Math.max(wMax, mk.omegaAlta);
    }
    const wMin = Math.min(m.omega1Livre, m.omega2Livre);
    const ex = { min: 0, max: kMax, titulo: 'mola de acoplamento k_c (N/m)' };
    const ey = { min: Math.max(0, wMin * 0.9), max: wMax * 1.05, titulo: 'frequência angular ω (rad/s)' };
    desenharEixos(ctx, a, ex, ey, {});
    const X = mapa(0, kMax, a.x, a.x + a.w);
    const Y = mapa(ey.min, ey.max, a.y + a.h, a.y);
    // osciladores isolados (referência teórica)
    ctx.strokeStyle = cores.teoria;
    ctx.lineWidth = 1.2;
    ctx.setLineDash(tracos.teoria as unknown as number[]);
    ctx.beginPath();
    for (const w of [m.omega1Livre, m.omega2Livre]) {
      ctx.moveTo(a.x, Y(w));
      ctx.lineTo(a.x + a.w, Y(w));
    }
    ctx.stroke();
    ctx.setLineDash([]);
    const curva = (d: number[], cor: string) => {
      ctx.strokeStyle = cor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      d.forEach((w, k) => (k === 0 ? ctx.moveTo(X((kMax * k) / N), Y(w)) : ctx.lineTo(X((kMax * k) / N), Y(w))));
      ctx.stroke();
    };
    curva(lo, cores.neutro);
    curva(hi, cores.serie3);
    ctx.font = `12.5px ${fontes.ui}`;
    ctx.fillStyle = cores.texto2;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('ω₊', a.x + a.w - 4, Y(hi[N]) - 4);
    ctx.textBaseline = 'top';
    ctx.fillText('ω₋', a.x + a.w - 4, Y(lo[N]) + 4);
    // valor atual
    const xk = X(cfg.p.kc);
    cursorVertical(ctx, a, xk);
    ponto(ctx, xk, Y(m.omegaBaixa), cores.neutro);
    ponto(ctx, xk, Y(m.omegaAlta), cores.serie3);
    etiqueta(ctx, [`k_c = ${fmtFixo(cfg.p.kc, 1)} N/m`, `ω₊ = ${fmtFixo(m.omegaAlta, 3)} rad/s`, `ω₋ = ${fmtFixo(m.omegaBaixa, 3)} rad/s`], xk, Y(m.omegaAlta), a);
  }, [v, tam.w, tam.h]);

  const Tb = periodoBatimento(m);
  const forma = (r: number) => (Number.isFinite(r) ? `1 : ${fmtFixo(r, 3)}` : '0 : 1');
  return (
    <>
      <div class="grafico" ref={ref} data-grafico="modos" style="cursor:ew-resize"><canvas ref={canvas} /></div>
      <div class="lateral">
        <div class="legenda">
          <span><i style={`border-color:${cores.neutro}`} />modo lento</span>
          <span><i style={`border-color:${cores.serie3}`} />modo rápido</span>
          <span><i style={`border-color:${cores.teoria};border-top-style:dashed`} />isolados</span>
        </div>
        <div class="medidas">
          <Medida simbolo="\omega_-" nome="modo lento" valor={fmtFixo(m.omegaBaixa, 4)} unidade="rad/s" def={`amplitudes x₁ : x₂ = ${forma(m.razaoBaixa)}`} />
          <Medida simbolo="\omega_+" nome="modo rápido" valor={fmtFixo(m.omegaAlta, 4)} unidade="rad/s" def={`amplitudes x₁ : x₂ = ${forma(m.razaoAlta)}`} />
          <Medida simbolo="T_b" nome="batimento" valor={Number.isFinite(Tb) ? fmtFixo(Tb, 3) : '∞'} unidade="s" destaque def="2π/(ω₊ − ω₋)" />
        </div>
        <div class="def" style="color:var(--texto-3);margin-top:6px">Arraste no gráfico para mudar o acoplamento.</div>
      </div>
    </>
  );
}

// ————— plano de configuração —————

function Plano({ motor }: P) {
  useQuadro(motor);
  const [ref, tam] = useTamanho<HTMLDivElement>();
  const canvas = useRef<HTMLCanvasElement>(null);
  const s = motor.sim;
  const cfg = motor.cfg;
  const i = Math.min(motor.cursor.value, s.passos);
  const m = modosNormais(cfg.p);
  const [eB, eA] = energiaModal(cfg.p, m, s.qEm(i, 0), s.qEm(i, 1), s.vEm(i, 0), s.vEm(i, 1));
  const [q1, q2] = modais(cfg.p, m, s.qEm(i, 0), s.qEm(i, 1));
  const E0 = s.energiaEm(0);
  const emMili = E0 < 1;
  const f = emMili ? 1000 : 1;
  const un = emMili ? 'mJ' : 'J';

  useLayoutEffect(() => {
    const c = canvas.current;
    if (!c || tam.w < 40 || tam.h < 40) return;
    const ctx = preparar(c, tam.w, tam.h);
    if (!ctx) return;
    const lado = Math.max(40, Math.min(tam.h - 24 - 38, tam.w - 80));
    const a: Area = { x: Math.max(52, (tam.w - lado) / 2), y: 24, w: lado, h: lado };
    let amp = Math.max(Math.sqrt((2 * E0) / cfg.p.k1), Math.sqrt((2 * E0) / cfg.p.k2), 0.01);
    amp = Math.max(amp, Math.abs(s.qEm(i, 0)), Math.abs(s.qEm(i, 1))) * 1.08;
    const ex = { min: -amp, max: amp, titulo: 'x₁ (cm)', fator: 100, alvo: 4 };
    const ey = { min: -amp, max: amp, titulo: 'x₂ (cm), mesma escala', fator: 100, alvo: 4 };
    desenharEixos(ctx, a, ex, ey, {});
    const X = mapa(-amp, amp, a.x, a.x + a.w);
    const Y = mapa(-amp, amp, a.y + a.h, a.y);
    ctx.save();
    ctx.beginPath();
    ctx.rect(a.x, a.y, a.w, a.h);
    ctx.clip();
    // direções dos modos: cada modo puro percorre uma destas retas
    ctx.lineWidth = 1.2;
    ctx.setLineDash(tracos.teoria as unknown as number[]);
    ctx.strokeStyle = cores.teoria;
    for (const e of [m.eBaixa, m.eAlta]) {
      const ax = e[0] / Math.sqrt(cfg.p.m1);
      const ay = e[1] / Math.sqrt(cfg.p.m2);
      const n = Math.hypot(ax, ay) || 1;
      ctx.beginPath();
      ctx.moveTo(X((-ax / n) * 2 * amp), Y((-ay / n) * 2 * amp));
      ctx.lineTo(X((ax / n) * 2 * amp), Y((ay / n) * 2 * amp));
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // trajetória até o cursor (últimos 40 000 passos)
    const de = Math.max(0, i - 40000);
    const salto = Math.max(1, Math.floor((i - de) / 6000));
    ctx.strokeStyle = rgba(cores.neutro, 0.85);
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    for (let k = de; k <= i; k += salto) {
      const x = X(s.qEm(k, 0));
      const y = Y(s.qEm(k, 1));
      if (k === de) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineTo(X(s.qEm(i, 0)), Y(s.qEm(i, 1)));
    ctx.stroke();
    ctx.restore();
    ponto(ctx, X(s.qEm(i, 0)), Y(s.qEm(i, 1)), cores.selecao);
  });

  return (
    <>
      <div class="grafico" ref={ref} data-grafico="plano"><canvas ref={canvas} /></div>
      <div class="lateral">
        <div class="legenda">
          <span><i style={`border-color:${cores.neutro}`} />trajetória</span>
          <span><i style={`border-color:${cores.teoria};border-top-style:dashed`} />direções dos modos</span>
        </div>
        <div class="medidas">
          <Medida simbolo="E_-" nome="energia do modo lento" valor={fmtSig(eB * f, 4)} unidade={un} def="½(η̇² + ω²η²) em cada coordenada normal: constante no movimento exato." />
          <Medida simbolo="E_+" nome="energia do modo rápido" valor={fmtSig(eA * f, 4)} unidade={un} />
          <Medida simbolo="\eta_-" nome="coordenada lenta" valor={fmtSig(q1, 3)} unidade="m·√kg" />
          <Medida simbolo="\eta_+" nome="coordenada rápida" valor={fmtSig(q2, 3)} unidade="m·√kg" />
        </div>
      </div>
    </>
  );
}

export function Graficos({ motor }: P) {
  const sessao = motor.sessao;
  const id = (sessao.extras.value.grafico as string) || 'posicoes';
  const atual = GRAFICOS.some((g) => g.id === id) ? id : 'posicoes';
  return (
    <section class="instr" aria-label="Gráficos">
      <div class="abas" role="tablist">
        {GRAFICOS.map((g) => (
          <button role="tab" aria-selected={atual === g.id} onClick={() => sessao.definirExtras({ grafico: g.id })}>{g.titulo}</button>
        ))}
      </div>
      <div class="corpo">
        {atual === 'posicoes' && <Posicoes motor={motor} />}
        {atual === 'energia' && <Energia motor={motor} />}
        {atual === 'modos' && <Modos motor={motor} />}
        {atual === 'plano' && <Plano motor={motor} />}
      </div>
    </section>
  );
}
