import { describe, expect, it } from 'vitest';
import { fmtSig, fmtFixo, lerNumero, comprimentoMm, marcas } from '../src/nucleo/formato';
import { normalizar, valoresPadrao } from '../src/nucleo/parametros';
import { codificarLink, lerLink, validar, paraArquivo, lerArquivo } from '../src/nucleo/estado';
import { recortar, Vista2D } from '../src/nucleo/vista2d';
import { medir } from '../src/nucleo/experimento';
import { optica } from '../src/experimentos/optica/definicao';
import { osciladores } from '../src/experimentos/osciladores/definicao';

describe('formatação pt-BR', () => {
  it('usa vírgula decimal e sinal tipográfico', () => {
    expect(fmtSig(1234.5678, 5)).toBe('1234,6');
    expect(fmtSig(-0.0012345, 3)).toBe('−0,00123');
    expect(fmtFixo(-0.0001, 2)).toBe('0,00');
    expect(fmtFixo(3.14159, 3)).toBe('3,142');
    expect(fmtSig(1.5e-9, 2)).toBe('1,5×10⁻⁹');
  });
  it('escolhe a unidade de comprimento pela ordem de grandeza', () => {
    expect(comprimentoMm(0.0000125)).toBe('12,50 nm');
    expect(comprimentoMm(0.0421)).toBe('42,10 µm');
    expect(comprimentoMm(8.2)).toBe('8,200 mm');
    expect(comprimentoMm(12500)).toBe('12,50 m');
    expect(comprimentoMm(0)).toBe('0 mm');
  });
  it('lê números digitados com vírgula, ponto, unidade e expoente', () => {
    expect(lerNumero('12,5')).toBe(12.5);
    expect(lerNumero('12.5 mm')).toBe(12.5);
    expect(lerNumero('−3,2°')).toBe(-3.2);
    expect(lerNumero('1.234,5')).toBe(1234.5);
    expect(lerNumero('1,2e-3')).toBe(0.0012);
    expect(lerNumero('abc')).toBeNull();
    expect(lerNumero('')).toBeNull();
  });
  it('gera marcas redondas', () => {
    expect(marcas(0, 1, 5).valores).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
    expect(marcas(-3, 3, 6).passo).toBe(1);
  });
});

describe('parâmetros: domínio e validação', () => {
  it('prende valores ao domínio dependente e avisa', () => {
    const { valores, avisos } = normalizar(optica.parametros, { R: 100, a: 500, alfa: 'x', kappa: 0 });
    expect(valores.R).toBe(100);
    expect(valores.a).toBe(95); // 0,95·R
    expect(valores.alfa).toBe(0);
    expect(avisos.length).toBe(2);
  });
  it('trocar esfera ↔ parábola nunca altera a abertura (domínio comum para κ ≤ 0)', () => {
    const esf = normalizar(optica.parametros, { R: 400, a: 380, kappa: 0 }).valores;
    const par = normalizar(optica.parametros, { ...esf, kappa: -1 }).valores;
    expect(par.a).toBe(esf.a);
  });
  it('ignora chaves desconhecidas e completa com padrões', () => {
    const { valores } = normalizar(osciladores.parametros, { kc: 9, intruso: 1 } as any);
    expect(valores.kc).toBe(9);
    expect('intruso' in valores).toBe(false);
    expect(valores.m1).toBe(1);
  });
});

