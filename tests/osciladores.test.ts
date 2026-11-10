/**
 * Verificação científica dos osciladores acoplados.
 *
 * Referências independentes da produção:
 *  (a) solução exata em alta precisão (tests/referencia/gerar_osciladores.py, mpmath);
 *  (b) frequências analíticas do caso simétrico escritas aqui: √(k/m) e √((k+2kc)/m);
 *  (c) propriedades conhecidas dos integradores (ordem, desvio de frequência do
 *      Verlet, energia limitada dos métodos simpléticos).
 * Unidades SI.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { RelogioFixo, Simulacao, type NomeIntegrador } from '../src/nucleo/dinamica';
import { energia, modosNormais, periodoBatimento, sistema, solucaoExata, energiaModal, type ParamOsc } from '../src/experimentos/osciladores/modelo';
import { osciladores, configDeValores, criarSimulacao } from '../src/experimentos/osciladores/definicao';
import { valoresPadrao } from '../src/nucleo/parametros';

interface CasoRef {
  nota: string;
  m1: number; m2: number; k1: number; kc: number; k2: number;
  x1_0: number; x2_0: number; v1_0: number; v2_0: number;
  omega_baixa: number; omega_alta: number;
  modo_baixa: [number, number | null]; modo_alta: [number, number | null];
  energia: number;
  amostras: { t: number; x1: number; x2: number; v1: number; v2: number }[];
}
const ref = JSON.parse(readFileSync(new URL('./referencia/osciladores.json', import.meta.url), 'utf8')) as { casos: CasoRef[] };

const sim = (p: ParamOsc, integ: NomeIntegrador, dt: number, x1: number, x2: number, v1 = 0, v2 = 0) =>
  new Simulacao(sistema(p), integ, dt, [x1, x2], [v1, v2], 2_000_000);

/** Frequência angular medida pelos cruzamentos ascendentes por zero (interpolação linear) da coordenada k. */
function omegaMedida(s: Simulacao, k: number): number {
  const cruz: number[] = [];
  for (let i = 1; i < s.registros; i++) {
    const a = s.qEm(i - 1, k);
    const b = s.qEm(i, k);
    if (a < 0 && b >= 0) cruz.push((i - 1 + a / (a - b)) * s.dt);
  }
  return (2 * Math.PI * (cruz.length - 1)) / (cruz[cruz.length - 1] - cruz[0]);
}

describe('modos normais (forma fechada) × referência independente', () => {
  it.each(ref.casos.map((c, i) => [i, c.nota, c] as const))('caso %i — %s', (_i, _n, c) => {
    const p: ParamOsc = { m1: c.m1, m2: c.m2, k1: c.k1, kc: c.kc, k2: c.k2 };
    const m = modosNormais(p);
    // 5e-14 relativo: a raiz quadrada e a forma estável do autovalor custam poucos ulp
    expect(Math.abs(m.omegaBaixa / c.omega_baixa - 1)).toBeLessThan(5e-14);
    expect(Math.abs(m.omegaAlta / c.omega_alta - 1)).toBeLessThan(5e-14);
    if (c.modo_baixa[1] !== null) {
      // perto da degenerescência os vetores são mal condicionados: tolerância ∝ 1/(separação relativa)
      const sep = Math.abs(c.omega_alta - c.omega_baixa) / c.omega_alta;
      const tol = 1e-13 / Math.max(sep, 1e-6);
      expect(Math.abs(m.razaoBaixa / c.modo_baixa[1] - 1)).toBeLessThan(tol);
      expect(Math.abs(m.razaoAlta / c.modo_alta[1]! - 1)).toBeLessThan(tol);
    }
    expect(Math.abs(energia(p, c.x1_0, c.x2_0, c.v1_0, c.v2_0).total / c.energia - 1)).toBeLessThan(1e-14);
    // solução exata por modos, até t = 1000 s (erro de fase ~ ω·t·ε ≈ 1e-12 rad)
    const ci = { x1: c.x1_0, x2: c.x2_0, v1: c.v1_0, v2: c.v2_0 };
    for (const a of c.amostras) {
      const [x1, x2, v1, v2] = solucaoExata(p, m, ci, a.t);
      expect(Math.abs(x1 - a.x1)).toBeLessThan(1e-10);
      expect(Math.abs(x2 - a.x2)).toBeLessThan(1e-10);
      expect(Math.abs(v1 - a.v1)).toBeLessThan(1e-8);
      expect(Math.abs(v2 - a.v2)).toBeLessThan(1e-8);
    }
  });
});

