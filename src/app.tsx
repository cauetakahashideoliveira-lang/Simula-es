/**
 * Casca do estúdio: barra superior genérica (experimentos, predefinições,
 * estados A/B, desfazer, compartilhar) e carregamento da vista ativa.
 * Tudo aqui funciona para qualquer experimento registrado.
 */
import { signal, effect, type Signal } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentType } from 'preact';
import { definicoes, ordem } from './experimentos/definicoes';
import { vistas, type Acoes, type PropsVista } from './experimentos/registro';
import { Sessao, type NomeGuardado } from './nucleo/sessao';
import { lerLink } from './nucleo/estado';
import { Icone, Menu, Torradas, avisar } from './ui/componentes';
import { carimbo, copiar, entregar, entregarTexto, mensagemEntrega, type Entrega } from './ui/exportar';
import { URL_PUBLICA, emArtefato } from './config';

const sessoes = new Map<string, Sessao<any>>();
const inicial = lerLink(location.hash);
const ativo = signal(inicial && definicoes[inicial.experimento] ? inicial.experimento : ordem[0]);
const acoes: Signal<Acoes> = signal({});
const convite: PropsVista['convite'] = signal(null);
let ultimoLink = '';

function sessaoDe(id: string): Sessao<any> {
  let s = sessoes.get(id);
  if (!s) {
    s = new Sessao(definicoes[id], inicial && inicial.experimento === id ? inicial : null);
    sessoes.set(id, s);
  }
  return s;
}

function mostrarConvite(s: Sessao<any>, id: string) {
  const p = s.def.predefinicoes.find((x) => x.id === id);
  convite.value = p ? { titulo: p.titulo, texto: p.convite } : null;
}

// link ↔ estado: o endereço sempre descreve o que está na tela
let tLink = 0;
effect(() => {
  const s = sessaoDe(ativo.value);
  void s.valores.value;
  void s.extras.value;
  void s.vista.value;
  clearTimeout(tLink);
  tLink = window.setTimeout(() => {
    // embutida num Artifact, a página só pode usar âncoras simples (#optica); o estado completo vai no link público
    const l = emArtefato() ? `#${s.def.id}` : s.link();
    if (l !== location.hash) {
      ultimoLink = l;
      try {
        history.replaceState(null, '', l);
      } catch {
        /* histórico indisponível neste visualizador */
      }
    }
  }, 250);
});
window.addEventListener('hashchange', () => {
  if (location.hash === ultimoLink) return;
  const b = lerLink(location.hash);
  if (!b || !definicoes[b.experimento]) return;
  ativo.value = b.experimento;
  const s = sessaoDe(b.experimento);
  if (Object.keys(b.parametros).length) {
    s.carregar(b);
    if (s.avisos.value.length) avisar(s.avisos.value[0].mensagem, true);
  }
});

function linkCompleto(s: Sessao<any>): string {
  return (emArtefato() ? URL_PUBLICA : location.origin + location.pathname) + s.link();
}

function dizer(r: Entrega, sucesso: string) {
  const m = mensagemEntrega(r, sucesso);
  if (m) avisar(m.texto, m.erro);
}

function Marca() {
  return (
    <div class="marca" title="Estúdio de simulações">
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
        <path d="M17.5 3.5C13 6 13 16 17.5 18.5" stroke="#dfe6ee" stroke-width="1.8" stroke-linecap="round" />
        <path d="M2.5 7h12.2L8 11l6.7 4H2.5" stroke="#ffc24a" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round" />
      </svg>
      <span>Estúdio</span>
    </div>
  );
}

