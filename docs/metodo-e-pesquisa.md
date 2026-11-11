# Método, ferramentas e achados

Este documento registra como o estúdio foi construído numa sessão de agente do Claude Code na nuvem: o ambiente, as ferramentas e skills usadas, o método passo a passo, o que se descobriu sobre a física e a numérica, e as armadilhas encontradas. O objetivo é que outra pessoa, ou outro agente, reproduza o método e continue de onde a sessão parou. Tudo o que está aqui foi executado e conferido; o que não foi está marcado como pendência.

## 1. Estado de entrega

- Dois experimentos completos sobre o mesmo núcleo: **bancada de óptica** (estático, traçado de raios 3D em cônicas de revolução) e **osciladores acoplados** (dinâmico, integração numérica com histórico).
- **149 testes científicos e do núcleo** (Vitest) e **84 testes de navegador** em três perfis (tablet paisagem, tablet retrato, desktop; 77 executam em cada rodada completa e 7 são específicos de um perfil).
- CI no GitHub Actions: tipos, testes, build, testes de navegador e publicação.
- Publicação: build no ramo `gh-pages` a cada push; o GitHub Pages ainda precisa ser **ativado uma vez à mão** (§8). Uma cópia roda como Artifact no claude.ai (privada do dono).
- Documentos: `README.md`, `CLAUDE.md`, `docs/novo-experimento.md`, `docs/verificacao.md`, `docs/desempenho.md` e este.

## 2. Ambiente em que foi feito

| Item | Valor | O que isso muda |
| --- | --- | --- |
| Máquina | Container Linux efêmero, 4 vCPU, 16 GB de RAM, disco por cota | Nada fica fora do git: o container é reciclado. |
| Node | 22 (npm 10) | Versões fixadas com `--save-exact` e `package-lock.json`. |
| Python | 3.13, "externally managed" | `pip install` global falha: use venv (`scripts/ambiente.sh`). |
| Navegador | Chromium e Playwright 1.63 em `/opt/pw-browsers` | `require('playwright')` já funciona. Não rode `playwright install`; fixe `@playwright/test` em 1.63.0. |
| GPU | SwiftShader (software), WebGL2 com `EXT_color_buffer_float` | Shaders rodam, mas tempos de GPU são pessimistas. |
| Rede | Proxy com CA própria (`/root/.ccr/ca-bundle.crt`); ambiente com rede irrestrita | npm e PyPI funcionam direto. Em falha de TLS, ver `/root/.ccr/README.md`. |
| GitHub | `gh` só para busca; servidor MCP do GitHub para Actions, logs e PRs | Logs de CI lidos com `get_job_logs` do MCP. Push por git no ramo da sessão. |
| Permissões | Modo automático | Negou ler variáveis de credenciais de nuvem (há tokens AWS/GCP no ambiente, mas não são do projeto) e negou `graphify claude install`, que reescreve `CLAUDE.md`. O `CLAUDE.md` deste repositório foi escrito à mão. |
| Estabilidade | O processo do agente reiniciou algumas vezes | Arquivos sobrevivem; servidores (vite) e o contexto em andamento, não. Commit e push a cada marco. |

Preparar um container novo: `bash scripts/ambiente.sh` (dependências, graphify num venv, checagem do navegador; ~15 s).

## 3. Ferramentas e para que serviram

| Ferramenta | Uso |
| --- | --- |
| Vite 8, TypeScript 7, Preact 11 + Signals | Aplicação estática, sem servidor. Signals ligam sessão, cena e painéis sem re-render global. |
| KaTeX 0.19 | Fórmulas da explicação, avaliadas com os parâmetros atuais. As fontes do KaTeX também desenham os rótulos matemáticos no canvas (`src/ui/rotulos.ts`). |
| Canvas 2D + WebGL2 | Vetor (geometria exata, recortada em double) e camada de luz (acumulação aditiva em RGBA16F + curva de tons). Caminho alternativo em Canvas 2D, testado. |
| Vitest 5 | Testes científicos, rápidos (< 1 s), sem navegador. |
| Playwright 1.63 | Testes de navegador; toque real com `Input.dispatchTouchEvent` do protocolo do Chromium (`e2e/apoio.ts`); capturas para revisão visual; medição de desempenho. |
| Python + mpmath (60 dígitos) | Referências independentes (`tests/referencia/`), geradas por um subagente que não viu o código. |
| PIL (Python) | Recortar e ampliar capturas para revisar regiões densas sem gastar uma imagem inteira. |
| graphify 0.9.105 | Mapa do código a partir da árvore sintática (§6). |
| `skills` CLI 1.7.6 | Buscar e instalar skills (§4). |
| Validador de paleta da skill `dataviz` | Checou faixa de luminosidade, separação para daltonismo e contraste das cores dos gráficos contra o fundo escuro. |
| GitHub MCP | Listar execuções da CI e ler o log do job que falhou. |
| Artifact (claude.ai) | Publicação alternativa que abre no iPad sem configurar o GitHub. |

