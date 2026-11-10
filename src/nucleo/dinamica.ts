/**
 * Núcleo para experimentos que evoluem no tempo.
 *
 *  - SistemaDinamico: q'' = a(q, v, t), com energia opcional para monitorar conservação.
 *  - Integradores de passo fixo (Verlet, RK4, Euler simplético, Euler explícito).
 *  - Simulacao: estado + contagem inteira de passos + histórico amostrado a cada passo.
 *    O tempo é sempre n·dt (nunca uma soma acumulada), então o mesmo número de
 *    passos reproduz exatamente o mesmo estado.
 *  - RelogioFixo: converte tempo real de quadro em um número inteiro de passos
 *    físicos, separando o relógio físico da taxa de quadros.
 */

export interface SistemaDinamico {
  /** graus de liberdade */
  dim: number;
  aceleracao(q: Float64Array, v: Float64Array, t: number, out: Float64Array): void;
  energia?(q: Float64Array, v: Float64Array): number;
}

export type NomeIntegrador = 'verlet' | 'rk4' | 'euler-simpletico' | 'euler';

export const INTEGRADORES: { valor: NomeIntegrador; rotulo: string; ordem: number; simpletico: boolean }[] = [
  { valor: 'verlet', rotulo: 'Verlet (velocidade)', ordem: 2, simpletico: true },
  { valor: 'rk4', rotulo: 'Runge–Kutta 4', ordem: 4, simpletico: false },
  { valor: 'euler-simpletico', rotulo: 'Euler simplético', ordem: 1, simpletico: true },
  { valor: 'euler', rotulo: 'Euler explícito', ordem: 1, simpletico: false },
];

export type Passo = (q: Float64Array, v: Float64Array, t: number, dt: number) => void;

