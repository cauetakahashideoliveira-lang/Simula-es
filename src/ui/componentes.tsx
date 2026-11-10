/**
 * Componentes de interface compartilhados por todos os experimentos.
 * `Param` desenha qualquer parâmetro declarado numa definição: é o que permite
 * montar o painel de um experimento novo sem escrever controles à mão.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren, JSX, RefObject } from 'preact';
import { signal } from '@preact/signals';
import katex from 'katex';
import type { Sessao } from '../nucleo/sessao';
import { fmtComprimentoMm, fmtFixo, fmtSig, lerNumero } from '../nucleo/formato';
import type { ParamNumero } from '../nucleo/parametros';

// ————— fórmulas —————

const cacheTex = new Map<string, string>();
export function texHtml(t: string, bloco = false): string {
  const chave = (bloco ? 'B' : 'I') + t;
  let h = cacheTex.get(chave);
  if (h === undefined) {
    h = katex.renderToString(t, { throwOnError: false, displayMode: bloco, output: 'html', strict: false });
    if (cacheTex.size > 600) cacheTex.clear();
    cacheTex.set(chave, h);
  }
  return h;
}

export function Tex({ t, bloco }: { t: string; bloco?: boolean }) {
  return bloco ? (
    <div class="eq" dangerouslySetInnerHTML={{ __html: texHtml(t, true) }} />
  ) : (
    <span dangerouslySetInnerHTML={{ __html: texHtml(t) }} />
  );
}

/** número em TeX com vírgula decimal sem espaço extra: 12{,}5 */
export function texNum(x: number, casas = 2): string {
  return fmtFixo(x, casas).replace('−', '-').replace(',', '{,}');
}
export function texSig(x: number, sig = 4): string {
  return texDe(fmtSig(x, sig));
}
/** comprimento em mm → TeX com a unidade adequada: 12{,}5\ \text{µm} */
export function texComp(mm: number, sig = 4): string {
  const v = fmtComprimentoMm(mm, sig);
  return `${texDe(v.texto)}\\ \\text{${v.unidade}}`;
}
/** converte um número já formatado em pt-BR para TeX */
export function texDe(s: string): string {
  const m = s.match(/^(.*)×10(.*)$/);
  const base = (m ? m[1] : s).replace('−', '-').replace(',', '{,}');
  if (!m) return base;
  const mapa: Record<string, string> = { '⁻': '-', '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };
  return `${base}\\times 10^{${m[2].split('').map((c) => mapa[c] ?? c).join('')}}`;
}

// ————— ícones (traço 1,6 px, 18 px) —————

const I = (d: string, extra?: JSX.Element) => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d={d} />
    {extra}
  </svg>
);
export const Icone = {
  desfazer: () => I('M6.5 4 3 7.5 6.5 11M3.5 7.5h7a4 4 0 0 1 0 8H8'),
  refazer: () => I('M11.5 4 15 7.5 11.5 11M14.5 7.5h-7a4 4 0 0 0 0 8H10'),
  restaurar: () => I('M3.2 9a5.8 5.8 0 1 0 1.9-4.3M3 2.8v3.4h3.4'),
  enquadrar: () => I('M3 6.5V3h3.5M11.5 3H15v3.5M15 11.5V15h-3.5M6.5 15H3v-3.5'),
  mais: () => I('M9 3.5v11M3.5 9h11'),
  menos: () => I('M3.5 9h11'),
  compartilhar: () => I('M9 11.5V2.5M5.8 5.5 9 2.3l3.2 3.2M3.5 9.5v5h11v-5'),
  lista: () => I('M6.5 4.5h8M6.5 9h8M6.5 13.5h8', <g fill="currentColor" stroke="none"><circle cx="3.4" cy="4.5" r="1" /><circle cx="3.4" cy="9" r="1" /><circle cx="3.4" cy="13.5" r="1" /></g>),
  tocar: () => I('M5.5 3.5v11l9-5.5z'),
  pausar: () => I('M6 3.5v11M12 3.5v11'),
  passo: () => I('M4 3.5v11l7-5.5zM13.5 3.5v11'),
  reiniciar: () => I('M4 3.5v11M14.5 3.5v11l-8-5.5z'),
  fechar: () => I('M4.5 4.5l9 9M13.5 4.5l-9 9'),
  alvo: () => I('M9 2v3M9 13v3M2 9h3M13 9h3', <circle cx="9" cy="9" r="3.2" />),
};

