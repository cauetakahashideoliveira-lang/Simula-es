# Estúdio de simulações

Estúdio interativo de simulações físicas, feito para investigar com o dedo: arrastar um elemento da cena, formular uma hipótese, medir e compartilhar exatamente o que se viu. Roda inteiro no navegador (sem servidor de cálculo).

**Abrir:** https://cauetakahashideoliveira-lang.github.io/Simula-es/ (GitHub Pages — veja [Publicar](#publicar))

## Experimentos

| Experimento | O que dá para fazer |
| --- | --- |
| **Bancada de óptica** | Feixe paralelo num espelho côncavo esférico, parabólico ou cônico geral. Arrastar a borda do espelho, o anteparo, o centro de curvatura e a incidência; tocar num raio para ver ponto de incidência, tangente, normal, θᵢ e θᵣ e onde ele cruza o eixo. Instrumentos: perfil no anteparo, mancha 3D com energia contida, aberração longitudinal, varredura do anteparo. |
| **Osciladores acoplados** | Duas massas e três molas. Puxar uma massa e soltar; pausar, avançar passo a passo, voltar no tempo pelo gráfico. Posições, energia por parte, frequências dos modos em função do acoplamento, plano x₁–x₂. Quatro integradores para comparar a deriva de energia. |

Nos dois: predefinições de investigação, dois estados guardados (A/B) que alternam sem perder o enquadramento, desfazer/refazer, camada de explicação com as equações avaliadas nos parâmetros atuais, link que reabre o mesmo estado, exportação de imagem (PNG), dados com nomes e unidades (CSV) e estado versionado (JSON).

## Rodar

Requer Node 22. Numa máquina ou container novo, `bash scripts/ambiente.sh` faz tudo de uma vez (dependências, graphify, navegador dos testes).

```sh
npm ci            # instala as versões fixadas em package-lock.json
npm run dev       # servidor de desenvolvimento (http://localhost:5173)
npm test          # verificação científica e do núcleo (Vitest, 149 testes)
npm run test:e2e  # build + testes de navegador (Playwright, Chromium em viewport de tablet)
npm run build     # verificação de tipos + build de produção em dist/
npm run preview   # serve dist/ localmente
```

Na primeira vez, os testes de navegador precisam do Chromium do Playwright: `npx playwright install chromium`.

### Medir sem abrir o renderizador

A física não depende da interface. Qualquer grandeza pode ser lida no terminal, a partir de parâmetros ou de um link copiado do estúdio:

```sh
npm run medir -- optica a=120 zs=196 x.prova=1
npm run medir -- '#/optica?f=1&e=1&kappa=-1&a=150'
npm run medir -- osciladores kc=8 x.passos=2500 --json
```

## Publicar

A integração contínua (`.github/workflows/ci.yml`) roda tipos, testes científicos, build e testes de navegador a cada push. No ramo padrão ela também publica:

1. **GitHub Pages por Actions**, se o repositório tiver *Settings → Pages → Source = GitHub Actions*;
2. sempre, o build no ramo **`gh-pages`**, que serve se o Pages estiver em *Deploy from a branch → `gh-pages` / (root)*.

O token do Actions não pode *criar* o site do Pages; isso é feito uma única vez, à mão, em **Settings → Pages** (qualquer uma das duas opções acima). Depois disso cada push publica sozinho.

O build usa caminhos relativos (`base: './'`), então `dist/` funciona em qualquer hospedagem estática ou subpasta. `node scripts/artefato.mjs` prepara o mesmo build para ser publicado como Artifact no claude.ai.

## Organização

```
src/nucleo/         núcleo reutilizável, sem DOM: parâmetros com unidade e domínio, estado
                    versionado (link e JSON), sessão (desfazer, A/B), vista 2D em precisão
                    dupla, integradores, simulação determinística com histórico, relógio físico
src/ui/             kit de interface: campos numéricos com unidade, fórmulas (KaTeX), gráficos
                    em canvas, camada de luz (WebGL2), exportação
src/experimentos/   um diretório por experimento:
    modelo.ts         física pura
    analise.ts        instrumentos de medida (óptica)
    definicao.ts      parâmetros, predefinições, observáveis (o contrato com o núcleo)
    cena.ts           desenho e interação
    Vista.tsx         painel, instrumentos/gráficos, explicação
tests/              verificação científica; tests/referencia/ tem valores independentes (mpmath)
e2e/                testes de navegador
scripts/            ambiente (preparar máquina), medir (terminal), desempenho, captura de telas, artefato
docs/               método e pesquisa, guia de novo experimento, verificação, desempenho
.claude/skills/     skill do projeto para o Claude Code
graphify-out/       mapa do código gerado pelo graphify (GRAPH_REPORT.md)
```

- **Para continuar o projeto (pessoa ou agente):** [CLAUDE.md](CLAUDE.md) tem as regras e convenções; [docs/metodo-e-pesquisa.md](docs/metodo-e-pesquisa.md) registra o ambiente, as ferramentas e skills usadas, o método, os achados de física e numérica e as armadilhas. A skill do projeto (`.claude/skills/estudio-de-simulacoes`) carrega sozinha no Claude Code.
- **Acrescentar um experimento:** [docs/novo-experimento.md](docs/novo-experimento.md)
- **O que foi verificado, com que tolerância, e o que foi emulação:** [docs/verificacao.md](docs/verificacao.md)
- **Desempenho medido:** [docs/desempenho.md](docs/desempenho.md)

### Mapa do código (graphify)

`graphify-out/GRAPH_REPORT.md` é um mapa do repositório (nós mais conectados, comunidades, ligações entre arquivos) gerado por [graphify](https://pypi.org/project/graphifyy/) a partir da árvore sintática, sem LLM. Serve para um assistente (ou uma pessoa) se orientar lendo um arquivo curto em vez do código inteiro.

```sh
pip install graphifyy            # uma vez
npm run grafo                    # refaz o grafo depois de mudar o código
graphify query "onde a largura no anteparo é calculada?"
graphify explain "Sessao"        # um nó e seus vizinhos
graphify affected "tracarBruto"  # o que depende de uma função
```

Só o relatório é versionado; `graph.json` e `graph.html` são regenerados localmente. O `CLAUDE.md` do projeto já instrui o Claude Code a ler o relatório antes de abrir arquivos grandes. Medido aqui: 712 nós, 29,6× menos tokens por consulta do que ler o código inteiro.
