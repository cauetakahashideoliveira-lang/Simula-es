/**
 * Sessão de um experimento: valores validados, histórico de desfazer,
 * dois estados guardados (A/B), enquadramento e sincronização com o link.
 * Não sabe nada sobre a física nem sobre o desenho.
 */
import { signal, computed, batch, type Signal, type ReadonlySignal } from '@preact/signals';
import type { DefExperimento, Extras } from './experimento';
import { codificarLink, lerArquivo, paraArquivo, validar, type EstadoBruto, type VistaEstado } from './estado';
import { dominio, mesmosValores, normalizar, valoresPadrao, type Aviso, type EspecParam, type Valores } from './parametros';

export type Guardado = { valores: Valores; extras: Extras };
export type NomeGuardado = 'A' | 'B';

interface Instantaneo {
  valores: Valores;
  extras: Extras;
}

const MAX_DESFAZER = 200;

export class Sessao<Sol = unknown> {
  readonly def: DefExperimento<Sol>;
  readonly valores: Signal<Valores>;
  readonly extras: Signal<Extras>;
  /** enquadramento atual da cena (a cena escreve aqui; o link lê daqui) */
  readonly vista: Signal<VistaEstado | null>;
  /** pedido de reenquadramento: a cena observa e reage */
  readonly pedidoEnquadrar = signal(0);
  readonly guardados: Signal<Partial<Record<NomeGuardado, Guardado>>>;
  readonly avisos = signal<Aviso[]>([]);
  readonly solucao: ReadonlySignal<Sol>;
  readonly podeDesfazer: ReadonlySignal<boolean>;
  readonly podeRefazer: ReadonlySignal<boolean>;
  readonly guardadoAtivo: ReadonlySignal<NomeGuardado | null>;

  private passado = signal<Instantaneo[]>([]);
  private futuro = signal<Instantaneo[]>([]);
  private gestoAberto: Instantaneo | null = null;
  private especPorId = new Map<string, EspecParam>();

  constructor(def: DefExperimento<Sol>, inicial?: EstadoBruto | null) {
    this.def = def;
    for (const p of def.parametros) this.especPorId.set(p.id, p);
    const padrao = this.estadoInicial();
    let valores = padrao.valores;
    let extras = padrao.extras;
    let vista: VistaEstado | null = null;
    if (inicial && inicial.experimento === def.id && (Object.keys(inicial.parametros).length || Object.keys(inicial.extras).length)) {
      const v = validar(def, inicial);
      valores = v.valores;
      extras = v.extras;
      vista = v.vista;
      this.avisos.value = v.avisos;
    }
    this.valores = signal(valores);
    this.extras = signal(extras);
    this.vista = signal(vista);
    this.guardados = signal(this.lerGuardados());
    this.solucao = computed(() => def.resolver(this.valores.value, this.extras.value));
    this.podeDesfazer = computed(() => this.passado.value.length > 0);
    this.podeRefazer = computed(() => this.futuro.value.length > 0);
    this.guardadoAtivo = computed(() => {
      const g = this.guardados.value;
      for (const nome of ['A', 'B'] as const) {
        const s = g[nome];
        if (s && mesmosValores(s.valores, this.valores.value)) return nome;
      }
      return null;
    });
  }

  /** O estado de abertura é a primeira predefinição (ou os padrões dos parâmetros). */
  estadoInicial(): Instantaneo {
    const p = this.def.predefinicoes[0];
    const base = valoresPadrao(this.def.parametros);
    return {
      valores: normalizar(this.def.parametros, { ...base, ...(p?.valores ?? {}) }).valores,
      extras: { ...this.def.extrasPadrao, ...(p?.extras ?? {}) },
    };
  }

  espec(id: string): EspecParam {
    const e = this.especPorId.get(id);
    if (!e) throw new Error(`Parâmetro desconhecido: ${id}`);
    return e;
  }

  dominioDe(id: string): [number, number] {
    const e = this.espec(id);
    if (e.tipo !== 'numero') throw new Error(`${id} não é numérico`);
    return dominio(e, this.valores.value);
  }

  num(id: string): number {
    return this.valores.value[id] as number;
  }

  // ————— alterações —————

  /** Abre um gesto contínuo (arraste, slider): tudo até `fimGesto` vira uma única entrada de desfazer. */
  inicioGesto() {
    if (!this.gestoAberto) this.gestoAberto = { valores: this.valores.value, extras: this.extras.value };
  }
  fimGesto() {
    const g = this.gestoAberto;
    this.gestoAberto = null;
    if (!g) return;
    if (!mesmosValores(g.valores, this.valores.value) || !mesmosValores(g.extras as Valores, this.extras.value as Valores)) {
      this.empilhar(g);
    }
  }

  private empilhar(i: Instantaneo) {
    const p = this.passado.value.slice(-MAX_DESFAZER + 1);
    p.push(i);
    batch(() => {
      this.passado.value = p;
      this.futuro.value = [];
    });
  }

