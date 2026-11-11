import { expect, test } from '@playwright/test';
import { abrir, valores } from './apoio';

test.describe('recursos do estúdio', () => {
  test('o outro estado guardado aparece como referência nos instrumentos, com seus números', async ({ page }) => {
    await abrir(page, '#/optica?f=1&e=1&a=150&zs=200&x.prova=1');
    const W = (sel: string) => page.evaluate((sel) => {
      const s = (window as any).__estudio.sessao.solucao.value;
      return sel === 'W' ? s.anteparo.W : s.marginalSup.zCruz - s.f;
    }, sel);
    const Wesfera = await W('W');
    const dzEsfera = await W('dz');
    // sem nada guardado, não há referência
    await expect(page.locator('[data-fantasma]')).toHaveCount(0);
    await page.locator('[data-guardado="A"]').click();
    // atual = A: ainda não há com o que comparar
    await expect(page.locator('[data-fantasma]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Parabólico' }).click();
    // atual (parábola) ≠ A (esfera): o perfil mostra A e o seu W
    const lateral = page.locator('.instr .lateral');
    await expect(lateral.locator('[data-fantasma="A"]')).toBeVisible();
    const wTexto = (await lateral.locator('.medida', { hasText: 'no estado A' }).locator('.valor').textContent())!;
    expect(wTexto.replace(/\s/g, '')).toBe(`${Wesfera.toPrecision(4).replace('.', ',')}mm`);
    // a referência não muda o estado atual
    expect((await valores(page)).kappa).toBe(-1);
    expect(await W('W')).toBeLessThan(1e-9);
    // nos demais instrumentos também
    await page.getByRole('tab', { name: 'Aberração longitudinal' }).click();
    await expect(lateral.locator('[data-fantasma="A"]')).toBeVisible();
    await expect(lateral.locator('.medida', { hasText: 'no estado A' })).toContainText(Math.abs(dzEsfera).toPrecision(4).replace('.', ','));
    for (const aba of ['Varredura do anteparo', 'Mancha 3D']) {
      await page.getByRole('tab', { name: aba }).click();
      await expect(lateral.locator('[data-fantasma="A"]')).toBeVisible();
    }
    // guardando B (parábola), alternar para A mostra B como referência
    await page.locator('[data-guardado="B"]').click();
    await page.locator('[data-guardado="A"]').click();
    await expect(lateral.locator('[data-fantasma="B"]')).toBeVisible();
  });

  test('a cena tem descrição textual atualizada para leitores de tela', async ({ page }) => {
    await abrir(page, '#/optica?f=1&e=1&a=150&x.prova=0.8');
    const d = page.locator('#descricao-cena-optica');
    await expect(d).toHaveAttribute('aria-live', 'polite');
    await expect(d).toContainText('Espelho esférico');
    await expect(d).toContainText('abertura 150,0 mm');
    await expect(d).toContainText('incidência e reflexão de 17,46 graus');
    await page.getByRole('button', { name: 'Parabólico' }).click();
    await expect(d).toContainText('Espelho parabólico', { timeout: 3000 });
    await expect(page.locator('.cena')).toHaveAttribute('aria-describedby', 'descricao-cena-optica');
  });

  test('funciona sem rede depois da primeira visita, nos dois experimentos', async ({ page, context }, info) => {
    test.skip(info.project.name !== 'desktop', 'service worker verificado uma vez, no desktop');
    await abrir(page, '#/optica', '?sw=1');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15_000 });
    const guardados = await page.evaluate(async () => (await (await caches.open('estudio-v1')).keys()).length);
    expect(guardados).toBeGreaterThan(10);
    await context.setOffline(true);
    try {
      await page.reload();
      await page.waitForFunction(() => !!(window as any).__estudio?.cena, null, { timeout: 15_000 });
      await expect(page.locator('.cena canvas')).toHaveCount(3);
      // o outro experimento nunca foi aberto online: veio do cache da instalação
      await page.getByRole('tab', { name: 'Osciladores acoplados' }).click();
      await page.waitForFunction(() => !!(window as any).__estudio?.motor, null, { timeout: 15_000 });
      await page.getByRole('tab', { name: 'Explicação' }).click();
      await expect(page.locator('.explica .katex').first()).toBeVisible();
    } finally {
      await context.setOffline(false);
    }
  });
});
