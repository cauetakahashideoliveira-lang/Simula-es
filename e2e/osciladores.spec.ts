import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { arrastar, valores, extras, vigiarErros } from './apoio';

async function abrirOsc(page: Page, hash = '#/osciladores') {
  await page.goto(`./${hash}`);
  await page.waitForFunction(() => !!(window as any).__estudio?.motor);
  await page.waitForTimeout(200);
}

/** estado do motor no cursor + o que a tela mostra */
const estado = (page: Page) =>
  page.evaluate(() => {
    const { motor } = (window as any).__estudio;
    const i = motor.cursor.value;
    const s = motor.sim;
    return {
      passo: i as number,
      passosSim: s.passos as number,
      t: i * s.dt,
      x1: s.qEm(i, 0) as number,
      x2: s.qEm(i, 1) as number,
      E: s.energiaEm(i) as number,
      E0: s.energiaEm(0) as number,
      rodando: motor.rodando.value as boolean,
      relogio: document.querySelector('[data-tempo]')?.textContent ?? '',
    };
  });

/** o mesmo instante recalculado do zero pela definição pura (sem interface) */
const doZero = (page: Page) =>
  page.evaluate(() => {
    const { sessao, motor } = (window as any).__estudio;
    const r = sessao.def.resolver(sessao.valores.value, { ...sessao.extras.value, passos: motor.cursor.value }).noInstante();
    return { t: r.t as number, x1: r.x1 as number, x2: r.x2 as number, E: r.E as number };
  });

async function centroMassa(page: Page, k: 0 | 1) {
  const b = (await page.locator('.cena').boundingBox())!;
  const m = await page.evaluate((k) => (window as any).__estudio.cena.posicoesMassas()[k], k);
  return { x: b.x + m.x, y: b.y + m.y };
}

const fmtT = (t: number) => t.toFixed(3).replace('.', ',');