  /** Define parâmetros (validados e presos ao domínio). Fora de um gesto, cada chamada é desfazível. */
  definir(parcial: Valores, extrasParcial?: Extras) {
    const antes: Instantaneo = { valores: this.valores.value, extras: this.extras.value };
    const { valores, avisos } = normalizar(this.def.parametros, { ...antes.valores, ...parcial });
    const extras = extrasParcial ? { ...antes.extras, ...extrasParcial } : antes.extras;
    if (mesmosValores(valores, antes.valores) && extras === antes.extras) {
      if (avisos.length) this.avisos.value = avisos;
      return;
    }
    if (!this.gestoAberto) this.empilhar(antes);
    batch(() => {
      this.valores.value = valores;
      this.extras.value = extras;
      this.avisos.value = avisos;
    });
  }

  definirExtras(parcial: Extras, desfazivel = false) {
    const antes: Instantaneo = { valores: this.valores.value, extras: this.extras.value };
    const extras = { ...antes.extras, ...parcial };
    if (mesmosValores(extras as Valores, antes.extras as Valores)) return;
    if (desfazivel && !this.gestoAberto) this.empilhar(antes);
    this.extras.value = extras;
  }

  desfazer() {
    const p = this.passado.value;
    if (!p.length) return;
    const alvo = p[p.length - 1];
    batch(() => {
      this.futuro.value = [...this.futuro.value, { valores: this.valores.value, extras: this.extras.value }];
      this.passado.value = p.slice(0, -1);
      this.valores.value = alvo.valores;
      this.extras.value = alvo.extras;
    });
  }

  refazer() {
    const f = this.futuro.value;
    if (!f.length) return;
    const alvo = f[f.length - 1];
    batch(() => {
      this.passado.value = [...this.passado.value, { valores: this.valores.value, extras: this.extras.value }];
      this.futuro.value = f.slice(0, -1);
      this.valores.value = alvo.valores;
      this.extras.value = alvo.extras;
    });
  }

  restaurar() {
    const i = this.estadoInicial();
    this.aplicar(i.valores, i.extras);
    this.pedidoEnquadrar.value++;
  }

  aplicarPredefinicao(id: string) {
    const p = this.def.predefinicoes.find((x) => x.id === id);
    if (!p) return;
    const base = valoresPadrao(this.def.parametros);
    const { valores } = normalizar(this.def.parametros, { ...base, ...p.valores });
    this.aplicar(valores, { ...this.def.extrasPadrao, ...(p.extras ?? {}) });
    this.pedidoEnquadrar.value++;
  }

  private aplicar(valores: Valores, extras: Extras) {
    const antes: Instantaneo = { valores: this.valores.value, extras: this.extras.value };
    if (mesmosValores(valores, antes.valores) && mesmosValores(extras as Valores, antes.extras as Valores)) return;
    this.empilhar(antes);
    batch(() => {
      this.valores.value = valores;
      this.extras.value = extras;
      this.avisos.value = [];
    });
  }

  // ————— estados guardados A/B —————

  private chaveGuardados() {
    return `estudio:${this.def.id}:guardados:v${this.def.versao}`;
  }

  private lerGuardados(): Partial<Record<NomeGuardado, Guardado>> {
    try {
      const t = globalThis.localStorage?.getItem(this.chaveGuardados());
      if (!t) return {};
      const obj = JSON.parse(t);
      const out: Partial<Record<NomeGuardado, Guardado>> = {};
      for (const nome of ['A', 'B'] as const) {
        if (obj?.[nome]?.valores) {
          out[nome] = {
            valores: normalizar(this.def.parametros, obj[nome].valores).valores,
            extras: { ...this.def.extrasPadrao, ...(obj[nome].extras ?? {}) },
          };
        }
      }
      return out;
    } catch {
      return {};
    }
  }

  guardar(nome: NomeGuardado) {
    const g = { ...this.guardados.value, [nome]: { valores: this.valores.value, extras: this.extras.value } };
    this.guardados.value = g;
    try {
      globalThis.localStorage?.setItem(this.chaveGuardados(), JSON.stringify(g));
    } catch {
      /* armazenamento indisponível: os estados valem só nesta sessão */
    }
  }

  /** Alterna para um estado guardado sem tocar no enquadramento. */
  recuperar(nome: NomeGuardado) {
    const g = this.guardados.value[nome];
    if (g) this.aplicar(g.valores, g.extras);
  }

  // ————— compartilhamento —————

  link(): string {
    return codificarLink(this.def, this.valores.value, this.extras.value, this.vista.value);
  }

  arquivo(): string {
    const g: Record<string, Valores> = {};
    for (const nome of ['A', 'B'] as const) {
      const s = this.guardados.value[nome];
      if (s) g[nome] = s.valores;
    }
    return JSON.stringify(paraArquivo(this.def, this.valores.value, this.extras.value, this.vista.value, g), null, 2);
  }

  /** Carrega um arquivo de estado. Lança erro legível se o arquivo for de outro experimento. */
  importar(texto: string) {
    const bruto = lerArquivo(texto);
    if (bruto.experimento !== this.def.id) {
      throw new Error(`Este arquivo é do experimento “${bruto.experimento}”. Abra esse experimento e importe de novo.`);
    }
    const v = validar(this.def, bruto);
    this.aplicar(v.valores, v.extras);
    this.avisos.value = v.avisos;
    if (v.vista) this.vista.value = { ...v.vista };
    else this.pedidoEnquadrar.value++;
    return v;
  }
}