/** Cria a função de passo do integrador escolhido; os vetores q e v são atualizados no lugar. */
export function criarPasso(nome: NomeIntegrador, s: SistemaDinamico): Passo {
  const n = s.dim;
  const a0 = new Float64Array(n);
  const a1 = new Float64Array(n);
  switch (nome) {
    case 'verlet':
      return (q, v, t, dt) => {
        s.aceleracao(q, v, t, a0);
        for (let i = 0; i < n; i++) q[i] += v[i] * dt + 0.5 * a0[i] * dt * dt;
        // para forças dependentes só da posição a(q) é exato usar v antigo aqui
        s.aceleracao(q, v, t + dt, a1);
        for (let i = 0; i < n; i++) v[i] += 0.5 * (a0[i] + a1[i]) * dt;
      };
    case 'euler-simpletico':
      return (q, v, t, dt) => {
        s.aceleracao(q, v, t, a0);
        for (let i = 0; i < n; i++) v[i] += a0[i] * dt;
        for (let i = 0; i < n; i++) q[i] += v[i] * dt;
      };
    case 'euler':
      return (q, v, t, dt) => {
        s.aceleracao(q, v, t, a0);
        for (let i = 0; i < n; i++) {
          q[i] += v[i] * dt;
          v[i] += a0[i] * dt;
        }
      };
    case 'rk4': {
      const q1 = new Float64Array(n), v1 = new Float64Array(n);
      const k1 = new Float64Array(n), k2 = new Float64Array(n), k3 = new Float64Array(n), k4 = new Float64Array(n);
      const l1 = new Float64Array(n), l2 = new Float64Array(n), l3 = new Float64Array(n), l4 = new Float64Array(n);
      return (q, v, t, dt) => {
        // k = dq/dt = v ; l = dv/dt = a
        s.aceleracao(q, v, t, l1);
        for (let i = 0; i < n; i++) { k1[i] = v[i]; q1[i] = q[i] + 0.5 * dt * k1[i]; v1[i] = v[i] + 0.5 * dt * l1[i]; }
        s.aceleracao(q1, v1, t + 0.5 * dt, l2);
        for (let i = 0; i < n; i++) { k2[i] = v1[i]; q1[i] = q[i] + 0.5 * dt * k2[i]; v1[i] = v[i] + 0.5 * dt * l2[i]; }
        s.aceleracao(q1, v1, t + 0.5 * dt, l3);
        for (let i = 0; i < n; i++) { k3[i] = v1[i]; q1[i] = q[i] + dt * k3[i]; v1[i] = v[i] + dt * l3[i]; }
        s.aceleracao(q1, v1, t + dt, l4);
        for (let i = 0; i < n; i++) {
          k4[i] = v1[i];
          q[i] += (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
          v[i] += (dt / 6) * (l1[i] + 2 * l2[i] + 2 * l3[i] + l4[i]);
        }
      };
    }
  }
}

/**
 * Simulação determinística com histórico. Cada registro do histórico guarda
 * [q..., v..., E] do passo correspondente; o registro i corresponde a t = i·dt.
 * O histórico é a única fonte para a cena e para os gráficos.
 */
export class Simulacao {
  readonly dim: number;
  readonly largura: number;
  readonly dt: number;
  readonly q: Float64Array;
  readonly v: Float64Array;
  /** passos já integrados (o estado atual é o registro `passos`) */
  passos = 0;
  private dados: Float64Array;
  private capacidade: number;
  private readonly passo: Passo;
  private readonly sistema: SistemaDinamico;
  /** instabilidade numérica detectada (valores não finitos) */
  divergiu = false;

  constructor(
    sistema: SistemaDinamico,
    integrador: NomeIntegrador,
    dt: number,
    q0: ArrayLike<number>,
    v0: ArrayLike<number>,
    readonly maxRegistros = 400_000,
  ) {
    this.sistema = sistema;
    this.dim = sistema.dim;
    this.largura = 2 * this.dim + 1;
    this.dt = dt;
    this.q = Float64Array.from(q0);
    this.v = Float64Array.from(v0);
    this.passo = criarPasso(integrador, sistema);
    this.capacidade = 4096;
    this.dados = new Float64Array(this.capacidade * this.largura);
    this.gravar(0);
  }

  get t(): number {
    return this.passos * this.dt;
  }
  /** número de registros disponíveis (passos + 1) */
  get registros(): number {
    return this.passos + 1;
  }
  get cheio(): boolean {
    return this.registros >= this.maxRegistros;
  }

  private gravar(i: number) {
    if (i >= this.capacidade) {
      const nova = Math.min(this.maxRegistros, this.capacidade * 2);
      const d = new Float64Array(nova * this.largura);
      d.set(this.dados);
      this.dados = d;
      this.capacidade = nova;
    }
    const o = i * this.largura;
    const n = this.dim;
    for (let k = 0; k < n; k++) {
      this.dados[o + k] = this.q[k];
      this.dados[o + n + k] = this.v[k];
    }
    this.dados[o + 2 * n] = this.sistema.energia ? this.sistema.energia(this.q, this.v) : NaN;
  }

  /** Integra `n` passos. Devolve quantos foram de fato dados (para no limite do histórico ou se divergir). */
  avancar(n: number): number {
    let feitos = 0;
    while (feitos < n && !this.cheio && !this.divergiu) {
      this.passo(this.q, this.v, this.passos * this.dt, this.dt);
      this.passos++;
      feitos++;
      for (let k = 0; k < this.dim; k++) {
        if (!Number.isFinite(this.q[k]) || Math.abs(this.q[k]) > 1e12) this.divergiu = true;
      }
      this.gravar(this.passos);
    }
    return feitos;
  }

  /** Volta ao registro i e descarta o que veio depois (o futuro será recalculado). */
  retomarDe(i: number) {
    const j = Math.max(0, Math.min(this.passos, Math.round(i)));
    const o = j * this.largura;
    for (let k = 0; k < this.dim; k++) {
      this.q[k] = this.dados[o + k];
      this.v[k] = this.dados[o + this.dim + k];
    }
    this.passos = j;
    this.divergiu = false;
  }

  qEm(i: number, k: number): number {
    return this.dados[i * this.largura + k];
  }
  vEm(i: number, k: number): number {
    return this.dados[i * this.largura + this.dim + k];
  }
  energiaEm(i: number): number {
    return this.dados[i * this.largura + 2 * this.dim];
  }
  /** acesso direto para gráficos e exportação (registro i começa em i·largura) */
  get bruto(): Float64Array {
    return this.dados;
  }
}

/**
 * Relógio de passo fixo: acumula tempo real × velocidade e devolve quantos
 * passos físicos inteiros cabem. A taxa de quadros só decide quando desenhar.
 */
export class RelogioFixo {
  velocidade = 1;
  private acumulado = 0;
  constructor(public dt: number, public maxPassosPorQuadro = 4000) {}

  /** dtReal em segundos; devolve o número de passos a integrar neste quadro. */
  consumir(dtReal: number): number {
    // um quadro muito longo (aba em segundo plano) não vira uma avalanche de passos
    const real = Math.min(dtReal, 0.25);
    this.acumulado += real * this.velocidade;
    let n = Math.floor(this.acumulado / this.dt);
    if (n > this.maxPassosPorQuadro) {
      n = this.maxPassosPorQuadro;
      this.acumulado = 0;
    } else {
      this.acumulado -= n * this.dt;
    }
    return n;
  }
  zerar() {
    this.acumulado = 0;
  }
}
