#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Gerador de dados de referência — reflexão geométrica em espelho cônico de revolução.

Uso:  python3 tests/referencia/gerar_optica.py      (grava optica.json ao lado deste script)

Este script NÃO lê nem importa nada do código TypeScript do projeto: parte apenas da
especificação geométrica e usa aritmética de precisão arbitrária (mpmath, 60 dígitos).

Geometria (mm e graus)
----------------------
  Superfície:  x² + y² − 2·R·z + (1+κ)·z² = 0, folha do vértice,
               z = ρ²/(R + sqrt(R² − (1+κ)ρ²)),  ρ ≤ a.
  Normal frontal (lado refletor/côncavo):  n ∝ (−x, −y, R − (1+κ)z).
  Feixe:  d = (0, −sen α, −cos α);  raio (u, v) passa por
          p0 = u·(0, cos α, −sen α) + v·(1, 0, 0).
  Traçado: primeiro encontro com a folha dentro da abertura pelo lado refletor
           (d·n < 0), reflexão r = d − 2(d·n)n, repete até não haver mais encontro.

Dois localizadores de interseção independentes
----------------------------------------------
  1) "flecha":   g(t) = z(t) − flecha(ρ(t)) é CÔNCAVA em t dentro do cilindro ρ ≤ a
                 (a flecha é convexa em (x, y) para qualquer κ com (1+κ)a² < R²).
                 Logo a classificação acerto/erro sai dos sinais de g nas pontas do
                 intervalo em que o raio está dentro do cilindro, e a raiz é obtida
                 por bisseção até a resolução da aritmética.
  2) "quádrica": raízes em forma fechada de A·t² + B·t + C = 0 (substituição do raio
                 na equação implícita), filtradas por folha, abertura e lado.
  Os dois caminhos têm de coincidir a 1e-40 em todos os pontos e direções.

Verificações afirmadas (assert) antes de gravar o JSON
------------------------------------------------------
  * concordância flecha × quádrica (pontos, direções, número de reflexões);
  * ponto sobre a cônica, na folha do vértice, dentro da abertura (com folga);
  * |n| = 1, |r| = 1, r·n = −d·n, (r − d) ∥ n;
  * invariante de obliquidade x·k_y − y·k_x conservado em toda reflexão;
  * princípio de Fermat: |A−Q| + |Q−B| estacionário em Q = ponto de reflexão, com
    derivadas numéricas sobre a superfície z = flecha(x, y) (não usa a fórmula da normal);
  * no eixo (α = 0): tan θ_i = s'(h) e cruzamento do 1º raio refletido em
    z = s(h) + h(1 − s'²)/(2s'), com s' = h/sqrt(R² − (1+κ)h²);
  * esfera no eixo: z_cross = R − R/(2 cos θ), sen θ = h/R (uma reflexão) e, em geral,
    sequência angular fechada φ_k = (2k−1)θ − (k−1)π para as reflexões múltiplas;
  * paraboloide no eixo: o raio de saída passa exatamente pelo foco (0, 0, R/2);
  * folgas: nenhum caso a menos de 1e-3 mm da borda da abertura, rasante, com o plano
    de detecção encostado num ponto de reflexão ou atravessando o verso do espelho.

Convenções de saída
-------------------
  * As entradas são interpretadas EXATAMENTE como os doubles IEEE-754 gravados no JSON
    (p. ex. u = 0.001 é o double mais próximo de 1/1000), pois é isso que o código
    testado recebe.
  * Saídas arredondadas a 17 algarismos significativos; |valor| < 1e-30 vira 0.
  * "miss": bounces = 0 e P1, n1, theta_i_deg, dir_out, P_last, z_cross, screen = null.
