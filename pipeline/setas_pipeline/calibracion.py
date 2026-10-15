"""Calibración: ¿caen las citas reales en celdas de alta idoneidad?

Desde 2026-10-15 la fuente son las citas ampliadas de data/out/citas.geojson (GBIF + iNaturalist +
Observation vía GBIF + foros/literatura, citas.py): solo las de la zona de calibración (celdas de tierra de
la zona). Se descartan las que declaran una incertidumbre > INCERTIDUMBRE_MAX; las que no la declaran se
conservan (como filtrar_incertidumbre). Las de foros o literatura solo calibran con precisión «punto»
(≤ PRECISION_PUNTO_M); las de paraje, municipio o sierra no. Las funciones de descarga directa de GBIF se
conservan para la caché antigua (data/raw/gbif)."""
from __future__ import annotations
import hashlib, json, logging, re
from pathlib import Path
import numpy as np, requests
from pyproj import Transformer
from scipy.ndimage import maximum_filter
from shapely.geometry import MultiPolygon
from shapely.geometry.polygon import orient
from shapely.ops import transform as sh_transform
from .malla import Malla, CRS, NODATA_F, leer_tif
from .descargas import cargar_zona

GBIF = "https://api.gbif.org/v1"
UMBRAL = 50
INCERTIDUMBRE_MAX = 1000     # m; los registros con más se descartan (los que no la declaran se quedan)
VENTANA = 5                  # 5x5 celdas de 100 m ≈ radio de 200-250 m (variante "máx. en 500 m")
MIN_OBS = 10                 # por debajo no se juzga la especie
# Validación espacial: bloques de 10 km repartidos en 5 pliegues. Los perfiles no se ajustan con ella.
BLOQUE_VALIDACION_M = 10_000.0
PLIEGUES = 5
SEMILLA_PLIEGUES = 0
log = logging.getLogger(__name__)
_a_utm = Transformer.from_crs("EPSG:4326", CRS, always_xy=True)
_a_wgs = Transformer.from_crs(CRS, "EPSG:4326", always_xy=True)


def nombres_cientificos(nombre: str) -> list[str]:
    """'Boletus aestivalis / reticulatus' → ['Boletus aestivalis', 'Boletus reticulatus']."""
    partes = [p.strip() for p in nombre.split("/")]
    genero = partes[0].split()[0]
    return [p if len(p.split()) > 1 else f"{genero} {p}" for p in partes]


def wkt_zona(zona) -> str:
    """Zona simplificada (2 km) en EPSG:4326, anillos en sentido antihorario (lo exige GBIF)."""
    z = sh_transform(_a_wgs.transform, zona.simplify(2000))
    if isinstance(z, MultiPolygon):
        return MultiPolygon([orient(g, 1.0) for g in z.geoms]).wkt
    return orient(z, 1.0).wkt


def clave_taxon(nombre: str) -> int | None:
    """Clave GBIF aceptada (un sinónimo, p. ej. B. aestivalis → B. reticulatus, da la del aceptado).
    None si GBIF no reconoce el nombre (matchType NONE)."""
    j = requests.get(f"{GBIF}/species/match", params={"name": nombre}, timeout=30).json()
    clave = j.get("acceptedUsageKey") or j.get("usageKey")
    if clave is None:
        log.warning("GBIF no reconoce el taxón %r (matchType=%s)", nombre, j.get("matchType"))
        print(f"  WARNING: GBIF no reconoce el taxón {nombre!r}; se omite")
    return clave


def descargar_ocurrencias(nombre: str, wkt: str, max_registros=5000, clave: int | None = None):
    clave = clave or clave_taxon(nombre)
    out, offset = [], 0
    while offset < max_registros:
        r = requests.get(f"{GBIF}/occurrence/search", timeout=60, params={
            "taxonKey": clave, "geometry": wkt, "hasCoordinate": "true",
            "hasGeospatialIssue": "false", "limit": 300, "offset": offset})
        r.raise_for_status()
        j = r.json()
        out += [(x["decimalLongitude"], x["decimalLatitude"], x.get("coordinateUncertaintyInMeters"))
                for x in j["results"]]
        if j.get("endOfRecords", True):
            break
        offset += 300
    return out


