# O que foi verificado

Três camadas, da mais forte para a mais fraca: (1) testes científicos sem interface, com valores esperados que não saem da função de produção; (2) testes de navegador com gestos reais; (3) revisão visual de capturas de tela. Os números abaixo foram medidos neste repositório em 10/11/2026.

## Bancada de óptica (`tests/optica.test.ts`)

| Verificação | Referência (independente da produção) | Resultado medido | Tolerância no teste |
| --- | --- | --- | --- |
| Lei da reflexão, forma vetorial com a normal local: θᵢ = θᵣ, raios coplanares, \|r̂\| = 1 | normal obtida por diferenças finitas da equação implícita; 2000 raios 3D pseudoaleatórios em 5 cônicas | diferença máxima 1,6×10⁻¹⁴ ° nos casos de referência | 10⁻⁷ rad (limite da normal numérica) |
| Invariante de obliquidade x·k_y − y·k_x (simetria de revolução) | invariante físico | conservado | 10⁻¹¹ mm |
| Limite paraxial da esfera: z× → R/2, desvio → h²/(4R) | série exata escrita no teste | razão 1,000075 em h/R = 0,01 e 1,0076 em h/R = 0,1 (o termo seguinte é ¾(h/R)²) | (h/R)² |
| Coeficiente de 3ª ordem para cônica geral: (1+κ)h²/(4R) | teoria de aberrações | confirmado para κ = −2; −0,5; 0,3 | 5(h/R)² |
| Raio marginal, raios oblíquos 3D, reflexões múltiplas, cônicas e escalas variadas | **90 casos em mpmath (60 dígitos), escritos por outro agente sem ver o código**, com dois localizadores de interseção e checagem de Fermat (`tests/referencia/gerar_optica.py`) | posição: 7×10⁻¹⁷ R; direção: 2×10⁻¹⁵; ângulo: 7×10⁻¹⁵ °; impacto no anteparo: 6×10⁻¹⁶ R | 2×10⁻¹² R por reflexão |
| Parábola, raios paralelos ao eixo: todos em z = f | propriedade foco–diretriz; caminho óptico constante (Fermat) | \|z× − f\| ≤ 1,1×10⁻¹³ mm para h de 1 µm a 380 mm (f = 200 mm); mancha 3D com r_RMS = 3×10⁻¹⁴ mm, contra 7,05 mm da esfera na mesma abertura | ∝ ulp(R)/sen 2θ |
| Largura no foco paraxial: W → a³/R² | aberração transversal de 3ª ordem | razão 1,0036 em a/R = 0,04 | 3(a/R)² |
| Mancha 3D no foco paraxial: r_RMS → a³/(4R²) | 3ª ordem com pupila uniforme | dentro de 1 % | 1 % |
| Segunda reflexão na esfera | geometria do círculo: nova reflexão se \|3θ − π\| ≤ θ_a; raio marginal só reflete duas vezes se a/R ≥ sen 45° | limiares confirmados com ±0,5 mm | — |
| Bordas: abertura (±10⁻⁹ mm), raio sobre o eixo, anteparo atrás do vértice, feixe inclinado tocando a borda, R de 20 mm a 10 m | — | passam | — |

A revisão independente também corrigiu um erro meu: eu havia escrito que a segunda reflexão na esfera começa em θ = 60°; o limiar correto depende da abertura (linha acima).

## Osciladores acoplados (`tests/osciladores.test.ts`)

| Verificação | Referência | Resultado medido | Tolerância no teste |
| --- | --- | --- | --- |
| Frequências e formas dos modos, solução exata até t = 1000 s | **14 casos em mpmath**, com substituição na EDO e `expm` como segundo caminho (`tests/referencia/gerar_osciladores.py`) | ω: 5×10⁻¹⁴ relativo; x(t): < 10⁻¹⁰ m | idem |
| Caso simétrico: modo em fase em √(k/m), em oposição em √((k+2k_c)/m) | fórmulas escritas no teste; frequência medida por cruzamentos de zero na simulação | erro relativo +1,67×10⁻⁶ e +2,00×10⁻⁶, exatamente o desvio previsto para o Verlet, (ωΔt)²/24 | 5×10⁻⁶ |
| Acoplamento nulo: massa 2 em repouso exato, massa 1 em √(k₁/m₁) | — | x₂ = 0 em todos os passos, nos quatro integradores | igualdade exata |
| Ordem de convergência | Verlet 2, RK4 4, Euler 1 | 2,0; 4,0; 1,0 | ±0,1–0,2 |
| Energia em 1000 períodos (226 725 passos de 4 ms) | sistema conservativo | Verlet: \|ΔE/E₀\| ≤ 1,8×10⁻⁴, limitado e sem deriva secular. RK4: −1,2×10⁻⁶, monotônico. Euler simplético: ≤ 1,4×10⁻². Euler explícito: energia ×36 em 5000 passos | Verlet < (ωΔt)²/4 |
| Meio período de batimento: x₁ = 0 e resíduo de energia na massa 1 | expressão analítica derivada no teste | resíduo dentro de 2 % do previsto | 2 % |
| Histórico como fonte única; relógio físico independente da taxa de quadros | — | retomar de um passo reproduz o futuro bit a bit; 60 Hz, 144 Hz e quadros irregulares dão os mesmos passos (±1) | igualdade exata |

## Estado e reprodução (`tests/nucleo.test.ts`, e2e)

Link e arquivo JSON fazem a viagem de ida e volta devolvendo os **mesmos doubles**, e portanto as mesmas medidas, nos dois experimentos. Nos testes de navegador o link é aberto numa sessão nova (sem armazenamento compartilhado) e compara parâmetros, extras, medidas e enquadramento por igualdade exata; nos osciladores, o instante (`passos`) e o estado naquele instante.

## Navegador (`e2e/`, 75 testes em 3 projetos)

Gestos reais enviados pelo protocolo do Chromium (toque de um e dois dedos) e pelo mouse: arrastar a borda do espelho, o anteparo (pelo pegador e pela linha), o ponto de incidência; tocar num raio; pinça em torno do foco; trocar só a superfície preservando abertura, anteparo, feixe, enquadramento e escala do gráfico; estados A/B; campo numérico com vírgula, domínio e entrada inválida; zoom de 2×10⁶ px/mm; exportação de PNG, CSV e JSON; rotação do tablet; modo de compatibilidade sem WebGL de ponto flutuante; puxar uma massa; tocar, pausar, passo; voltar no tempo pelo gráfico.

## O que foi emulação, e o que não foi testado

- **Não houve teste em iPad nem em Safari/WebKit.** Tudo rodou em Chromium sem interface, emulando o viewport (1180×820 e 820×1180), a densidade de pixels (2×) e o toque de um tablet. O ambiente só oferece o Chromium. Diferenças possíveis no Safari: suporte ao alvo de ponto flutuante do WebGL2 (há caminho alternativo em Canvas 2D, testado), folha de compartilhamento para arquivos, comportamento de gestos do sistema.
- A GPU do ambiente é emulada por software (SwiftShader); os tempos de quadro em [desempenho.md](desempenho.md) são um limite pessimista para a camada de luz.
- A página publicada como Artifact no claude.ai foi testada localmente com um visualizador simulado (âncoras simples, capacidade de download); o visualizador real não é acessível daqui.
- O modelo óptico é geométrico: sem difração, refletância 1, anteparo que não obstrui o feixe incidente. A camada de luz é a densidade de raios da seção meridional (feixe plano); a irradiância 3D aparece só no instrumento Mancha.