"""
import json
import os

from mpmath import mp, mpf

mp.dps = 60

TOL = mpf(10) ** -40          # concordância entre caminhos de cálculo independentes
TOL_DERIV = mpf(10) ** -30    # verificações que usam derivação numérica (Fermat)
MARGEM = mpf(10) ** -3        # folga mínima em mm (a especificação pede > 1e-6)
LIMIAR_ZERO = mpf(10) ** -30  # abaixo disto o valor exato é zero
PEQUENO = mpf(10) ** -50


def exigir(condicao, mensagem):
    """assert que não é removido por `python -O`."""
    if not condicao:
        raise AssertionError(mensagem)


# --------------------------------------------------------------------------- vetores
def soma(a, b):
    return tuple(x + y for x, y in zip(a, b))


def sub(a, b):
    return tuple(x - y for x, y in zip(a, b))


def vezes(k, a):
    return tuple(k * x for x in a)


def escalar(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def vetorial(a, b):
    return (a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0])


def norma(a):
    return mp.sqrt(escalar(a, a))


def unitario(a):
    return vezes(1 / norma(a), a)


def dist_ponto_reta(Q, P, r):
    """Distância do ponto Q à reta P + t·r (r unitário)."""
    return norma(vetorial(sub(Q, P), r))


# ------------------------------------------------------------------------ superfície
def flecha(rho2, R, kappa):
    return rho2 / (R + mp.sqrt(R * R - (1 + kappa) * rho2))


def normal_frontal(P, R, kappa):
    return unitario((-P[0], -P[1], R - (1 + kappa) * P[2]))


# ------------------------------------------------ localizador 1: flecha + bisseção
def bissecao(g, lo, hi):
    """Raiz de g em [lo, hi] com g(lo) > 0 > g(hi), até a resolução da aritmética."""
    exigir(g(lo) > 0 > g(hi), "bisseção: intervalo sem troca de sinal")
    for _ in range(2000):
        meio = (lo + hi) / 2
        if meio == lo or meio == hi:
            return meio
        if g(meio) > 0:
            lo = meio
        else:
            hi = meio
    raise AssertionError("bisseção não convergiu")


def maximo_concava(g, lo, hi):
    """Máximo de uma função côncava em [lo, hi] (busca ternária)."""
    for _ in range(400):
        m1 = lo + (hi - lo) / 3
        m2 = hi - (hi - lo) / 3
        if g(m1) < g(m2):
            lo = m1
        else:
            hi = m2
    return g((lo + hi) / 2)


def impacto_por_flecha(p, d, R, kappa, a, primeiro):
    """Parâmetro t do próximo impacto refletor de p + t·d, ou None.

    primeiro=True : o raio vem de t → −∞ (qualquer t real é candidato).
    primeiro=False: p está sobre o espelho e d aponta para a frente dele (t > 0).
    """
    def g(t):
        x = p[0] + t * d[0]
        y = p[1] + t * d[1]
        return p[2] + t * d[2] - flecha(x * x + y * y, R, kappa)

    At = d[0] ** 2 + d[1] ** 2
    Bt = 2 * (p[0] * d[0] + p[1] * d[1])
    rho0_2 = p[0] ** 2 + p[1] ** 2

    if At < PEQUENO:                      # raio paralelo ao eixo: ρ constante
        rho = mp.sqrt(rho0_2)
        exigir(abs(rho - a) > MARGEM, "raio axial encostado na borda da abertura")
        if rho > a or not primeiro:       # (após reflexão g(t) = t·d_z não volta a zero)
            return None
        return (flecha(rho0_2, R, kappa) - p[2]) / d[2]

    rho_min = mp.sqrt(max(mpf(0), rho0_2 - Bt * Bt / (4 * At)))
    exigir(abs(rho_min - a) > MARGEM, "raio tangente ao cilindro da abertura")
    if rho_min > a:
        return None                       # nunca entra no cilindro ρ ≤ a
    raiz = mp.sqrt(Bt * Bt - 4 * At * (rho0_2 - a * a))
    t_ent = (-Bt - raiz) / (2 * At)
    t_sai = (-Bt + raiz) / (2 * At)

    if primeiro:
        g_ent, g_sai = g(t_ent), g(t_sai)
        exigir(abs(g_ent) > MARGEM and abs(g_sai) > MARGEM,
               "raio passa a menos de 1e-3 mm da borda do espelho")
        if g_ent > 0 and g_sai < 0:       # entra pela frente, sai por trás: 1 raiz
            return bissecao(g, t_ent, t_sai)
        if g_ent > 0 and g_sai > 0:       # côncava e positiva nas pontas: sem raiz
            return None
        # entra no cilindro já atrás do espelho
        exigir(g_sai < 0 and maximo_concava(g, t_ent, t_sai) < -MARGEM,
               "caso ambíguo: o raio atravessaria o verso do espelho")
        return None

    exigir(t_ent < 0 < t_sai, "ponto de partida fora da abertura")
    g_sai = g(t_sai)
    exigir(abs(g_sai) > MARGEM, "novo impacto marginal na borda")
    if g_sai > 0:                         # g(0)=0, g'(0)>0, côncava e g(t_sai)>0
        return None
    lo = t_sai
    for _ in range(600):
        lo = lo / 2
        if g(lo) > 0:
            return bissecao(g, lo, t_sai)
    raise AssertionError("não foi possível isolar o novo impacto")


# --------------------------------------- localizador 2: quádrica em forma fechada
def impacto_por_quadrica(p, d, R, kappa, a, primeiro):
    q = 1 + kappa
    A = d[0] ** 2 + d[1] ** 2 + q * d[2] ** 2
    B = 2 * (p[0] * d[0] + p[1] * d[1] + (q * p[2] - R) * d[2])
    C = p[0] ** 2 + p[1] ** 2 - 2 * R * p[2] + q * p[2] ** 2
    candidatos = []
    if primeiro:
        if abs(A) < PEQUENO:
            if abs(B) > PEQUENO:
                candidatos.append(-C / B)
        else:
            disc = B * B - 4 * A * C
            if disc > 0:
                rq = mp.sqrt(disc)
                candidatos += [(-B - rq) / (2 * A), (-B + rq) / (2 * A)]
    else:
        # C = 0 (p está na superfície): raízes t = 0 e t = −B/A
        exigir(abs(C) < TOL * R * R, "ponto de partida fora da quádrica")
        if abs(A) > PEQUENO and -B / A > 0:
            candidatos.append(-B / A)
    for t in sorted(candidatos):
        P = soma(p, vezes(t, d))
        if R - q * P[2] <= 0:             # outra folha da quádrica
            continue
        if P[0] ** 2 + P[1] ** 2 > a * a:  # fora da abertura
            continue
        exigir(escalar(d, normal_frontal(P, R, kappa)) < 0,
               "caso ambíguo: encontro pelo verso do espelho")
        return t
    return None


# --------------------------------------------------------------------------- traçado
def tracar(R, kappa, a, alfa_graus, u, v, localizar):
    alfa = mp.radians(alfa_graus)
    s, c = mp.sin(alfa), mp.cos(alfa)
    d = (mpf(0), -s, -c)
    p = (v, u * c, -u * s)
    p0 = p
    pontos, normais, direcoes = [], [], [d]
    primeiro = True
    while True:
        t = localizar(p, d, R, kappa, a, primeiro)
        if t is None:
            break
        P = soma(p, vezes(t, d))
        n = normal_frontal(P, R, kappa)
        dn = escalar(d, n)
        exigir(dn < -MARGEM, "incidência rasante ou pelo verso")
        exigir(a - mp.sqrt(P[0] ** 2 + P[1] ** 2) > MARGEM, "impacto encostado na borda")
        r = sub(d, vezes(2 * dn, n))      # lei vetorial da reflexão
        pontos.append(P)
        normais.append(n)
        direcoes.append(r)
        p, d, primeiro = P, r, False
        exigir(len(pontos) < 40, "reflexões demais")
    return {"p0": p0, "pontos": pontos, "normais": normais, "direcoes": direcoes}


def saidas(tr, v, z_s):
    pts, nrm, dirs = tr["pontos"], tr["normais"], tr["direcoes"]
    if not pts:
        return {"status": "miss", "bounces": 0, "P1": None, "n1": None,
                "theta_i_deg": None, "dir_out": None, "P_last": None,
                "z_cross": None, "screen": None}
    menos_d = vezes(-1, dirs[0])
    theta = mp.degrees(mp.atan2(norma(vetorial(menos_d, nrm[0])), escalar(menos_d, nrm[0])))

    P, r = pts[-1], dirs[-1]
    z_cross = None
    if v == 0:                            # raio meridional (plano x = 0)
        exigir(P[0] == 0 and r[0] == 0, "raio meridional saiu do plano x = 0")
        exigir(abs(r[1]) > mpf(10) ** -9, "raio de saída paralelo ao eixo: z_cross ambíguo")
        t = -P[1] / r[1]
        exigir(abs(t) > MARGEM, "último ponto de reflexão sobre o eixo: z_cross ambíguo")
        if t > 0:
            z_cross = P[2] + t * r[2]

    tela = None
    for k, P in enumerate(pts):
        r = dirs[k + 1]
        exigir(abs(P[2] - z_s) > MARGEM, "plano de detecção encostado num ponto de reflexão")
        exigir(abs(r[2]) > mpf(10) ** -9, "trecho refletido paralelo ao plano de detecção")
        t = (z_s - P[2]) / r[2]
        if t <= 0:
            continue
        if k + 1 < len(pts) and t >= norma(sub(pts[k + 1], P)):
            continue                      # o trecho termina no próximo impacto antes do plano
        tela = (P[0] + t * r[0], P[1] + t * r[1])
        break

    return {"status": "hit", "bounces": len(pts), "P1": pts[0], "n1": nrm[0],
            "theta_i_deg": theta, "dir_out": dirs[-1], "P_last": pts[-1],
            "z_cross": z_cross, "screen": tela}


# ---------------------------------------------------------------------- verificações
def sequencia_esfera(R, a, u, v):
    """Reflexões sucessivas de um raio paralelo ao eixo numa esfera, por ângulos.

    Ponto k em P_k = (R sen φ_k)·ê + (R − R cos φ_k)·ẑ, com φ_k = (2k−1)θ − (k−1)π,
    sen θ = h/R e ê o versor radial do raio incidente. Devolve [(P, valido), ...];
    o último elemento é o primeiro ponto que já não pertence ao espelho.
    """
    h = mp.sqrt(u * u + v * v)
    ex, ey = v / h, u / h
    theta = mp.asin(h / R)
    lista = []
    k = 1
    while True:
        phi = (2 * k - 1) * theta - (k - 1) * mp.pi
        s = R * mp.sin(phi)
        z = R - R * mp.cos(phi)
        valido = mp.cos(phi) > 0 and abs(s) < a
        lista.append(((s * ex, s * ey, z), s, valido))
        if not valido:
            return theta, lista
        k += 1
        exigir(k < 40, "sequência angular longa demais")


def verificar(c, tr, tr2, out, contagem):
    R, kappa, a, alfa, u, v = c["R"], c["kappa"], c["a"], c["alpha_deg"], c["u"], c["v"]
    pts, nrm, dirs = tr["pontos"], tr["normais"], tr["direcoes"]
    escala = R

    # (1) flecha × quádrica
    exigir(len(pts) == len(tr2["pontos"]), "localizadores discordam no nº de reflexões")
    for P, Q in zip(pts, tr2["pontos"]):
        exigir(norma(sub(P, Q)) < TOL * escala, "localizadores discordam no ponto")
    for r, s in zip(dirs, tr2["direcoes"]):
        exigir(norma(sub(r, s)) < TOL, "localizadores discordam na direção")
    contagem["flecha_x_quadrica"] += 1

    h0 = tr["p0"][0] * dirs[0][1] - tr["p0"][1] * dirs[0][0]
    for k, P in enumerate(pts):
        d, n, r = dirs[k], nrm[k], dirs[k + 1]
        rho2 = P[0] ** 2 + P[1] ** 2
        # (2) ponto na superfície
        exigir(abs(rho2 - 2 * R * P[2] + (1 + kappa) * P[2] ** 2) < TOL * escala ** 2,
               "ponto fora da cônica")
        exigir(abs(P[2] - flecha(rho2, R, kappa)) < TOL * escala, "ponto fora da folha do vértice")
        exigir(R - (1 + kappa) * P[2] > 0 and rho2 < a * a, "ponto fora do espelho")
        # (3) lei da reflexão
        exigir(abs(norma(n) - 1) < TOL and abs(norma(r) - 1) < TOL, "vetor não unitário")
        exigir(abs(escalar(r, n) + escalar(d, n)) < TOL, "ângulo de reflexão ≠ incidência")
        exigir(norma(vetorial(sub(r, d), n)) < TOL, "r − d não é paralelo à normal")
        # (4) invariante de obliquidade
        exigir(abs(P[0] * r[1] - P[1] * r[0] - h0) < TOL * escala, "invariante de obliquidade violado")
        contagem["invariante_obliquidade"] += 1
        # (5) Fermat (independente da fórmula da normal)
        A = sub(P, vezes(R / 3, d))
        B = soma(P, vezes(R / 2, r))

        def caminho(x, y, A=A, B=B):
            Q = (x, y, flecha(x * x + y * y, R, kappa))
            return norma(sub(Q, A)) + norma(sub(B, Q))

        gx = mp.diff(caminho, (P[0], P[1]), (1, 0))
        gy = mp.diff(caminho, (P[0], P[1]), (0, 1))
        exigir(abs(gx) < TOL_DERIV and abs(gy) < TOL_DERIV, "caminho óptico não estacionário")
        contagem["fermat"] += 1

    if alfa != 0 or not pts:
        return

    # (6) fórmulas clássicas no eixo
    h = mp.sqrt(u * u + v * v)
    sl = h / mp.sqrt(R * R - (1 + kappa) * h * h)          # s'(h) = tan θ_i
    exigir(abs(mp.radians(out["theta_i_deg"]) - mp.atan(sl)) < TOL, "θ_i ≠ atan s'(h)")
    zc = flecha(h * h, R, kappa) + h * (1 - sl * sl) / (2 * sl)
    exigir(dist_ponto_reta((mpf(0), mpf(0), zc), pts[0], dirs[1]) < TOL * escala,
           "1º raio refletido não cruza o eixo em s + h(1−s'²)/(2s')")
    if len(pts) == 1 and v == 0:
        exigir(out["z_cross"] is not None and abs(out["z_cross"] - zc) < TOL * escala,
               "z_cross ≠ fórmula geral no eixo")
    contagem["formula_geral_no_eixo"] += 1

    if kappa == -1:                                        # paraboloide: foco exato
        foco = (mpf(0), mpf(0), R / 2)
        exigir(len(pts) == 1, "paraboloide no eixo deveria refletir uma única vez")
        exigir(abs(zc - R / 2) < TOL * escala, "fórmula geral ≠ R/2 no paraboloide")
        exigir(dist_ponto_reta(foco, pts[-1], dirs[-1]) < TOL * escala, "raio não passa pelo foco")
        if v == 0:
            exigir(abs(out["z_cross"] - R / 2) < TOL * escala, "z_cross ≠ R/2 no paraboloide")
        contagem["paraboloide_foco"] += 1

    if kappa == 0:                                         # esfera: solução angular fechada
        theta, seq = sequencia_esfera(R, a, u, v)
        exigir(abs(out["theta_i_deg"] - mp.degrees(theta)) < TOL * 100, "θ_i ≠ asen(h/R)")
        exigir(len(seq) - 1 == len(pts), "nº de reflexões ≠ sequência angular da esfera")
        for (Q, _, _), P in zip(seq, pts):
            exigir(norma(sub(P, Q)) < TOL * escala, "ponto ≠ sequência angular da esfera")
        (PN, sN, _), (PV, sV, _) = seq[-2], seq[-1]
        tau = sN / (sN - sV)                               # corda final: P_N → ponto virtual
        z_corda = PN[2] + tau * (PV[2] - PN[2]) if tau > 0 else None
        if len(pts) == 1:
            z_classico = R - R / (2 * mp.cos(theta))
            exigir(z_corda is not None and abs(z_corda - z_classico) < TOL * escala,
                   "corda ≠ R − R/(2cos θ)")
            exigir(dist_ponto_reta((mpf(0), mpf(0), z_classico), pts[0], dirs[1]) < TOL * escala,
                   "raio de saída não cruza o eixo em R − R/(2cos θ)")
            if v == 0:
                exigir(abs(out["z_cross"] - z_classico) < TOL * escala,
                       "z_cross ≠ R − R/(2cos θ)")
        if v == 0:
            if z_corda is None:
                exigir(out["z_cross"] is None, "z_cross deveria ser null (corda final)")
            else:
                exigir(out["z_cross"] is not None and
                       abs(out["z_cross"] - z_corda) < TOL * max(escala, abs(z_corda)),
                       "z_cross ≠ cruzamento da corda final")
        contagem["esfera_angular"] += 1


# ------------------------------------------------------------------------------ casos
def casos_de_teste():
    L = []

    def novo(R, kappa, a, alfa, u, v, z_s, nota):
        L.append({"R": float(R), "kappa": float(kappa), "a": float(a),
                  "alpha_deg": float(alfa), "u": float(u), "v": float(v),
                  "z_s": float(z_s), "nota": nota})

    # A — esfera, no eixo, abertura moderada
    for u in (0.001, 0.4, 4, 20, 60, 100, 140, -60, -140):
        novo(400, 0, 150, 0, u, 0, 200,
             "esfera R=400 a=150, no eixo, anteparo no foco paraxial (aberração esférica)")

    # B — esfera, no eixo, abertura muito grande (reflexões múltiplas)
    for u in (300, 340, 350, 365, 375):
        novo(400, 0, 380, 0, u, 0, 150,
             "esfera R=400 a=380, no eixo, grande abertura (reflexões múltiplas)")

    # C — paraboloide, no eixo
    for u in (0.001, 20, 100, 140, 300, 375):
        novo(400, -1, 150, 0, u, 0, 200,
             "paraboloide R=400 a=150, no eixo, anteparo no foco" +
             (" (fora da abertura: erro)" if abs(u) > 150 else ""))
    for u in (0.001, 20, 100, 140, 300, 375):
        novo(400, -1, 380, 0, u, 0, 190,
             "paraboloide R=400 a=380, no eixo, anteparo 10 mm antes do foco")

    # D — feixe inclinado, raios meridionais
    for kappa, nome in ((0, "esfera"), (-1, "paraboloide")):
        for alfa, us in ((2, (-70, 98, 104)),
                         (10, (-100.2, -20, 60, 99)),
                         (-5, (-110, 10, 90))):
            for u in us:
                novo(400, kappa, 100, alfa, u, 0, 200,
                     "%s R=400 a=100, feixe inclinado, raio meridional" % nome)

    # E — raios oblíquos (3-D)
    for kappa, nome in ((0, "esfera"), (-1, "paraboloide")):
        for alfa, u, v, z_s in ((0, 30, 40, 200), (0, 60, -60, 195),
                                (3, -50, 20, 200), (3, 0, 90, 195),
                                (8, 30, 40, 200), (8, -50, 20, 195),
                                (8, 0, 90, 200), (8, 60, -60, 195)):
            novo(400, kappa, 100, alfa, u, v, z_s,
                 "%s R=400 a=100, raio oblíquo 3-D (v≠0)" % nome)
    novo(400, 0, 100, 3, 80, 80, 200,
         "esfera R=400 a=100, raio oblíquo 3-D fora da abertura (erro)")

    # F — outras cônicas
    for kappa, nome in ((-0.5, "elipsoide prolato κ=−0,5"),
                        (-2, "hiperboloide κ=−2"),
                        (0.3, "elipsoide oblato κ=+0,3")):
        novo(400, kappa, 120, 0, 50, 0, 200, nome + ", no eixo")
        novo(400, kappa, 120, 0, 110, 0, 200, nome + ", no eixo, zona marginal")
        novo(400, kappa, 120, 4, -90, 0, 200, nome + ", feixe a 4°, meridional")
        novo(400, kappa, 120, 4, 40, 70, 200, nome + ", feixe a 4°, oblíquo 3-D")

    # G — outras escalas
    for u in (0.5, 2.9):
        novo(10, 0, 3, 0, u, 0, 5, "esfera pequena R=10 a=3, no eixo")
    for u in (0.5, 2.9):
        novo(10, -1, 3, 0, u, 0, 4.9, "paraboloide pequeno R=10 a=3, no eixo")
    for u in (50, 390):
        novo(5000, 0, 400, 0, u, 0, 2500, "esfera grande R=5000 a=400, no eixo")
    for u in (50, 390):
        novo(5000, -1, 400, 0, u, 0, 2480, "paraboloide grande R=5000 a=400, no eixo")

    # H — anteparo nunca alcançado e erros de abertura
    novo(400, 0, 150, 0, 60, 0, -10, "esfera: anteparo atrás do vértice (z_s<0), nunca alcançado")
    novo(400, 0, 150, 0, 140, 0, 10,
         "esfera: anteparo abaixo do ponto de incidência, raio refletido se afasta")
    novo(400, -1, 150, 0, 100, 0, -50, "paraboloide: anteparo atrás do vértice, nunca alcançado")
    novo(400, 0, 380, 0, 300, 0, 50,
         "esfera a=380: duas reflexões, anteparo abaixo de ambos os pontos, nunca alcançado")
    novo(400, -1, 100, 10, 60, 0, 1,
         "paraboloide, feixe a 10°: anteparo abaixo do ponto de incidência, nunca alcançado")
    novo(400, 0, 150, 0, 160, 0, 200, "esfera: raio fora da abertura (|u|>a), erro")
    novo(400, 0, 150, 0, -120, 100, 200, "esfera: raio 3-D fora da abertura (ρ>a), erro")
    return L


# ------------------------------------------------------------------------------ saída
def num(x):
    """mpf → double via arredondamento a 17 algarismos significativos."""
    if x is None:
        return None
    x = mpf(x)
    if abs(x) < LIMIAR_ZERO:
        return 0.0
    return float(mp.nstr(x, 17))


def vet(a):
    return None if a is None else [num(x) for x in a]


def main():
    casos = casos_de_teste()
    contagem = {"flecha_x_quadrica": 0, "invariante_obliquidade": 0, "fermat": 0,
                "formula_geral_no_eixo": 0, "paraboloide_foco": 0, "esfera_angular": 0}
    registros = []
    for c in casos:
        # mpf(float) é exato: cada entrada vale exatamente o double que vai para o JSON
        m = {k: mpf(c[k]) for k in ("R", "kappa", "a", "alpha_deg", "u", "v", "z_s")}
        exigir((1 + m["kappa"]) * m["a"] ** 2 < m["R"] ** 2, "abertura maior que a folha")
        tr = tracar(m["R"], m["kappa"], m["a"], m["alpha_deg"], m["u"], m["v"], impacto_por_flecha)
        tr2 = tracar(m["R"], m["kappa"], m["a"], m["alpha_deg"], m["u"], m["v"], impacto_por_quadrica)
        out = saidas(tr, m["v"], m["z_s"])
        verificar(m, tr, tr2, out, contagem)
        registros.append({
            "nota": c["nota"],
            "R": c["R"], "kappa": c["kappa"], "a": c["a"], "alpha_deg": c["alpha_deg"],
            "u": c["u"], "v": c["v"], "z_s": c["z_s"],
            "status": out["status"], "bounces": out["bounces"],
            "P1": vet(out["P1"]), "n1": vet(out["n1"]),
            "theta_i_deg": num(out["theta_i_deg"]),
            "dir_out": vet(out["dir_out"]), "P_last": vet(out["P_last"]),
            "z_cross": num(out["z_cross"]), "screen": vet(out["screen"]),
        })

    exigir(60 <= len(registros) <= 90, "número de casos fora do intervalo previsto")
    documento = {
        "descricao": (
            "Dados de referência independentes para reflexão geométrica em espelho cônico "
            "de revolução x²+y²−2Rz+(1+κ)z²=0 (folha do vértice, abertura ρ≤a, +z para a "
            "frente). Feixe colimado d=(0,−sen α,−cos α); raio (u,v) passa por "
            "p0=u·(0,cos α,−sen α)+v·(1,0,0). Gerado por gerar_optica.py com mpmath "
            "(60 dígitos), dois localizadores de interseção independentes e verificações "
            "analíticas; valores arredondados a 17 algarismos significativos. As entradas "
            "valem exatamente os doubles gravados aqui. Em 'miss': bounces=0 e demais "
            "saídas null. z_cross só para v=0 (raio final cruzando y=0 com t>0). screen: "
            "primeiro cruzamento de um trecho refletido com o plano z=z_s."
        ),
        "unidades": {"comprimento": "mm", "angulo": "grau"},
        "casos": registros,
    }
    destino = os.path.join(os.path.dirname(os.path.abspath(__file__)), "optica.json")
    with open(destino, "w", encoding="utf-8") as f:
        json.dump(documento, f, ensure_ascii=False, indent=1)
        f.write("\n")

    acertos = sum(1 for r in registros if r["status"] == "hit")
    multiplos = sum(1 for r in registros if r["bounces"] > 1)
    print("optica.json: %d casos (%d acertos, %d erros, %d com reflexões múltiplas)"
          % (len(registros), acertos, len(registros) - acertos, multiplos))
    print("verificações afirmadas:", ", ".join("%s=%d" % kv for kv in sorted(contagem.items())))


if __name__ == "__main__":
    main()
