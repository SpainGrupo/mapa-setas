"""Máscara de suelo edificado (2026-10-15): causa del falso positivo de La Mairena.

El MFE da un único valor a recintos de decenas de hectáreas que contienen urbanizaciones; aquí se
marca lo edificado con Catastro INSPIRE (edificios BU, descarga ATOM por municipio), los recintos MFE
«Msc arb/artificial» y, como refuerzo, landuse=residential|industrial de OSM.

    uv run python -m setas_pipeline.edificado descargar [--region marbella]   # solo la descarga ATOM
                                                    # (caché en data/<region>/raw/catastro_bu)
    uv run python -m setas_pipeline.ejecutar edificado [--region marbella]    # descarga (si falta) + edificado.tif

Provincias del Catastro de cada región: regiones/<id>.yaml → edificado.catastro_provincias; feed ATOM nacional:
fuentes.yaml → catastro_bu.atom.

edificado.tif (uint8, malla común):
    0 = libre · 1 = edificio a ≤ 100 m del centro de la celda · 2 = excluido (huella ≥ 2 %, recinto MFE
    artificial o landuse OSM residencial/industrial) · 255 = fuera de la zona.
Licencia Catastro: uso libre citando a la D. G. del Catastro; solo se publica la información transformada
(la máscara), nunca los edificios.
"""
from __future__ import annotations
import re, time, zipfile
from pathlib import Path
import numpy as np
import requests

from .malla import Malla, CRS, escribir_tif

HUELLA_MIN = 0.02            # fracción edificada de la celda a partir de la cual vale 0
RADIO_CERCA_M = 100.0        # edificio a ≤ este radio del centro de la celda → borde urbano
SUB = 10                     # submuestreo: 10 × 10 píxeles de 10 m por celda de 100 m
TESELA_CELDAS = 100          # proceso por teselas de 10 km
LIBRE, CERCA, EXCLUIDO, FUERA = 0, 1, 2, 255
LANDUSE_URBANO = ("residential", "industrial")
TIPESTR_ARTIFICIAL = "artificial"   # nb_tipestr del MFE «Msc arb/artificial»

ATRIBUCION = "Catastro INSPIRE (D. G. del Catastro) · © MITECO MFE · © OpenStreetMap ODbL"


# ---------------------------------------------------------------- ATOM

def municipios_atom(xml: str) -> list[dict]:
    """Entradas de un feed ATOM provincial → [{codigo, nombre, url, bbox=(lon0, lat0, lon1, lat1)}]."""
    out = []
    for e in re.findall(r"<entry>.*?</entry>", xml, re.S):
        t = re.search(r"<title>\s*(\d{5})-(.*?) buildings\s*</title>", e)
        u = re.search(r'rel="enclosure" href="([^"]+\.zip)"', e)
        p = re.search(r"<georss:polygon>([^<]+)</georss:polygon>", e)
        if not (t and u and p):
            continue
        v = [float(x) for x in p.group(1).split()]
        lats, lons = v[0::2], v[1::2]
        out.append({"codigo": t.group(1), "nombre": t.group(2).strip(), "url": u.group(1),
                    "bbox": (min(lons), min(lats), max(lons), max(lats))})
    return out


def _texto(b: bytes) -> str:
    """Los feeds provinciales vienen unos en UTF-8 y otros en ISO-8859-1 (p. ej. Córdoba)."""
    try:
        return b.decode("utf-8")
    except UnicodeDecodeError:
        return b.decode("latin-1")


def municipios_en_zona(muns: list[dict], zona_wgs) -> list[dict]:
    from shapely.geometry import box
    return [m for m in muns if zona_wgs.intersects(box(*m["bbox"]))]


def _get(url: str, intentos: int = 5, timeout: int = 300) -> bytes:
    espera = 3.0
    for i in range(intentos):
        try:
            r = requests.get(url, timeout=timeout)
            if r.status_code >= 500:
                raise requests.HTTPError(str(r.status_code))
            r.raise_for_status()
            return r.content
        except (requests.ConnectionError, requests.Timeout, requests.HTTPError) as e:
            if i == intentos - 1:
                raise
            print(f"    reintento {i + 1} ({e})", flush=True)
            time.sleep(espera); espera *= 2
    raise RuntimeError("inalcanzable")


