"""Comodidad del terreno por sitio (2026-11-07): campo opcional `terreno` de sitios.json (versión 5).

Alexander no quiere zonas de «monte para arriba, monte para abajo sin parar». Se mide cuánto sube y baja el terreno
donde se busca, con el MDT25 del IGN (el mismo de mdt_campo.py, cotas enteras a 25 m), siguiendo la §4 de
docs/investigacion/2026-11-07-navegador-wikiloc-vs-campo.md. La etiqueta y el factor del ranking los pone la app
(app/src/comodidad.ts); aquí solo los números.

Entorno de búsqueda: círculo de RADIO_M (300 m) alrededor del punto del sitio (centro de su celda de 100 m). Se cruza
por todas sus filas y columnas de 25 m y por sus dos familias de diagonales (35,4 m por paso): son los recorridos en
línea recta N–S, E–O, NE–SO y NO–SE que caben en el círculo. Sobre ellos:
  1. desnivel_km      = (subida + bajada) / km recorridos, con histéresis de UMBRAL_M (4 m, la misma que
                        app/src/grabacion.ts aplica al track del GPS: así se puede comparar con las salidas reales;
                        además quita el escalón de 1 m de las cotas enteras). La bajada cuenta: cansa y obliga a
                        volver a subir.
  2. pendiente_media  = 100 · Σ|Δz| / Σ paso (%), paso a paso sin histéresis. La zona se cruza en los dos sentidos, así
                        que la pendiente media de subida y la de bajada son la misma.
  3. pendiente_max    = percentil PERCENTIL_MAX (90) de la pendiente medida sobre BASE_PASOS pasos (50 m en filas y
                        columnas, 71 m en diagonal): la «máxima sostenida» sin que un solo tajo de 25 m la decida.
  4. esfuerzo         = tiempo de Tobler (6·e^(−3,5·|s+0,05|) km/h, el de acceso.py) en los dos sentidos ÷ tiempo de
                        la misma distancia en llano. 1,00 = llano; 1,30 = un 30 % más de tiempo por el terreno.
Acceso a pie: si el sitio tiene camino en acceso.bin (dirección hacia el aparcamiento, la misma traza que dibuja la
app en «Ruta a pie»), se muestrea el MDT25 cada 25 m a lo largo de los centros de sus celdas de 100 m y se guarda
acceso_desnivel_km con la misma histéresis. Solo si el camino mide ≥ ACCESO_MIN_M (con menos, m/km no dice nada).
Es informativo: el acceso ya lo juzga la dificultad (tiempo y subida, app/src/ruta.ts) y no se suma al factor.
Sin cotas en el entorno (mar, fuera del MDT) o con menos de MIN_FRAC de celdas con dato: sin campo `terreno`.
Umbrales por región (2026-11-07, decisión de Alexander): con 40/80 m/km fijos el 95 % de los sitios salía «quebrado».
La comodidad es relativa a la zona: `terreno_umbrales` de sitios.json guarda los terciles (p33 y p67, redondeados a
5 m/km) del desnivel_km de los sitios de la región, contando cada sitio una vez aunque salga en varias especies. La app
(app/src/comodidad.ts) llama «cómodo» al tercio más llano, «quebrado» al más movido y «algo de sube y baja» al medio.
"""
from __future__ import annotations
import math
from pathlib import Path
import numpy as np

RADIO_M = 300.0
RES_M = 25.0
UMBRAL_M = 4.0          # histéresis del desnivel (grabacion.ts UMBRAL_DESNIVEL_M)
BASE_PASOS = 2          # pendiente sostenida sobre 2 pasos (50 m)
PERCENTIL_MAX = 90
ACCESO_MIN_M = 300.0
PASO_UMBRAL = 5         # los umbrales de la región se redondean a 5 m/km
MIN_FRAC = 0.5          # fracción mínima de celdas del círculo con cota


# ---------------------------------------------------------------- lógica pura

def tobler_kmh(pendiente):
    """Velocidad a pie (km/h) con la función de Tobler (como acceso.tobler_kmh); pendiente = dz/dx con signo."""
    return 6.0 * np.exp(-3.5 * np.abs(np.asarray(pendiente, dtype=np.float64) + 0.05))


def desnivel_serie(z: np.ndarray, umbral: float = UMBRAL_M) -> tuple[float, float]:
    """(subida, bajada) en m con histéresis: solo cuenta un cambio cuando acumula ≥ umbral. NaN se salta."""
    ref = None
    sub = baj = 0.0
    for a in np.asarray(z, dtype=np.float64):
        if not math.isfinite(a):
            continue
        if ref is None:
            ref = a
        elif a - ref >= umbral:
            sub += a - ref; ref = a
        elif ref - a >= umbral:
            baj += ref - a; ref = a
    return sub, baj


