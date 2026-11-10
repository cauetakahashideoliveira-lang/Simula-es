/**
 * Dois osciladores acoplados — modelo físico (puro, sem DOM).
 *
 *   parede —k1— [m1] —kc— [m2] —k2— parede
 *
 * x1, x2: deslocamentos em relação ao equilíbrio (m), positivos para a direita.
 *   m1·x1'' = −k1·x1 − kc·(x1 − x2)
 *   m2·x2'' = −k2·x2 − kc·(x2 − x1)
 * Sem atrito: a energia total se conserva e serve de monitor do erro numérico.
 * Unidades SI (kg, N/m, m, s).
 */
import type { SistemaDinamico } from '../../nucleo/dinamica';

export interface ParamOsc {
  m1: number;
  m2: number;
  k1: number;
  kc: number;
  k2: number;
}

export interface CondicoesIniciais {
  x1: number;
  x2: number;
  v1: number;
  v2: number;
}

export function sistema(p: ParamOsc): SistemaDinamico {
  return {
    dim: 2,
    aceleracao(q, _v, _t, out) {
      const x1 = q[0];
      const x2 = q[1];
      out[0] = (-p.k1 * x1 - p.kc * (x1 - x2)) / p.m1;
      out[1] = (-p.k2 * x2 - p.kc * (x2 - x1)) / p.m2;
    },
    energia(q, v) {
      return energia(p, q[0], q[1], v[0], v[1]).total;
    },
  };
}

export interface Energia {
  /** energia "da massa 1": cinética + mola k1 */
  E1: number;
  /** energia "da massa 2": cinética + mola k2 */
  E2: number;
  /** energia potencial da mola de acoplamento */
  Ec: number;
  total: number;
}

export function energia(p: ParamOsc, x1: number, x2: number, v1: number, v2: number): Energia {
  const E1 = 0.5 * p.m1 * v1 * v1 + 0.5 * p.k1 * x1 * x1;
  const E2 = 0.5 * p.m2 * v2 * v2 + 0.5 * p.k2 * x2 * x2;
  const d = x1 - x2;
  const Ec = 0.5 * p.kc * d * d;
  return { E1, E2, Ec, total: E1 + E2 + Ec };
}

export interface Modos {
  /** frequências angulares (rad/s), baixa ≤ alta */
  omegaBaixa: number;
  omegaAlta: number;
  /**
   * Vetores dos modos nas coordenadas ponderadas pela massa (ortonormais):
   * e = M^{1/2} a / |M^{1/2} a|. As amplitudes físicas são a_i = e_i/√m_i.
   */
  eBaixa: [number, number];
  eAlta: [number, number];
  /** razão de amplitudes x2/x1 de cada modo (±∞ se x1 = 0) */
  razaoBaixa: number;
  razaoAlta: number;
  /** frequências dos osciladores isolados (kc = 0): √(k1/m1), √(k2/m2) */
  omega1Livre: number;
  omega2Livre: number;
}

/**
 * Modos normais em forma fechada. Com η = M^{1/2}x o problema vira
 * η'' = −D η, D simétrica 2×2: D = [[A, B], [B, C]],
 * A = (k1+kc)/m1, C = (k2+kc)/m2, B = −kc/√(m1 m2).
 */
export function modosNormais(p: ParamOsc): Modos {
  const A = (p.k1 + p.kc) / p.m1;
  const C = (p.k2 + p.kc) / p.m2;
  const B = -p.kc / Math.sqrt(p.m1 * p.m2);
  const media = (A + C) / 2;
  const dif = (A - C) / 2;
  const raiz = Math.hypot(dif, B);
  const lAlta = media + raiz;
  // forma estável para o autovalor baixo: det/λ_alta evita cancelamento
  const lBaixa = lAlta > 0 ? (A * C - B * B) / lAlta : media - raiz;
  // rotação que diagonaliza D: 2φ = atan2(2B, A − C); e_alta = (cos φ, sen φ)
  const fi = 0.5 * Math.atan2(2 * B, A - C);
  const c = Math.cos(fi);
  const s = Math.sin(fi);
  const eAlta: [number, number] = [c, s];
  const eBaixa: [number, number] = [-s, c];
  const razao = (e: [number, number]) => (e[1] / Math.sqrt(p.m2)) / (e[0] / Math.sqrt(p.m1));
  return {
    omegaBaixa: Math.sqrt(Math.max(0, lBaixa)),
    omegaAlta: Math.sqrt(lAlta),
    eBaixa,
    eAlta,
    razaoBaixa: razao(eBaixa),
    razaoAlta: razao(eAlta),
    omega1Livre: Math.sqrt(p.k1 / p.m1),
    omega2Livre: Math.sqrt(p.k2 / p.m2),
  };
}

/** Coordenadas modais ponderadas pela massa: η_j = e_j · (√m1·x1, √m2·x2). */
export function modais(p: ParamOsc, m: Modos, x1: number, x2: number): [number, number] {
  const a = Math.sqrt(p.m1) * x1;
  const b = Math.sqrt(p.m2) * x2;
  return [m.eBaixa[0] * a + m.eBaixa[1] * b, m.eAlta[0] * a + m.eAlta[1] * b];
}

/** Energia de cada modo (constante no movimento exato): ½(η'² + ω²η²). */
export function energiaModal(p: ParamOsc, m: Modos, x1: number, x2: number, v1: number, v2: number): [number, number] {
  const [q1, q2] = modais(p, m, x1, x2);
  const [u1, u2] = modais(p, m, v1, v2);
  return [0.5 * (u1 * u1 + m.omegaBaixa ** 2 * q1 * q1), 0.5 * (u2 * u2 + m.omegaAlta ** 2 * q2 * q2)];
}

/**
 * Solução exata por superposição dos modos — usada na interface para mostrar
 * o erro do integrador. (Os testes comparam com valores gerados fora daqui.)
 */
export function solucaoExata(p: ParamOsc, m: Modos, ci: CondicoesIniciais, t: number): [number, number, number, number] {
  const [q1, q2] = modais(p, m, ci.x1, ci.x2);
  const [u1, u2] = modais(p, m, ci.v1, ci.v2);
  const evo = (q: number, u: number, w: number): [number, number] => {
    if (w === 0) return [q + u * t, u];
    const c = Math.cos(w * t);
    const s = Math.sin(w * t);
    return [q * c + (u / w) * s, -q * w * s + u * c];
  };
  const [a, da] = evo(q1, u1, m.omegaBaixa);
  const [b, db] = evo(q2, u2, m.omegaAlta);
  const r1 = 1 / Math.sqrt(p.m1);
  const r2 = 1 / Math.sqrt(p.m2);
  return [
    (m.eBaixa[0] * a + m.eAlta[0] * b) * r1,
    (m.eBaixa[1] * a + m.eAlta[1] * b) * r2,
    (m.eBaixa[0] * da + m.eAlta[0] * db) * r1,
    (m.eBaixa[1] * da + m.eAlta[1] * db) * r2,
  ];
}

/** Período de batimento 2π/(ω_alta − ω_baixa); ∞ se as frequências coincidem. */
export function periodoBatimento(m: Modos): number {
  const d = m.omegaAlta - m.omegaBaixa;
  return d > 0 ? (2 * Math.PI) / d : Infinity;
}

/** Limite de estabilidade dos integradores explícitos de 2ª ordem: ω_máx·dt < 2. */
export function dtCritico(m: Modos): number {
  return 2 / m.omegaAlta;
}
