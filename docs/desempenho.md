# Desempenho medido

Gerado por `node scripts/desempenho.mjs` em 2026-11-10.

## Ambiente

- Navegador: Chromium 153.0.8010.12 sem interface, emulando viewport, densidade de pixels e toque de tablet.
- GPU informada pelo WebGL: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver).
- Máquina: Intel(R) Xeon(R) Processor @ 2.10GHz — 4 núcleos lógicos, 16 GB de RAM.
- **Não é um iPad nem o Safari.** Com GPU por software (SwiftShader), o custo da camada de luz aqui é um limite pessimista; os tempos de solução (CPU) são representativos de um computador comum.

## Bancada de óptica

Solução = `resolver` + mancha 3D, sem desenho. Quadro = tempo no fio principal para montar fundo + camada de luz + vetor (JavaScript e chamadas de desenho); o custo da GPU aparece nos quadros por segundo.
Durante o arrasto a camada de luz usa menos raios e resolução 1×; em repouso é refeita em qualidade total. As medidas (leque de medida, mancha) são as mesmas nos dois casos.

| Cena | Viewport | Solução (ms) média / p95 | Quadro em arrasto (ms) média / p95 | Quadros/s em arrasto | Raios de luz (arrasto) | Quadro em repouso (ms) | Raios de luz (repouso) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Óptica, cena típica (abertura) | 1180×820 @2× | 1,73 / 2,30 | 1,03 / 1,90 | 26 | 158 | 0,98 | 449 |
| Óptica, cena exigente (a = 372 mm, 151 raios desenhados, 20 001 raios de medida, mancha de 20 000 raios, cáustica) | 1180×820 @2× | 16,27 / 19,50 | 6,31 / 9,20 | 13 | 158 | 4,84 | 449 |
| Óptica, zoom profundo no foco (2×10⁶ px/mm) | 1180×820 @2× | 2,10 / 2,60 | 2,94 / 5,80 | 15 | 975 | 8,49 | 1804 |

## Osciladores acoplados

- Integrador Verlet, sem desenho: 5,7 milhões de passos por segundo.
- Reprodução a 4× (Δt = 4 ms, 1000 passos por segundo de tempo real), cena + gráfico de posições: quadro de 0,22 ms em média (p95 0,40 ms), 60 quadros por segundo.