def _tramos(z: np.ndarray):
    """Trozos consecutivos con dato (≥ 2 cotas) de una línea con NaN."""
    ok = np.isfinite(z)
    if not ok.any():
        return
    cortes = np.flatnonzero(np.diff(ok.astype(np.int8)))
    inicios = np.r_[0, cortes + 1]
    finales = np.r_[cortes + 1, z.size]
    for a, b in zip(inicios, finales):
        if ok[a] and b - a >= 2:
            yield z[a:b]


def metricas(lineas: list[tuple[np.ndarray, float]]) -> dict | None:
    """Los cuatro números (sin redondear) sobre recorridos [(cotas, paso_m)]; None si no hay ningún paso con dato."""
    dist = sub = baj = suma_abs = t = 0.0
    pend_base = []
    v0 = float(tobler_kmh(0.0))
    for z, paso in lineas:
        for tr in _tramos(np.asarray(z, dtype=np.float64)):
            s_, b_ = desnivel_serie(tr)
            sub += s_; baj += b_
            dz = np.diff(tr)
            dist += dz.size * paso
            suma_abs += float(np.abs(dz).sum())
            s = dz / paso
            t += float((paso / tobler_kmh(s)).sum() + (paso / tobler_kmh(-s)).sum()) / 2
            if tr.size > BASE_PASOS:
                pend_base.append(np.abs(tr[BASE_PASOS:] - tr[:-BASE_PASOS]) / (BASE_PASOS * paso))
    if dist <= 0:
        return None
    pmax = float(np.percentile(np.concatenate(pend_base), PERCENTIL_MAX)) * 100 if pend_base else suma_abs / dist * 100
    return {"desnivel_km": (sub + baj) / (dist / 1000), "pendiente_media": 100 * suma_abs / dist,
            "pendiente_max": pmax, "esfuerzo": t / (dist / v0), "distancia_m": dist}


def lineas_entorno(z: np.ndarray, fila25: float, col25: float, radio_celdas: float = RADIO_M / RES_M):
    """Filas, columnas y diagonales de la rejilla `z` (25 m) dentro del círculo de centro (fila25, col25) en
    coordenadas de esquina (el centro de la celda i está en i + 0,5) y radio `radio_celdas`. → [(cotas, paso_m)]."""
    r = int(math.ceil(radio_celdas)) + 1
    f0, c0 = int(math.floor(fila25)) - r, int(math.floor(col25)) - r
    f1, c1 = f0 + 2 * r + 1, c0 + 2 * r + 1
    H, W = z.shape
    ff0, cc0, ff1, cc1 = max(f0, 0), max(c0, 0), min(f1, H), min(c1, W)
    if ff0 >= ff1 or cc0 >= cc1:
        return []
    ven = z[ff0:ff1, cc0:cc1].astype(np.float64)
    yy, xx = np.mgrid[ff0:ff1, cc0:cc1]
    dentro = (yy + 0.5 - fila25) ** 2 + (xx + 0.5 - col25) ** 2 <= radio_celdas ** 2
    ven = np.where(dentro, ven, np.nan)
    res = []
    for m in (ven, ven.T):                       # filas y columnas
        for l in m:
            l = l[np.isfinite(l) | _entre_datos(l)]
            if l.size >= 2:
                res.append((l, RES_M))
    for m in (ven, np.fliplr(ven)):              # las dos familias de diagonales
        for k in range(-m.shape[0] + 2, m.shape[1] - 1):
            l = np.diagonal(m, k)
            l = l[np.isfinite(l) | _entre_datos(l)]
            if l.size >= 2:
                res.append((l, RES_M * math.sqrt(2)))
    return res


def _entre_datos(l: np.ndarray) -> np.ndarray:
    """Máscara de los NaN interiores (entre dos cotas): se conservan para cortar el tramo, no para unir sus lados."""
    ok = np.isfinite(l)
    if not ok.any():
        return ok
    i = np.flatnonzero(ok)
    m = np.zeros_like(ok)
    m[i[0]:i[-1] + 1] = True
    return m & ~ok


