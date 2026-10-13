"""Espacios protegidos: REDIAM RENPA (ms:eennpp) → 1 dentro de un ENP, 0 fuera de él,
255 (NODATA) fuera de la zona isócrona, igual que arbol.tif y suelo.tif."""
from __future__ import annotations
from pathlib import Path
import yaml
from .malla import Malla, escribir_tif
from .descargas import descargar_teselas, cargar_zona
from .vegetacion import rasterizar_clases, mascara_zona

TESELA_ENP = 50000
PAGINA_ENP = 10**9    # sin paginar: pocos espacios por tesela
NODATA = 255


def rasterizar_protegidos(gdf, zona, malla: Malla):
    gdf = gdf.copy()
    gdf["valor"] = 1
    a = rasterizar_clases(gdf, "valor", malla, fill=0)
    a[~mascara_zona(zona, malla)] = NODATA
    return a


def construir_protegidos(malla: Malla, raw_dir: Path, out_dir: Path, fuentes: Path, zona_path: Path):
    cfg = yaml.safe_load(Path(fuentes).read_text())["enp"]
    zona = cargar_zona(zona_path)
    gdf = descargar_teselas(cfg["url"], zona, TESELA_ENP, Path(raw_dir) / "enp", pagina=PAGINA_ENP)
    a = rasterizar_protegidos(gdf, zona, malla)
    escribir_tif(malla, Path(out_dir) / "protegido.tif", a, NODATA)
    return a


if __name__ == "__main__":
    base = Path(__file__).resolve().parent.parent
    out = base / "data/out"
    construir_protegidos(Malla.cargar(out / "malla.json"), base / "data/raw", out,
                         base / "fuentes.yaml", out / "zona.geojson")
