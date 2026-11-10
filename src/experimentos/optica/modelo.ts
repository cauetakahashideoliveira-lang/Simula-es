/**
 * Bancada de óptica — modelo físico (puro, sem DOM).
 *
 * SISTEMA
 *   Espelho côncavo de revolução (3D) com seção cônica:
 *       x² + y² − 2Rz + (1+κ)z² = 0        (folha do vértice, ρ = √(x²+y²) ≤ a)
 *   κ = 0 esfera, κ = −1 paraboloide. R > 0 é o raio de curvatura no vértice;
 *   a distância focal paraxial é f = R/2 para qualquer κ.
 *
 * COORDENADAS (mm)
 *   z: eixo óptico, origem no vértice V, POSITIVO NA FRENTE do espelho
 *      (o lado de onde vem a luz). O foco paraxial fica em z = +f.
 *   y: transversal no plano meridional (o plano desenhado na cena).
 *   x: transversal perpendicular à cena.
 *
 * FEIXE
 *   Colimado, direção d = (0, −sen α, −cos α). α = 0 é incidência paralela ao
 *   eixo; α > 0 significa luz vindo de cima. Um raio é identificado pelas
 *   coordenadas (u, v) na seção transversal do feixe: passa pelo ponto
 *       p0 = u·(0, cos α, −sen α) + v·(1, 0, 0)
 *   (plano por V perpendicular a d). Para α = 0, u é a altura y do raio.
 *
 * A cena mostra a seção meridional (v = 0) deste sistema 3D; raios meridionais
 * permanecem no plano. A mancha no anteparo usa o traçado 3D completo.
 *
 * HIPÓTESES: óptica geométrica; refletância 1; sem difração; o anteparo não
 * obstrui o feixe incidente.
 */

export type Vec3 = [number, number, number];

export interface Espelho {
  /** raio de curvatura no vértice (mm), > 0 */
  R: number;
  /** constante cônica */
  kappa: number;
  /** semidiâmetro da abertura (mm) */
  a: number;
}

export interface Feixe {
  /** ângulo de incidência (rad) */
  alfa: number;
  /** semilargura do feixe (mm); null = o feixe preenche exatamente a abertura */
  semiLargura: number | null;
}

/** Código do destino de um raio (compacto, para vetores tipados). */
export const Estado = {
  /** não atinge a superfície refletora */
  Perdido: 0,
  /** refletiu ao menos uma vez e saiu */
  Refletido: 1,
  /** atinge o verso do espelho */
  Bloqueado: 2,
  /** excedeu o número máximo de reflexões */
  Preso: 3,
} as const;
export type Estado = (typeof Estado)[keyof typeof Estado];

export type EstadoRaio = 'perdido' | 'refletido' | 'bloqueado' | 'preso';
const NOMES: EstadoRaio[] = ['perdido', 'refletido', 'bloqueado', 'preso'];
export const nomeEstado = (e: Estado): EstadoRaio => NOMES[e];

export const MAX_REFLEXOES = 64;

// ————— geometria da superfície —————

/** Flecha da superfície: z(ρ). */
export function flecha(e: Espelho, rho: number): number {
  const r2 = rho * rho;
  return r2 / (e.R + Math.sqrt(Math.max(0, e.R * e.R - (1 + e.kappa) * r2)));
}

/** Inclinação dz/dρ da superfície. */
export function inclinacao(e: Espelho, rho: number): number {
  return rho / Math.sqrt(Math.max(1e-300, e.R * e.R - (1 + e.kappa) * rho * rho));
}

/** Maior semidiâmetro geometricamente possível (a folha fecha em ρ = R/√(1+κ) se κ > −1). */
export function aberturaMaxima(R: number, kappa: number): number {
  return kappa > -1 ? R / Math.sqrt(1 + kappa) : Infinity;
}

