"""Fase 2: genera los datos de la app (PMTiles + manifest.json) de una región a partir de data/<region>/out/*.tif.

    uv run python -m setas_pipeline.exportar capas      [--region marbella]   # idoneidad×umbral, sombreado, curvas, protegidos
    uv run python -m setas_pipeline.exportar base       [--region …]          # extracto de Protomaps (red)
    uv run python -m setas_pipeline.exportar meteo      [--region …]          # Fase 3: puntos meteo + teselas de Voronoi
    uv run python -m setas_pipeline.exportar acceso     [--region …]          # Fase 8: acceso.bin/json + aparcamientos.json
    uv run python -m setas_pipeline.exportar rutas      [--region …]          # Fase 8: rutas.pmtiles
    uv run python -m setas_pipeline.exportar sitios     [--region …]          # Fase 9: sitios.json
    uv run python -m setas_pipeline.exportar validacion [--region …]          # solo la clave `validacion` de sitios.json
    uv run python -m setas_pipeline.exportar altitud    [--region …]          # Fase 9: añade la capa altitud a acceso.bin
    uv run python -m setas_pipeline.exportar titularidad [--region …]         # montes públicos, cotos, vallas OSM, pasos públicos
    uv run python -m setas_pipeline.exportar citas      [--region …]          # citas.pmtiles (citas y sitios conocidos)
    uv run python -m setas_pipeline.exportar lugares    [--region …]          # pueblo más cercano en meteo_puntos.json
    uv run python -m setas_pipeline.exportar ccaa       [--region …]          # ccaa.pmtiles (si la región declara capas.ccaa)
    uv run python -m setas_pipeline.exportar micro      [--region …]          # Modo campo: micro.bin/json (valores por celda)
    uv run python -m setas_pipeline.exportar manifest   [--region …]
    uv run python -m setas_pipeline.exportar todo       [--region …]
    uv run python -m setas_pipeline.exportar respaldo   [--region …]          # Fase 7: OsmAnd/Locus (out/respaldo/)
    uv run python -m setas_pipeline.exportar regiones                         # índice pipeline/data/regiones.json

Salida en data/<region>/out/app/ (no se versiona; la app la enlaza en app/public/data).
"""
from __future__ import annotations
import argparse, io, json, math, subprocess, tempfile
from datetime import datetime, timezone
from pathlib import Path
import numpy as np
from PIL import Image
from pyproj import Transformer

from .avisos import leer as leer_avisos
from .malla import Malla, leer_tif
from .region import Region, cargar_region, argumento_region, listar_regiones, DATOS, REGIONES, ESPECIES

UMBRALES = (0, 200, 400, 600, 800, 1000)
ZOOM_IDONEIDAD = (8, 13)
ZOOM_SOMBREADO = (8, 12)
ZOOM_BASE_MAX = 15
EQUIDISTANCIA = 20          # m entre curvas
PRINCIPAL = 100             # curvas maestras
MARGEN_M = 2000             # margen alrededor de la zona para base, curvas y sombreado
PASO_METEO = 12000          # m entre puntos de la rejilla meteo
RADIO_BOSQUE = 6000         # m: un punto meteo se conserva si hay bosque hospedador a esta distancia
IDON_BOSQUE = 30            # idoneidad mínima (cualquier especie) para contar como bosque hospedador
MIN_OBS_FIABILIDAD = 10    # observaciones GBIF mínimas para juzgar una especie (= calibracion.MIN_OBS)
ACCESO_ARCHIVOS = ("acceso.json", "acceso.bin.gz", "aparcamientos.json")   # acceso.bin sin comprimir no se publica
MICRO_ARCHIVOS = ("micro.json", "micro.bin")   # Modo campo (micro.py): teselas gzip, se leen sin descomprimir el total
PROTOMAPS_BUILDS = "https://build-metadata.protomaps.dev/builds.json"
PROTOMAPS_URL = "https://build.protomaps.com/{key}"

# YlGn de ColorBrewer (9 clases), de claro a oscuro; 100 = #004529
_YLGN = ["#ffffe5", "#f7fcb9", "#d9f0a3", "#addd8e", "#78c679",
         "#41ab5d", "#238443", "#006837", "#004529"]


# ---------------------------------------------------------------- lógica pura

def colormap() -> np.ndarray:
    """LUT (101, 4) RGBA: 0 transparente; 1..100 rampa secuencial verde (sin el blanco inicial)."""
    stops = np.array([[int(c[i:i + 2], 16) for i in (1, 3, 5)] for c in _YLGN[2:]], dtype=float)
    t = np.linspace(0, 1, 100)
    pos = np.linspace(0, 1, len(stops))
    rgb = np.stack([np.interp(t, pos, stops[:, k]) for k in range(3)], axis=1)
    lut = np.zeros((101, 4), dtype=np.uint8)
    lut[1:, :3] = np.round(rgb).astype(np.uint8)
    lut[1:, 3] = 255
    return lut


MIN_PINTAR = 30            # por debajo no se pinta en el mapa (el 50 % de las celdas coloreadas estaba en 1–29)


def aplicar_umbral(idon: np.ndarray, dist: np.ndarray, umbral: float, minimo: int = MIN_PINTAR) -> np.ndarray:
    """Deja a 0 (transparente) las celdas a menos de `umbral` m del acceso, sin distancia o con
    idoneidad < `minimo`."""
    out = idon.copy()
    out[out < minimo] = 0
    out[~(dist >= umbral)] = 0
    out[dist < 0] = 0
    return out


