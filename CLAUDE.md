# Estúdio de simulações: instruções para agentes

Interface, documentação, comentários e commits em **português do Brasil**.

## Antes de abrir arquivos

1. Leia `graphify-out/GRAPH_REPORT.md` (mapa do código: nós centrais, comunidades, ligações). Custa ~2 mil tokens e evita ler `cena.ts` (1500 linhas) para achar uma função.
2. Para uma pergunta específica: `graphify query "onde a largura no anteparo é calculada?"`, `graphify explain "Sessao"`, `graphify affected "tracarBruto"`.
3. Depois de mudar código: `npm run grafo` (refaz o grafo sem LLM) e versione o `GRAPH_REPORT.md` novo.
4. Contexto completo (ambiente, ferramentas, skills, achados, armadilhas): `docs/metodo-e-pesquisa.md`.

Container novo sem `graphify` ou sem `node_modules`: `bash scripts/ambiente.sh`.

## Comandos

```sh
npm run dev                        # http://localhost:5173
npm test                           # 149 testes científicos e do núcleo (Vitest, < 1 s)
npm run test:e2e                   # build + 84 testes de navegador (Playwright, ~1,5 min)
npm run build                      # tipos + build em dist/
npm run medir -- optica a=120 x.prova=1          # grandezas sem renderizador
node scripts/captura.mjs http://127.0.0.1:5173/ <pasta> '#/optica?f=1&e=1&a=150'
node scripts/desempenho.mjs        # reescreve docs/desempenho.md
node scripts/artefato.mjs <pasta>  # build → página + arquivos para Artifact do claude.ai
```

## Regras de arquitetura

- **Física sem DOM.** `modelo.ts`, `analise.ts` e `definicao.ts` de cada experimento não importam nada de `ui/` nem tocam no navegador. Tudo que é medido sai daí e pode ser lido por `npm run medir`.
- **A cena só lê a solução e escreve parâmetros** (`sessao.definir`). Um arrasto é uma entrada de desfazer: `sessao.inicioGesto()` / `sessao.fimGesto()`.
- **Para ficar fluido, barateie o desenho, nunca a solução.** O leque de medida e a mancha não mudam durante a interação; só a camada de luz.
- **Recorte em precisão dupla antes de desenhar** (`recortar` em `nucleo/vista2d.ts`): o canvas trabalha em float32 e quebra em zoom profundo.
- **Classe de cada parâmetro:** `fisico`, `instrumento`, `numerico`, `visual`. A interface e os CSV dependem dela.
- **Estado versionado.** Link `#/<id>?f=1&e=<versao>&…`. Renomear ou mudar a unidade de um parâmetro exige `versao + 1` e `migrar()`.
- **Experimento dinâmico:** `t = n·Δt` (contagem inteira), histórico como fonte única para cena e gráficos (`osciladores/motor.ts`).
- Experimento incompleto fica fora de `ordem` em `experimentos/definicoes.ts`: não aparece no produto.
- Guia passo a passo: `docs/novo-experimento.md`.

## Convenções físicas

- **Óptica:** mm e graus na interface, radianos no modelo. `z` sobre o eixo, origem no vértice, **positivo na frente do espelho**; na cena `z` cresce para a esquerda. `y` positivo para cima; `α > 0` = luz vindo de cima. `Δz = z× − f` (negativo: cruza antes de F). Sistema 3D de revolução; a cena é a seção meridional.
- **Osciladores:** SI no modelo; campos em cm, cm/s e ms. `x` positivo para a direita, medido do equilíbrio de cada massa.

## Testes

- **O valor esperado nunca vem da função de produção.** Use referência independente (`tests/referencia/`, mpmath), resultado analítico escrito no teste ou invariante físico.
- Toda tolerância tem unidade e justificativa no comentário (ex.: "Verlet desloca a frequência em (ωΔt)²/24").
- Regenerar referências: `pip install mpmath && python3 tests/referencia/gerar_optica.py` (idem `gerar_osciladores.py`).
- Navegador: `window.__estudio` expõe `{ cena, sessao, motor }`. Toque de verdade (um ou dois dedos) só via CDP: use `Toque` de `e2e/apoio.ts`; `page.tap` não arrasta nem faz pinça.

## Revisão visual (obrigatória depois de mudar a cena)

Capture 1180×820 e 820×1180 com `deviceScaleFactor: 2` e toque, mais uma largura de telefone (390). Recorte e amplie regiões densas (foco, rótulos de ângulo) antes de julgar. Casos que costumam quebrar: abertura extrema (`a=372`), feixe estreito (`a=0.4`), anteparo no foco, zoom `vista=200,0,2000000`, rotação do tablet, painel em tela pequena.

## Ambiente (Claude Code na nuvem)

- Chromium e Playwright 1.63 já instalados em `/opt/pw-browsers`. **Não rode `playwright install`.** O projeto fixa `@playwright/test` 1.63.0 para usar esse navegador; a CI instala o seu.
- A GPU é emulada (SwiftShader): tempos de quadro medidos aqui são pessimistas. Mensagens `GL Driver Message … GPU stall due to ReadPixels` no console são inofensivas.
- Não há iPad nem WebKit: verificações de Safari ficam como pendência declarada.
- O processo do agente pode reiniciar: arquivos ficam, servidores (vite) morrem. Faça commit e push a cada marco.
- GitHub: `gh` só para busca; Actions, logs e PRs pelo servidor MCP do GitHub. Desenvolva no ramo designado da sessão.
- Testes de navegador rodam em paralelo: espere condições (`expect.poll`), nunca tempos fixos.
- O service worker (`public/sw.js`) só registra fora do Artifact e fora de testes; para testá-lo, abra com `?sw=1`.
- Python do sistema recusa `pip install` global: use venv (o `scripts/ambiente.sh` já faz isso para o graphify).

## Publicar

A CI (`.github/workflows/ci.yml`) testa, faz o build e publica no GitHub Pages a partir do ramo padrão, e sempre atualiza o ramo `gh-pages`. O site do Pages precisa ser ativado **uma vez, à mão**, em Settings → Pages (o token do Actions não tem permissão para criá-lo). Endereço público configurado em `src/config.ts`.