test.describe('osciladores acoplados', () => {
  test('tocar, pausar e avançar um passo: relógio físico em passos inteiros', async ({ page }) => {
    const erros = vigiarErros(page);
    await abrirOsc(page);
    let e = await estado(page);
    expect(e).toMatchObject({ passo: 0, rodando: false, x1: 0.12, x2: 0 });
    await page.getByRole('button', { name: 'Tocar' }).click();
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: 'Pausar' }).click();
    e = await estado(page);
    expect(e.rodando).toBe(false);
    // ~1,2 s de tempo real a 1× ⇒ ~300 passos de 4 ms (folga larga: o teste não mede desempenho)
    expect(e.passo).toBeGreaterThan(120);
    expect(e.passo).toBeLessThan(480);
    expect(e.passo).toBe(e.passosSim);
    // o relógio da tela mostra exatamente t = n·Δt
    expect(e.relogio).toContain(fmtT(e.passo * 0.004));
    // pausado, nada se move
    await page.waitForTimeout(250);
    expect((await estado(page)).passo).toBe(e.passo);
    // um passo = exatamente Δt
    await page.getByRole('button', { name: 'Avançar um passo' }).click();
    const e2 = await estado(page);
    expect(e2.passo).toBe(e.passo + 1);
    expect(e2.relogio).toContain(fmtT((e.passo + 1) * 0.004));
    await page.keyboard.press('Shift+ArrowLeft');
    expect((await estado(page)).passo).toBe(e.passo - 9);
    // o estado mostrado é o mesmo que a definição pura calcula do zero
    const z = await doZero(page);
    const e3 = await estado(page);
    expect([e3.t, e3.x1, e3.x2, e3.E]).toEqual([z.t, z.x1, z.x2, z.E]);
    // reinício reproduzível
    await page.getByRole('button', { name: 'Voltar a t = 0' }).click();
    expect(await estado(page)).toMatchObject({ passo: 0, x1: 0.12, x2: 0 });
    expect(erros).toEqual([]);
  });

  test('puxar uma massa define a condição inicial; soltar inicia do repouso em t = 0', async ({ page, hasTouch }) => {
    await abrirOsc(page);
    const esc = await page.evaluate(() => (window as any).__estudio.cena.esc as number);
    const p = await centroMassa(page, 1);
    // massa 2: 10 cm para a esquerda
    await arrastar(page, !!hasTouch, p, { x: p.x - 0.1 * esc, y: p.y + 3 }, 10);
    const v = await valores(page);
    expect(Math.abs(v.x2 - -10)).toBeLessThan(0.6);
    expect(v.x1).toBe(12); // a outra massa manteve a sua condição inicial
    expect(v.v2).toBe(0);
    await page.waitForTimeout(500);
    const e = await estado(page);
    expect(e.rodando).toBe(true);
    await page.getByRole('button', { name: 'Pausar' }).click();
    // o histórico começa na condição solta
    const ini = await page.evaluate(() => {
      const s = (window as any).__estudio.motor.sim;
      return [s.qEm(0, 0), s.qEm(0, 1), s.vEm(0, 0), s.vEm(0, 1)];
    });
    expect(ini[0]).toBe(0.12);
    expect(ini[1]).toBeCloseTo(v.x2 / 100, 12);
    expect(ini.slice(2)).toEqual([0, 0]);
    // arrasto = uma entrada de desfazer
    await page.getByRole('button', { name: 'Desfazer' }).click();
    expect((await valores(page)).x2).toBe(0);
  });

  test('mudar o acoplamento refaz o histórico até o mesmo instante', async ({ page }) => {
    await abrirOsc(page, '#/osciladores?f=1&e=1&x.passos=3000');
    const antes = await estado(page);
    expect(antes.passo).toBe(3000);
    await page.locator('#p-osciladores-kc').fill('17,5');
    await page.locator('#p-osciladores-kc').press('Enter');
    const depois = await estado(page);
    expect(depois.passo).toBe(3000);
    expect(depois.x1).not.toBe(antes.x1);
    const z = await doZero(page);
    expect([depois.x1, depois.x2, depois.E]).toEqual([z.x1, z.x2, z.E]);
    // arrastar no diagrama de modos também muda k_c, e a frequência analítica acompanha
    await page.getByRole('tab', { name: 'Modos normais' }).click();
    const g = (await page.locator('[data-grafico="modos"]').boundingBox())!;
    await page.mouse.move(g.x + g.width * 0.3, g.y + g.height / 2);
    await page.mouse.down();
    await page.mouse.move(g.x + g.width * 0.6, g.y + g.height / 2, { steps: 6 });
    await page.mouse.up();
    const v = await valores(page);
    expect(v.kc).not.toBe(17.5);
    const w = await page.evaluate(() => (window as any).__estudio.sessao.solucao.value.modos.omegaAlta as number);
    expect(w).toBeCloseTo(Math.sqrt((40 + 2 * v.kc) / 1), 12);
    expect((await estado(page)).passo).toBe(3000);
  });

  test('arrastar no gráfico escolhe o instante; cena, gráfico e leitura mostram o mesmo passo', async ({ page }) => {
    await abrirOsc(page, '#/osciladores?f=1&e=1&x.passos=5000');
    const g = (await page.locator('[data-grafico="posicoes"]').boundingBox())!;
    await page.mouse.move(g.x + g.width * 0.5, g.y + g.height / 2);
    await page.mouse.down();
    await page.mouse.move(g.x + g.width * 0.3, g.y + g.height / 2, { steps: 5 });
    await page.mouse.up();
    const e = await estado(page);
    expect(e.passo).toBeGreaterThan(0);
    expect(e.passo).toBeLessThan(5000);
    expect(e.passosSim).toBe(5000); // o futuro continua guardado até tocar
    expect(e.relogio).toContain(fmtT(e.passo * 0.004));
    await expect(page.locator('.instr .lateral')).toContainText(fmtT(e.passo * 0.004));
    // a massa desenhada está na posição do histórico naquele passo
    const m = await page.evaluate(() => {
      const { cena, motor } = (window as any).__estudio;
      const p = cena.posicoesMassas();
      return { dx: (p[0].x - cena.xc) / cena.esc + 0.36, x1: motor.sim.qEm(motor.cursor.value, 0) };
    });
    expect(m.dx).toBeCloseTo(m.x1, 12);
    // tocar dali descarta o futuro e recalcula: determinístico
    await page.getByRole('button', { name: 'Tocar' }).click();
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Pausar' }).click();
    const f = await estado(page);
    expect(f.passo).toBeGreaterThan(e.passo);
    expect(f.passosSim).toBe(f.passo);
    const z = await doZero(page);
    expect([f.x1, f.x2, f.E]).toEqual([z.x1, z.x2, z.E]);
  });

  test('o link reabre o mesmo instante, com o mesmo estado, em sessão nova', async ({ page, browser, hasTouch }) => {
    await abrirOsc(page, '#/osciladores?f=1&e=1&m2=2.35&kc=6.1&integrador=rk4&dt=2.5&x.grafico=energia');
    await page.getByRole('button', { name: 'Tocar' }).click();
    await page.waitForTimeout(900);
    await page.getByRole('button', { name: 'Pausar' }).click();
    await expect.poll(() => page.evaluate(() => location.hash === (window as any).__estudio.sessao.link()), { timeout: 5000 }).toBe(true);
    const e = await estado(page);
    const link = page.url();
    expect(link).toContain(`x.passos=${e.passo}`);
    const [v, x] = [await valores(page), await extras(page)];
    const ctx = await browser.newContext({ viewport: page.viewportSize()!, deviceScaleFactor: 2, hasTouch, locale: 'pt-BR' });
    const outra = await ctx.newPage();
    const erros = vigiarErros(outra);
    await outra.goto(link);
    await outra.waitForFunction(() => !!(window as any).__estudio?.motor);
    expect(await valores(outra)).toEqual(v);
    expect(await extras(outra)).toEqual(x);
    const e2 = await estado(outra);
    expect([e2.passo, e2.x1, e2.x2, e2.E]).toEqual([e.passo, e.x1, e.x2, e.E]);
    expect(e2.relogio).toBe(e.relogio);
    await expect(outra.getByRole('tab', { name: 'Energia' })).toHaveAttribute('aria-selected', 'true');
    expect(erros).toEqual([]);
    await ctx.close();
  });

  test('a deriva de energia distingue os integradores, e a instabilidade é avisada', async ({ page }) => {
    // 3000 passos de 10 ms com Euler explícito: a energia cresce muito
    await abrirOsc(page, '#/osciladores?f=1&e=1&integrador=euler&dt=10&x.passos=3000&x.grafico=energia');
    const euler = await estado(page);
    expect(euler.E / euler.E0).toBeGreaterThan(50);
    await page.locator('.painel select.selecao').selectOption('verlet');
    const verlet = await estado(page);
    expect(verlet.passo).toBe(3000);
    // Verlet: oscilação limitada por (ω₊Δt)²/4 ≈ 1,2e-3
    expect(Math.abs(verlet.E / verlet.E0 - 1)).toBeLessThan(1.5e-3);
    await expect(page.locator('.instr .lateral')).toContainText('deriva');
    // acima do passo crítico o estúdio avisa em vez de mostrar números sem sentido
    await page.locator('#p-osciladores-dt').fill('100');
    await page.locator('#p-osciladores-dt').press('Enter');
    await page.locator('#p-osciladores-kc').fill('200');
    await page.locator('#p-osciladores-kc').press('Enter');
    await expect(page.locator('.painel .aviso')).toContainText('divergiu');
  });

  test('exporta as séries temporais com unidades e a imagem da cena', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'downloads verificados uma vez, no desktop');
    await abrirOsc(page, '#/osciladores?f=1&e=1&x.passos=1000');
    const baixar = async (item: RegExp) => {
      await page.getByRole('button', { name: 'Compartilhar' }).click();
      const [d] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: item }).click()]);
      return { nome: d.suggestedFilename(), dados: readFileSync(await d.path()) };
    };
    const series = (await baixar(/Séries temporais/)).dados.toString('utf8');
    expect(series).toContain('t (s),x1 (m),x2 (m),v1 (m/s),v2 (m/s),E1 (J),E2 (J),E_acoplamento (J),E_total (J)');
    const linhas = series.split('\r\n').filter((l) => l && !l.startsWith('#'));
    expect(linhas.length).toBe(1002);
    const ultima = linhas[1001].split(',').map(Number);
    const e = await estado(page);
    expect(ultima[0]).toBe(e.t);
    expect(ultima[1]).toBe(e.x1);
    expect(ultima[8]).toBe(e.E);
    const png = await baixar(/Imagem da cena/);
    expect(png.dados.subarray(1, 4).toString()).toBe('PNG');
    expect(png.dados.length).toBeGreaterThan(20_000);
  });

  test('cada experimento guarda o seu estado ao alternar de aba', async ({ page }) => {
    await abrirOsc(page, '#/osciladores?f=1&e=1&kc=9&x.passos=700');
    await page.getByRole('tab', { name: 'Bancada de óptica' }).click();
    await page.waitForFunction(() => !!(window as any).__estudio?.cena?.vista);
    await page.locator('#p-optica-a').fill('90');
    await page.locator('#p-optica-a').press('Enter');
    await page.getByRole('tab', { name: 'Osciladores acoplados' }).click();
    await page.waitForFunction(() => !!(window as any).__estudio?.motor);
    expect((await valores(page)).kc).toBe(9);
    expect((await estado(page)).passo).toBe(700);
    await page.getByRole('tab', { name: 'Bancada de óptica' }).click();
    await page.waitForFunction(() => !!(window as any).__estudio?.cena?.vista);
    expect((await valores(page)).a).toBe(90);
  });

  test('os quatro gráficos desenham sem erro em retrato e paisagem', async ({ page }) => {
    const erros = vigiarErros(page);
    await abrirOsc(page, '#/osciladores?f=1&e=1&m2=2.5&kc=12&x.passos=6000');
    for (const aba of ['Posições', 'Energia', 'Modos normais', 'Plano x₁–x₂']) {
      await page.getByRole('tab', { name: aba }).click();
      await page.waitForTimeout(80);
      const pintado = await page.evaluate(() => {
        const c = document.querySelector('.instr .grafico canvas') as HTMLCanvasElement;
        const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        for (let i = 3; i < d.length; i += 4 * 53) if (d[i] > 0) n++;
        return n;
      });
      expect(pintado, aba).toBeGreaterThan(40);
    }
    const tam = page.viewportSize()!;
    await page.setViewportSize({ width: tam.height, height: tam.width });
    await page.waitForTimeout(250);
    await expect(page.locator('.transporte')).toBeInViewport();
    await expect(page.locator('.painel')).toBeInViewport();
    expect(erros).toEqual([]);
  });
});