// ————— campo numérico —————

interface CampoNumeroProps {
  rotulo: string;
  simbolo?: string;
  unidade: string;
  valor: number;
  min: number;
  max: number;
  passo: number;
  casas?: number;
  escala?: 'linear' | 'log';
  inteiro?: boolean;
  semSlider?: boolean;
  desabilitado?: boolean;
  dica?: string;
  onInicio?: () => void;
  onMudar: (v: number) => void;
  onFim?: () => void;
  id?: string;
}

const N_SLIDER = 1000;

export function CampoNumero(p: CampoNumeroProps) {
  const casas = p.casas ?? 2;
  const [texto, setTexto] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const tErro = useRef<number>(0);
  const arrastando = useRef(false);
  const formatado = p.inteiro ? String(Math.round(p.valor)) : fmtFixo(p.valor, casas);
  const log = p.escala === 'log' && p.min > 0;

  const paraPos = (v: number) => {
    if (!(p.max > p.min)) return 0;
    const f = log ? Math.log(v / p.min) / Math.log(p.max / p.min) : (v - p.min) / (p.max - p.min);
    return Math.round(Math.max(0, Math.min(1, f)) * N_SLIDER);
  };
  const dePos = (pos: number) => {
    const f = pos / N_SLIDER;
    let v = log ? p.min * Math.pow(p.max / p.min, f) : p.min + f * (p.max - p.min);
    // arredonda ao passo, sem sair do domínio
    v = Math.round(v / p.passo) * p.passo;
    v = Number(v.toFixed(10));
    return Math.min(p.max, Math.max(p.min, v));
  };

  const avisar = (m: string) => {
    setErro(m);
    window.clearTimeout(tErro.current);
    tErro.current = window.setTimeout(() => setErro(null), 2600);
  };
  useEffect(() => () => window.clearTimeout(tErro.current), []);

  const confirmar = (t: string) => {
    setTexto(null);
    const n = lerNumero(t);
    if (n === null) {
      if (t.trim() !== '') avisar('Não entendi esse número.');
      return;
    }
    let v = p.inteiro ? Math.round(n) : n;
    if (v < p.min || v > p.max) {
      v = Math.min(p.max, Math.max(p.min, v));
      avisar(`Domínio: ${fmtSig(p.min, 4)} a ${fmtSig(p.max, 4)} ${p.unidade}`.trim());
    }
    if (v !== p.valor) p.onMudar(v);
  };

  const cutucar = (sinal: number, e: KeyboardEvent) => {
    const f = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
    const v = Math.min(p.max, Math.max(p.min, Number((p.valor + sinal * p.passo * f).toFixed(10))));
    p.onMudar(v);
  };

  return (
    <div class={`campo${erro ? ' erro' : ''}`}>
      <div class="linha1">
        <label for={p.id}>
          {p.simbolo && <span class="simb"><Tex t={p.simbolo} /></span>}
          {p.rotulo}
        </label>
        <div class="entrada">
          <input
            id={p.id}
            type="text"
            inputMode="decimal"
            autocomplete="off"
            spellcheck={false}
            disabled={p.desabilitado}
            value={texto ?? formatado}
            onFocus={(e) => {
              setTexto(formatado);
              const el = e.currentTarget;
              requestAnimationFrame(() => el.select());
            }}
            onInput={(e) => setTexto(e.currentTarget.value)}
            onBlur={(e) => confirmar(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              else if (e.key === 'Escape') {
                setTexto(null);
                e.currentTarget.value = formatado;
                e.currentTarget.blur();
              } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                cutucar(e.key === 'ArrowUp' ? 1 : -1, e);
                setTexto(null);
              }
              e.stopPropagation();
            }}
          />
          {p.unidade && <span class="un">{p.unidade}</span>}
        </div>
      </div>
      {!p.semSlider && (
        <input
          type="range"
          aria-label={p.rotulo}
          min={0}
          max={N_SLIDER}
          step={1}
          disabled={p.desabilitado}
          value={paraPos(p.valor)}
          onPointerDown={() => {
            arrastando.current = true;
            p.onInicio?.();
          }}
          onInput={(e) => {
            if (!arrastando.current) p.onInicio?.();
            p.onMudar(dePos(Number(e.currentTarget.value)));
            if (!arrastando.current) p.onFim?.();
          }}
          onPointerUp={() => {
            arrastando.current = false;
            p.onFim?.();
          }}
          onPointerCancel={() => {
            arrastando.current = false;
            p.onFim?.();
          }}
          onKeyDown={(e) => e.stopPropagation()}
        />
      )}
      {erro && <div class="nota">{erro}</div>}
      {p.dica && !erro && <div class="dica">{p.dica}</div>}
    </div>
  );
}