/** Normal unitária (para a frente) no ponto p da superfície. */
export function normalEm(e: Espelho, p: Vec3): Vec3 {
  const nx = -p[0];
  const ny = -p[1];
  const nz = e.R - (1 + e.kappa) * p[2];
  const m = Math.hypot(nx, ny, nz);
  return [nx / m, ny / m, nz / m];
}

/** Lei vetorial da reflexão: r = d − 2(d·n)n. */
export function refletir(d: Vec3, n: Vec3): Vec3 {
  const k = 2 * (d[0] * n[0] + d[1] * n[1] + d[2] * n[2]);
  return [d[0] - k * n[0], d[1] - k * n[1], d[2] - k * n[2]];
}

/** Ângulo entre dois vetores: atan2(|a×b|, a·b) — bem condicionado perto de 0° e de 90°. */
export function anguloEntre(a: Vec3, b: Vec3): number {
  const cx = a[1] * b[2] - a[2] * b[1];
  const cy = a[2] * b[0] - a[0] * b[2];
  const cz = a[0] * b[1] - a[1] * b[0];
  return Math.atan2(Math.hypot(cx, cy, cz), a[0] * b[0] + a[1] * b[1] + a[2] * b[2]);
}

// ————— feixe —————

export function direcaoFeixe(alfa: number): Vec3 {
  return [0, -Math.sin(alfa), -Math.cos(alfa)];
}

/** Ponto p0 do raio (u, v): no plano por V perpendicular ao feixe. */
export function origemRaio(alfa: number, u: number, v: number): Vec3 {
  return [v, u * Math.cos(alfa), -u * Math.sin(alfa)];
}

/**
 * Intervalo de u coberto pelo feixe na seção meridional.
 * Com semiLargura = null o feixe é limitado pela abertura: são os raios que
 * atravessam o disco da borda do espelho.
 */
export function intervaloMeridional(e: Espelho, f: Feixe): [number, number] {
  if (f.semiLargura !== null) return [-f.semiLargura, f.semiLargura];
  const zb = flecha(e, e.a);
  const c = Math.cos(f.alfa);
  const s = Math.sin(f.alfa);
  return [-e.a * c - zb * s, e.a * c - zb * s];
}

// ————— traçado (núcleo sem alocação) —————

/** Resultado bruto de um traçado; os pontos de reflexão vão para um buffer do chamador. */
export interface Bruto {
  estado: Estado;
  /** número de reflexões ocorridas (pode exceder o que coube no buffer) */
  n: number;
  /** ponto de partida e direção unitária da semirreta final */
  px: number;
  py: number;
  pz: number;
  dx: number;
  dy: number;
  dz: number;
}

export function novoBruto(): Bruto {
  return { estado: Estado.Perdido, n: 0, px: 0, py: 0, pz: 0, dx: 0, dy: 0, dz: 0 };
}

/**
 * Traça um raio (origem o, direção unitária d) vindo de t = −∞.
 *
 * A cada passo resolve A t² + 2B t + C = 0 para a cônica, na forma
 * numericamente estável (sem cancelamento; trata A → 0, que ocorre para raios
 * paralelos ao eixo de um paraboloide), aceita a primeira raiz à frente que
 * esteja na folha do vértice e dentro da abertura, calcula a normal local e
 * reflete com r = d − 2(d·n)n.
 *
 * `pontos`/`dirs` (opcionais) recebem, por reflexão, o ponto de incidência e a
 * direção de saída (3 números cada), até `cap` reflexões a partir de `off`.
 */
