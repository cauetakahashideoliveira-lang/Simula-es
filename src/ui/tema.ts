/**
 * Linguagem visual do estúdio, para uso em canvas (os mesmos valores estão em
 * estilo.css como propriedades CSS).
 *
 * Cada papel tem cor E traço próprios, para não depender só da cor:
 *   luz           — dourado, traço contínuo
 *   equipamento   — branco frio, contínuo e mais espesso
 *   construção    — azul, tracejado (normal: traço longo; tangente: traço curto)
 *   teoria        — rosa, traço-ponto e marcador em losango
 *   seleção       — branco, espesso, com contorno escuro
 *   medida        — branco fino com cotas (linhas de chamada e setas)
 */
export const cores = {
  fundo: '#05070a',
  painel: '#0c0f13',
  painel2: '#12161b',
  linha: '#222a33',
  linhaForte: '#37424f',
  texto: '#e8ecf0',
  texto2: '#a3aeba',
  texto3: '#6b7684',
  luz: '#ffc24a',
  luzQuente: '#fff1cf',
  equipamento: '#dfe6ee',
  gravado: '#8793a1',
  construcao: '#7cc4ff',
  teoria: '#f29bc8',
  selecao: '#ffffff',
  alerta: '#ff8d6b',
  /** séries categóricas dos gráficos — validadas (faixa de luminosidade, CVD, contraste) contra a superfície escura */
  serie1: '#c98500',
  serie2: '#3987e5',
  serie3: '#d55181',
  neutro: '#c9d1da',
} as const;

export const fontes = {
  ui: "'Barlow', system-ui, sans-serif",
  mat: "KaTeX_Math, 'Times New Roman', serif",
  matReta: "KaTeX_Main, 'Times New Roman', serif",
};

export const tracos = {
  eixo: [14, 4, 2, 4],
  normal: [9, 5],
  tangente: [3, 4],
  teoria: [8, 3, 1.5, 3],
  perdido: [2, 5],
} as const;

/** rgba a partir de #rrggbb */
export function alfa(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