/** Controle de qualquer parâmetro declarado na definição do experimento. */
export function Param({ sessao, id, semSlider, rotulo, dica, desabilitado }: {
  sessao: Sessao<any>;
  id: string;
  semSlider?: boolean;
  rotulo?: string;
  dica?: boolean;
  desabilitado?: boolean;
}) {
  const e = sessao.espec(id);
  const v = sessao.valores.value[id];
  if (e.tipo === 'numero') {
    const [min, max] = sessao.dominioDe(id);
    const n = e as ParamNumero;
    return (
      <CampoNumero
        id={`p-${sessao.def.id}-${id}`}
        rotulo={rotulo ?? n.rotulo}
        simbolo={n.simbolo}
        unidade={n.unidade}
        valor={v as number}
        min={min}
        max={max}
        passo={n.passo}
        casas={n.casas}
        escala={n.escala}
        inteiro={n.inteiro}
        semSlider={semSlider}
        desabilitado={desabilitado}
        dica={dica ? n.descricao : undefined}
        onInicio={() => sessao.inicioGesto()}
        onMudar={(x) => sessao.definir({ [id]: x })}
        onFim={() => sessao.fimGesto()}
      />
    );
  }
  if (e.tipo === 'logico') {
    return (
      <Interruptor rotulo={rotulo ?? e.rotulo} valor={v as boolean} onMudar={(x) => sessao.definir({ [id]: x })} dica={dica ? e.descricao : undefined} />
    );
  }
  return (
    <div class="campo">
      <div class="linha1"><span class="rotulo">{rotulo ?? e.rotulo}</span></div>
      <select class="selecao" value={v as string} onChange={(ev) => sessao.definir({ [id]: ev.currentTarget.value })}>
        {e.opcoes.map((o) => <option value={o.valor}>{o.rotulo}</option>)}
      </select>
      {dica && e.descricao && <div class="dica">{e.descricao}</div>}
    </div>
  );
}

export function Interruptor({ rotulo, valor, onMudar, dica }: { rotulo: ComponentChildren; valor: boolean; onMudar: (v: boolean) => void; dica?: string }) {
  return (
    <div class="campo">
      <label class="interruptor">
        <span class="txt">{rotulo}</span>
        <input type="checkbox" checked={valor} onChange={(e) => onMudar(e.currentTarget.checked)} onKeyDown={(e) => e.stopPropagation()} />
        <span class="trilho" />
      </label>
      {dica && <div class="dica">{dica}</div>}
    </div>
  );
}

