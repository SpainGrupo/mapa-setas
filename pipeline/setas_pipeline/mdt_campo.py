"""Modo campo, ruta a pie por el terreno (2026-10-20): MDT25 del IGN a 25 m, teselado, → out/app/mdt_campo.bin + .json.

    uv run python -m setas_pipeline.exportar mdt [--region marbella]      # después de `micro` (usa su índice)

Por qué 25 m y no la malla de 100 m (decisión con cifras, Marbella, 2026-10-20):
  - Con 100 m, el radio de 500 m del Modo campo son ~10 × 10 celdas: una ruta no puede seguir una curva de nivel ni
    rodear un barranco (un barranco de 50 m de ancho ni siquiera existe en la malla, se promedia con sus laderas).
    A 25 m son ~40 × 40 celdas: se ven vaguadas, lomas y cambios de ladera que deciden por dónde andar.
  - Coste medido sobre las 1430 teselas de micro.bin (3,2 km de lado; solo donde alguna especie tiene hábitat):
      u16 en bruto 46,9 MB · gzip 21,1 MB · delta horizontal + gzip 14,9 MB ·
      predictor 2D (izq + arriba − diagonal) + zigzag + planos de bytes + gzip 10,7 MB  ← el elegido.
    10,7 MB entra en el presupuesto orientativo (< 15–20 MB) de la descarga offline; micro.bin pesa 9,5 MB.
  - En el teléfono se lee solo lo que rodea tu posición (1–4 teselas de 128 × 128 = 16 384 cotas, ~7 KB cada una).

Formato (patrón de micro.py, misma división en teselas, alineada con la malla):
  - Rejilla EPSG:25830 de RES_M (25 m) con origen en el borde NO de la malla; ancho y alto = malla × factor
    (factor = malla.celda / RES_M = 4). La tesela (fila_t, col_t) cubre la misma superficie que la de micro.bin.
  - Cada tesela del índice de micro.json se guarda como bloque gzip (mtime 0) de 2·T² bytes (T = tesela):
      altitud en m enteros (u16; 0 = sin dato: mar, fuera del MDT o relleno del borde) → residuo del predictor
      r = z − pred, con pred = izq + arriba − diagonal (fila 0: izq; columna 0: arriba; (0,0): 0) → zigzag
      (r ≥ 0 → 2r; r < 0 → −2r − 1) → plano de bytes bajos (T²) seguido del plano de bytes altos (T²).
  - mdt_campo.json: versión, crs, res_m, origen_xy (borde O y N), ancho, alto, tesela, codificacion, nodata,
    bytes e índice [[fila_t, col_t, offset, bytes], …].
Las teselas que faltan en el índice no tienen cotas: la app usa entonces la altitud de 100 m de acceso.bin y lo dice.
"""
from __future__ import annotations
import gzip, json
from pathlib import Path
import numpy as np

RES_M = 25.0
VERSION = 1
NODATA = 0
CODIFICACION = "pred2d-zigzag-planos-gzip"
ALT_MAX = 9000          # m: tope (con él el residuo cabe de sobra en u16 tras el zigzag)


# ---------------------------------------------------------------- codificación (pura)

def a_u16(z: np.ndarray, nodata_in=None) -> np.ndarray:
    """Altitud (m) → u16 en m enteros; ≤ 0 (mar, costa), NaN y `nodata_in` → NODATA (0)."""
    z = np.asarray(z, "float64")
    malo = ~np.isfinite(z) | (z <= 0)
    if nodata_in is not None:
        malo |= z == nodata_in
    r = np.clip(np.rint(np.where(malo, 0, z)), 0, ALT_MAX).astype("int64")
    return np.where(malo, NODATA, np.maximum(r, 1)).astype("uint16")


def prediccion(u: np.ndarray) -> np.ndarray:
    u = u.astype("int64")
    p = np.zeros_like(u)
    p[0, 1:] = u[0, :-1]
    p[1:, 0] = u[:-1, 0]
    p[1:, 1:] = u[1:, :-1] + u[:-1, 1:] - u[:-1, :-1]
    return p


def codificar_tesela(u: np.ndarray) -> bytes:
    """Bloque cuadrado u16 → bytes (sin comprimir): planos bajo y alto del zigzag del residuo del predictor 2D."""
    r = u.astype("int64") - prediccion(u)
    zz = np.where(r >= 0, 2 * r, -2 * r - 1).astype("<u2")
    return zz.astype("uint8").tobytes() + (zz >> 8).astype("uint8").tobytes()