export function tracarBruto(
  e: Espelho,
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  out: Bruto,
  pontos: Float64Array | null = null,
  dirs: Float64Array | null = null,
  off = 0,
  cap = 0,
): void {
  const R = e.R;
  const k1 = 1 + e.kappa;
  const a2 = e.a * e.a;
  const eps = 1e-9 * R;
  let tMin = -Infinity;
  let n = 0;
  let estado: Estado = Estado.Perdido;
  for (;;) {
    const A = dx * dx + dy * dy + k1 * dz * dz;
    const B = ox * dx + oy * dy + k1 * oz * dz - R * dz;
    const C = ox * ox + oy * oy + k1 * oz * oz - 2 * R * oz;
    let t1: number;
    let t2: number;
    if (Math.abs(A) < 1e-14) {
      // direção (quase) assintótica: equação linear
      if (B === 0) break;
      t1 = -C / (2 * B);
      t2 = Infinity;
    } else {
      const disc = B * B - A * C;
      if (disc < 0) break;
      const q = -(B + (B >= 0 ? 1 : -1) * Math.sqrt(disc));
      t1 = q / A;
      t2 = q !== 0 ? C / q : t1;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
    }
    let achou = false;
    let hx = 0, hy = 0, hz = 0;
    for (let c = 0; c < 2; c++) {
      const t = c === 0 ? t1 : t2;
      if (!(t > tMin) || t === Infinity) continue;
      hx = ox + t * dx;
      hy = oy + t * dy;
      hz = oz + t * dz;
      if (!(R - k1 * hz > 0)) continue; // folha do vértice
      if (hx * hx + hy * hy > a2) continue; // abertura
      achou = true;
      break;
    }
    if (!achou) break;
    // normal local (para a frente)
    let nx = -hx;
    let ny = -hy;
    let nz = R - k1 * hz;
    const nm = Math.hypot(nx, ny, nz);
    nx /= nm;
    ny /= nm;
    nz /= nm;
    const dn = dx * nx + dy * ny + dz * nz;
    ox = hx;
    oy = hy;
    oz = hz;
    if (!(dn < 0)) {
      estado = Estado.Bloqueado;
      break;
    }
    // reflexão vetorial + renormalização (não acumula erro em reflexões múltiplas)
    let rx = dx - 2 * dn * nx;
    let ry = dy - 2 * dn * ny;
    let rz = dz - 2 * dn * nz;
    const rm = Math.hypot(rx, ry, rz);
    rx /= rm;
    ry /= rm;
    rz /= rm;
    dx = rx;
    dy = ry;
    dz = rz;
    if (n < cap) {
      const o = off + 3 * n;
      if (pontos) {
        pontos[o] = hx;
        pontos[o + 1] = hy;
        pontos[o + 2] = hz;
      }
      if (dirs) {
        dirs[o] = dx;
        dirs[o + 1] = dy;
        dirs[o + 2] = dz;
      }
    }
    n++;
    estado = Estado.Refletido;
    tMin = eps;
    if (n >= MAX_REFLEXOES) {
      estado = Estado.Preso;
      break;
    }
  }
  out.estado = estado;
  out.n = n;
  out.px = ox;
  out.py = oy;
  out.pz = oz;
  out.dx = dx;
  out.dy = dy;
  out.dz = dz;
}

// ————— traçado detalhado de um raio —————

export interface Reflexao {
  /** ponto de incidência */
  p: Vec3;
  /** normal unitária apontando para a frente do espelho */
  n: Vec3;
  /** direções unitárias de chegada e de saída */
  dEntra: Vec3;
  dSai: Vec3;
  /** ângulo entre −dEntra e n (rad) */
  thetaI: number;
  /** ângulo entre dSai e n (rad) — medido a partir do raio refletido, não copiado de thetaI */
  thetaR: number;
}

export interface Traco {
  u: number;
  v: number;
  origem: Vec3;
  d0: Vec3;
  estado: EstadoRaio;
  reflexoes: Reflexao[];
  /** semirreta final: ponto de partida e direção unitária */
  pFinal: Vec3;
  dFinal: Vec3;
}

const B0 = novoBruto();
const PTS = new Float64Array(3 * MAX_REFLEXOES);
const DIRS = new Float64Array(3 * MAX_REFLEXOES);