export function Segmentado<T extends string>({ opcoes, valor, onMudar, rotulo }: {
  opcoes: { valor: T; rotulo: ComponentChildren }[];
  valor: T | null;
  onMudar: (v: T) => void;
  rotulo: string;
}) {
  return (
    <div class="segmentado" role="group" aria-label={rotulo}>
      {opcoes.map((o) => (
        <button type="button" aria-pressed={o.valor === valor} onClick={() => onMudar(o.valor)}>{o.rotulo}</button>
      ))}
    </div>
  );
}

export function Secao({ titulo, classe, children, aberta = true, fixa }: {
  titulo: string;
  classe?: string;
  children: ComponentChildren;
  aberta?: boolean;
  fixa?: boolean;
}) {
  if (fixa) {
    return (
      <section class="secao">
        <div class="cab">{titulo}{classe && <span class="classe">{classe}</span>}</div>
        <div class="corpo">{children}</div>
      </section>
    );
  }
  return (
    <details class="secao" open={aberta}>
      <summary>{titulo}{classe && <span class="classe">{classe}</span>}</summary>
      <div class="corpo">{children}</div>
    </details>
  );
}

export function Medida({ simbolo, nome, valor, unidade, def, destaque }: {
  simbolo?: string;
  nome: string;
  valor: string;
  unidade?: string;
  def?: ComponentChildren;
  destaque?: boolean;
}) {
  return (
    <div class={`medida${destaque ? ' destaque' : ''}`}>
      <div class="nome">{simbolo && <span class="simb"><Tex t={simbolo} /></span>}{nome}</div>
      <div class="valor">{valor}{unidade && <span class="un">{unidade}</span>}</div>
      {def && <div class="def">{def}</div>}
    </div>
  );
}

// ————— menu suspenso —————

export function Menu({ ancora, onFechar, children, alinhar = 'direita' }: {
  ancora: HTMLElement | null;
  onFechar: () => void;
  children: ComponentChildren;
  alinhar?: 'direita' | 'esquerda';
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    if (!ancora || !ref.current) return;
    const r = ancora.getBoundingClientRect();
    const m = ref.current.getBoundingClientRect();
    let left = alinhar === 'direita' ? r.right - m.width : r.left;
    left = Math.max(8, Math.min(window.innerWidth - m.width - 8, left));
    setPos({ left, top: r.bottom + 6 });
  }, [ancora]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onFechar();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  return (
    <>
      <div class="menu-fundo" onPointerDown={onFechar} />
      <div class="menu" ref={ref} role="menu" style={pos ? { left: `${pos.left}px`, top: `${pos.top}px` } : { visibility: 'hidden' }}>
        {children}
      </div>
    </>
  );
}

// ————— avisos rápidos —————

interface Torrada { id: number; texto: string; erro: boolean }
const torradas = signal<Torrada[]>([]);
let proxima = 1;
export function avisar(texto: string, erro = false) {
  const id = proxima++;
  torradas.value = [...torradas.value.slice(-2), { id, texto, erro }];
  window.setTimeout(() => {
    torradas.value = torradas.value.filter((t) => t.id !== id);
  }, erro ? 5200 : 2400);
}
export function Torradas() {
  return (
    <div class="torradas" aria-live="polite">
      {torradas.value.map((t) => <div key={t.id} class={`torrada${t.erro ? ' erro' : ''}`}>{t.texto}</div>)}
    </div>
  );
}

/** Tamanho de um elemento em px CSS, atualizado por ResizeObserver. */
export function useTamanho<T extends HTMLElement>(): [RefObject<T | null>, { w: number; h: number }] {
  const ref = useRef<T | null>(null);
  const [t, setT] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setT((a) => (a.w === Math.round(r.width) && a.h === Math.round(r.height) ? a : { w: Math.round(r.width), h: Math.round(r.height) }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, t];
}
