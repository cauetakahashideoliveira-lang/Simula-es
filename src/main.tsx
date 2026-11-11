import { render } from 'preact';
import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import 'katex/dist/katex.min.css';
import './estilo.css';
import { App } from './app';
import { emArtefato } from './config';

render(<App />, document.getElementById('app')!);

// Offline no endereço público. Fora do Artifact do claude.ai (que não aceita
// service workers) e fora de testes automatizados, salvo pedido com ?sw=1.
const pedido = new URLSearchParams(location.search).has('sw');
if ('serviceWorker' in navigator && !import.meta.env.DEV && !emArtefato() && (!navigator.webdriver || pedido)) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* sem service worker o estúdio funciona igual, só não offline */
    });
  });
}
