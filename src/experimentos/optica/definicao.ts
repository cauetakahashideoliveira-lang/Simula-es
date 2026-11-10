/**
 * Bancada de óptica — definição declarativa do experimento.
 * Parâmetros com unidade e domínio, predefinições e observáveis.
 */
import type { DefExperimento, Extras, Observavel, Predefinicao } from '../../nucleo/experimento';
import type { EspecParam, Valores } from '../../nucleo/parametros';
import { grausParaRad, radParaGraus } from '../../nucleo/formato';
import { resolver, type Config, type Solucao } from './analise';

/**
 * Fração do raio de curvatura que o controle de abertura permite. O limite vem
 * da esfera (ρ < R) e vale para toda cônica com κ ≤ 0, de modo que trocar a
 * superfície nunca altera a abertura física. Para κ > 0 a folha fecha antes.
 */
export const FRACAO_ABERTURA = 0.95;

export const aMax = (v: Valores) =>
  (FRACAO_ABERTURA * (v.R as number)) / Math.sqrt(1 + Math.max(0, v.kappa as number));

export const parametros: EspecParam[] = [
  // ——— espelho (físico)
  {
    tipo: 'numero', id: 'kappa', rotulo: 'Constante cônica', simbolo: '\\kappa', unidade: '',
    min: -3, max: 0.5, passo: 0.05, padrao: 0, casas: 3, classe: 'fisico', grupo: 'Espelho',
    descricao: 'κ = 0: esfera; κ = −1: paraboloide; entre os dois, elipsoide; abaixo de −1, hiperboloide.',
  },
  {
    tipo: 'numero', id: 'R', rotulo: 'Raio de curvatura', simbolo: 'R', unidade: 'mm',
    min: 20, max: 10000, passo: 1, padrao: 400, casas: 1, escala: 'log', classe: 'fisico', grupo: 'Espelho',
    descricao: 'Raio de curvatura no vértice. A distância focal paraxial é f = R/2.',
  },
  {
    tipo: 'numero', id: 'a', rotulo: 'Abertura (semidiâmetro)', simbolo: 'a', unidade: 'mm',
    min: (v) => (v.R as number) / 1000, max: aMax, passo: 0.5, padrao: 200, casas: 1,
    classe: 'fisico', grupo: 'Espelho',
    descricao: 'Distância do eixo à borda do espelho. A abertura física é a mesma para qualquer superfície.',
  },
  // ——— feixe (físico)
  {
    tipo: 'logico', id: 'feixeAuto', rotulo: 'Feixe preenche a abertura', padrao: true,
    classe: 'fisico', grupo: 'Feixe',
    descricao: 'Ligado: o feixe é limitado pela borda do espelho. Desligado: o feixe tem largura própria e pode sobrar ou faltar.',
  },
  {
    tipo: 'numero', id: 'w', rotulo: 'Semilargura do feixe', simbolo: 'w', unidade: 'mm',
    min: (v) => (v.R as number) / 1000, max: (v) => 1.5 * (v.R as number), passo: 0.5, padrao: 120, casas: 1,
    classe: 'fisico', grupo: 'Feixe',
  },
  {
    tipo: 'numero', id: 'alfa', rotulo: 'Incidência', simbolo: '\\alpha', unidade: '°',
    min: -30, max: 30, passo: 0.1, padrao: 0, casas: 2, classe: 'fisico', grupo: 'Feixe',
    descricao: 'Ângulo entre o feixe e o eixo óptico. Positivo: a luz vem de cima.',
  },
  // ——— anteparo (instrumento)
  {
    tipo: 'numero', id: 'zs', rotulo: 'Posição do anteparo', simbolo: 'z_s', unidade: 'mm',
    min: 0, max: (v) => 3 * (v.R as number), passo: 0.1, padrao: 200, casas: 2,
    classe: 'instrumento', grupo: 'Anteparo',
    descricao: 'Distância do vértice ao anteparo, medida sobre o eixo, positiva na frente do espelho.',
  },
  {
    tipo: 'numero', id: 'H', rotulo: 'Semi-altura do anteparo', simbolo: 'H', unidade: 'mm',
    min: (v) => (v.R as number) / 1000, max: (v) => 2 * (v.R as number), passo: 1, padrao: 90, casas: 1,
    classe: 'instrumento', grupo: 'Anteparo',
  },
  {
    tipo: 'logico', id: 'opaco', rotulo: 'Anteparo opaco', padrao: true, classe: 'instrumento', grupo: 'Anteparo',
    descricao: 'Opaco: os raios refletidos terminam no anteparo. Transparente: plano de detecção, os raios seguem.',
  },
  // ——— amostragem das medidas (numérico)
  {
    tipo: 'numero', id: 'nMed', rotulo: 'Raios do leque de medida', unidade: '', min: 201, max: 40001, passo: 200,
    padrao: 2001, inteiro: true, escala: 'log', classe: 'numerico', grupo: 'Amostragem',
    descricao: 'Raios meridionais usados para medir largura, perfil e aberração. Não altera o desenho.',
  },
  {
    tipo: 'numero', id: 'nMancha', rotulo: 'Raios da mancha 3D', unidade: '', min: 200, max: 40000, passo: 200,
    padrao: 4000, inteiro: true, escala: 'log', classe: 'numerico', grupo: 'Amostragem',
  },
  // ——— desenho (visual)
  {
    tipo: 'numero', id: 'nRaios', rotulo: 'Raios desenhados', unidade: '', min: 3, max: 151, passo: 2, padrao: 21,
    inteiro: true, classe: 'visual', grupo: 'Desenho',
    descricao: 'Só muda quantos raios aparecem. As medidas usam o leque de medida.',
  },
  { tipo: 'logico', id: 'luz', rotulo: 'Camada de luz', padrao: true, classe: 'visual', grupo: 'Desenho',
    descricao: 'Mapa da densidade de raios da seção meridional, relativa ao feixe incidente.' },
  {
    tipo: 'numero', id: 'exposicao', rotulo: 'Exposição', unidade: 'EV', min: -4, max: 4, passo: 0.25, padrao: 0,
    casas: 2, classe: 'visual', grupo: 'Desenho',
  },
  { tipo: 'logico', id: 'construcoes', rotulo: 'Normal, tangente e ângulos', padrao: true, classe: 'visual', grupo: 'Desenho' },
  { tipo: 'logico', id: 'caustica', rotulo: 'Cáustica (envoltória)', padrao: false, classe: 'visual', grupo: 'Desenho' },
];

