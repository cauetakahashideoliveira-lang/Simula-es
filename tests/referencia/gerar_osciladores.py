#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Gerador de dados de referência — dois osciladores acoplados (solução linear exata).

Uso:  python3 tests/referencia/gerar_osciladores.py   (grava osciladores.json ao lado)

Este script NÃO lê nem importa nada do código TypeScript do projeto: parte apenas das
equações de movimento e usa aritmética de precisão arbitrária (mpmath, 60 dígitos).

Sistema (SI):  parede –k1– m1 –kc– m2 –k2– parede
    m1·x1'' = −k1·x1 − kc·(x1 − x2)
    m2·x2'' = −k2·x2 − kc·(x2 − x1)
    E = ½m1v1² + ½m2v2² + ½k1x1² + ½k2x2² + ½kc(x1−x2)²

Método principal: problema de autovalores generalizado K a = ω² M a em forma fechada
(2×2), modos normalizados como (1, r) com r = x2/x1, e superposição modal
    x(t) = Σ_j a_j [q_j cos ω_j t + (p_j/ω_j) sen ω_j t],
com q_j, p_j obtidos pela ortogonalidade em relação a M. Para kc = 0 o sistema é
desacoplado (dois osciladores simples) e as razões modais ficam null.

Verificações afirmadas (assert) antes de gravar o JSON
------------------------------------------------------
  * resíduo de (K − ω²M)a nas duas linhas e M-ortogonalidade dos modos;
  * razão modal pela 1ª linha = razão modal pela 2ª linha;
  * ω² = autovalores de M^(−1/2) K M^(−1/2) calculados por mp.eigsy (método numérico);
  * condições iniciais reproduzidas em t = 0;
  * substituição na EDO com derivação numérica (mp.diff): v = x' e m·x'' + forças = 0;
  * energia constante em todas as amostras;
  * caminho totalmente independente: estado(t) = exp(A·t)·estado(0) com a exponencial
    de matriz 4×4 (mp.expm, 100 dígitos), sem autovalores nem modos.

Convenções de saída
-------------------
  * As entradas (inclusive os instantes t) são interpretadas EXATAMENTE como os doubles
    IEEE-754 gravados no JSON (p. ex. 0.1 é o double mais próximo de 1/10).
  * Saídas arredondadas a 17 algarismos significativos; |valor| < 1e-30 vira 0.