describe('estado versionado: link e arquivo', () => {
  it('link → estado → mesmas medidas, bit a bit (óptica)', () => {
    const v = normalizar(optica.parametros, { ...valoresPadrao(optica.parametros), R: 387.123456789012, a: 151.3, alfa: 1.7, zs: 191.00000000001, kappa: -0.37 }).valores;
    const x = { ...optica.extrasPadrao, prova: 0.61803398875, janela: 2.5 };
    const vista = { cx: 201.25, cy: -3.5, escala: 17.123456789 };
    const link = codificarLink(optica, v, x, vista);
    const lido = validar(optica, lerLink(link)!);
    expect(lido.valores).toEqual(v);
    expect(lido.extras).toEqual(x);
    expect(lido.vista).toEqual(vista);
    expect(lido.avisos).toEqual([]);
    expect(medir(optica, lido.valores, lido.extras)).toEqual(medir(optica, v, x));
  });
  it('link → estado → mesmas medidas (osciladores, com instante selecionado)', () => {
    const v = normalizar(osciladores.parametros, { ...valoresPadrao(osciladores.parametros), m2: 2.35, kc: 6.1, integrador: 'rk4', dt: 2.5 }).valores;
    const x = { ...osciladores.extrasPadrao, passos: 3456, grafico: 'energia' };
    const lido = validar(osciladores, lerLink(codificarLink(osciladores, v, x, null))!);
    expect(lido.valores).toEqual(v);
    expect(lido.extras).toEqual(x);
    expect(medir(osciladores, lido.valores, lido.extras)).toEqual(medir(osciladores, v, x));
  });
  it('arquivo JSON faz a mesma viagem e rejeita arquivos estranhos', () => {
    const v = valoresPadrao(optica.parametros);
    const arq = JSON.stringify(paraArquivo(optica, v, optica.extrasPadrao, null));
    const lido = validar(optica, lerArquivo(arq));
    expect(lido.valores).toEqual(v);
    expect(() => lerArquivo('{"a":1}')).toThrow(/não é um estado/);
    expect(() => lerArquivo('não json')).toThrow(/JSON/);
  });
  it('um link com lixo abre com padrões e avisos, sem quebrar', () => {
    const lido = validar(optica, lerLink('#/optica?f=1&e=1&R=banana&a=-5&zs=1e99&x.prova=7&vista=1,2')!);
    expect(lido.valores.R).toBe(400);
    expect(lido.valores.a).toBe(0.4);
    expect(lido.valores.zs).toBe(1200);
    expect(lido.vista).toBeNull();
    expect(lido.avisos.length).toBeGreaterThanOrEqual(3);
    expect(lerLink('qualquer coisa')).toBeNull();
  });
});

describe('vista 2D', () => {
  it('ida e volta mundo ↔ tela é exata em zoom profundo e o recorte mantém a reta', () => {
    const v = new Vista2D();
    v.largura = 1180; v.altura = 820; v.sentidoX = -1;
    v.cx = 200; v.cy = 0; v.escala = 2.5e6; // 2,5 px por nanômetro
    const wx = 200 + 3.2e-5, wy = -1.1e-5;
    expect(Math.abs(v.mx(v.tx(wx)) - wx)).toBeLessThan(1e-12);
    expect(Math.abs(v.my(v.ty(wy)) - wy)).toBeLessThan(1e-12);
    // uma reta que cruza a tela vinda de 10⁹ px de distância
    const out = [0, 0, 0, 0];
    const ok = recortar(-1e9, -1e9 * 0.5 + 300, 1e9, 1e9 * 0.5 + 300, 0, 0, 1180, 820, out);
    expect(ok).toBe(true);
    // os pontos recortados continuam sobre y = 0,5x + 300
    expect(Math.abs(out[1] - (0.5 * out[0] + 300))).toBeLessThan(1e-6);
    expect(Math.abs(out[3] - (0.5 * out[2] + 300))).toBeLessThan(1e-6);
    expect(recortar(-10, -10, -5, -5, 0, 0, 100, 100, out)).toBe(false);
    expect(recortar(50, 50, 1, 0, 0, 0, 100, 100, out, true)).toBe(true);
    expect(out[2]).toBe(100);
  });
  it('zoom mantém fixo o ponto sob o dedo', () => {
    const v = new Vista2D();
    v.largura = 800; v.altura = 600; v.sentidoX = -1; v.escala = 2; v.cx = 100;
    const wx = v.mx(250), wy = v.my(420);
    v.zoomEm(250, 420, 7.3);
    expect(v.tx(wx)).toBeCloseTo(250, 9);
    expect(v.ty(wy)).toBeCloseTo(420, 9);
  });
});