describe('integração numérica × referência independente', () => {
  const casos = ref.casos.filter((c) => c.kc <= 40);
  it('Verlet com Δt = 1 ms reproduz a solução exata até 2,5 s dentro do erro de 2ª ordem', () => {
    for (const c of casos) {
      const p: ParamOsc = { m1: c.m1, m2: c.m2, k1: c.k1, kc: c.kc, k2: c.k2 };
      const s = sim(p, 'verlet', 1e-3, c.x1_0, c.x2_0, c.v1_0, c.v2_0);
      for (const a of c.amostras.filter((x) => x.t > 0 && x.t <= 2.5)) {
        s.retomarDe(0);
        s.avancar(Math.round(a.t / 1e-3));
        // erro de fase do Verlet: ω³Δt²t/24; amplitude ≲ 0,15 m ⇒ erro ≲ 0,15·ω³Δt²t/24
        const lim = 0.15 * (c.omega_alta ** 3 * 1e-6 * a.t) / 24 + 1e-9;
        expect(Math.abs(s.q[0] - a.x1)).toBeLessThan(lim * 2);
        expect(Math.abs(s.q[1] - a.x2)).toBeLessThan(lim * 2);
      }
    }
  });

  it('a ordem de convergência é a anunciada: Verlet 2, RK4 4, Euler 1', () => {
    const c = ref.casos.find((x) => x.kc === 4 && x.x2_0 === 0 && x.m1 === 1 && x.m2 === 1 && x.v1_0 === 0)!;
    const p: ParamOsc = { m1: c.m1, m2: c.m2, k1: c.k1, kc: c.kc, k2: c.k2 };
    const alvo = c.amostras.find((a) => a.t === 1)!;
    const erro = (integ: NomeIntegrador, dt: number) => {
      const s = sim(p, integ, dt, c.x1_0, c.x2_0);
      s.avancar(Math.round(1 / dt));
      return Math.hypot(s.q[0] - alvo.x1, s.q[1] - alvo.x2);
    };
    const ordem = (integ: NomeIntegrador, dt: number) => Math.log2(erro(integ, dt) / erro(integ, dt / 2));
    expect(ordem('verlet', 1 / 512)).toBeGreaterThan(1.9);
    expect(ordem('verlet', 1 / 512)).toBeLessThan(2.1);
    expect(ordem('rk4', 1 / 64)).toBeGreaterThan(3.8);
    expect(ordem('rk4', 1 / 64)).toBeLessThan(4.2);
    expect(ordem('euler', 1 / 4096)).toBeGreaterThan(0.9);
    expect(ordem('euler', 1 / 4096)).toBeLessThan(1.1);
    expect(ordem('euler-simpletico', 1 / 4096)).toBeGreaterThan(0.9);
    expect(ordem('euler-simpletico', 1 / 4096)).toBeLessThan(1.1);
  });
});

