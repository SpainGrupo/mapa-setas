"""Modo campo (2026-10-18): valores por celda de 100 m para elegir microzonas en el cliente → out/app/micro.bin + micro.json.

    uv run python -m setas_pipeline.exportar micro [--region marbella]

Las capas de idoneidad ya se publican como PMTiles PNG por umbral (exportar_rasters), pero de un PNG coloreado no se
recupera el valor de la celda ni los factores. Para buscar «a escala micro» (radio ~500 m alrededor del GPS) la app
necesita, por celda, la idoneidad de cada especie y los factores reales del modelo para explicar el porqué.

Formato (como acceso.bin, lectura parcial por Blob.slice u HTTP Range; aquí además por teselas comprimidas para que
el archivo entero quepa en la descarga offline sin descomprimirlo todo en el teléfono):
  - La malla de la región (EPSG:25830, 100 m) se parte en teselas de TESELA × TESELA celdas.
  - Cada tesela con alguna celda de idoneidad > 0 se guarda como un bloque gzip (mtime 0) de capas planas uint8 de
    TESELA × TESELA (las teselas del borde se rellenan con NODATA); el orden de capas lo da micro.json.
  - micro.json: versión, crs, res_m, origen_xy (borde O y N), ancho, alto, tesela, capas [{id, nodata, escala…}],
    especies [ids, en el orden de las capas idon_<id>], perfiles (subconjunto del perfil de especies.yaml que la app
    usa para la ficha «Cómo buscar») e índice [[fila_t, col_t, offset, bytes], …].
  Las teselas que faltan en el índice no tienen hábitat para ninguna especie (idoneidad 0 en todas sus celdas).

Codificación de los factores (uint8, 255 = sin dato):
  arbol     código de malla.ARBOL (0 = sin arbolado)       fcc   FCC arbolada del MFE, % (0–100)
  sat       copas vistas por satélite (arbol_sat.tif), %     cubierta  código de malla.CUBIERTA (desarbolado del MFE)
  orient    orientación / 2 (0–179 → 0–358°); 254 = llano   pend  pendiente en grados (0–90)
  humedad   índice 0–100 (TWI relativo o cauce cercano)     cauce distancia al cauce en decenas de m (0–250; 250 = ≥ 2,5 km)
  idon_<especie>  idoneidad 0–100 del modelo (la misma que pintan los PMTiles).
Todo HEURÍSTICO como el propio modelo; resolución 100 m: una celda es una hectárea, no un árbol concreto.
"""
from __future__ import annotations
import gzip, json
from pathlib import Path
import numpy as np

from .malla import Malla, NODATA_F, leer_tif

TESELA = 32
VERSION = 1
NODATA = 255
LLANO = 254
CAUCE_PASO_M = 10
CAUCE_MAX = 250
# Campos del perfil (especies.yaml) que la app usa para «Cómo buscar» y para el porqué de la celda.
CAMPOS_PERFIL = ("arboles", "orientacion", "humedad", "dosel", "altitud", "cubierta", "matorral_cerca", "suelo",
                 "micorrizica", "penaliza_fuego")
CAPAS_FACTOR = (
    {"id": "arbol", "nodata": NODATA, "tipo": "codigo", "fuente": "arbol.tif"},
    {"id": "fcc", "nodata": NODATA, "unidad": "%", "fuente": "fcc.tif"},
    {"id": "sat", "nodata": NODATA, "unidad": "%", "fuente": "arbol_sat.tif"},
    {"id": "cubierta", "nodata": NODATA, "tipo": "codigo", "fuente": "cubierta.tif"},
    {"id": "orient", "nodata": NODATA, "escala": 2, "llano": LLANO, "unidad": "°", "fuente": "orientacion.tif"},
    {"id": "pend", "nodata": NODATA, "unidad": "°", "fuente": "pendiente.tif"},
    {"id": "humedad", "nodata": NODATA, "unidad": "0-100", "fuente": "humedad.tif"},
    {"id": "cauce", "nodata": NODATA, "escala": CAUCE_PASO_M, "max": CAUCE_MAX, "unidad": "m", "fuente": "dist_cauce.tif"},
)


# ---------------------------------------------------------------- codificación (pura)

def codificar_u8(a: np.ndarray, nodata_in=None) -> np.ndarray:
    """uint8 tal cual (0–254), con su NODATA → 255."""
    a = np.asarray(a)
    r = np.clip(a, 0, 254).astype("uint8")
    if nodata_in is not None:
        r = np.where(a == nodata_in, NODATA, r).astype("uint8")
    return r


def codificar_orientacion(o: np.ndarray) -> np.ndarray:
    """Grados (0–360, < 0 = llano, NODATA_F) → u8: round(o/2) % 180; LLANO; NODATA."""
    o = np.asarray(o, "float32")
    r = (np.rint(np.where(o >= 0, o, 0) / 2) % 180).astype("uint8")
    r = np.where(o < 0, LLANO, r)
    return np.where(o == NODATA_F, NODATA, r).astype("uint8")


