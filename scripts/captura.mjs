/**
 * Captura telas da aplicação em viewports de tablet para revisão visual.
 *   node scripts/captura.mjs [urlBase] [pastaDeSaida] [hash]
 * Requer um servidor rodando (npm run dev ou npm run preview).
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://127.0.0.1:5173/';
const saida = process.argv[3] ?? 'relatorios/capturas';
const hash = process.argv[4] ?? '';
mkdirSync(saida, { recursive: true });

const alvos = [
  { nome: 'ipad-paisagem', w: 1180, h: 820, dsf: 2, toque: true },
  { nome: 'ipad-retrato', w: 820, h: 1180, dsf: 2, toque: true },
  { nome: 'desktop', w: 1440, h: 900, dsf: 1, toque: false },
];

const browser = await chromium.launch();
for (const a of alvos) {
  const ctx = await browser.newContext({ viewport: { width: a.w, height: a.h }, deviceScaleFactor: a.dsf, hasTouch: a.toque, isMobile: a.toque, locale: 'pt-BR' });
  const page = await ctx.newPage();
  const erros = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') erros.push(m.text()); });
  page.on('pageerror', (e) => erros.push(String(e)));
  await page.goto(base + hash);
  await page.waitForSelector('.cena canvas');
  await page.waitForTimeout(3200);
  await page.screenshot({ path: `${saida}/${a.nome}.png` });
  if (erros.length) console.log(a.nome, 'console:', erros.slice(0, 6));
  await ctx.close();
}
await browser.close();
console.log('capturas em', saida);
