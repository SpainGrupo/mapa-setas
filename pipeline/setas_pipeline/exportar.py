"""Fase 2: genera los datos de la app (PMTiles + manifest.json) a partir de data/out/*.tif.

    uv run python -m setas_pipeline.exportar capas      # idoneidad×umbral, sombreado, curvas, protegidos
    uv run python -m setas_pipeline.exportar base       # extracto de Protomaps (red)
    uv run python -m setas_pipeline.exportar meteo      # Fase 3: puntos meteo + teselas de Voronoi
    uv run python -m setas_pipeline.exportar manifest
    uv run python -m setas_pipeline.exportar todo
    uv run python -m setas_pipeline.exportar respaldo  # Fase 7: OsmAnd/Locus (data/out/respaldo/)

Salida en data/out/app/ (no se versiona; la app la enlaza en app/public/data).
"""
from __future__ import annotations
import argparse, io, json, math, subprocess, tempfile
from datetime import datetime, timezone
from pathlib import Path
import numpy as np
import yaml
from PIL import Image
from pyproj import Transformer

from .malla import Malla, leer_tif

BASE = Path(__file__).resolve().parent.parent
OUT = BASE / "data/out"
APP = OUT / "app"
ESPECIES = BASE / "especies.yaml"
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


def aplicar_umbral(idon: np.ndarray, dist: np.ndarray, umbral: float) -> np.ndarray:
    """Deja a 0 (transparente) las celdas a menos de `umbral` m del acceso o sin distancia."""
    out = idon.copy()
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


def exportar_meteo(out: Path = APP):
    """meteo_puntos.json ({id, lat, lon, alt_media}) y meteo_zonas.pmtiles (Voronoi, capa 'meteo_zonas')."""
    import geopandas as gpd
    malla = Malla.cargar(OUT / "malla.json")
    zona = gpd.read_file(OUT / "zona.geojson").to_crs("EPSG:25830").union_all()
    mascara = None
    for e in especies():
        m = leer_tif(OUT / f"idoneidad_{e['id']}.tif") >= IDON_BOSQUE
        mascara = m if mascara is None else (mascara | m)
    altitud = leer_tif(OUT / "altitud.tif")
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
    return lista


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


def _bbox_zona(margen=MARGEN_M):
    import geopandas as gpd
    z = gpd.read_file(OUT / "zona.geojson").to_crs("EPSG:25830")
    z = z.buffer(margen).to_crs("EPSG:4326")
    return tuple(float(v) for v in z.total_bounds), z.union_all()


def especies() -> list[dict]:
    d = yaml.safe_load(ESPECIES.read_text())
    return [{"id": k, "nombre": v["nombre"], **({"tiempo": v["tiempo"]} if "tiempo" in v else {})}
            for k, v in d.items()]


def exportar_rasters(malla: Malla, out: Path = APP):
    """Idoneidad (especie × umbral) y sombreado, como PMTiles PNG."""
    from pmtiles.tile import TileType
    from shapely import prepared
    from shapely.geometry import box
    out.mkdir(parents=True, exist_ok=True)
    bbox, zona = _bbox_zona()
    zona_p = prepared.prep(zona)
    tr = Transformer.from_crs("EPSG:4326", "EPSG:25830", always_xy=True)
    dist = leer_tif(OUT / "distancia_acceso.tif")
    capas = {}   # nombre → array uint8 0..100
    for e in especies():
        idon = leer_tif(OUT / f"idoneidad_{e['id']}.tif")
        for u in UMBRALES:
            capas[f"idoneidad_{e['id']}_{u}"] = aplicar_umbral(idon, dist, u)
    salidas = {k: _Salida(out / f"{k}.pmtiles", TileType.PNG, k, "Idoneidad 0–100 (heurística)")
               for k in capas}
    s = sombreado(leer_tif(OUT / "altitud.tif"), malla.celda, -9999.0)
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
    atr_i = "IGN CC BY 4.0 · © MITECO MFE · IGME · REDIAM CC BY 4.0 · © OpenStreetMap ODbL"
    for k, sal in salidas.items():
        sal.cerrar(bbox, *ZOOM_IDONEIDAD, atr_i)
    sal_s.cerrar(bbox, *ZOOM_SOMBREADO, "IGN CC BY 4.0")


def _tippecanoe(geojson: Path, destino: Path, capa: str, zmin: int, zmax: int, extra=()):
    destino.unlink(missing_ok=True)
    subprocess.run(["tippecanoe", "-q", "-f", "-o", str(destino), "-l", capa,
                    "-Z", str(zmin), "-z", str(zmax), *extra, str(geojson)], check=True)


def exportar_curvas(malla: Malla, out: Path = APP):
    """Curvas de nivel cada 20 m (maestras cada 100 m) → curvas.pmtiles (capa 'curvas')."""
    import contourpy
    from shapely.geometry import LineString
    from rasterio.features import rasterize
    import geopandas as gpd
    dem = leer_tif(OUT / "altitud.tif").astype(np.float64)
    zona = gpd.read_file(OUT / "zona.geojson").to_crs("EPSG:25830").buffer(MARGEN_M).union_all()
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


