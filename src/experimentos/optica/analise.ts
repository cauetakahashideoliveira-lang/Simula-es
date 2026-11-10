/**
 * Bancada de óptica — instrumentos de análise (puros, sem DOM).
 *
 * Tudo o que é medido sai daqui: leque meridional denso, estatísticas no
 * anteparo, mancha 3D, aberração longitudinal, varredura do anteparo e
 * cáustica. A cena e os gráficos apenas desenham estes resultados.
 */
import {
  Estado,
  flecha,
  intervaloMeridional,
  novoBruto,
  tracar,
  tracarBruto,
  cruzamentoEixo,
  cruzamentoEixoYZ,
  noPlano,
  imagemParaxial,
  type Espelho,
  type Feixe,
  type Traco,
} from './modelo';

export interface Config {
  espelho: Espelho;
  feixe: Feixe;
  /** posição do anteparo (mm) e seu raio (semi-altura na seção) */
  zs: number;
  H: number;
  /** anteparo opaco: o raio refletido termina nele; transparente: plano de detecção */
  opaco: boolean;
  /** raios no leque meridional de medida e na mancha 3D */
  nMed: number;
  nMancha: number;
  /** raio de prova: coordenada de pupila normalizada em [−1, 1], ou null */
  prova: number | null;
}

/** reflexões guardadas por raio nos leques (o traçado segue além disso, só não guarda) */
export const MAXP = 8;

/** Leque de raios meridionais em vetores tipados (sem objetos por raio). */
export interface Leque {
  n: number;
  uMin: number;
  uMax: number;
  /** largura da célula que cada raio representa (pesos iguais) */
  du: number;
  u: Float64Array;
  estado: Uint8Array;
  nRefl: Uint8Array;
  /** n × MAXP × 3: pontos de reflexão (x, y, z) */
  pontos: Float64Array;
  /** n × MAXP × 3: direção de saída após cada reflexão */
  dirs: Float64Array;
  /** n × 3: semirreta final */
  pFinal: Float64Array;
  dFinal: Float64Array;
  /** z do cruzamento do raio emergente com o eixo (NaN se não cruza) */
  zCruz: Float64Array;
  /** y do impacto no plano do anteparo (NaN se não passa pelo plano) */
  yImp: Float64Array;
  /** índice do segmento refletido que atinge o plano (−1 se nenhum) */
  segImp: Int8Array;
}

const B = novoBruto();

/**
 * Traça `n` raios meridionais com u uniforme em [uMin, uMax].
 *  - 'centros': u no centro de n células iguais (amostragem de medida; evita a borda exata).
 *  - 'extremos': inclui os dois raios marginais, recuados de 10⁻⁹ da largura (desenho).
 */
export function tracarLeque(
  e: Espelho,
  alfa: number,
  uMin: number,
  uMax: number,
  n: number,
  modo: 'centros' | 'extremos',
  zs: number,
): Leque {
  const L: Leque = {
    n,
    uMin,
    uMax,
    du: (uMax - uMin) / n,
    u: new Float64Array(n),
    estado: new Uint8Array(n),
    nRefl: new Uint8Array(n),
    pontos: new Float64Array(n * MAXP * 3),
    dirs: new Float64Array(n * MAXP * 3),
    pFinal: new Float64Array(n * 3),
    dFinal: new Float64Array(n * 3),
    zCruz: new Float64Array(n),
    yImp: new Float64Array(n),
    segImp: new Int8Array(n),
  };
  const c = Math.cos(alfa);
  const s = Math.sin(alfa);
  const largura = uMax - uMin;
  const recuo = 1e-9 * largura;
  for (let i = 0; i < n; i++) {
    let u: number;
    if (modo === 'centros') u = uMin + ((i + 0.5) / n) * largura;
    else if (n === 1) u = (uMin + uMax) / 2;
    else {
      u = uMin + (i / (n - 1)) * largura;
      if (i === 0) u += recuo;
      else if (i === n - 1) u -= recuo;
    }
    L.u[i] = u;
    const off = i * MAXP * 3;
    tracarBruto(e, 0, u * c, -u * s, 0, -s, -c, B, L.pontos, L.dirs, off, MAXP);
    L.estado[i] = B.estado;
    L.nRefl[i] = Math.min(255, B.n);
    L.pFinal[3 * i] = B.px;
    L.pFinal[3 * i + 1] = B.py;
    L.pFinal[3 * i + 2] = B.pz;
    L.dFinal[3 * i] = B.dx;
    L.dFinal[3 * i + 1] = B.dy;
    L.dFinal[3 * i + 2] = B.dz;
    let zx = NaN;
    if (B.estado === Estado.Refletido) {
      const z = cruzamentoEixoYZ(B.py, B.pz, B.dy, B.dz);
      if (z !== null) zx = z;
    }
    L.zCruz[i] = zx;
  }
  projetarNoPlano(L, zs);
  return L;
}