def lineas_acceso(z: np.ndarray, celdas: list[tuple[int, int]], factor: int) -> list[tuple[np.ndarray, float]]:
    """Cotas cada RES_M a lo largo de los centros de una traza de celdas de la malla gruesa (`factor` subceldas)."""
    if len(celdas) < 2:
        return []
    H, W = z.shape
    pts = [((f + 0.5) * factor, (c + 0.5) * factor) for f, c in celdas]     # en unidades de subcelda (esquina)
    cotas = []
    for (fa, ca), (fb, cb) in zip(pts[:-1], pts[1:]):
        n = max(1, int(round(math.hypot(fb - fa, cb - ca))))
        for k in range(n):
            f, c = fa + (fb - fa) * k / n, ca + (cb - ca) * k / n
            i, j = int(math.floor(f)), int(math.floor(c))
            cotas.append(z[i, j] if 0 <= i < H and 0 <= j < W else np.nan)
    f, c = pts[-1]
    i, j = int(math.floor(f)), int(math.floor(c))
    cotas.append(z[i, j] if 0 <= i < H and 0 <= j < W else np.nan)
    # Paso medio: 25 m en los tramos rectos y ≈ 23,6 m en los diagonales (141 m en 6 muestras).
    largo = sum(math.hypot(fb - fa, cb - ca) for (fa, ca), (fb, cb) in zip(pts[:-1], pts[1:])) * RES_M
    return [(np.asarray(cotas, dtype=np.float64), largo / (len(cotas) - 1))]


def terreno_sitio(z: np.ndarray, direccion: np.ndarray, fila: int, col: int, factor: int) -> dict | None:
    """Campo `terreno` de un sitio en (fila, col) de la malla gruesa; `z` es el MDT a 25 m (NaN sin dato)."""
    radio = RADIO_M / RES_M
    centro = ((fila + 0.5) * factor, (col + 0.5) * factor)
    lineas = lineas_entorno(z, *centro, radio_celdas=radio)
    n_ok = sum(int(np.isfinite(l).sum()) for l, p in lineas if p == RES_M) / 2      # filas + columnas: cada celda 2 veces
    if n_ok < MIN_FRAC * math.pi * radio ** 2:
        return None
    m = metricas(lineas)
    if m is None:
        return None
    res = {"desnivel_km": int(round(m["desnivel_km"])), "pendiente_media": int(round(m["pendiente_media"])),
           "pendiente_max": int(round(m["pendiente_max"])), "esfuerzo": round(m["esfuerzo"], 2)}
    try:
        from .acceso import trazar
        camino = trazar(direccion, fila, col)
    except ValueError:
        camino = []
    a = metricas(lineas_acceso(z, camino, factor)) if len(camino) >= 2 else None
    if a is not None and a["distancia_m"] >= ACCESO_MIN_M:
        res["acceso_desnivel_km"] = int(round(a["desnivel_km"]))
    return res


# ---------------------------------------------------------------- datos

def leer_mdt_float(region, malla) -> np.ndarray:
    """MDT25 de la región en la rejilla de 25 m alineada con la malla, en float32 con NaN sin dato."""
    from .mdt_campo import NODATA, leer_mdt
    z = leer_mdt(Path(region.raw) / "dem", malla, RES_M).astype(np.float32)
    z[z == NODATA] = np.nan
    return z


def umbrales_terciles(valores) -> dict | None:
    """{comodo: p33, quebrado: p67, metodo: "terciles"} del desnivel_km de `valores`, redondeados a PASO_UMBRAL m/km.
    None si no hay valores."""
    v = np.asarray([x for x in valores if x is not None and math.isfinite(x)], dtype=np.float64)
    if v.size == 0:
        return None
    p33, p67 = np.percentile(v, [100 / 3, 200 / 3])
    r = lambda x: int(round(float(x) / PASO_UMBRAL)) * PASO_UMBRAL
    return {"comodo": r(p33), "quebrado": r(p67), "metodo": "terciles"}


def anotar(region, datos: dict, malla, direccion: np.ndarray, verbose: bool = True) -> dict:
    """Añade `terreno` a cada sitio de `datos` (sitios.json en memoria). Devuelve {n, sin_dato}."""
    factor = malla.celda / RES_M
    if factor != int(factor):
        raise ValueError(f"la malla de {malla.celda} m no es múltiplo de {RES_M} m")
    factor = int(factor)
    try:
        z = leer_mdt_float(region, malla)
    except FileNotFoundError as e:
        print(f"  WARNING terreno: {e}; sitios sin `terreno`", flush=True)
        return {"n": 0, "sin_dato": None}
    cache: dict[int, dict | None] = {}
    n = sin = 0
    for lista in datos["especies"].values():
        for s in lista:
            s.pop("terreno", None)
            i = int(s["id"])
            if i not in cache:
                f, c = divmod(i, malla.ancho)
                cache[i] = terreno_sitio(z, direccion, f, c, factor)
            if cache[i] is None:
                sin += 1
            else:
                s["terreno"] = cache[i]
                n += 1
    datos.pop("terreno_umbrales", None)
    um = umbrales_terciles([t["desnivel_km"] for t in cache.values() if t is not None])      # cada sitio una vez
    if um is not None:
        datos["terreno_umbrales"] = um
    if verbose:
        print(f"  terreno: {n} sitios con desnivel del entorno ({sin} sin MDT); umbrales de la región: {um}", flush=True)
    return {"n": n, "sin_dato": sin, "umbrales": um}