def ocurrencias(perfil: dict, zona, raw_dir: Path) -> list:
    """Observaciones de todos los nombres del perfil, con caché en raw_dir/gbif/."""
    wkt = wkt_zona(zona)
    nombre = re.sub(r"\W+", "_", perfil["nombre"]).strip("_").lower()
    cache = Path(raw_dir) / "gbif" / f"{nombre}_{hashlib.sha1(wkt.encode()).hexdigest()[:8]}.json"
    if cache.exists():
        return [tuple(p) for p in json.loads(cache.read_text())]
    pts = []
    claves = {clave_taxon(n) for n in nombres_cientificos(perfil["nombre"])}   # sin duplicar sinónimos
    completo = None not in claves
    for c in claves - {None}:
        pts += descargar_ocurrencias(perfil["nombre"], wkt, clave=c)
    if completo:                          # no se cachea un resultado con nombres sin resolver
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_text(json.dumps(pts))
    return pts


def a_utm(pts) -> list[tuple[float, float]]:
    if not pts:
        return []
    xs, ys = _a_utm.transform([p[0] for p in pts], [p[1] for p in pts])
    return list(zip(xs, ys))


def _indices(malla: Malla, xy_utm):
    xs = np.array([p[0] for p in xy_utm], dtype=float); ys = np.array([p[1] for p in xy_utm], dtype=float)
    cols = np.floor((xs - malla.x0) / malla.celda).astype(int)
    filas = np.floor((malla.y1 - ys) / malla.celda).astype(int)
    dentro = (cols >= 0) & (cols < malla.ancho) & (filas >= 0) & (filas < malla.alto)
    return filas[dentro], cols[dentro]


def valores_en_puntos(malla: Malla, raster: np.ndarray, xy_utm) -> np.ndarray:
    if not len(xy_utm):
        return raster[:0, 0]
    f, c = _indices(malla, xy_utm)
    return raster[f, c]


def resumen(valores: np.ndarray, raster: np.ndarray) -> dict:
    pct_obs = round(100 * float(np.mean(valores >= UMBRAL)), 1) if len(valores) else 0.0
    pct_zona = 100 * float(np.mean(raster >= UMBRAL))
    return {"n": int(len(valores)),
            "mediana_obs": float(np.median(valores)) if len(valores) else None,
            "pct_obs_buenas": pct_obs, "pct_zona_buena": round(pct_zona, 1),
            "lift": round(pct_obs / pct_zona, 2) if pct_zona else None}


