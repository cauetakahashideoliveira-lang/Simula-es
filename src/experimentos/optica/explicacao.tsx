/**
 * Bancada de óptica — camada de explicação.
 * O bloco de contexto muda com o que está selecionado e avalia as equações
 * com os parâmetros atuais; o restante define símbolos, convenções e hipóteses.
 */
import type { Sessao } from '../../nucleo/sessao';
import { radParaGraus } from '../../nucleo/formato';
import { Tex, texComp, texNum } from '../../ui/componentes';
import { cores } from '../../ui/tema';
import { cruzamentoEsferaAnalitico } from './modelo';
import type { Solucao } from './analise';

const v3 = (a: readonly number[]) => `\\begin{pmatrix}${texNum(a[1], 4)}\\\\${texNum(a[2], 4)}\\end{pmatrix}`;

function Contexto({ sol }: { sol: Solucao }) {
  const e = sol.cfg.espelho;
  const noEixo = Math.abs(sol.cfg.feixe.alfa) < 1e-12;
  const pr = sol.prova;
  const r0 = pr?.traco.reflexoes[0];
  if (pr && r0) {
    const ti = radParaGraus(r0.thetaI);
    const tr = radParaGraus(r0.thetaR);
    const esfera = e.kappa === 0;
    const parabola = e.kappa === -1;
    const h = pr.u;
    return (
      <div class="contexto">
        <h3>Raio de prova selecionado</h3>
        <p>
          O raio incide no ponto <Tex t="P" /> com direção <Tex t="\hat d" />. A normal local <Tex t="\hat n" /> é
          perpendicular à tangente da superfície em <Tex t="P" />. A direção refletida vem da lei vetorial:
        </p>
        <Tex bloco t={`\\hat r=\\hat d-2\\,(\\hat d\\cdot\\hat n)\\,\\hat n`} />
        <p>Com os valores atuais, nas componentes <Tex t="(y,\,z)" />:</p>
        <Tex bloco t={`\\hat d=${v3(r0.dEntra)},\\quad \\hat n=${v3(r0.n)},\\quad \\hat r=${v3(r0.dSai)}`} />
        <p>
          Os dois ângulos são medidos em relação à normal, cada um a partir do seu raio:
        </p>
        <Tex bloco t={`\\theta_i=${texNum(ti, 4)}^\\circ,\\qquad \\theta_r=${texNum(tr, 4)}^\\circ`} />
        {pr.traco.reflexoes.length > 1 && (
          <p>Este raio reflete {pr.traco.reflexoes.length} vezes antes de sair do espelho.</p>
        )}
        {noEixo && esfera && pr.traco.reflexoes.length === 1 && Math.abs(h) > 1e-9 && (
          <>
            <p>
              Na esfera, o centro <Tex t="C" />, o ponto <Tex t="P" /> e o cruzamento <Tex t="X" /> formam um triângulo
              isósceles (ângulos <Tex t="\theta" /> em <Tex t="C" /> e em <Tex t="P" />), com{' '}
              <Tex t="\sin\theta=h/R" />. Daí
            </p>
            <Tex bloco t={`z_\\times=R-\\frac{R}{2\\cos\\theta}=${texNum(e.R, 1)}-\\frac{${texNum(e.R, 1)}}{2\\cos ${texNum(ti, 3)}^\\circ}=${texNum(cruzamentoEsferaAnalitico(e.R, h), 4)}\\ \\text{mm}`} />
            <p>
              O traçado mediu <Tex t={`z_\\times=${pr.zCruz === null ? '\\text{—}' : texNum(pr.zCruz, 4)}\\ \\text{mm}`} />.
              Para <Tex t="h\ll R" /> a expressão tende a <Tex t={`f=R/2=${texNum(sol.f, 1)}\\ \\text{mm}`} />, e o primeiro
              desvio é
            </p>
            <Tex bloco t={`\\Delta z=z_\\times-f\\approx-\\frac{h^2}{4R}=${texNum(-(h * h) / (4 * e.R), 4)}\\ \\text{mm}\\quad(\\text{exato: }${pr.zCruz === null ? '\\text{—}' : texNum(pr.zCruz - sol.f, 4)}\\ \\text{mm})`} />
          </>
        )}
        {noEixo && parabola && (
          <p>
            Na parábola <Tex t="z=y^2/(4f)" /> todo raio paralelo ao eixo passa por <Tex t="F" />: o caminho até o foco é
            igual à distância até a diretriz, para qualquer <Tex t="h" />. O traçado mediu{' '}
            <Tex t={`z_\\times-f=${pr.zCruz === null ? '\\text{—}' : texNum(pr.zCruz - sol.f, 10)}\\ \\text{mm}`} />: a diferença em
            relação a zero é só arredondamento numérico.
          </p>
        )}
        {noEixo && !esfera && !parabola && (
          <p>
            Para uma cônica de constante <Tex t={`\\kappa=${texNum(e.kappa, 3)}`} />, o desvio de terceira ordem é{' '}
            <Tex t={`\\Delta z\\approx-(1+\\kappa)\\,h^2/(4R)=${texNum((-(1 + e.kappa) * h * h) / (4 * e.R), 4)}\\ \\text{mm}`} />;
            o traçado mediu <Tex t={`${pr.zCruz === null ? '\\text{—}' : texNum(pr.zCruz - sol.f, 4)}\\ \\text{mm}`} />.
          </p>
        )}
        {!noEixo && (
          <p>
            Com o feixe inclinado, o cruzamento com o eixo óptico deixa de ser a referência natural. A imagem paraxial
            fica em <Tex t={`F'=(y,z)=(-f\\tan\\alpha,\\ f)=(${texNum(sol.imagem.y, 3)},\\ ${texNum(sol.imagem.z, 1)})\\ \\text{mm}`} />;
            compare com a mancha no anteparo.
          </p>
        )}
      </div>
    );
  }
  const m = sol.anteparo;
  const emF = Math.abs(sol.cfg.zs - sol.f) < 1e-9;
  return (
    <div class="contexto">
      <h3>No anteparo agora</h3>
      {m.validos ? (
        <>
          <p>
            O leque de medida ({m.total} raios meridionais igualmente espaçados em altura) cruza o anteparo em{' '}
            <Tex t={`z_s=${texNum(sol.cfg.zs, 2)}\\ \\text{mm}`} /> entre{' '}
            <Tex t={`y_\\text{mín}=${texNum(m.yMin, 4)}`} /> e <Tex t={`y_\\text{máx}=${texNum(m.yMax, 4)}\\ \\text{mm}`} />:
          </p>
          <Tex bloco t={`W=y_\\text{máx}-y_\\text{mín}=${texComp(m.W, 5)}`} />
          {noEixo && e.kappa === 0 && emF && (
            <p>
              No plano focal paraxial de uma esfera, a teoria de terceira ordem prevê{' '}
              <Tex t={`W\\approx a^3/R^2=${texNum(e.a ** 3 / e.R ** 2, 4)}\\ \\text{mm}`} />. A diferença para o valor medido
              cresce com <Tex t="(a/R)^2" />.
            </p>
          )}
        </>
      ) : (
        <p>Nenhum raio refletido atinge o anteparo nesta posição.</p>
      )}
      <p>Toque num raio da cena para ver o ponto de incidência, a normal, a tangente e os ângulos.</p>
    </div>
  );
}

