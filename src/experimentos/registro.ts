/**
 * Registro das apresentações. Cada experimento tem uma definição pura
 * (./definicoes.ts) e uma vista carregada sob demanda.
 */
import type { ComponentType } from 'preact';
import type { Signal } from '@preact/signals';
import type { Sessao } from '../nucleo/sessao';

export interface ConjuntoDados {
  id: string;
  titulo: string;
  /** gera o CSV no momento do pedido */
  gerar(): string;
}

/** O que a vista de um experimento oferece à barra do estúdio. */
export interface Acoes {
  exportarPNG?: () => Promise<Blob>;
  dados?: () => ConjuntoDados[];
}

export interface PropsVista<Sol = any> {
  sessao: Sessao<Sol>;
  acoes: Signal<Acoes>;
  /** texto de convite a mostrar sobre a cena (predefinição aplicada) */
  convite: Signal<{ titulo: string; texto: string } | null>;
}

export const vistas: Record<string, () => Promise<{ default: ComponentType<PropsVista> }>> = {
  optica: () => import('./optica/Vista'),
  osciladores: () => import('./osciladores/Vista'),
};