function Guardados({ s }: { s: Sessao<any> }) {
  const g = s.guardados.value;
  const atual = s.guardadoAtivo.value;
  const tPress = useRef(0);
  const longo = useRef(false);
  const botao = (nome: NomeGuardado) => {
    const cheio = !!g[nome];
    return (
      <button
        type="button"
        class={`guardado${cheio ? ' cheio' : ''}${atual === nome ? ' atual' : ''}`}
        aria-label={cheio ? `Alternar para o estado ${nome}` : `Guardar o estado atual em ${nome}`}
        title={cheio ? `Estado ${nome}: toque para alternar; segure (ou Shift+clique) para regravar` : `Guardar o estado atual em ${nome}`}
        data-guardado={nome}
        onPointerDown={() => {
          longo.current = false;
          tPress.current = window.setTimeout(() => {
            longo.current = true;
            s.guardar(nome);
            avisar(`Estado atual guardado em ${nome}`);
          }, 550);
        }}
        onPointerUp={() => clearTimeout(tPress.current)}
        onPointerLeave={() => clearTimeout(tPress.current)}
        onContextMenu={(e) => e.preventDefault()}
        onClick={(e) => {
          if (longo.current) return;
          if (!cheio || e.shiftKey) {
            s.guardar(nome);
            avisar(`Estado atual guardado em ${nome}`);
          } else s.recuperar(nome);
        }}
      >
        {nome}
        {!cheio && <span class="mais">+</span>}
      </button>
    );
  };
  return (
    <div class="guardados" role="group" aria-label="Estados guardados">
      {botao('A')}
      {botao('B')}
    </div>
  );
}

function Barra({ s }: { s: Sessao<any> }) {
  const [menu, setMenu] = useState<null | 'pre' | 'comp'>(null);
  const [linkVisivel, setLinkVisivel] = useState<string | null>(null);
  const refPre = useRef<HTMLButtonElement>(null);
  const refComp = useRef<HTMLButtonElement>(null);
  const refArq = useRef<HTMLInputElement>(null);
  const fechar = () => {
    setMenu(null);
    setLinkVisivel(null);
  };
  const ac = acoes.value;

  const copiarLink = async () => {
    const l = linkCompleto(s);
    if (await copiar(l)) {
      avisar('Link copiado: ele reabre exatamente este estado');
      fechar();
    } else setLinkVisivel(l);
  };
  const imagem = async () => {
    fechar();
    if (!ac.exportarPNG) return;
    try {
      const blob = await ac.exportarPNG();
      dizer(await entregar(blob, `${s.def.id}-${carimbo()}.png`), 'Imagem salva');
    } catch (e) {
      avisar((e as Error).message, true);
    }
  };
  const estado = async () => {
    fechar();
    dizer(await entregarTexto(s.arquivo(), `${s.def.id}-${carimbo()}.estado.json`, 'application/json'), 'Estado salvo');
  };
  const abrir = async (arq: File) => {
    try {
      const texto = await arq.text();
      const exp = JSON.parse(texto)?.experimento;
      if (typeof exp === 'string' && definicoes[exp] && exp !== s.def.id) {
        ativo.value = exp;
        sessaoDe(exp).importar(texto);
      } else s.importar(texto);
      avisar('Estado aberto');
    } catch (e) {
      avisar((e as Error).message || 'Não consegui abrir esse arquivo.', true);
    }
  };

  return (
    <header class="barra">
      <Marca />
      <nav class="abas-exp" role="tablist" aria-label="Experimentos">
        {ordem.map((id) => (
          <button role="tab" aria-label={definicoes[id].titulo} aria-selected={ativo.value === id} onClick={() => {
            const novo = !sessoes.has(id);
            ativo.value = id;
            // primeira visita ao experimento nesta sessão: mostra por onde começar
            if (novo) mostrarConvite(sessaoDe(id), definicoes[id].predefinicoes[0]?.id);
            else convite.value = null;
          }}>
            <span class="t-longo">{definicoes[id].titulo}</span>
            <span class="t-curto">{definicoes[id].tituloCurto ?? definicoes[id].titulo}</span>
          </button>
        ))}
      </nav>
      <div class="espaco" />
      <button ref={refPre} class={`btn${menu === 'pre' ? ' ativo' : ''}`} onClick={() => setMenu(menu === 'pre' ? null : 'pre')} aria-haspopup="menu" title="Predefinições">
        <Icone.lista /><span class="rot so-largo">Predefinições</span>
      </button>
      <div class="sep" />
      <Guardados s={s} />
      <div class="sep" />
      <button class="btn" disabled={!s.podeDesfazer.value} onClick={() => s.desfazer()} title="Desfazer (Ctrl+Z)" aria-label="Desfazer"><Icone.desfazer /></button>
      <button class="btn so-medio" disabled={!s.podeRefazer.value} onClick={() => s.refazer()} title="Refazer (Ctrl+Shift+Z)" aria-label="Refazer"><Icone.refazer /></button>
      <button class="btn" onClick={() => { s.restaurar(); mostrarConvite(s, s.def.predefinicoes[0]?.id); }} title="Restaurar o estado inicial" aria-label="Restaurar o estado inicial"><Icone.restaurar /></button>
      <div class="sep" />
      <button ref={refComp} class={`btn contorno${menu === 'comp' ? ' ativo' : ''}`} onClick={() => setMenu(menu === 'comp' ? null : 'comp')} aria-haspopup="menu">
        <Icone.compartilhar /><span class="rot so-largo">Compartilhar</span>
      </button>
      <input ref={refArq} type="file" accept=".json,application/json" hidden onChange={(e) => {
        const f = e.currentTarget.files?.[0];
        if (f) abrir(f);
        e.currentTarget.value = '';
      }} />

      {menu === 'pre' && (
        <Menu ancora={refPre.current} onFechar={fechar}>
          <div class="rot-menu">Investigações preparadas</div>
          {s.def.predefinicoes.map((p) => (
            <button class="item" role="menuitem" onClick={() => { s.aplicarPredefinicao(p.id); mostrarConvite(s, p.id); fechar(); }}>
              {p.titulo}
              <small>{p.convite}</small>
            </button>
          ))}
        </Menu>
      )}
      {menu === 'comp' && (
        <Menu ancora={refComp.current} onFechar={fechar}>
          <button class="item" role="menuitem" onClick={copiarLink}>Copiar link deste estado<small>Reabre o experimento com os mesmos parâmetros, medidas e enquadramento{emArtefato() ? ' (no endereço público do estúdio)' : ''}.</small></button>
          {linkVisivel && <textarea readOnly value={linkVisivel} onFocus={(e) => e.currentTarget.select()} aria-label="Link deste estado" />}
          {ac.exportarPNG && <button class="item" role="menuitem" onClick={imagem}>Imagem da cena (PNG)<small>Sem alças nem painéis, com legenda dos parâmetros.</small></button>}
          {ac.dados && <hr />}
          {ac.dados && <div class="rot-menu">Dados com nomes e unidades (CSV)</div>}
          {ac.dados?.().map((d) => (
            <button class="item" role="menuitem" onClick={async () => {
              fechar();
              dizer(await entregarTexto(d.gerar(), `${s.def.id}-${d.id}-${carimbo()}.csv`, 'text/csv'), 'Dados salvos');
            }}>{d.titulo}</button>
          ))}
          <hr />
          <button class="item" role="menuitem" onClick={estado}>Salvar estado em arquivo (JSON)</button>
          <button class="item" role="menuitem" onClick={() => { fechar(); refArq.current?.click(); }}>Abrir arquivo de estado…</button>
        </Menu>
      )}
    </header>
  );
}

