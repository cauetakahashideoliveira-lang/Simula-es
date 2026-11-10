/**
 * Prepara o build para ser publicado como Artifact no claude.ai (rota
 * alternativa ao GitHub Pages: abre no iPad sem configurar nada no GitHub).
 *
 *   npx vite build && node scripts/artefato.mjs [pastaDeSaida]
 *
 * Gera `<saida>/estudio-de-simulacoes.html` (só o conteúdo da página; o
 * claude.ai acrescenta o esqueleto) e `<saida>/arquivos.json`, o mapa
 * "caminho publicado → arquivo do build" com scripts, estilos e fontes woff2.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const saida = resolve(process.argv[2] ?? 'relatorios/artefato');
const dist = resolve('dist');
const html = readFileSync(`${dist}/index.html`, 'utf8');
const js = html.match(/<script[^>]+src="\.\/(assets\/[^"]+\.js)"/)?.[1];
const css = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="\.\/(assets\/[^"]+\.css)"/g)].map((m) => m[1]);
if (!js) throw new Error('não encontrei o script principal em dist/index.html — rode `npx vite build` antes');

const pagina = `<title>Estúdio de simulações</title>
<style>
  /* estúdio de bancada: uma única aparência, escura, por escolha (a luz é o assunto) */
  :root { color-scheme: dark; --fundo: #05070a; }
  body { background: var(--fundo); color: #e8ecf0; }
</style>
${css.map((c) => `<link rel="stylesheet" href="${c}">`).join('\n')}
<div id="app"></div>
<script type="module" src="${js}"></script>
`;
mkdirSync(saida, { recursive: true });
writeFileSync(`${saida}/estudio-de-simulacoes.html`, pagina);

const arquivos = {};
for (const nome of readdirSync(`${dist}/assets`)) {
  if (/\.(js|css|woff2)$/.test(nome)) arquivos[`assets/${nome}`] = `${dist}/assets/${nome}`;
}
writeFileSync(`${saida}/arquivos.json`, JSON.stringify(arquivos, null, 2));
console.log(`página: ${saida}/estudio-de-simulacoes.html`);
console.log(`${Object.keys(arquivos).length} arquivos de apoio em ${saida}/arquivos.json`);
