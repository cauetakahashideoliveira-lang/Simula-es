/**
 * Formatação e leitura de números em português do Brasil.
 * Tudo aqui é puro (sem DOM), para servir à interface, aos CSV e ao terminal.
 */

const MENOS = '−';

/** Número com `sig` algarismos significativos, vírgula decimal e sinal tipográfico. */
export function fmtSig(x: number, sig = 4): string {
  if (!Number.isFinite(x)) return Number.isNaN(x) ? '—' : x > 0 ? '∞' : `${MENOS}∞`;
  if (x === 0) return '0';
  const ax = Math.abs(x);
  let s: string;
  if (ax >= 1e7 || ax < 1e-5) {
    const [m, e] = ax.toExponential(Math.max(0, sig - 1)).split('e');
    s = `${m.replace('.', ',')}×10${sobrescrito(Number(e))}`;
  } else {
    const casas = Math.max(0, sig - 1 - Math.floor(Math.log10(ax)));
    s = ax.toFixed(Math.min(casas, 12)).replace('.', ',');
  }
  return (x < 0 ? MENOS : '') + s;
}

/** Número com casas decimais fixas. Evita "−0,00". */
export function fmtFixo(x: number, casas = 2): string {
  if (!Number.isFinite(x)) return Number.isNaN(x) ? '—' : x > 0 ? '∞' : `${MENOS}∞`;
  const s = Math.abs(x).toFixed(casas);
  const zero = Number(s) === 0;
  return (x < 0 && !zero ? MENOS : '') + s.replace('.', ',');
}

function sobrescrito(n: number): string {
  const mapa: Record<string, string> = {
    '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
    '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  };
  return String(n).split('').map((c) => mapa[c] ?? c).join('');
}

export interface ValorComUnidade {
  texto: string;
  unidade: string;
  /** fator: valor exibido = valor na unidade base × fator */
  fator: number;
}

/**
 * Comprimento dado em milímetros, exibido na unidade que mantém 1 ≤ |valor| < 1000
 * (nm, µm, mm, m). Zero exato fica em mm.
 */
export function fmtComprimentoMm(mm: number, sig = 4): ValorComUnidade {
  const a = Math.abs(mm);
  if (!Number.isFinite(mm)) return { texto: fmtSig(mm), unidade: 'mm', fator: 1 };
  if (a === 0) return { texto: '0', unidade: 'mm', fator: 1 };
  if (a < 0.5e-9) return { texto: fmtSig(mm * 1e6, 2), unidade: 'nm', fator: 1e6 };
  if (a < 0.9995e-3) return { texto: fmtSig(mm * 1e6, sig), unidade: 'nm', fator: 1e6 };
  if (a < 0.9995) return { texto: fmtSig(mm * 1e3, sig), unidade: 'µm', fator: 1e3 };
  if (a < 9999.5) return { texto: fmtSig(mm, sig), unidade: 'mm', fator: 1 };
  return { texto: fmtSig(mm / 1e3, sig), unidade: 'm', fator: 1e-3 };
}

export function comprimentoMm(mm: number, sig = 4): string {
  const v = fmtComprimentoMm(mm, sig);
  return `${v.texto} ${v.unidade}`;
}

/** Lê um número digitado: aceita vírgula ou ponto decimal, sinal tipográfico e sufixo de unidade. */
export function lerNumero(texto: string): number | null {
  let s = texto.trim().replace(/−/g, '-').replace(/\s+/g, '');
  if (s === '') return null;
  // notação "1,2×10^-3" ou "1,2e-3"
  s = s.replace(/[×x]10\^?/i, 'e');
  // remove sufixo de unidade (letras, °, µ, /, %)
  const m = s.match(/^[-+]?[\d.,]*(?:e[-+]?\d+)?/i);
  if (!m || m[0] === '' || m[0] === '-' || m[0] === '+') return null;
  let n = m[0];
  const temVirgula = n.includes(',');
  const temPonto = n.includes('.');
  if (temVirgula && temPonto) {
    // o último separador é o decimal; o outro é milhar
    if (n.lastIndexOf(',') > n.lastIndexOf('.')) n = n.replace(/\./g, '').replace(',', '.');
    else n = n.replace(/,/g, '');
  } else if (temVirgula) {
    n = n.replace(',', '.');
  }
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}

/** Passos "redondos" (1, 2, 5 × 10ⁿ) para eixos e réguas. */
export function passoRedondo(bruto: number): number {
  if (!(bruto > 0) || !Number.isFinite(bruto)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(bruto)));
  const f = bruto / p;
  const m = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return m * p;
}

export interface Marcas {
  passo: number;
  valores: number[];
  casas: number;
}

/** Marcas de eixo entre min e max, com cerca de `alvo` divisões. */
export function marcas(min: number, max: number, alvo = 5): Marcas {
  if (!(max > min)) return { passo: 1, valores: [min], casas: 0 };
  const passo = passoRedondo((max - min) / Math.max(1, alvo));
  const i0 = Math.ceil(min / passo - 1e-9);
  const i1 = Math.floor(max / passo + 1e-9);
  const casas = Math.max(0, -Math.floor(Math.log10(passo) + 1e-9));
  const valores: number[] = [];
  for (let i = i0; i <= i1 && valores.length < 200; i++) {
    // arredonda ao número de casas do passo: 3 × 0,2 vira 0,6 e não 0,6000000000000001
    const v = casas <= 15 ? Number((i * passo).toFixed(casas)) : i * passo;
    valores.push(v === 0 ? 0 : v);
  }
  return { passo, valores, casas };
}

/** Número mais curto que reproduz o mesmo double (para links e arquivos de estado). */
export function numeroExato(x: number): string {
  return String(x);
}

export const grausParaRad = (g: number) => (g * Math.PI) / 180;
export const radParaGraus = (r: number) => (r * 180) / Math.PI;
