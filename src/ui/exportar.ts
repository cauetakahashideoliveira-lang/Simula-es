/**
 * Saída de arquivos: imagem, dados e estado. No iPad usa a folha de
 * compartilhamento quando o navegador aceita arquivos; senão, baixa.
 */
export function carimbo(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export async function entregar(blob: Blob, nome: string): Promise<'compartilhado' | 'baixado'> {
  const arquivo = new File([blob], nome, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  const toque = matchMedia('(pointer: coarse)').matches;
  if (toque && nav.canShare?.({ files: [arquivo] })) {
    try {
      await nav.share({ files: [arquivo], title: nome });
      return 'compartilhado';
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return 'compartilhado';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'baixado';
}

export function entregarTexto(texto: string, nome: string, tipo: string) {
  return entregar(new Blob([texto], { type: `${tipo};charset=utf-8` }), nome);
}

export async function copiar(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    // contexto sem permissão de área de transferência: tenta o caminho antigo
    const t = document.createElement('textarea');
    t.value = texto;
    t.style.position = 'fixed';
    t.style.opacity = '0';
    document.body.appendChild(t);
    t.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    t.remove();
    return ok;
  }
}

export interface Coluna {
  nome: string;
  unidade: string;
  valores: ArrayLike<number | string>;
}

/**
 * CSV com ponto decimal e vírgula separadora (RFC 4180). As primeiras linhas,
 * iniciadas por #, descrevem a origem dos dados; o cabeçalho traz nome e
 * unidade de cada coluna: "h (mm)".
 */
export function csv(comentarios: string[], colunas: Coluna[]): string {
  const n = Math.max(0, ...colunas.map((c) => c.valores.length));
  const linhas: string[] = comentarios.map((c) => `# ${c}`);
  linhas.push(colunas.map((c) => aspas(c.unidade ? `${c.nome} (${c.unidade})` : c.nome)).join(','));
  for (let i = 0; i < n; i++) {
    linhas.push(
      colunas
        .map((c) => {
          const v = c.valores[i];
          if (v === undefined || v === null) return '';
          if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
          return aspas(v);
        })
        .join(','),
    );
  }
  return linhas.join('\r\n') + '\r\n';
}

function aspas(s: string): string {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function canvasParaBlob(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((ok, falha) => c.toBlob((b) => (b ? ok(b) : falha(new Error('Não foi possível gerar a imagem.'))), 'image/png'));
}