def exportar_protegidos(out: Path = APP):
    """Espacios naturales protegidos (REDIAM RENPA, caché de la Fase 1) → protegidos.pmtiles."""
    import geopandas as gpd
    import pandas as pd
    trozos = [gpd.read_file(p) for p in sorted((BASE / "data/raw/enp").glob("*_0.json"))]
    gdf = pd.concat([t for t in trozos if len(t)], ignore_index=True)
    gdf = gpd.GeoDataFrame(gdf, geometry="geometry", crs=trozos[0].crs).to_crs("EPSG:25830")
    gdf = gdf.drop_duplicates(subset="CODIGOESPA")
    zona = gpd.read_file(OUT / "zona.geojson").to_crs("EPSG:25830").union_all()
    gdf = gdf[gdf.intersects(zona)]
    gdf = gdf.assign(nombre=gdf["NOMBRE"].str.strip(), figura=gdf["FIGURA"].str.strip())
    gdf = gdf[["nombre", "figura", "geometry"]].to_crs("EPSG:4326")
    with tempfile.TemporaryDirectory() as tmp:
        gj = Path(tmp) / "protegidos.geojson"
        gj.write_text(gdf.to_json())
        _tippecanoe(gj, out / "protegidos.pmtiles", "protegidos", 6, 13,
                    ["--no-tile-size-limit", "--detect-shared-borders",
                     "--attribution=REDIAM CC BY 4.0"])
    print(f"  protegidos: {len(gdf)} espacios", flush=True)


def exportar_base(out: Path = APP, maxzoom: int = ZOOM_BASE_MAX, build: str | None = None):
    """Extracto del build diario de Protomaps recortado a la zona (+ margen)."""
    import requests
    out.mkdir(parents=True, exist_ok=True)
    if build is None:
        build = requests.get(PROTOMAPS_BUILDS, timeout=60).json()[-1]["key"]
    _, zona = _bbox_zona()
    region = out.parent / "region_base.geojson"
    region.write_text(json.dumps({"type": "Feature", "properties": {},
                                  "geometry": zona.simplify(0.005).__geo_interface__}))
    destino = out / "base.pmtiles"
    subprocess.run(["pmtiles", "extract", PROTOMAPS_URL.format(key=build), str(destino),
                    f"--region={region}", f"--maxzoom={maxzoom}", "--download-threads=8"], check=True)
    (out.parent / "base_build.txt").write_text(f"{build} maxzoom={maxzoom}\n")
    return destino


def escribir_manifest(out: Path = APP) -> dict:
    rutas = sorted(out.glob("*.pmtiles")) + [p for p in [out / "meteo_puntos.json"] if p.exists()]
    archivos = [{"nombre": p.name, "bytes": p.stat().st_size} for p in rutas]
    bbox, _ = _bbox_zona(0)
    build = (out.parent / "base_build.txt")
    m = {
        "generado": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "bbox": [round(v, 5) for v in bbox],
        "especies": especies(),
        "umbrales": list(UMBRALES),
        "zoom": {"idoneidad": list(ZOOM_IDONEIDAD), "sombreado": list(ZOOM_SOMBREADO),
                 "base_max": ZOOM_BASE_MAX},
        "base": build.read_text().strip() if build.exists() else None,
        "meteo": ({"puntos": "meteo_puntos.json", "zonas": "meteo_zonas.pmtiles"}
                  if (out / "meteo_puntos.json").exists() else None),
        "archivos": archivos,
        "total_bytes": sum(a["bytes"] for a in archivos),
    }
    # Reconocedor (modelo/construir.py): descarga opcional aparte; no cuenta en archivos ni en total_bytes.
    paquete = out / "modelo" / "paquete.json"
    if paquete.exists():
        m["modelo"] = json.loads(paquete.read_text())
    (out / "manifest.json").write_text(json.dumps(m, ensure_ascii=False, indent=1))
    return m


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("pasos", nargs="+", choices=["capas", "base", "meteo", "manifest", "respaldo", "todo"])
    ap.add_argument("--maxzoom", type=int, default=ZOOM_BASE_MAX)
    a = ap.parse_args(argv)
    pasos = set(a.pasos)
    malla = Malla.cargar(OUT / "malla.json")
    if pasos & {"capas", "todo"}:
        print("rasters…", flush=True); exportar_rasters(malla)
        print("curvas…", flush=True); exportar_curvas(malla)
        print("protegidos…", flush=True); exportar_protegidos()
    if pasos & {"base", "todo"}:
        exportar_base(maxzoom=a.maxzoom)
    if pasos & {"meteo", "todo"}:
        print("meteo…", flush=True); exportar_meteo()
    if pasos == {"respaldo"}:
        from .respaldo import exportar_respaldo
        print("respaldo…", flush=True); exportar_respaldo(malla)
        return
    m = escribir_manifest()
    print(f"manifest: {len(m['archivos'])} archivos, {m['total_bytes'] / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
