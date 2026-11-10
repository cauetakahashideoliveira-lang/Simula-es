/**
 * Registro das definições (sem interface). É o que os testes, o terminal e
 * a aplicação usam para descobrir os experimentos disponíveis.
 */
import type { DefExperimento } from '../nucleo/experimento';
import { optica } from './optica/definicao';
import { osciladores } from './osciladores/definicao';

export const definicoes: Record<string, DefExperimento<any>> = {
  [optica.id]: optica,
  [osciladores.id]: osciladores,
};

export const ordem = [optica.id, osciladores.id];