def sombreado(dem: np.ndarray, celda: float, nodata: float, azimut=315.0, altura=45.0) -> np.ndarray:
    """Hillshade 0..1 (float32); NaN donde no hay datos."""
    z = dem.astype(np.float32).copy()
    malo = (z == nodata) | ~np.isfinite(z)
    if malo.any():
        z[malo] = np.nanmean(np.where(malo, np.nan, z)) if (~malo).any() else 0
    gy, gx = np.gradient(z, celda)           # gy: hacia el sur (filas), gx: hacia el este
    pend = np.arctan(np.hypot(gx, gy))
    aspecto = np.arctan2(-gx, gy)            # dirección de bajada, desde el norte en sentido horario
    zen = math.radians(90 - altura)
    az = math.radians(azimut)
    s = math.cos(zen) * np.cos(pend) + math.sin(zen) * np.sin(pend) * np.cos(az - aspecto)
    s = np.clip(s, 0, 1).astype(np.float32)
    s[malo] = np.nan
    return s


def _lut_sombreado() -> np.ndarray:
    """Paleta (256, 4) para el sombreado cuantizado 0..254 (255 = sin datos).
    Por debajo del llano: negro con alfa creciente; por encima: blanco suave."""
    llano = round(math.cos(math.radians(45)) * 254)
    lut = np.zeros((256, 4), dtype=np.uint8)
    for v in range(255):
        if v < llano:
            lut[v] = (0, 0, 0, min(170, int((llano - v) / llano * 230)))
        else:
            lut[v] = (255, 255, 255, int((v - llano) / (254 - llano) * 90))
    return lut


def _png_paleta(v: np.ndarray, lut: np.ndarray) -> bytes:
    img = Image.fromarray(v.astype(np.uint8), "P")
    img.putpalette(lut[:, :3].flatten().tolist())
    buf = io.BytesIO()
    img.save(buf, "PNG", optimize=True, transparency=bytes(lut[:, 3].tolist()))
    return buf.getvalue()


_LUT = colormap()
_LUT_S = _lut_sombreado()


def png_idoneidad(v: np.ndarray) -> bytes:
    return _png_paleta(v, _LUT)


def png_sombreado(q: np.ndarray) -> bytes:
    return _png_paleta(q, _LUT_S)


def pixeles_tesela(z: int, x: int, y: int, tam: int = 256):
    """lon/lat (grados) del centro de cada píxel de la tesela XYZ."""
    n = tam * 2 ** z
    i = (np.arange(tam) + 0.5 + x * tam) / n
    j = (np.arange(tam) + 0.5 + y * tam) / n
    lon = i * 360.0 - 180.0
    lat = np.degrees(np.arctan(np.sinh(np.pi * (1 - 2 * j))))
    return np.broadcast_to(lon[None, :], (tam, tam)), np.broadcast_to(lat[:, None], (tam, tam))


def _lonlat_a_xy(lon, lat, z):
    n = 2 ** z
    x = (lon + 180.0) / 360.0 * n
    lat_r = math.radians(lat)
    y = (1 - math.log(math.tan(lat_r) + 1 / math.cos(lat_r)) / math.pi) / 2 * n
    return x, y


def teselas_bbox(bbox, z):
    """Teselas (z, x, y) que tocan bbox=(oeste, sur, este, norte), en orden de fila."""
    x0, y0 = _lonlat_a_xy(bbox[0], bbox[3], z)
    x1, y1 = _lonlat_a_xy(bbox[2], bbox[1], z)
    for x in range(int(x0), int(x1) + 1):
        for y in range(int(y0), int(y1) + 1):
            yield z, x, y


# ---------------------------------------------------------------- puntos meteo (Fase 3)

def rejilla_meteo(zona, paso: float = PASO_METEO) -> list[tuple[float, float]]:
    """Centros de una rejilla de `paso` m sobre el bbox de `zona` (CRS métrico) que caen dentro de ella."""
    from shapely import prepared
    from shapely.geometry import Point
    zp = prepared.prep(zona)
    xmin, ymin, xmax, ymax = zona.bounds
    return [(float(x), float(y))
            for y in np.arange(ymin + paso / 2, ymax, paso)
            for x in np.arange(xmin + paso / 2, xmax, paso)
            if zp.contains(Point(x, y))]


def _ventana(p, malla: Malla, radio: float):
    """Recorte (filas, columnas) de la malla alrededor de p y máscara del disco de `radio` m."""
    c = (p[0] - malla.x0) / malla.celda
    f = (malla.y1 - p[1]) / malla.celda
    r = radio / malla.celda
    f0, f1 = max(0, int(f - r)), min(malla.alto, int(f + r) + 1)
    c0, c1 = max(0, int(c - r)), min(malla.ancho, int(c + r) + 1)
    ff, cc = np.mgrid[f0:f1, c0:c1]
    disco = (ff + 0.5 - f) ** 2 + (cc + 0.5 - c) ** 2 <= r * r
    return (slice(f0, f1), slice(c0, c1)), disco


def con_bosque_cerca(puntos, mascara: np.ndarray, malla: Malla, radio: float = RADIO_BOSQUE) -> list[bool]:
    """Para cada punto, si alguna celda de `mascara` (bosque hospedador) está a ≤ `radio` m."""
    res = []
    for p in puntos:
        sl, disco = _ventana(p, malla, radio)
        res.append(bool((mascara[sl] & disco).any()))
    return res


def alt_media(p, altitud: np.ndarray, mascara: np.ndarray, malla: Malla, radio: float = RADIO_BOSQUE,
              nodata: float = -9999.0) -> float:
    """Altitud media del bosque hospedador en el radio; sin bosque, la del terreno del radio."""
    sl, disco = _ventana(p, malla, radio)
    a = altitud[sl].astype(np.float64)
    valida = disco & (a != nodata) & np.isfinite(a)
    sel = valida & mascara[sl]
    if not sel.any():
        sel = valida
    return float(a[sel].mean()) if sel.any() else float("nan")