"""
import json
import os

from mpmath import mp, mpf

mp.dps = 60

TOL = mpf(10) ** -40          # concordância entre caminhos algébricos
TOL_NUM = mpf(10) ** -30      # concordância com caminhos numéricos (diff, expm)
LIMIAR_ZERO = mpf(10) ** -30

INSTANTES = (0.0, 0.1, 0.5, 1.0, 2.5, 7.3, 20.0, 100.0, 1000.0)


def exigir(condicao, mensagem):
    """assert que não é removido por `python -O`."""
    if not condicao:
        raise AssertionError(mensagem)


def energia(p, e):
    x1, x2, v1, v2 = e
    return (p["m1"] * v1 ** 2 + p["m2"] * v2 ** 2 + p["k1"] * x1 ** 2
            + p["k2"] * x2 ** 2 + p["kc"] * (x1 - x2) ** 2) / 2


# ----------------------------------------------------------- solução modal (fechada)
def resolver(p):
    """Devolve (omega_baixa, omega_alta, r_baixa, r_alta, estado(t))."""
    m1, m2, k1, kc, k2 = p["m1"], p["m2"], p["k1"], p["kc"], p["k2"]
    x10, x20, v10, v20 = p["x1_0"], p["x2_0"], p["v1_0"], p["v2_0"]

    if kc == 0:                                   # desacoplado
        w1, w2 = mp.sqrt(k1 / m1), mp.sqrt(k2 / m2)

        def estado(t):
            c1, s1, c2, s2 = mp.cos(w1 * t), mp.sin(w1 * t), mp.cos(w2 * t), mp.sin(w2 * t)
            return (x10 * c1 + v10 / w1 * s1, x20 * c2 + v20 / w2 * s2,
                    -x10 * w1 * s1 + v10 * c1, -x20 * w2 * s2 + v20 * c2)

        return min(w1, w2), max(w1, w2), None, None, estado

    a = (k1 + kc) / m1                            # M⁻¹K = [[a, −kc/m1], [−kc/m2, d]]
    d = (k2 + kc) / m2
    b2 = kc * kc / (m1 * m2)
    lam_alta = (a + d + mp.sqrt((a - d) ** 2 + 4 * b2)) / 2
    lam_baixa = (a * d - b2) / lam_alta           # produto das raízes = det (sem cancelamento)
    modos = []
    for lam in (lam_baixa, lam_alta):
        r = (k1 + kc - lam * m1) / kc             # 1ª linha de (K − λM)a = 0, a = (1, r)
        r_linha2 = kc / (k2 + kc - lam * m2)      # 2ª linha
        exigir(abs(r - r_linha2) < TOL * max(1, abs(r)), "razões modais das duas linhas diferem")
        exigir(abs((k1 + kc - lam * m1) - kc * r) < TOL * (k1 + kc), "resíduo da 1ª linha")
        exigir(abs(-kc + (k2 + kc - lam * m2) * r) < TOL * (k2 + kc) * max(1, abs(r)),
               "resíduo da 2ª linha")
        mu = m1 + m2 * r * r                      # massa modal aᵀMa
        q = (m1 * x10 + m2 * r * x20) / mu
        qp = (m1 * v10 + m2 * r * v20) / mu
        modos.append((mp.sqrt(lam), r, q, qp))
    exigir(abs(m1 + m2 * modos[0][1] * modos[1][1]) < TOL * (m1 + m2), "modos não M-ortogonais")
    exigir(modos[0][0] < modos[1][0], "ordenação das frequências")

    def estado(t):
        x1 = x2 = v1 = v2 = mpf(0)
        for w, r, q, qp in modos:
            c, s = mp.cos(w * t), mp.sin(w * t)
            pos = q * c + qp / w * s
            vel = -q * w * s + qp * c
            x1 += pos
            x2 += r * pos
            v1 += vel
            v2 += r * vel
        return (x1, x2, v1, v2)

    return modos[0][0], modos[1][0], modos[0][1], modos[1][1], estado


# ---------------------------------------------------------------------- verificações
def verificar(p, w_b, w_a, estado, amostras, contagem):
    m1, m2, k1, kc, k2 = p["m1"], p["m2"], p["k1"], p["kc"], p["k2"]
    y0 = (p["x1_0"], p["x2_0"], p["v1_0"], p["v2_0"])
    amp = max(abs(y0[0]), abs(y0[1]), abs(y0[2]) / w_b, abs(y0[3]) / w_b)   # escala de x

    # (a) autovalores por método numérico independente da fórmula fechada
    c = -kc / mp.sqrt(m1 * m2)
    S = mp.matrix([[(k1 + kc) / m1, c], [c, (k2 + kc) / m2]])
    autoval = sorted(mp.eigsy(S, eigvals_only=True))
    exigir(abs(mp.sqrt(autoval[0]) - w_b) < TOL_NUM * w_a and
           abs(mp.sqrt(autoval[1]) - w_a) < TOL_NUM * w_a, "ω ≠ autovalores de mp.eigsy")
    contagem["eigsy"] += 1

    # (b) condições iniciais
    e0 = estado(mpf(0))
    exigir(all(abs(e0[i] - y0[i]) < TOL for i in range(4)), "condições iniciais não reproduzidas")
    E0 = energia(p, y0)

    # matriz do sistema de 1ª ordem y' = A·y, y = (x1, x2, v1, v2)
    A = mp.matrix([[0, 0, 1, 0],
                   [0, 0, 0, 1],
                   [-(k1 + kc) / m1, kc / m1, 0, 0],
                   [kc / m2, -(k2 + kc) / m2, 0, 0]])
    forca = max(k1, k2, kc) * amp

    for t, e in amostras:
        x1, x2, v1, v2 = e
        # (c) energia constante
        exigir(abs(energia(p, e) - E0) < TOL * E0, "energia não conservada")
        contagem["energia"] += 1
        # (d) substituição na EDO com derivadas numéricas
        dx1 = mp.diff(lambda s: estado(s)[0], t)
        dx2 = mp.diff(lambda s: estado(s)[1], t)
        ddx1 = mp.diff(lambda s: estado(s)[0], t, 2)
        ddx2 = mp.diff(lambda s: estado(s)[1], t, 2)
        exigir(abs(dx1 - v1) < TOL_NUM * amp * w_a and abs(dx2 - v2) < TOL_NUM * amp * w_a,
               "v ≠ dx/dt")
        exigir(abs(m1 * ddx1 + k1 * x1 + kc * (x1 - x2)) < TOL_NUM * forca and
               abs(m2 * ddx2 + k2 * x2 + kc * (x2 - x1)) < TOL_NUM * forca,
               "a solução não satisfaz a EDO")
        contagem["edo"] += 1
        # (e) exponencial de matriz (sem autovalores/modos)
        with mp.workdps(100):
            y = mp.expm(A * t) * mp.matrix(y0)
        exigir(abs(y[0] - x1) < TOL_NUM * amp and abs(y[1] - x2) < TOL_NUM * amp and
               abs(y[2] - v1) < TOL_NUM * amp * w_a and abs(y[3] - v2) < TOL_NUM * amp * w_a,
               "solução modal ≠ exp(A·t)·y0")
        contagem["expm"] += 1


# ------------------------------------------------------------------------------ casos
def casos_de_teste():
    L = []

    def novo(nota, m1, m2, k1, kc, k2, x1_0, x2_0=0.0, v1_0=0.0, v2_0=0.0):
        L.append({"nota": nota, "m1": float(m1), "m2": float(m2), "k1": float(k1),
                  "kc": float(kc), "k2": float(k2), "x1_0": float(x1_0),
                  "x2_0": float(x2_0), "v1_0": float(v1_0), "v2_0": float(v2_0)})

    novo("simétrico, desacoplado (kc=0): frequências degeneradas", 1, 1, 40, 0, 40, 0.1)
    novo("simétrico, acoplamento fraco kc=0,5 (batimentos)", 1, 1, 40, 0.5, 40, 0.1)
    novo("simétrico, acoplamento kc=4", 1, 1, 40, 4, 40, 0.1)
    novo("simétrico, acoplamento forte kc=40", 1, 1, 40, 40, 40, 0.1)
    novo("simétrico kc=4, modo em fase puro (x1=x2)", 1, 1, 40, 4, 40, 0.1, 0.1)
    novo("simétrico kc=4, modo em antifase puro (x1=−x2)", 1, 1, 40, 4, 40, 0.1, -0.1)
    novo("massas assimétricas m1=1, m2=2,5, kc=6", 1, 2.5, 40, 6, 40, 0.1)
    novo("molas assimétricas k1=30, k2=55, kc=10", 1, 1, 30, 10, 55, 0.1)
    novo("simétrico kc=4 com velocidades iniciais", 1, 1, 40, 4, 40, 0.1, 0.0, 0.3, -0.2)
    novo("massas assimétricas, posições e velocidades iniciais", 1, 2.5, 40, 6, 40,
         0.05, -0.08, 0.3, -0.2)
    novo("acoplamento rígido kc=180 (máximo da faixa)", 1, 1, 40, 180, 40, 0.1)
    novo("massas leves m1=0,2, m2=0,5", 0.2, 0.5, 40, 4, 40, 0.1)
    novo("quase degenerado, acoplamento muito fraco kc=0,05 (batimento lento)",
         1, 1, 40, 0.05, 40, 0.1)
    novo("desacoplado e assimétrico (kc=0, m2=2,5): frequências distintas", 1, 2.5, 40, 0, 40,
         0.1, 0.05, 0.0, 0.2)
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


def main():
    chaves = ("m1", "m2", "k1", "kc", "k2", "x1_0", "x2_0", "v1_0", "v2_0")
    contagem = {"eigsy": 0, "energia": 0, "edo": 0, "expm": 0}
    registros = []
    for c in casos_de_teste():
        # mpf(float) é exato: cada entrada vale exatamente o double que vai para o JSON
        p = {k: mpf(c[k]) for k in chaves}
        exigir(p["m1"] > 0 and p["m2"] > 0 and p["k1"] > 0 and p["k2"] > 0 and p["kc"] >= 0,
               "parâmetros não físicos")
        w_b, w_a, r_b, r_a, estado = resolver(p)
        amostras = [(mpf(t), estado(mpf(t))) for t in INSTANTES]
        verificar(p, w_b, w_a, estado, amostras, contagem)
        reg = {"nota": c["nota"]}
        reg.update({k: c[k] for k in chaves})
        reg.update({
            "omega_baixa": num(w_b), "omega_alta": num(w_a),
            "modo_baixa": [1.0, num(r_b)], "modo_alta": [1.0, num(r_a)],
            "energia": num(energia(p, amostras[0][1])),
            "amostras": [{"t": float(t), "x1": num(e[0]), "x2": num(e[1]),
                          "v1": num(e[2]), "v2": num(e[3])} for t, e in amostras],
        })
        registros.append(reg)

    documento = {
        "descricao": (
            "Dados de referência independentes para dois osciladores acoplados "
            "(parede–k1–m1–kc–m2–k2–parede): m1·x1''=−k1·x1−kc·(x1−x2), "
            "m2·x2''=−k2·x2−kc·(x2−x1). Solução exata por modos normais (K a = ω² M a em "
            "forma fechada) calculada por gerar_osciladores.py com mpmath (60 dígitos) e "
            "conferida por substituição na EDO, conservação de energia, mp.eigsy e "
            "exponencial de matriz; valores arredondados a 17 algarismos significativos. "
            "As entradas e os instantes t valem exatamente os doubles gravados aqui. "
            "modo_baixa/modo_alta = [1, x2/x1] do modo de menor/maior frequência; com "
            "kc=0 a razão é null."
        ),
        "unidades": {"massa": "kg", "rigidez": "N/m", "posicao": "m", "velocidade": "m/s",
                     "tempo": "s", "frequencia_angular": "rad/s", "energia": "J"},
        "casos": registros,
    }
    destino = os.path.join(os.path.dirname(os.path.abspath(__file__)), "osciladores.json")
    with open(destino, "w", encoding="utf-8") as f:
        json.dump(documento, f, ensure_ascii=False, indent=1)
        f.write("\n")

    print("osciladores.json: %d casos, %d amostras por caso" % (len(registros), len(INSTANTES)))
    print("verificações afirmadas:", ", ".join("%s=%d" % kv for kv in sorted(contagem.items())))


if __name__ == "__main__":
    main()
