# Dados de referência independentes

Esta pasta contém valores de referência ("fixtures") de alta precisão usados para testar
as simulações de física do projeto. Eles foram calculados **sem consultar o código
TypeScript**: os scripts partem apenas das equações da especificação e usam Python 3 +
[`mpmath`](https://mpmath.org) com 60 dígitos. Os resultados são gravados em JSON com
17 algarismos significativos (precisão de um `double`).

| Arquivo | Conteúdo |
| --- | --- |
| `gerar_optica.py` → `optica.json` | 90 raios refletidos num espelho cônico de revolução (mm, graus) |
| `gerar_osciladores.py` → `osciladores.json` | 14 casos de dois osciladores acoplados, 9 instantes cada (SI) |

## Como regenerar

```sh
pip install mpmath            # única dependência
python3 tests/referencia/gerar_optica.py
python3 tests/referencia/gerar_osciladores.py
```

Cada script roda em menos de 1 s, é determinístico e **só grava o JSON depois que todas
as verificações cruzadas (asserts) passam**.

## Óptica (`gerar_optica.py`)

Espelho: folha do vértice de `x² + y² − 2Rz + (1+κ)z² = 0`, abertura `ρ ≤ a`, `+z` para a
frente. Feixe `d = (0, −sen α, −cos α)`; o raio `(u, v)` passa por
`p0 = u·(0, cos α, −sen α) + v·(1, 0, 0)`. A cada encontro com o lado refletor aplica-se
`r = d − 2(d·n)n`, repetindo até o raio deixar o espelho.

Método (dois localizadores de interseção diferentes, que precisam coincidir a 1e-40):

1. **Flecha + bisseção** — `g(t) = z(t) − flecha(ρ(t))` é côncava dentro do cilindro da
   abertura; os sinais nas pontas decidem acerto/erro e a raiz sai por bisseção.
2. **Quádrica em forma fechada** — raízes de `A·t² + B·t + C = 0`, filtradas por folha,
   abertura e lado.

Verificações afirmadas em todos os casos aplicáveis:

- invariante de obliquidade `x·k_y − y·k_x` conservado em cada reflexão;
- princípio de Fermat (caminho estacionário, com derivadas numéricas da superfície —
  não usa a fórmula da normal);
- no eixo: `tan θ_i = s'(h)` e cruzamento em `s(h) + h(1 − s'²)/(2s')`;
- esfera no eixo: `z_cross = R − R/(2 cos θ)`, `sen θ = h/R`, e sequência angular fechada
  `φ_k = (2k−1)θ − (k−1)π` para as reflexões múltiplas;
- paraboloide no eixo: o raio passa exatamente pelo foco `(0, 0, R/2)`;
- folga mínima de 1e-3 mm em relação à borda da abertura, incidência rasante e plano de
  detecção, para que acerto/erro e `null` sejam inequívocos.

Convenções do JSON: em `"miss"`, `bounces = 0` e as demais saídas são `null`; `z_cross`
só existe para `v = 0` (raio final cruzando `y = 0` com `t > 0`); `screen` é o primeiro
cruzamento de um trecho **refletido** com `z = z_s`.

Observação: na esfera com `a = 380` os raios `u = 300` e `u = 340` também refletem mais
de uma vez (2 e 3 reflexões): depois de cruzar o eixo, o raio reencontra o lado oposto
do espelho profundo. Isso decorre diretamente da regra de traçado.

## Osciladores (`gerar_osciladores.py`)

`m1·x1'' = −k1·x1 − kc·(x1 − x2)`, `m2·x2'' = −k2·x2 − kc·(x2 − x1)`.

Método: autovalores de `K a = ω² M a` em forma fechada (2×2), modos `(1, r)` com
`r = x2/x1` e superposição modal a partir das condições iniciais (com `kc = 0`, dois
osciladores simples e `r = null`).

Verificações afirmadas: resíduo de `(K − ω²M)a` e M-ortogonalidade; `ω²` conferido com
`mp.eigsy`; condições iniciais em `t = 0`; substituição na EDO com derivação numérica
(`mp.diff`); energia constante em todas as amostras; e um caminho totalmente separado,
`estado(t) = exp(A·t)·estado(0)` com a exponencial de matriz 4×4 (`mp.expm`), que não usa
modos nem autovalores.

## Detalhes comuns

- As entradas (e os instantes `t`) são interpretadas **exatamente como os doubles
  IEEE-754 gravados no JSON** (ex.: `0.1` é o double mais próximo de 1/10), pois é esse o
  valor que o código testado recebe.
- Valores com módulo menor que 1e-30 são gravados como `0` (o valor exato é zero); por
  isso, compare com tolerância absoluta além da relativa.