def voronoi_zonas(puntos, zona) -> list:
    """Polígonos de Voronoi de los puntos recortados a `zona`, en el mismo orden que `puntos`."""
    from shapely import voronoi_polygons
    from shapely.geometry import MultiPoint, Point
    celdas = list(voronoi_polygons(MultiPoint(puntos), extend_to=zona.envelope.buffer(1000)).geoms)
    res = []
    for p in puntos:
        pt = Point(p)
        c = next(c for c in celdas if c.contains(pt))
        res.append(c.intersection(zona))
    return res


LUGARES_OSM = ("city", "town", "village")


def lugares_osm(pbf: Path) -> list[tuple[str, float, float]]:
    """(nombre, lat, lon) de los nodos OSM place=city|town|village con nombre."""
    import osmium
    res = []
    for n in osmium.FileProcessor(str(pbf), osmium.osm.NODE).with_filter(
            osmium.filter.TagFilter(*(("place", v) for v in LUGARES_OSM))):
        nombre = n.tags.get("name")
        if nombre:
            res.append((nombre, n.location.lat, n.location.lon))
    return res


def lugar_cercano(lat: float, lon: float, lugares: list[tuple[str, float, float]]) -> str | None:
    """Nombre del lugar más cercano (equirectangular; sobra a esta escala)."""
    if not lugares:
        return None
    k = math.cos(math.radians(lat))
    return min(lugares, key=lambda x: (x[1] - lat) ** 2 + ((x[2] - lon) * k) ** 2)[0]


def anotar_lugares(region: Region, out: Path | None = None, pbf: Path | None = None) -> list[dict]:
    """Añade `lugar` (pueblo más cercano, OSM) a meteo_puntos.json sin tocar ids ni coordenadas: el selector
    de especie lo enseña como «activa cerca de Ojén». pbf: el OSM recortado de la región (raw/zona.osm.pbf)."""
    out = out or region.app
    if pbf is None:
        from .adaptadores.osm import pbf_region
        pbf = pbf_region(region, Malla.cargar(region.out / "malla.json"))
    ruta = out / "meteo_puntos.json"
    lista = json.loads(ruta.read_text())
    lug = lugares_osm(pbf)
    for p in lista:
        p["lugar"] = lugar_cercano(p["lat"], p["lon"], lug)
    ruta.write_text(json.dumps(lista, ensure_ascii=False))
    print(f"  lugares: {len(lista)} puntos meteo con nombre ({len(lug)} lugares OSM)", flush=True)
    return lista


def exportar_meteo(region: Region, out: Path | None = None):
    """meteo_puntos.json ({id, lat, lon, alt_media}) y meteo_zonas.pmtiles (Voronoi, capa 'meteo_zonas')."""
    import geopandas as gpd
    out = out or region.app
    malla = Malla.cargar(region.out / "malla.json")
    zona = gpd.read_file(region.out / "zona.geojson").to_crs("EPSG:25830").union_all()
    mascara = None
    for e in especies_activas(region):
        m = leer_tif(region.out / f"idoneidad_{e['id']}.tif") >= IDON_BOSQUE
        mascara = m if mascara is None else (mascara | m)
    altitud = leer_tif(region.out / "altitud.tif")
    todos = rejilla_meteo(zona)
    puntos = [p for p, ok in zip(todos, con_bosque_cerca(todos, mascara, malla)) if ok]
    celdas = voronoi_zonas(puntos, zona)
    tr = Transformer.from_crs("EPSG:25830", "EPSG:4326", always_xy=True)
    lista = []
    for i, p in enumerate(puntos):
        lon, lat = tr.transform(*p)
        lista.append({"id": i, "lat": round(lat, 4), "lon": round(lon, 4),
                      "alt_media": round(alt_media(p, altitud, mascara, malla))})
    out.mkdir(parents=True, exist_ok=True)
    (out / "meteo_puntos.json").write_text(json.dumps(lista, ensure_ascii=False))
    gdf = gpd.GeoDataFrame({"id": list(range(len(puntos)))}, geometry=celdas, crs="EPSG:25830").to_crs("EPSG:4326")
    with tempfile.TemporaryDirectory() as tmp:
        gj = Path(tmp) / "meteo_zonas.geojson"
        gj.write_text(gdf.to_json(drop_id=True))
        _tippecanoe(gj, out / "meteo_zonas.pmtiles", "meteo_zonas", 6, 12,
                    ["--no-tile-size-limit", "--detect-shared-borders", "--no-simplification-of-shared-nodes",
                     "--attribution=Open-Meteo.com CC BY 4.0"])
    print(f"  meteo: {len(puntos)} puntos de {len(todos)} en la rejilla", flush=True)
    return anotar_lugares(region, out)


# ---------------------------------------------------------------- PMTiles

