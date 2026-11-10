/**
 * Parâmetros declarativos de um experimento: nome, símbolo, unidade, domínio
 * válido e classe. A classe separa o que muda a física do que só muda o desenho.
 */

export type Valor = number | string | boolean;
export type Valores = Record<string, Valor>;

/**
 * fisico      — altera o sistema físico e, portanto, as medidas.
 * instrumento — posiciona/ajusta um instrumento de medida (não altera o sistema).
 * numerico    — escolhas do método numérico (passo, integrador, amostragem).
 * visual      — só muda o desenho; nenhuma medida depende dele.
 */
export type ClasseParam = 'fisico' | 'instrumento' | 'numerico' | 'visual';

interface Base {
  id: string;
  rotulo: string;
  /** símbolo em TeX, usado na cena, nos campos e nas equações */
  simbolo?: string;
  classe: ClasseParam;
  grupo: string;
  descricao?: string;
}

type Limite = number | ((v: Valores) => number);

export interface ParamNumero extends Base {
  tipo: 'numero';
  unidade: string;
  min: Limite;
  max: Limite;
  passo: number;
  padrao: number;
  /** casas decimais exibidas */
  casas?: number;
  escala?: 'linear' | 'log';
  inteiro?: boolean;
}

export interface ParamOpcao extends Base {
  tipo: 'opcao';
  opcoes: { valor: string; rotulo: string }[];
  padrao: string;
}

export interface ParamLogico extends Base {
  tipo: 'logico';
  padrao: boolean;
}

export type EspecParam = ParamNumero | ParamOpcao | ParamLogico;

const lim = (l: Limite, v: Valores) => (typeof l === 'function' ? l(v) : l);

export function dominio(e: ParamNumero, v: Valores): [number, number] {
  const a = lim(e.min, v);
  const b = lim(e.max, v);
  return a <= b ? [a, b] : [b, a];
}

export function valoresPadrao(especs: readonly EspecParam[]): Valores {
  const v: Valores = {};
  for (const e of especs) v[e.id] = e.padrao;
  return v;
}

export interface Aviso {
  id: string;
  mensagem: string;
}

/**
 * Valida um conjunto de valores vindos de fora (link, arquivo, campo de texto):
 * preenche o que falta com o padrão, descarta chaves desconhecidas, converte
 * tipos e prende números ao domínio. Os domínios podem depender de outros
 * parâmetros, por isso a ordem de declaração importa (os dependentes vêm depois).
 */
export function normalizar(
  especs: readonly EspecParam[],
  bruto: Record<string, unknown> | null | undefined,
): { valores: Valores; avisos: Aviso[] } {
  const avisos: Aviso[] = [];
  const v = valoresPadrao(especs);
  const src = bruto ?? {};
  for (const e of especs) {
    const x = src[e.id];
    if (x === undefined || x === null) continue;
    if (e.tipo === 'numero') {
      const n = typeof x === 'number' ? x : typeof x === 'string' ? Number(x) : NaN;
      if (!Number.isFinite(n)) {
        avisos.push({ id: e.id, mensagem: `${e.rotulo}: valor inválido; usei ${e.padrao} ${e.unidade}.` });
        continue;
      }
      v[e.id] = e.inteiro ? Math.round(n) : n;
    } else if (e.tipo === 'opcao') {
      if (typeof x === 'string' && e.opcoes.some((o) => o.valor === x)) v[e.id] = x;
      else avisos.push({ id: e.id, mensagem: `${e.rotulo}: opção desconhecida; usei o padrão.` });
    } else {
      v[e.id] = x === true || x === 'true' || x === '1' || x === 1;
    }
  }
  // segunda passada: domínios (podem depender dos valores já lidos)
  for (const e of especs) {
    if (e.tipo !== 'numero') continue;
    const [a, b] = dominio(e, v);
    const n = v[e.id] as number;
    if (n < a || n > b) {
      const c = Math.min(b, Math.max(a, n));
      avisos.push({
        id: e.id,
        mensagem: `${e.rotulo}: ${n} ${e.unidade} fora do domínio [${a}; ${b}]; ajustei para ${c}.`,
      });
      v[e.id] = c;
    }
  }
  return { valores: v, avisos };
}

export function prender(e: ParamNumero, n: number, v: Valores): number {
  const [a, b] = dominio(e, v);
  let x = Math.min(b, Math.max(a, n));
  if (e.inteiro) x = Math.round(x);
  return x;
}

export function mesmosValores(a: Valores, b: Valores): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  for (const k of ka) if (!Object.is(a[k], b[k])) return false;
  return true;
}
