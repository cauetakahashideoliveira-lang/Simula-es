import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { abrir, alca, arrastar, caixaCena, extras, mundoParaPagina, tocar, Toque, valores, vigiarErros, vista } from './apoio';

const medidas = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const s = (window as any).__estudio.sessao.solucao.value;
    return {
      W: s.anteparo.W as number,
      rms: s.anteparo.rms as number,
      zMarg: s.marginalSup.zCruz as number | null,
      rRms: s.mancha().rRms as number,
      prova: s.prova ? { u: s.prova.u, z: s.prova.zCruz, ti: s.prova.traco.reflexoes[0]?.thetaI, tr: s.prova.traco.reflexoes[0]?.thetaR } : null,
    };
  });

test.describe('bancada de óptica', () => {
  test('abre com a cena desenhada, a camada de luz ativa e sem erros', async ({ page }) => {
    const erros = vigiarErros(page);
    await abrir(page);
    await expect(page.getByRole('tab', { name: 'Bancada de óptica' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.cena canvas')).toHaveCount(3);
    const info = await page.evaluate(() => {
      const c = (window as any).__estudio.cena;
      const vet = document.querySelector('.cena canvas.vetor') as HTMLCanvasElement;
      const d = vet.getContext('2d')!.getImageData(0, 0, vet.width, vet.height).data;
      let pintados = 0;
      for (let i = 3; i < d.length; i += 4 * 97) if (d[i] > 0) pintados++;
      return { modo: c.modoLuz, raiosLuz: c.ultimoQuadro.raiosLuz, pintados, w: vet.width, cssW: vet.getBoundingClientRect().width, dpr: devicePixelRatio };
    });
    expect(info.modo).toBe('webgl2-16f');
    expect(info.raiosLuz).toBeGreaterThan(300);
    expect(info.pintados).toBeGreaterThan(200);
    // tela nítida: o canvas acompanha a densidade de pixels
    expect(Math.abs(info.w - info.cssW * info.dpr)).toBeLessThanOrEqual(1);
    expect(erros).toEqual([]);
  });

  test('arrastar a borda do espelho muda a abertura e alarga o perfil', async ({ page, hasTouch }) => {
    await abrir(page, '#/optica?f=1&e=1&a=60');
    const antes = await medidas(page);
    const p = await alca(page, 'abertura+');
    const esc = (await vista(page)).escala;
    await arrastar(page, !!hasTouch, p, { x: p.x, y: p.y - 80 * esc });
    const v = await valores(page);
    // a alça não salta: 80 mm de arrasto ⇒ +80 mm de abertura (±1 px)
    expect(Math.abs(v.a - 140)).toBeLessThan(1.5 / esc + 0.26);
    const depois = await medidas(page);
    expect(depois.W).toBeGreaterThan(antes.W * 5);
    expect(depois.zMarg!).toBeLessThan(antes.zMarg!);
    // um arrasto = uma entrada de desfazer
    await page.getByRole('button', { name: 'Desfazer' }).click();
    expect((await valores(page)).a).toBe(60);
  });

  test('arrastar o anteparo move só o anteparo, sem deslocar a cena', async ({ page, hasTouch }) => {
    await abrir(page, '#/optica?f=1&e=1&a=120&zs=180');
    const v0 = await vista(page);
    const esc = v0.escala;
    const p = await alca(page, 'anteparo');
    // z cresce para a esquerda: arrastar 30 mm para a direita leva o anteparo a z = 150
    await arrastar(page, !!hasTouch, p, { x: p.x + 30 * esc, y: p.y + 4 });
    expect(Math.abs((await valores(page)).zs - 150)).toBeLessThan(1.5 / esc + 0.06);
    expect(await vista(page)).toEqual(v0);
    // também dá para pegar o anteparo pela linha, longe dos pegadores
    const meio = await mundoParaPagina(page, (await valores(page)).zs, 30);
    await arrastar(page, !!hasTouch, meio, { x: meio.x - 20 * esc, y: meio.y });
    expect(Math.abs((await valores(page)).zs - 170)).toBeLessThan(2 / esc + 0.06);
    expect(await vista(page)).toEqual(v0);
  });

  test('tocar num raio seleciona o raio de prova e mostra θi = θr', async ({ page, hasTouch }) => {
    await abrir(page, '#/optica?f=1&e=1&a=150&nRaios=11');
    expect((await extras(page)).prova).toBeNull();
    // o raio desenhado em u = 90 mm (ρ = 0,6), tocado no trecho incidente
    const p = await mundoParaPagina(page, 300, 90);
    await tocar(page, !!hasTouch, p);
    const x = await extras(page);
    expect(x.prova).toBeCloseTo(0.6, 6);
    const m = await medidas(page);
    expect(m.prova!.ti).toBeGreaterThan(0.2);
    expect(Math.abs(m.prova!.ti - m.prova!.tr)).toBeLessThan(1e-12);
    await expect(page.locator('.painel')).toContainText('cruza o eixo em');
    // a cena não se moveu com o toque
    const v0 = await vista(page);
    // tocar no vazio solta o raio
    const b = await caixaCena(page);
    await tocar(page, !!hasTouch, { x: b.x + b.width - 30, y: b.y + 90 });
    expect((await extras(page)).prova).toBeNull();
    expect(await vista(page)).toEqual(v0);
  });

  test('arrastar o ponto de incidência varre o raio de prova continuamente', async ({ page, hasTouch }) => {
    await abrir(page, '#/optica?f=1&e=1&a=150&x.prova=0.4');
    const esc = (await vista(page)).escala;
    const p = await alca(page, 'prova');
    await arrastar(page, !!hasTouch, p, { x: p.x + 3, y: p.y - 45 * esc });
    const m = await medidas(page);
    expect(Math.abs(m.prova!.u - 105)).toBeLessThan(2 / esc + 0.2);
  });

  test('trocar só a superfície preserva abertura, anteparo, feixe e enquadramento', async ({ page }) => {
    await abrir(page, '#/optica?f=1&e=1&a=150&zs=200&x.prova=1');
    const v0 = await valores(page);
    const vista0 = await vista(page);
    const esf = await medidas(page);
    expect(esf.W).toBeGreaterThan(10);
    await page.getByRole('button', { name: 'Parabólico' }).click();
    const v1 = await valores(page);
    expect({ ...v1, kappa: 0 }).toEqual(v0);
    expect(await vista(page)).toEqual(vista0);
    const par = await medidas(page);
    expect(par.W).toBeLessThan(1e-9);
    expect(Math.abs(par.prova!.z! - 200)).toBeLessThan(1e-9);
    // e a escala do perfil não foi reampliada sozinha
    await expect(page.locator('.instr .lateral')).toContainText('Janela ±');
    const janela = await page.locator('.instr .lateral .acoes span').first().textContent();
    await page.getByRole('button', { name: 'Esférico' }).click();
    expect(await page.locator('.instr .lateral .acoes span').first().textContent()).toBe(janela);
    expect((await medidas(page)).W).toBe(esf.W);
  });

  test('guardar dois estados e alternar sem perder o enquadramento', async ({ page, hasTouch }) => {
    await abrir(page, '#/optica?f=1&e=1&a=80');
    await page.locator('[data-guardado="A"]').click();
    await page.getByRole('button', { name: 'Parabólico' }).click();
    await page.locator('#p-optica-a').fill('160');
    await page.locator('#p-optica-a').press('Enter');
    await page.locator('[data-guardado="B"]').click();
    // amplia a cena e depois alterna
    const b = await caixaCena(page);
    if (hasTouch) await (await Toque.em(page)).pinca({ x: b.x + b.width * 0.6, y: b.y + b.height / 2 }, 80, 240);
    else {
      await page.mouse.move(b.x + b.width * 0.6, b.y + b.height / 2);
      await page.mouse.wheel(0, -600);
    }
    await page.waitForTimeout(250);
    const v = await vista(page);
    await page.locator('[data-guardado="A"]').click();
    expect(await valores(page)).toMatchObject({ a: 80, kappa: 0 });
    await expect(page.locator('[data-guardado="A"]')).toHaveClass(/atual/);
    expect(await vista(page)).toEqual(v);
    await page.locator('[data-guardado="B"]').click();
    expect(await valores(page)).toMatchObject({ a: 160, kappa: -1 });
    expect(await vista(page)).toEqual(v);
    // os estados sobrevivem a recarregar a página
    await page.reload();
    await page.waitForFunction(() => !!(window as any).__estudio?.cena);
    await page.locator('[data-guardado="A"]').click();
    expect((await valores(page)).a).toBe(80);
  });

  test('pinça amplia em torno dos dedos, arrasto desloca e o botão reenquadra', async ({ page, hasTouch }) => {
    test.skip(!hasTouch, 'gesto de dois dedos');
    await abrir(page);
    const v0 = await vista(page);
    const foco = await mundoParaPagina(page, 200, 0);
    const t = await Toque.em(page);
    await t.pinca(foco, 60, 300);
    const v1 = await vista(page);
    expect(v1.escala / v0.escala).toBeGreaterThan(4);
    expect(v1.escala / v0.escala).toBeLessThan(6);
    // o ponto sob os dedos (o foco) continua sob os dedos
    const foco1 = await mundoParaPagina(page, 200, 0);
    expect(Math.hypot(foco1.x - foco.x, foco1.y - foco.y)).toBeLessThan(3);
    // nenhum parâmetro físico mudou com o gesto de câmera
    expect((await valores(page)).zs).toBe(200);
    expect((await valores(page)).a).toBe(200);
    const b = await caixaCena(page);
    const vazio = { x: b.x + b.width - 40, y: b.y + b.height * 0.3 };
    await t.arrastar(vazio, { x: vazio.x - 90, y: vazio.y + 40 });
    const v2 = await vista(page);
    expect(v2.escala).toBe(v1.escala);
    expect(Math.abs((v2.cx - v1.cx) * v1.escala - -90)).toBeLessThan(8);
    await page.getByRole('button', { name: 'Reenquadrar' }).click();
    const v3 = await vista(page);
    expect(v3.escala).toBeCloseTo(v0.escala, 9);
    expect(v3.cx).toBeCloseTo(v0.cx, 9);
  });

  test('zoom profundo no foco da parábola continua exato e legível', async ({ page }) => {
    // 2×10⁶ px/mm: a tela inteira cobre menos de 1 µm
    await abrir(page, '#/optica?f=1&e=1&kappa=-1&a=150&x.prova=0.7&vista=200,0,2000000');
    const r = await page.evaluate(() => {
      const { cena, sessao } = (window as any).__estudio;
      const s = sessao.solucao.value;
      // onde o raio de prova cruza a tela, em px, comparado com o foco
      const z = s.prova.zCruz as number;
      return { dzPx: (z - 200) * cena.vista.escala, escala: cena.vista.escala, ms: cena.ultimoQuadro.ms };
    });
    expect(r.escala).toBe(2000000);
    // a 2 px/nm o raio passa a menos de um milésimo de pixel do foco
    expect(Math.abs(r.dzPx)).toBeLessThan(1e-3);
    await expect(page.locator('.cena')).toBeVisible();
  });

  test('campo numérico: vírgula decimal, domínio e entrada inválida', async ({ page }) => {
    await abrir(page);
    const campo = page.locator('#p-optica-a');
    await campo.fill('150,5');
    await campo.press('Enter');
    expect((await valores(page)).a).toBe(150.5);
    await campo.fill('9999');
    await campo.press('Enter');
    expect((await valores(page)).a).toBe(380);
    await expect(page.locator('.campo.erro .nota')).toContainText('Domínio');
    await campo.fill('abc');
    await campo.press('Enter');
    expect((await valores(page)).a).toBe(380);
    await expect(page.locator('.campo.erro .nota')).toContainText('Não entendi');
    // a distância focal é o mesmo parâmetro físico que R
    await page.locator('#p-optica-f').fill('125');
    await page.locator('#p-optica-f').press('Enter');
    const v = await valores(page);
    expect(v.R).toBe(250);
    expect(v.a).toBeCloseTo(237.5, 9); // preso ao novo domínio 0,95·R
  });

  test('o link reabre o mesmo estado, com as mesmas medidas e o mesmo enquadramento', async ({ page, browser, hasTouch }) => {
    await abrir(page, '#/optica?f=1&e=1&a=137.25&alfa=1.5&zs=196.4&kappa=-0.4&x.prova=-0.35&x.instr=mancha');
    const p = await alca(page, 'anteparo');
    await arrastar(page, !!hasTouch, p, { x: p.x - 13.7, y: p.y });
    await page.getByRole('button', { name: 'Ampliar', exact: true }).click();
    await page.waitForTimeout(500); // o link é atualizado com pequeno atraso
    const link = page.url();
    expect(link).toContain('#/optica?f=1&e=1');
    expect(link).toContain('vista=');
    const [v, x, m, cam] = [await valores(page), await extras(page), await medidas(page), await vista(page)];
    // sessão nova, sem armazenamento compartilhado
    const ctx = await browser.newContext({ viewport: page.viewportSize()!, deviceScaleFactor: 2, hasTouch, locale: 'pt-BR' });
    const outra = await ctx.newPage();
    const erros = vigiarErros(outra);
    await outra.goto(link);
    await outra.waitForFunction(() => !!(window as any).__estudio?.cena);
    expect(await valores(outra)).toEqual(v);
    expect(await extras(outra)).toEqual(x);
    expect(await medidas(outra)).toEqual(m);
    expect(await vista(outra)).toEqual(cam);
    await expect(outra.getByRole('tab', { name: 'Mancha 3D' })).toHaveAttribute('aria-selected', 'true');
    expect(erros).toEqual([]);
    await ctx.close();
  });

  test('exporta imagem limpa, dados com unidades e estado versionado', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'downloads verificados uma vez, no desktop');
    await abrir(page, '#/optica?f=1&e=1&a=120&x.prova=0.5');
    const baixar = async (item: RegExp) => {
      await page.getByRole('button', { name: 'Compartilhar' }).click();
      const [d] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: item }).click()]);
      const caminho = await d.path();
      return { nome: d.suggestedFilename(), dados: readFileSync(caminho) };
    };
    const png = await baixar(/Imagem da cena/);
    expect(png.nome).toMatch(/^optica-\d{8}-\d{6}\.png$/);
    expect(png.dados.subarray(1, 4).toString()).toBe('PNG');
    expect(png.dados.length).toBeGreaterThan(40_000);
    const raios = (await baixar(/Raios do leque/)).dados.toString('utf8');
    expect(raios).toContain('# estado: http');
    expect(raios).toContain('u (mm),rho,estado,reflexoes,y_P (mm),z_P (mm),theta_i (grau),theta_r (grau),z_cruzamento (mm),y_anteparo (mm)');
    const linhas = raios.split('\r\n').filter((l) => l && !l.startsWith('#'));
    expect(linhas.length).toBe(2002);
    const c = linhas[1001].split(',').map(Number);
    expect(c[6]).toBeCloseTo(c[7], 10); // θi = θr também no arquivo
    const estado = JSON.parse((await baixar(/Salvar estado/)).dados.toString('utf8'));
    expect(estado).toMatchObject({ app: 'estudio-simulacoes', formato: 1, experimento: 'optica', versaoExperimento: 1 });
    expect(estado.parametros.a).toBe(120);
    expect(estado.extras.prova).toBe(0.5);
    // reabrir o arquivo depois de mudar tudo devolve o estado
    await page.getByRole('button', { name: 'Restaurar o estado inicial' }).click();
    expect((await valores(page)).a).toBe(200);
    await page.locator('input[type=file]').setInputFiles({ name: 'e.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(estado)) });
    await expect.poll(async () => (await valores(page)).a).toBe(120);
    expect((await extras(page)).prova).toBe(0.5);
  });

  test('casos difíceis não quebram: feixe estreito, abertura extrema, anteparo no foco, feixe fora do espelho', async ({ page }) => {
    const erros = vigiarErros(page);
    for (const hash of [
      '#/optica?f=1&e=1&a=0.4&zs=200',
      '#/optica?f=1&e=1&a=380&zs=40&nRaios=151',
      '#/optica?f=1&e=1&kappa=-1&a=200&zs=200&x.instr=perfil',
      '#/optica?f=1&e=1&a=60&feixeAuto=0&w=140&alfa=18&x.prova=1',
      '#/optica?f=1&e=1&R=20&a=19&zs=0&H=0.02',
      '#/optica?f=1&e=1&R=10000&a=9000&alfa=-30&zs=30000',
    ]) {
      await abrir(page, hash);
      for (const aba of ['Perfil no anteparo', 'Mancha 3D', 'Aberração longitudinal', 'Varredura do anteparo']) {
        await page.getByRole('tab', { name: aba }).click();
        await page.waitForTimeout(60);
      }
      const ok = await page.evaluate(() => {
        const s = (window as any).__estudio.sessao.solucao.value;
        return Number.isFinite(s.f) && s.leque.n > 0;
      });
      expect(ok).toBe(true);
    }
    expect(erros).toEqual([]);
  });

  test('girar o tablet mantém a bancada enquadrada e os painéis acessíveis', async ({ page }) => {
    await abrir(page);
    const tam = page.viewportSize()!;
    await page.setViewportSize({ width: tam.height, height: tam.width });
    await page.waitForTimeout(300);
    const b = await caixaCena(page);
    for (const [z, y] of [[0, 200], [0, -200], [400, 0], [200, 0]]) {
      const p = await mundoParaPagina(page, z, y);
      expect(p.x).toBeGreaterThan(b.x);
      expect(p.x).toBeLessThan(b.x + b.width);
      expect(p.y).toBeGreaterThan(b.y);
      expect(p.y).toBeLessThan(b.y + b.height);
    }
    await expect(page.locator('.painel')).toBeInViewport();
    await expect(page.locator('.instr')).toBeInViewport();
    await expect(page.getByRole('button', { name: 'Parabólico' })).toBeVisible();
  });

  test('modo de compatibilidade (sem WebGL de ponto flutuante) mantém as mesmas medidas', async ({ page }) => {
    await abrir(page, '#/optica?f=1&e=1&a=150', '?luz=2d');
    const modo = await page.evaluate(() => (window as any).__estudio.cena.modoLuz);
    expect(modo).toBe('canvas2d');
    await expect(page.locator('.legenda-cena')).toContainText('compatibilidade');
    const m = await medidas(page);
    await abrir(page, '#/optica?f=1&e=1&a=150');
    expect(await medidas(page)).toEqual(m);
  });

  test('a explicação avalia as equações com os parâmetros atuais', async ({ page }) => {
    await abrir(page, '#/optica?f=1&e=1&a=150&x.prova=0.8');
    await page.getByRole('tab', { name: 'Explicação' }).click();
    const t = page.locator('.explica');
    await expect(t).toContainText('Raio de prova selecionado');
    await expect(t.locator('.katex').first()).toBeVisible();
    // h = 120 mm, R = 400 mm ⇒ θ = 17,4576°, z× = 190,3430 mm
    await expect(t).toContainText('17,4576');
    await expect(t).toContainText('190,3430');
  });
});
