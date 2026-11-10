/**
 * Bancada de óptica — vista (cena + instrumentos + painel).
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { PropsVista, ConjuntoDados } from '../registro';
import type { Sessao } from '../../nucleo/sessao';
import { comprimentoMm, fmtFixo, radParaGraus } from '../../nucleo/formato';
import { CampoNumero, Icone, Medida, Param, Secao, Segmentado, Tex } from '../../ui/componentes';
import { csv } from '../../ui/exportar';
import { CenaOptica } from './cena';
import { Instrumentos } from './instrumentos';
import { Explicacao } from './explicacao';
import { perfil, type Solucao } from './analise';
import { tracar, cruzamentoEixo, noPlano } from './modelo';

type S = Sessao<Solucao>;

function linkAtual(s: S) {
  return location.origin + location.pathname + s.link();
}

function cabecalho(s: S, extra: string[]): string[] {
  const v = s.valores.peek();
  const linhas = [
    'Estúdio de simulações — Bancada de óptica',
    `estado: ${linkAtual(s)}`,
    'modelo: espelho cônico de revolução, óptica geométrica, seção meridional; z positivo na frente do espelho',
  ];
  for (const p of s.def.parametros) {
    if (p.classe === 'visual') continue;
    linhas.push(`${p.id} = ${v[p.id]}${p.tipo === 'numero' && p.unidade ? ' ' + p.unidade : ''}  (${p.rotulo})`);
  }
  return [...linhas, ...extra];
}

function conjuntos(s: S): ConjuntoDados[] {
  return [
    {
      id: 'raios',
      titulo: 'Raios do leque de medida',
      gerar() {
        const sol = s.solucao.peek();
        const cfg = sol.cfg;
        const L = sol.leque;
        const n = L.n;
        const col = {
          u: new Float64Array(n), rho: new Float64Array(n), est: [] as string[], nr: new Float64Array(n),
          yP: new Float64Array(n), zP: new Float64Array(n), ti: new Float64Array(n), tr: new Float64Array(n),
          zx: new Float64Array(n), ys: new Float64Array(n),
        };
        const semi = (sol.intervalo[1] - sol.intervalo[0]) / 2;
        const meio = (sol.intervalo[1] + sol.intervalo[0]) / 2;
        for (let i = 0; i < n; i++) {
          const t = tracar(cfg.espelho, cfg.feixe.alfa, L.u[i]);
          const r0 = t.reflexoes[0];
          col.u[i] = L.u[i];
          col.rho[i] = (L.u[i] - meio) / semi;
          col.est.push(t.estado);
          col.nr[i] = t.reflexoes.length;
          col.yP[i] = r0 ? r0.p[1] : NaN;
          col.zP[i] = r0 ? r0.p[2] : NaN;
          col.ti[i] = r0 ? radParaGraus(r0.thetaI) : NaN;
          col.tr[i] = r0 ? radParaGraus(r0.thetaR) : NaN;
          const zx = cruzamentoEixo(t);
          col.zx[i] = zx === null ? NaN : zx;
          const imp = noPlano(t, cfg.zs);
          col.ys[i] = imp && Math.abs(imp.y) <= cfg.H ? imp.y : NaN;
        }
        return csv(cabecalho(s, ['células vazias: grandeza indefinida para aquele raio']), [
          { nome: 'u', unidade: 'mm', valores: col.u },
          { nome: 'rho', unidade: '', valores: col.rho },
          { nome: 'estado', unidade: '', valores: col.est },
          { nome: 'reflexoes', unidade: '', valores: col.nr },
          { nome: 'y_P', unidade: 'mm', valores: col.yP },
          { nome: 'z_P', unidade: 'mm', valores: col.zP },
          { nome: 'theta_i', unidade: 'grau', valores: col.ti },
          { nome: 'theta_r', unidade: 'grau', valores: col.tr },
          { nome: 'z_cruzamento', unidade: 'mm', valores: col.zx },
          { nome: 'y_anteparo', unidade: 'mm', valores: col.ys },
        ]);
      },
    },
    {
      id: 'perfil',
      titulo: 'Perfil no anteparo (concentração por intervalo)',
      gerar() {
        const sol = s.solucao.peek();
        const m = sol.anteparo;
        const centro = m.validos ? (m.yMin + m.yMax) / 2 : 0;
        const semi = m.validos ? Math.max((m.yMax - m.yMin) / 2, 1e-9) * 1.05 : 1;
        const p = perfil(sol.leque, sol.cfg.H, centro, semi, 200);
        const yc = new Float64Array(200);
        for (let k = 0; k < 200; k++) yc[k] = (p.bordas[k] + p.bordas[k + 1]) / 2;
        return csv(cabecalho(s, [
          `W = ${m.W} mm; sigma_y = ${m.rms} mm; raios no anteparo = ${m.validos} de ${m.total}`,
          `C = (raios no intervalo × Δu)/Δy; Δu = ${sol.leque.du} mm; Δy = ${p.dy} mm; feixe incidente = 1`,
        ]), [
          { nome: 'y_centro', unidade: 'mm', valores: yc },
          { nome: 'C', unidade: 'adimensional', valores: p.C },
        ]);
      },
    },
    {
      id: 'mancha',
      titulo: 'Mancha 3D no anteparo (impactos)',
      gerar() {
        const sol = s.solucao.peek();
        const M = sol.mancha();
        return csv(cabecalho(s, [
          `feixe 3D amostrado uniformemente em área, ${M.n} raios de pesos iguais`,
          `centroide = (${M.cx}, ${M.cy}) mm; r_RMS = ${M.rRms} mm; r80 = ${M.r80} mm`,
          'no_anteparo: 1 se o impacto cai dentro do disco de raio H',
        ]), [
          { nome: 'x', unidade: 'mm', valores: M.x },
          { nome: 'y', unidade: 'mm', valores: M.y },
          { nome: 'no_anteparo', unidade: '', valores: Array.from(M.valido) },
        ]);
      },
    },
  ];
}

function Painel({ sessao }: { sessao: S }) {
  const [aba, setAba] = useState<'controles' | 'explicar'>('controles');
  const v = sessao.valores.value;
  const sol = sessao.solucao.value;
  const kappa = v.kappa as number;
  const R = v.R as number;
  const a = v.a as number;
  const [rMin, rMax] = sessao.dominioDe('R');
  const pr = sol.prova;
  const r0 = pr?.traco.reflexoes[0];
  const avisos = sessao.avisos.value;
  const duplas = sol.marginalSup.traco.reflexoes.length > 1;

  return (
    <aside class="painel">
      <div class="abas" role="tablist">
        <button role="tab" aria-selected={aba === 'controles'} onClick={() => setAba('controles')}>Bancada</button>
        <button role="tab" aria-selected={aba === 'explicar'} onClick={() => setAba('explicar')}>Explicação</button>
      </div>
      <div class="rolagem">
        {aba === 'explicar' ? (
          <Explicacao sessao={sessao} />
        ) : (
          <>
            {avisos.length > 0 && <div class="aviso">{avisos[0].mensagem}</div>}
            <Secao titulo="Espelho" classe="muda a física">
              <Segmentado
                rotulo="Superfície"
                valor={kappa === 0 ? 'esf' : kappa === -1 ? 'par' : null}
                onMudar={(x) => sessao.definir({ kappa: x === 'esf' ? 0 : -1 })}
                opcoes={[{ valor: 'esf', rotulo: 'Esférico' }, { valor: 'par', rotulo: 'Parabólico' }]}
              />
              <CampoNumero
                id="p-optica-f" rotulo="Distância focal" simbolo="f" unidade="mm" casas={1}
                valor={R / 2} min={rMin / 2} max={rMax / 2} passo={0.5} escala="log"
                onInicio={() => sessao.inicioGesto()} onMudar={(x) => sessao.definir({ R: 2 * x })} onFim={() => sessao.fimGesto()}
              />
              <Param sessao={sessao} id="a" rotulo="Abertura" />
              <div class="dica" style="font-size:12.5px;color:var(--texto-3);margin-top:-6px">
                D = {fmtFixo(2 * a, 1)} mm, f/D = {fmtFixo(R / (4 * a), 2)}, a/R = {fmtFixo(a / R, 3)}
                {duplas && '. O raio marginal reflete mais de uma vez.'}
              </div>
              <details>
                <summary style="color:var(--texto-2);font-size:13.5px;cursor:pointer;padding:2px 0">Curvatura e cônica geral</summary>
                <div style="display:grid;gap:10px;padding-top:8px">
                  <Param sessao={sessao} id="R" semSlider />
                  <Param sessao={sessao} id="kappa" dica />
                </div>
              </details>
            </Secao>

            <Secao titulo="Feixe" classe="muda a física">
              <Param sessao={sessao} id="alfa" />
              <Param sessao={sessao} id="feixeAuto" />
              {!(v.feixeAuto as boolean) && <Param sessao={sessao} id="w" />}
            </Secao>

            <Secao titulo="Anteparo" classe="instrumento">
              <Param sessao={sessao} id="zs" />
              <div style="display:flex;gap:6px;flex-wrap:wrap">
                <button class="btn contorno" onClick={() => sessao.definir({ zs: R / 2 })} title="Levar o anteparo ao foco paraxial">
                  <Icone.alvo /> Levar a <Tex t="F" />
                </button>
              </div>
              <Param sessao={sessao} id="H" semSlider />
              <Param sessao={sessao} id="opaco" dica />
            </Secao>

            <Secao titulo="Raio de prova" classe="medida">
              {pr ? (
                <>
                  <CampoNumero
                    id="p-optica-rho" rotulo="Posição na pupila" simbolo="\rho" unidade="" casas={3}
                    valor={pr.rho} min={-1} max={1} passo={0.005}
                    onInicio={() => sessao.inicioGesto()} onMudar={(x) => sessao.definirExtras({ prova: x }, true)} onFim={() => sessao.fimGesto()}
                  />
                  <div class="medidas">
                    <Medida simbolo="h" nome="altura no feixe" valor={fmtFixo(pr.u, 3)} unidade="mm" />
                    {r0 ? (
                      <>
                        <Medida simbolo="P" nome="incidência (y; z)" valor={`${fmtFixo(r0.p[1], 3)}; ${fmtFixo(r0.p[2], 3)}`} unidade="mm" />
                        <Medida simbolo="\theta_i" nome="incidência" valor={`${fmtFixo(radParaGraus(r0.thetaI), 4)}°`} />
                        <Medida simbolo="\theta_r" nome="reflexão" valor={`${fmtFixo(radParaGraus(r0.thetaR), 4)}°`} />
                        <Medida simbolo="z_\times" nome="cruza o eixo em" valor={pr.zCruz === null ? 'não cruza' : fmtFixo(pr.zCruz, 4)} unidade={pr.zCruz === null ? '' : 'mm'} destaque />
                        <Medida simbolo="\Delta z" nome="distância a F" valor={pr.zCruz === null ? '—' : comprimentoMm(pr.zCruz - sol.f, 4)} />
                        <Medida simbolo="y_s" nome="no anteparo" valor={pr.yAnteparo === null ? 'não alcança' : pr.noAnteparo ? comprimentoMm(pr.yAnteparo, 4) : 'passa fora'} />
                        {pr.traco.reflexoes.length > 1 && <Medida nome="reflexões" valor={String(pr.traco.reflexoes.length)} />}
                      </>
                    ) : (
                      <Medida nome="destino" valor={pr.traco.estado === 'bloqueado' ? 'atinge o verso' : 'não atinge o espelho'} />
                    )}
                  </div>
                  <button class="btn contorno" onClick={() => sessao.definirExtras({ prova: null }, true)}>Soltar o raio</button>
                </>
              ) : (
                <>
                  <div class="dica" style="color:var(--texto-2);font-size:14px">Toque num raio da cena para medir ângulos e o cruzamento com o eixo.</div>
                  <button class="btn contorno" onClick={() => sessao.definirExtras({ prova: 1 }, true)}>Selecionar o raio marginal</button>
                </>
              )}
            </Secao>

            <Secao titulo="Referências" classe="teoria e medida">
              <div class="medidas">
                <Medida simbolo="f" nome="foco paraxial, R/2" valor={fmtFixo(sol.f, 3)} unidade="mm" />
                <Medida simbolo="z_\times^{m}" nome="raio marginal cruza em" valor={sol.marginalSup.zCruz === null ? 'não cruza' : fmtFixo(sol.marginalSup.zCruz, 3)} unidade={sol.marginalSup.zCruz === null ? '' : 'mm'} />
                <Medida simbolo="W" nome="largura no anteparo" valor={Number.isNaN(sol.anteparo.W) ? '—' : comprimentoMm(sol.anteparo.W, 4)} />
              </div>
            </Secao>

            <Secao titulo="Desenho" classe="não altera as medidas" aberta={false}>
              <Param sessao={sessao} id="nRaios" dica />
              <Param sessao={sessao} id="luz" dica />
              {(v.luz as boolean) && <Param sessao={sessao} id="exposicao" />}
              <Param sessao={sessao} id="construcoes" />
              <Param sessao={sessao} id="caustica" />
            </Secao>

            <Secao titulo="Amostragem das medidas" classe="numérico" aberta={false}>
              <Param sessao={sessao} id="nMed" dica />
              <Param sessao={sessao} id="nMancha" />
            </Secao>
          </>
        )}
      </div>
    </aside>
  );
}

export default function VistaOptica({ sessao, acoes, convite }: PropsVista<Solucao>) {
  const refCena = useRef<HTMLDivElement>(null);
  const cena = useRef<CenaOptica | null>(null);
  const [modoLuz, setModoLuz] = useState('');

  useEffect(() => {
    const luz2d = new URLSearchParams(location.search).get('luz') === '2d';
    const c = new CenaOptica(refCena.current!, sessao, { luz2d });
    cena.current = c;
    setModoLuz(c.modoLuz);
    acoes.value = { exportarPNG: () => c.exportarPNG(), dados: () => conjuntos(sessao) };
    // ponto de acesso para os testes de navegador e o medidor de desempenho
    (window as any).__estudio = { cena: c, sessao };
    return () => {
      c.destruir();
      cena.current = null;
      acoes.value = {};
    };
  }, [sessao]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      if (alvo && /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName)) return;
      if (e.ctrlKey || e.metaKey) return;
      const v = sessao.valores.peek();
      const fino = e.altKey ? 0.1 : e.shiftKey ? 10 : 1;
      switch (e.key) {
        case 'ArrowLeft':
        case 'ArrowRight': {
          // na cena, z cresce para a esquerda
          const passo = Math.max((v.R as number) / 400, 1e-6) * fino;
          sessao.definir({ zs: (v.zs as number) + (e.key === 'ArrowLeft' ? passo : -passo) });
          break;
        }
        case 'ArrowUp':
        case 'ArrowDown': {
          const p = sessao.extras.peek().prova;
          const d = (e.key === 'ArrowUp' ? 0.02 : -0.02) * fino;
          if (typeof p === 'number') sessao.definirExtras({ prova: Math.max(-1, Math.min(1, p + d)) }, true);
          else sessao.definirExtras({ prova: e.key === 'ArrowUp' ? 1 : -1 }, true);
          break;
        }
        case 's':
        case 'S':
          sessao.definir({ kappa: (v.kappa as number) === 0 ? -1 : 0 });
          break;
        case 'f':
        case 'F':
        case '0':
          cena.current?.enquadrar();
          break;
        case '+':
        case '=':
          cena.current?.zoom(1.5);
          break;
        case '-':
          cena.current?.zoom(1 / 1.5);
          break;
        case 'Escape':
          sessao.definirExtras({ prova: null }, true);
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [sessao]);

  const cv = convite.value;
  return (
    <div class="exp">
      <div class="cena" ref={refCena} onPointerDown={() => { if (convite.peek()) convite.value = null; }}>
        <div class="legenda-cena">
          Seção meridional de um espelho de revolução
          {modoLuz === 'canvas2d' && ' — camada de luz em modo de compatibilidade (8 bits)'}
        </div>
        {cv && (
          <div class="convite" role="status" onPointerDown={(e) => e.stopPropagation()}>
            <div><b>{cv.titulo}</b>{cv.texto}</div>
            <button aria-label="Fechar" onClick={(e) => { e.stopPropagation(); convite.value = null; }}>×</button>
          </div>
        )}
        <div class="ferramentas-cena" onPointerDown={(e) => e.stopPropagation()}>
          <button aria-label="Ampliar" title="Ampliar (+)" onClick={() => cena.current?.zoom(1.6)}><Icone.mais /></button>
          <button aria-label="Reduzir" title="Reduzir (−)" onClick={() => cena.current?.zoom(1 / 1.6)}><Icone.menos /></button>
          <button aria-label="Reenquadrar" title="Reenquadrar (F)" onClick={() => cena.current?.enquadrar()}><Icone.enquadrar /></button>
        </div>
      </div>
      <Instrumentos sessao={sessao} />
      <Painel sessao={sessao} />
    </div>
  );
}