/** y do impacto do raio i no plano z (primeiro segmento refletido que o cruza); NaN se nenhum. */
export function impactoNoPlano(L: Leque, i: number, z: number): number {
  const nr = L.nRefl[i];
  if (nr === 0) return NaN;
  const guardados = Math.min(nr, MAXP);
  const base = i * MAXP * 3;
  for (let k = 0; k < guardados; k++) {
    const o = base + 3 * k;
    const py = L.pontos[o + 1];
    const pz = L.pontos[o + 2];
    const dy = L.dirs[o + 1];
    const dz = L.dirs[o + 2];
    if (dz === 0) continue;
    const t = (z - pz) / dz;
    if (!(t > 0)) continue;
    if (k + 1 < nr) {
      if (k + 1 >= guardados) return NaN;
      const qy = L.pontos[o + 4];
      const qz = L.pontos[o + 5];
      if (t > Math.hypot(qy - py, qz - pz)) continue;
    } else if (L.estado[i] !== Estado.Refletido) continue;
    SEG = k;
    return py + t * dy;
  }
  return NaN;
}
let SEG = -1;

export function projetarNoPlano(L: Leque, zs: number) {
  for (let i = 0; i < L.n; i++) {
    SEG = -1;
    const y = impactoNoPlano(L, i, zs);
    L.yImp[i] = y;
    L.segImp[i] = Number.isNaN(y) ? -1 : SEG;
  }
}

// ————— medidas no anteparo (seção meridional) —————

export interface MedidasAnteparo {
  /** raios do leque de medida */
  total: number;
  /** raios que refletiram no espelho */
  refletidos: number;
  /** raios refletidos que atingem o anteparo (|y| ≤ H) */
  validos: number;
  /** fração do feixe (em potência do leque 2D) que chega ao anteparo */
  fracao: number;
  yMin: number;
  yMax: number;
  /** largura total W = yMax − yMin (mm); NaN sem raios */
  W: number;
  /** posição média ȳ e desvio RMS σ_y = √⟨(y−ȳ)²⟩, pesos iguais por raio */
  media: number;
  rms: number;
}

export function medirAnteparo(L: Leque, H: number): MedidasAnteparo {
  let validos = 0;
  let refletidos = 0;
  let yMin = Infinity;
  let yMax = -Infinity;
  let soma = 0;
  for (let i = 0; i < L.n; i++) {
    if (L.nRefl[i] > 0) refletidos++;
    const y = L.yImp[i];
    if (Number.isNaN(y) || Math.abs(y) > H) continue;
    validos++;
    soma += y;
    if (y < yMin) yMin = y;
    if (y > yMax) yMax = y;
  }
  const media = validos ? soma / validos : NaN;
  let s2 = 0;
  if (validos) {
    for (let i = 0; i < L.n; i++) {
      const y = L.yImp[i];
      if (Number.isNaN(y) || Math.abs(y) > H) continue;
      s2 += (y - media) * (y - media);
    }
  }
  return {
    total: L.n,
    refletidos,
    validos,
    fracao: L.n ? validos / L.n : 0,
    yMin: validos ? yMin : NaN,
    yMax: validos ? yMax : NaN,
    W: validos ? yMax - yMin : NaN,
    media,
    rms: validos ? Math.sqrt(s2 / validos) : NaN,
  };
}

