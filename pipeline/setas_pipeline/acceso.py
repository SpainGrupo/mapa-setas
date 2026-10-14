"""Fase 8: acceso a pie desde el coche.

Para cada celda: minutos a pie desde la vía transitable en coche más cercana *en tiempo*,
desnivel acumulado de subida por ese camino, aparcamiento de origen y puntero al paso anterior
(para que la app dibuje el trazado sin red).

    uv run python -m setas_pipeline.acceso            # calcula y escribe data/out/app/acceso.*

Modelo
- Cálculo a 50 m (MDT25 IGN promediado 2×2); se exporta a 100 m (la malla del resto de capas).
- Coste anisótropo: función de Tobler sobre la pendiente del propio paso (sube ≠ baja),
  × 1,0 por sendero/pista/vía y × 1,6 campo a través (matorral mediterráneo).
- Agua (natural=water, landuse=reservoir, waterway=riverbank) y mar (cota ≤ 0) son intransitables.
- Fuentes: celdas de vía apta para coche (tiempo 0). Se agrupan en aparcamientos: uno por vía
  y bloque de 300 m.
- Dijkstra multifuente de scipy (csgraph) sobre el grafo de 8 vecinos.
"""
from __future__ import annotations
import argparse, json, math, warnings
from pathlib import Path
import numpy as np

BASE = Path(__file__).resolve().parent.parent
OUT = BASE / "data/out"
APP = OUT / "app"
RAW = BASE / "data/raw"

CELDA = 50.0                 # m, resolución de cálculo
FACTOR_EXPORT = 2            # 50 m → 100 m
BLOQUE_APARC = 300.0         # m: un aparcamiento por vía y bloque de este lado
MULT_SENDERO = 1.0
MULT_CAMPO = 1.6
SIN_TIEMPO = 0xFFFF          # uint16
SIN_ORIGEN = 0xFFFFFFFF      # uint32
SIN_ALTITUD = 0xFFFF         # uint16 (capa altitud, m)
VERSION_ACCESO = 2           # v2 (Fase 9): + capa altitud al final; las capas de v1 no cambian de offset
DIR_FUENTE = 0
DIR_SIN = 255

# Códigos de dirección 1..8: vecino hacia el que se da el siguiente paso de vuelta al coche.
VECINOS = [(-1, 0), (-1, 1), (0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1)]   # N NE E SE S SW W NW
NOMBRES_DIR = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]

VIAS_COCHE = {"trunk": 6, "primary": 5, "secondary": 4, "tertiary": 3,
              "unclassified": 2, "residential": 2, "service": 0}
VIAS_PIE = {"path", "track", "footway", "bridleway", "steps", "pedestrian", "cycleway",
            "living_street", "trunk_link", "primary_link", "secondary_link", "tertiary_link"}
ACCESO_NO = {"no", "private"}


# ---------------------------------------------------------------- lógica pura

def tobler_kmh(pendiente):
    """Velocidad a pie (km/h) con la función de Tobler; pendiente = dz/dx con signo (+ sube)."""
    return 6.0 * np.exp(-3.5 * np.abs(np.asarray(pendiente, dtype=np.float64) + 0.05))


def apto_coche(tags: dict) -> tuple[bool, int]:
    """(¿vía transitable en coche donde aparcar?, prioridad). Pistas solo grade1/grade2."""
    hw = tags.get("highway")
    if tags.get("access") in ACCESO_NO or tags.get("motor_vehicle") in ACCESO_NO \
            or tags.get("motorcar") in ACCESO_NO or tags.get("vehicle") in ACCESO_NO:
        return False, -1
    if hw in VIAS_COCHE:
        return True, VIAS_COCHE[hw]
    if hw == "track" and tags.get("tracktype") in ("grade1", "grade2"):
        return True, 1
    return False, -1


def es_camino(tags: dict) -> bool:
    """Vía por la que se anda a velocidad de sendero (incluye las de coche)."""
    hw = tags.get("highway")
    return hw in VIAS_PIE or hw in VIAS_COCHE


def _pares(shape, dr, dc):
    """Índices planos (u, v) de los pares celda→vecino (dr, dc) dentro de la malla."""
    H, W = shape
    r0, r1 = max(0, -dr), H - max(0, dr)
    c0, c1 = max(0, -dc), W - max(0, dc)
    idx = np.arange(H * W, dtype=np.int32).reshape(H, W)
    return idx[r0:r1, c0:c1].ravel(), idx[r0 + dr:r1 + dr, c0 + dc:c1 + dc].ravel()


