import { render } from 'preact';
import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import 'katex/dist/katex.min.css';
import './estilo.css';
import { App } from './app';

render(<App />, document.getElementById('app')!);
