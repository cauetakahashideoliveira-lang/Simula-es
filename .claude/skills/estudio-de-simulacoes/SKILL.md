---
name: estudio-de-simulacoes
description: Use ao criar, alterar ou revisar um experimento do Estúdio de simulações (bancada de óptica, osciladores acoplados ou um novo), ao mexer na física, na cena ou nos gráficos, ou ao verificar, medir desempenho e publicar o estúdio.
---

# Trabalhar no Estúdio de simulações

Leia `CLAUDE.md` (regras e convenções) e `graphify-out/GRAPH_REPORT.md` (mapa do código) antes de abrir arquivos grandes. Use `graphify query`, `explain` e `affected` para localizar código.

## Ao mudar a física de um experimento

1. Edite só `modelo.ts`, `analise.ts` ou `definicao.ts`: sem DOM, sem formatação para exibir.
2. Confira a grandeza no terminal antes de olhar a tela: `npm run medir -- <experimento> chave=valor x.extra=valor`.
3. Escreva o teste antes de confiar no número. O esperado vem de uma referência independente (`tests/referencia/`), de uma fórmula escrita no teste ou de um invariante, nunca da função de produção. Tolerância com unidade e justificativa.
4. Para um caso que não tem fórmula fechada, gere a referência fora do projeto: um subagente em segundo plano, com uma especificação escrita (equações, convenções de sinal, casos de borda), proibido de ler o código TypeScript, produzindo JSON com mpmath e verificações cruzadas próprias. Modelo: `tests/referencia/LEIAME.md` e `docs/metodo-e-pesquisa.md` §5.
5. `npm test`.

## Ao criar um experimento

Siga `docs/novo-experimento.md`. Ordem: modelo → definição (parâmetros com unidade, domínio e classe; observáveis; predefinições que perguntam sem responder) → testes científicos → registro em `definicoes.ts` e `registro.ts` → vista. Enquanto estiver incompleto, deixe-o fora de `ordem`.

## Ao mudar a cena, os gráficos ou o painel

1. A cena lê `sessao.solucao.value` e escreve com `sessao.definir`; arrasto entre `inicioGesto()` e `fimGesto()`.
2. Durante a interação, reduza o custo do desenho e nunca o da solução.
3. Revisão visual: com `npm run dev` rodando, `node scripts/captura.mjs http://127.0.0.1:5173/ <pasta> '<hash do estado>'` gera tablet paisagem, tablet retrato e desktop. Recorte e amplie as regiões densas. Confira também 390 px de largura.
4. Teste de navegador para cada gesto novo, com toque real (`Toque` em `e2e/apoio.ts`) nos projetos de tablet e mouse no desktop. Use `window.__estudio` para ler o estado.
5. `npm run test:e2e`.

## Antes de entregar

```sh
npm run typecheck && npm test && npm run test:e2e
node scripts/desempenho.mjs      # se a mudança pode afetar o tempo de quadro
npm run grafo                    # versionar graphify-out/GRAPH_REPORT.md
```

Commit e push no ramo da sessão. A CI publica a partir do ramo padrão.
