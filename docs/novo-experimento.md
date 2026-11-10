# Como acrescentar um experimento

Um experimento tem duas metades que não se conhecem:

- a **definição** (pura, sem DOM): parâmetros, predefinições, observáveis e a função que resolve o modelo. É o que os testes, o terminal (`npm run medir`) e a sessão usam;
- a **vista**: cena, painéis e gráficos. Lê a solução e escreve parâmetros; nunca calcula física.

Os exemplos abaixo são do código entregue: `src/experimentos/optica` (estático) e `src/experimentos/osciladores` (dinâmico).

## 1. Modelo físico — `modelo.ts`

Funções puras, com as convenções escritas no topo do arquivo (unidades, eixos, sinais). Nada de DOM, nada de arredondar para exibir.

```ts
// src/experimentos/osciladores/modelo.ts
export function sistema(p: ParamOsc): SistemaDinamico {
  return {
    dim: 2,
    aceleracao(q, _v, _t, out) {
      out[0] = (-p.k1 * q[0] - p.kc * (q[0] - q[1])) / p.m1;
      out[1] = (-p.k2 * q[1] - p.kc * (q[1] - q[0])) / p.m2;
    },
    energia(q, v) { return energia(p, q[0], q[1], v[0], v[1]).total; },
  };
}
```

Um experimento estático devolve a solução direto dos parâmetros (óptica: `resolver(cfg)` em `analise.ts`). Um dinâmico descreve `q'' = a(q, v, t)` e usa `Simulacao` de `src/nucleo/dinamica.ts`, que cuida de passo fixo, histórico e reprodutibilidade (`t = n·Δt`, nunca soma acumulada).

## 2. Definição — `definicao.ts`

Cada parâmetro declara unidade, domínio e **classe**. A classe é o que separa, na interface e nos arquivos exportados, o que muda a física do que só muda o desenho:

| classe | significado |
| --- | --- |
| `fisico` | altera o sistema e, portanto, as medidas |
| `instrumento` | posiciona um instrumento de medida |
| `numerico` | escolhas do método (passo, integrador, amostragem) |
| `visual` | só o desenho; nenhuma medida depende dele |

```ts
// src/experimentos/optica/definicao.ts
{
  tipo: 'numero', id: 'a', rotulo: 'Abertura (semidiâmetro)', simbolo: 'a', unidade: 'mm',
  min: (v) => (v.R as number) / 1000, max: aMax,   // domínio pode depender de outros parâmetros
  passo: 0.5, padrao: 200, casas: 1, classe: 'fisico', grupo: 'Espelho',
},
{ tipo: 'numero', id: 'nRaios', rotulo: 'Raios desenhados', unidade: '', min: 3, max: 151, passo: 2,
  padrao: 21, inteiro: true, classe: 'visual', grupo: 'Desenho' },
```

Parâmetros cujo domínio depende de outros vêm **depois** deles na lista. `extrasPadrao` guarda o que precisa viajar no link sem ser parâmetro (raio selecionado, instante, aba aberta).

Um **observável** tem símbolo, unidade e definição operacional; `null` significa "indefinido neste estado":

```ts
{ id: 'W', rotulo: 'Largura total no anteparo', simbolo: 'W', unidade: 'mm',
  definicao: 'W = y_máx − y_mín dos raios do leque meridional de medida que atingem o anteparo.',
  calcular: (s) => nulo(s.anteparo.W) },
```

Uma **predefinição** prepara uma investigação e deixa a descoberta para quem usa (o `convite` pergunta, não responde). A primeira da lista é a cena de abertura.

Por fim, o objeto `DefExperimento`:

```ts
export const osciladores: DefExperimento<SolucaoOsc> = {
  id: 'osciladores', versao: 1, titulo: 'Osciladores acoplados', resumo: '…',
  parametros, extrasPadrao, predefinicoes, observaveis, resolver,
};
```

