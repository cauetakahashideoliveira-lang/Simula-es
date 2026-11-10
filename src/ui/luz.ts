/**
 * Camada de luz: acumula milhares de segmentos de raio com mistura aditiva
 * num alvo de ponto flutuante e depois aplica uma curva de tons.
 *
 * O QUE O BRILHO SIGNIFICA
 *   Cada segmento é uma faixa de largura p (px) e valor v. A soma num pixel é a
 *   densidade de raios; o chamador escolhe v = Δu·escala/p, de modo que o feixe
 *   incidente uniforme valha exatamente 1. Como a faixa tem largura constante
 *   PERPENDICULAR ao raio, um raio inclinado de θ contribui com 1/cos θ por
 *   unidade de comprimento transversal: o mapa é a densidade de energia
 *   radiante (fluência) de um feixe plano, relativa ao feixe incidente.
 *   A curva de tons é L = 1 − exp(−k·x), monotônica; a escala é mostrada na cena.
 *
 * WebGL2 com alvo RGBA16F quando disponível (acumulação linear, sem saturar);
 * sem isso, cai para Canvas 2D aditivo em 8 bits (aproximação, avisada na interface).
 */
export type ModoLuz = 'webgl2-16f' | 'canvas2d' | 'desligada';

const VS_ACUM = `#version 300 es
in vec2 a_canto;
in vec4 a_seg;
in float a_peso;
uniform vec2 u_res;
uniform float u_meia;
out float v_d;
out float v_peso;
void main() {
  vec2 p0 = a_seg.xy;
  vec2 p1 = a_seg.zw;
  vec2 dir = p1 - p0;
  float len = length(dir);
  vec2 t = len > 0.0 ? dir / len : vec2(1.0, 0.0);
  vec2 n = vec2(-t.y, t.x);
  float e = u_meia + 1.0;
  vec2 p = mix(p0, p1, a_canto.x) + n * (a_canto.y * e);
  v_d = a_canto.y * e;
  v_peso = a_peso;
  vec2 c = p / u_res * 2.0 - 1.0;
  gl_Position = vec4(c.x, -c.y, 0.0, 1.0);
}`;

const FS_ACUM = `#version 300 es
precision highp float;
in float v_d;
in float v_peso;
uniform float u_meia;
out vec4 o;
void main() {
  // cobertura com borda de 1 px: a integral transversal vale exatamente 2·u_meia
  float cov = clamp(u_meia + 0.5 - abs(v_d), 0.0, 1.0);
  o = vec4(v_peso * cov);
}`;

const VS_TOM = `#version 300 es
out vec2 v_uv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  v_uv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FS_TOM = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform float u_k;
uniform vec3 u_cor;
uniform vec3 u_quente;
out vec4 o;
void main() {
  float x = texture(u_tex, v_uv).r;
  float L = 1.0 - exp(-pow(u_k * x, 1.6));
  vec3 c = mix(vec3(1.0, 0.52, 0.10), u_cor, smoothstep(0.0, 0.4, L));
  c = mix(c, u_quente, smoothstep(0.5, 1.0, L));
  o = vec4(c * L, L);
}`;

/**
 * Curva de tons: L = 1 − exp(−(k·x)^1,6), monotônica em x (densidade relativa
 * ao feixe incidente). Com EV = 0: x = 1 → L ≈ 0,05; x = 6 → 0,61; x = 12 → 0,94.
 * O expoente abre contraste entre o feixe incidente e a cáustica sem saturar cedo.
 */
export const EXPOENTE_TOM = 1.6;
export const coefTom = (ev: number) => 0.16 * Math.pow(2, ev);
export const curvaTom = (x: number, ev: number) => 1 - Math.exp(-Math.pow(coefTom(ev) * x, EXPOENTE_TOM));

/** cor exibida para a luminância L (mesma rampa do shader), em 0–255 */
export function corTom(L: number, cor: [number, number, number], quente: [number, number, number]): [number, number, number] {
  const ss = (a: number, b: number, v: number) => {
    const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const base = [1.0, 0.52, 0.1];
  const m1 = ss(0, 0.4, L);
  const m2 = ss(0.5, 1, L);
  const out: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const c = base[i] + (cor[i] - base[i]) * m1;
    out[i] = Math.round((c + (quente[i] - c) * m2) * L * 255);
  }
  return out;
}