## 4. Skills

Busca: `npx -y skills@1.7.6 find <tema>`. A skill `find-skills` foi instalada globalmente:

```sh
npx -y skills@1.7.6 add vercel-labs/skills --skill find-skills -g -a claude-code -y
```

Skills rodam com as permissões do agente: as de terceiros foram instaladas numa pasta de rascunho e **lidas antes de usar**.

| Skill | Origem | Avaliação |
| --- | --- | --- |
| `frontend-design` | `anthropics/skills` | Útil. Guiou o plano de tokens (cor, tipo, layout) e a lista de clichês a evitar. |
| `playwright-best-practices` | `currents-dev/playwright-best-practices-skill` | Útil para a estrutura dos testes de canvas e mobile. Não cobre arrasto e pinça por toque; isso exigiu CDP. |
| `physics-simulation` | `omer-metin/skills-for-antigravity` | Genérica (passo crítico, Verlet contra RK4). Nada além do que o plano já previa. |
| `numerical-methods` | `data-wise/claude-plugins` | Genérica. Não usada. |
| `graphify` | `graphify-labs/graphify` / PyPI `graphifyy` | Útil (§6). `graphify install --platform claude` instala a skill. |
| `dataviz` (embutida) | Claude Code | Útil. Reprovou a primeira paleta (luminosidade alta demais no escuro) e aprovou a final: `#c98500`, `#3987e5`, `#d55181`. |
| `artifact-design`, `artifact-capabilities` (embutidas) | Claude Code | Regras para publicar como Artifact: âncoras simples no endereço, downloads pela capacidade `downloads`. |
| `estudio-de-simulacoes` | este repositório, `.claude/skills/` | Roteiro para mudar ou criar experimentos aqui. Carrega sozinha no Claude Code. |

Para repetir a instalação das de terceiros num projeto: `npx -y skills@1.7.6 add <origem> --skill <nome> -a claude-code -y`.

## 5. Método

A ordem importa: cada etapa só começa quando a anterior pode ser verificada sem a seguinte.

1. **Inspecionar o ambiente.** Repositório, remotos, versões, navegador, rede, credenciais disponíveis, permissões. Aqui o repositório estava vazio e o ramo padrão é o próprio ramo da sessão.
2. **Núcleo e física antes de qualquer pixel.** `nucleo/` (parâmetros, estado, sessão, vista 2D, integradores) e o modelo de cada experimento são puros. `npm run medir` lê qualquer grandeza no terminal.
3. **Referência independente em paralelo.** Logo no início, um subagente em segundo plano recebeu uma especificação escrita (equações da cônica, convenção de sinais, definição de cada saída, lista de casos com bordas) e a proibição de ler o código TypeScript. Ele escreveu `gerar_optica.py` e `gerar_osciladores.py` em mpmath, com dois métodos de cálculo que precisam concordar antes de gravar o JSON. Enquanto ele trabalhava, o núcleo era escrito. Ele encontrou um erro na própria especificação (§7).
4. **Testes com regra de independência.** O esperado nunca sai da função de produção: referência externa, fórmula escrita no teste, ou invariante físico. Cada tolerância tem unidade e justificativa.
5. **Interface sobre o núcleo.** A cena só lê a solução e escreve parâmetros. Alças finas com área de toque grande; leitura da grandeza junto ao dedo; desfazer por gesto.
6. **Revisão visual por capturas.** Viewports de tablet com `deviceScaleFactor: 2` e toque, olhando a imagem inteira e depois recortes ampliados (foco, rótulos de ângulo, legendas). Cada rodada gerou correções: rótulos sobrepostos, curva de tons sem contraste, régua coberta, barra do telefone apertada.
7. **Testes de navegador com gestos reais.** Arrastar cada alça, tocar num raio, pinça em torno do foco, trocar a superfície, A/B, campo numérico, link em sessão nova com igualdade exata das medidas, exportações.
8. **Desempenho medido, não estimado.** `scripts/desempenho.mjs` mede solução, quadro e quadros por segundo numa cena típica, numa exigente e em zoom profundo, e registra o ambiente.
9. **Documentação, CI e publicação**, verificando o resultado da CI pelo log.
10. **Grafo do código** para que a próxima sessão comece barata.

