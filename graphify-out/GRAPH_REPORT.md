# Graph Report - Simula-es  (2026-11-11)

## Corpus Check
- 63 files · ~80,057 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 5 file(s) not represented in the graph (top: (none) 3, .webmanifest 1, .css 1)

## Summary
- 754 nodes · 1924 edges · 25 communities (21 shown, 4 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 73 edges (avg confidence: 0.88)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `4c254595`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Sessao
- optica/cena.ts
- instrumentos.tsx
- osciladores/definicao.ts
- analise.ts
- gerar_optica.py
- package.json
- publicar
- app.tsx
- optica.spec.ts
- CenaOsc
- compilerOptions
- Dados de referência independentes
- Como acrescentar um experimento
- ambiente.sh
- Método, ferramentas e achados
- Estúdio de simulações: instruções para agentes
- Estúdio de simulações
- O que foi verificado
- Trabalhar no Estúdio de simulações
- Desempenho medido
- 7. Achados
- optica/Vista.tsx
- sw.js

## God Nodes (most connected - your core abstractions)
1. `Sessao` - 41 edges
2. `CenaOptica` - 40 edges
3. `fmtFixo()` - 29 edges
4. `Motor` - 22 edges
5. `Perfil()` - 21 edges
6. `CenaOsc` - 21 edges
7. `Simulacao` - 20 edges
8. `Mancha()` - 19 edges
9. `Aberracao()` - 19 edges
10. `fmtSig()` - 19 edges

## Surprising Connections (you probably didn't know these)
- `10. Próximos passos sugeridos` --references--> `useFantasma()`  [INFERRED]
  docs/metodo-e-pesquisa.md → src/experimentos/optica/instrumentos.tsx
- `Testes` --references--> `Toque`  [INFERRED]
  CLAUDE.md → e2e/apoio.ts
- `6. graphify na prática` --references--> `CenaOptica`  [INFERRED]
  docs/metodo-e-pesquisa.md → src/experimentos/optica/cena.ts
- `1. Modelo físico — `modelo.ts`` --references--> `Simulacao`  [INFERRED]
  docs/novo-experimento.md → src/nucleo/dinamica.ts
- `2. Definição — `definicao.ts`` --references--> `DefExperimento`  [INFERRED]
  docs/novo-experimento.md → src/nucleo/experimento.ts

## Import Cycles
- None detected.

## Communities (25 total, 4 thin omitted)

### Community 0 - "Sessao"
Cohesion: 0.05
Nodes (56): Regras de arquitetura, Ao mudar a cena, os gráficos ou o painel, 8. Armadilhas e soluções, 5. Vista — `Vista.tsx` e `cena.ts`, args, bruto, est, json (+48 more)

### Community 1 - "optica/cena.ts"
Cohesion: 0.06
Nodes (32): Leque, pupilaDeU(), Solucao, tracarLeque(), Alca, Arraste, CenaOptica, IdAlca (+24 more)

### Community 2 - "instrumentos.tsx"
Cohesion: 0.13
Nodes (54): perfil(), Aberracao(), cacheFantasma, ControleJanela(), Instrumentos(), LegendaFantasma(), Mancha(), Perfil() (+46 more)

### Community 3 - "osciladores/definicao.ts"
Cohesion: 0.06
Nodes (46): @preact/signals, Arraste, corMassa, configDeValores(), ConfigOsc, criarSimulacao(), extrasPadrao, observaveis (+38 more)

### Community 4 - "analise.ts"
Cohesion: 0.06
Nodes (54): B, Config, impactoNoPlano(), larguraNoPlano(), Mancha, mancha(), MAXP, MedidasAnteparo (+46 more)

### Community 5 - "gerar_optica.py"
Cohesion: 0.09
Nodes (33): bissecao(), casos_de_teste(), dist_ponto_reta(), escalar(), exigir(), flecha(), impacto_por_flecha(), g() (+25 more)

### Community 6 - "package.json"
Cohesion: 0.06
Nodes (41): dependencies, @fontsource/barlow@5.3.0, @fontsource/barlow-semi-condensed@5.3.0, katex@0.19.1, preact@11.2.0, @preact/signals@2.11.4, description, devDependencies (+33 more)

### Community 7 - "publicar"
Cohesion: 0.06
Nodes (38): concurrency, cancel-in-progress, group, jobs, navegador, publicar, verificar, name (+30 more)

### Community 8 - "app.tsx"
Cohesion: 0.10
Nodes (35): RFC-4180, preact, acoes, App(), ativo, Barra(), convite, dizer() (+27 more)

### Community 9 - "optica.spec.ts"
Cohesion: 0.07
Nodes (25): abrir(), alca(), arrastar(), caixaCena(), extras(), mundoParaPagina(), Ponto, tocar() (+17 more)

### Community 11 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, isolatedModules, jsx, jsxImportSource, lib, module, moduleResolution, noEmit (+10 more)

### Community 12 - "Dados de referência independentes"
Cohesion: 0.33
Nodes (5): Como regenerar, Dados de referência independentes, Detalhes comuns, Osciladores (`gerar_osciladores.py`), Óptica (`gerar_optica.py`)

### Community 13 - "Como acrescentar um experimento"
Cohesion: 0.29
Nodes (6): 1. Modelo físico — `modelo.ts`, 2. Definição — `definicao.ts`, 3. Registrar, 4. Testes científicos — `tests/novo.test.ts`, 7. Antes de dar por pronto, Como acrescentar um experimento

### Community 15 - "Método, ferramentas e achados"
Cohesion: 0.22
Nodes (9): 10. Próximos passos sugeridos, 1. Estado de entrega, 2. Ambiente em que foi feito, 3. Ferramentas e para que serviram, 4. Skills, 5. Método, 6. graphify na prática, 9. Como retomar numa sessão nova (+1 more)

### Community 16 - "Estúdio de simulações: instruções para agentes"
Cohesion: 0.22
Nodes (8): Ambiente (Claude Code na nuvem), Antes de abrir arquivos, Comandos, Convenções físicas, Estúdio de simulações: instruções para agentes, Publicar, Revisão visual (obrigatória depois de mudar a cena), Testes

### Community 17 - "Estúdio de simulações"
Cohesion: 0.29
Nodes (7): Estúdio de simulações, Experimentos, Mapa do código (graphify), Medir sem abrir o renderizador, Organização, Publicar, Rodar

### Community 18 - "O que foi verificado"
Cohesion: 0.33
Nodes (6): Bancada de óptica (`tests/optica.test.ts`), Estado e reprodução (`tests/nucleo.test.ts`, e2e), Navegador (`e2e/`, 84 testes em 3 projetos), O que foi emulação, e o que não foi testado, O que foi verificado, Osciladores acoplados (`tests/osciladores.test.ts`)

### Community 19 - "Trabalhar no Estúdio de simulações"
Cohesion: 0.40
Nodes (4): Antes de entregar, Ao criar um experimento, Ao mudar a física de um experimento, Trabalhar no Estúdio de simulações

### Community 21 - "Desempenho medido"
Cohesion: 0.50
Nodes (4): Ambiente, Bancada de óptica, Desempenho medido, Osciladores acoplados

### Community 22 - "7. Achados"
Cohesion: 0.50
Nodes (4): 7. Achados, Numérica, Renderização e interação, Óptica

### Community 23 - "optica/Vista.tsx"
Cohesion: 0.11
Nodes (33): 6. Explicação, Amostra(), Contexto(), Explicacao(), v3(), INSTRUMENTOS, cruzamentoEsferaAnalitico(), cabecalho() (+25 more)

## Knowledge Gaps
- **1 isolated node(s):** `RFC-4180`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 231 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Sessao` connect `Sessao` to `optica/cena.ts`, `instrumentos.tsx`, `osciladores/definicao.ts`, `app.tsx`, `optica/Vista.tsx`?**
  _High betweenness centrality (0.092) - this node is a cross-community bridge._
- **What connects `RFC-4180` to the rest of the system?**
  _1 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Sessao` be split into smaller, more focused modules?**
  _Cohesion score 0.051600573339703776 - nodes in this community are weakly interconnected._
- **Why does `CenaOptica` connect `optica/cena.ts` to `optica/Vista.tsx`, `Método, ferramentas e achados`?**
  _High betweenness centrality (0.057) - this node is a cross-community bridge._
- **Should `optica/cena.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05721003134796238 - nodes in this community are weakly interconnected._
- **Why does `preact` connect `app.tsx` to `instrumentos.tsx`, `osciladores/definicao.ts`, `package.json`, `optica/Vista.tsx`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **Should `instrumentos.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.13490623109497882 - nodes in this community are weakly interconnected._