/**
 * Osciladores acoplados — vista (cena + gráficos + painel).
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { PropsVista, ConjuntoDados } from '../registro';
import type { Sessao } from '../../nucleo/sessao';
import { fmtFixo, fmtSig } from '../../nucleo/formato';
import { Icone, Medida, Param, Secao } from '../../ui/componentes';
import { csv } from '../../ui/exportar';
import { CenaOsc } from './cena';
import { Motor } from './motor';
import { Graficos } from './graficos';
import { Explicacao } from './explicacao';
import { dtCritico, energia, modosNormais, periodoBatimento } from './modelo';
import type { SolucaoOsc } from './definicao';

type S = Sessao<SolucaoOsc>;

function conjuntos(s: S, motor: Motor): ConjuntoDados[] {
  return [
    {
      id: 'series',
      titulo: 'Séries temporais até o instante selecionado',
      gerar() {
        const sim = motor.sim;
        const n = motor.cursor.peek() + 1;
        const salto = Math.max(1, Math.ceil(n / 50_000));
        const m = Math.ceil(n / salto);
        const col = {
          t: new Float64Array(m), x1: new Float64Array(m), x2: new Float64Array(m), v1: new Float64Array(m), v2: new Float64Array(m),
          E1: new Float64Array(m), E2: new Float64Array(m), Ec: new Float64Array(m), E: new Float64Array(m),
        };
        for (let j = 0; j < m; j++) {
          const i = Math.min(n - 1, j * salto);
          const e = energia(motor.cfg.p, sim.qEm(i, 0), sim.qEm(i, 1), sim.vEm(i, 0), sim.vEm(i, 1));
          col.t[j] = i * sim.dt;
          col.x1[j] = sim.qEm(i, 0);
          col.x2[j] = sim.qEm(i, 1);
          col.v1[j] = sim.vEm(i, 0);
          col.v2[j] = sim.vEm(i, 1);
          col.E1[j] = e.E1;
          col.E2[j] = e.E2;
          col.Ec[j] = e.Ec;
          col.E[j] = e.total;
        }
        const v = s.valores.peek();
        const cab = [
          'Estúdio de simulações — Osciladores acoplados',
          `estado: ${location.origin + location.pathname + s.link()}`,
          'x positivo para a direita, medido a partir do equilíbrio de cada massa',
          ...s.def.parametros.filter((p) => p.classe !== 'visual').map((p) => `${p.id} = ${v[p.id]}${p.tipo === 'numero' && p.unidade ? ' ' + p.unidade : ''}  (${p.rotulo})`),
          salto > 1 ? `uma linha a cada ${salto} passos do integrador` : 'uma linha por passo do integrador',
        ];
        return csv(cab, [
          { nome: 't', unidade: 's', valores: col.t },
          { nome: 'x1', unidade: 'm', valores: col.x1 },
          { nome: 'x2', unidade: 'm', valores: col.x2 },
          { nome: 'v1', unidade: 'm/s', valores: col.v1 },
          { nome: 'v2', unidade: 'm/s', valores: col.v2 },
          { nome: 'E1', unidade: 'J', valores: col.E1 },
          { nome: 'E2', unidade: 'J', valores: col.E2 },
          { nome: 'E_acoplamento', unidade: 'J', valores: col.Ec },
          { nome: 'E_total', unidade: 'J', valores: col.E },
        ]);
      },
    },
  ];
}

function Tempo({ motor }: { motor: Motor }) {
  const t = motor.cursor.value * motor.cfg.dt;
  void motor.versao.value;
  return <span class="tempo" data-tempo>{fmtFixo(t, 3)} <span class="un">s</span></span>;
}

function Transporte({ motor }: { motor: Motor }) {
  const rodando = motor.rodando.value;
  const s = motor.sessao;
  const vel = s.valores.value.vel as number;
  return (
    <div class="transporte" onPointerDown={(e) => e.stopPropagation()}>
      <button class="btn" aria-label="Voltar a t = 0" title="Voltar a t = 0 (R)" onClick={() => motor.reiniciar()}><Icone.reiniciar /></button>
      <button class="btn principal" aria-label={rodando ? 'Pausar' : 'Tocar'} title="Tocar ou pausar (Espaço)" onClick={() => motor.alternar()}>
        {rodando ? <Icone.pausar /> : <Icone.tocar />}
      </button>
      <button class="btn" aria-label="Avançar um passo" title="Avançar um passo (→)" onClick={() => motor.passo(1)}><Icone.passo /></button>
      <Tempo motor={motor} />
      <select aria-label="Velocidade de reprodução" value={String(vel)} onChange={(e) => s.definir({ vel: Number(e.currentTarget.value) })}>
        {[0.1, 0.25, 0.5, 1, 2, 4].map((x) => <option value={String(x)}>{fmtSig(x, 2)}×</option>)}
        {![0.1, 0.25, 0.5, 1, 2, 4].includes(vel) && <option value={String(vel)}>{fmtSig(vel, 2)}×</option>}
      </select>
    </div>
  );
}

function Leituras({ motor }: { motor: Motor }) {
  const i = Math.min(motor.cursor.value, motor.sim.passos);
  void motor.versao.value;
  const s = motor.sim;
  const E0 = s.energiaEm(0);
  const deriva = E0 > 0 ? s.energiaEm(i) / E0 - 1 : 0;
  return (
    <div class="medidas">
      <Medida simbolo="t" nome="instante" valor={fmtFixo(i * s.dt, 3)} unidade="s" def={`passo ${i} de ${fmtFixo(1000 * s.dt, 1)} ms`} />
      <Medida simbolo="\Delta E/E_0" nome="deriva de energia" valor={fmtSig(deriva, 3)} destaque />
    </div>
  );
}

function Painel({ sessao, motor }: { sessao: S; motor: Motor }) {
  const [aba, setAba] = useState<'controles' | 'explicar'>('controles');
  const v = sessao.valores.value;
  const m = modosNormais(motor.cfg.p);
  void motor.versao.value;
  const Tb = periodoBatimento(m);
  const aviso = motor.aviso.value;
  const critico = 1000 * dtCritico(m);
  const dt = v.dt as number;
  return (
    <aside class="painel">
      <div class="abas" role="tablist">
        <button role="tab" aria-selected={aba === 'controles'} onClick={() => setAba('controles')}>Sistema</button>
        <button role="tab" aria-selected={aba === 'explicar'} onClick={() => setAba('explicar')}>Explicação</button>
      </div>
      <div class="rolagem">
        {aba === 'explicar' ? (
          <Explicacao motor={motor} />
        ) : (
          <>
            {aviso && <div class="aviso">{aviso}</div>}
            {sessao.avisos.value.length > 0 && <div class="aviso">{sessao.avisos.value[0].mensagem}</div>}
            <Secao titulo="Acoplamento" classe="muda a física">
              <Param sessao={sessao} id="kc" dica />
            </Secao>
            <Secao titulo="Massas e molas" classe="muda a física">
              <Param sessao={sessao} id="m1" />
              <Param sessao={sessao} id="m2" />
              <Param sessao={sessao} id="k1" />
              <Param sessao={sessao} id="k2" />
            </Secao>
            <Secao titulo="Condições iniciais" classe="t = 0">
              <div class="dica" style="color:var(--texto-3);font-size:12.5px">Puxe uma massa na cena, ou digite. Mudar uma condição inicial volta a t = 0.</div>
              <Param sessao={sessao} id="x1" />
              <Param sessao={sessao} id="x2" />
              <Param sessao={sessao} id="v1" semSlider />
              <Param sessao={sessao} id="v2" semSlider />
            </Secao>
            <Secao titulo="Modos e medidas" classe="teoria e medida">
              <div class="medidas">
                <Medida simbolo="\omega_-" nome="modo lento" valor={fmtFixo(m.omegaBaixa, 4)} unidade="rad/s" def={`f = ${fmtFixo(m.omegaBaixa / (2 * Math.PI), 4)} Hz, período ${fmtFixo((2 * Math.PI) / m.omegaBaixa, 4)} s`} />
                <Medida simbolo="\omega_+" nome="modo rápido" valor={fmtFixo(m.omegaAlta, 4)} unidade="rad/s" def={`f = ${fmtFixo(m.omegaAlta / (2 * Math.PI), 4)} Hz, período ${fmtFixo((2 * Math.PI) / m.omegaAlta, 4)} s`} />
                <Medida simbolo="T_b" nome="batimento" valor={Number.isFinite(Tb) ? fmtFixo(Tb, 3) : '∞'} unidade="s" />
              </div>
              <Leituras motor={motor} />
            </Secao>
            <Secao titulo="Método numérico" classe="não altera o sistema">
              <Param sessao={sessao} id="integrador" dica />
              <Param sessao={sessao} id="dt" />
              <div class="dica" style={`font-size:12.5px;color:${dt > critico ? 'var(--alerta)' : 'var(--texto-3)'}`}>
                ω₊Δt = {fmtFixo((m.omegaAlta * dt) / 1000, 4)}. Limite de estabilidade de Verlet: Δt = {fmtFixo(critico, 1)} ms.
              </div>
            </Secao>
          </>
        )}
      </div>
    </aside>
  );
}

export default function VistaOsciladores({ sessao, acoes, convite }: PropsVista<SolucaoOsc>) {
  const refCena = useRef<HTMLDivElement>(null);
  const [motor, setMotor] = useState<Motor | null>(null);

  useEffect(() => {
    const m = new Motor(sessao);
    const c = new CenaOsc(refCena.current!, m);
    setMotor(m);
    acoes.value = { exportarPNG: () => c.exportarPNG(), dados: () => conjuntos(sessao, m) };
    (window as any).__estudio = { cena: c, sessao, motor: m };
    return () => {
      m.pausar();
      m.destruir();
      c.destruir();
      acoes.value = {};
    };
  }, [sessao]);

  useEffect(() => {
    if (!motor) return;
    const tecla = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      if (alvo && /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName)) return;
      if (e.ctrlKey || e.metaKey) return;
      const n = e.shiftKey ? 10 : 1;
      switch (e.key) {
        case ' ':
          motor.alternar();
          break;
        case 'ArrowRight':
        case '.':
          motor.passo(n);
          break;
        case 'ArrowLeft':
        case ',':
          motor.passo(-n);
          break;
        case 'r':
        case 'R':
        case 'Home':
          motor.reiniciar();
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', tecla);
    // pausa ao esconder a aba: o relógio físico não deve correr sem desenho
    const vis = () => document.hidden && motor.pausar();
    document.addEventListener('visibilitychange', vis);
    return () => {
      window.removeEventListener('keydown', tecla);
      document.removeEventListener('visibilitychange', vis);
    };
  }, [motor]);

  const cv = convite.value;
  return (
    <div class="exp">
      <div class="cena" ref={refCena} onPointerDown={() => { if (convite.peek()) convite.value = null; }}>
        {cv && (
          <div class="convite" role="status" onPointerDown={(e) => e.stopPropagation()}>
            <div><b>{cv.titulo}</b>{cv.texto}</div>
            <button aria-label="Fechar" onClick={(e) => { e.stopPropagation(); convite.value = null; }}>×</button>
          </div>
        )}
        {motor && <Transporte motor={motor} />}
      </div>
      {motor ? <Graficos motor={motor} /> : <section class="instr" />}
      {motor ? <Painel sessao={sessao} motor={motor} /> : <aside class="painel" />}
    </div>
  );
}