## 6. graphify na prática

```sh
bash scripts/ambiente.sh          # instala num venv e põe `graphify` em ~/.local/bin
npm run grafo                     # = graphify update . (árvore sintática, sem LLM, sem custo)
graphify god-nodes --top 10       # nós mais conectados
graphify query "onde a camada de luz decide quantos raios desenhar?"
graphify explain "CenaOptica"
graphify affected "tracarBruto"   # o que depende de uma função
graphify benchmark graphify-out/graph.json
```

Medido neste repositório: 712 nós, 1849 ligações, 15 comunidades; **29,6× menos tokens por consulta** do que ler o código inteiro (~47 mil tokens). O relatório também orientou uma refatoração: `CenaOptica` era o segundo nó mais conectado, e o percurso dos raios e os rótulos matemáticos saíram para `optica/percurso.ts` e `ui/rotulos.ts`.

Só `graphify-out/GRAPH_REPORT.md` é versionado (`.gitignore`); `graph.json` e `graph.html` são regenerados. Arquivos fora do grafo: `.graphifyignore`.

## 7. Achados

### Óptica

- **Segunda reflexão na esfera.** A especificação inicial dizia que a re-reflexão começa em θ = 60°. A referência independente mostrou que, com abertura a = 380 mm e R = 400 mm, ela começa perto de 36°. O correto: o raio refletido é uma corda que avança π − 2θ em torno do centro; há nova reflexão se |3θ − π| ≤ θₐ, com sen θₐ = a/R, ou seja, a partir de θ* = (π − θₐ)/3. O raio marginal só reflete duas vezes se a/R ≥ sen 45°. Testado com ±0,5 mm em torno dos limiares.
- **Limite paraxial e terceira ordem.** f − z× = (1+κ)·h²/(4R)·(1 + O((h/R)²)) para qualquer cônica. No foco paraxial da esfera, W → a³/R² (razão medida 1,0036 em a/R = 0,04) e r_RMS da mancha 3D → a³/(4R²).
- **Parábola.** |z× − f| ≤ 1,1×10⁻¹³ mm para h de 1 µm a 380 mm; a mancha no foco tem r_RMS = 3×10⁻¹⁴ mm, contra 7,05 mm da esfera com a mesma abertura (a = 150 mm, R = 400 mm).
- **Interseção estável.** A quádrica tem A = dₓ² + d_y² + (1+κ)d_z², que vale zero para um raio paralelo ao eixo de um paraboloide. A forma q = −(B + sgn(B)√(B² − AC)), t = q/A ou C/q, mais o caso linear para A → 0, evita cancelamento.
- **Comparação honesta esfera × parábola.** O domínio da abertura é o mesmo para κ ≤ 0 (0,95 R), então trocar a superfície nunca altera a, o anteparo, o feixe nem o enquadramento. A janela do perfil só cresce sozinha: a troca não reamplia o gráfico.
- **O que o brilho significa.** A camada de luz é a densidade de raios da seção meridional relativa ao feixe incidente (1×): faixas de largura constante perpendiculares ao raio, então um raio inclinado contribui com 1/cos θ, como a fluência de um feixe plano. Num feixe 3D de revolução há ainda o fator h/r junto ao eixo; a irradiância 3D aparece só no instrumento Mancha. O modelo não tem difração e por isso não mostra franjas.

### Numérica

- **Verlet desloca a frequência** em +(ωΔt)²/24. Medido por cruzamentos de zero: +1,67×10⁻⁶ e +2,00×10⁻⁶ nos dois modos, igual ao previsto.
- **Energia em 1000 períodos (226 725 passos de 4 ms):** Verlet ≤ 1,8×10⁻⁴, limitado e sem deriva; RK4 −1,2×10⁻⁶, perda monotônica; Euler simplético ≤ 1,4×10⁻²; Euler explícito multiplica a energia por 36 em 5000 passos.
- **Batimento não transfere tudo.** Em meio período de batimento x₁ = 0, mas v₁ ≠ 0: sobra na massa 1 a fração ½m(A/2)²(ω₊−ω₋)²sen²(ω₋t*) / [½(k+k_c)A²]. A transferência só é total no limite de acoplamento fraco.
- **Reprodutibilidade exata.** Tempo como contagem inteira de passos; mudar um parâmetro refaz o histórico até o mesmo instante; o link guarda o passo; reabrir dá os mesmos doubles.

### Renderização e interação

