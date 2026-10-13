"""Descargas por teselas (WFS / ArcGIS REST): troceo, paginación, caché y reintentos."""
from __future__ import annotations
import json, math, time
from pathlib import Path
import geopandas as gpd, pandas as pd, requests
from shapely.geometry import box

PAUSA_S = 0.5


class EntidadOmitida(RuntimeError):
    """Entidades que no se pudieron descargar ni partiendo la página hasta n=1.
    `urls`: las URL fallidas; `datos`: FeatureCollection con lo que sí se obtuvo."""

    def __init__(self, urls: list[str], datos: dict):
        super().__init__(f"{len(urls)} entidad(es) omitida(s): {urls[:1]}")
        self.urls, self.datos = urls, datos


class _Reintentable(Exception):
    pass


def teselas(zona, tam: float) -> list[tuple[float, float, float, float]]:
    """Cajas de lado <= tam que cubren los bounds de la zona; solo las que la intersecan."""
    xmin, ymin, xmax, ymax = zona.bounds
    nx, ny = math.ceil((xmax - xmin) / tam), math.ceil((ymax - ymin) / tam)
    out = []
    for j in range(ny):
        for i in range(nx):
            t = (xmin + i * tam, ymin + j * tam,
                 min(xmin + (i + 1) * tam, xmax), min(ymin + (j + 1) * tam, ymax))
            b = box(*t)
            if zona.intersects(b) and not zona.touches(b):
                out.append(t)
    return out


def obtener(url: str, cache: Path, reintentos: int = 5, timeout: int = 180) -> dict:
    """GET con caché en disco y reintentos con espera creciente ante 5xx, timeouts y errores de
    conexión (o respuesta truncada). Los 4xx fallan de inmediato."""
    cache = Path(cache)
    if cache.exists():
        return json.loads(cache.read_text())
    espera = 2.0
    for intento in range(reintentos):
        try:
            r = requests.get(url, timeout=timeout)
            if r.status_code >= 500:
                raise _Reintentable(f"{r.status_code}")
            r.raise_for_status()
            try:
                datos = r.json()
            except ValueError as e:       # cuerpo truncado: trátalo como fallo de red
                raise _Reintentable(f"JSON inválido: {e}") from e
            if "error" in datos:          # ArcGIS devuelve errores con 200
                err = datos["error"]
                codigo = err.get("code", 0) if isinstance(err, dict) else 0
                if codigo >= 500:
                    raise _Reintentable(str(err))
                raise requests.HTTPError(str(err))
            cache.parent.mkdir(parents=True, exist_ok=True)
            cache.write_text(r.text)
            time.sleep(PAUSA_S)
            return datos
        except (_Reintentable, requests.Timeout, requests.ConnectionError) as e:
            if intento == reintentos - 1:
                if isinstance(e, _Reintentable):
                    raise requests.HTTPError(str(e)) from e
                raise
            print(f"  reintento {intento + 1} ({e}) {url[:120]}")
            time.sleep(espera)
            espera *= 2
    raise RuntimeError("inalcanzable")


def _pagina(plantilla, caja, offset, n, cache) -> dict:
    """Una página. Si la plantilla admite {count} y el servidor corta la respuesta,
    se parte en dos mitades y se une (se cachea el resultado unido)."""
    xmin, ymin, xmax, ymax = caja
    url = plantilla.format(xmin=xmin, ymin=ymin, xmax=xmax, ymax=ymax, offset=offset, count=n)
    if "{count}" not in plantilla or Path(cache).exists():
        return obtener(url, cache)
    try:
        return obtener(url, cache, reintentos=2)
    except requests.RequestException:
        if n == 1:
            print(f"  OMITIDO: entidad {offset} no se pudo descargar ({url[:160]})")
            raise EntidadOmitida([url], {"type": "FeatureCollection", "features": []})
        m = n // 2
        print(f"  partiendo página {offset}+{n} en {m}+{n - m}")
        tmp = Path(cache).with_suffix("")
        feats, omitidas = [], []
        for off, k, suf in ((offset, m, f"_a{m}"), (offset + m, n - m, f"_b{n - m}")):
            try:
                feats += _pagina(plantilla, caja, off, k, Path(f"{tmp}{suf}.json")).get("features", [])
            except EntidadOmitida as e:
                omitidas += e.urls
                feats += e.datos.get("features", [])
        datos = {"type": "FeatureCollection", "features": feats}
        if omitidas:                      # sin caché unido: la próxima ejecución reintenta
            raise EntidadOmitida(omitidas, datos)
        Path(cache).write_text(json.dumps(datos))
        return datos


def descargar_teselas(plantilla: str, zona, tam: float, cache_dir: Path,
                      pagina: int = 1000, crs: str = "EPSG:25830") -> gpd.GeoDataFrame:
    """Recorre las teselas; la plantilla lleva {xmin},{ymin},{xmax},{ymax}, {offset} y opcionalmente {count}.
    Pide páginas hasta que una devuelve menos de `pagina` entidades."""
    trozos, omitidos = [], []
    ts = teselas(zona, tam)
    for k, t in enumerate(ts):
        offset = 0
        while True:
            xmin, ymin, xmax, ymax = (int(v) for v in t)
            n_omit = 0
            try:
                datos = _pagina(plantilla, (xmin, ymin, xmax, ymax), offset, pagina,
                                Path(cache_dir) / f"{xmin}_{ymin}_{xmax}_{ymax}_{offset}.json")
            except EntidadOmitida as e:
                datos, n_omit = e.datos, len(e.urls)
                omitidos += e.urls
            feats = datos.get("features", [])
            if feats:
                trozos.append(gpd.GeoDataFrame.from_features(feats, crs=crs))
            if len(feats) + n_omit < pagina and not datos.get("exceededTransferLimit"):
                break
            offset += pagina
        print(f"  tesela {k + 1}/{len(ts)} ok")
    Path(cache_dir).mkdir(parents=True, exist_ok=True)
    (Path(cache_dir) / "omitidos.json").write_text(json.dumps(omitidos, indent=1))
    if omitidos:
        print(f"  WARNING: {len(omitidos)} entidad(es) OMITIDAS (ver {Path(cache_dir) / 'omitidos.json'}); "
              "repite la ejecución para reintentarlas")
    if not trozos:
        return gpd.GeoDataFrame(geometry=[], crs=crs)
    return gpd.GeoDataFrame(pd.concat(trozos, ignore_index=True), crs=crs)


def cargar_zona(ruta: Path):
    return gpd.read_file(ruta).to_crs("EPSG:25830").union_all()