class _Salida:
    def __init__(self, ruta: Path, tipo, nombre: str, descripcion: str):
        from pmtiles.writer import Writer
        self.ruta, self.tipo, self.nombre, self.descripcion = ruta, tipo, nombre, descripcion
        self.f = open(ruta, "wb")
        self.w = Writer(self.f)
        self.teselas = []        # (tileid, bytes) — se ordenan al final

    def poner(self, z, x, y, datos: bytes):
        from pmtiles.tile import zxy_to_tileid
        self.teselas.append((zxy_to_tileid(z, x, y), datos))

    def cerrar(self, bbox, zmin, zmax, atribucion):
        from pmtiles.tile import Compression
        if not self.teselas:
            # Capa sin ninguna celda pintable (p. ej. una especie sin idoneidad ≥ MIN_PINTAR en la región): una
            # tesela transparente en zmin para que el archivo exista y sea válido (pmtiles no admite 0 teselas).
            x, y = (int(v) for v in _lonlat_a_xy((bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2, zmin))
            self.poner(zmin, x, y, png_idoneidad(np.zeros((256, 256), np.uint8)))
        self.teselas.sort(key=lambda t: t[0])
        for tid, d in self.teselas:
            self.w.write_tile(tid, d)
        e7 = lambda v: int(v * 1e7)
        self.w.finalize({
            "tile_type": self.tipo, "tile_compression": Compression.NONE,
            "min_zoom": zmin, "max_zoom": zmax,
            "min_lon_e7": e7(bbox[0]), "min_lat_e7": e7(bbox[1]),
            "max_lon_e7": e7(bbox[2]), "max_lat_e7": e7(bbox[3]),
            "center_zoom": zmin + 2,
            "center_lon_e7": e7((bbox[0] + bbox[2]) / 2), "center_lat_e7": e7((bbox[1] + bbox[3]) / 2),
        }, {"name": self.nombre, "description": self.descripcion, "attribution": atribucion})
        self.f.close()
        return len(self.teselas)


def _indices(malla: Malla, lon, lat, tr):
    X, Y = tr.transform(lon, lat)
    col = np.floor((X - malla.x0) / malla.celda).astype(np.int64)
    fila = np.floor((malla.y1 - Y) / malla.celda).astype(np.int64)
    ok = (col >= 0) & (col < malla.ancho) & (fila >= 0) & (fila < malla.alto)
    return fila.clip(0, malla.alto - 1), col.clip(0, malla.ancho - 1), ok


def _contexto(region: Region, zona=None):
    from .adaptadores import contexto_region
    return contexto_region(region, zona=zona)


def _bbox_zona(region: Region, margen=MARGEN_M):
    import geopandas as gpd
    z = gpd.read_file(region.out / "zona.geojson").to_crs("EPSG:25830")
    z = z.buffer(margen).to_crs("EPSG:4326")
    return tuple(float(v) for v in z.total_bounds), z.union_all()


def fiabilidad(n: int | None, lift_validacion: float | None) -> str:
    """Fiabilidad del mapa de una especie según la validación por bloques de calibracion.py:
    con n ≥ MIN_OBS, «buena» si el lift retenido ≥ 2, «media» si ≥ 1,3, «baja» si menos; si no, «sin_validar»."""
    if n is None or n < MIN_OBS_FIABILIDAD or lift_validacion is None:
        return "sin_validar"
    if lift_validacion >= 2:
        return "buena"
    return "media" if lift_validacion >= 1.3 else "baja"


def calibrado(n: int | None, lift_validacion: float | None) -> bool:
    """La validación confirma el modelo: fiabilidad «media» o «buena». Con «baja» (lift retenido < 1,3,
    p. ej. P. eryngii 0,0 o Agaricus 1,01 en Alicante) el mapa no supera al azar: la app dice «sin validar»."""
    return fiabilidad(n, lift_validacion) in ("buena", "media")


def _calibracion(region: Region) -> dict:
    ruta = region.out / "calibracion.json"
    return json.loads(ruta.read_text()) if ruta.exists() else {}


def validacion_sitios(cal: dict) -> dict:
    """Clave `validacion` de sitios.json (indicador «≈N× la media» de la app) desde calibracion.json en memoria:
    {especie: {calibrado, n, tramos: [{desde, hasta, lift, obs}]}}. Sin lift_tramos, tramos = []."""
    return {k: {"calibrado": calibrado(d.get("n"), d.get("lift_validacion")), "n": d.get("n"),
                "tramos": [{c: t[c] for c in ("desde", "hasta", "lift", "obs")} for t in d.get("lift_tramos") or []]}
            for k, d in cal.items() if not k.startswith("_") and isinstance(d, dict)}


def anadir_validacion(region: Region, datos: dict) -> dict:
    """Pone `validacion` (de region.out/calibracion.json) en sitios.json en memoria; lo devuelve."""
    datos["validacion"] = validacion_sitios(_calibracion(region))
    return datos


def especies(region: Region) -> list[dict]:
    """Especies de la región en el orden de especies.yaml (activas y sin hábitat), con overrides aplicados."""
    from .idoneidad import cargar_perfiles
    cal = _calibracion(region)
    perfiles = region.perfiles(cargar_perfiles(ESPECIES), incluir_sin_habitat=True)
    return [{"id": k, "nombre": v["nombre"], **({"tiempo": v["tiempo"]} if "tiempo" in v else {}),
             "fiabilidad": fiabilidad(cal.get(k, {}).get("n"), cal.get(k, {}).get("lift_validacion")),
             "n_citas": cal.get(k, {}).get("n"),
             # Fase C: false = perfil heurístico sin validar con citas en esta zona (n < MIN_OBS o sin lift).
             "calibrado": calibrado(cal.get(k, {}).get("n"), cal.get(k, {}).get("lift_validacion")),
             "sin_habitat": k in region.especies_sin_habitat}
            for k, v in perfiles.items()]


def especies_activas(region: Region) -> list[dict]:
    """Las que tienen capas (las `sin_habitat` no exportan pmtiles, spec §3.5)."""
    return [e for e in especies(region) if not e["sin_habitat"]]


def exportar_rasters(region: Region, malla: Malla, out: Path | None = None):
    """Idoneidad (especie × umbral) y sombreado, como PMTiles PNG."""
    from pmtiles.tile import TileType
    from shapely import prepared
    from shapely.geometry import box
    out = out or region.app
    out.mkdir(parents=True, exist_ok=True)
    bbox, zona = _bbox_zona(region)
    zona_p = prepared.prep(zona)
    tr = Transformer.from_crs("EPSG:4326", "EPSG:25830", always_xy=True)
    dist = leer_tif(region.out / "distancia_acceso.tif")
    capas = {}   # nombre → array uint8 0..100
    for e in especies_activas(region):
        idon = leer_tif(region.out / f"idoneidad_{e['id']}.tif")
        for u in UMBRALES:
            capas[f"idoneidad_{e['id']}_{u}"] = aplicar_umbral(idon, dist, u)
    salidas = {k: _Salida(out / f"{k}.pmtiles", TileType.PNG, k, "Idoneidad 0–100 (heurística)")
               for k in capas}
    s = sombreado(leer_tif(region.out / "altitud.tif"), malla.celda, -9999.0)
    q = np.where(np.isnan(s), 255, np.round(np.nan_to_num(s) * 254)).astype(np.uint8)
    sal_s = _Salida(out / "sombreado.pmtiles", TileType.PNG, "sombreado", "Sombreado del relieve (IGN MDT, 100 m)")
    zmin = min(ZOOM_IDONEIDAD[0], ZOOM_SOMBREADO[0])
    zmax = max(ZOOM_IDONEIDAD[1], ZOOM_SOMBREADO[1])
    for z in range(zmin, zmax + 1):
        n = 0
        for _, x, y in teselas_bbox(bbox, z):
            lo = pixeles_tesela(z, x, y)
            tb = box(lo[0][0, 0], lo[1][-1, 0], lo[0][0, -1], lo[1][0, 0])
            if not zona_p.intersects(tb):
                continue
            fila, col, ok = _indices(malla, *lo, tr)
            if ZOOM_IDONEIDAD[0] <= z <= ZOOM_IDONEIDAD[1]:
                for k, a in capas.items():
                    v = np.where(ok, a[fila, col], 0)
                    if v.any():
                        salidas[k].poner(z, x, y, png_idoneidad(v))
            if ZOOM_SOMBREADO[0] <= z <= ZOOM_SOMBREADO[1]:
                v = np.where(ok, q[fila, col], 255)
                if (v != 255).any():
                    sal_s.poner(z, x, y, png_sombreado(v))
            n += 1
        print(f"  z{z}: {n} teselas", flush=True)
    atr_i = region.atribuciones["idoneidad"]
    for k, sal in salidas.items():
        sal.cerrar(bbox, *ZOOM_IDONEIDAD, atr_i)
    sal_s.cerrar(bbox, *ZOOM_SOMBREADO, "IGN CC BY 4.0")


def _tippecanoe(geojson: Path, destino: Path, capa: str, zmin: int, zmax: int, extra=()):
    destino.unlink(missing_ok=True)
    subprocess.run(["tippecanoe", "-q", "-f", "-o", str(destino), "-l", capa,
                    "-Z", str(zmin), "-z", str(zmax), *extra, str(geojson)], check=True)


def exportar_curvas(region: Region, malla: Malla, out: Path | None = None):
    """Curvas de nivel cada 20 m (maestras cada 100 m) → curvas.pmtiles (capa 'curvas')."""
    import contourpy
    from shapely.geometry import LineString
    from rasterio.features import rasterize
    import geopandas as gpd
    out = out or region.app
    dem = leer_tif(region.out / "altitud.tif").astype(np.float64)
    zona = gpd.read_file(region.out / "zona.geojson").to_crs("EPSG:25830").buffer(MARGEN_M).union_all()
    dentro = rasterize([(zona, 1)], out_shape=dem.shape, transform=malla.transform, fill=0,
                       dtype="uint8").astype(bool)
    mask = (dem == -9999.0) | ~dentro
    xs = malla.x0 + (np.arange(malla.ancho) + 0.5) * malla.celda
    ys = malla.y1 - (np.arange(malla.alto) + 0.5) * malla.celda
    gen = contourpy.contour_generator(xs, ys, np.ma.array(dem, mask=mask),
                                      line_type=contourpy.LineType.Separate)
    tr = Transformer.from_crs("EPSG:25830", "EPSG:4326", always_xy=True)
    vmax = float(dem[~mask].max())
    with tempfile.TemporaryDirectory() as tmp:
        gj = Path(tmp) / "curvas.geojsonseq"
        n = 0
        with open(gj, "w") as f:
            for ele in range(EQUIDISTANCIA, int(vmax) + 1, EQUIDISTANCIA):
                principal = ele % PRINCIPAL == 0
                for linea in gen.lines(ele):
                    if len(linea) < 3:
                        continue
                    ls = LineString(linea).simplify(15)
                    lon, lat = tr.transform(*np.asarray(ls.coords).T)
                    feat = {"type": "Feature",
                            "tippecanoe": {"minzoom": 10 if principal else 12},
                            "properties": {"ele": ele, "principal": principal},
                            "geometry": {"type": "LineString",
                                         "coordinates": np.round(np.c_[lon, lat], 6).tolist()}}
                    f.write(json.dumps(feat) + "\n")
                    n += 1
        print(f"  curvas: {n} líneas", flush=True)
        _tippecanoe(gj, out / "curvas.pmtiles", "curvas", 10, 14,
                    ["-P", "--no-feature-limit", "--no-tile-size-limit", "--simplification=2",
                     "--attribution=IGN CC BY 4.0"])


def exportar_protegidos(region: Region, out: Path | None = None):
    """Espacios naturales protegidos (capa `protegidos` de la región, caché de la Fase 1) → protegidos.pmtiles."""
    from .adaptadores import cargar_capa
    out = out or region.app
    ctx = _contexto(region)
    gdf = cargar_capa("protegidos", region.capas, ctx).drop_duplicates(subset="codigo")
    gdf = gdf[gdf.intersects(ctx.zona)]
    gdf = gdf[["nombre", "figura", "geometry"]].to_crs("EPSG:4326")
    with tempfile.TemporaryDirectory() as tmp:
        gj = Path(tmp) / "protegidos.geojson"
        gj.write_text(gdf.to_json())
        _tippecanoe(gj, out / "protegidos.pmtiles", "protegidos", 6, 13,
                    ["--no-tile-size-limit", "--detect-shared-borders",
                     f"--attribution={region.atribuciones['protegidos']}"])
    print(f"  protegidos: {len(gdf)} espacios", flush=True)


def restricciones_gdf(region: Region):
    """Capa legal de la región (capa `restricciones`: p. ej. Zonas de Reserva PORN, Reservas Naturales,
    Parque Nacional) recortada a la zona, con el texto de legal.tipos_restriccion. EPSG:4326."""
    from .adaptadores import cargar_capa
    ctx = _contexto(region)
    gdf = cargar_capa("restricciones", region.capas, ctx)
    gdf = gdf[gdf.intersects(ctx.zona)].copy()
    gdf["texto"] = gdf["tipo"].map(region.legal["tipos_restriccion"])
    return gdf.to_crs("EPSG:4326")


ZOOM_CCAA = (4, 10)          # la app consulta el punto en la tesela del nivel máximo


def exportar_ccaa(region: Region, out: Path | None = None):
    """Comunidades autónomas (capa `ccaa` de la región) recortadas a la zona + margen → ccaa.pmtiles (capa
    'ccaa', propiedades id y nombre). Solo si la región declara capas.ccaa."""
    import geopandas as gpd
    from .adaptadores import cargar_capa
    out = out or region.app
    if "ccaa" not in region.capas:
        return None
    ctx = _contexto(region)
    zona = ctx.zona.buffer(MARGEN_M)
    g = cargar_capa("ccaa", region.capas, ctx)
    g = g[g.intersects(zona)].copy()
    g["geometry"] = [x.intersection(zona).simplify(20) for x in g.geometry]
    g = gpd.GeoDataFrame(g[["id", "nombre", "geometry"]], crs="EPSG:25830").to_crs("EPSG:4326")
    with tempfile.TemporaryDirectory() as tmp:
        gj = Path(tmp) / "ccaa.geojson"
        gj.write_text(g.to_json(drop_id=True))
        _tippecanoe(gj, out / "ccaa.pmtiles", "ccaa", *ZOOM_CCAA,
                    ["--no-tile-size-limit", "--detect-shared-borders",
                     f"--attribution={region.atribuciones.get('ccaa', 'IGN CC BY 4.0')}"])
    print(f"  ccaa: {g['id'].tolist()}", flush=True)
    return g


def exportar_restricciones(region: Region, out: Path | None = None):
    out = out or region.app
    gdf = restricciones_gdf(region)
    with tempfile.TemporaryDirectory() as tmp:
        gj = Path(tmp) / "restricciones.geojson"
        gj.write_text(gdf.to_json())
        _tippecanoe(gj, out / "restricciones.pmtiles", "restricciones", 6, 14,
                    ["--no-tile-size-limit", "--detect-shared-borders",
                     f"--attribution={region.atribuciones['restricciones']}"])
    print(f"  restricciones: {len(gdf)} recintos {gdf['tipo'].value_counts().to_dict()}", flush=True)
    return gdf


# Capa «Citas y sitios conocidos» (2026-10-15): puntos de citas.geojson dentro del mapa base.
ORIGENES_CITAS = ("foro", "literatura", "inat", "observation", "gbif", "imba")
ID_CITAS_A_PIPELINE = {"boletus_reticulatus": "boletus_aestivalis"}     # id de la guía → clave de especies.yaml


def citas_capa(citas: dict, bbox) -> list[dict]:
    """Features de la capa de citas dentro de bbox=(oeste, sur, este, norte), con la especie del mapa
    (`especie_mapa`, clave de especies.yaml) además del id de la guía."""
    out = []
    for f in citas.get("features", []):
        p = f["properties"]
        if not (bbox[0] <= p["lon"] <= bbox[2] and bbox[1] <= p["lat"] <= bbox[3]):
            continue
        q = {k: p.get(k) for k in ("especie", "fecha", "precision_m", "origen", "fuente", "url", "licencia",
                                   "atribucion", "confianza")}
        q["especie_mapa"] = ID_CITAS_A_PIPELINE.get(p["especie"], p["especie"])
        q["fecha"] = (q["fecha"] or "")[:10] or None
        out.append({"type": "Feature", "geometry": f["geometry"], "properties": {k: v for k, v in q.items()
                                                                                 if v is not None}})
    return out


def exportar_citas(region: Region, out: Path | None = None) -> dict:
    from collections import Counter
    out = out or region.app
    ruta = region.out / "citas.geojson"
    if not ruta.exists():
        print(f"  WARNING: falta {ruta} (uv run python -m setas_pipeline.citas --region {region.id})", flush=True)
        return {}
    bbox, _ = _bbox_zona(region)
    feats = citas_capa(json.loads(ruta.read_text()), bbox)
    with tempfile.TemporaryDirectory() as tmp:
        gj = Path(tmp) / "citas.geojson"
        gj.write_text(json.dumps({"type": "FeatureCollection", "features": feats}, ensure_ascii=False))
        _tippecanoe(gj, out / "citas.pmtiles", "citas", 6, 14,
                    ["-r1", "--no-feature-limit", "--no-tile-size-limit",
                     "--attribution=GBIF.org · iNaturalist · Observation.org · foros y literatura (cada cita con su licencia)"])
    res = {"n": len(feats), "por_origen": dict(Counter(f["properties"]["origen"] for f in feats))}
    (region.out / "citas_capa.json").write_text(json.dumps(res, ensure_ascii=False))
    print(f"  citas: {res}", flush=True)
    return res


def zoom_base_max(region: Region) -> int:
    """Zoom máximo del mapa base de la región. Alicante usa 14: a 15 su base pasa de 100 MB (límite de GitHub)."""
    return int(region.zona.get("base_maxzoom", ZOOM_BASE_MAX))


def exportar_base(region: Region, out: Path | None = None, maxzoom: int = ZOOM_BASE_MAX, build: str | None = None):
    """Extracto del build diario de Protomaps recortado a la zona (+ margen)."""
    import requests
    out = out or region.app
    out.mkdir(parents=True, exist_ok=True)
    if build is None:
        build = requests.get(PROTOMAPS_BUILDS, timeout=60).json()[-1]["key"]
    _, zona = _bbox_zona(region)
    contorno = out.parent / "region_base.geojson"
    contorno.write_text(json.dumps({"type": "Feature", "properties": {},
                                    "geometry": zona.simplify(0.005).__geo_interface__}))
    destino = out / "base.pmtiles"
    subprocess.run(["pmtiles", "extract", PROTOMAPS_URL.format(key=build), str(destino),
                    f"--region={contorno}", f"--maxzoom={maxzoom}", "--download-threads=8"], check=True)
    (out.parent / "base_build.txt").write_text(f"{build} maxzoom={maxzoom}\n")
    return destino


def escribir_manifest(region: Region, out: Path | None = None) -> dict:
    out = out or region.app
    extra = ["meteo_puntos.json", *ACCESO_ARCHIVOS, "sitios.json", *MICRO_ARCHIVOS]
    rutas = sorted(out.glob("*.pmtiles")) + [out / n for n in extra if (out / n).exists()]
    archivos = [{"nombre": p.name, "bytes": p.stat().st_size} for p in rutas]
    bbox, _ = _bbox_zona(region, 0)
    build = (out.parent / "base_build.txt")
    m = {
        "generado": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        # Multi-región (2026-10-15): de qué región es este manifest y su normativa por comunidad autónoma.
        "region": {"id": region.id, "nombre": region.nombre, "origen": list(region.origen),
                   "etiqueta_origen": region.etiqueta_origen},
        "legal": {"ccaa": region.legal["ccaa"],
                  # Fase C: textos por región del popup de espacio protegido y del chip de sitio restringido (si
                  # la región no los declara, la app usa los de siempre).
                  **{k: region.legal[k] for k in ("texto_protegido", "chip_sitio_restringido") if k in region.legal}},
        # Atribuciones de la región (yaml `atribuciones`): la app cita su fuente en popups y en Ajustes.
        "atribuciones": region.atribuciones,
        "bbox": [round(v, 5) for v in bbox],
        "especies": especies(region),
        "umbrales": list(UMBRALES),
        "zoom": {"idoneidad": list(ZOOM_IDONEIDAD), "sombreado": list(ZOOM_SOMBREADO),
                 "base_max": zoom_base_max(region)},
        "base": build.read_text().strip() if build.exists() else None,
        "meteo": ({"puntos": "meteo_puntos.json", "zonas": "meteo_zonas.pmtiles"}
                  if (out / "meteo_puntos.json").exists() else None),
        # Fase 8: acceso a pie (binario + cabecera + aparcamientos) y rutas señalizadas.
        "acceso": ({"cabecera": "acceso.json", "datos": "acceso.bin.gz", "aparcamientos": "aparcamientos.json"}
                   if all((out / n).exists() for n in ACCESO_ARCHIVOS) else None),
        "rutas": "rutas.pmtiles" if (out / "rutas.pmtiles").exists() else None,
        # Modo campo (2026-10-18): idoneidad y factores por celda en teselas (micro.py).
        "micro": ({"cabecera": "micro.json", "datos": "micro.bin"}
                  if all((out / n).exists() for n in MICRO_ARCHIVOS) else None),
        # Modelo v2: capa legal (Zonas de Reserva de los PORN, Reservas Naturales, Parque Nacional).
        "restricciones": ({"capa": "restricciones.pmtiles", "tipos": region.legal["tipos_restriccion"],
                           "aviso": region.legal["aviso"]}
                          if (out / "restricciones.pmtiles").exists() else None),
        # 2026-10-15: titularidad (montes públicos, cotos, señales OSM, pasos públicos) y citas conocidas.
        "titularidad": (titularidad_manifest(region) if (out / "titularidad.pmtiles").exists() else None),
        "citas": ({"capa": "citas.pmtiles", **_leer_json(region.out / "citas_capa.json")}
                  if (out / "citas.pmtiles").exists() else None),
        # Fase 9: sitios candidatos por especie (también en la descarga offline, vía `archivos`).
        "sitios": sitios_manifest(out),
        # Fase C: comunidades autónomas (normativa del punto) y avisos de datos (fuentes caídas, celdas NODATA).
        "ccaa": "ccaa.pmtiles" if (out / "ccaa.pmtiles").exists() else None,
        "avisos": leer_avisos(region.out),
        "archivos": archivos,
        "total_bytes": sum(a["bytes"] for a in archivos),
    }
    # Reconocedor (modelo/construir.py): descarga opcional aparte; no cuenta en archivos ni en total_bytes.
    modelo = modelo_disponible(out, region.datos / "modelo")
    if modelo:
        m["modelo"] = modelo
    (out / "manifest.json").write_text(json.dumps(m, ensure_ascii=False, indent=1))
    return m


def escribir_regiones(datos: Path = DATOS, regiones: Path = REGIONES) -> list[dict]:
    """Índice de regiones para la app (spec §3.7): data/regiones.json. Solo las que ya tienen manifest."""
    lista = []
    for rid in listar_regiones(regiones):
        r = cargar_region(rid, regiones=regiones, datos=datos)
        ruta = r.app / "manifest.json"
        if not ruta.exists():
            print(f"  regiones: {rid} sin manifest ({ruta}); no entra en el índice", flush=True)
            continue
        m = json.loads(ruta.read_text())
        lista.append({"id": r.id, "nombre": r.nombre, "origen": list(r.origen), "bbox": m["bbox"],
                      "total_bytes": m["total_bytes"], "generado": m["generado"]})
    Path(datos).mkdir(parents=True, exist_ok=True)
    (Path(datos) / "regiones.json").write_text(json.dumps(lista, ensure_ascii=False, indent=1))
    return lista


def _leer_json(ruta: Path) -> dict:
    return json.loads(ruta.read_text()) if ruta.exists() else {}


def titularidad_manifest(region: Region) -> dict:
    t = region.legal["titularidad"]
    return {"capa": "titularidad.pmtiles", "textos": t["textos"], "aviso": t["aviso"], "norma": t["norma"],
            **_leer_json(region.out / "titularidad_resumen.json")}


def sitios_manifest(out: Path) -> dict | None:
    """Clave `sitios` del manifest: {archivo, version, n_por_especie} si existe sitios.json."""
    ruta = out / "sitios.json"
    if not ruta.exists():
        return None
    d = json.loads(ruta.read_text())
    return {"archivo": "sitios.json", "version": d["version"],
            "n_por_especie": {k: len(v) for k, v in d["especies"].items()}}


def modelo_disponible(out: Path, compartido: Path | None = None) -> dict | None:
    """Clave `modelo` del manifest (reconocedor): de paquete.json de la carpeta compartida data/modelo/ (fase D1,
    la escribe modelo/construir.py) o de la antigua out/modelo/; si no hay, del manifest anterior. Solo si existen
    todos los archivos que cita; si no, aviso y None."""
    carpetas = [c for c in (compartido, out / "modelo") if c is not None and c.exists()]
    previo = out / "manifest.json"
    con_paquete = [c for c in carpetas if (c / "paquete.json").exists()]
    if con_paquete:
        carpeta = con_paquete[0]
        modelo = json.loads((carpeta / "paquete.json").read_text())
    elif previo.exists() and "modelo" in (anterior := json.loads(previo.read_text())):
        carpeta = carpetas[0] if carpetas else out / "modelo"
        modelo = anterior["modelo"]
    else:
        return None
    faltan = [a["nombre"] for a in modelo.get("archivos", []) if not (carpeta / a["nombre"]).exists()]
    if faltan:
        print(f"  WARNING: el reconocedor no se publica en el manifest; faltan en {carpeta}: {', '.join(faltan)}", flush=True)
        return None
    return modelo


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("pasos", nargs="+", choices=["capas", "restricciones", "ccaa", "titularidad", "citas", "lugares", "base",
                                                 "meteo", "acceso", "altitud", "rutas", "sitios", "validacion", "micro", "manifest",
                                                 "respaldo", "regiones", "todo"])
    ap.add_argument("--maxzoom", type=int, default=None,
                    help="zoom máximo del mapa base (por defecto zona.base_maxzoom de la región, o 15)")
    argumento_region(ap)
    a = ap.parse_args(argv)
    pasos = set(a.pasos)
    if pasos == {"regiones"}:
        lista = escribir_regiones()
        print(f"regiones.json: {[r['id'] for r in lista]}")
        return
    region = cargar_region(a.region)
    malla = Malla.cargar(region.out / "malla.json")
    if pasos & {"capas", "todo"}:
        print("rasters…", flush=True); exportar_rasters(region, malla)
        print("curvas…", flush=True); exportar_curvas(region, malla)
        print("protegidos…", flush=True); exportar_protegidos(region)
        print("restricciones…", flush=True); exportar_restricciones(region)
    if pasos & {"capas", "ccaa", "todo"} and "ccaa" in region.capas:
        print("ccaa…", flush=True); exportar_ccaa(region)
    if pasos == {"restricciones"}:
        print("restricciones…", flush=True); exportar_restricciones(region)
    if pasos & {"titularidad", "todo"}:
        from .titularidad import construir as construir_titularidad, tiene_titularidad
        if tiene_titularidad(region):
            print("titularidad…", flush=True); construir_titularidad(region)
        else:
            print(f"titularidad: la región {region.id} no declara capas de titularidad; se omite", flush=True)
    if pasos & {"citas", "capas", "todo"}:
        print("citas…", flush=True); exportar_citas(region)
    if pasos & {"base", "todo"}:
        exportar_base(region, maxzoom=a.maxzoom or zoom_base_max(region))
    if pasos & {"meteo", "todo"}:
        print("meteo…", flush=True); exportar_meteo(region)
    elif "lugares" in pasos:
        print("lugares…", flush=True); anotar_lugares(region)
    if pasos & {"acceso", "todo"}:
        from .acceso import calcular
        print("acceso…", flush=True); calcular(region)
    if "altitud" in pasos and not pasos & {"acceso", "todo"}:     # acceso ya escribe la altitud
        from .acceso import anadir_altitud
        print("altitud en acceso…", flush=True); anadir_altitud(region)
    if pasos & {"sitios", "todo"}:
        from .sitios import calcular as calcular_sitios
        print("sitios…", flush=True); calcular_sitios(region)
    elif "validacion" in pasos:                   # rehace solo `validacion` sobre el sitios.json ya escrito
        ruta = region.app / "sitios.json"
        d = anadir_validacion(region, json.loads(ruta.read_text()))
        ruta.write_text(json.dumps(d, ensure_ascii=False, separators=(",", ":")))
        print(f"validacion: {sum(1 for v in d['validacion'].values() if v['tramos'])} especies con tramos", flush=True)
    if pasos & {"micro", "todo"}:
        from .micro import exportar_micro
        print("micro…", flush=True); exportar_micro(region, malla)
    if pasos & {"rutas", "todo"}:
        from .rutas import construir
        print("rutas…", flush=True); construir(region)
    if pasos <= {"respaldo", "regiones"} and "respaldo" in pasos:
        from .respaldo import exportar_respaldo
        print("respaldo…", flush=True); exportar_respaldo(region, malla)
        if "regiones" in pasos:
            lista = escribir_regiones()
            print(f"regiones.json: {[r['id'] for r in lista]}")
        return
    m = escribir_manifest(region)
    print(f"manifest {region.id}: {len(m['archivos'])} archivos, {m['total_bytes'] / 1e6:.1f} MB")
    if "regiones" in pasos:                       # el índice va después del manifest que acaba de cambiar
        lista = escribir_regiones()
        print(f"regiones.json: {[r['id'] for r in lista]}")


if __name__ == "__main__":
    main()
