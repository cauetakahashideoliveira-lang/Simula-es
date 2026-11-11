/**
 * Osciladores acoplados — definição declarativa do experimento.
 */
import type { DefExperimento, Extras, Observavel, Predefinicao } from '../../nucleo/experimento';
import type { EspecParam, Valores } from '../../nucleo/parametros';
import { INTEGRADORES, Simulacao, type NomeIntegrador } from '../../nucleo/dinamica';
import {
  energia, modosNormais, periodoBatimento, sistema, solucaoExata, dtCritico,
  type CondicoesIniciais, type Modos, type ParamOsc,
} from './modelo';

export const parametros: EspecParam[] = [
  { tipo: 'numero', id: 'm1', rotulo: 'Massa 1', simbolo: 'm_1', unidade: 'kg', min: 0.1, max: 5, passo: 0.05, padrao: 1, casas: 2, classe: 'fisico', grupo: 'Sistema' },
  { tipo: 'numero', id: 'm2', rotulo: 'Massa 2', simbolo: 'm_2', unidade: 'kg', min: 0.1, max: 5, passo: 0.05, padrao: 1, casas: 2, classe: 'fisico', grupo: 'Sistema' },
  { tipo: 'numero', id: 'k1', rotulo: 'Mola esquerda', simbolo: 'k_1', unidade: 'N/m', min: 1, max: 200, passo: 0.5, padrao: 40, casas: 1, classe: 'fisico', grupo: 'Sistema' },
  { tipo: 'numero', id: 'kc', rotulo: 'Mola de acoplamento', simbolo: 'k_c', unidade: 'N/m', min: 0, max: 200, passo: 0.1, padrao: 4, casas: 1, classe: 'fisico', grupo: 'Sistema',
    descricao: 'Liga as duas massas. Com k_c = 0 os osciladores são independentes.' },
  { tipo: 'numero', id: 'k2', rotulo: 'Mola direita', simbolo: 'k_2', unidade: 'N/m', min: 1, max: 200, passo: 0.5, padrao: 40, casas: 1, classe: 'fisico', grupo: 'Sistema' },
  // condições iniciais
  { tipo: 'numero', id: 'x1', rotulo: 'Posição inicial 1', simbolo: 'x_1(0)', unidade: 'cm', min: -25, max: 25, passo: 0.1, padrao: 12, casas: 1, classe: 'fisico', grupo: 'Condições iniciais' },
  { tipo: 'numero', id: 'x2', rotulo: 'Posição inicial 2', simbolo: 'x_2(0)', unidade: 'cm', min: -25, max: 25, passo: 0.1, padrao: 0, casas: 1, classe: 'fisico', grupo: 'Condições iniciais' },
  { tipo: 'numero', id: 'v1', rotulo: 'Velocidade inicial 1', simbolo: 'v_1(0)', unidade: 'cm/s', min: -200, max: 200, passo: 1, padrao: 0, casas: 0, classe: 'fisico', grupo: 'Condições iniciais' },
  { tipo: 'numero', id: 'v2', rotulo: 'Velocidade inicial 2', simbolo: 'v_2(0)', unidade: 'cm/s', min: -200, max: 200, passo: 1, padrao: 0, casas: 0, classe: 'fisico', grupo: 'Condições iniciais' },
  // método numérico
  { tipo: 'opcao', id: 'integrador', rotulo: 'Integrador', opcoes: INTEGRADORES.map((i) => ({ valor: i.valor, rotulo: i.rotulo })), padrao: 'verlet', classe: 'numerico', grupo: 'Método numérico',
    descricao: 'Verlet e Euler simplético conservam a energia em média; RK4 e Euler explícito acumulam deriva.' },
  { tipo: 'numero', id: 'dt', rotulo: 'Passo de tempo', simbolo: '\\Delta t', unidade: 'ms', min: 0.1, max: 100, passo: 0.1, padrao: 4, casas: 1, escala: 'log', classe: 'numerico', grupo: 'Método numérico',
    descricao: 'Passo fixo do integrador. O relógio físico avança em múltiplos inteiros dele, independentemente da taxa de quadros.' },
  // reprodução
  { tipo: 'numero', id: 'vel', rotulo: 'Velocidade de reprodução', unidade: '×', min: 0.05, max: 8, passo: 0.05, padrao: 1, casas: 2, escala: 'log', classe: 'visual', grupo: 'Reprodução',
    descricao: 'Tempo físico por tempo real. Não altera a solução.' },
];