describe('caso simétrico: frequências dos modos normais', () => {
  const m = 1, k = 40, kc = 4;
  const p: ParamOsc = { m1: m, m2: m, k1: k, kc, k2: k };
  const dt = 1e-3;
  it('modo em fase oscila em √(k/m) e modo em oposição em √((k+2kc)/m)', () => {
    const wFase = Math.sqrt(k / m);
    const wOpos = Math.sqrt((k + 2 * kc) / m);
    const a = sim(p, 'verlet', dt, 0.1, 0.1);
    a.avancar(60_000);
    const b = sim(p, 'verlet', dt, 0.1, -0.1);
    b.avancar(60_000);
    // Verlet desloca a frequência em +(ωΔt)²/24 (≈ 2e-6 aqui); tolerância 5e-6 cobre isso e a interpolação
    expect(Math.abs(omegaMedida(a, 0) / wFase - 1)).toBeLessThan(5e-6);
    expect(Math.abs(omegaMedida(b, 0) / wOpos - 1)).toBeLessThan(5e-6);
    // e o desvio tem o sinal e o tamanho previstos para o Verlet
    const previsto = (wFase * dt) ** 2 / 24;
    expect(Math.abs(omegaMedida(a, 0) / wFase - 1 - previsto)).toBeLessThan(0.5 * previsto);
    // num modo puro as duas massas mantêm a razão de amplitudes
    for (let i = 0; i < a.registros; i += 997) expect(Math.abs(a.qEm(i, 0) - a.qEm(i, 1))).toBeLessThan(1e-13);
    for (let i = 0; i < b.registros; i += 997) expect(Math.abs(b.qEm(i, 0) + b.qEm(i, 1))).toBeLessThan(1e-13);
    const an = modosNormais(p);
    expect(Math.abs(an.omegaBaixa - wFase)).toBeLessThan(1e-13);
    expect(Math.abs(an.omegaAlta - wOpos)).toBeLessThan(1e-13);
    expect(an.razaoBaixa).toBeCloseTo(1, 12);
    expect(an.razaoAlta).toBeCloseTo(-1, 12);
  });

  it('em meio período de batimento a massa 1 para na origem e quase toda a energia está na massa 2', () => {
    // Analítico (caso simétrico, massa 1 solta de A): x1 = (A/2)(cos ω₋t + cos ω₊t).
    // Em t* = π/(ω₊−ω₋) os cossenos se cancelam (x1 = 0), mas v1 = (A/2)(ω₊−ω₋) sen ω₋t* ≠ 0:
    // a transferência só é total no limite de acoplamento fraco. Resíduo esperado:
    // E1/E0 = ½m(A/2)²(ω₊−ω₋)² sen²(ω₋t*) / [½(k+kc)A²].
    const A = 0.1;
    const wm = Math.sqrt(k / m);
    const wp = Math.sqrt((k + 2 * kc) / m);
    const tEstrela = Math.PI / (wp - wm);
    const residuo = (0.5 * m * (A / 2) ** 2 * (wp - wm) ** 2 * Math.sin(wm * tEstrela) ** 2) / (0.5 * (k + kc) * A * A);
    const an = modosNormais(p);
    expect(Math.abs(periodoBatimento(an) / 2 - tEstrela)).toBeLessThan(1e-12);
    const s = sim(p, 'verlet', 1e-4, A, 0);
    s.avancar(Math.round(tEstrela / 1e-4));
    const e = energia(p, s.q[0], s.q[1], s.v[0], s.v[1]);
    // |x1| limitado por velocidade × meio passo (instante arredondado ao passo) + erro de fase
    expect(Math.abs(s.q[0])).toBeLessThan(2e-5);
    expect(Math.abs(e.E1 / e.total / residuo - 1)).toBeLessThan(0.02);
    expect(e.E2 / e.total).toBeGreaterThan(0.99);
  });
});

describe('limite de acoplamento nulo', () => {
  it('com kc = 0 a massa 2 fica exatamente em repouso e a massa 1 oscila em √(k1/m1)', () => {
    const p: ParamOsc = { m1: 0.7, m2: 1.9, k1: 55, kc: 0, k2: 23 };
    for (const integ of ['verlet', 'rk4', 'euler-simpletico', 'euler'] as const) {
      const s = sim(p, integ, 1e-3, 0.08, 0);
      s.avancar(20_000);
      for (let i = 0; i < s.registros; i += 499) {
        expect(s.qEm(i, 1)).toBe(0);
        expect(s.vEm(i, 1)).toBe(0);
      }
    }
    const s = sim(p, 'verlet', 1e-3, 0.08, 0);
    s.avancar(60_000);
    expect(Math.abs(omegaMedida(s, 0) / Math.sqrt(55 / 0.7) - 1)).toBeLessThan(1e-5);
    const an = modosNormais(p);
    expect([an.omegaBaixa, an.omegaAlta].map((w) => +w.toFixed(12))).toEqual(
      [Math.sqrt(23 / 1.9), Math.sqrt(55 / 0.7)].map((w) => +w.toFixed(12)),
    );
  });
});

