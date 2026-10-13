"""Calibración: ¿caen las observaciones reales de GBIF en celdas de alta idoneidad?"""
from __future__ import annotations
import json, re
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


def clave_taxon(nombre: str) -> int:
    """Clave GBIF aceptada (un sinónimo, p. ej. B. aestivalis → B. reticulatus, da la del aceptado)."""
    j = requests.get(f"{GBIF}/species/match", params={"name": nombre}, timeout=30).json()
    return j.get("acceptedUsageKey") or j["usageKey"]


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
    cache = Path(raw_dir) / "gbif" / (re.sub(r"\W+", "_", perfil["nombre"]).strip("_").lower() + ".json")
    if cache.exists():
        return [tuple(p) for p in json.loads(cache.read_text())]
    wkt = wkt_zona(zona)
    pts = []
    claves = {clave_taxon(n) for n in nombres_cientificos(perfil["nombre"])}   # sin duplicar sinónimos
    for c in claves:
        pts += descargar_ocurrencias(perfil["nombre"], wkt, clave=c)
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


def _en_tierra(malla: Malla, tierra: np.ndarray, p) -> bool:
    f, c = _indices(malla, [p])
    return bool(f.size and tierra[f[0], c[0]])


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


def filtrar_incertidumbre(pts):
    """→ (conservados, n_con_incertidumbre_ok, n_sin_incertidumbre)."""
    ok = [p for p in pts if p[2] is not None and p[2] <= INCERTIDUMBRE_MAX]
    sin = [p for p in pts if p[2] is None]
    return ok + sin, len(ok), len(sin)


def tierra_en_zona(out_dir: Path) -> np.ndarray:
    return (leer_tif(Path(out_dir) / "altitud.tif") != NODATA_F) & (leer_tif(Path(out_dir) / "arbol.tif") != 255)


def calibrar(out_dir: Path, raw_dir: Path, perfiles: dict) -> dict:
    out_dir = Path(out_dir)
    malla = Malla.cargar(out_dir / "malla.json")
    zona = cargar_zona(out_dir / "zona.geojson")
    tierra = tierra_en_zona(out_dir)
    res = {}
    for clave, perfil in perfiles.items():
        r = leer_tif(out_dir / f"idoneidad_{clave}.tif")
        rmax = maximum_filter(np.where(tierra, r, 0), size=VENTANA)
        pts = ocurrencias(perfil, zona, raw_dir)
        kept, n_ok, n_sin = filtrar_incertidumbre(pts)
        xy = a_utm(kept)
        xy_t = [p for p in xy if _en_tierra(malla, tierra, p)]
        res[clave] = {
            "nombre": perfil["nombre"], "n_bruto": len(pts), "n_incert_ok": n_ok, "n_sin_incert": n_sin,
            "n_conservados": len(kept), "xy": xy_t,
            "celda": resumen(valores_en_puntos(malla, r, xy_t), r[tierra]),
            "ventana": resumen(valores_en_puntos(malla, rmax, xy_t), rmax[tierra]),
        }
    return res


def informe(out_dir: Path, perfiles: dict, raw_dir: Path | None = None) -> Path:
    out_dir = Path(out_dir)
    raw_dir = Path(raw_dir) if raw_dir else out_dir.parent / "raw"
    res = calibrar(out_dir, raw_dir, perfiles)
    L = ["# Calibración con GBIF", "",
         f"Observaciones GBIF dentro de la zona (polígono simplificado 2 km). Se descartan los registros con "
         f"`coordinateUncertaintyInMeters` > {INCERTIDUMBRE_MAX} m; los que no la declaran se conservan. "
         "Solo cuentan las que caen en celdas de tierra dentro de la zona.",
         f"Umbral de idoneidad buena: ≥{UMBRAL}. Lift = % obs. buenas / % zona buena (celdas de tierra).",
         f"Variante «500 m»: puntuación = máximo en una ventana {VENTANA}×{VENTANA} celdas alrededor del punto "
         "(las coordenadas GBIF son imprecisas); el % de zona se calcula con el mismo filtro para que el lift sea comparable.",
         f"Con menos de {MIN_OBS} observaciones la especie no se juzga.", "",
         "| especie | n bruto | incert. ≤1 km | sin incert. | en tierra | mediana | %obs≥50 | %zona≥50 | lift "
         "| mediana 500 m | %obs≥50 500 m | %zona≥50 500 m | lift 500 m |",
         "|---|---|---|---|---|---|---|---|---|---|---|---|---|"]
    for clave, d in res.items():
        c, v = d["celda"], d["ventana"]
        juzga = c["n"] >= MIN_OBS
        f = lambda x: "—" if x is None else x
        lift = f(c["lift"]) if juzga else f"{f(c['lift'])} (n<{MIN_OBS}, no se juzga)"
        L.append(f"| {d['nombre']} | {d['n_bruto']} | {d['n_incert_ok']} | {d['n_sin_incert']} | {c['n']} | "
                 f"{f(c['mediana_obs'])} | {c['pct_obs_buenas']} | {c['pct_zona_buena']} | {lift} | "
                 f"{f(v['mediana_obs'])} | {v['pct_obs_buenas']} | {v['pct_zona_buena']} | {f(v['lift'])} |")
    L += ["", "Fuente: GBIF.org (api.gbif.org/v1/occurrence/search). Perfiles: especies.yaml (heurístico v1)."]
    ruta = out_dir / "calibracion.md"
    ruta.write_text("\n".join(L) + "\n")
    return ruta
