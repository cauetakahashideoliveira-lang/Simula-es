# Graph Report - Simula-es  (2026-11-10)

## Corpus Check
- 57 files · ~73,979 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 5 file(s) not represented in the graph (top: (none) 3, .webmanifest 1, .css 1)

## Summary
- 710 nodes · 1848 edges · 14 communities (13 shown, 1 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 60 edges (avg confidence: 0.87)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `bf9a0cfd`
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

## God Nodes (most connected - your core abstractions)
1. `Sessao` - 41 edges
2. `CenaOptica` - 39 edges
3. `fmtFixo()` - 27 edges
4. `Motor` - 22 edges
5. `CenaOsc` - 21 edges
6. `Simulacao` - 20 edges
7. `Perfil()` - 19 edges
8. `fmtSig()` - 18 edges
9. `Mancha()` - 17 edges
10. `Aberracao()` - 17 edges

## Surprising Connections (you probably didn't know these)
- `1. Modelo físico — `modelo.ts`` --references--> `Simulacao`  [INFERRED]
  docs/novo-experimento.md → src/nucleo/dinamica.ts
- `2. Definição — `definicao.ts`` --references--> `DefExperimento`  [INFERRED]
  docs/novo-experimento.md → src/nucleo/experimento.ts
- `5. Vista — `Vista.tsx` e `cena.ts`` --references--> `Simulacao`  [INFERRED]
  docs/novo-experimento.md → src/nucleo/dinamica.ts
- `5. Vista — `Vista.tsx` e `cena.ts`` --references--> `Vista2D`  [INFERRED]
  docs/novo-experimento.md → src/nucleo/vista2d.ts
- `5. Vista — `Vista.tsx` e `cena.ts`` --references--> `recortar()`  [INFERRED]
  docs/novo-experimento.md → src/nucleo/vista2d.ts

## Import Cycles
- None detected.

## Communities (14 total, 1 thin omitted)

### Community 0 - "Sessao"
Cohesion: 0.05
Nodes (53): args, bruto, est, json, medidas, resto, definicoes, ordem (+45 more)

### Community 1 - "optica/cena.ts"
Cohesion: 0.06
Nodes (29): Leque, pupilaDeU(), Solucao, Alca, Arraste, CenaOptica, IdAlca, OpcoesCena (+21 more)

### Community 2 - "instrumentos.tsx"
Cohesion: 0.13
Nodes (52): Aberracao(), ControleJanela(), Instrumentos(), Mancha(), Perfil(), PropsI, textoCurto(), unidadePara() (+44 more)

### Community 3 - "osciladores/definicao.ts"
Cohesion: 0.07
Nodes (41): configDeValores(), ConfigOsc, criarSimulacao(), extrasPadrao, observaveis, parametros, predefinicoes, resolver() (+33 more)

### Community 4 - "analise.ts"
Cohesion: 0.06
Nodes (53): B, Config, impactoNoPlano(), larguraNoPlano(), Mancha, mancha(), MAXP, MedidasAnteparo (+45 more)

### Community 5 - "gerar_optica.py"
Cohesion: 0.09
Nodes (33): bissecao(), casos_de_teste(), dist_ponto_reta(), escalar(), exigir(), flecha(), impacto_por_flecha(), g() (+25 more)

### Community 6 - "package.json"
Cohesion: 0.06
Nodes (42): dependencies, @fontsource/barlow@5.3.0, @fontsource/barlow-semi-condensed@5.3.0, katex@0.19.1, preact@11.2.0, @preact/signals@2.11.4, description, devDependencies (+34 more)

### Community 7 - "publicar"
Cohesion: 0.06
Nodes (38): concurrency, cancel-in-progress, group, jobs, navegador, publicar, verificar, name (+30 more)

### Community 8 - "app.tsx"
Cohesion: 0.05
Nodes (70): RFC-4180, 5. Vista — `Vista.tsx` e `cena.ts`, 6. Explicação, preact, acoes, App(), ativo, Barra() (+62 more)

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
Cohesion: 0.08
Nodes (23): Ambiente, Bancada de óptica, Desempenho medido, Osciladores acoplados, 1. Modelo físico — `modelo.ts`, 2. Definição — `definicao.ts`, 3. Registrar, 4. Testes científicos — `tests/novo.test.ts` (+15 more)

## Knowledge Gaps
- **1 isolated node(s):** `RFC-4180`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 206 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Sessao` connect `Sessao` to `app.tsx`, `optica/cena.ts`, `instrumentos.tsx`, `osciladores/definicao.ts`?**
  _High betweenness centrality (0.070) - this node is a cross-community bridge._
- **What connects `RFC-4180` to the rest of the system?**
  _1 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Sessao` be split into smaller, more focused modules?**
  _Cohesion score 0.054075235109717866 - nodes in this community are weakly interconnected._
- **Why does `Como acrescentar um experimento` connect `Como acrescentar um experimento` to `app.tsx`?**
  _High betweenness centrality (0.055) - this node is a cross-community bridge._
- **Should `optica/cena.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05910364145658263 - nodes in this community are weakly interconnected._
- **Why does `Simulacao` connect `osciladores/definicao.ts` to `app.tsx`, `Como acrescentar um experimento`?**
  _High betweenness centrality (0.042) - this node is a cross-community bridge._
- **Should `instrumentos.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.13208649912331968 - nodes in this community are weakly interconnected._