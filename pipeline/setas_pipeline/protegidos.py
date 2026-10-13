"""Espacios protegidos: REDIAM RENPA (ms:eennpp) → 1 dentro, 0 fuera."""
from __future__ import annotations
from pathlib import Path
import yaml
from .malla import Malla, escribir_tif
from .descargas import descargar_teselas, cargar_zona
from .vegetacion import rasterizar_clases

TESELA_ENP = 50000
PAGINA_ENP = 10**9    # sin paginar: pocos espacios por tesela


def construir_protegidos(malla: Malla, raw_dir: Path, out_dir: Path, fuentes: Path, zona_path: Path):
    cfg = yaml.safe_load(Path(fuentes).read_text())["enp"]
    zona = cargar_zona(zona_path)
    gdf = descargar_teselas(cfg["url"], zona, TESELA_ENP, Path(raw_dir) / "enp", pagina=PAGINA_ENP)
    gdf["valor"] = 1
    a = rasterizar_clases(gdf, "valor", malla, fill=0)
    escribir_tif(malla, Path(out_dir) / "protegido.tif", a, None)
    return a


if __name__ == "__main__":
    base = Path(__file__).resolve().parent.parent
    out = base / "data/out"
    construir_protegidos(Malla.cargar(out / "malla.json"), base / "data/raw", out,
                         base / "fuentes.yaml", out / "zona.geojson")
