# Graph Report - Simula-es  (2026-11-10)

## Corpus Check
- 45 files · ~62,471 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 3 file(s) not represented in the graph (top: (none) 2, .css 1)

## Summary
- 623 nodes · 1535 edges · 13 communities (12 shown, 1 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 36 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `cc5ee60b`
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

## God Nodes (most connected - your core abstractions)
1. `Sessao` - 40 edges
2. `CenaOptica` - 39 edges
3. `fmtFixo()` - 20 edges
4. `Perfil()` - 19 edges
5. `CenaOsc` - 18 edges
6. `Motor` - 18 edges
7. `Simulacao` - 18 edges
8. `Mancha()` - 17 edges
9. `Aberracao()` - 17 edges
10. `compilerOptions` - 17 edges

## Surprising Connections (you probably didn't know these)
- `CasoRef` --references--> `Vec3`  [EXTRACTED]
  tests/optica.test.ts → src/experimentos/optica/modelo.ts
- `sim()` --calls--> `sistema()`  [EXTRACTED]
  tests/osciladores.test.ts → src/experimentos/osciladores/modelo.ts
- `sim()` --calls--> `Simulacao`  [EXTRACTED]
  tests/osciladores.test.ts → src/nucleo/dinamica.ts
- `sessaoDe()` --calls--> `Sessao`  [EXTRACTED]
  src/app.tsx → src/nucleo/sessao.ts
- `conjuntos()` --calls--> `perfil()`  [EXTRACTED]
  src/experimentos/optica/Vista.tsx → src/experimentos/optica/analise.ts

## Import Cycles
- None detected.

## Communities (13 total, 1 thin omitted)

### Community 0 - "Sessao"
Cohesion: 0.05
Nodes (52): args, bruto, est, json, medidas, resto, definicoes, ordem (+44 more)

### Community 1 - "optica/cena.ts"
Cohesion: 0.06
Nodes (31): Leque, Solucao, tracarLeque(), Alca, Arraste, caixaPartes(), CenaOptica, desenharPartes() (+23 more)

### Community 2 - "instrumentos.tsx"
Cohesion: 0.09
Nodes (64): perfil(), pupilaDeU(), Amostra(), Contexto(), Explicacao(), v3(), Aberracao(), ControleJanela() (+56 more)

### Community 3 - "osciladores/definicao.ts"
Cohesion: 0.07
Nodes (35): configDeValores(), ConfigOsc, criarSimulacao(), extrasPadrao, observaveis, osciladores, parametros, predefinicoes (+27 more)

### Community 4 - "analise.ts"
Cohesion: 0.06
Nodes (52): B, Config, impactoNoPlano(), larguraNoPlano(), Mancha, mancha(), MAXP, MedidasAnteparo (+44 more)

### Community 5 - "gerar_optica.py"
Cohesion: 0.09
Nodes (33): bissecao(), casos_de_teste(), dist_ponto_reta(), escalar(), exigir(), flecha(), impacto_por_flecha(), g() (+25 more)

### Community 6 - "package.json"
Cohesion: 0.06
Nodes (41): dependencies, @fontsource/barlow@5.3.0, @fontsource/barlow-semi-condensed@5.3.0, katex@0.19.1, preact@11.2.0, @preact/signals@2.11.4, description, devDependencies (+33 more)

### Community 7 - "publicar"
Cohesion: 0.05
Nodes (41): concurrency, cancel-in-progress, group, name, url, jobs, navegador, publicar (+33 more)

### Community 8 - "app.tsx"
Cohesion: 0.11
Nodes (27): RFC-4180, acoes, App(), ativo, Barra(), convite, Guardados(), inicial (+19 more)

### Community 9 - "optica.spec.ts"
Cohesion: 0.13
Nodes (15): abrir(), alca(), arrastar(), caixaCena(), extras(), mundoParaPagina(), Ponto, tocar() (+7 more)

### Community 11 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, isolatedModules, jsx, jsxImportSource, lib, module, moduleResolution, noEmit (+10 more)

### Community 12 - "Dados de referência independentes"
Cohesion: 0.33
Nodes (5): Como regenerar, Dados de referência independentes, Detalhes comuns, Osciladores (`gerar_osciladores.py`), Óptica (`gerar_optica.py`)

## Knowledge Gaps
- **1 isolated node(s):** `RFC-4180`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 181 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Sessao` connect `Sessao` to `app.tsx`, `optica/cena.ts`, `instrumentos.tsx`, `osciladores/definicao.ts`?**
  _High betweenness centrality (0.086) - this node is a cross-community bridge._
- **What connects `RFC-4180` to the rest of the system?**
  _1 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Sessao` be split into smaller, more focused modules?**
  _Cohesion score 0.05381400208986416 - nodes in this community are weakly interconnected._
- **Why does `@preact/signals` connect `package.json` to `Sessao`, `optica/cena.ts`, `instrumentos.tsx`, `osciladores/definicao.ts`, `app.tsx`?**
  _High betweenness centrality (0.055) - this node is a cross-community bridge._
- **Should `optica/cena.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.056134723336006415 - nodes in this community are weakly interconnected._
- **Why does `CenaOptica` connect `optica/cena.ts` to `instrumentos.tsx`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **Should `instrumentos.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.0884857460199926 - nodes in this community are weakly interconnected._