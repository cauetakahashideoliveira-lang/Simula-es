import { defineConfig } from '@playwright/test';

/**
 * Testes de navegador contra o build de produção (vite preview).
 * Os projetos emulam viewport, densidade de pixels e toque de um iPad no
 * Chromium — não é o Safari/WebKit de um iPad real.
 */
const porta = 4173;
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: { baseURL: `http://127.0.0.1:${porta}/`, locale: 'pt-BR', trace: 'off', acceptDownloads: true },
  webServer: {
    command: `npx vite preview --port ${porta} --host 127.0.0.1 --strictPort`,
    url: `http://127.0.0.1:${porta}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    { name: 'tablet-paisagem', use: { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true } },
    { name: 'tablet-retrato', use: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true } },
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } },
  ],
});
