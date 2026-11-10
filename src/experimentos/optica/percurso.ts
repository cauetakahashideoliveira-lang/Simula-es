/**
 * Percurso desenhável de um raio: os trechos (incidente, refletidos, final)
 * que a cena, a camada de luz e a seleção por toque percorrem do mesmo jeito.
 */
import { Estado } from './modelo';
import { MAXP, type Leque } from './analise';

export const TIPO_INC = 0;
export const TIPO_REF = 1;
export const TIPO_PERD = 2;

export type Emitir = (z0: number, y0: number, z1: number, y1: number, semirreta: boolean, tipo: number) => void;

/**
 * Percorre os trechos desenháveis do raio i de um leque. Coordenadas do mundo;
 * em semirretas (z1, y1) é a direção. Com anteparo opaco, o raio termina no impacto.
 */
export function percorrer(L: Leque, i: number, sa: number, ca: number, zs: number, H: number, opaco: boolean, emit: Emitir) {
  const nr = L.nRefl[i];
  if (nr === 0) {
    // não atinge o espelho: reta inteira pelo ponto p0 = (y = u cos α, z = −u sen α)
    const u = L.u[i];
    const y0 = u * ca;
    const z0 = -u * sa;
    if (L.estado[i] === Estado.Bloqueado) {
      emit(L.pFinal[3 * i + 2], L.pFinal[3 * i + 1], ca, sa, true, TIPO_INC);
      return;
    }
    emit(z0, y0, ca, sa, true, TIPO_PERD);
    emit(z0, y0, -ca, -sa, true, TIPO_PERD);
    return;
  }
  const base = i * MAXP * 3;
  // trecho incidente: semirreta do primeiro ponto de reflexão para trás (−d0)
  emit(L.pontos[base + 2], L.pontos[base + 1], ca, sa, true, TIPO_INC);
  const guardados = Math.min(nr, MAXP);
  const seg = L.segImp[i];
  const corta = opaco && seg >= 0 && Math.abs(L.yImp[i]) <= H;
  for (let k = 0; k < guardados; k++) {
    const o = base + 3 * k;
    const py = L.pontos[o + 1];
    const pz = L.pontos[o + 2];
    if (corta && seg === k) {
      emit(pz, py, zs, L.yImp[i], false, TIPO_REF);
      return;
    }
    if (k + 1 < nr) {
      if (k + 1 >= guardados) return;
      emit(pz, py, L.pontos[o + 5], L.pontos[o + 4], false, TIPO_REF);
    } else if (L.estado[i] === Estado.Refletido) {
      emit(pz, py, L.dirs[o + 2], L.dirs[o + 1], true, TIPO_REF);
    }
  }
}