export const extrasPadrao: Extras = {
  /** raio de prova: coordenada de pupila normalizada (−1…1) ou null */
  prova: null,
  /** semijanela do perfil/mancha (mm); null = automática */
  janela: null,
  /** instrumento aberto */
  instr: 'perfil',
};

export function configDeValores(v: Valores, x: Extras): Config {
  const prova = typeof x.prova === 'number' && Number.isFinite(x.prova) ? Math.max(-1, Math.min(1, x.prova)) : null;
  return {
    espelho: { R: v.R as number, kappa: v.kappa as number, a: v.a as number },
    feixe: {
      alfa: grausParaRad(v.alfa as number),
      semiLargura: v.feixeAuto ? null : (v.w as number),
    },
    zs: v.zs as number,
    H: v.H as number,
    opaco: v.opaco as boolean,
    nMed: v.nMed as number,
    nMancha: v.nMancha as number,
    prova,
  };
}

const predefinicoes: Predefinicao[] = [
  {
    id: 'abertura',
    titulo: 'Feixe paralelo num espelho esférico',
    convite: 'Arraste a borda do espelho, mova o anteparo ou toque num raio.',
    valores: { kappa: 0, R: 400, a: 200, feixeAuto: true, alfa: 0, zs: 200, H: 90, nRaios: 21 },
    extras: { prova: null, janela: null, instr: 'perfil' },
  },
  {
    id: 'foco-paraxial',
    titulo: 'Onde está o foco?',
    convite:
      'O anteparo está no foco paraxial e a abertura é pequena. Abra a abertura devagar e acompanhe o raio marginal e o perfil. Depois troque só a superfície.',
    valores: { kappa: 0, R: 400, a: 30, feixeAuto: true, alfa: 0, zs: 200, H: 90, nRaios: 15 },
    extras: { prova: 1, janela: 8, instr: 'perfil' },
  },
  {
    id: 'melhor-foco',
    titulo: 'A menor mancha',
    convite:
      'Com esta abertura, existe uma posição do anteparo em que a mancha é menor do que no foco paraxial? Onde ela fica em relação aos cruzamentos paraxial e marginal?',
    valores: { kappa: 0, R: 400, a: 120, feixeAuto: true, alfa: 0, zs: 200, H: 90, nRaios: 25 },
    extras: { prova: 1, janela: null, instr: 'mancha' },
  },
  {
    id: 'fora-do-eixo',
    titulo: 'A parábola fora do eixo',
    convite:
      'No eixo, a parábola focaliza num ponto. Incline o feixe aos poucos e observe a mancha. Compare com a esfera na mesma inclinação.',
    valores: { kappa: -1, R: 400, a: 100, feixeAuto: true, alfa: 3, zs: 200, H: 90, nRaios: 21 },
    extras: { prova: null, janela: null, instr: 'mancha' },
  },
  {
    id: 'grande-abertura',
    titulo: 'Abertura extrema',
    convite:
      'Com abertura muito grande, parte dos raios reflete mais de uma vez antes de sair. Reduza a abertura: a partir de que valor de a/R o raio marginal deixa de refletir duas vezes?',
    valores: { kappa: 0, R: 400, a: 372, feixeAuto: true, alfa: 0, zs: 150, H: 120, nRaios: 41 },
    extras: { prova: 0.95, janela: null, instr: 'aberracao' },
  },
];

const nulo = (x: number | null | undefined) => (x === null || x === undefined || Number.isNaN(x) ? null : x);

