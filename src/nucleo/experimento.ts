/**
 * Contrato de um experimento. A definição é pura: descreve parâmetros,
 * predefinições e observáveis e sabe resolver o modelo. Não conhece DOM,
 * canvas nem componentes — por isso pode ser verificada no terminal
 * (`npm run medir`) e nos testes sem abrir o renderizador.
 *
 * A apresentação (cena, painéis, gráficos) é registrada à parte em
 * `src/experimentos/registro.ts`.
 */
import type { EspecParam, Valores } from './parametros';

/** Estado extra que precisa viajar com o link mas não é um parâmetro (ex.: instante selecionado). */
export type Extras = Record<string, number | string | boolean | null>;

export interface Observavel<Sol> {
  id: string;
  rotulo: string;
  /** símbolo em TeX */
  simbolo?: string;
  unidade: string;
  /** definição operacional, em uma frase */
  definicao: string;
  /** null = grandeza indefinida neste estado (ex.: raio que não cruza o eixo) */
  calcular(sol: Sol): number | null;
}

export interface Predefinicao {
  id: string;
  titulo: string;
  /** o que investigar — sem entregar a resposta */
  convite: string;
  valores: Valores;
  extras?: Extras;
}

export interface DefExperimento<Sol = unknown> {
  id: string;
  /** versão do esquema de parâmetros; aumenta quando um link antigo precisa de migração */
  versao: number;
  titulo: string;
  /** título para telas estreitas (abas da barra superior) */
  tituloCurto?: string;
  resumo: string;
  parametros: readonly EspecParam[];
  extrasPadrao: Extras;
  predefinicoes: readonly Predefinicao[];
  observaveis: readonly Observavel<Sol>[];
  /** resolve o modelo para um conjunto validado de valores */
  resolver(valores: Valores, extras: Extras): Sol;
  /** converte parâmetros de uma versão antiga do esquema para a atual */
  migrar?(versao: number, bruto: Record<string, unknown>): Record<string, unknown>;
}

export interface Medida {
  id: string;
  rotulo: string;
  unidade: string;
  valor: number | null;
}

export function medir<Sol>(def: DefExperimento<Sol>, valores: Valores, extras: Extras): Medida[] {
  const sol = def.resolver(valores, extras);
  return def.observaveis.map((o) => ({
    id: o.id,
    rotulo: o.rotulo,
    unidade: o.unidade,
    valor: o.calcular(sol),
  }));
}