export const extrasPadrao: Extras = {
  /** instante selecionado, em passos inteiros do integrador (t = passos·Δt) */
  passos: 0,
  /** gráfico aberto */
  grafico: 'posicoes',
};

export interface ConfigOsc {
  p: ParamOsc;
  ci: CondicoesIniciais;
  integrador: NomeIntegrador;
  /** passo em segundos */
  dt: number;
}

export function configDeValores(v: Valores): ConfigOsc {
  return {
    p: { m1: v.m1 as number, m2: v.m2 as number, k1: v.k1 as number, kc: v.kc as number, k2: v.k2 as number },
    ci: {
      x1: (v.x1 as number) / 100,
      x2: (v.x2 as number) / 100,
      v1: (v.v1 as number) / 100,
      v2: (v.v2 as number) / 100,
    },
    integrador: v.integrador as NomeIntegrador,
    dt: (v.dt as number) / 1000,
  };
}

export function criarSimulacao(c: ConfigOsc, maxRegistros = 400_000): Simulacao {
  return new Simulacao(sistema(c.p), c.integrador, c.dt, [c.ci.x1, c.ci.x2], [c.ci.v1, c.ci.v2], maxRegistros);
}

export interface SolucaoOsc {
  cfg: ConfigOsc;
  modos: Modos;
  /** energia das condições iniciais (J) */
  E0: number;
  passos: number;
  /** integra do zero até o instante pedido (sob demanda) */
  noInstante(): { t: number; x1: number; x2: number; v1: number; v2: number; E: number; exata: [number, number, number, number] };
}

export function resolver(v: Valores, x: Extras): SolucaoOsc {
  const cfg = configDeValores(v);
  const modos = modosNormais(cfg.p);
  const passos = Math.max(0, Math.round(typeof x.passos === 'number' ? x.passos : 0));
  let cache: ReturnType<SolucaoOsc['noInstante']> | null = null;
  return {
    cfg,
    modos,
    E0: energia(cfg.p, cfg.ci.x1, cfg.ci.x2, cfg.ci.v1, cfg.ci.v2).total,
    passos,
    noInstante() {
      if (cache) return cache;
      const sim = criarSimulacao(cfg, passos + 2);
      sim.avancar(passos);
      const t = sim.t;
      cache = {
        t, x1: sim.q[0], x2: sim.q[1], v1: sim.v[0], v2: sim.v[1],
        E: energia(cfg.p, sim.q[0], sim.q[1], sim.v[0], sim.v[1]).total,
        exata: solucaoExata(cfg.p, modos, cfg.ci, t),
      };
      return cache;
    },
  };
}

const predefinicoes: Predefinicao[] = [
  {
    id: 'batimento',
    titulo: 'Uma massa puxada, a outra em repouso',
    convite: 'Solte e acompanhe a energia passar de uma massa para a outra. Depois mude o acoplamento.',
    valores: { m1: 1, m2: 1, k1: 40, kc: 4, k2: 40, x1: 12, x2: 0, v1: 0, v2: 0, integrador: 'verlet', dt: 4, vel: 1 },
    extras: { passos: 0, grafico: 'posicoes' },
  },
  {
    id: 'modo-fase',
    titulo: 'As duas para o mesmo lado',
    convite: 'As duas massas partem com o mesmo deslocamento. A mola do meio trabalha? Compare a frequência com a de um oscilador isolado.',
    valores: { m1: 1, m2: 1, k1: 40, kc: 4, k2: 40, x1: 10, x2: 10, v1: 0, v2: 0, integrador: 'verlet', dt: 4, vel: 1 },
    extras: { passos: 0, grafico: 'posicoes' },
  },
  {
    id: 'modo-oposicao',
    titulo: 'Uma contra a outra',
    convite: 'Deslocamentos opostos. O que muda na frequência quando o acoplamento aumenta?',
    valores: { m1: 1, m2: 1, k1: 40, kc: 4, k2: 40, x1: 10, x2: -10, v1: 0, v2: 0, integrador: 'verlet', dt: 4, vel: 1 },
    extras: { passos: 0, grafico: 'modos' },
  },
  {
    id: 'massas-diferentes',
    titulo: 'Massas diferentes',
    convite: 'Com m₂ maior, a massa 1 ainda chega a parar por completo? Procure os valores em que a transferência volta a ser total.',
    valores: { m1: 1, m2: 2.5, k1: 40, kc: 6, k2: 40, x1: 12, x2: 0, v1: 0, v2: 0, integrador: 'verlet', dt: 4, vel: 1 },
    extras: { passos: 0, grafico: 'energia' },
  },
  {
    id: 'integradores',
    titulo: 'O integrador importa',
    convite: 'Passo grande e Euler explícito. Acompanhe a energia total; depois troque só o integrador.',
    valores: { m1: 1, m2: 1, k1: 40, kc: 4, k2: 40, x1: 12, x2: 0, v1: 0, v2: 0, integrador: 'euler', dt: 10, vel: 1 },
    extras: { passos: 0, grafico: 'energia' },
  },
];

