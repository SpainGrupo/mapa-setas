"""Vista previa por especie: idoneidad (0 transparente), contorno de la zona, Marbella y GBIF."""
from __future__ import annotations
from pathlib import Path
import numpy as np, geopandas as gpd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from .malla import Malla, CRS, leer_tif
from .zona import ORIGEN
from .calibracion import ocurrencias, filtrar_incertidumbre, a_utm
from .descargas import cargar_zona


def vista_especie(out_dir: Path, raw_dir: Path, clave: str, perfil: dict, zona=None) -> Path:
    out_dir = Path(out_dir)
    malla = Malla.cargar(out_dir / "malla.json")
    r = leer_tif(out_dir / f"idoneidad_{clave}.tif")
    xmin, ymin, xmax, ymax = malla.bounds
    fig, ax = plt.subplots(figsize=(10, 8), dpi=120)
    im = ax.imshow(np.ma.masked_equal(r, 0), cmap="YlGn", vmin=1, vmax=100,
                   extent=(xmin, xmax, ymin, ymax), interpolation="nearest")
    fig.colorbar(im, ax=ax, shrink=0.7, label="idoneidad (0 = transparente)")
    gpd.read_file(out_dir / "zona.geojson").to_crs(CRS).boundary.plot(ax=ax, color="0.3", lw=0.8)
    mx, my = a_utm([ORIGEN])[0]
    ax.plot(mx, my, marker="*", color="crimson", ms=14, mec="k", label="Marbella")
    kept, _, _ = filtrar_incertidumbre(ocurrencias(perfil, zona if zona is not None else cargar_zona(out_dir / "zona.geojson"), raw_dir))
    xy = a_utm(kept)
    if xy:
        ax.scatter([p[0] for p in xy], [p[1] for p in xy], s=14, c="royalblue", edgecolors="k",
                   linewidths=0.4, label=f"GBIF (n={len(xy)})", zorder=5)
    ax.set_title(f"{perfil['nombre']} — idoneidad heurística v1")
    ax.set_xlim(xmin, xmax); ax.set_ylim(ymin, ymax); ax.set_aspect("equal")
    ax.legend(loc="lower left", fontsize=8); ax.set_xticks([]); ax.set_yticks([])
    ruta = out_dir / f"vista_{clave}.png"
    fig.savefig(ruta, bbox_inches="tight"); plt.close(fig)
    return ruta


def vistas(out_dir: Path, raw_dir: Path, perfiles: dict) -> list[Path]:
    zona = cargar_zona(Path(out_dir) / "zona.geojson")
    return [vista_especie(out_dir, raw_dir, k, p, zona) for k, p in perfiles.items()]