def codificar_pendiente(p: np.ndarray) -> np.ndarray:
    p = np.asarray(p, "float32")
    r = np.clip(np.rint(np.where(p >= 0, p, 0)), 0, 90).astype("uint8")
    return np.where(p == NODATA_F, NODATA, r).astype("uint8")


def codificar_cauce(d: np.ndarray) -> np.ndarray:
    d = np.asarray(d, "float32")
    r = np.clip(np.rint(np.where(d >= 0, d, 0) / CAUCE_PASO_M), 0, CAUCE_MAX).astype("uint8")
    return np.where(d == NODATA_F, NODATA, r).astype("uint8")


def teselar(capas: list[np.ndarray], idon: list[np.ndarray], tesela: int = TESELA):
    """Recorre las teselas (fila_t, col_t, bloque bytes sin comprimir) que tienen alguna celda de idoneidad > 0.
    El bloque son las capas en orden (factores y luego idoneidades), cada una tesela×tesela uint8 (relleno NODATA;
    las de idoneidad, relleno 0)."""
    alto, ancho = capas[0].shape if capas else idon[0].shape
    nt_f, nt_c = -(-alto // tesela), -(-ancho // tesela)
    for tf in range(nt_f):
        for tc in range(nt_c):
            f0, c0 = tf * tesela, tc * tesela
            f1, c1 = min(f0 + tesela, alto), min(c0 + tesela, ancho)
            if not any((a[f0:f1, c0:c1] > 0).any() for a in idon):
                continue
            partes = []
            for a, relleno in [(x, NODATA) for x in capas] + [(x, 0) for x in idon]:
                b = np.full((tesela, tesela), relleno, "uint8")
                b[: f1 - f0, : c1 - c0] = a[f0:f1, c0:c1]
                partes.append(b.tobytes())
            yield tf, tc, b"".join(partes)


def perfil_app(perfil: dict) -> dict:
    return {k: perfil[k] for k in CAMPOS_PERFIL if k in perfil}


# ---------------------------------------------------------------- exportación

def capas_region(out_dir: Path) -> list[np.ndarray]:
    """Las capas de factores en el orden de CAPAS_FACTOR; una capa opcional que falte va entera a NODATA."""
    out_dir = Path(out_dir)
    u8 = lambda a: codificar_u8(a, NODATA)
    codif = {"arbol": u8, "fcc": u8, "arbol_sat": u8, "cubierta": u8, "humedad": u8, "orientacion": codificar_orientacion,
             "pendiente": codificar_pendiente, "dist_cauce": codificar_cauce}
    arbol = u8(leer_tif(out_dir / "arbol.tif"))
    capas = []
    for c in CAPAS_FACTOR:
        nombre = c["fuente"].removesuffix(".tif")
        p = out_dir / c["fuente"]
        capas.append(arbol if nombre == "arbol" else codif[nombre](leer_tif(p)) if p.exists()
                     else np.full(arbol.shape, NODATA, "uint8"))
    return capas


def escribir(destino: Path, malla: Malla, capas: list[np.ndarray], especies: list[str], idon: list[np.ndarray],
             perfiles: dict, tesela: int = TESELA) -> dict:
    """Escribe micro.bin y micro.json en `destino`; devuelve la cabecera."""
    destino = Path(destino)
    destino.mkdir(parents=True, exist_ok=True)
    indice, off = [], 0
    with open(destino / "micro.bin", "wb") as fh:
        for tf, tc, bloque in teselar(capas, idon, tesela):
            z = gzip.compress(bloque, compresslevel=9, mtime=0)
            fh.write(z)
            indice.append([tf, tc, off, len(z)])
            off += len(z)
    cab = {
        "version": VERSION, "crs": "EPSG:25830", "res_m": malla.celda, "origen_xy": [malla.x0, malla.y1],
        "ancho": malla.ancho, "alto": malla.alto, "tesela": tesela, "bytes": off,
        "capas": [*CAPAS_FACTOR, *({"id": f"idon_{e}", "nodata": None, "unidad": "0-100"} for e in especies)],
        "especies": especies,
        "perfiles": {e: perfil_app(perfiles[e]) for e in especies if e in perfiles},
        "indice": indice,
    }
    (destino / "micro.json").write_text(json.dumps(cab, ensure_ascii=False, separators=(",", ":")))
    return cab


def exportar_micro(region, malla: Malla, out: Path | None = None) -> dict:
    from .exportar import especies_activas
    from .idoneidad import cargar_perfiles
    from .region import ESPECIES
    out = out or region.app
    ids = [e["id"] for e in especies_activas(region) if (region.out / f"idoneidad_{e['id']}.tif").exists()]
    idon = [leer_tif(region.out / f"idoneidad_{e}.tif").astype("uint8") for e in ids]
    perfiles = region.perfiles(cargar_perfiles(ESPECIES))
    cab = escribir(out, malla, capas_region(region.out), ids, idon, perfiles)
    print(f"  micro: {len(cab['indice'])} teselas, {cab['bytes'] / 1e6:.1f} MB, {len(ids)} especies", flush=True)
    return cab