const observaveis: Observavel<SolucaoOsc>[] = [
  { id: 'omega_baixa', rotulo: 'Frequência angular do modo lento', simbolo: '\\omega_-', unidade: 'rad/s',
    definicao: 'Menor raiz de det(K − ω²M) = 0.', calcular: (s) => s.modos.omegaBaixa },
  { id: 'omega_alta', rotulo: 'Frequência angular do modo rápido', simbolo: '\\omega_+', unidade: 'rad/s',
    definicao: 'Maior raiz de det(K − ω²M) = 0.', calcular: (s) => s.modos.omegaAlta },
  { id: 'T_bat', rotulo: 'Período de batimento', simbolo: 'T_b', unidade: 's',
    definicao: 'T_b = 2π/(ω₊ − ω₋): intervalo entre dois máximos sucessivos da envoltória.',
    calcular: (s) => (Number.isFinite(periodoBatimento(s.modos)) ? periodoBatimento(s.modos) : null) },
  { id: 'E0', rotulo: 'Energia inicial', simbolo: 'E_0', unidade: 'J',
    definicao: 'Energia mecânica total das condições iniciais.', calcular: (s) => s.E0 },
  { id: 'dt_critico', rotulo: 'Passo crítico de estabilidade', unidade: 'ms',
    definicao: '2/ω₊: acima dele Verlet e Euler simplético divergem.', calcular: (s) => 1000 * dtCritico(s.modos) },
  { id: 't', rotulo: 'Instante selecionado', simbolo: 't', unidade: 's',
    definicao: 't = passos × Δt.', calcular: (s) => s.noInstante().t },
  { id: 'x1', rotulo: 'Posição da massa 1', simbolo: 'x_1', unidade: 'cm',
    definicao: 'Deslocamento em relação ao equilíbrio no instante selecionado (integração numérica).',
    calcular: (s) => 100 * s.noInstante().x1 },
  { id: 'x2', rotulo: 'Posição da massa 2', simbolo: 'x_2', unidade: 'cm',
    definicao: 'Deslocamento em relação ao equilíbrio no instante selecionado (integração numérica).',
    calcular: (s) => 100 * s.noInstante().x2 },
  { id: 'deriva', rotulo: 'Deriva relativa de energia', simbolo: '\\Delta E/E_0', unidade: '',
    definicao: '(E(t) − E₀)/E₀ no instante selecionado: erro numérico, pois o sistema é conservativo.',
    calcular: (s) => (s.E0 > 0 ? (s.noInstante().E - s.E0) / s.E0 : null) },
  { id: 'erro_x1', rotulo: 'Erro numérico em x₁', unidade: 'cm',
    definicao: 'x₁ numérico menos a solução exata por modos normais, no instante selecionado.',
    calcular: (s) => 100 * (s.noInstante().x1 - s.noInstante().exata[0]) },
];

export const osciladores: DefExperimento<SolucaoOsc> = {
  id: 'osciladores',
  versao: 1,
  titulo: 'Osciladores acoplados',
  tituloCurto: 'Osciladores',
  resumo: 'Batimentos, modos normais e conservação de energia em duas massas ligadas por molas.',
  parametros,
  extrasPadrao,
  predefinicoes,
  observaveis,
  resolver,
};