def grafo(z: np.ndarray, celda: float, mult: np.ndarray, transitable: np.ndarray):
    """Grafo dirigido (CSR) de 8 vecinos; peso = segundos para ir de u a v."""
    import scipy.sparse as sp
    zf = z.astype(np.float64).ravel()
    mf = mult.astype(np.float64).ravel()
    tf = transitable.ravel()
    us, vs, ws = [], [], []
    for dr, dc in VECINOS:
        u, v = _pares(z.shape, dr, dc)
        ok = tf[u] & tf[v]
        u, v = u[ok], v[ok]
        d = celda * (math.sqrt(2) if dr and dc else 1.0)
        vel = tobler_kmh((zf[v] - zf[u]) / d) / 3.6          # m/s
        ws.append(d / vel * 0.5 * (mf[u] + mf[v]))
        us.append(u); vs.append(v)
    u = np.concatenate(us); v = np.concatenate(vs); w = np.concatenate(ws)
    del us, vs, ws
    n = z.size
    return sp.csr_matrix((w, (u, v)), shape=(n, n))


def resolver(z, celda, mult, transitable, fuentes):
    """Dijkstra multifuente. Devuelve (segundos, predecesor plano o -1, fuente plana o -1)."""
    from scipy.sparse.csgraph import dijkstra
    g = grafo(z, celda, mult, transitable | fuentes)
    src = np.flatnonzero(fuentes.ravel())
    dist, pred, origen = dijkstra(g, directed=True, indices=src, min_only=True,
                                  return_predecessors=True)
    del g
    pred = np.where(pred < 0, -1, pred).astype(np.int64)
    origen = np.where(origen < 0, -1, origen).astype(np.int64)
    return dist.reshape(z.shape), pred.reshape(z.shape), origen.reshape(z.shape)


def direccion_desde_pred(pred: np.ndarray, fuentes: np.ndarray, alcanzable: np.ndarray) -> np.ndarray:
    """uint8: 0 en fuentes, 1..8 hacia el predecesor (VECINOS), 255 sin acceso."""
    H, W = pred.shape
    d = np.full(pred.shape, DIR_SIN, np.uint8)
    f, c = np.mgrid[0:H, 0:W]
    pf, pc = np.divmod(np.where(pred >= 0, pred, 0), W)
    df, dc = pf - f, pc - c
    for k, (a, b) in enumerate(VECINOS, start=1):
        d[(pred >= 0) & (df == a) & (dc == b)] = k
    d[fuentes & alcanzable] = DIR_FUENTE
    d[~alcanzable] = DIR_SIN
    return d


def subida_acumulada(z: np.ndarray, pred: np.ndarray) -> np.ndarray:
    """Metros de subida acumulados desde la fuente por la cadena de predecesores (salto de punteros)."""
    zf = z.astype(np.float64).ravel()
    p = pred.ravel().astype(np.int64)
    n = p.size
    yo = np.arange(n, dtype=np.int64)
    raiz = p < 0
    P = np.where(raiz, yo, p)
    A = np.where(raiz, 0.0, np.maximum(0.0, zf - zf[P]))
    while True:
        PP = P[P]
        if np.array_equal(PP, P):
            break
        A = A + A[P]
        P = PP
    return A.reshape(z.shape)


def trazar(direccion: np.ndarray, fila: int, col: int, max_pasos: int = 100000) -> list[tuple[int, int]]:
    """Celdas desde (fila, col) hasta la fuente siguiendo `direccion` (el algoritmo que usará la app)."""
    camino = [(fila, col)]
    for _ in range(max_pasos):
        d = int(direccion[fila, col])
        if d == DIR_FUENTE:
            return camino
        if d == DIR_SIN:
            raise ValueError("celda sin acceso")
        a, b = VECINOS[d - 1]
        fila, col = fila + a, col + b
        camino.append((fila, col))
    raise ValueError("trazado sin fin")