export function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export class CamadaLuz {
  modo: ModoLuz = 'desligada';
  /** px do buffer por px CSS */
  escala = 1;
  private gl: WebGL2RenderingContext | null = null;
  private ctx2d: CanvasRenderingContext2D | null = null;
  private progAcum: WebGLProgram | null = null;
  private progTom: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private bufInst: WebGLBuffer | null = null;
  private fbo: WebGLFramebuffer | null = null;
  private tex: WebGLTexture | null = null;
  private capInst = 0;
  private w = 0;
  private h = 0;
  private perdido = false;
  readonly cor: [number, number, number];
  readonly quente: [number, number, number];

  constructor(readonly canvas: HTMLCanvasElement, cor: string, quente: string, private aoRestaurar: () => void, forcar2d = false) {
    this.cor = hexRgb(cor);
    this.quente = hexRgb(quente);
    if (!forcar2d) {
      canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        this.perdido = true;
      });
      canvas.addEventListener('webglcontextrestored', () => {
        this.perdido = false;
        this.iniciarGL();
        this.aoRestaurar();
      });
      const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' });
      if (gl && (gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'))) {
        this.gl = gl;
        if (this.iniciarGL()) {
          this.modo = 'webgl2-16f';
          return;
        }
        this.gl = null;
      }
    }
    this.ctx2d = canvas.getContext('2d');
    this.modo = this.ctx2d ? 'canvas2d' : 'desligada';
  }

  private compilar(vs: string, fs: string): WebGLProgram | null {
    const gl = this.gl!;
    const mk = (tipo: number, src: string) => {
      const s = gl.createShader(tipo)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.warn('shader:', gl.getShaderInfoLog(s));
        return null;
      }
      return s;
    };
    const a = mk(gl.VERTEX_SHADER, vs);
    const b = mk(gl.FRAGMENT_SHADER, fs);
    if (!a || !b) return null;
    const p = gl.createProgram()!;
    gl.attachShader(p, a);
    gl.attachShader(p, b);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.warn('programa:', gl.getProgramInfoLog(p));
      return null;
    }
    return p;
  }

  private iniciarGL(): boolean {
    const gl = this.gl!;
    this.progAcum = this.compilar(VS_ACUM, FS_ACUM);
    this.progTom = this.compilar(VS_TOM, FS_TOM);
    if (!this.progAcum || !this.progTom) return false;
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, -1, 1, -1, 0, 1, 1, 1]), gl.STATIC_DRAW);
    const lc = gl.getAttribLocation(this.progAcum, 'a_canto');
    gl.enableVertexAttribArray(lc);
    gl.vertexAttribPointer(lc, 2, gl.FLOAT, false, 0, 0);
    this.bufInst = gl.createBuffer();
    this.capInst = 0;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufInst);
    const ls = gl.getAttribLocation(this.progAcum, 'a_seg');
    const lp = gl.getAttribLocation(this.progAcum, 'a_peso');
    gl.enableVertexAttribArray(ls);
    gl.vertexAttribPointer(ls, 4, gl.FLOAT, false, 20, 0);
    gl.vertexAttribDivisor(ls, 1);
    gl.enableVertexAttribArray(lp);
    gl.vertexAttribPointer(lp, 1, gl.FLOAT, false, 20, 16);
    gl.vertexAttribDivisor(lp, 1);
    gl.bindVertexArray(null);
    this.tex = null;
    this.fbo = null;
    const w = this.w;
    this.w = 0;
    if (w) return this.alocar(w, this.h);
    return true;
  }

  private alocar(w: number, h: number): boolean {
    const gl = this.gl!;
    if (this.tex) gl.deleteTexture(this.tex);
    if (this.fbo) gl.deleteFramebuffer(this.fbo);
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.w = w;
    this.h = h;
    return ok;
  }

  /** Ajusta o buffer: (wCss × escala) por (hCss × escala) pixels. */
  redimensionar(wCss: number, hCss: number, escala: number) {
    this.escala = escala;
    const w = Math.max(1, Math.round(wCss * escala));
    const h = Math.max(1, Math.round(hCss * escala));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    if (this.gl && !this.perdido && (w !== this.w || h !== this.h)) {
      if (!this.alocar(w, h)) {
        // alvo de ponto flutuante recusado neste dispositivo: usa o caminho 2D
        this.modo = 'desligada';
      }
    }
  }

  limpar() {
    if (this.gl && !this.perdido) {
      const gl = this.gl;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    } else if (this.ctx2d) {
      this.ctx2d.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  /**
   * Desenha `n` segmentos. `inst` tem 5 números por segmento, em px do buffer:
   * x0, y0, x1, y1, peso. `meia` é a meia-largura da faixa (px do buffer, ≥ 0,5);
   * `k` é o coeficiente da curva de tons.
   */
  desenhar(inst: Float32Array, n: number, meia: number, k: number) {
    if (this.gl && !this.perdido && this.modo === 'webgl2-16f') {
      const gl = this.gl;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      gl.viewport(0, 0, this.w, this.h);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (n > 0) {
        gl.useProgram(this.progAcum);
        gl.uniform2f(gl.getUniformLocation(this.progAcum!, 'u_res'), this.w, this.h);
        gl.uniform1f(gl.getUniformLocation(this.progAcum!, 'u_meia'), meia);
        gl.bindVertexArray(this.vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufInst);
        if (n > this.capInst) {
          this.capInst = Math.max(n, Math.ceil(this.capInst * 1.5), 4096);
          gl.bufferData(gl.ARRAY_BUFFER, this.capInst * 20, gl.DYNAMIC_DRAW);
        }
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, inst, 0, n * 5);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
        gl.disable(gl.BLEND);
        gl.bindVertexArray(null);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(this.progTom);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.uniform1i(gl.getUniformLocation(this.progTom!, 'u_tex'), 0);
      gl.uniform1f(gl.getUniformLocation(this.progTom!, 'u_k'), k);
      gl.uniform3f(gl.getUniformLocation(this.progTom!, 'u_cor'), this.cor[0], this.cor[1], this.cor[2]);
      gl.uniform3f(gl.getUniformLocation(this.progTom!, 'u_quente'), this.quente[0], this.quente[1], this.quente[2]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      return;
    }
    const c = this.ctx2d;
    if (!c) return;
    // aproximação em 8 bits: mistura aditiva com opacidade proporcional ao peso
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.globalCompositeOperation = 'lighter';
    c.lineWidth = 2 * meia;
    c.lineCap = 'butt';
    const [r, g, b] = this.cor;
    let i = 0;
    while (i < n) {
      const peso = inst[5 * i + 4];
      c.strokeStyle = `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${Math.max(0.004, Math.min(1, 0.8 * k * peso))})`;
      c.beginPath();
      // segmentos consecutivos de mesmo peso num único traçado
      while (i < n && inst[5 * i + 4] === peso) {
        c.moveTo(inst[5 * i], inst[5 * i + 1]);
        c.lineTo(inst[5 * i + 2], inst[5 * i + 3]);
        i++;
      }
      c.stroke();
    }
    c.globalCompositeOperation = 'source-over';
  }
}