Se um dia um parâmetro mudar de nome ou de unidade, aumente `versao` e escreva `migrar(versaoAntiga, bruto)`: links e arquivos antigos continuam abrindo.

## 3. Registrar

```ts
// src/experimentos/definicoes.ts — testes, terminal e aplicação descobrem o experimento aqui
export const definicoes = { [optica.id]: optica, [osciladores.id]: osciladores, [novo.id]: novo };
export const ordem = [optica.id, osciladores.id, novo.id];

// src/experimentos/registro.ts — a vista é carregada sob demanda
export const vistas = { optica: () => import('./optica/Vista'), /* … */ novo: () => import('./novo/Vista') };
```

Um experimento ainda incompleto simplesmente não entra em `ordem`: ele não aparece no produto.

Neste ponto já funcionam, sem interface: `npm run medir -- novo`, link e arquivo de estado, desfazer, A/B.

## 4. Testes científicos — `tests/novo.test.ts`

Regra da casa: **o valor esperado não vem da função de produção.** Use, nesta ordem de preferência, (a) uma referência independente gerada fora do projeto (veja `tests/referencia/`), (b) um resultado analítico escrito no próprio teste, (c) um invariante físico (conservação, simetria). Toda tolerância vem com unidade e justificativa no comentário.

```ts
it('modo em fase oscila em √(k/m) e modo em oposição em √((k+2kc)/m)', () => {
  // Verlet desloca a frequência em +(ωΔt)²/24 (≈ 2e-6 aqui); tolerância 5e-6 cobre isso e a interpolação
  expect(Math.abs(omegaMedida(a, 0) / wFase - 1)).toBeLessThan(5e-6);
});
```

## 5. Vista — `Vista.tsx` e `cena.ts`

A vista recebe `{ sessao, acoes, convite }` (`PropsVista`). O painel pode ser montado só com `Param`, que desenha qualquer parâmetro declarado (campo com unidade, domínio, slider, validação):

```tsx
<Secao titulo="Massas e molas" classe="muda a física">
  <Param sessao={sessao} id="m1" />
  <Param sessao={sessao} id="k1" />
</Secao>
```

Na cena:

- leia `sessao.solucao.value` e desenhe; para mudar algo, `sessao.definir({ id: valor })`;
- um arrasto é **uma** entrada de desfazer: `sessao.inicioGesto()` no início, `sessao.fimGesto()` no fim;
- cenas 2D com zoom usam `Vista2D` e `recortar` (`src/nucleo/vista2d.ts`): tudo é recortado em precisão dupla antes de ir ao canvas, o que mantém a geometria exata em zoom profundo;
- se precisar baratear o quadro durante a interação, reduza o desenho, nunca a solução;
- registre `acoes.value = { exportarPNG, dados }` para a imagem e os CSV aparecerem no menu Compartilhar. `csv()` de `src/ui/exportar.ts` grava cabeçalho com nome e unidade de cada coluna.

Experimentos dinâmicos: veja `osciladores/motor.ts`. O motor mantém uma `Simulacao` e um cursor; cena e gráficos leem o mesmo histórico no mesmo passo. Defina por escrito o que cada ação faz com as condições iniciais (o cabeçalho de `motor.ts` é o modelo).

## 6. Explicação

`explicacao.tsx`: um bloco de contexto que muda com a seleção e avalia as equações com os valores atuais (`Tex`, `texNum`), seguido de modelo e hipóteses, tabela de símbolos e convenção de sinais, e gestos. Defina cada símbolo antes de usar e mantenha o mesmo sinal na cena, nos campos, nos gráficos e nas equações.

## 7. Antes de dar por pronto

```sh
npm test && npm run test:e2e   # ciência + navegador
node scripts/captura.mjs       # telas em tablet (paisagem e retrato) para revisão visual
npm run grafo                  # atualiza o mapa do código
```

Olhe as telas. Casos que costumam quebrar: parâmetros nos extremos do domínio, rótulos sobrepostos, painel aberto em tela pequena, rotação do tablet, estado aberto por link em sessão nova.
