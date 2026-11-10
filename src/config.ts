/**
 * Endereço público do estúdio (GitHub Pages). É usado para montar links de
 * estado quando a página roda embutida em outro lugar (por exemplo, como
 * Artifact no claude.ai), onde o endereço da própria página não serve para
 * compartilhar. Se o repositório mudar de nome ou de dono, mude aqui.
 */
export const URL_PUBLICA = 'https://cauetakahashideoliveira-lang.github.io/Simula-es/';

/** Verdadeiro quando a página roda dentro de um Artifact do claude.ai. */
export const emArtefato = (): boolean => typeof (globalThis as any).claude?.use === 'function';