/** Estatísticas do leque num plano qualquer z (para a varredura do anteparo). */
export function larguraNoPlano(L: Leque, z: number, H: number): { W: number; rms: number; validos: number } {
  let validos = 0;
  let yMin = Infinity;
  let yMax = -Infinity;
  let s = 0;
  let s2 = 0;
  for (let i = 0; i < L.n; i++) {
    const y = impactoNoPlano(L, i, z);
    if (Number.isNaN(y) || Math.abs(y) > H) continue;
    validos++;
    s += y;
    s2 += y * y;
    if (y < yMin) yMin = y;
    if (y > yMax) yMax = y;
  }
  if (!validos) return { W: NaN, rms: NaN, validos: 0 };
  const m = s / validos;
  return { W: yMax - yMin, rms: Math.sqrt(Math.max(0, s2 / validos - m * m)), validos };
}

export interface Varredura {
  z: Float64Array;
  W: Float64Array;
  rms: Float64Array;
}

export function varrer(L: Leque, z0: number, z1: number, m: number, H: number): Varredura {
  const z = new Float64Array(m);
  const W = new Float64Array(m);
  const rms = new Float64Array(m);
  for (let j = 0; j < m; j++) {
    z[j] = z0 + ((z1 - z0) * j) / (m - 1);
    const r = larguraNoPlano(L, z[j], H);
    W[j] = r.W;
    rms[j] = r.rms;
  }
  return { z, W, rms };
}

// ————— perfil transversal (seção meridional) —————

export interface Perfil {
  /** bordas dos intervalos: nBins + 1 valores de y (mm) */
  bordas: Float64Array;
  /**
   * Concentração linear C = (dP/dy)/(dP/du): potência por unidade de y no
   * anteparo dividida pela potência por unidade de altura no feixe incidente
   * (adimensional; feixe incidente ≡ 1). Estimada por contagem:
   * C = (nº de raios no intervalo × Δu) / Δy.
   */
  C: Float64Array;
  dy: number;
  /** raios válidos fora da janela do gráfico */
  fora: number;
}

export function perfil(L: Leque, H: number, centro: number, semiJanela: number, nBins: number): Perfil {
  const bordas = new Float64Array(nBins + 1);
  const C = new Float64Array(nBins);
  const y0 = centro - semiJanela;
  const dy = (2 * semiJanela) / nBins;
  for (let k = 0; k <= nBins; k++) bordas[k] = y0 + k * dy;
  let fora = 0;
  for (let i = 0; i < L.n; i++) {
    const y = L.yImp[i];
    if (Number.isNaN(y) || Math.abs(y) > H) continue;
    const k = Math.floor((y - y0) / dy);
    if (k < 0 || k >= nBins) {
      // o extremo direito pertence ao último intervalo
      if (k === nBins && y === bordas[nBins]) C[nBins - 1] += 1;
      else fora++;
      continue;
    }
    C[k] += 1;
  }
  const peso = L.du / dy;
  for (let k = 0; k < nBins; k++) C[k] *= peso;
  return { bordas, C, dy, fora };
}

// ————— mancha 3D no anteparo —————

export interface Mancha {
  n: number;
  /** impactos (mm); NaN para raios que não chegam ao plano */
  x: Float64Array;
  y: Float64Array;
  /** 1 se o impacto cai dentro do anteparo (disco de raio H) */
  valido: Uint8Array;
  validos: number;
  fracao: number;
  /** centroide dos impactos válidos */
  cx: number;
  cy: number;
  /** raio RMS em torno do centroide: √⟨|r − r̄|²⟩ */
  rRms: number;
  /** maior distância ao centroide */
  rMax: number;
  /** raio do círculo (centrado no centroide) que contém 80 % dos raios válidos */
  r80: number;
  /**
   * Ganho médio de irradiância dentro de r80, relativo ao feixe incidente:
   * (0,8 · P_válida/(π r80²)) / (P_feixe/A_feixe).
   */
  ganho80: number;
}

const ANGULO_AUREO = Math.PI * (3 - Math.sqrt(5));

/**
 * Feixe 3D amostrado uniformemente em área (espiral de Fibonacci), pesos
 * iguais. Com o feixe limitado pela abertura, as amostras cobrem o disco da
 * borda do espelho; com semilargura fixa, o disco de raio w em torno do raio
 * central.
 */
