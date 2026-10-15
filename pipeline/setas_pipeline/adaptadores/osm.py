"""OpenStreetMap: extractos de Geofabrik recortados a la zona y fusionados con osmium-tool (raw/zona.osm.pbf),
y relaciones de senderismo (adaptador `osm_relaciones`). accesos.py, acceso.py y rutas.py leen zona.osm.pbf."""
from __future__ import annotations
import json, math, shutil, subprocess
from pathlib import Path
import geopandas as gpd
import requests
from . import CRS, Contexto, registrar, vacio

MARGEN_PBF_M = 5000      # malla + 5 km (rutas usa zona + 2 km; acceso/accesos solo la malla)


def nombre_extracto(url: str) -> str:
    return url.rsplit("/", 1)[-1].replace("-latest", "")


def descargar_extracto(url: str, destino: Path) -> Path:
    destino = Path(destino)
    if destino.exists():
        return destino
    destino.parent.mkdir(parents=True, exist_ok=True)
    parcial = destino.with_name(destino.name + ".part")
    with requests.get(url, stream=True, timeout=600) as r:
        r.raise_for_status()
        with open(parcial, "wb") as f:
            for trozo in r.iter_content(1 << 20):
                f.write(trozo)
    parcial.rename(destino)
    return destino


def caja_recorte(bounds_malla, margen: float = MARGEN_PBF_M) -> tuple[float, float, float, float]:
    from ..incendios import caja_wgs84
    xmin, ymin, xmax, ymax = bounds_malla
    lon0, lat0, lon1, lat1 = caja_wgs84((xmin - margen, ymin - margen, xmax + margen, ymax + margen))
    return (math.floor(lon0 * 1000) / 1000, math.floor(lat0 * 1000) / 1000,
            math.ceil(lon1 * 1000) / 1000, math.ceil(lat1 * 1000) / 1000)


def ordenes_osmium(entradas: list[Path], caja, destino: Path) -> list[list[str]]:
    b = ",".join(f"{v:.3f}" for v in caja)
    parcial = destino.with_name(destino.name + ".part")
    if len(entradas) == 1:
        return [["osmium", "extract", "-b", b, "-s", "smart", "-f", "pbf", "--overwrite",
                 "-o", str(parcial), str(entradas[0])]]
    recortes = [destino.with_name(f"_recorte_{i}.osm.pbf") for i in range(len(entradas))]
    ordenes = [["osmium", "extract", "-b", b, "-s", "smart", "--overwrite", "-o", str(r), str(e)]
               for e, r in zip(entradas, recortes)]
    ordenes.append(["osmium", "merge", "-f", "pbf", "--overwrite", "-o", str(parcial), *map(str, recortes)])
    return ordenes


def pbf_zona(raw: Path, extractos: list[str], bounds_malla) -> Path:
    """raw/zona.osm.pbf: extractos (raw/osm/) recortados a la malla + margen y fusionados. Se rehace si cambia la
    caja o la lista de extractos (raw/zona.osm.json) o si un extracto es más nuevo."""
    raw = Path(raw)
    destino = raw / "zona.osm.pbf"
    marca = raw / "zona.osm.json"
    caja = caja_recorte(bounds_malla)
    firma = json.dumps({"caja": caja, "extractos": list(extractos)})
    entradas = [descargar_extracto(u, raw / "osm" / nombre_extracto(u)) for u in extractos]
    if (destino.exists() and marca.exists() and marca.read_text() == firma
            and destino.stat().st_mtime >= max(e.stat().st_mtime for e in entradas)):
        return destino
    if shutil.which("osmium") is None:
        raise RuntimeError("Falta osmium-tool (brew install osmium-tool): recorta y fusiona los extractos OSM")
    for orden in ordenes_osmium(entradas, caja, destino):
        subprocess.run(orden, check=True)
    destino.with_name(destino.name + ".part").rename(destino)
    for r in raw.glob("_recorte_*.osm.pbf"):
        r.unlink()
    marca.write_text(firma)
    return destino


@registrar("senderos", "osm_relaciones")
def osm_relaciones(cfg: dict, ctx: Contexto) -> gpd.GeoDataFrame:
    from ..rutas import relaciones_osm, clasificar_ref
    rels = relaciones_osm(ctx.osm_pbf())
    if not rels:
        return vacio("senderos")
    g = gpd.GeoDataFrame(rels, geometry="geometry", crs="EPSG:4326").to_crs(CRS)
    return gpd.GeoDataFrame({
        "ref": g["ref"], "name": g["name"], "network": g["network"], "osmc": g["osmc"],
        "tipo": [clasificar_ref(r, n) for r, n in zip(g["ref"], g["name"])],
        "fuente": "osm", "dificultad": None}, geometry=g.geometry, crs=CRS)
