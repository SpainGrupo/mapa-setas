"""Suelo: litología IGME GEODE → ácido / básico / ultrabásico."""
from __future__ import annotations
from pathlib import Path
import pandas as pd, yaml
from .malla import Malla, SUELO, escribir_tif
from .descargas import descargar_teselas, cargar_zona
from .vegetacion import rasterizar_clases, mascara_zona

ORDEN = ["ultrabasico", "acido", "basico"]
NODATA = 255
PAGINA_GEO = 1000     # maxRecordCount del servicio
TESELA_GEO = 25000


def clasificar_litologia(textos: pd.Series, mapeo: dict) -> pd.Series:
    def uno(t):
        if t is None or (isinstance(t, float) and pd.isna(t)):
            return SUELO["desconocido"]
        t = str(t).lower()
        for clase in ORDEN:
            if any(p in t for p in mapeo.get(clase, [])):
                return SUELO[clase]
        return SUELO["otro"]
    return textos.map(uno).astype("uint8")


def construir_suelo(malla: Malla, raw_dir: Path, out_dir: Path, fuentes: Path, zona_path: Path):
    cfg = yaml.safe_load(Path(fuentes).read_text())["geologia"]
    zona = cargar_zona(zona_path)
    gdf = descargar_teselas(cfg["url_patron"], zona, TESELA_GEO, Path(raw_dir) / "geologia",
                            pagina=PAGINA_GEO)
    # las teselas se solapan en los recintos de borde: deduplicar por geometría
    gdf = gdf[~gdf.geometry.to_wkb().duplicated()]
    gdf["clase"] = clasificar_litologia(gdf[cfg["campo_litologia"]], cfg["mapeo_suelo"])
    a = rasterizar_clases(gdf, "clase", malla, fill=SUELO["desconocido"])
    a[~mascara_zona(zona, malla)] = NODATA
    escribir_tif(malla, Path(out_dir) / "suelo.tif", a, NODATA)
    return a


if __name__ == "__main__":
    base = Path(__file__).resolve().parent.parent
    out = base / "data/out"
    construir_suelo(Malla.cargar(out / "malla.json"), base / "data/raw", out,
                    base / "fuentes.yaml", out / "zona.geojson")