- **Canvas é float32.** Uma reta enviada com coordenadas a 10⁹ px perde a posição. Recortar em double (Liang–Barsky) antes de desenhar mantém a geometria exata: o teste a 2×10⁶ px/mm põe o raio a menos de 10⁻³ px do foco.
- **Custo durante o gesto.** A camada de luz usa menos raios e resolução 1× enquanto o dedo se move, tem orçamento de preenchimento para o zoom profundo e só é refeita quando muda algo de que depende. Medidas: [desempenho.md](desempenho.md).
- **Mesmo instante em todo lugar.** No experimento dinâmico, cena, gráficos e leituras desenham no mesmo quadro (`batch` dos sinais + `useLayoutEffect` + desenho síncrono da cena dentro do laço do motor).

## 8. Armadilhas e soluções

| Armadilha | Solução |
| --- | --- |
| O token do Actions não cria o site do Pages (`Resource not accessible by integration`) | O workflow tenta o deploy por Actions e sempre publica no ramo `gh-pages`. Falta ativar uma vez: Settings → Pages → Source = *Deploy from a branch*, `gh-pages` / `(root)`, ou *GitHub Actions*. |
| `graphify claude install` negado pelo modo automático (escreve `CLAUDE.md`) | `CLAUDE.md` escrito à mão com a mesma orientação. |
| Telas sobrepostas cobriam os controles da cena | `z-index` explícito nas sobreposições (as telas são inseridas depois no DOM). |
| `page.tap` não arrasta nem faz pinça | `Input.dispatchTouchEvent` pelo CDP (`e2e/apoio.ts`). |
| Mouse wheel não existe nos perfis com toque | Usar o botão Ampliar ou a pinça por CDP. |
| Primeira paleta reprovada pelo validador | Passos mais escuros da mesma família de cores. |
| Fontes do canvas carregam depois do primeiro quadro | Redesenhar quando `document.fonts.load` resolver. |
| Embutido como Artifact, o endereço só aceita `#nome` e downloads diretos são bloqueados | `src/config.ts` detecta o visualizador; link de estado usa o endereço público; arquivos saem pela capacidade `downloads`. |
| O service worker não achava os módulos guardados ao recarregar sem rede | O Vite pede módulos com `crossorigin` e o servidor responde `Vary: Origin`; `cache.match` precisa de `ignoreVary: true`. |
| Teste que esperava 500 ms pelo link falhou com os testes em paralelo | Esperar a condição (`expect.poll` até o endereço igualar `sessao.link()`), nunca um tempo fixo. |
| Reinício do processo do agente no meio do trabalho | Commits pequenos e frequentes; checar `git status` ao voltar. |

## 9. Como retomar numa sessão nova

1. `bash scripts/ambiente.sh`
2. Ler `CLAUDE.md` e `graphify-out/GRAPH_REPORT.md`.
3. `npm test` e `npm run test:e2e` para confirmar o ponto de partida.
4. `npm run dev` e abrir `http://127.0.0.1:5173/`.
5. Para uma mudança: a skill `estudio-de-simulacoes` tem o roteiro.

## 10. Próximos passos sugeridos

Já feitos depois da primeira entrega: comparação simultânea com o estado guardado nos instrumentos da óptica, funcionamento offline (service worker com teste de rede desligada), descrição textual da cena para leitores de tela, barra superior para telefone.

Em ordem de valor para quem usa:

1. **Ativar o GitHub Pages** (um clique, §8) e abrir no iPad real. Conferir no Safari: alvo de ponto flutuante do WebGL2 (há alternativa), folha de compartilhamento, gestos do sistema, instalação na tela inicial e uso sem rede.
2. **Referência do estado guardado também na cena**: raios do outro estado como traço fantasma, para ver a mudança de geometria e não só a dos gráficos.
3. **Comparação nos osciladores**: o mesmo mecanismo (`useFantasma` em `optica/instrumentos.tsx`) aplicado aos gráficos de energia e de posições.
4. **Modo ondulatório** como modelo próprio: integral de Huygens–Fresnel sobre a pupila, com comprimento de onda, escala e validação próprias (comparar com o disco de Airy da parábola). Só depois deste, franjas na tela.
5. **Novos experimentos** pelo guia: refração em lente espessa (reaproveita o traçado), pêndulo duplo (reaproveita o motor dinâmico e expõe caos), cadeia de N osciladores (modos e dispersão).
6. **Solução em worker** para a cena exigente (leque de 20 001 raios + mancha de 20 000 em ~16 ms): mover `resolver` para um Web Worker liberaria o fio principal durante o arrasto.
