/*
 * Estúdio de simulações — funcionamento offline (GitHub Pages ou qualquer
 * hospedagem estática).
 *
 * Na instalação, guarda a página e todos os arquivos do build listados em
 * manifesto-build.json (inclusive o experimento que ainda não foi aberto).
 * Arquivos com hash no nome (assets/) vêm do cache primeiro: nunca mudam.
 * A página e o manifesto vêm da rede primeiro, para pegar a versão nova, e do
 * cache quando não há conexão.
 */
const CACHE = 'estudio-v1';
const base = new URL('./', self.registration.scope);

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const lista = new Set(['./', 'manifest.webmanifest', 'icone.svg', 'icone-180.png', 'icone-512.png']);
    try {
      const m = await (await fetch(new URL('manifesto-build.json', base), { cache: 'no-cache' })).json();
      for (const ent of Object.values(m)) {
        lista.add(ent.file);
        for (const x of ent.css ?? []) lista.add(x);
        for (const x of ent.assets ?? []) lista.add(x);
      }
    } catch {
      /* sem manifesto: o cache se forma conforme o uso */
    }
    const urls = [...lista].map((u) => new URL(u, base).href);
    await Promise.allSettled(urls.map((u) => cache.add(u)));
    // descarta arquivos de builds anteriores que não fazem parte deste
    for (const req of await cache.keys()) {
      if (req.url.includes('/assets/') && !urls.includes(req.url)) await cache.delete(req);
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (url.pathname.includes('/assets/')) {
      // ignoreVary: módulos são pedidos com Origin (crossorigin) e o servidor responde com Vary: Origin
      const guardado = await cache.match(req, { ignoreVary: true });
      if (guardado) return guardado;
      const resp = await fetch(req);
      if (resp.ok) cache.put(req, resp.clone());
      return resp;
    }
    try {
      const resp = await fetch(req);
      if (resp.ok && url.pathname.startsWith(base.pathname)) cache.put(req.mode === 'navigate' ? new URL('./', base).href : req, resp.clone());
      return resp;
    } catch (erro) {
      const op = { ignoreSearch: true, ignoreVary: true };
      const guardado = (await cache.match(req, op)) ?? (req.mode === 'navigate' ? await cache.match(new URL('./', base).href, op) : undefined);
      if (guardado) return guardado;
      throw erro;
    }
  })());
});
