/**
 * Osciladores — motor de reprodução.
 *
 * Mantém UMA simulação determinística e um cursor (passo selecionado). Cena e
 * gráficos leem o mesmo histórico e o mesmo cursor, por isso mostram sempre o
 * mesmo instante.
 *
 * Regras de estado (o que cada ação faz com as condições iniciais):
 *  - mudar um parâmetro do sistema ou do método numérico: a simulação é refeita
 *    do zero, com as mesmas condições iniciais, até o MESMO número de passos.
 *    O estado mostrado é sempre função de (parâmetros, condições iniciais, passos).
 *  - mudar uma condição inicial (campo ou arrasto de uma massa): volta a t = 0.
 *  - voltar o cursor e tocar: o futuro é descartado e recalculado dali.
 */
import { signal, effect, type Signal } from '@preact/signals';
import { RelogioFixo, Simulacao } from '../../nucleo/dinamica';
import type { Sessao } from '../../nucleo/sessao';
import { configDeValores, criarSimulacao, type ConfigOsc, type SolucaoOsc } from './definicao';

/** registros guardados (um por passo). A 4 ms por passo são ~27 min de tempo físico. */
export const MAX_REGISTROS = 400_000;

export class Motor {
  sim: Simulacao;
  cfg: ConfigOsc;
  readonly relogio: RelogioFixo;
  /** passo selecionado (0 … sim.passos) */
  readonly cursor = signal(0);
  readonly rodando = signal(false);
  /** muda sempre que o histórico é refeito ou cresce (para os gráficos) */
  readonly versao = signal(0);
  readonly aviso: Signal<string | null> = signal(null);
  private quadro = 0;
  private tAnterior = 0;
  private descartes: (() => void)[] = [];
  private chaveCI = '';
  private chaveSis = '';
  private tLink = 0;
  /** estatística de desempenho do último quadro */
  ultimo = { passos: 0, msIntegracao: 0 };

  constructor(readonly sessao: Sessao<SolucaoOsc>) {
    this.cfg = configDeValores(sessao.valores.peek());
    this.sim = criarSimulacao(this.cfg, MAX_REGISTROS);
    this.relogio = new RelogioFixo(this.cfg.dt);
    const inicial = sessao.extras.peek().passos;
    if (typeof inicial === 'number' && inicial > 0) {
      this.sim.avancar(Math.min(MAX_REGISTROS - 1, Math.round(inicial)));
      this.cursor.value = this.sim.passos;
    }
    this.chaves(true);
    this.descartes.push(effect(() => {
      const v = sessao.valores.value;
      this.relogio.velocidade = v.vel as number;
      this.reconstruirSeMudou();
    }));
    // desfazer/refazer ou um estado guardado podem trazer outro instante
    this.descartes.push(effect(() => {
      const p = sessao.extras.value.passos;
      if (typeof p === 'number' && Math.round(p) !== this.cursor.peek() && !this.rodando.peek()) this.irPara(p, false);
    }));
  }

  destruir() {
    cancelAnimationFrame(this.quadro);
    clearTimeout(this.tLink);
    for (const d of this.descartes) d();
  }

  private chaves(gravar: boolean): { ci: boolean; sis: boolean } {
    const v = this.sessao.valores.peek();
    const ci = `${v.x1}|${v.x2}|${v.v1}|${v.v2}`;
    const sis = `${v.m1}|${v.m2}|${v.k1}|${v.kc}|${v.k2}|${v.integrador}|${v.dt}`;
    const r = { ci: ci !== this.chaveCI, sis: sis !== this.chaveSis };
    if (gravar) {
      this.chaveCI = ci;
      this.chaveSis = sis;
    }
    return r;
  }

