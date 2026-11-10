/**
 * Verificação científica da bancada de óptica.
 *
 * Regra: o valor esperado nunca vem da função de produção. As referências são
 *  (a) valores de alta precisão gerados por um programa independente
 *      (tests/referencia/gerar_optica.py, mpmath, outra formulação);
 *  (b) resultados analíticos clássicos escritos aqui mesmo;
 *  (c) invariantes físicos (lei da reflexão medida com uma normal obtida por
 *      diferenças finitas, invariante de obliquidade, caminho óptico).
 *
 * Unidades: mm e radianos, salvo indicação.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  tracar,
  cruzamentoEixo,
  noPlano,
  flecha,
  intervaloMeridional,
  type Espelho,
  type Vec3,
} from '../src/experimentos/optica/modelo';
import { resolver, tracarLeque, medirAnteparo, mancha, type Config } from '../src/experimentos/optica/analise';
import { optica, configDeValores } from '../src/experimentos/optica/definicao';
import { valoresPadrao } from '../src/nucleo/parametros';
import { medir } from '../src/nucleo/experimento';

const grau = Math.PI / 180;

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norma = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);

/** Gerador determinístico (LCG) para casos pseudoaleatórios reproduzíveis. */
function lcg(semente: number) {
  let s = semente >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Normal por diferenças finitas centrais de F = x²+y²−2Rz+(1+κ)z² — independente de normalEm(). */
function normalNumerica(e: Espelho, p: Vec3): Vec3 {
  const F = (x: number, y: number, z: number) => x * x + y * y - 2 * e.R * z + (1 + e.kappa) * z * z;
  const h = 1e-4 * e.R;
  const g: Vec3 = [
    (F(p[0] + h, p[1], p[2]) - F(p[0] - h, p[1], p[2])) / (2 * h),
    (F(p[0], p[1] + h, p[2]) - F(p[0], p[1] - h, p[2])) / (2 * h),
    (F(p[0], p[1], p[2] + h) - F(p[0], p[1], p[2] - h)) / (2 * h),
  ];
  const m = norma(g);
  // o gradiente aponta para fora da cônica (para trás do espelho); a normal de reflexão é a oposta
  return [-g[0] / m, -g[1] / m, -g[2] / m];
}

describe('lei da reflexão (normal local, forma vetorial)', () => {
  it('θi = θr, coplanaridade e |r| = 1 em 2000 raios 3D sobre cônicas variadas', () => {
    const rnd = lcg(20261110);
    let testados = 0;
    let pior = 0;
    for (let k = 0; k < 4000 && testados < 2000; k++) {
      const R = 50 + 2000 * rnd();
      const kappa = [-2, -1, -0.5, 0, 0.3][Math.floor(rnd() * 5)];
      const a = (0.1 + 0.8 * rnd()) * R * (kappa > 0 ? 0.8 : 1);
      const e: Espelho = { R, kappa, a };
      const alfa = (rnd() * 40 - 20) * grau;
      const u = (rnd() * 2 - 1) * a;
      const v = (rnd() * 2 - 1) * a;
      const tr = tracar(e, alfa, u, v);
      for (const r of tr.reflexoes) {
        const n = normalNumerica(e, r.p);
        // o ponto está na superfície, dentro da abertura
        const F = r.p[0] ** 2 + r.p[1] ** 2 - 2 * R * r.p[2] + (1 + kappa) * r.p[2] ** 2;
        expect(Math.abs(F)).toBeLessThan(1e-9 * R * R);
        expect(Math.hypot(r.p[0], r.p[1])).toBeLessThanOrEqual(a * (1 + 1e-12));
        const ti = Math.acos(Math.min(1, -dot(r.dEntra, n)));
        const trf = Math.acos(Math.min(1, dot(r.dSai, n)));
        // tolerância 1e-7 rad: erro da normal por diferenças finitas (F é quadrática, logo exato a ~1e-10) + acos perto de 0
        pior = Math.max(pior, Math.abs(ti - trf));
        expect(Math.abs(ti - trf)).toBeLessThan(1e-7);
        // os ângulos reportados pelo modelo coincidem com os medidos aqui
        expect(Math.abs(r.thetaI - ti)).toBeLessThan(1e-7);
        expect(Math.abs(r.thetaR - trf)).toBeLessThan(1e-7);
        // incidente, normal e refletido no mesmo plano
        expect(Math.abs(dot(cross(r.dEntra, r.dSai), n))).toBeLessThan(1e-9);
        expect(Math.abs(norma(r.dSai) - 1)).toBeLessThan(1e-14);
        testados++;
      }
    }
    expect(testados).toBeGreaterThanOrEqual(2000);
    expect(pior).toBeLessThan(1e-7);
  });

  it('conserva o invariante de obliquidade x·k_y − y·k_x (simetria de revolução)', () => {
    const rnd = lcg(7);
    for (let k = 0; k < 500; k++) {
      const e: Espelho = { R: 400, kappa: k % 2 ? 0 : -1, a: 150 };
      const alfa = (rnd() * 16 - 8) * grau;
      const tr = tracar(e, alfa, (rnd() * 2 - 1) * 100, (rnd() * 2 - 1) * 100);
      if (tr.estado !== 'refletido') continue;
      const antes = tr.origem[0] * tr.d0[1] - tr.origem[1] * tr.d0[0];
      const depois = tr.pFinal[0] * tr.dFinal[1] - tr.pFinal[1] * tr.dFinal[0];
      // grandeza da ordem de 100 mm; 1e-11 mm ≈ 500 ulp
      expect(Math.abs(antes - depois)).toBeLessThan(1e-11);
    }
  });
});

describe('limite paraxial do espelho esférico', () => {
  const R = 400;
  const e: Espelho = { R, kappa: 0, a: 150 };
  it('z× → f = R/2 quando h → 0, com desvio de 3ª ordem f − z× → h²/(4R)', () => {
    for (const h of [40, 12, 4, 1.2]) {
      const z = cruzamentoEixo(tracar(e, 0, h))!;
      const s2 = (h / R) ** 2;
      // série exata: f − z× = (h²/4R)(1 + ¾ s² + O(s⁴)); a razão difere de 1 por menos de s²
      const razao = (R / 2 - z) / ((h * h) / (4 * R));
      expect(Math.abs(razao - 1)).toBeLessThan(s2);
      expect(razao).toBeGreaterThan(1); // o marginal cruza ANTES do foco paraxial (mais perto do espelho)
    }
    const z = cruzamentoEixo(tracar(e, 0, 1e-3))!;
    // h = 1 µm: h²/4R = 6e-10 mm; condicionamento do cruzamento ~ ulp·R/(2h/R) ≈ 1e-8 mm
    expect(Math.abs(z - R / 2)).toBeLessThan(5e-8);
  });

  it('para uma cônica geral o coeficiente de 3ª ordem é (1+κ)·h²/(4R)', () => {
    for (const kappa of [-2, -0.5, 0.3]) {
      const c: Espelho = { R, kappa, a: 150 };
      const h = 4;
      const z = cruzamentoEixo(tracar(c, 0, h))!;
      const razao = (R / 2 - z) / (((1 + kappa) * h * h) / (4 * R));
      expect(Math.abs(razao - 1)).toBeLessThan(5 * (h / R) ** 2);
    }
  });

  it('largura no foco paraxial segue a aberração transversal de 3ª ordem: W → a³/R²', () => {
    for (const a of [8, 16, 32]) {
      const L = tracarLeque({ R, kappa: 0, a }, 0, -a, a, 4001, 'extremos', R / 2);
      const m = medirAnteparo(L, 1e9);
      // W = 2·TA(a), TA = a³/(2R²)(1 + O(a²/R²)); o termo seguinte é ~ (9/4)(a/R)²
      const razao = m.W / (a ** 3 / R ** 2);
      expect(Math.abs(razao - 1)).toBeLessThan(3 * (a / R) ** 2 + 1e-6);
    }
  });
});

describe('espelho parabólico: raios paralelos ao eixo', () => {
  const R = 400;
  const f = R / 2;
  const e: Espelho = { R, kappa: -1, a: 380 };
  it('todos cruzam o eixo em z = f', () => {
    for (const h of [1e-3, 0.5, 20, 100, 199.9, 200.1, 300, 379.9]) {
      const tr = tracar(e, 0, h);
      expect(tr.reflexoes.length).toBe(1);
      const z = cruzamentoEixo(tr)!;
      // condicionamento: δz ≈ ulp(R)·(1/|d_y| + 1); |d_y| = sen 2θ, tan θ = h/R
      const teta = Math.atan(h / R);
      const tol = 2e-13 * R * (1 / Math.abs(Math.sin(2 * teta)) + 1);
      expect(Math.abs(z - f)).toBeLessThan(tol);
    }
  });

  it('caminho óptico plano de referência → espelho → foco é o mesmo para todos (Fermat)', () => {
    const z0 = 500;
    const esperado = z0 + f; // propriedade foco–diretriz da parábola
    for (const h of [0.01, 10, 150, 370]) {
      const tr = tracar(e, 0, h);
      const p = tr.reflexoes[0].p;
      const caminho = z0 - p[2] + Math.hypot(p[1], p[2] - f);
      expect(Math.abs(caminho - esperado)).toBeLessThan(1e-12 * (z0 + f) * 4);
    }
  });

  it('mancha 3D no foco: raio RMS nulo dentro do arredondamento', () => {
    const cfg: Config = {
      espelho: { R, kappa: -1, a: 150 }, feixe: { alfa: 0, semiLargura: null },
      zs: f, H: 50, opaco: true, nMed: 2001, nMancha: 3000, prova: null,
    };
    const m = mancha(cfg);
    expect(m.validos).toBe(3000);
    expect(m.rRms).toBeLessThan(1e-10); // mm; contra ~1 mm da esfera equivalente
  });
});

// ————— referência independente (mpmath) —————

interface CasoRef {
  R: number; kappa: number; a: number; alpha_deg: number; u: number; v: number; z_s: number;
  status: 'hit' | 'miss'; bounces: number;
  P1: Vec3 | null; n1: Vec3 | null; theta_i_deg: number | null;
  dir_out: Vec3 | null; P_last: Vec3 | null; z_cross: number | null; screen: [number, number] | null;
  nota: string;
}

describe('comparação com a referência independente de alta precisão', () => {
  const ref = JSON.parse(readFileSync(new URL('./referencia/optica.json', import.meta.url), 'utf8')) as { casos: CasoRef[] };

  it('tem casos suficientes e variados', () => {
    expect(ref.casos.length).toBeGreaterThanOrEqual(50);
    expect(ref.casos.some((c) => c.bounces >= 2)).toBe(true);
    expect(ref.casos.some((c) => c.status === 'miss')).toBe(true);
    expect(ref.casos.some((c) => c.v !== 0)).toBe(true);
  });

  it.each(ref.casos.map((c, i) => [i, c.nota, c] as const))('caso %i — %s', (_i, _nota, c) => {
    const e: Espelho = { R: c.R, kappa: c.kappa, a: c.a };
    const tr = tracar(e, c.alpha_deg * grau, c.u, c.v);
    expect(tr.estado === 'refletido' ? 'hit' : 'miss').toBe(c.status);
    expect(tr.reflexoes.length).toBe(c.bounces);
    if (c.status === 'miss') {
      expect(noPlano(tr, c.z_s)).toBeNull();
      return;
    }
    // posições: 1e-12·R por reflexão (erro de arredondamento acumulado em cadeia)
    const tolP = 2e-12 * c.R * c.bounces;
    const r0 = tr.reflexoes[0];
    for (let k = 0; k < 3; k++) {
      expect(Math.abs(r0.p[k] - c.P1![k])).toBeLessThan(tolP);
      expect(Math.abs(r0.n[k] - c.n1![k])).toBeLessThan(1e-13);
      expect(Math.abs(tr.dFinal[k] - c.dir_out![k])).toBeLessThan(2e-13 * c.bounces);
      expect(Math.abs(tr.pFinal[k] - c.P_last![k])).toBeLessThan(tolP);
    }
    expect(Math.abs(r0.thetaI / grau - c.theta_i_deg!)).toBeLessThan(1e-11);
    expect(Math.abs(r0.thetaR / grau - c.theta_i_deg!)).toBeLessThan(1e-11);
    // cruzamento com o eixo: mal condicionado para raios quase paralelos ao eixo (|d_y| pequeno)
    const zx = cruzamentoEixo(tr);
    if (c.z_cross === null) expect(zx).toBeNull();
    else {
      const tolZ = (4e-13 * c.R * c.bounces) / Math.max(1e-9, Math.abs(tr.dFinal[1])) + tolP;
      expect(zx).not.toBeNull();
      expect(Math.abs(zx! - c.z_cross)).toBeLessThan(tolZ);
    }
    const imp = noPlano(tr, c.z_s);
    if (c.screen === null) expect(imp).toBeNull();
    else {
      expect(imp).not.toBeNull();
      // propagação até o plano: erro de direção × distância percorrida (≲ 3R) / |d_z|
      const tolS = (2e-12 * c.R * c.bounces * 3) / Math.max(0.02, Math.abs(tr.dFinal[2])) + tolP;
      expect(Math.abs(imp!.x - c.screen[0])).toBeLessThan(tolS);
      expect(Math.abs(imp!.y - c.screen[1])).toBeLessThan(tolS);
    }
  });
});

describe('limites geométricos e casos de borda', () => {
  const e: Espelho = { R: 400, kappa: 0, a: 100 };

  it('a abertura decide entre refletir e passar ao lado', () => {
    expect(tracar(e, 0, 100 - 1e-9).estado).toBe('refletido');
    expect(tracar(e, 0, 100 + 1e-9).estado).toBe('perdido');
    expect(tracar(e, 0, -100 + 1e-9).estado).toBe('refletido');
    expect(tracar(e, 0, -100 - 1e-9).estado).toBe('perdido');
    // em 3D o critério é radial
    expect(tracar(e, 0, 80, 59.9).estado).toBe('refletido');
    expect(tracar(e, 0, 80, 60.1).estado).toBe('perdido');
  });

  it('o raio sobre o eixo volta por ele e não define cruzamento', () => {
    const tr = tracar(e, 0, 0);
    expect(tr.estado).toBe('refletido');
    expect(Math.abs(tr.dFinal[1])).toBe(0);
    expect(tr.dFinal[2]).toBeCloseTo(1, 15);
    expect(cruzamentoEixo(tr)).toBeNull();
  });

  it('anteparo atrás do vértice ou do qual o raio se afasta não é atingido', () => {
    const tr = tracar(e, 0, 50);
    expect(noPlano(tr, -10)).toBeNull();
    expect(noPlano(tr, 0)).toBeNull(); // o ponto de incidência tem z > 0 e o raio vai para a frente
    expect(noPlano(tr, 150)).not.toBeNull();
    expect(noPlano(tracar(e, 0, 120), 150)).toBeNull(); // raio que nem refletiu
  });

  it('na esfera, a segunda reflexão ocorre quando a corda refletida volta a cair dentro da abertura', () => {
    // Geometria do círculo: o raio refletido é uma corda que avança π − 2θ em torno de C.
    // Partindo do ângulo polar θ, ele reencontra o círculo em φ = 3θ − π; há nova reflexão
    // se |3θ − π| ≤ θ_a, com sen θ_a = a/R. Limiar: θ* = (π − θ_a)/3.
    const R = 400;
    for (const a of [300, 380, 395]) {
      const g: Espelho = { R, kappa: 0, a };
      const tetaA = Math.asin(a / R);
      const hLimiar = R * Math.sin((Math.PI - tetaA) / 3);
      expect(tracar(g, 0, hLimiar - 0.5).reflexoes.length).toBe(1);
      expect(tracar(g, 0, hLimiar + 0.5).reflexoes.length).toBeGreaterThanOrEqual(2);
    }
    // o raio marginal só reflete duas vezes se θ_a ≥ 45°, isto é, a/R ≥ sen 45°
    const lim = R * Math.SQRT1_2;
    expect(tracar({ R, kappa: 0, a: lim - 1 }, 0, (lim - 1) * (1 - 1e-9)).reflexoes.length).toBe(1);
    expect(tracar({ R, kappa: 0, a: lim + 1 }, 0, (lim + 1) * (1 - 1e-9)).reflexoes.length).toBe(2);
    // numa corda da esfera o ângulo de incidência se repete a cada reflexão
    const tr = tracar({ R, kappa: 0, a: 395 }, 0, 385);
    expect(tr.reflexoes.length).toBeGreaterThanOrEqual(2);
    for (const r of tr.reflexoes) expect(Math.abs(r.thetaI - tr.reflexoes[0].thetaI)).toBeLessThan(1e-12);
  });

  it('com o feixe limitado pela abertura e inclinado, os raios marginais tocam a borda', () => {
    for (const alfaG of [-12, 3, 20]) {
      const alfa = alfaG * grau;
      const [u0, u1] = intervaloMeridional(e, { alfa, semiLargura: null });
      for (const [u, sinal] of [[u0 + 1e-9, -1], [u1 - 1e-9, 1]] as const) {
        const tr = tracar(e, alfa, u);
        expect(tr.estado).toBe('refletido');
        expect(Math.abs(tr.reflexoes[0].p[1] - sinal * e.a)).toBeLessThan(1e-6);
        expect(Math.abs(tr.reflexoes[0].p[2] - flecha(e, e.a))).toBeLessThan(1e-6);
      }
      expect(tracar(e, alfa, u1 + 1e-6).estado).toBe('perdido');
      expect(tracar(e, alfa, u0 - 1e-6).estado).toBe('perdido');
    }
  });

  it('a superfície e a normal degeneram corretamente para escalas muito diferentes', () => {
    for (const R of [20, 400, 10000]) {
      const c: Espelho = { R, kappa: 0, a: 0.5 * R };
      const z = cruzamentoEixo(tracar(c, 0, 0.3 * R))!;
      const esperado = R - R / (2 * Math.sqrt(1 - 0.09)); // triângulo isósceles C–P–X
      expect(Math.abs(z - esperado)).toBeLessThan(1e-12 * R);
    }
  });
});

describe('instrumentos de análise', () => {
  it('leque em lote e traçado detalhado dão os mesmos números', () => {
    const e: Espelho = { R: 400, kappa: 0, a: 380 };
    const alfa = 4 * grau;
    const [u0, u1] = intervaloMeridional(e, { alfa, semiLargura: null });
    const L = tracarLeque(e, alfa, u0, u1, 301, 'centros', 150);
    for (let i = 0; i < L.n; i += 7) {
      const tr = tracar(e, alfa, L.u[i]);
      expect(L.nRefl[i]).toBe(tr.reflexoes.length);
      const zx = cruzamentoEixo(tr);
      if (zx === null) expect(Number.isNaN(L.zCruz[i])).toBe(true);
      else expect(L.zCruz[i]).toBe(zx);
      const imp = noPlano(tr, 150);
      if (imp === null) expect(Number.isNaN(L.yImp[i])).toBe(true);
      else expect(L.yImp[i]).toBe(imp.y);
    }
  });

  it('mancha 3D da esfera no foco paraxial: r_RMS → a³/(4R²) (3ª ordem, pupila uniforme)', () => {
    const R = 400;
    const a = 12;
    const cfg: Config = {
      espelho: { R, kappa: 0, a }, feixe: { alfa: 0, semiLargura: null },
      zs: R / 2, H: 50, opaco: true, nMed: 2001, nMancha: 20000, prova: null,
    };
    const m = mancha(cfg);
    // ε(ρ) = a³ρ³/(2R²); ⟨ρ⁶⟩ = 1/4 em área ⇒ r_RMS = a³/(4R²). Tolerância: ordem seguinte (a/R)² + amostragem 1/N
    const esperado = a ** 3 / (4 * R * R);
    expect(Math.abs(m.rRms / esperado - 1)).toBeLessThan(0.01);
    expect(Math.hypot(m.cx, m.cy)).toBeLessThan(1e-3 * esperado * 10);
  });

  it('a troca esfera → parábola preserva abertura, anteparo e feixe e colapsa a largura', () => {
    const v = { ...valoresPadrao(optica.parametros), a: 150, zs: 200 };
    const x = { ...optica.extrasPadrao };
    const esf = resolver(configDeValores({ ...v, kappa: 0 }, x));
    const par = resolver(configDeValores({ ...v, kappa: -1 }, x));
    expect(par.cfg.espelho.a).toBe(esf.cfg.espelho.a);
    expect(par.cfg.zs).toBe(esf.cfg.zs);
    expect(par.intervalo).toEqual(esf.intervalo);
    expect(par.f).toBe(esf.f);
    expect(esf.anteparo.W).toBeGreaterThan(10); // mm
    expect(par.anteparo.W).toBeLessThan(1e-9); // mm
  });

  it('a largura medida converge com a amostragem (erro de discretização controlado)', () => {
    const v = { ...valoresPadrao(optica.parametros), a: 120, zs: 196 };
    const W = (n: number) => resolver(configDeValores({ ...v, nMed: n }, optica.extrasPadrao)).anteparo.W;
    const w1 = W(1001), w2 = W(4001), w3 = W(16001);
    expect(Math.abs(w2 - w3)).toBeLessThan(Math.abs(w1 - w3) + 1e-12);
    expect(Math.abs(w2 - w3) / w3).toBeLessThan(2e-3);
  });

  it('os observáveis podem ser lidos sem renderizador', () => {
    const m = medir(optica, { ...valoresPadrao(optica.parametros), a: 100 }, { ...optica.extrasPadrao, prova: 1 });
    const por = Object.fromEntries(m.map((x) => [x.id, x.valor]));
    expect(por.f).toBe(200);
    // referência analítica (triângulo isósceles): z× = R − R/(2cos θ), sen θ = h/R, h = 100(1−1e-9)
    const h = 100 * (1 - 1e-9);
    const esperado = 400 - 400 / (2 * Math.sqrt(1 - (h / 400) ** 2));
    expect(Math.abs((por.prova_z as number) - esperado)).toBeLessThan(1e-10);
    expect(por.prova_theta_i).toBeCloseTo(por.prova_theta_r as number, 12);
  });
});