def atom_raiz(fuentes: Path) -> str:
    import yaml
    return yaml.safe_load(Path(fuentes).read_text())["catastro_bu"]["atom"]


def descargar(raw_dir: Path, zona_wgs, provincias, atom: str) -> list[Path]:
    """Descarga (con caché) los zip BU de los municipios cuyo bbox toca la zona. atom: plantilla del feed
    provincial con {prov} (fuentes.yaml catastro_bu.atom)."""
    dest = Path(raw_dir) / "catastro_bu"
    dest.mkdir(parents=True, exist_ok=True)
    zips = []
    for prov in provincias:
        feed = dest / f"ES.SDGC.bu.atom_{prov}.xml"
        if not feed.exists():
            feed.write_bytes(_get(atom.format(prov=prov)))
        muns = municipios_en_zona(municipios_atom(_texto(feed.read_bytes())), zona_wgs)
        print(f"  provincia {prov}: {len(muns)} municipios en la zona", flush=True)
        for m in muns:
            z = dest / prov / Path(m["url"]).name
            if not z.exists() or not zipfile.is_zipfile(z):
                z.parent.mkdir(parents=True, exist_ok=True)
                datos = _get(m["url"])
                if not datos.startswith(b"PK"):
                    print(f"    WARNING: {m['codigo']} {m['nombre']}: la respuesta no es un zip; se omite", flush=True)
                    continue
                tmp = z.with_suffix(".part")
                tmp.write_bytes(datos)
                tmp.rename(z)
                print(f"    {m['codigo']} {m['nombre']}: {z.stat().st_size / 1e6:.1f} MB", flush=True)
            zips.append(z)
    return zips


def leer_edificios(zip_path: Path):
    """Huellas (capa Building) del GML de un zip ATOM BU, en EPSG:25830."""
    import geopandas as gpd
    with zipfile.ZipFile(zip_path) as zf:
        gml = next(n for n in zf.namelist() if n.lower().endswith(".building.gml"))
    g = gpd.read_file(f"zip://{zip_path}!{gml}", layer="Building", columns=[])
    g = g.set_crs(25830, allow_override=True) if g.crs is None else g.to_crs(CRS)
    return g[g.geometry.notna() & ~g.geometry.is_empty][["geometry"]]


# ---------------------------------------------------------------- máscara (lógica pura)

def huella_y_cerca(geoms, malla: Malla, sub: int = SUB, radio_m: float = RADIO_CERCA_M,
                   tesela: int = TESELA_CELDAS) -> tuple[np.ndarray, np.ndarray]:
    """→ (huella: fracción edificada 0..1 por celda, cerca: edificio a ≤ radio_m del centro de la celda).
    Huella: rasteriza a celda/sub por teselas. Cerca: distancia exacta centro–huella (STRtree dwithin)."""
    from rasterio.features import rasterize
    from rasterio.transform import from_origin
    import shapely
    geoms = np.asarray([g for g in geoms if g is not None and not g.is_empty], dtype=object)
    huella = np.zeros((malla.alto, malla.ancho), "float32")
    cerca = np.zeros((malla.alto, malla.ancho), bool)
    if not len(geoms):
        return huella, cerca
    arbol = shapely.STRtree(geoms)
    px = malla.celda / sub
    for f0 in range(0, malla.alto, tesela):
        for c0 in range(0, malla.ancho, tesela):
            f1, c1 = min(f0 + tesela, malla.alto), min(c0 + tesela, malla.ancho)
            x0, y1 = malla.x0 + c0 * malla.celda, malla.y1 - f0 * malla.celda
            x1, y0 = malla.x0 + c1 * malla.celda, malla.y1 - f1 * malla.celda
            # edificios de la tesela o a ≤ radio_m de ella (también fuera de la malla)
            if not len(arbol.query(shapely.box(x0 - radio_m, y0 - radio_m, x1 + radio_m, y1 + radio_m))):
                continue
            # huella: fracción de píxeles de celda/sub edificados en cada celda
            idx = arbol.query(shapely.box(x0, y0, x1, y1))
            if len(idx):
                a = rasterize(((g, 1) for g in geoms[idx]), out_shape=((f1 - f0) * sub, (c1 - c0) * sub),
                              transform=from_origin(x0, y1, px, px), fill=0, dtype="uint8", all_touched=False)
                huella[f0:f1, c0:c1] = a.reshape(f1 - f0, sub, c1 - c0, sub).mean(axis=(1, 3), dtype="float32")
            # cerca: distancia exacta del centro de cada celda a la huella más próxima (no a píxeles: la EDT
            # sobre el submuestreo perdía las casetas menores que un píxel, medía desde un punto desplazado
            # medio píxel del centro y, en una tesela sin píxeles edificados, contaba un edificio fantasma)
            ff, cc = np.mgrid[f0:f1, c0:c1]
            pts = shapely.points(malla.x0 + (cc.ravel() + 0.5) * malla.celda,
                                 malla.y1 - (ff.ravel() + 0.5) * malla.celda)
            sub_cerca = np.zeros(pts.shape, bool)
            sub_cerca[arbol.query(pts, predicate="dwithin", distance=radio_m)[0]] = True
            cerca[f0:f1, c0:c1] = sub_cerca.reshape(f1 - f0, c1 - c0)
    return huella, cerca


