/**
 * Lê as grandezas de um experimento sem abrir o renderizador.
 *
 *   npm run medir -- optica a=120 zs=196 x.prova=1
 *   npm run medir -- '#/optica?f=1&e=1&kappa=-1&a=150'
 *   npm run medir -- osciladores kc=8 x.passos=2500 --json
 */
import { definicoes } from '../src/experimentos/definicoes';
import { lerLink, validar, type EstadoBruto } from '../src/nucleo/estado';
import { fmtSig } from '../src/nucleo/formato';
import { medir } from '../src/nucleo/experimento';

const args = process.argv.slice(2);
const json = args.includes('--json');
const resto = args.filter((a) => a !== '--json');
if (!resto.length) {
  console.error('uso: npm run medir -- <experimento | link> [parametro=valor ...] [x.extra=valor ...] [--json]');
  console.error('experimentos:', Object.keys(definicoes).join(', '));
  process.exit(1);
}
let bruto: EstadoBruto | null = lerLink(resto[0].includes('#') ? resto[0].slice(resto[0].indexOf('#')) : `#/${resto[0]}`);
if (!bruto || !definicoes[bruto.experimento]) {
  console.error(`experimento desconhecido: ${resto[0]}`);
  process.exit(1);
}
for (const par of resto.slice(1)) {
  const i = par.indexOf('=');
  if (i < 0) continue;
  const k = par.slice(0, i);
  const v = par.slice(i + 1);
  if (k.startsWith('x.')) bruto.extras[k.slice(2)] = v;
  else bruto.parametros[k] = v;
}
const def = definicoes[bruto.experimento];
const est = validar(def, bruto);
const medidas = medir(def, est.valores, est.extras);
if (json) {
  console.log(JSON.stringify({ experimento: def.id, parametros: est.valores, extras: est.extras, avisos: est.avisos, medidas }, null, 2));
} else {
  console.log(`\n${def.titulo} — ${def.resumo}`);
  for (const a of est.avisos) console.log(`  aviso: ${a.mensagem}`);
  console.log('\nParâmetros');
  for (const p of def.parametros) {
    const u = p.tipo === 'numero' && p.unidade ? ` ${p.unidade}` : '';
    console.log(`  ${p.id.padEnd(12)} ${String(est.valores[p.id]).padStart(12)}${u.padEnd(6)} ${p.rotulo} [${p.classe}]`);
  }
  console.log('\nMedidas');
  for (const m of medidas) {
    const v = m.valor === null ? 'indefinido' : fmtSig(m.valor, 10);
    console.log(`  ${m.id.padEnd(14)} ${v.padStart(18)} ${m.unidade.padEnd(6)} ${m.rotulo}`);
  }
  console.log('');
}