const observaveis: Observavel<Solucao>[] = [
  { id: 'f', rotulo: 'Distância focal paraxial', simbolo: 'f', unidade: 'mm',
    definicao: 'f = R/2: limite do cruzamento com o eixo para raios paralelos ao eixo com altura h → 0.',
    calcular: (s) => s.f },
  { id: 'z_marginal', rotulo: 'Cruzamento do raio marginal superior com o eixo', simbolo: 'z_\\times^{m}', unidade: 'mm',
    definicao: 'z em que o raio emergente da borda superior da abertura cruza o eixo óptico.',
    calcular: (s) => nulo(s.marginalSup.zCruz) },
  { id: 'al_marginal', rotulo: 'Aberração longitudinal do raio marginal', simbolo: '\\Delta z^{m}', unidade: 'mm',
    definicao: 'Δz = z× − f do raio marginal superior (negativo: cruza antes do foco paraxial, mais perto do espelho).',
    calcular: (s) => (s.marginalSup.zCruz === null ? null : s.marginalSup.zCruz - s.f) },
  { id: 'W', rotulo: 'Largura total no anteparo', simbolo: 'W', unidade: 'mm',
    definicao: 'W = y_máx − y_mín dos raios do leque meridional de medida que atingem o anteparo.',
    calcular: (s) => nulo(s.anteparo.W) },
  { id: 'sigma_y', rotulo: 'Desvio RMS no anteparo (seção)', simbolo: '\\sigma_y', unidade: 'mm',
    definicao: 'σ_y = √⟨(y − ȳ)²⟩ sobre o leque meridional, pesos iguais por unidade de altura do feixe.',
    calcular: (s) => nulo(s.anteparo.rms) },
  { id: 'y_medio', rotulo: 'Posição média no anteparo (seção)', simbolo: '\\bar y', unidade: 'mm',
    definicao: 'ȳ: média das interseções do leque meridional com o anteparo.',
    calcular: (s) => nulo(s.anteparo.media) },
  { id: 'fracao', rotulo: 'Fração do leque que atinge o anteparo', unidade: '',
    definicao: 'Raios do leque de medida com impacto dentro do anteparo, dividido pelo total de raios do feixe.',
    calcular: (s) => s.anteparo.fracao },
  { id: 'r_rms', rotulo: 'Raio RMS da mancha (3D)', simbolo: 'r_\\mathrm{RMS}', unidade: 'mm',
    definicao: 'r_RMS = √⟨|r − r̄|²⟩ dos impactos de um feixe 3D amostrado uniformemente em área.',
    calcular: (s) => nulo(s.mancha().rRms) },
  { id: 'r80', rotulo: 'Raio que contém 80 % da potência (3D)', simbolo: 'r_{80}', unidade: 'mm',
    definicao: 'Raio do círculo centrado no centroide que contém 80 % dos raios que atingem o anteparo.',
    calcular: (s) => nulo(s.mancha().r80) },
  { id: 'prova_u', rotulo: 'Raio de prova: altura no feixe', simbolo: 'h', unidade: 'mm',
    definicao: 'Coordenada u do raio de prova na seção transversal do feixe (para α = 0, é a altura y).',
    calcular: (s) => (s.prova ? s.prova.u : null) },
  { id: 'prova_theta_i', rotulo: 'Raio de prova: ângulo de incidência', simbolo: '\\theta_i', unidade: '°',
    definicao: 'Ângulo entre o raio incidente (invertido) e a normal local, na primeira reflexão.',
    calcular: (s) => (s.prova?.traco.reflexoes[0] ? radParaGraus(s.prova.traco.reflexoes[0].thetaI) : null) },
  { id: 'prova_theta_r', rotulo: 'Raio de prova: ângulo de reflexão', simbolo: '\\theta_r', unidade: '°',
    definicao: 'Ângulo entre o raio refletido e a normal local, na primeira reflexão.',
    calcular: (s) => (s.prova?.traco.reflexoes[0] ? radParaGraus(s.prova.traco.reflexoes[0].thetaR) : null) },
  { id: 'prova_z', rotulo: 'Raio de prova: cruzamento com o eixo', simbolo: 'z_\\times', unidade: 'mm',
    definicao: 'z em que o raio de prova emergente cruza o eixo óptico.',
    calcular: (s) => (s.prova ? nulo(s.prova.zCruz) : null) },
  { id: 'prova_y', rotulo: 'Raio de prova: altura no anteparo', simbolo: 'y_s', unidade: 'mm',
    definicao: 'y em que o raio de prova refletido atravessa o plano do anteparo.',
    calcular: (s) => (s.prova ? nulo(s.prova.yAnteparo) : null) },
];

export const optica: DefExperimento<Solucao> = {
  id: 'optica',
  versao: 1,
  titulo: 'Bancada de óptica',
  resumo: 'Focalização e aberração esférica em espelhos côncavos.',
  parametros,
  extrasPadrao,
  predefinicoes,
  observaveis,
  resolver: (v, x) => resolver(configDeValores(v, x)),
};