export function App() {
  const id = ativo.value;
  const s = sessaoDe(id);
  const [Vista, setVista] = useState<{ id: string; C: ComponentType<PropsVista> } | null>(null);
  const [falha, setFalha] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    acoes.value = {};
    vistas[id]().then(
      (m) => vivo && setVista({ id, C: m.default }),
      (e) => vivo && setFalha(String(e?.message ?? e)),
    );
    return () => {
      vivo = false;
    };
  }, [id]);

  // primeira visita sem link: mostra o convite da cena de abertura
  useEffect(() => {
    if (!inicial || !Object.keys(inicial.parametros).length) mostrarConvite(s, s.def.predefinicoes[0]?.id);
  }, []);

  useEffect(() => {
    document.title = `${s.def.titulo} — Estúdio de simulações`;
    const tecla = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      if (alvo && /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.refazer();
        else s.desfazer();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        s.refazer();
      } else if (!mod && (e.code === 'Digit1' || e.code === 'Digit2')) {
        const nome = e.code === 'Digit1' ? 'A' : 'B';
        if (e.shiftKey || !s.guardados.value[nome]) {
          s.guardar(nome);
          avisar(`Estado atual guardado em ${nome}`);
        } else s.recuperar(nome);
      }
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [s]);

  return (
    <div class="app">
      <Barra s={s} />
      {falha ? (
        <div class="aviso">Não consegui carregar o experimento: {falha}</div>
      ) : Vista && Vista.id === id ? (
        <Vista.C key={id} sessao={s} acoes={acoes} convite={convite} />
      ) : (
        <div class="exp" />
      )}
      <Torradas />
    </div>
  );
}