def reducir(tiempo, subida, origen, pred, fuentes, factor: int = FACTOR_EXPORT):
    """Lleva los campos de la malla fina a la gruesa (bloques factor×factor).

    Dirección: en cada bloque manda la subcelda de menor tiempo. Su predecesor está fuera del bloque
    (el tiempo decrece estrictamente por el camino), así que la dirección gruesa es la del bloque
    vecino donde cae; ese bloque tiene un tiempo mínimo menor y el trazado grueso siempre termina en
    una fuente.
    Tiempo y subida: los del punto pulsado, que puede estar en cualquier parte de los 100 m → mediana
    de las subceldas alcanzables (el mínimo daba el rincón más cercano a la vía). En bloques con vía
    (dirección 0) valen 0. Para que no suban hacia el coche se toma el máximo con el valor del bloque
    siguiente por la traza (máximo acumulado aguas abajo).
    Origen: el aparcamiento del bloque de vía donde termina el trazado grueso (el que dibuja la app),
    no el de la subcelda fina elegida, que puede acabar en otro.
    Devuelve (tiempo, subida, origen, direccion) gruesos; tiempo inf / origen -1 donde no hay acceso.
    """
    H, W = tiempo.shape
    h, w = H // factor, W // factor
    k = factor * factor
    def bloques(a):
        return a[:h * factor, :w * factor].reshape(h, factor, w, factor).transpose(0, 2, 1, 3).reshape(h, w, k)
    t = bloques(tiempo)
    sel = np.argmin(t, axis=2)
    tomar = lambda a: np.take_along_axis(bloques(a), sel[..., None], axis=2)[..., 0]
    tmin, og, pg, fg = tomar(tiempo), tomar(origen), tomar(pred), tomar(fuentes)
    bf, bc = np.mgrid[0:h, 0:w]
    pf, pc = np.divmod(np.where(pg >= 0, pg, 0), W)
    df, dc = pf // factor - bf, pc // factor - bc
    d = np.full((h, w), DIR_SIN, np.uint8)
    for i, (a, b) in enumerate(VECINOS, start=1):
        d[(pg >= 0) & (df == a) & (dc == b)] = i
    alc = np.isfinite(tmin)
    d[fg & alc] = DIR_FUENTE
    d[~alc] = DIR_SIN
    # Valor representativo del bloque: mediana de las subceldas alcanzables.
    fin = np.isfinite(t)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)       # bloques sin ninguna subcelda alcanzable
        tr = np.nanmedian(np.where(fin, t, np.nan), axis=2)
        sr = np.nanmedian(np.where(fin, bloques(subida).astype(np.float64), np.nan), axis=2)
    fuente = d == DIR_FUENTE
    tr = np.where(fuente, 0.0, np.where(alc, tr, np.inf))
    sr = np.where(fuente, 0.0, np.where(alc, sr, 0.0))
    # Siguiente bloque por la traza (fuentes y sin acceso apuntan a sí mismos) y salto de punteros:
    # P acaba en el bloque de vía final; T/S, máximo acumulado de la mediana aguas abajo.
    idx = np.arange(h * w, dtype=np.int64).reshape(h, w)
    P = idx.copy()
    for i, (a, b) in enumerate(VECINOS, start=1):
        m = d == i
        P[m] = idx[m] + a * w + b
    P = P.ravel(); T = tr.ravel().copy(); S = sr.ravel().copy()
    while True:
        T = np.maximum(T, T[P]); S = np.maximum(S, S[P])
        PP = P[P]
        if np.array_equal(PP, P):
            break
        P = PP
    og = og.ravel()[P].reshape(h, w)
    return T.reshape(h, w), S.reshape(h, w), og, d