  private reconstruirSeMudou() {
    const mudou = this.chaves(false);
    if (!mudou.ci && !mudou.sis) return;
    this.chaves(true);
    const passosAntes = this.cursor.peek();
    const tAntes = passosAntes * this.cfg.dt;
    this.cfg = configDeValores(this.sessao.valores.peek());
    this.sim = criarSimulacao(this.cfg, MAX_REGISTROS);
    this.relogio.dt = this.cfg.dt;
    this.relogio.zerar();
    let alvo = 0;
    if (!mudou.ci) {
      // mesmo instante físico; se o passo mudou, o número de passos acompanha
      alvo = Math.min(MAX_REGISTROS - 1, Math.round(tAntes / this.cfg.dt));
    }
    this.sim.avancar(alvo);
    this.aviso.value = this.sim.divergiu ? 'A integração divergiu: o passo de tempo está acima do limite de estabilidade.' : null;
    this.cursor.value = this.sim.passos;
    this.versao.value++;
    this.publicarPasso();
  }

  private publicarPasso(imediato = true) {
    clearTimeout(this.tLink);
    const gravar = () => this.sessao.definirExtras({ passos: this.cursor.peek() });
    if (imediato) gravar();
    else this.tLink = window.setTimeout(gravar, 400);
  }

  get t(): number {
    return this.cursor.value * this.cfg.dt;
  }

  tocar() {
    if (this.rodando.peek()) return;
    if (this.sim.divergiu) return;
    // tocar a partir de um instante passado descarta o futuro
    if (this.cursor.peek() < this.sim.passos) {
      this.sim.retomarDe(this.cursor.peek());
      this.versao.value++;
    }
    this.rodando.value = true;
    this.relogio.zerar();
    this.tAnterior = performance.now();
    const laco = (agora: number) => {
      if (!this.rodando.peek()) return;
      const dtReal = (agora - this.tAnterior) / 1000;
      this.tAnterior = agora;
      const n = this.relogio.consumir(dtReal);
      if (n > 0) {
        const t0 = performance.now();
        const feitos = this.sim.avancar(n);
        this.ultimo = { passos: feitos, msIntegracao: performance.now() - t0 };
        this.cursor.value = this.sim.passos;
        this.versao.value++;
        if (this.sim.divergiu) {
          this.aviso.value = 'A integração divergiu: o passo de tempo está acima do limite de estabilidade.';
          this.pausar();
          return;
        }
        if (this.sim.cheio) {
          this.aviso.value = 'Histórico cheio: reinicie para continuar gravando.';
          this.pausar();
          return;
        }
        this.publicarPasso(false);
      }
      this.quadro = requestAnimationFrame(laco);
    };
    this.quadro = requestAnimationFrame(laco);
  }

  pausar() {
    if (!this.rodando.peek()) return;
    this.rodando.value = false;
    cancelAnimationFrame(this.quadro);
    this.publicarPasso();
  }

  alternar() {
    if (this.rodando.peek()) this.pausar();
    else this.tocar();
  }

  /** Avança (ou recua) o cursor em n passos do integrador, pausado. */
  passo(n: number) {
    this.pausar();
    const alvo = Math.max(0, this.cursor.peek() + n);
    if (alvo > this.sim.passos) {
      this.sim.avancar(alvo - this.sim.passos);
      this.versao.value++;
    }
    this.cursor.value = Math.min(alvo, this.sim.passos);
    this.publicarPasso();
  }

  /** Leva o cursor ao passo i (integra se ainda não existir). */
  irPara(i: number, publicar = true) {
    const alvo = Math.max(0, Math.min(MAX_REGISTROS - 1, Math.round(i)));
    if (alvo > this.sim.passos) {
      this.sim.avancar(alvo - this.sim.passos);
      this.versao.value++;
    }
    this.cursor.value = Math.min(alvo, this.sim.passos);
    if (publicar) this.publicarPasso();
  }

  /** Volta a t = 0 com as mesmas condições iniciais (reinício reproduzível). */
  reiniciar() {
    this.pausar();
    this.sim.retomarDe(0);
    this.relogio.zerar();
    this.aviso.value = null;
    this.cursor.value = 0;
    this.versao.value++;
    this.publicarPasso();
  }
}