def decodificar_tesela(b: bytes, t: int) -> np.ndarray:
    """Inverso de codificar_tesela (referencia para los tests; la app hace lo mismo en mdt.ts)."""
    a = np.frombuffer(b, "uint8")
    zz = a[: t * t].astype("int64") | (a[t * t:].astype("int64") << 8)
    r = np.where(zz & 1, -((zz + 1) >> 1), zz >> 1).reshape(t, t)
    u = np.zeros((t, t), "int64")
    for f in range(t):
        for c in range(t):
            if f == 0:
                p = u[0, c - 1] if c else 0
            elif c == 0:
                p = u[f - 1, 0]
            else:
                p = u[f, c - 1] + u[f - 1, c] - u[f - 1, c - 1]
            u[f, c] = p + r[f, c]
    return u.astype("uint16")


def teselar(z: np.ndarray, teselas: list[tuple[int, int]], t: int):
    """(fila_t, col_t, bloque sin comprimir) de cada tesela pedida; relleno del borde = NODATA."""
    alto, ancho = z.shape
    for tf, tc in teselas:
        f0, c0 = tf * t, tc * t
        if f0 >= alto or c0 >= ancho:
            continue
        f1, c1 = min(f0 + t, alto), min(c0 + t, ancho)
        b = np.full((t, t), NODATA, "uint16")
        b[: f1 - f0, : c1 - c0] = z[f0:f1, c0:c1]
        yield tf, tc, codificar_tesela(b)


# ---------------------------------------------------------------- exportación

def escribir(destino: Path, x0: float, y1: float, z: np.ndarray, teselas: list[tuple[int, int]], t: int,
             res: float = RES_M) -> dict:
    """Escribe mdt_campo.bin y mdt_campo.json en `destino` (z: u16 en la rejilla fina); devuelve la cabecera."""
    destino = Path(destino)
    destino.mkdir(parents=True, exist_ok=True)
    indice, off = [], 0
    tmp = destino / "mdt_campo.bin.tmp"
    with open(tmp, "wb") as fh:
        for tf, tc, bloque in teselar(z, teselas, t):
            g = gzip.compress(bloque, compresslevel=9, mtime=0)
            fh.write(g)
            indice.append([tf, tc, off, len(g)])
            off += len(g)
    tmp.replace(destino / "mdt_campo.bin")
    cab = {"version": VERSION, "crs": "EPSG:25830", "res_m": res, "origen_xy": [x0, y1], "ancho": int(z.shape[1]),
           "alto": int(z.shape[0]), "tesela": t, "codificacion": CODIFICACION, "nodata": NODATA, "unidad": "m",
           "fuente": "MDT25 IGN (PNOA-LiDAR)", "bytes": off, "indice": indice}
    (destino / "mdt_campo.json").write_text(json.dumps(cab, ensure_ascii=False, separators=(",", ":")))
    return cab


def leer_mdt(dir_dem: Path, malla, res: float = RES_M) -> np.ndarray:
    """Mosaico del MDT25 (raw/dem/*.tif, lo descarga relieve.py) recortado a la malla en la rejilla de `res` m."""
    import rasterio
    from rasterio.merge import merge
    rutas = sorted(Path(dir_dem).glob("*.tif"))
    if not rutas:
        raise FileNotFoundError(f"sin MDT en {dir_dem}: ejecuta antes el relieve")
    srcs = [rasterio.open(p) for p in rutas]
    try:
        z, _ = merge(srcs, bounds=malla.bounds, res=res, nodata=-32768)
    finally:
        for s in srcs:
            s.close()
    return a_u16(z[0], -32768)


def exportar_mdt(region, malla, out: Path | None = None) -> dict | None:
    out = out or region.app
    j = out / "micro.json"
    if not j.exists():
        print("  mdt: sin micro.json (ejecuta antes `micro`); se omite", flush=True)
        return None
    micro = json.loads(j.read_text())
    factor = malla.celda / RES_M
    if factor != int(factor):
        raise ValueError(f"la malla de {malla.celda} m no es múltiplo de {RES_M} m")
    t = int(micro["tesela"] * factor)
    z = leer_mdt(region.raw / "dem", malla)
    assert z.shape == (malla.alto * int(factor), malla.ancho * int(factor)), z.shape
    cab = escribir(out, malla.x0, malla.y1, z, [(f, c) for f, c, *_ in micro["indice"]], t)
    print(f"  mdt: {len(cab['indice'])} teselas de {t}×{t} a {RES_M:g} m, {cab['bytes'] / 1e6:.1f} MB", flush=True)
    return cab