def combinar(huella: np.ndarray, cerca: np.ndarray, artificial: np.ndarray | None = None,
             landuse: np.ndarray | None = None, dentro: np.ndarray | None = None,
             huella_min: float = HUELLA_MIN) -> np.ndarray:
    """Clases de edificado.tif: EXCLUIDO > CERCA > LIBRE; FUERA donde dentro es False."""
    e = np.where(cerca | (huella > 0), CERCA, LIBRE).astype("uint8")
    excl = huella >= huella_min
    if artificial is not None:
        excl |= artificial
    if landuse is not None:
        excl |= landuse
    e[excl] = EXCLUIDO
    if dentro is not None:
        e[~dentro] = FUERA
    return e


def factor_edificado(e: np.ndarray, cerca: float = 0.5, excluir: bool = True) -> np.ndarray:
    """edificado.tif → factor multiplicativo: EXCLUIDO 0 (si excluir), CERCA `cerca`, resto 1."""
    a = np.asarray(e)
    f = np.ones(a.shape, "float32")
    f = np.where(a == CERCA, cerca, f)
    if excluir:
        f = np.where(a == EXCLUIDO, 0.0, f)
    return f.astype("float32")


# ---------------------------------------------------------------- otras fuentes

def artificial_mfe(raw_dir: Path, fuentes: Path, zona, malla: Malla) -> np.ndarray:
    """Recintos MFE (arbolados, caché de la Fase 1) cuyo nb_tipestr es «Msc arb/artificial»."""
    from rasterio.features import rasterize
    from .vegetacion import _mfe_arbolado
    g = _mfe_arbolado(raw_dir, fuentes, zona).to_crs(CRS)
    sel = g[g["nb_tipestr"].fillna("").str.lower().str.contains(TIPESTR_ARTIFICIAL)]
    print(f"  MFE artificial: {len(sel)} recintos", flush=True)
    if not len(sel):
        return np.zeros((malla.alto, malla.ancho), bool)
    return rasterize(((geo, 1) for geo in sel.geometry), out_shape=(malla.alto, malla.ancho),
                     transform=malla.transform, fill=0, dtype="uint8").astype(bool)


def artificial_region(out_dir: Path, malla: Malla) -> np.ndarray:
    """Regiones con capas.mfe (fase C): recintos marcados `artificial` en out/mfe_region.gpkg."""
    from rasterio.features import rasterize
    from .vegetacion import leer_mfe_region
    g = leer_mfe_region(out_dir)
    sel = g[g["artificial"].astype(bool)] if len(g) else g
    print(f"  MFE artificial: {len(sel)} recintos", flush=True)
    if not len(sel):
        return np.zeros((malla.alto, malla.ancho), bool)
    return rasterize(((geo, 1) for geo in sel.to_crs(CRS).geometry), out_shape=(malla.alto, malla.ancho),
                     transform=malla.transform, fill=0, dtype="uint8").astype(bool)


