/**
 * Osciladores — camada de explicação, com as equações avaliadas no estado atual.
 */
import { Tex, texNum } from '../../ui/componentes';
import { cores } from '../../ui/tema';
import { INTEGRADORES } from '../../nucleo/dinamica';
import type { Motor } from './motor';
import { dtCritico, modosNormais, periodoBatimento } from './modelo';

const Amostra = ({ cor, traco }: { cor: string; traco?: string }) => (
  <span class="amostra" style={`border-color:${cor};border-top-style:${traco ?? 'solid'}`} />
);

export function Explicacao({ motor }: { motor: Motor }) {
  const v = motor.sessao.valores.value;
  void motor.versao.value;
  const cfg = motor.cfg;
  const p = cfg.p;
  const m = modosNormais(p);
  const Tb = periodoBatimento(m);
  const simetrico = p.m1 === p.m2 && p.k1 === p.k2;
  const integ = INTEGRADORES.find((i) => i.valor === cfg.integrador)!;
  const wdt = m.omegaAlta * cfg.dt;
  return (
    <div class="explica">
      <div class="contexto">
        <h3>O sistema agora</h3>
        <p>Com os parâmetros atuais, os modos normais têm frequências</p>
        <Tex bloco t={`\\omega_-=${texNum(m.omegaBaixa, 4)}\\ \\text{rad/s},\\qquad \\omega_+=${texNum(m.omegaAlta, 4)}\\ \\text{rad/s}`} />
        {simetrico ? (
          <>
            <p>
              O sistema é simétrico (<Tex t="m_1=m_2=m" />, <Tex t="k_1=k_2=k" />). No modo lento as massas andam
              juntas e a mola do meio não trabalha; no modo rápido andam em oposição e ela é esticada em dobro:
            </p>
            <Tex bloco t={`\\omega_-=\\sqrt{\\frac{k}{m}}=\\sqrt{\\frac{${texNum(p.k1, 1)}}{${texNum(p.m1, 2)}}},\\qquad \\omega_+=\\sqrt{\\frac{k+2k_c}{m}}=\\sqrt{\\frac{${texNum(p.k1, 1)}+2\\cdot${texNum(p.kc, 1)}}{${texNum(p.m1, 2)}}}`} />
          </>
        ) : (
          <p>
            Sem simetria, cada modo move as duas massas com amplitudes diferentes:{' '}
            <Tex t={`x_2/x_1=${texNum(m.razaoBaixa, 3)}`} /> no modo lento e{' '}
            <Tex t={`x_2/x_1=${texNum(m.razaoAlta, 3)}`} /> no rápido.
          </p>
        )}
        <p>
          Qualquer movimento é a soma dos dois modos. Como as frequências diferem, a soma entra e sai de fase com o
          período de batimento
        </p>
        <Tex bloco t={`T_b=\\frac{2\\pi}{\\omega_+-\\omega_-}=${Number.isFinite(Tb) ? texNum(Tb, 3) + '\\ \\text{s}' : '\\infty'}`} />
        <p>
          Integrador: {integ.rotulo}, ordem {integ.ordem}{integ.simpletico ? ', simplético' : ', não simplético'}.
          Passo <Tex t={`\\Delta t=${texNum(v.dt as number, 1)}\\ \\text{ms}`} />, de modo que{' '}
          <Tex t={`\\omega_+\\Delta t=${texNum(wdt, 4)}`} />. Verlet e Euler simplético ficam instáveis acima de{' '}
          <Tex t={`\\omega_+\\Delta t=2`} />, isto é, <Tex t={`\\Delta t>${texNum(1000 * dtCritico(m), 1)}\\ \\text{ms}`} />.
        </p>
      </div>

      <h3>O que está sendo simulado</h3>
      <p>
        Duas massas num trilho sem atrito, presas às paredes por molas <Tex t="k_1" /> e <Tex t="k_2" /> e ligadas
        entre si pela mola de acoplamento <Tex t="k_c" />. As molas são ideais (lei de Hooke) e não há dissipação.
      </p>
      <Tex bloco t="m_1\ddot x_1=-k_1x_1-k_c\,(x_1-x_2),\qquad m_2\ddot x_2=-k_2x_2-k_c\,(x_2-x_1)" />
      <p>
        O modelo é linear e não inclui colisão entre as massas: amplitudes muito grandes fariam uma atravessar a
        outra, e o desenho não impede isso.
      </p>

      <h3>Símbolos e convenção de sinais</h3>
      <table>
        <tbody>
          <tr><td><Tex t="x_1,\ x_2" /></td><td>deslocamento de cada massa em relação à sua posição de equilíbrio, <b>positivo para a direita</b>.</td></tr>
          <tr><td><Tex t="v_1,\ v_2" /></td><td>velocidades, positivas para a direita.</td></tr>
          <tr><td><Tex t="\omega_\mp" /></td><td>frequências angulares dos modos lento e rápido; <Tex t="f=\omega/2\pi" />.</td></tr>
          <tr><td><Tex t="E_1,\ E_2" /></td><td>energia cinética de cada massa mais a da sua mola de parede.</td></tr>
          <tr><td><Tex t="E_c" /></td><td>energia potencial da mola de acoplamento, <Tex t="\tfrac12 k_c(x_1-x_2)^2" />.</td></tr>
          <tr><td><Tex t="\eta_\mp" /></td><td>coordenadas normais: projeções de <Tex t="(\sqrt{m_1}\,x_1,\ \sqrt{m_2}\,x_2)" /> nas direções dos modos. Cada uma oscila com uma só frequência.</td></tr>
        </tbody>
      </table>

      <h3>Tempo, integração e reprodução</h3>
      <p>
        O relógio físico avança em passos inteiros de <Tex t="\Delta t" />; a taxa de quadros só decide quando
        desenhar. O instante mostrado é sempre <Tex t="t=n\,\Delta t" />, e o estado é função apenas dos parâmetros,
        das condições iniciais e de <Tex t="n" />: o mesmo link reproduz exatamente o mesmo quadro.
      </p>
      <ul>
        <li><b>Mudar um parâmetro</b> refaz a simulação desde <Tex t="t=0" /> até o mesmo instante. Os gráficos inteiros se redesenham com o novo valor.</li>
        <li><b>Puxar uma massa</b> pausa o relógio e redefine a condição inicial: a massa segurada parte do repouso da posição onde for solta. Soltar inicia o movimento em <Tex t="t=0" />.</li>
        <li><b>Voltar o cursor</b> num gráfico e tocar descarta o futuro e recalcula dali.</li>
      </ul>
      <p>
        A energia total é conservada pelo sistema real; a <b>deriva</b> <Tex t="\Delta E/E_0" /> mede só o erro do
        integrador. Métodos simpléticos mantêm essa oscilação limitada; os demais acumulam ganho ou perda.
      </p>

      <h3>Como ler a cena</h3>
      <table>
        <tbody>
          <tr><td><Amostra cor={cores.serie1} />massa 1</td><td>a mesma cor na cena, no registrador e nos gráficos.</td></tr>
          <tr><td><Amostra cor={cores.serie2} />massa 2</td><td>idem.</td></tr>
          <tr><td><Amostra cor={cores.serie3} />acoplamento</td><td>energia na mola do meio; modo rápido no diagrama de frequências.</td></tr>
          <tr><td><Amostra cor={cores.teoria} traco="dashed" />teoria</td><td>osciladores isolados e direções dos modos.</td></tr>
        </tbody>
      </table>
      <p>
        O registrador abaixo das massas usa a mesma escala horizontal da cena: o traço sai de baixo de cada massa e o
        tempo corre para baixo. A espessura de cada mola cresce com a sua rigidez.
      </p>

      <h3>Gestos e atalhos</h3>
      <ul>
        <li><b>Arrastar uma massa</b> define a posição inicial; soltar inicia.</li>
        <li><b>Arrastar num gráfico de tempo</b> escolhe o instante; no diagrama de modos, muda <Tex t="k_c" />.</li>
        <li><span class="chave">Espaço</span> toca ou pausa. <span class="chave">→</span> <span class="chave">←</span> avançam ou recuam um passo (Shift: 10). <span class="chave">R</span> volta a <Tex t="t=0" />.</li>
        <li><span class="chave">1</span> <span class="chave">2</span> alternam os estados A e B (Shift guarda). <span class="chave">Ctrl</span>+<span class="chave">Z</span> desfaz.</li>
      </ul>
    </div>
  );
}
