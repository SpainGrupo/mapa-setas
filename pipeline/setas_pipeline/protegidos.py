"""Espacios protegidos (capa `protegidos` de la región) → 1 dentro de un espacio, 0 fuera,
255 (NODATA) fuera de la zona isócrona, igual que arbol.tif y suelo.tif."""
from __future__ import annotations
from .malla import Malla, escribir_tif
from .descargas import cargar_zona
from .vegetacion import rasterizar_clases, mascara_zona

NODATA = 255


def rasterizar_protegidos(gdf, zona, malla: Malla):
    gdf = gdf.copy()
    gdf["valor"] = 1
    a = rasterizar_clases(gdf, "valor", malla, fill=0)
    a[~mascara_zona(zona, malla)] = NODATA
    return a


def construir_protegidos(malla: Malla, region):
    from .adaptadores import contexto_region, cargar_capa
    zona = cargar_zona(region.out / "zona.geojson")
    gdf = cargar_capa("protegidos", region.capas, contexto_region(region, malla=malla, zona=zona))
    a = rasterizar_protegidos(gdf, zona, malla)
    escribir_tif(malla, region.out / "protegido.tif", a, NODATA)
    return a


if __name__ == "__main__":
    from .region import region_cli
    r = region_cli()
    construir_protegidos(Malla.cargar(r.out / "malla.json"), r)