def landuse_osm(pbf: Path, malla: Malla) -> np.ndarray:
    """Celdas cuyo centro cae en un área OSM landuse=residential|industrial."""
    import osmium
    from shapely import wkb
    from rasterio.features import rasterize
    from pyproj import Transformer
    from shapely.ops import transform as sh_transform
    tr = Transformer.from_crs("EPSG:4326", CRS, always_xy=True).transform
    fab = osmium.geom.WKBFactory()
    w, s, e_, n = _bbox_wgs(malla)
    formas = []
    fp = (osmium.FileProcessor(str(pbf)).with_locations()
          .with_areas(osmium.filter.TagFilter(*(("landuse", v) for v in LANDUSE_URBANO)))
          .with_filter(osmium.filter.TagFilter(*(("landuse", v) for v in LANDUSE_URBANO))))
    for o in fp:
        if not o.is_area():
            continue
        try:
            g = wkb.loads(fab.create_multipolygon(o), hex=True)
        except Exception:
            continue
        b = g.bounds
        if b[2] < w or b[0] > e_ or b[3] < s or b[1] > n:
            continue
        formas.append(sh_transform(tr, g))
    print(f"  OSM landuse residencial/industrial: {len(formas)} áreas", flush=True)
    if not formas:
        return np.zeros((malla.alto, malla.ancho), bool)
    return rasterize(((g, 1) for g in formas), out_shape=(malla.alto, malla.ancho),
                     transform=malla.transform, fill=0, dtype="uint8").astype(bool)


def _bbox_wgs(malla: Malla):
    from pyproj import Transformer
    tr = Transformer.from_crs(CRS, "EPSG:4326", always_xy=True)
    x0, y0, x1, y1 = malla.bounds
    lons, lats = tr.transform([x0, x1, x0, x1], [y0, y0, y1, y1])
    return min(lons), min(lats), max(lons), max(lats)


def construir_edificado(malla: Malla, region, fuentes: Path, zona_path: Path, pbf: Path) -> np.ndarray:
    """edificado.tif de la región. pbf: OSM recortado de la región (raw/zona.osm.pbf, adaptadores.osm.pbf_region)."""
    import geopandas as gpd
    import pandas as pd
    from .descargas import cargar_zona
    from .vegetacion import mascara_zona
    raw_dir, out_dir = region.raw, region.out
    zona = cargar_zona(zona_path)
    zona_wgs = gpd.GeoSeries([zona], crs=CRS).to_crs("EPSG:4326").iloc[0]
    zips = descargar(raw_dir, zona_wgs, region.edificado.get("catastro_provincias", ()), atom_raiz(fuentes))
    trozos = []
    for z in zips:
        try:
            trozos.append(leer_edificios(z))
        except Exception as ex:          # un municipio sin GML válido no debe tumbar la máscara
            print(f"  WARNING: {z.name}: {ex}", flush=True)
    edif = pd.concat(trozos, ignore_index=True) if trozos else gpd.GeoDataFrame(geometry=[], crs=CRS)
    print(f"  Catastro: {len(edif)} edificios de {len(zips)} municipios", flush=True)
    huella, cerca = huella_y_cerca(edif.geometry.values, malla)
    art = (artificial_region(out_dir, malla) if "mfe" in region.capas
           else artificial_mfe(raw_dir, fuentes, zona, malla))
    lu = landuse_osm(pbf, malla)
    dentro = mascara_zona(zona, malla)
    e = combinar(huella, cerca, art, lu, dentro)
    escribir_tif(malla, Path(out_dir) / "edificado.tif", e, FUERA)
    t = dentro.sum()
    print(f"  edificado: excluidas {(e == EXCLUIDO).sum()} celdas ({100 * (e == EXCLUIDO).sum() / t:.1f} %), "
          f"cerca {(e == CERCA).sum()} ({100 * (e == CERCA).sum() / t:.1f} %) de {t}", flush=True)
    return e


if __name__ == "__main__":
    import argparse
    import geopandas as gpd
    from .descargas import cargar_zona
    from .region import FUENTES, argumento_region, cargar_region
    ap = argparse.ArgumentParser()
    ap.add_argument("accion", choices=["descargar"])
    argumento_region(ap)
    r = cargar_region(ap.parse_args().region)
    z = cargar_zona(r.out / "zona.geojson")
    zw = gpd.GeoSeries([z], crs=CRS).to_crs("EPSG:4326").iloc[0]
    print(f"{len(descargar(r.raw, zw, r.edificado.get('catastro_provincias', ()), atom_raiz(FUENTES)))} zip")