def agrupar_aparcamientos(fuentes: np.ndarray, via: np.ndarray, celda: float, bloque: float = BLOQUE_APARC):
    """Un aparcamiento por (bloque de `bloque` m, vía). Devuelve (id por celda o -1, lista de
    (fila, col, indice_via)) con la celda representativa más próxima al centro de su grupo."""
    H, W = fuentes.shape
    nb = max(1, int(round(bloque / celda)))
    f, c = np.nonzero(fuentes)
    v = via[f, c].astype(np.int64)
    clave = ((f // nb).astype(np.int64) * ((W // nb) + 1) + (c // nb)) * (int(via.max()) + 2) + v
    _, grupo = np.unique(clave, return_inverse=True)
    ng = int(grupo.max()) + 1 if grupo.size else 0
    cnt = np.bincount(grupo, minlength=ng)
    mf = np.bincount(grupo, weights=f, minlength=ng) / cnt
    mc = np.bincount(grupo, weights=c, minlength=ng) / cnt
    d2 = (f - mf[grupo]) ** 2 + (c - mc[grupo]) ** 2
    orden = np.lexsort((d2, grupo))                  # por grupo, el más cercano al centro primero
    primero = orden[np.r_[True, grupo[orden][1:] != grupo[orden][:-1]]]
    reps = [(int(f[i]), int(c[i]), int(v[i])) for i in primero[np.argsort(grupo[primero])]]
    ident = np.full(fuentes.shape, -1, np.int64)
    ident[f, c] = grupo
    return ident, reps


# ---------------------------------------------------------------- datos

def dem_50m(raw: Path = RAW, malla=None) -> np.ndarray:
    """Mosaico de las teselas MDT25 en caché, promediado 2×2 → malla de 50 m alineada con malla.json."""
    import rasterio
    from .malla import Malla
    malla = malla or Malla.cargar(OUT / "malla.json")
    W25, H25 = int(malla.ancho * malla.celda / 25), int(malla.alto * malla.celda / 25)
    z = np.zeros((H25, W25), np.float32)
    for p in sorted((raw / "dem").glob("mdt25_*.tif")):
        with rasterio.open(p) as r:
            a = r.read(1).astype(np.float32)
            c0 = int(round((r.bounds.left - malla.x0) / 25))
            f0 = int(round((malla.y1 - r.bounds.top) / 25))
            z[f0:f0 + a.shape[0], c0:c0 + a.shape[1]] = a[:H25 - f0, :W25 - c0]
    return z.reshape(H25 // 2, 2, W25 // 2, 2).mean(axis=(1, 3))


def extraer_osm(pbf: Path):
    """Una pasada: vías de coche (con nombre/ref), caminos y polígonos de agua (WKB en EPSG:4326)."""
    import osmium
    from shapely import wkb
    fab = osmium.geom.WKBFactory()
    coche, caminos, agua = [], [], []
    fp = (osmium.FileProcessor(str(pbf)).with_locations()
          .with_areas(osmium.filter.TagFilter(("natural", "water"), ("landuse", "reservoir"),
                                              ("waterway", "riverbank")))
          .with_filter(osmium.filter.KeyFilter("highway", "natural", "landuse", "waterway")))
    for o in fp:
        if o.is_way():
            tags = dict(o.tags)
            if "highway" not in tags:
                continue
            ok, prio = apto_coche(tags)
            if not (ok or es_camino(tags)):
                continue
            try:
                g = wkb.loads(fab.create_linestring(o), hex=True)
            except Exception:
                continue
            if ok:
                coche.append((g, tags.get("name"), tags.get("ref"), tags["highway"], prio))
            caminos.append(g)
        elif o.is_area():
            t = o.tags
            if t.get("natural") == "water" or t.get("landuse") == "reservoir" or t.get("waterway") == "riverbank":
                try:
                    agua.append(wkb.loads(fab.create_multipolygon(o), hex=True))
                except Exception:
                    pass
    return coche, caminos, agua


def calcular(pbf: Path = RAW / "andalucia.osm.pbf", out: Path = APP, verbose=True):
    import time
    import geopandas as gpd
    from rasterio.features import rasterize
    from rasterio.transform import from_origin
    from pyproj import Transformer
    from .malla import Malla, escribir_tif, NODATA_F
    t0 = time.time()
    log = (lambda *a: print(f"  [{time.time() - t0:5.0f} s]", *a, flush=True)) if verbose else (lambda *a: None)
    malla = Malla.cargar(OUT / "malla.json")
    z = dem_50m(malla=malla)
    H, W = z.shape
    tr50 = from_origin(malla.x0, malla.y1, CELDA, CELDA)
    log(f"MDT 50 m {W}×{H}")
    coche, caminos, agua = extraer_osm(pbf)
    log(f"OSM: {len(coche)} vías de coche, {len(caminos)} caminos, {len(agua)} láminas de agua")
    gc = gpd.GeoSeries([c[0] for c in coche], crs="EPSG:4326").to_crs("EPSG:25830")
    orden = sorted(range(len(coche)), key=lambda i: coche[i][4])      # prioridad alta se pinta la última
    via = rasterize(((gc.iloc[i], i + 1) for i in orden), out_shape=(H, W), transform=tr50,
                    fill=0, all_touched=True, dtype="int32")
    gcam = gpd.GeoSeries(caminos, crs="EPSG:4326").to_crs("EPSG:25830")
    camino = rasterize(((g, 1) for g in gcam), out_shape=(H, W), transform=tr50, fill=0,
                       all_touched=True, dtype="uint8").astype(bool)
    del gcam
    if agua:
        ga = gpd.GeoSeries(agua, crs="EPSG:4326").to_crs("EPSG:25830")
        lamina = rasterize(((g, 1) for g in ga), out_shape=(H, W), transform=tr50, fill=0,
                           dtype="uint8").astype(bool)
    else:
        lamina = np.zeros((H, W), bool)
    fuentes = (via > 0) & (z > 0)
    camino |= via > 0
    transitable = (z > 0) & (~lamina | camino)
    fuentes &= transitable
    mult = np.where(camino, MULT_SENDERO, MULT_CAMPO).astype(np.float32)
    log(f"rasters: {fuentes.sum()} celdas de fuente, {camino.mean() * 100:.1f} % con camino, "
        f"{lamina.sum()} de agua")
    tiempo, pred, origen = resolver(z, CELDA, mult, transitable, fuentes)
    log("dijkstra")
    subida = subida_acumulada(z, pred)
    log("subida")
    ident, reps = agrupar_aparcamientos(fuentes, via, CELDA)
    aparc_celda = np.where(origen >= 0, ident.ravel()[np.where(origen >= 0, origen, 0)], -1)
    tg, sg, og, dg = reducir(tiempo, subida, aparc_celda, pred, fuentes)
    # Solo se exporta la zona (+500 m); fuera, sin dato.
    zona = gpd.read_file(OUT / "zona.geojson").to_crs("EPSG:25830").buffer(500).union_all()
    dentro = rasterize([(zona, 1)], out_shape=tg.shape, transform=malla.transform, fill=0,
                       dtype="uint8").astype(bool)
    ok = cerrar_mascara(dentro & np.isfinite(tg) & (og >= 0), dg)
    # Renumerar aparcamientos usados.
    usados = np.unique(og[ok])
    nuevo = np.full(len(reps), -1, np.int64)
    nuevo[usados] = np.arange(len(usados))
    trll = Transformer.from_crs("EPSG:25830", "EPSG:4326", always_xy=True)
    aparcamientos = []
    for i, u in enumerate(usados):
        f, c, v = reps[u]
        x = malla.x0 + (c + 0.5) * CELDA
        y = malla.y1 - (f + 0.5) * CELDA
        lon, lat = trll.transform(x, y)
        _, nombre, ref, hw, _ = coche[v - 1]
        aparcamientos.append({"id": i, "lat": round(lat, 5), "lon": round(lon, 5),
                              "nombre": nombre, "ref": ref, "via": hw})
    t_min = np.where(ok, np.clip(np.round(tg / 60.0), 0, SIN_TIEMPO - 1), SIN_TIEMPO).astype("<u2")
    s_m = np.where(ok, np.clip(np.round(sg), 0, SIN_TIEMPO - 1), SIN_TIEMPO).astype("<u2")
    o_id = np.where(ok, nuevo[np.where(og >= 0, og, 0)], SIN_ORIGEN).astype("<u4")
    d8 = np.where(ok, dg, DIR_SIN).astype(np.uint8)
    log(f"export 100 m: {int((t_min != SIN_TIEMPO).sum())} celdas, {len(aparcamientos)} aparcamientos")
    escribir_app(out, malla, t_min, s_m, o_id, d8, aparcamientos,
                 alt=altitud_u16(leer_tif_malla(OUT / "altitud.tif")))
    escribir_tif(malla, OUT / "tiempo_pie.tif", np.where(t_min == SIN_TIEMPO, NODATA_F, t_min).astype("float32"), NODATA_F)
    escribir_tif(malla, OUT / "subida_pie.tif", np.where(s_m == SIN_TIEMPO, NODATA_F, s_m).astype("float32"), NODATA_F)
    log("escrito")
    return t_min, s_m, o_id, d8, aparcamientos


def cerrar_mascara(ok: np.ndarray, direccion: np.ndarray) -> np.ndarray:
    """Amplía `ok` con las celdas por las que pasa el trazado de cualquier celda de `ok`, para que
    el trazado en la app nunca pise una celda sin dato (p. ej. al salir de la zona hacia la vía)."""
    ok = ok.copy()
    dfs = np.array([v[0] for v in VECINOS]); dcs = np.array([v[1] for v in VECINOS])
    frente = ok & (direccion >= 1) & (direccion <= 8)
    while frente.any():
        f, c = np.nonzero(frente)
        k = direccion[f, c].astype(int) - 1
        nf, nc = f + dfs[k], c + dcs[k]
        nuevo = ~ok[nf, nc]
        nf, nc = nf[nuevo], nc[nuevo]
        frente = np.zeros_like(ok)
        ok[nf, nc] = True
        frente[nf, nc] = (direccion[nf, nc] >= 1) & (direccion[nf, nc] <= 8)
    return ok


def leer_tif_malla(ruta: Path) -> np.ndarray:
    from .malla import leer_tif
    return leer_tif(ruta)


def altitud_u16(a: np.ndarray, nodata: float = -9999.0) -> np.ndarray:
    """altitud.tif (float, m) → uint16 en m redondeados; bajo 0 → 0; sin dato → SIN_ALTITUD."""
    a = np.asarray(a, dtype=np.float64)
    malo = (a == nodata) | ~np.isfinite(a)
    return np.where(malo, SIN_ALTITUD, np.clip(np.round(np.nan_to_num(a)), 0, SIN_ALTITUD - 1)).astype("<u2")


def escribir_app(out: Path, malla, t_min, s_m, o_id, d8, aparcamientos, alt=None):
    """acceso.bin (planar, little-endian, cada bloque alineado a 4 bytes) + acceso.json + aparcamientos.json.

    v2: tras las 4 capas de v1 (mismo orden y offsets) se añade `altitud` (uint16, m, nodata 0xFFFF),
    la del MDT de la malla de 100 m, para el perfil de altura de cualquier ruta. Sin `alt`, toda sin dato."""
    from pyproj import Transformer
    out.mkdir(parents=True, exist_ok=True)
    if alt is None:
        alt = np.full(np.shape(t_min), SIN_ALTITUD, "<u2")
    capas = [("origen_id", o_id, "uint32", SIN_ORIGEN), ("tiempo_pie_min", t_min, "uint16", SIN_TIEMPO),
             ("subida_m", s_m, "uint16", SIN_TIEMPO), ("direccion", d8, "uint8", DIR_SIN),
             ("altitud", alt, "uint16", SIN_ALTITUD)]
    cab = {"version": VERSION_ACCESO, "crs": "EPSG:25830", "res_m": malla.celda,
           "origen_xy": [malla.x0, malla.y1], "ancho": malla.ancho, "alto": malla.alto,
           "orden": "filas de norte a sur, columnas de oeste a este; indice = fila*ancho + col",
           "endianness": "little", "capas": {}}
    xs = [malla.x0, malla.x0 + malla.ancho * malla.celda]
    ys = [malla.y1 - malla.alto * malla.celda, malla.y1]
    tr = Transformer.from_crs("EPSG:25830", "EPSG:4326", always_xy=True)
    lon, lat = tr.transform([xs[0], xs[1], xs[0], xs[1]], [ys[0], ys[0], ys[1], ys[1]])
    cab["bbox_wgs84"] = [round(min(lon), 5), round(min(lat), 5), round(max(lon), 5), round(max(lat), 5)]
    cab["direccion_codigos"] = {"0": "aparcamiento (celda de vía)", "255": "sin dato",
                                **{str(i + 1): f"{NOMBRES_DIR[i]} (dfila={a}, dcol={b})"
                                   for i, (a, b) in enumerate(VECINOS)}}
    cab["modelo"] = {"calculo_m": CELDA, "tobler": "6·exp(-3.5·|dz/dx+0.05|) km/h por paso",
                     "mult_sendero": MULT_SENDERO, "mult_campo": MULT_CAMPO,
                     "aparcamiento_bloque_m": BLOQUE_APARC,
                     "nota": "tiempo y subida son de ida (del coche a la celda)"}
    off = 0
    with open(out / "acceso.bin", "wb") as f:
        for nombre, a, dt, nd in capas:
            b = np.ascontiguousarray(a, dtype=np.dtype(dt).newbyteorder("<")).tobytes()
            cab["capas"][nombre] = {"dtype": dt, "offset": off, "bytes": len(b), "nodata": nd}
            f.write(b)
            off += len(b)
            pad = (-off) % 4
            f.write(b"\0" * pad)
            off += pad
    cab["bytes"] = off
    comprimir(out / "acceso.bin")
    (out / "acceso.json").write_text(json.dumps(cab, ensure_ascii=False, indent=1))
    (out / "aparcamientos.json").write_text(json.dumps(compactar_aparcamientos(aparcamientos),
                                                       ensure_ascii=False, separators=(",", ":")))


def comprimir(ruta: Path) -> Path:
    """ruta → ruta.gz (gzip, mtime 0 para que sea reproducible). La app lo descomprime con
    DecompressionStream; el manifest publica el .gz (acceso.bin se queda solo para consultar())."""
    import gzip
    destino = ruta.with_name(ruta.name + ".gz")
    with open(ruta, "rb") as src, open(destino, "wb") as f:
        with gzip.GzipFile(fileobj=f, mode="wb", compresslevel=9, mtime=0, filename="") as gz:
            gz.write(src.read())
    return destino


def compactar_aparcamientos(lista: list[dict]) -> dict:
    """{'vias': [[nombre, ref, tipo]…], 'campos': [...], 'datos': [[lat, lon, i_via]…]}; el id es la posición."""
    vias, idx, datos = [], {}, []
    for a in lista:
        k = (a.get("nombre"), a.get("ref"), a.get("via"))
        if k not in idx:
            idx[k] = len(vias); vias.append(list(k))
        datos.append([a["lat"], a["lon"], idx[k]])
    return {"version": 1, "vias_campos": ["nombre", "ref", "tipo"], "vias": vias,
            "campos": ["lat", "lon", "via"], "datos": datos}


def aparcamiento(compacto: dict, i: int) -> dict:
    lat, lon, v = compacto["datos"][i]
    nombre, ref, tipo = compacto["vias"][v]
    return {"id": i, "lat": lat, "lon": lon, "nombre": nombre, "ref": ref, "via": tipo}


def anadir_altitud(out: Path = APP) -> dict:
    """Reescribe acceso.* con la capa altitud a partir de las capas ya calculadas (sin rehacer Dijkstra)."""
    from .malla import Malla
    malla = Malla.cargar(OUT / "malla.json")
    cab, r = leer_app(out)
    comp = json.loads((out / "aparcamientos.json").read_text())
    aps = [aparcamiento(comp, i) for i in range(len(comp["datos"]))]
    escribir_app(out, malla, r["tiempo_pie_min"].copy(), r["subida_m"].copy(), r["origen_id"].copy(),
                 r["direccion"].copy(), aps, alt=altitud_u16(leer_tif_malla(OUT / "altitud.tif")))
    return json.loads((out / "acceso.json").read_text())


def leer_app(out: Path = APP):
    """Lee acceso.bin con su cabecera → dict de arrays (alto, ancho)."""
    cab = json.loads((out / "acceso.json").read_text())
    raw = (out / "acceso.bin").read_bytes()
    res = {}
    for n, c in cab["capas"].items():
        res[n] = np.frombuffer(raw, dtype=np.dtype(c["dtype"]).newbyteorder("<"), count=c["bytes"] // np.dtype(c["dtype"]).itemsize,
                               offset=c["offset"]).reshape(cab["alto"], cab["ancho"])
    return cab, res


def consultar(lat: float, lon: float, out: Path = APP) -> dict:
    """Valores en un punto (para la comprobación de cordura)."""
    from pyproj import Transformer
    cab, r = leer_app(out)
    x, y = Transformer.from_crs("EPSG:4326", "EPSG:25830", always_xy=True).transform(lon, lat)
    c = int((x - cab["origen_xy"][0]) // cab["res_m"])
    f = int((cab["origen_xy"][1] - y) // cab["res_m"])
    o = int(r["origen_id"][f, c])
    ap = aparcamiento(json.loads((out / "aparcamientos.json").read_text()), o) if o != SIN_ORIGEN else None
    pasos = len(trazar(r["direccion"], f, c)) - 1 if r["direccion"][f, c] != DIR_SIN else None
    return {"tiempo_min": int(r["tiempo_pie_min"][f, c]), "subida_m": int(r["subida_m"][f, c]),
            "aparcamiento": ap, "pasos_100m": pasos}


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--consultar", nargs=2, type=float, metavar=("LAT", "LON"), action="append")
    ap.add_argument("--solo-altitud", action="store_true",
                    help="añade/actualiza la capa altitud sobre el acceso ya calculado")
    a = ap.parse_args(argv)
    if a.solo_altitud:
        print(anadir_altitud()["capas"]["altitud"])
        return
    if a.consultar:
        for lat, lon in a.consultar:
            print(lat, lon, consultar(lat, lon))
        return
    calcular()


if __name__ == "__main__":
    main()