const Amostra = ({ cor, traco }: { cor: string; traco?: string }) => (
  <span class="amostra" style={`border-color:${cor};border-top-style:${traco ?? 'solid'}`} />
);

export function Explicacao({ sessao }: { sessao: Sessao<Solucao> }) {
  const sol = sessao.solucao.value;
  return (
    <div class="explica">
      <Contexto sol={sol} />

      <h3>O que está sendo simulado</h3>
      <p>
        Um espelho côncavo <b>de revolução</b> (3D) recebe um feixe colimado. A cena mostra a <b>seção meridional</b>:
        o plano que contém o eixo óptico. Raios desse plano permanecem nele, por isso os ângulos e distâncias da cena
        são exatos. A mancha no anteparo é calculada com o feixe 3D completo.
      </p>
      <p>A superfície é uma cônica com raio de curvatura <Tex t="R" /> no vértice e constante cônica <Tex t="\kappa" />:</p>
      <Tex bloco t="x^2+y^2-2Rz+(1+\kappa)\,z^2=0" />
      <p>
        <Tex t="\kappa=0" /> é a esfera; <Tex t="\kappa=-1" /> é o paraboloide <Tex t="z=(x^2+y^2)/(2R)" />. As duas têm a
        mesma distância focal paraxial <Tex t="f=R/2" /> e, aqui, a mesma abertura física <Tex t="a" />.
      </p>
      <p>
        Cada raio é levado até a superfície real (interseção exata com a cônica), refletido com a normal local e
        seguido até sair do espelho; aberturas grandes produzem reflexões múltiplas.
      </p>

      <h3>Símbolos e convenção de sinais</h3>
      <table>
        <tbody>
          <tr><td><Tex t="z" /></td><td>posição sobre o eixo óptico, medida do vértice <Tex t="V" />, <b>positiva na frente do espelho</b> (de onde vem a luz). Na cena, cresce para a esquerda.</td></tr>
          <tr><td><Tex t="y" /></td><td>posição transversal no plano da cena, positiva para cima.</td></tr>
          <tr><td><Tex t="R,\ f" /></td><td>raio de curvatura no vértice e distância focal paraxial, <Tex t="f=R/2" />. <Tex t="C" /> está em <Tex t="z=R" /> e <Tex t="F" /> em <Tex t="z=f" />.</td></tr>
          <tr><td><Tex t="a" /></td><td>semidiâmetro da abertura (do eixo à borda do espelho).</td></tr>
          <tr><td><Tex t="\alpha" /></td><td>ângulo do feixe com o eixo; positivo quando a luz vem de cima.</td></tr>
          <tr><td><Tex t="h,\ \rho" /></td><td>altura do raio na seção do feixe e a mesma grandeza normalizada pela borda, <Tex t="\rho\in[-1,1]" />. <Tex t="\rho=\pm1" /> são os raios marginais.</td></tr>
          <tr><td><Tex t="\theta_i,\ \theta_r" /></td><td>ângulos de incidência e de reflexão, medidos a partir da normal local.</td></tr>
          <tr><td><Tex t="z_\times,\ \Delta z" /></td><td>onde o raio refletido cruza o eixo, e <Tex t="\Delta z=z_\times-f" /> (aberração esférica longitudinal). Negativo: cruza antes de <Tex t="F" />, mais perto do espelho.</td></tr>
          <tr><td><Tex t="z_s,\ H" /></td><td>posição e semi-altura do anteparo.</td></tr>
        </tbody>
      </table>

      <h3>Medidas no anteparo</h3>
      <p>
        O anteparo é um plano perpendicular ao eixo que registra a primeira passagem de cada raio <b>refletido</b>; ele
        não obstrui o feixe incidente (como um detector alimentado por um divisor de feixe). Opaco, encerra os raios;
        transparente, deixa que sigam.
      </p>
      <ul>
        <li><b>Largura total</b> <Tex t="W=y_\text{máx}-y_\text{mín}" /> e <b>desvio RMS</b> <Tex t="\sigma_y" />: seção meridional, raios com pesos iguais por unidade de altura.</li>
        <li><b>Perfil</b>: concentração <Tex t="C=(\mathrm dP/\mathrm dy)\,/\,(\mathrm dP/\mathrm dh)" />, estimada por contagem em intervalos. O feixe incidente vale 1.</li>
        <li><b>Mancha 3D</b>: impactos de um feixe amostrado uniformemente em área; <Tex t="r_\mathrm{RMS}" /> e <Tex t="r_{80}" /> em torno do centroide. Aqui a contagem por área é proporcional à irradiância geométrica.</li>
      </ul>

      <h3>O que o brilho significa</h3>
      <p>
        Os <b>raios desenhados</b> são ilustrativos: o traço tem espessura constante para ser legível, e a quantidade é
        só uma escolha de desenho. A <b>camada de luz</b> soma milhares de raios da seção meridional, com pesos iguais
        por unidade de altura, e é normalizada pelo feixe incidente (1×). Ela mostra a densidade de energia de um feixe
        plano, o que uma névoa fina revelaria. Num feixe 3D de revolução há ainda um fator geométrico <Tex t="h/r" />{' '}
        que concentra a luz junto ao eixo; a medida 3D está no instrumento Mancha.
      </p>
      <p>
        O modelo é puramente geométrico: não há difração, e por isso não há franjas. Onde a óptica geométrica prevê um
        ponto, a largura real seria limitada pelo comprimento de onda.
      </p>

      <h3>Como ler a cena</h3>
      <table>
        <tbody>
          <tr><td><Amostra cor={cores.luz} />luz</td><td>raios e camada de luz, traço contínuo.</td></tr>
          <tr><td><Amostra cor={cores.equipamento} />equipamento</td><td>superfície refletora (o lado hachurado é o verso) e anteparo.</td></tr>
          <tr><td><Amostra cor={cores.construcao} traco="dashed" />construção</td><td>normal (traço longo), tangente (traço curto), arcos dos ângulos, cáustica.</td></tr>
          <tr><td><Amostra cor={cores.teoria} traco="dotted" />teoria</td><td>previsões paraxiais: <Tex t="F" />, <Tex t="C" />, imagem <Tex t="F'" />. Losangos e traço-ponto.</td></tr>
          <tr><td><Amostra cor={cores.selecao} />seleção</td><td>raio de prova, cruzamento ×, cotas de medida.</td></tr>
        </tbody>
      </table>

      <h3>Gestos e atalhos</h3>
      <ul>
        <li><b>Arrastar uma alça</b> (círculo ou pegador): borda do espelho, anteparo, <Tex t="C" /> (curvatura), <Tex t="\alpha" /> (incidência), ponto de incidência do raio de prova.</li>
        <li><b>Tocar num raio</b> seleciona o raio de prova; tocar no vazio solta.</li>
        <li><b>Arrastar o fundo</b> desloca; <b>pinça</b> ou roda do mouse amplia; <b>toque duplo</b> reenquadra.</li>
        <li><span class="chave">←</span> <span class="chave">→</span> movem o anteparo (Shift: ×10, Alt: ÷10). <span class="chave">↑</span> <span class="chave">↓</span> movem o raio de prova.</li>
        <li><span class="chave">S</span> troca a superfície. <span class="chave">F</span> reenquadra. <span class="chave">Esc</span> solta o raio.</li>
        <li><span class="chave">1</span> <span class="chave">2</span> alternam os estados A e B (Shift guarda). <span class="chave">Ctrl</span>+<span class="chave">Z</span> desfaz.</li>
      </ul>
      <p style="color:var(--texto-3)">
        Mancha atual: <Tex t={`r_\\mathrm{RMS}=${texComp(sol.mancha().rRms, 4)}`} /> com {sol.cfg.nMancha} raios.
      </p>
    </div>
  );
}