export function tracar(e: Espelho, alfa: number, u: number, v = 0): Traco {
  const d0 = direcaoFeixe(alfa);
  const origem = origemRaio(alfa, u, v);
  tracarBruto(e, origem[0], origem[1], origem[2], d0[0], d0[1], d0[2], B0, PTS, DIRS, 0, MAX_REFLEXOES);
  const reflexoes: Reflexao[] = [];
  let dEntra = d0;
  for (let i = 0; i < B0.n; i++) {
    const p: Vec3 = [PTS[3 * i], PTS[3 * i + 1], PTS[3 * i + 2]];
    const dSai: Vec3 = [DIRS[3 * i], DIRS[3 * i + 1], DIRS[3 * i + 2]];
    const n = normalEm(e, p);
    reflexoes.push({
      p,
      n,
      dEntra,
      dSai,
      thetaI: anguloEntre([-dEntra[0], -dEntra[1], -dEntra[2]], n),
      thetaR: anguloEntre(dSai, n),
    });
    dEntra = dSai;
  }
  return {
    u,
    v,
    origem,
    d0,
    estado: nomeEstado(B0.estado),
    reflexoes,
    pFinal: [B0.px, B0.py, B0.pz],
    dFinal: [B0.dx, B0.dy, B0.dz],
  };
}

/**
 * Onde o raio emergente (após a última reflexão) cruza o eixo óptico.
 * Definido apenas para raios meridionais (x = 0) refletidos; devolve z ou null.
 */
export function cruzamentoEixo(tr: Traco): number | null {
  if (tr.estado !== 'refletido') return null;
  const p = tr.pFinal;
  const d = tr.dFinal;
  if (Math.abs(p[0]) > 1e-9 || Math.abs(d[0]) > 1e-12) return null;
  return cruzamentoEixoYZ(p[1], p[2], d[1], d[2]);
}

/** Cruzamento com y = 0 da semirreta (py, pz) + t·(dy, dz), t > 0; NaN→null. */
export function cruzamentoEixoYZ(py: number, pz: number, dy: number, dz: number): number | null {
  if (dy === 0) return null;
  const t = -py / dy;
  if (!(t > 0)) return null;
  return pz + t * dz;
}

export interface Impacto {
  x: number;
  y: number;
  /** índice do segmento refletido que cruza o plano (0 = após a 1ª reflexão) */
  segmento: number;
}

/**
 * Primeira passagem de um segmento REFLETIDO pelo plano z = zs.
 * O feixe incidente não é registrado (o anteparo não o obstrui).
 */
export function noPlano(tr: Traco, zs: number): Impacto | null {
  const n = tr.reflexoes.length;
  for (let i = 0; i < n; i++) {
    const p = tr.reflexoes[i].p;
    const d = tr.reflexoes[i].dSai;
    if (d[2] === 0) continue;
    const t = (zs - p[2]) / d[2];
    if (!(t > 0)) continue;
    if (i + 1 < n) {
      const q = tr.reflexoes[i + 1].p;
      const tMax = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
      if (t > tMax) continue;
    } else if (tr.estado !== 'refletido') continue;
    return { x: p[0] + t * d[0], y: p[1] + t * d[1], segmento: i };
  }
  return null;
}

/** Imagem paraxial de um feixe colimado com inclinação α: (y, z) = (−f·tan α, f). */
export function imagemParaxial(e: Espelho, alfa: number): { y: number; z: number } {
  const f = e.R / 2;
  return { y: -f * Math.tan(alfa), z: f };
}

/**
 * Referência analítica exibida na camada de explicação (não usada nos testes
 * como valor esperado): esfera, raio paralelo ao eixo à altura h,
 * z× = R − R/(2 cos θ), sen θ = h/R.
 */
export function cruzamentoEsferaAnalitico(R: number, h: number): number {
  const s = h / R;
  return R - R / (2 * Math.sqrt(1 - s * s));
}
