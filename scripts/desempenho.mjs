/**
 * Mede o desempenho numa cena típica e numa exigente e grava docs/desempenho.md.
 *
 *   npx vite build && node scripts/desempenho.mjs
 *
 * O que é medido (no navegador, sobre o build de produção):
 *  - solução: tempo de `resolver` (traçado do leque de medida + estatísticas), sem desenho;
 *  - quadro: tempo de desenho de um quadro completo (fundo + luz + vetor) durante um
 *    arrasto roteirizado da abertura, e quadros por segundo observados;
 *  - osciladores: passos de integração por segundo e tempo de quadro em reprodução.
 * O ambiente (navegador, GPU informada, viewport) é registrado junto com os números.
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';

const porta = 4179;
const servidor = spawn('npx', ['vite', 'preview', '--port', String(porta), '--host', '127.0.0.1', '--strictPort'], { stdio: 'ignore' });
const base = `http://127.0.0.1:${porta}/`;
await new Promise((ok) => setTimeout(ok, 2500));

const p95 = (v) => [...v].sort((a, b) => a - b)[Math.min(v.length - 1, Math.floor(0.95 * v.length))];
const media = (v) => v.reduce((a, b) => a + b, 0) / v.length;
const f = (x, c = 2) => x.toFixed(c).replace('.', ',');

const browser = await chromium.launch();
const linhas = [];
let ambiente = null;

async function medirOptica(nome, hash, viewport, dsf) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dsf, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto(base + hash);
  await page.waitForFunction(() => !!window.__estudio?.cena);
  await page.waitForTimeout(3000); // fim do pulso inicial
  if (!ambiente) {
    ambiente = await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      const ext = gl?.getExtension('WEBGL_debug_renderer_info');
      return { ua: navigator.userAgent, gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'desconhecida', nucleos: navigator.hardwareConcurrency };
    });
  }
  // 1) solução pura (sem desenho)
  const solucao = await page.evaluate(() => {
    const { sessao } = window.__estudio;
    const v = sessao.valores.value, x = sessao.extras.value;
    const t = [];
    for (let i = 0; i < 60; i++) {
      const t0 = performance.now();
      const s = sessao.def.resolver({ ...v, a: v.a * (1 - i * 1e-4) }, x);
      s.mancha();
      t.push(performance.now() - t0);
    }
    return t.slice(10);
  });
  // 2) arrasto roteirizado da abertura: cada passo muda a física e redesenha tudo
  const quadros = await page.evaluate(async () => {
    const { sessao, cena } = window.__estudio;
    const a0 = sessao.valores.value.a;
    const ms = [], dt = [];
    let ant = performance.now();
    sessao.inicioGesto();
    for (let i = 0; i < 90; i++) {
      sessao.definir({ a: a0 * (0.75 + 0.25 * Math.cos(i / 9)) });
      cena.interagindo = true; // como num arrasto real
      await new Promise((r) => requestAnimationFrame(r));
      const agora = performance.now();
      dt.push(agora - ant);
      ant = agora;
      ms.push(cena.ultimoQuadro.ms);
    }
    const raiosLuz = cena.ultimoQuadro.raiosLuz;
    sessao.definir({ a: a0 }); // volta à abertura da cena antes de medir o repouso
    sessao.fimGesto();
    return { ms: ms.slice(5), dt: dt.slice(5), raiosLuz };
  });
  // 3) quadro em repouso (qualidade total)
  const repouso = await page.evaluate(async () => {
    const { cena } = window.__estudio;
    cena.interagindo = false;
    const ms = [];
    for (let i = 0; i < 12; i++) {
      cena.chaveLuz = '';
      cena.pedir();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      ms.push(cena.ultimoQuadro.ms);
    }
    return { ms: ms.slice(2), raiosLuz: cena.ultimoQuadro.raiosLuz };
  });
  linhas.push(`| ${nome} | ${viewport.width}×${viewport.height} @${dsf}× | ${f(media(solucao))} / ${f(p95(solucao))} | ${f(media(quadros.ms))} / ${f(p95(quadros.ms))} | ${f(1000 / media(quadros.dt), 0)} | ${quadros.raiosLuz} | ${f(media(repouso.ms))} | ${repouso.raiosLuz} |`);
  await ctx.close();
}

await medirOptica('Óptica, cena típica (abertura)', '#/optica', { width: 1180, height: 820 }, 2);
await medirOptica('Óptica, cena exigente (a = 372 mm, 151 raios desenhados, 20 001 raios de medida, mancha de 20 000 raios, cáustica)',
  '#/optica?f=1&e=1&a=372&zs=150&H=120&nRaios=151&nMed=20001&nMancha=20000&caustica=1&x.prova=0.95&x.instr=mancha', { width: 1180, height: 820 }, 2);
await medirOptica('Óptica, zoom profundo no foco (2×10⁶ px/mm)', '#/optica?f=1&e=1&kappa=-1&a=150&x.prova=0.7&vista=200,0,2000000', { width: 1180, height: 820 }, 2);

// osciladores
const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
await page.goto(base + '#/osciladores');
await page.waitForFunction(() => !!window.__estudio?.motor);
const osc = await page.evaluate(async () => {
  const { motor, cena, sessao } = window.__estudio;
  // vazão do integrador (sem desenho)
  const t0 = performance.now();
  motor.irPara(200000, false);
  const vazao = 200000 / ((performance.now() - t0) / 1000);
  motor.reiniciar();
  sessao.definir({ vel: 4 });
  motor.tocar();
  const dt = [], ms = [];
  let ant = performance.now();
  for (let i = 0; i < 150; i++) {
    await new Promise((r) => requestAnimationFrame(r));
    const agora = performance.now();
    dt.push(agora - ant);
    ant = agora;
    ms.push(cena.ultimoQuadroMs);
  }
  motor.pausar();
  return { vazao, dt: dt.slice(10), ms: ms.slice(10), t: motor.t };
});
await ctx.close();
await browser.close();
servidor.kill();

const md = `# Desempenho medido

Gerado por \`node scripts/desempenho.mjs\` em ${new Date().toISOString().slice(0, 10)}.

## Ambiente

- Navegador: ${ambiente.ua.replace(/^.*(HeadlessChrome|Chrome)\/([\d.]+).*$/, 'Chromium $2')} sem interface, emulando viewport, densidade de pixels e toque de tablet.
- GPU informada pelo WebGL: ${ambiente.gpu}.
- Máquina: ${os.cpus()[0]?.model ?? 'CPU'} — ${ambiente.nucleos} núcleos lógicos, ${f(os.totalmem() / 2 ** 30, 0)} GB de RAM.
- **Não é um iPad nem o Safari.** Com GPU por software (SwiftShader), o custo da camada de luz aqui é um limite pessimista; os tempos de solução (CPU) são representativos de um computador comum.

## Bancada de óptica

Solução = \`resolver\` + mancha 3D, sem desenho. Quadro = tempo no fio principal para montar fundo + camada de luz + vetor (JavaScript e chamadas de desenho); o custo da GPU aparece nos quadros por segundo.
Durante o arrasto a camada de luz usa menos raios e resolução 1×; em repouso é refeita em qualidade total. As medidas (leque de medida, mancha) são as mesmas nos dois casos.

| Cena | Viewport | Solução (ms) média / p95 | Quadro em arrasto (ms) média / p95 | Quadros/s em arrasto | Raios de luz (arrasto) | Quadro em repouso (ms) | Raios de luz (repouso) |
| --- | --- | --- | --- | --- | --- | --- | --- |
${linhas.join('\n')}

## Osciladores acoplados

- Integrador Verlet, sem desenho: ${f(osc.vazao / 1e6, 1)} milhões de passos por segundo.
- Reprodução a 4× (Δt = 4 ms, 1000 passos por segundo de tempo real), cena + gráfico de posições: quadro de ${f(media(osc.ms))} ms em média (p95 ${f(p95(osc.ms))} ms), ${f(1000 / media(osc.dt), 0)} quadros por segundo.
`;
mkdirSync('docs', { recursive: true });
writeFileSync('docs/desempenho.md', md);
console.log(md);