def pliegues_bloques(malla: Malla, k: int = PLIEGUES, bloque_m: float = BLOQUE_VALIDACION_M,
                     semilla: int = SEMILLA_PLIEGUES) -> np.ndarray:
    """Pliegue (0..k-1) de cada celda: bloques de bloque_m × bloque_m repartidos al azar (semilla fija)
    y equilibrados entre pliegues."""
    n = max(1, int(round(bloque_m / malla.celda)))
    bf, bc = -(-malla.alto // n), -(-malla.ancho // n)
    rng = np.random.default_rng(semilla)
    asign = rng.permutation(np.arange(bf * bc) % k).reshape(bf, bc)
    f, c = np.mgrid[0:malla.alto, 0:malla.ancho]
    return asign[f // n, c // n]


def validacion_bloques(malla: Malla, raster: np.ndarray, tierra: np.ndarray, xy_utm, pliegue: np.ndarray,
                       k: int = PLIEGUES) -> dict:
    """Lift medido en cada pliegue retenido (obs. y celdas de tierra de sus bloques); media de los pliegues
    con alguna observación y zona buena > 0."""
    lifts = []
    if len(xy_utm):
        f, c = _indices(malla, xy_utm)
        v, p_obs = raster[f, c], pliegue[f, c]
        for i in range(k):
            obs = v[p_obs == i]
            zona = raster[tierra & (pliegue == i)]
            if not len(obs) or not len(zona):
                continue
            pz = float(np.mean(zona >= UMBRAL))
            if pz > 0:
                lifts.append(round(float(np.mean(obs >= UMBRAL)) / pz, 2))
    return {"lifts": lifts, "pliegues": len(lifts),
            "lift_medio": round(float(np.mean(lifts)), 2) if lifts else None}


def filtrar_incertidumbre(pts):
    """→ (conservados, n_con_incertidumbre_ok, n_sin_incertidumbre)."""
    ok = [p for p in pts if p[2] is not None and p[2] <= INCERTIDUMBRE_MAX]
    sin = [p for p in pts if p[2] is None]
    return ok + sin, len(ok), len(sin)


def tierra_en_zona(out_dir: Path) -> np.ndarray:
    return (leer_tif(Path(out_dir) / "altitud.tif") != NODATA_F) & (leer_tif(Path(out_dir) / "arbol.tif") != 255)


# Los registros GBIF son históricos (p. ej. de 2003 en celdas quemadas en 2026): la penalización por incendio
# del año en curso no se puede juzgar con ellos, así que la calibración mide el hábitat sin ese factor.
SIN_FACTORES = frozenset({"fuego"})


def _idoneidad_calibracion(out_dir: Path, clave: str, perfil: dict, capas, extra=frozenset()) -> np.ndarray:
    if capas is None:
        return leer_tif(out_dir / f"idoneidad_{clave}.tif")
    from .idoneidad import puntuar
    base, v2 = capas
    return puntuar(perfil, base["arbol"], base["altitud"], base["orientacion"], base["pendiente"],
                   base["suelo"], v2, SIN_FACTORES | frozenset(extra))


# ---------------------------------------------------------------- citas ampliadas (2026-10-15)
CITAS = "citas.geojson"
ID_CITAS = {"boletus_aestivalis": "boletus_reticulatus"}     # clave de especies.yaml → id de la guía
# Variantes de la máscara de edificado que se comparan (factores apagados además de SIN_FACTORES).
VARIANTES = {"sin_mascara": frozenset({"edificado", "borde_urbano"}),
             "exclusion": frozenset({"borde_urbano"}),
             "exclusion_borde": frozenset()}


def cargar_citas(out_dir: Path) -> dict:
    ruta = Path(out_dir) / CITAS
    return json.loads(ruta.read_text()) if ruta.exists() else {"features": []}


ORIGENES_TEXTO = ("foro", "literatura")   # sitios de foros/literatura: precisión estimada por el tipo de lugar
PRECISION_PUNTO_M = 100                    # citas.PRECISION_CSV «punto»


def citas_especie(citas: dict, clave: str) -> list[tuple]:
    """(lon, lat, precision_m, origen) de las citas de una especie del pipeline."""
    esp = ID_CITAS.get(clave, clave)
    return [(f["properties"]["lon"], f["properties"]["lat"], f["properties"].get("precision_m"),
             f["properties"].get("origen"))
            for f in citas.get("features", []) if f["properties"].get("especie") == esp]


def filtrar_precision(pts, maximo: float = INCERTIDUMBRE_MAX, punto: float = PRECISION_PUNTO_M):
    """Mismo criterio que filtrar_incertidumbre: se descartan las que declaran > maximo y se conservan las que no
    declaran incertidumbre. Foros y literatura solo valen con precisión «punto» (≤ punto m).
    → (conservadas, n_sin_precision conservadas, n_descartadas)."""
    ok, sin = [], 0
    for p in pts:
        prec, origen = p[2], (p[3] if len(p) > 3 else None)
        if origen in ORIGENES_TEXTO:
            if prec is not None and float(prec) <= punto:
                ok.append(p)
        elif prec is None:
            ok.append(p); sin += 1
        elif float(prec) <= maximo:
            ok.append(p)
    return ok, sin, len(pts) - len(ok)


def decidir_borde_urbano(res: dict, min_obs: int = MIN_OBS) -> tuple[bool, list[str]]:
    """¿Se mantiene la penalización ×0,5 de borde urbano? No si baja el lift de validación (bloques) de alguna
    especie con n ≥ min_obs frente a la exclusión dura sola. → (mantener, especies en las que baja)."""
    bajan = []
    for clave, d in res.items():
        v = d.get("variantes", {})
        if d["celda"]["n"] < min_obs or "exclusion" not in v or "exclusion_borde" not in v:
            continue
        a, b = v["exclusion"]["val"]["lift_medio"], v["exclusion_borde"]["val"]["lift_medio"]
        if a is not None and b is not None and b < a:
            bajan.append(clave)
    return not bajan, bajan


def _xy_en_tierra(malla: Malla, tierra: np.ndarray, pts) -> list:
    xy = a_utm(pts)
    if not xy:
        return []
    xs = np.array([p[0] for p in xy]); ys = np.array([p[1] for p in xy])
    cols = np.floor((xs - malla.x0) / malla.celda).astype(int)
    filas = np.floor((malla.y1 - ys) / malla.celda).astype(int)
    dentro = (cols >= 0) & (cols < malla.ancho) & (filas >= 0) & (filas < malla.alto)
    mascara = np.zeros(len(xy), bool)
    mascara[dentro] = tierra[filas[dentro], cols[dentro]]
    return [p for p, k in zip(xy, mascara) if k]


def calibrar(out_dir: Path, raw_dir: Path, perfiles: dict, recalcular: bool = True) -> dict:
    """Citas de citas.geojson. recalcular=True: idoneidad recalculada sin SIN_FACTORES (y sin los
    DESACTIVADOS_POR_DEFECTO del modelo), más las VARIANTES de la máscara de edificado;
    False: lee idoneidad_<clave>.tif."""
    from .idoneidad import DESACTIVADOS_POR_DEFECTO
    out_dir = Path(out_dir)
    malla = Malla.cargar(out_dir / "malla.json")
    tierra = tierra_en_zona(out_dir)
    capas = None
    if recalcular:
        from .idoneidad import cargar_capas
        capas = cargar_capas(out_dir)
    pliegue = pliegues_bloques(malla)
    citas = cargar_citas(out_dir)
    res = {}
    for clave, perfil in perfiles.items():
        r = _idoneidad_calibracion(out_dir, clave, perfil, capas, DESACTIVADOS_POR_DEFECTO)
        rmax = maximum_filter(np.where(tierra, r, 0), size=VENTANA)
        pts = citas_especie(citas, clave)
        kept, n_sin, n_imprecisas = filtrar_precision(pts)
        xy_t = _xy_en_tierra(malla, tierra, kept)
        variantes = {}
        if capas is not None:
            for nombre, extra in VARIANTES.items():
                rv = _idoneidad_calibracion(out_dir, clave, perfil, capas, extra)
                variantes[nombre] = {"celda": resumen(valores_en_puntos(malla, rv, xy_t), rv[tierra]),
                                     "val": validacion_bloques(malla, rv, tierra, xy_t, pliegue),
                                     "celdas_buenas": int((rv[tierra] >= UMBRAL).sum())}
        res[clave] = {
            "nombre": perfil["nombre"], "n_bruto": len(pts), "n_incert_ok": len(kept), "n_sin_incert": n_sin,
            "n_imprecisas": n_imprecisas, "n_conservados": len(kept), "xy": xy_t, "variantes": variantes,
            "celda": resumen(valores_en_puntos(malla, r, xy_t), r[tierra]),
            "ventana": resumen(valores_en_puntos(malla, rmax, xy_t), rmax[tierra]),
            "val_celda": validacion_bloques(malla, r, tierra, xy_t, pliegue),
            "val_ventana": validacion_bloques(malla, rmax, tierra, xy_t, pliegue),
        }
    return res


def calibrar_gbif(out_dir: Path, raw_dir: Path, perfiles: dict, recalcular: bool = True) -> dict:
    """Variante antigua (hasta 2026-10-14): ocurrencias GBIF descargadas por especie (caché data/raw/gbif).
    recalcular=True: idoneidad recalculada sin SIN_FACTORES; False: lee idoneidad_<clave>.tif."""
    out_dir = Path(out_dir)
    malla = Malla.cargar(out_dir / "malla.json")
    zona = cargar_zona(out_dir / "zona.geojson")
    tierra = tierra_en_zona(out_dir)
    capas = None
    if recalcular:
        from .idoneidad import cargar_capas
        capas = cargar_capas(out_dir)
    pliegue = pliegues_bloques(malla)
    res = {}
    for clave, perfil in perfiles.items():
        r = _idoneidad_calibracion(out_dir, clave, perfil, capas)
        rmax = maximum_filter(np.where(tierra, r, 0), size=VENTANA)
        pts = ocurrencias(perfil, zona, raw_dir)
        kept, n_ok, n_sin = filtrar_incertidumbre(pts)
        xy = a_utm(kept)
        if xy:
            xs = np.array([p[0] for p in xy]); ys = np.array([p[1] for p in xy])
            cols = np.floor((xs - malla.x0) / malla.celda).astype(int)
            filas = np.floor((malla.y1 - ys) / malla.celda).astype(int)
            dentro = (cols >= 0) & (cols < malla.ancho) & (filas >= 0) & (filas < malla.alto)
            mascara = np.zeros(len(xy), bool)
            mascara[dentro] = tierra[filas[dentro], cols[dentro]]
            xy_t = [p for p, k in zip(xy, mascara) if k]
        else:
            xy_t = []
        res[clave] = {
            "nombre": perfil["nombre"], "n_bruto": len(pts), "n_incert_ok": n_ok, "n_sin_incert": n_sin,
            "n_conservados": len(kept), "xy": xy_t,
            "celda": resumen(valores_en_puntos(malla, r, xy_t), r[tierra]),
            "ventana": resumen(valores_en_puntos(malla, rmax, xy_t), rmax[tierra]),
            "val_celda": validacion_bloques(malla, r, tierra, xy_t, pliegue),
            "val_ventana": validacion_bloques(malla, rmax, tierra, xy_t, pliegue),
        }
    return res


def tabla_mascara(res: dict) -> list[str]:
    """Sección «Máscara de edificado»: lift y celdas buenas antes y después, por especie."""
    from .idoneidad import DESACTIVADOS_POR_DEFECTO
    mantener, bajan = decidir_borde_urbano(res)
    f = lambda x: "—" if x is None else x
    L = ["## Máscara de edificado (antes / después)", "",
         "Antes = sin máscara; «exclusión» = celdas edificadas a 0 (huella Catastro ≥ 2 %, recinto MFE "
         "artificial, landuse OSM residencial/industrial); «+ borde» = además ×0,5 con un edificio a ≤ 100 m. "
         "Lift de validación por bloques (entre paréntesis, pliegues) y celdas de tierra ≥ "
         f"{UMBRAL}.", "",
         "| especie | n | lift ajuste antes | lift ajuste exclusión | lift ajuste + borde | lift val. antes "
         "| lift val. exclusión | lift val. + borde | celdas ≥50 antes | celdas ≥50 exclusión | celdas ≥50 + borde |",
         "|---|---|---|---|---|---|---|---|---|---|---|"]
    for clave, d in res.items():
        v = d.get("variantes") or {}
        if not v:
            continue
        a, e, b = v["sin_mascara"], v["exclusion"], v["exclusion_borde"]
        juzga = d["celda"]["n"] >= MIN_OBS
        val = lambda x: f"{f(x['val']['lift_medio'])} ({x['val']['pliegues']})" if juzga else "—"
        aj = lambda x: f(x["celda"]["lift"]) if juzga else "—"
        L.append(f"| {d['nombre']} | {d['celda']['n']} | {aj(a)} | {aj(e)} | {aj(b)} | {val(a)} | {val(e)} | "
                 f"{val(b)} | {a['celdas_buenas']} | {e['celdas_buenas']} | {b['celdas_buenas']} |")
    activo = "borde_urbano" not in DESACTIVADOS_POR_DEFECTO
    L += ["", f"Decisión (n ≥ {MIN_OBS}): " + (
        "la penalización ×0,5 no baja el lift de validación de ninguna especie: se mantiene."
        if mantener else
        f"la penalización ×0,5 baja el lift de validación de {', '.join(bajan)}: se quita y queda solo la "
        "exclusión dura."),
        f"Modelo exportado: borde urbano {'activo' if activo else 'apagado'} "
        "(idoneidad.DESACTIVADOS_POR_DEFECTO)." + ("" if activo == mantener else
                                                   " **No coincide con la decisión: revisar.**"), ""]
    return L


def informe(out_dir: Path, perfiles: dict, raw_dir: Path | None = None) -> Path:
    from .idoneidad import DESACTIVADOS_POR_DEFECTO
    out_dir = Path(out_dir)
    raw_dir = Path(raw_dir) if raw_dir else out_dir.parent / "raw"
    res = calibrar(out_dir, raw_dir, perfiles)
    apagados = sorted(SIN_FACTORES | DESACTIVADOS_POR_DEFECTO)
    L = ["# Calibración con citas (GBIF + iNaturalist + Observation + foros/literatura)", "",
         f"Citas de `data/out/{CITAS}` (citas.py) de la zona de calibración: solo las que caen en celdas de "
         f"tierra dentro de la zona; se descartan las que declaran una incertidumbre > {INCERTIDUMBRE_MAX} m y se "
         f"conservan las que no la declaran. Las de foros o literatura solo cuentan con precisión «punto» (≤ "
         f"{PRECISION_PUNTO_M} m); las de paraje, municipio o sierra no calibran. Las duplicadas entre fuentes ya vienen fundidas (misma especie, < 100 m, mismo día).",
         f"Umbral de idoneidad buena: ≥{UMBRAL}. Lift = % obs. buenas / % zona buena (celdas de tierra).",
         f"Variante «500 m»: puntuación = máximo en una ventana {VENTANA}×{VENTANA} celdas alrededor del punto "
         "(las coordenadas son imprecisas); el % de zona se calcula con el mismo filtro para que el lift sea comparable.",
         f"Con menos de {MIN_OBS} observaciones la especie no se juzga.",
         f"Idoneidad recalculada sin {', '.join(apagados)} (las citas son anteriores a los incendios recientes; "
         "el factor de incendio sí se aplica en las capas exportadas).",
         "",
         "**Ajuste (dentro de muestra)**: lift con todas las observaciones; los perfiles heurísticos se han "
         "revisado mirando observaciones de esta zona, así que es optimista.",
         f"**Validación (bloques)**: la zona se parte en bloques de {BLOQUE_VALIDACION_M / 1000:.0f} km repartidos "
         f"al azar (semilla {SEMILLA_PLIEGUES}) en {PLIEGUES} pliegues; en cada pliegue el lift se mide solo con "
         "sus observaciones y sus celdas de tierra, y se da la media de los pliegues con observaciones "
         "(entre paréntesis, cuántos). Mide si el lift se sostiene en zonas distintas, no un ajuste: "
         "los perfiles no se tocan con ella.", "",
         "| especie | citas | conservadas | sin incert. (conservadas) | en tierra | mediana | %obs≥50 | %zona≥50 "
         "| lift ajuste (dentro de muestra) | lift validación (bloques) "
         "| mediana 500 m | %obs≥50 500 m | %zona≥50 500 m | lift 500 m ajuste | lift 500 m validación (bloques) |",
         "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|"]
    for clave, d in res.items():
        c, v = d["celda"], d["ventana"]
        juzga = c["n"] >= MIN_OBS
        f = lambda x: "—" if x is None else x
        lift = f(c["lift"]) if juzga else f"{f(c['lift'])} (n<{MIN_OBS}, no se juzga)"
        val = lambda x: f"{f(x['lift_medio'])} ({x['pliegues']})" if juzga else "—"
        L.append(f"| {d['nombre']} | {d['n_bruto']} | {d['n_incert_ok']} | {d['n_sin_incert']} | {c['n']} | "
                 f"{f(c['mediana_obs'])} | {c['pct_obs_buenas']} | {c['pct_zona_buena']} | {lift} | "
                 f"{val(d['val_celda'])} | "
                 f"{f(v['mediana_obs'])} | {v['pct_obs_buenas']} | {v['pct_zona_buena']} | {f(v['lift'])} | "
                 f"{val(d['val_ventana'])} |")
    L += [""] + tabla_mascara(res)
    L += ["Fuentes: GBIF.org, iNaturalist, Observation.org (vía GBIF), foros y literatura (citas.py; cada cita "
          "conserva su licencia y atribución). Perfiles: especies.yaml (heurístico v2)."]
    ruta = out_dir / "calibracion.md"
    ruta.write_text("\n".join(L) + "\n")
    mantener, bajan = decidir_borde_urbano(res)
    # Versión legible por máquina (la usa exportar.py para la fiabilidad por especie).
    datos = {clave: {"n": d["celda"]["n"], "lift_ajuste": d["celda"]["lift"],
                     "lift_validacion": d["val_celda"]["lift_medio"], "pliegues": d["val_celda"]["pliegues"],
                     "mascara": {k: {"n": x["celda"]["n"], "lift_ajuste": x["celda"]["lift"],
                                     "lift_validacion": x["val"]["lift_medio"],
                                     "celdas_buenas": x["celdas_buenas"]}
                                 for k, x in d.get("variantes", {}).items()}}
             for clave, d in res.items()}
    datos["_mascara"] = {"mantener_borde_urbano": mantener, "bajan": bajan}
    (out_dir / "calibracion.json").write_text(json.dumps(datos, ensure_ascii=False, indent=1))
    return ruta
