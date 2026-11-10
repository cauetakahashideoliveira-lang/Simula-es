/**
 * Estado compartilhável e versionado.
 *
 * Duas representações do mesmo conteúdo:
 *  - link legível:  #/optica?f=1&e=1&R=400&a=200&...&vista=210,0,2.4
 *  - arquivo JSON:  { app, formato, experimento, versaoExperimento, parametros, extras, vista }
 *
 * Os números são gravados com a representação decimal mais curta que
 * reproduz o mesmo double, de modo que reabrir um estado devolve
 * exatamente as mesmas medidas.
 */
import type { DefExperimento, Extras } from './experimento';
import { normalizar, type Aviso, type Valores } from './parametros';

export const APP_ID = 'estudio-simulacoes';
export const FORMATO = 1;

export interface VistaEstado {
  /** ponto do mundo no centro da área útil e escala em px por unidade */
  cx: number;
  cy: number;
  escala: number;
}

export interface EstadoBruto {
  experimento: string;
  formato: number;
  versaoExperimento: number;
  parametros: Record<string, unknown>;
  extras: Record<string, unknown>;
  vista: VistaEstado | null;
}

export interface EstadoValidado {
  valores: Valores;
  extras: Extras;
  vista: VistaEstado | null;
  avisos: Aviso[];
}

const RESERVADAS = new Set(['f', 'e', 'vista']);

export function codificarLink(
  def: DefExperimento<any>,
  valores: Valores,
  extras: Extras,
  vista: VistaEstado | null,
): string {
  const partes: string[] = [`f=${FORMATO}`, `e=${def.versao}`];
  for (const p of def.parametros) {
    const v = valores[p.id];
    if (v === undefined) continue;
    partes.push(`${encodeURIComponent(p.id)}=${codVal(v)}`);
  }
  for (const k of Object.keys(def.extrasPadrao)) {
    const v = extras[k];
    if (v === null || v === undefined) continue;
    partes.push(`x.${encodeURIComponent(k)}=${codVal(v)}`);
  }
  if (vista) partes.push(`vista=${vista.cx},${vista.cy},${vista.escala}`);
  return `#/${def.id}?${partes.join('&')}`;
}

function codVal(v: number | string | boolean): string {
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (typeof v === 'number') return String(v);
  return encodeURIComponent(v);
}

/** Lê "#/id?chave=valor&..." sem validar contra a definição. */
export function lerLink(hash: string): EstadoBruto | null {
  const m = hash.match(/^#?\/?([a-z0-9-]+)(?:\?(.*))?$/i);
  if (!m) return null;
  const bruto: EstadoBruto = {
    experimento: m[1],
    formato: FORMATO,
    versaoExperimento: 0,
    parametros: {},
    extras: {},
    vista: null,
  };
  if (!m[2]) return bruto;
  for (const par of m[2].split('&')) {
    const i = par.indexOf('=');
    if (i < 0) continue;
    let k: string;
    let v: string;
    try {
      k = decodeURIComponent(par.slice(0, i));
      v = decodeURIComponent(par.slice(i + 1));
    } catch {
      continue;
    }
    if (k === 'f') bruto.formato = Number(v) || FORMATO;
    else if (k === 'e') bruto.versaoExperimento = Number(v) || 0;
    else if (k === 'vista') {
      const [cx, cy, escala] = v.split(',').map(Number);
      if ([cx, cy, escala].every(Number.isFinite) && escala > 0) bruto.vista = { cx, cy, escala };
    } else if (k.startsWith('x.')) bruto.extras[k.slice(2)] = v;
    else if (!RESERVADAS.has(k)) bruto.parametros[k] = v;
  }
  return bruto;
}

export function validar(def: DefExperimento<any>, bruto: EstadoBruto): EstadoValidado {
  const avisos: Aviso[] = [];
  if (bruto.formato > FORMATO) {
    avisos.push({ id: 'formato', mensagem: 'Este estado foi criado por uma versão mais nova do estúdio; li o que reconheci.' });
  }
  let params = bruto.parametros;
  if (bruto.versaoExperimento && bruto.versaoExperimento < def.versao && def.migrar) {
    params = def.migrar(bruto.versaoExperimento, params);
  }
  // opções lógicas e numéricas chegam como texto pelo link
  const conv: Record<string, unknown> = {};
  for (const p of def.parametros) {
    const x = params[p.id];
    if (x === undefined) continue;
    if (p.tipo === 'numero') conv[p.id] = typeof x === 'string' ? Number(x) : x;
    else if (p.tipo === 'logico') conv[p.id] = x === true || x === '1' || x === 'true' || x === 1;
    else conv[p.id] = x;
  }
  const n = normalizar(def.parametros, conv);
  avisos.push(...n.avisos);
  const extras: Extras = { ...def.extrasPadrao };
  for (const k of Object.keys(def.extrasPadrao)) {
    const x = bruto.extras[k];
    if (x === undefined || x === null) continue;
    const modelo = def.extrasPadrao[k];
    if (typeof modelo === 'number' || (modelo === null && x !== '' && Number.isFinite(Number(x)))) {
      const num = Number(x);
      if (Number.isFinite(num)) extras[k] = num;
    } else if (typeof modelo === 'boolean') extras[k] = x === true || x === '1' || x === 'true';
    else if (typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean') extras[k] = x;
  }
  return { valores: n.valores, extras, vista: bruto.vista, avisos };
}

export interface ArquivoEstado {
  app: typeof APP_ID;
  formato: number;
  experimento: string;
  versaoExperimento: number;
  criadoEm: string;
  parametros: Valores;
  extras: Extras;
  vista: VistaEstado | null;
  guardados?: Record<string, Valores>;
}

export function paraArquivo(
  def: DefExperimento<any>,
  valores: Valores,
  extras: Extras,
  vista: VistaEstado | null,
  guardados?: Record<string, Valores>,
): ArquivoEstado {
  return {
    app: APP_ID,
    formato: FORMATO,
    experimento: def.id,
    versaoExperimento: def.versao,
    criadoEm: new Date().toISOString(),
    parametros: { ...valores },
    extras: { ...extras },
    vista,
    guardados,
  };
}

/** Converte o conteúdo de um arquivo de estado em EstadoBruto; lança erro legível se não for um. */
export function lerArquivo(texto: string): EstadoBruto & { guardados?: Record<string, Record<string, unknown>> } {
  let obj: any;
  try {
    obj = JSON.parse(texto);
  } catch {
    throw new Error('O arquivo não é um JSON válido.');
  }
  if (!obj || obj.app !== APP_ID || typeof obj.experimento !== 'string') {
    throw new Error('O arquivo não é um estado do Estúdio de simulações.');
  }
  const v = obj.vista;
  const vista =
    v && [v.cx, v.cy, v.escala].every((n: unknown) => typeof n === 'number' && Number.isFinite(n)) && v.escala > 0
      ? { cx: v.cx, cy: v.cy, escala: v.escala }
      : null;
  return {
    experimento: obj.experimento,
    formato: Number(obj.formato) || FORMATO,
    versaoExperimento: Number(obj.versaoExperimento) || 0,
    parametros: typeof obj.parametros === 'object' && obj.parametros ? obj.parametros : {},
    extras: typeof obj.extras === 'object' && obj.extras ? obj.extras : {},
    vista,
    guardados: typeof obj.guardados === 'object' && obj.guardados ? obj.guardados : undefined,
  };
}
