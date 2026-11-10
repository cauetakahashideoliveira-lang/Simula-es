import { expect, type CDPSession, type Page } from '@playwright/test';

/** Erros de console e de página acumulados (os testes exigem zero). */
export function vigiarErros(page: Page): string[] {
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') erros.push(m.text());
  });
  return erros;
}

export async function abrir(page: Page, hash = '', busca = '') {
  await page.goto(`./${busca}${hash}`);
  await page.waitForFunction(() => !!(window as any).__estudio?.cena);
  // espera o pulso inicial das alças terminar para as posições ficarem estáveis
  await page.waitForTimeout(350);
}

export const valores = (page: Page) => page.evaluate(() => ({ ...(window as any).__estudio.sessao.valores.value }));
export const extras = (page: Page) => page.evaluate(() => ({ ...(window as any).__estudio.sessao.extras.value }));

export async function caixaCena(page: Page) {
  const b = await page.locator('.cena').boundingBox();
  expect(b).not.toBeNull();
  return b!;
}

/** posição de uma alça em coordenadas da página */
export async function alca(page: Page, id: string) {
  const b = await caixaCena(page);
  const a = await page.evaluate((id) => (window as any).__estudio.cena.posicoesAlcas().find((x: any) => x.id === id) ?? null, id);
  expect(a, `alça ${id}`).not.toBeNull();
  return { x: b.x + a.x, y: b.y + a.y };
}

export const vista = (page: Page) => page.evaluate(() => {
  const v = (window as any).__estudio.cena.vista;
  return { cx: v.cx, cy: v.cy, escala: v.escala };
});

/** converte coordenadas do mundo (z, y) em coordenadas da página */
export async function mundoParaPagina(page: Page, z: number, y: number) {
  const b = await caixaCena(page);
  const p = await page.evaluate(([z, y]) => {
    const v = (window as any).__estudio.cena.vista;
    return { x: v.tx(z), y: v.ty(y) };
  }, [z, y]);
  return { x: b.x + p.x, y: b.y + p.y };
}

type Ponto = { x: number; y: number; id?: number };

/** Gestos de toque reais (um ou dois dedos) via protocolo do Chromium; geram pointer events de tipo "touch". */
export class Toque {
  private constructor(private cdp: CDPSession, private page: Page) {}
  static async em(page: Page) {
    return new Toque(await page.context().newCDPSession(page), page);
  }
  private enviar(type: 'touchStart' | 'touchMove' | 'touchEnd', pontos: Ponto[]) {
    return this.cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: pontos.map((p, i) => ({ x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100, id: p.id ?? i, radiusX: 8, radiusY: 8, force: 1 })),
    });
  }
  async tocar(p: Ponto) {
    await this.enviar('touchStart', [p]);
    await this.page.waitForTimeout(40);
    await this.enviar('touchEnd', []);
    await this.page.waitForTimeout(60);
  }
  /** arrasta um dedo de a até b em `passos` movimentos */
  async arrastar(a: Ponto, b: Ponto, passos = 12) {
    await this.enviar('touchStart', [a]);
    for (let i = 1; i <= passos; i++) {
      await this.enviar('touchMove', [{ x: a.x + ((b.x - a.x) * i) / passos, y: a.y + ((b.y - a.y) * i) / passos }]);
      await this.page.waitForTimeout(12);
    }
    await this.enviar('touchEnd', []);
    await this.page.waitForTimeout(80);
  }
  /** pinça: dois dedos em torno de c, separação de d0 a d1 px */
  async pinca(c: Ponto, d0: number, d1: number, passos = 10) {
    const par = (d: number) => [{ x: c.x - d / 2, y: c.y, id: 0 }, { x: c.x + d / 2, y: c.y, id: 1 }];
    await this.enviar('touchStart', [par(d0)[0]]);
    await this.enviar('touchStart', par(d0));
    for (let i = 1; i <= passos; i++) {
      await this.enviar('touchMove', par(d0 + ((d1 - d0) * i) / passos));
      await this.page.waitForTimeout(12);
    }
    await this.enviar('touchEnd', []);
    await this.page.waitForTimeout(80);
  }
}

/** arrasto genérico: toque nos projetos de tablet, mouse no desktop */
export async function arrastar(page: Page, comToque: boolean, a: Ponto, b: Ponto, passos = 12) {
  if (comToque) {
    const t = await Toque.em(page);
    await t.arrastar(a, b, passos);
  } else {
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: passos });
    await page.mouse.up();
    await page.waitForTimeout(60);
  }
}

export async function tocar(page: Page, comToque: boolean, p: Ponto) {
  if (comToque) await (await Toque.em(page)).tocar(p);
  else {
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(60);
  }
}