export function mancha(cfg: Config): Mancha {
  const e = cfg.espelho;
  const alfa = cfg.feixe.alfa;
  const n = cfg.nMancha;
  const c = Math.cos(alfa);
  const s = Math.sin(alfa);
  const zb = flecha(e, e.a);
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  const valido = new Uint8Array(n);
  const tr = novoBruto();
  const pts = new Float64Array(MAXP * 3);
  const dirs = new Float64Array(MAXP * 3);
  let validos = 0;
  let sx = 0;
  let sy = 0;
  const auto = cfg.feixe.semiLargura === null;
  const raio = auto ? e.a : (cfg.feixe.semiLargura as number);
  const H2 = cfg.H * cfg.H;
  for (let i = 0; i < n; i++) {
    const r = raio * Math.sqrt((i + 0.5) / n);
    const fi = i * ANGULO_AUREO;
    const p = r * Math.cos(fi);
    const q = r * Math.sin(fi);
    let u: number;
    let v: number;
    if (auto) {
      // (p, q) no disco da borda (z = zb) → coordenadas do feixe
      v = p;
      u = q * c - zb * s;
    } else {
      v = p;
      u = q;
    }
    tracarBruto(e, v, u * c, -u * s, 0, -s, -c, tr, pts, dirs, 0, MAXP);
    x[i] = NaN;
    y[i] = NaN;
    const nr = tr.n;
    const guardados = Math.min(nr, MAXP);
    for (let k = 0; k < guardados; k++) {
      const o = 3 * k;
      const dz = dirs[o + 2];
      if (dz === 0) continue;
      const t = (cfg.zs - pts[o + 2]) / dz;
      if (!(t > 0)) continue;
      if (k + 1 < nr) {
        if (k + 1 >= guardados) break;
        const tMax = Math.hypot(pts[o + 3] - pts[o], pts[o + 4] - pts[o + 1], pts[o + 5] - pts[o + 2]);
        if (t > tMax) continue;
      } else if (tr.estado !== Estado.Refletido) continue;
      x[i] = pts[o] + t * dirs[o];
      y[i] = pts[o + 1] + t * dirs[o + 1];
      break;
    }
    if (!Number.isNaN(x[i]) && x[i] * x[i] + y[i] * y[i] <= H2) {
      valido[i] = 1;
      validos++;
      sx += x[i];
      sy += y[i];
    }
  }
  const cx = validos ? sx / validos : NaN;
  const cy = validos ? sy / validos : NaN;
  let s2 = 0;
  let rMax = 0;
  const dist = new Float64Array(validos);
  let j = 0;
  for (let i = 0; i < n; i++) {
    if (!valido[i]) continue;
    const d2 = (x[i] - cx) * (x[i] - cx) + (y[i] - cy) * (y[i] - cy);
    s2 += d2;
    const d = Math.sqrt(d2);
    dist[j++] = d;
    if (d > rMax) rMax = d;
  }
  dist.sort();
  const r80 = validos ? dist[Math.min(validos - 1, Math.ceil(0.8 * validos) - 1)] : NaN;
  const areaFeixe = Math.PI * raio * raio * (auto ? c : 1);
  const ganho80 = validos && r80 > 0 ? ((0.8 * validos) / n) * (areaFeixe / (Math.PI * r80 * r80)) : NaN;
  return {
    n,
    x,
    y,
    valido,
    validos,
    fracao: n ? validos / n : 0,
    cx,
    cy,
    rRms: validos ? Math.sqrt(s2 / validos) : NaN,
    rMax: validos ? rMax : NaN,
    r80,
    ganho80,
  };
}

// ————— cáustica (envoltória dos raios emergentes) —————

/**
 * Envoltória estimada pela interseção de raios emergentes vizinhos do leque
 * denso (só raios com o mesmo número de reflexões). Devolve trechos (z, y).
 */