describe('conservação de energia em muitos períodos', () => {
  const p: ParamOsc = { m1: 1, m2: 1, k1: 40, kc: 4, k2: 40 };
  const wMax = Math.sqrt(48);
  const periodos = 1000;
  const dt = 4e-3;
  const n = Math.round((periodos * 2 * Math.PI) / wMax / dt);

  const derivaMax = (s: Simulacao, i0: number, i1: number) => {
    const E0 = s.energiaEm(0);
    let m = 0;
    for (let i = i0; i < i1; i++) m = Math.max(m, Math.abs(s.energiaEm(i) / E0 - 1));
    return m;
  };

  it('Verlet: erro de energia limitado, sem deriva secular, em 1000 períodos', () => {
    const s = sim(p, 'verlet', dt, 0.12, 0);
    s.avancar(n);
    const inicio = derivaMax(s, 0, Math.floor(n / 10));
    const fim = derivaMax(s, Math.floor(0.9 * n), n);
    // amplitude da oscilação de energia do Verlet ≤ (ωΔt)²/4 ≈ 1,9e-4
    expect(derivaMax(s, 0, n)).toBeLessThan((wMax * dt) ** 2 / 4);
    expect(fim).toBeLessThan(1.5 * inicio);
  });

  it('RK4: dissipação numérica pequena e monotônica; Euler explícito: energia cresce sem limite', () => {
    const r = sim(p, 'rk4', dt, 0.12, 0);
    r.avancar(n);
    const dE = r.energiaEm(n) / r.energiaEm(0) - 1;
    expect(dE).toBeLessThan(0);
    expect(Math.abs(dE)).toBeLessThan(1e-4);
    const e = sim(p, 'euler', dt, 0.12, 0);
    e.avancar(5000);
    // por passo, cada modo ganha o fator (1 + ω²Δt²): em 5000 passos, pelo menos e^{5000·ω₋²Δt²} ≈ 24
    expect(e.energiaEm(5000) / e.energiaEm(0)).toBeGreaterThan(20);
  });

  it('as energias modais calculadas a partir do estado somam a energia total', () => {
    const an = modosNormais(p);
    const s = sim(p, 'verlet', 1e-3, 0.12, -0.03, 0.2, 0.1);
    s.avancar(5000);
    for (let i = 0; i <= 5000; i += 250) {
      const [ea, eb] = energiaModal(p, an, s.qEm(i, 0), s.qEm(i, 1), s.vEm(i, 0), s.vEm(i, 1));
      expect(Math.abs((ea + eb) / s.energiaEm(i) - 1)).toBeLessThan(1e-12);
    }
  });
});

describe('estado, histórico e relógio', () => {
  it('o histórico é a fonte única: retomar de um instante reproduz o futuro bit a bit', () => {
    const c = configDeValores({ ...valoresPadrao(osciladores.parametros), kc: 7.5, dt: 2 });
    const a = criarSimulacao(c);
    a.avancar(8000);
    const copia = a.bruto.slice(0, a.registros * a.largura);
    a.retomarDe(3000);
    expect(a.passos).toBe(3000);
    expect(a.t).toBe(3000 * c.dt);
    a.avancar(5000);
    expect(Array.from(a.bruto.slice(0, a.registros * a.largura))).toEqual(Array.from(copia));
  });

  it('o instante compartilhado (passos) reproduz exatamente o estado mostrado', () => {
    const v = { ...valoresPadrao(osciladores.parametros), m2: 2.5, kc: 6 };
    const s = criarSimulacao(configDeValores(v));
    s.avancar(4321);
    const sol = osciladores.resolver(v, { ...osciladores.extrasPadrao, passos: 4321 }).noInstante();
    expect(sol.x1).toBe(s.q[0]);
    expect(sol.x2).toBe(s.q[1]);
    expect(sol.t).toBe(s.t);
    expect(sol.E).toBe(s.energiaEm(4321));
  });

  it('o relógio físico não depende da taxa de quadros', () => {
    const total = 10; // s de tempo real
    const passos = (quadro: () => number) => {
      const r = new RelogioFixo(0.004);
      let t = 0;
      let n = 0;
      while (t < total - 1e-12) {
        const d = Math.min(quadro(), total - t);
        n += r.consumir(d);
        t += d;
      }
      return n;
    };
    const n60 = passos(() => 1 / 60);
    const n144 = passos(() => 1 / 144);
    let k = 0;
    const irregular = passos(() => [0.011, 0.016, 0.034, 0.008, 0.021][k++ % 5]);
    expect(Math.abs(n60 - 2500)).toBeLessThanOrEqual(1);
    expect(Math.abs(n144 - 2500)).toBeLessThanOrEqual(1);
    expect(Math.abs(irregular - 2500)).toBeLessThanOrEqual(1);
    const r = new RelogioFixo(0.004);
    r.velocidade = 0.25;
    let n = 0;
    for (let i = 0; i < 600; i++) n += r.consumir(1 / 60);
    expect(Math.abs(n - 625)).toBeLessThanOrEqual(1);
  });

  it('detecta divergência acima do passo crítico em vez de produzir números sem sentido', () => {
    const p: ParamOsc = { m1: 1, m2: 1, k1: 40, kc: 4, k2: 40 };
    const s = sim(p, 'verlet', 0.4, 0.1, 0); // ω₊Δt = 2,77 > 2
    s.avancar(5000);
    expect(s.divergiu).toBe(true);
    expect(s.passos).toBeLessThan(5000);
  });
});