export function caustica(L: Leque): Float64Array[] {
  const trechos: number[][] = [];
  let atual: number[] = [];
  const fechar = () => {
    if (atual.length >= 4) trechos.push(atual);
    atual = [];
  };
  for (let i = 0; i + 1 < L.n; i++) {
    const j = i + 1;
    if (L.estado[i] !== Estado.Refletido || L.estado[j] !== Estado.Refletido || L.nRefl[i] !== L.nRefl[j]) {
      fechar();
      continue;
    }
    const py = L.pFinal[3 * i + 1], pz = L.pFinal[3 * i + 2];
    const qy = L.pFinal[3 * j + 1], qz = L.pFinal[3 * j + 2];
    const ay = L.dFinal[3 * i + 1], az = L.dFinal[3 * i + 2];
    const by = L.dFinal[3 * j + 1], bz = L.dFinal[3 * j + 2];
    const den = ay * bz - az * by;
    if (Math.abs(den) < 1e-15) {
      fechar();
      continue;
    }
    const t = ((qy - py) * bz - (qz - pz) * by) / den;
    const sPar = ((qy - py) * az - (qz - pz) * ay) / den;
    if (!(t > 0) || !(sPar > 0)) {
      fechar();
      continue;
    }
    atual.push(pz + t * az, py + t * ay);
  }
  fechar();
  return trechos.map((t) => Float64Array.from(t));
}

// ————— raio de prova —————

export interface Prova {
  /** coordenada de pupila normalizada e coordenada u (mm) */
  rho: number;
  u: number;
  traco: Traco;
  /** cruzamento do raio emergente com o eixo (mm) ou null */
  zCruz: number | null;
  /** impacto no plano do anteparo (y, mm) ou null; e se cai dentro do anteparo */
  yAnteparo: number | null;
  noAnteparo: boolean;
}

export function uDaPupila(intervalo: [number, number], rho: number): number {
  const [a, b] = intervalo;
  const r = Math.max(-1, Math.min(1, rho));
  // recuo mínimo para que ρ = ±1 seja o raio marginal e não a aresta exata
  const meio = (a + b) / 2;
  const semi = ((b - a) / 2) * (1 - 1e-9);
  return meio + r * semi;
}

export function pupilaDeU(intervalo: [number, number], u: number): number {
  const [a, b] = intervalo;
  const semi = (b - a) / 2;
  return semi > 0 ? Math.max(-1, Math.min(1, (u - (a + b) / 2) / semi)) : 0;
}

export function tracarProva(cfg: Config, intervalo: [number, number], rho: number): Prova {
  const u = uDaPupila(intervalo, rho);
  const traco = tracar(cfg.espelho, cfg.feixe.alfa, u, 0);
  const imp = noPlano(traco, cfg.zs);
  return {
    rho,
    u,
    traco,
    zCruz: cruzamentoEixo(traco),
    yAnteparo: imp ? imp.y : null,
    noAnteparo: !!imp && Math.abs(imp.y) <= cfg.H,
  };
}

// ————— solução completa —————

export interface Solucao {
  cfg: Config;
  /** distância focal paraxial f = R/2 (mm) */
  f: number;
  /** imagem paraxial do feixe (y, z) */
  imagem: { y: number; z: number };
  intervalo: [number, number];
  /** leque meridional denso (medidas) */
  leque: Leque;
  anteparo: MedidasAnteparo;
  /** raios marginais (ρ = ±1) */
  marginalSup: Prova;
  marginalInf: Prova;
  prova: Prova | null;
  /** calculados sob demanda e guardados */
  mancha(): Mancha;
  caustica(): Float64Array[];
  varredura(z0: number, z1: number, m: number): Varredura;
}

export function resolver(cfg: Config): Solucao {
  const e = cfg.espelho;
  const intervalo = intervaloMeridional(e, cfg.feixe);
  const leque = tracarLeque(e, cfg.feixe.alfa, intervalo[0], intervalo[1], cfg.nMed, 'centros', cfg.zs);
  let m: Mancha | null = null;
  let c: Float64Array[] | null = null;
  let v: { chave: string; r: Varredura } | null = null;
  return {
    cfg,
    f: e.R / 2,
    imagem: imagemParaxial(e, cfg.feixe.alfa),
    intervalo,
    leque,
    anteparo: medirAnteparo(leque, cfg.H),
    marginalSup: tracarProva(cfg, intervalo, 1),
    marginalInf: tracarProva(cfg, intervalo, -1),
    prova: cfg.prova === null ? null : tracarProva(cfg, intervalo, cfg.prova),
    mancha: () => (m ??= mancha(cfg)),
    caustica: () => (c ??= caustica(leque)),
    varredura: (z0, z1, n) => {
      const chave = `${z0}|${z1}|${n}`;
      if (!v || v.chave !== chave) v = { chave, r: varrer(leque, z0, z1, n, cfg.H) };
      return v.r;
    },
  };
}
