# Mapa de setas — Plan (hoja de ruta + Fase 1: terreno e idoneidad)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generar, en el Mac, la malla de 100 m de la zona a ≤2 h de Marbella con terreno, bosque, suelo, accesos y protección, y la puntuación de idoneidad 0–100 para boletus y *Amanita caesarea*, validada contra observaciones de GBIF.

**Architecture:** Pipeline Python por módulos. Cada módulo produce un GeoTIFF alineado con la misma malla (EPSG:25830, celdas de 100 m). La lógica de puntuación es una función pura vectorizada (numpy) con perfiles en YAML. Las descargas y la red quedan aisladas en funciones `descargar_*`, y la transformación en funciones puras testeadas con datos sintéticos.

**Tech Stack:** Python 3.12 (uv), numpy, scipy, rasterio, geopandas/pyogrio, shapely, pyproj, pyosmium, requests, pyyaml, matplotlib, pytest.

**Spec:** `docs/specs/2026-10-13-mapa-setas-design.md`

## Global Constraints

- CRS de trabajo: **EPSG:25830** (ETRS89 / UTM 30N). Celda: **100 m**. Todas las capas están alineadas con `malla.json`.
- Origen: Marbella, **lat 36.5101, lon -4.8825**. Límite: **≤7200 s** en coche.
- Python fijado a **3.12** (`requires-python = ">=3.12,<3.13"`) para tener wheels de rasterio y pyosmium. El python del sistema (3.14) no se usa.
- Datos crudos en `pipeline/data/raw/` y productos en `pipeline/data/out/`. Ninguno de los dos se versiona (`.gitignore`).
- Sin claves ni secretos en el repositorio. La Fase 1 no necesita ninguna.
- No inventar hechos: URL, campos de atributos o códigos que no se hayan verificado se marcan `PENDIENTE` en `fuentes.yaml`, y la tarea que los use se detiene.
- Seguridad (spec §2): la Fase 1 no produce texto de comestibilidad.
- Comentarios y nombres en castellano, sin tildes en identificadores.

---

## Hoja de ruta y puertas de revisión

Cada fase tiene su propio plan detallado, que se escribe al terminar la anterior porque depende de lo que salga de ella.

| Fase | Entregable | Puerta de revisión al cerrar |
|---|---|---|
| 0 | Repo git, scaffold ICM, entorno uv (Tarea 0 de este plan) | — |
| **1** | Malla + idoneidad + calibración (este plan) | `code-review` (high) + revisión del informe de calibración con Alexander |
| 2 | PWA básica: mapa offline (PMTiles), capas, GPS, mis sitios, GitHub Pages | `code-review` (high) + prueba e2e en modo avión |
| 3 | Tiempo (Open-Meteo) + semáforo + gráfico | `code-review` (high) |
| 4 | Guía de especies (fichas, fotos CC, "No confundir con") | Revisión de contenido en el hilo principal frente a fuentes + `humanizer` en los textos |
| 5 | Reconocedor offline (spike de viabilidad del modelo y luego integración) + comprobación guiada | `code-review` (max): ruta de seguridad, que la phalloides nunca salga sin alerta roja |
| 6 | Cloudflare Worker + Gemini | **`security-review`** del Worker antes de desplegar + `code-review` (high) |
| 7 | Exportación a OsmAnd/Locus | `code-review` (medium) |
| Cierre | App completa | **`impeccable`** (auditoría UI/UX móvil) + `verification-before-completion` |

Durante todas las fases: `superpowers:requesting-code-review` al terminar cada tarea (revisión por tarea de subagent-driven-development) y `verification-before-completion` antes de dar algo por hecho.

---

## Estructura de archivos (Fase 1)

```
setas/
  .gitignore
  pipeline/
    pyproject.toml
    fuentes.yaml              # URLs, formatos, licencias y campos verificados (Tarea 1)
    especies.yaml             # perfiles de hábitat (Tarea 8)
    setas_pipeline/
      __init__.py
      malla.py                # definición de la malla y E/S de GeoTIFF alineados
      zona.py                 # isócrona 2 h vía OSRM
      relieve.py              # DEM → altitud, pendiente, orientación
      vegetacion.py           # MFE → clase de árbol dominante
      suelo.py                # geología → clase de suelo
      accesos.py              # OSM → distancia al acceso
      protegidos.py           # ENP → máscara
      idoneidad.py            # puntuación pura por especie
      calibracion.py          # GBIF → informe
      vista_previa.py         # PNG de control por especie
      ejecutar.py             # orquestador CLI
    tests/
      test_malla.py
      test_zona.py
      test_relieve.py
      test_vegetacion.py
      test_suelo.py
      test_accesos.py
      test_idoneidad.py
      test_calibracion.py
```

**Códigos compartidos** (definidos en `malla.py`, usados por todos):

```python
ARBOL = {"sin_arbolado": 0, "alcornoque": 1, "encina": 2, "quejigo": 3,
         "castano": 4, "pino": 5, "pinsapo": 6, "otro": 7}
SUELO = {"desconocido": 0, "acido": 1, "basico": 2, "ultrabasico": 3, "otro": 4}
NODATA_F = -9999.0
```

---

### Tarea 0: Repo, ICM y entorno

**Files:**
- Create: `.gitignore`, `pipeline/pyproject.toml`, `pipeline/setas_pipeline/__init__.py`, `pipeline/tests/__init__.py`
- ICM: seguir `~/.claude/icm/ICM-PLAYBOOK.md` §Scaffold (`CLAUDE.md`, `CONTEXT.md`, `stages/`, `knowledge/`, `_config/icm-state.json`). Las etapas son las 7 fases de la hoja de ruta.

- [ ] **Step 1: git init**

```bash
cd /Users/alexanderkrupnov/Documents/Claude/setas && git init -b main
```

- [ ] **Step 2: .gitignore**

```
pipeline/data/
.venv/
__pycache__/
*.pyc
.DS_Store
```

- [ ] **Step 3: pyproject**

```toml
[project]
name = "setas-pipeline"
version = "0.1.0"
requires-python = ">=3.12,<3.13"
dependencies = [
  "numpy>=2.0", "scipy>=1.13", "rasterio>=1.4", "geopandas>=1.0", "pyogrio>=0.9",
  "shapely>=2.0", "pyproj>=3.6", "osmium>=4.0", "requests>=2.32", "pyyaml>=6.0",
  "matplotlib>=3.9",
]

[dependency-groups]
dev = ["pytest>=8.0"]

[tool.pytest.ini_options]
testpaths = ["tests"]
```

- [ ] **Step 4: Instalar y comprobar**

Run: `cd pipeline && uv sync && uv run python -c "import rasterio, osmium, geopandas; print('ok')"`
Expected: `ok`

- [ ] **Step 5: Scaffold ICM** (según el playbook; delegable a Sonnet).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "chore: repo, entorno pipeline y scaffold ICM"
```

---

### Tarea 1: Spike de fuentes (verificación, sin código de producción)

Esta tarea es de investigación con criterio, así que va al executor Opus. **Su salida es `pipeline/fuentes.yaml`**, y las tareas 4–7 leen de ahí las URL y los nombres de campo. No se inventa nada: lo que no se pueda confirmar queda en `PENDIENTE` con una nota.

**Files:**
- Create: `pipeline/fuentes.yaml`

- [ ] **Step 1: Verificar y rellenar cada fuente**, descargando una muestra pequeña para confirmar el formato y los campos:

```yaml
dem:
  nombre: Copernicus DEM GLO-30 (AWS Open Data)
  # Teselas 1°x1°. Patrón conocido; verificar que N36/N37 × W003..W007 responden 200.
  url_patron: "https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N{lat:02d}_00_W{lon:03d}_00_DEM/Copernicus_DSM_COG_10_N{lat:02d}_00_W{lon:03d}_00_DEM.tif"
  licencia: PENDIENTE
  nota: "Sustituye al MDT25 IGN del spec (descarga automatizable; 30 m → 100 m sin pérdida relevante)."
osm:
  url: "https://download.geofabrik.de/europe/spain/andalucia-latest.osm.pbf"
  licencia: ODbL
  tags_acceso: {highway: [track, path, footway, bridleway, unclassified, tertiary, secondary, primary, trunk, residential, service]}
mfe:
  nombre: Mapa Forestal de España 1:25.000 (MITECO)
  provincias: [Malaga, Cadiz, Sevilla, Granada, Cordoba]   # recortar a las que toca la zona
  url_por_provincia: PENDIENTE
  formato: PENDIENTE
  campo_especie_dominante: PENDIENTE      # p.ej. código de especie 1
  tabla_codigos_especie: PENDIENTE        # ruta o URL del diccionario de códigos
  licencia: PENDIENTE
geologia:
  nombre: PENDIENTE   # IGME GEODE 1:50.000 (WFS) o REDIAM litología
  url: PENDIENTE
  campo_litologia: PENDIENTE
  licencia: PENDIENTE
enp:
  nombre: Espacios Naturales Protegidos de Andalucía (REDIAM)
  url: PENDIENTE
  licencia: PENDIENTE
gbif:
  api: "https://api.gbif.org/v1"
  licencia: "por registro (CC0/CC-BY/CC-BY-NC)"
```

- [ ] **Step 2: Tabla de mapeo.** En `fuentes.yaml` → `mfe.mapeo_arbol` se relacionan los códigos de especie del MFE con las claves de `ARBOL`: *Quercus suber* = alcornoque; *Q. ilex/rotundifolia* = encina; *Q. faginea*, *Q. canariensis* = quejigo; *Castanea sativa* = castano; *Pinus* spp. = pino; *Abies pinsapo* = pinsapo; resto de arbolado = otro; desarbolado = sin_arbolado. En `geologia.mapeo_suelo` se relacionan las litologías con `SUELO`: granitos, pizarras, esquistos, gneis, areniscas silíceas y cuarcitas = acido; calizas, dolomías, margas y yesos = basico; peridotitas y serpentinitas = ultrabasico.

- [ ] **Step 3: Informe** en el commit: qué quedó `PENDIENTE` y por qué. Si `mfe` o `geologia` se quedan sin URL, **se detiene la ejecución y se avisa al planificador** antes de las tareas 5–6.

- [ ] **Step 4: Commit**

```bash
git add pipeline/fuentes.yaml && git commit -m "docs: fuentes de datos verificadas (spike)"
```

---

### Tarea 2: Malla

**Files:**
- Create: `pipeline/setas_pipeline/malla.py`
- Test: `pipeline/tests/test_malla.py`

**Interfaces:**
- Produces: `Malla(x0, y1, ancho, alto, celda=100)`; `Malla.desde_bounds(xmin, ymin, xmax, ymax) -> Malla`; `Malla.transform` (affine); `Malla.guardar(ruta)` / `Malla.cargar(ruta)` (JSON); `escribir_tif(malla, ruta, array, nodata)`; `leer_tif(ruta) -> np.ndarray`; constantes `ARBOL`, `SUELO`, `NODATA_F`, `CRS = "EPSG:25830"`.

- [ ] **Step 1: Test que falla**

```python
import numpy as np
from setas_pipeline.malla import Malla, escribir_tif, leer_tif

def test_desde_bounds_ajusta_a_100m():
    m = Malla.desde_bounds(300_050, 4_000_020, 300_960, 4_000_510)
    assert (m.x0, m.y1) == (300_000, 4_000_600)
    assert (m.ancho, m.alto) == (10, 6)

def test_roundtrip_json_y_tif(tmp_path):
    m = Malla.desde_bounds(0, 0, 500, 300)
    m.guardar(tmp_path / "malla.json")
    m2 = Malla.cargar(tmp_path / "malla.json")
    assert m2 == m
    a = np.arange(15, dtype="float32").reshape(3, 5)
    escribir_tif(m, tmp_path / "a.tif", a, nodata=-9999.0)
    assert np.array_equal(leer_tif(tmp_path / "a.tif"), a)
```

- [ ] **Step 2:** `cd pipeline && uv run pytest tests/test_malla.py -v` → FAIL (ModuleNotFoundError).

- [ ] **Step 3: Implementación**

```python
"""Malla común: todas las capas comparten CRS, origen y celda."""
from __future__ import annotations
import json, math
from dataclasses import dataclass, asdict
from pathlib import Path
import numpy as np
import rasterio
from rasterio.transform import from_origin

CRS = "EPSG:25830"
NODATA_F = -9999.0
ARBOL = {"sin_arbolado": 0, "alcornoque": 1, "encina": 2, "quejigo": 3,
         "castano": 4, "pino": 5, "pinsapo": 6, "otro": 7}
SUELO = {"desconocido": 0, "acido": 1, "basico": 2, "ultrabasico": 3, "otro": 4}


@dataclass(frozen=True)
class Malla:
    x0: float      # borde oeste
    y1: float      # borde norte
    ancho: int
    alto: int
    celda: float = 100.0

    @classmethod
    def desde_bounds(cls, xmin, ymin, xmax, ymax, celda=100.0) -> "Malla":
        x0 = math.floor(xmin / celda) * celda
        y0 = math.floor(ymin / celda) * celda
        x1 = math.ceil(xmax / celda) * celda
        y1 = math.ceil(ymax / celda) * celda
        return cls(x0, y1, int((x1 - x0) / celda), int((y1 - y0) / celda), celda)

    @property
    def transform(self):
        return from_origin(self.x0, self.y1, self.celda, self.celda)

    @property
    def bounds(self):
        return (self.x0, self.y1 - self.alto * self.celda,
                self.x0 + self.ancho * self.celda, self.y1)

    def guardar(self, ruta: Path) -> None:
        Path(ruta).write_text(json.dumps(asdict(self)))

    @classmethod
    def cargar(cls, ruta: Path) -> "Malla":
        return cls(**json.loads(Path(ruta).read_text()))


def escribir_tif(malla: Malla, ruta: Path, array: np.ndarray, nodata) -> None:
    assert array.shape == (malla.alto, malla.ancho), array.shape
    Path(ruta).parent.mkdir(parents=True, exist_ok=True)
    with rasterio.open(ruta, "w", driver="GTiff", height=malla.alto, width=malla.ancho,
                       count=1, dtype=array.dtype, crs=CRS, transform=malla.transform,
                       nodata=nodata, compress="deflate") as dst:
        dst.write(array, 1)


def leer_tif(ruta: Path) -> np.ndarray:
    with rasterio.open(ruta) as src:
        return src.read(1)
```

- [ ] **Step 4:** `uv run pytest tests/test_malla.py -v` → PASS.
- [ ] **Step 5:** `git add -A && git commit -m "feat(pipeline): malla común y E/S GeoTIFF"`

---

### Tarea 3: Zona (isócrona 2 h)

**Files:**
- Create: `pipeline/setas_pipeline/zona.py`
- Test: `pipeline/tests/test_zona.py`

**Interfaces:**
- Consumes: `Malla.desde_bounds`, `CRS`.
- Produces: `puntos_muestreo(paso_m=5000) -> list[tuple[lon, lat]]` (rejilla en un radio de 220 km del origen); `consultar_osrm(origen, destinos) -> list[dict(duracion, snap_m)]` (red); `filtrar_alcanzables(puntos, resultados, max_s=7200, max_snap_m=5000) -> list[tuple]` (pura); `poligono_zona(puntos, paso_m) -> shapely Polygon en EPSG:25830` (pura); `construir_zona(out_dir) -> Malla` (escribe `zona.geojson` y `malla.json`).

- [ ] **Step 1: Tests de las partes puras**

```python
from shapely.geometry import Point
from setas_pipeline.zona import filtrar_alcanzables, poligono_zona

def test_filtrar_alcanzables_descarta_lejos_y_mal_ajustados():
    pts = [(0, 0), (1, 1), (2, 2), (3, 3)]
    res = [{"duracion": 100, "snap_m": 10},
           {"duracion": 8000, "snap_m": 10},
           {"duracion": 100, "snap_m": 9000},
           {"duracion": None, "snap_m": None}]
    assert filtrar_alcanzables(pts, res) == [(0, 0)]

def test_poligono_zona_une_cuadrados():
    # dos puntos UTM contiguos a 5 km → un rectángulo de 10×5 km
    pol = poligono_zona([(300_000, 4_000_000), (305_000, 4_000_000)], paso_m=5000, crs_entrada="EPSG:25830")
    assert abs(pol.area - 10_000 * 5_000) < 1
    assert pol.contains(Point(302_500, 4_000_000))
```

- [ ] **Step 2:** `uv run pytest tests/test_zona.py -v` → FAIL.

- [ ] **Step 3: Implementación**

```python
"""Zona de trabajo: puntos alcanzables en ≤2 h en coche desde Marbella (OSRM)."""
from __future__ import annotations
import json, time
from pathlib import Path
import requests
from pyproj import Transformer
from shapely.geometry import box, mapping
from shapely.ops import unary_union
from .malla import Malla, CRS

ORIGEN = (-4.8825, 36.5101)  # lon, lat
OSRM = "https://router.project-osrm.org/table/v1/driving/"
_a_utm = Transformer.from_crs("EPSG:4326", CRS, always_xy=True)
_a_geo = Transformer.from_crs(CRS, "EPSG:4326", always_xy=True)


def puntos_muestreo(paso_m=5000, radio_m=220_000):
    cx, cy = _a_utm.transform(*ORIGEN)
    pts = []
    n = int(radio_m // paso_m)
    for i in range(-n, n + 1):
        for j in range(-n, n + 1):
            x, y = cx + i * paso_m, cy + j * paso_m
            if (x - cx) ** 2 + (y - cy) ** 2 <= radio_m ** 2:
                pts.append(_a_geo.transform(x, y))
    return pts


def consultar_osrm(origen, destinos, lote=99, pausa_s=1.0):
    salida = []
    for k in range(0, len(destinos), lote):
        trozo = destinos[k:k + lote]
        coords = ";".join(f"{lon:.5f},{lat:.5f}" for lon, lat in [origen, *trozo])
        r = requests.get(OSRM + coords, params={"sources": "0", "annotations": "duration"}, timeout=60)
        r.raise_for_status()
        j = r.json()
        dur = j["durations"][0][1:]
        snaps = [d.get("distance") for d in j["destinations"][1:]]
        salida += [{"duracion": d, "snap_m": s} for d, s in zip(dur, snaps)]
        time.sleep(pausa_s)  # uso razonable del servidor demo
    return salida


def filtrar_alcanzables(puntos, resultados, max_s=7200, max_snap_m=5000):
    return [p for p, r in zip(puntos, resultados)
            if r["duracion"] is not None and r["snap_m"] is not None
            and r["duracion"] <= max_s and r["snap_m"] <= max_snap_m]


def poligono_zona(puntos, paso_m=5000, crs_entrada="EPSG:4326"):
    if crs_entrada != CRS:
        puntos = [_a_utm.transform(x, y) for x, y in puntos]
    h = paso_m / 2
    return unary_union([box(x - h, y - h, x + h, y + h) for x, y in puntos])


def construir_zona(out_dir: Path) -> Malla:
    pts = puntos_muestreo()
    res = consultar_osrm(ORIGEN, pts)
    pol = poligono_zona(filtrar_alcanzables(pts, res))
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "zona.geojson").write_text(json.dumps(
        {"type": "FeatureCollection", "crs": {"type": "name", "properties": {"name": CRS}},
         "features": [{"type": "Feature", "properties": {}, "geometry": mapping(pol)}]}))
    malla = Malla.desde_bounds(*pol.bounds)
    malla.guardar(out_dir / "malla.json")
    return malla
```

- [ ] **Step 4:** `uv run pytest tests/test_zona.py -v` → PASS.
- [ ] **Step 5: Ejecución real.** Run: `uv run python -c "from pathlib import Path; from setas_pipeline.zona import construir_zona; print(construir_zona(Path('data/out')))"`. Expected: una `Malla` con un ancho y un alto de varios miles de celdas, y `data/out/zona.geojson` creado. Comprobación de sentido común: Ronda, Grazalema, Jimena de la Frontera y Málaga capital dentro; Huelva fuera.
- [ ] **Step 6:** `git add -A && git commit -m "feat(pipeline): zona isócrona 2 h desde Marbella"`

---

### Tarea 4: Relieve (altitud, pendiente, orientación)

**Files:**
- Create: `pipeline/setas_pipeline/relieve.py`
- Test: `pipeline/tests/test_relieve.py`

**Interfaces:**
- Consumes: `Malla`, `escribir_tif`, `NODATA_F`, `fuentes.yaml → dem.url_patron`.
- Produces: `pendiente_orientacion(z: np.ndarray, celda: float) -> (pendiente_grados, orientacion_grados)` (pura; orientación de 0 a 360 en sentido horario desde el norte, hacia donde mira la ladera; **-1 = llano** si la pendiente es menor de 2°); `construir_relieve(malla, raw_dir, out_dir)` → `altitud.tif`, `pendiente.tif`, `orientacion.tif`.

- [ ] **Step 1: Tests con planos sintéticos**

```python
import numpy as np
from setas_pipeline.relieve import pendiente_orientacion

def _plano(dx_por_col, dy_norte_por_fila, n=7):
    filas, cols = np.mgrid[0:n, 0:n]
    # la fila 0 es el norte: subir hacia el norte = disminuir el índice de fila
    return (cols * dx_por_col + (n - 1 - filas) * dy_norte_por_fila).astype("float32")

def test_sube_al_norte_mira_al_sur():
    p, o = pendiente_orientacion(_plano(0, 20), celda=100)
    assert np.allclose(o[3, 3], 180, atol=0.5)
    assert np.allclose(p[3, 3], np.degrees(np.arctan(0.2)), atol=0.1)

def test_sube_al_este_mira_al_oeste():
    _, o = pendiente_orientacion(_plano(20, 0), celda=100)
    assert np.allclose(o[3, 3], 270, atol=0.5)

def test_llano_es_menos_uno():
    _, o = pendiente_orientacion(np.zeros((5, 5), "float32"), celda=100)
    assert (o == -1).all()
```

- [ ] **Step 2:** `uv run pytest tests/test_relieve.py -v` → FAIL.

- [ ] **Step 3: Implementación**

```python
"""Relieve: DEM Copernicus → altitud, pendiente y orientación en la malla."""
from __future__ import annotations
from pathlib import Path
import numpy as np
import requests, yaml
import rasterio
from rasterio.warp import reproject, Resampling
from rasterio.merge import merge
from pyproj import Transformer
from .malla import Malla, CRS, NODATA_F, escribir_tif

LLANO_GRADOS = 2.0


def pendiente_orientacion(z: np.ndarray, celda: float):
    dz_dfila, dz_dcol = np.gradient(z.astype("float64"), celda)
    dz_dx = dz_dcol            # este
    dz_dy = -dz_dfila          # norte (las filas crecen hacia el sur)
    pend = np.degrees(np.arctan(np.hypot(dz_dx, dz_dy)))
    orient = (np.degrees(np.arctan2(-dz_dx, -dz_dy)) + 360) % 360
    orient = np.where(pend < LLANO_GRADOS, -1.0, orient)
    return pend.astype("float32"), orient.astype("float32")


def _teselas(malla: Malla):
    a_geo = Transformer.from_crs(CRS, "EPSG:4326", always_xy=True)
    xmin, ymin, xmax, ymax = malla.bounds
    lon0, lat0 = a_geo.transform(xmin, ymin)
    lon1, lat1 = a_geo.transform(xmax, ymax)
    for lat in range(int(np.floor(lat0)), int(np.floor(lat1)) + 1):
        for lon in range(int(np.floor(lon0)), int(np.floor(lon1)) + 1):
            yield lat, -lon if lon < 0 else lon  # oeste: W{abs}


def construir_relieve(malla: Malla, raw_dir: Path, out_dir: Path, fuentes: Path):
    patron = yaml.safe_load(Path(fuentes).read_text())["dem"]["url_patron"]
    raw_dir.mkdir(parents=True, exist_ok=True)
    rutas = []
    for lat, lon_w in _teselas(malla):
        # Las teselas de longitud oeste se nombran por su borde oeste: W005 cubre de -5 a -4.
        url = patron.format(lat=lat, lon=lon_w)
        ruta = raw_dir / f"dem_N{lat}_W{lon_w}.tif"
        if not ruta.exists():
            r = requests.get(url, timeout=300)
            if r.status_code == 404:
                continue  # tesela de mar
            r.raise_for_status()
            ruta.write_bytes(r.content)
        rutas.append(ruta)
    srcs = [rasterio.open(p) for p in rutas]
    mosaico, trans = merge(srcs)
    alt = np.full((malla.alto, malla.ancho), NODATA_F, "float32")
    reproject(mosaico[0], alt, src_transform=trans, src_crs=srcs[0].crs,
              dst_transform=malla.transform, dst_crs=CRS, resampling=Resampling.average,
              dst_nodata=NODATA_F)
    pend, orient = pendiente_orientacion(np.where(alt == NODATA_F, np.nan, alt), malla.celda)
    pend = np.nan_to_num(pend, nan=NODATA_F); orient = np.nan_to_num(orient, nan=NODATA_F)
    escribir_tif(malla, out_dir / "altitud.tif", alt, NODATA_F)
    escribir_tif(malla, out_dir / "pendiente.tif", pend, NODATA_F)
    escribir_tif(malla, out_dir / "orientacion.tif", orient, NODATA_F)
```

> Nota para el ejecutor: en `_teselas`, comprobar con una petición HEAD cómo nombra Copernicus las teselas de longitud oeste (si `W005` cubre de -5 a -4, entonces `lon_w = -floor(lon)`). Ajustar y documentarlo en `fuentes.yaml` antes de descargar todo.

- [ ] **Step 4:** `uv run pytest tests/test_relieve.py -v` → PASS.
- [ ] **Step 5: Ejecución real** y comprobación: la altitud máxima de la zona debe estar entre 1900 y 2100 m (Torrecilla, Sierra de las Nieves, unos 1919 m; si la isócrona alcanza Sierra Nevada, más de 3000 m: anotarlo). Las celdas de mar quedan en NODATA.
- [ ] **Step 6:** `git add -A && git commit -m "feat(pipeline): relieve (altitud, pendiente, orientación)"`

---

### Tarea 5: Vegetación (árbol dominante)

**Files:**
- Create: `pipeline/setas_pipeline/vegetacion.py`
- Test: `pipeline/tests/test_vegetacion.py`

**Interfaces:**
- Consumes: `Malla`, `ARBOL`, `escribir_tif`, `fuentes.yaml → mfe.*` (URL, `campo_especie_dominante`, `mapeo_arbol`).
- Produces: `clasificar(codigos: pd.Series, mapeo: dict[str, str]) -> pd.Series[int]` (pura: código MFE → valor de `ARBOL`, y lo desconocido → `otro`; nulo → `sin_arbolado`); `rasterizar_clases(gdf, columna, malla) -> np.ndarray[uint8]` (pura); `construir_vegetacion(malla, raw_dir, out_dir, fuentes)` → `arbol.tif` (uint8, nodata 255).

- [ ] **Step 1: Tests**

```python
import geopandas as gpd, pandas as pd, numpy as np
from shapely.geometry import box
from setas_pipeline.malla import Malla, ARBOL
from setas_pipeline.vegetacion import clasificar, rasterizar_clases

def test_clasificar_mapea_desconocido_y_nulo():
    mapeo = {"46": "alcornoque", "72": "castano"}
    s = clasificar(pd.Series(["46", "72", "999", None]), mapeo)
    assert list(s) == [ARBOL["alcornoque"], ARBOL["castano"], ARBOL["otro"], ARBOL["sin_arbolado"]]

def test_rasterizar_clases_pinta_poligono():
    m = Malla.desde_bounds(0, 0, 1000, 1000)
    gdf = gpd.GeoDataFrame({"clase": [ARBOL["castano"]]}, geometry=[box(0, 500, 500, 1000)], crs="EPSG:25830")
    a = rasterizar_clases(gdf, "clase", m)
    assert a[0, 0] == ARBOL["castano"] and a[9, 9] == ARBOL["sin_arbolado"]
```

(Los códigos "46" y "72" del test son ficticios. Los reales salen de `fuentes.yaml`.)

- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implementación**

```python
"""Vegetación: MFE → clase de árbol dominante por celda."""
from __future__ import annotations
from pathlib import Path
import numpy as np, pandas as pd, geopandas as gpd, yaml
from rasterio.features import rasterize
from .malla import Malla, ARBOL, CRS, escribir_tif


def clasificar(codigos: pd.Series, mapeo: dict) -> pd.Series:
    def uno(c):
        if c is None or (isinstance(c, float) and np.isnan(c)):
            return ARBOL["sin_arbolado"]
        return ARBOL[mapeo.get(str(c), "otro")]
    return codigos.map(uno).astype("uint8")


def rasterizar_clases(gdf: gpd.GeoDataFrame, columna: str, malla: Malla) -> np.ndarray:
    gdf = gdf.to_crs(CRS)
    formas = ((g, int(v)) for g, v in zip(gdf.geometry, gdf[columna]) if g is not None)
    return rasterize(formas, out_shape=(malla.alto, malla.ancho), transform=malla.transform,
                     fill=ARBOL["sin_arbolado"], dtype="uint8")


def construir_vegetacion(malla: Malla, raw_dir: Path, out_dir: Path, fuentes: Path):
    cfg = yaml.safe_load(Path(fuentes).read_text())["mfe"]
    capas = []
    for prov, url in cfg["url_por_provincia"].items():
        ruta = raw_dir / f"mfe_{prov}"
        # descarga y descompresión según cfg["formato"] (definido en el spike)
        gdf = gpd.read_file(_descargar_y_localizar(url, ruta), bbox=malla.bounds)
        capas.append(gdf)
    gdf = pd.concat(capas, ignore_index=True)
    gdf["clase"] = clasificar(gdf[cfg["campo_especie_dominante"]], cfg["mapeo_arbol"])
    escribir_tif(malla, out_dir / "arbol.tif", rasterizar_clases(gdf, "clase", malla), 255)
```

> Nota para el ejecutor: `_descargar_y_localizar(url, ruta) -> Path` se implementa según el formato confirmado en el spike (ZIP con shapefile o GPKG). Hay que filtrar por `bbox` al leer para no cargar provincias enteras en memoria.

- [ ] **Step 4:** PASS en los tests.
- [ ] **Step 5: Ejecución real** y comprobación: el alcornocal domina en Los Alcornocales (alrededor de Jimena/Cortes), el castañar aparece en el Valle del Genal y el pinsapo en Sierra de las Nieves y Grazalema. Generar `vista_arbol.png` rápido con matplotlib para revisarlo en el hilo principal.
- [ ] **Step 6:** `git commit -m "feat(pipeline): vegetación (árbol dominante)"`

---

### Tarea 6: Suelo y espacios protegidos

**Files:**
- Create: `pipeline/setas_pipeline/suelo.py`, `pipeline/setas_pipeline/protegidos.py`
- Test: `pipeline/tests/test_suelo.py`

**Interfaces:**
- Consumes: `rasterizar_clases` (Tarea 5), `SUELO`, `fuentes.yaml → geologia.*`, `enp.*`.
- Produces: `clasificar_litologia(textos: pd.Series, mapeo: dict[str, list[str]]) -> pd.Series[int]` (pura: busca palabras clave sin distinguir mayúsculas; la primera coincidencia en el orden ultrabasico → acido → basico gana; sin coincidencia → `otro`; nulo → `desconocido`); `construir_suelo(...)` → `suelo.tif`; `construir_protegidos(...)` → `protegido.tif` (uint8: 0/1).

- [ ] **Step 1: Test**

```python
import pandas as pd
from setas_pipeline.malla import SUELO
from setas_pipeline.suelo import clasificar_litologia

MAPEO = {"ultrabasico": ["peridotita", "serpentinita"],
         "acido": ["granito", "pizarra", "esquisto", "gneis", "cuarcita", "arenisca"],
         "basico": ["caliza", "dolomia", "dolomía", "marga", "yeso"]}

def test_clasificar_litologia():
    s = clasificar_litologia(pd.Series(["Peridotitas serpentinizadas", "Pizarras y esquistos",
                                        "Calizas y dolomías", "Aluvial", None]), MAPEO)
    assert list(s) == [SUELO["ultrabasico"], SUELO["acido"], SUELO["basico"], SUELO["otro"], SUELO["desconocido"]]
```

- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implementación**

```python
"""Suelo: litología → ácido / básico / ultrabásico."""
from __future__ import annotations
import pandas as pd
from .malla import SUELO

ORDEN = ["ultrabasico", "acido", "basico"]


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
```

`construir_suelo` y `construir_protegidos` siguen el patrón de `construir_vegetacion`: leen con `bbox`, clasifican, rasterizan con `rasterizar_clases` y escriben. En `protegidos`, a todos los polígonos ENP se les asigna valor 1 y el fondo es 0.

- [ ] **Step 4:** PASS.
- [ ] **Step 5: Ejecución real** y comprobación: Sierra Bermeja debe salir ultrabásica (peridotitas), Sierra de las Nieves y Grazalema mayoritariamente básicas (calizas) y Los Alcornocales ácido (areniscas del Aljibe).
- [ ] **Step 6:** `git commit -m "feat(pipeline): suelo y espacios protegidos"`

---

### Tarea 7: Accesos (distancia al sendero, pista o carretera)

**Files:**
- Create: `pipeline/setas_pipeline/accesos.py`
- Test: `pipeline/tests/test_accesos.py`

**Interfaces:**
- Consumes: `Malla`, `escribir_tif`, `fuentes.yaml → osm.*`.
- Produces: `distancia_a_lineas(mascara: np.ndarray[bool], celda) -> np.ndarray[float32]` (pura, metros); `extraer_vias(pbf, bbox_geo, tipos) -> GeoDataFrame` (pyosmium); `construir_accesos(...)` → `distancia_acceso.tif`.

- [ ] **Step 1: Test**

```python
import numpy as np
from setas_pipeline.accesos import distancia_a_lineas

def test_distancia_a_lineas():
    m = np.zeros((5, 5), bool); m[:, 0] = True   # camino en la columna 0
    d = distancia_a_lineas(m, celda=100)
    assert d[2, 0] == 0 and d[2, 3] == 300
```

- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implementación**

```python
"""Accesos: distancia de cada celda a la vía (OSM) más cercana."""
from __future__ import annotations
from pathlib import Path
import numpy as np, geopandas as gpd, osmium, requests, yaml
from scipy.ndimage import distance_transform_edt
from shapely import wkb
from rasterio.features import rasterize
from .malla import Malla, CRS, NODATA_F, escribir_tif


def distancia_a_lineas(mascara: np.ndarray, celda: float) -> np.ndarray:
    return (distance_transform_edt(~mascara) * celda).astype("float32")


def extraer_vias(pbf: Path, tipos: list[str]) -> gpd.GeoDataFrame:
    fab = osmium.geom.WKBFactory()
    geoms = []
    for obj in osmium.FileProcessor(str(pbf)).with_locations().with_filter(osmium.filter.KeyFilter("highway")):
        if obj.is_way() and obj.tags.get("highway") in tipos:
            try:
                geoms.append(wkb.loads(fab.create_linestring(obj), hex=True))
            except osmium.InvalidLocationError:
                pass
    return gpd.GeoDataFrame(geometry=geoms, crs="EPSG:4326")


def construir_accesos(malla: Malla, raw_dir: Path, out_dir: Path, fuentes: Path):
    cfg = yaml.safe_load(Path(fuentes).read_text())["osm"]
    pbf = raw_dir / "andalucia.osm.pbf"
    if not pbf.exists():
        with requests.get(cfg["url"], stream=True, timeout=600) as r:
            r.raise_for_status()
            with open(pbf, "wb") as f:
                for trozo in r.iter_content(1 << 20):
                    f.write(trozo)
    vias = extraer_vias(pbf, cfg["tags_acceso"]["highway"]).to_crs(CRS)
    mascara = rasterize(((g, 1) for g in vias.geometry), out_shape=(malla.alto, malla.ancho),
                        transform=malla.transform, fill=0, all_touched=True, dtype="uint8").astype(bool)
    escribir_tif(malla, out_dir / "distancia_acceso.tif", distancia_a_lineas(mascara, malla.celda), NODATA_F)
```

- [ ] **Step 4:** PASS.
- [ ] **Step 5: Ejecución real** y comprobación: la distancia media en una zona serrana, por ejemplo el interior de Sierra de las Nieves, debe estar entre 200 y 1500 m. Las celdas sobre carreteras conocidas deben dar 0.
- [ ] **Step 6:** `git commit -m "feat(pipeline): distancia a accesos OSM"`

---

### Tarea 8: Idoneidad por especie

**Files:**
- Create: `pipeline/especies.yaml`, `pipeline/setas_pipeline/idoneidad.py`
- Test: `pipeline/tests/test_idoneidad.py`

**Interfaces:**
- Consumes: `ARBOL`, `SUELO`, `NODATA_F`, rasters de las tareas 4–6.
- Produces: `cargar_perfiles(ruta) -> dict[str, dict]`; `puntuar(perfil, arbol, altitud, orientacion, pendiente, suelo) -> np.ndarray[uint8]` (0–100, pura, vectorizada); `construir_idoneidad(out_dir, perfiles)` → `idoneidad_<especie>.tif`.

- [ ] **Step 1: Perfiles (heurísticos, se marcan así en el YAML)**

```yaml
# HEURÍSTICO v1 — valores de partida de literatura micológica divulgativa;
# se recalibran con GBIF (Tarea 9) y hallazgos propios. No son ciencia exacta.
boletus_aereus:
  nombre: Boletus aereus
  arboles: {alcornoque: 1.0, castano: 0.9, encina: 0.8, quejigo: 0.7}
  altitud: {min: 150, opt_min: 400, opt_max: 900, max: 1200}
  orientacion: indiferente
  suelo: {acido: 1.0, otro: 0.5, basico: 0.4, ultrabasico: 0.3, desconocido: 0.6}
boletus_aestivalis:
  nombre: Boletus aestivalis / reticulatus
  arboles: {castano: 1.0, quejigo: 0.9, alcornoque: 0.7, encina: 0.7}
  altitud: {min: 300, opt_min: 500, opt_max: 1100, max: 1400}
  orientacion: indiferente
  suelo: {acido: 1.0, otro: 0.6, basico: 0.6, ultrabasico: 0.3, desconocido: 0.6}
boletus_edulis:
  nombre: Boletus edulis
  arboles: {castano: 1.0, pino: 0.7, pinsapo: 0.6, quejigo: 0.5}
  altitud: {min: 600, opt_min: 900, opt_max: 1500, max: 1900}
  orientacion: umbria
  suelo: {acido: 1.0, otro: 0.6, basico: 0.5, ultrabasico: 0.4, desconocido: 0.6}
boletus_pinophilus:
  nombre: Boletus pinophilus
  arboles: {pino: 1.0, castano: 0.5}
  altitud: {min: 700, opt_min: 1000, opt_max: 1600, max: 2000}
  orientacion: umbria
  suelo: {acido: 1.0, otro: 0.6, basico: 0.4, ultrabasico: 0.4, desconocido: 0.6}
amanita_caesarea:
  nombre: Amanita caesarea
  arboles: {alcornoque: 1.0, castano: 1.0, encina: 0.8, quejigo: 0.7}
  altitud: {min: 100, opt_min: 300, opt_max: 900, max: 1200}
  orientacion: solana
  suelo: {acido: 1.0, otro: 0.5, basico: 0.3, ultrabasico: 0.3, desconocido: 0.6}
```

- [ ] **Step 2: Tests**

```python
import numpy as np
from setas_pipeline.malla import ARBOL, SUELO, NODATA_F
from setas_pipeline.idoneidad import puntuar

P = {"arboles": {"castano": 1.0, "encina": 0.5},
     "altitud": {"min": 200, "opt_min": 400, "opt_max": 800, "max": 1000},
     "orientacion": "umbria",
     "suelo": {"acido": 1.0, "basico": 0.5}}

def _p(arbol, alt, ori, pend=10.0, suelo=SUELO["acido"]):
    a = lambda v, t: np.array([[v]], dtype=t)
    return int(puntuar(P, a(arbol, "uint8"), a(alt, "float32"), a(ori, "float32"),
                       a(pend, "float32"), a(suelo, "uint8"))[0, 0])

def test_sin_arbol_hospedador_es_cero():
    assert _p(ARBOL["pino"], 600, 0) == 0

def test_optimo_completo_es_100():
    assert _p(ARBOL["castano"], 600, 0) == 100

def test_fuera_de_altitud_es_cero():
    assert _p(ARBOL["castano"], 1200, 0) == 0

def test_rampa_de_altitud():
    assert _p(ARBOL["castano"], 300, 0) == 50

def test_umbria_penaliza_solana():
    assert _p(ARBOL["castano"], 600, 180) == 70

def test_llano_es_neutro():
    assert _p(ARBOL["castano"], 600, -1) == 90

def test_pendiente_extrema_penaliza():
    assert _p(ARBOL["castano"], 600, 0, pend=40) == 50

def test_suelo_y_arbol_se_multiplican():
    assert _p(ARBOL["encina"], 600, 0, suelo=SUELO["basico"]) == 25

def test_nodata_es_cero():
    assert _p(ARBOL["castano"], NODATA_F, 0) == 0
```

- [ ] **Step 3:** FAIL.
- [ ] **Step 4: Implementación**

```python
"""Idoneidad 0–100 por especie: árbol × altitud × orientación × pendiente × suelo."""
from __future__ import annotations
from pathlib import Path
import numpy as np, yaml
from .malla import ARBOL, SUELO, NODATA_F, Malla, leer_tif, escribir_tif

LLANO = 0.9
PENDIENTE_MAX = 35.0
FACTOR_PENDIENTE = 0.5


def cargar_perfiles(ruta: Path) -> dict:
    return yaml.safe_load(Path(ruta).read_text())


def _tabla(pesos: dict, codigos: dict, defecto=0.0) -> np.ndarray:
    t = np.full(max(codigos.values()) + 1, defecto, "float32")
    for k, v in pesos.items():
        t[codigos[k]] = v
    return t


def _f_altitud(alt, a):
    f = np.zeros_like(alt, dtype="float32")
    sube = (alt >= a["min"]) & (alt < a["opt_min"])
    f[sube] = (alt[sube] - a["min"]) / (a["opt_min"] - a["min"])
    f[(alt >= a["opt_min"]) & (alt <= a["opt_max"])] = 1.0
    baja = (alt > a["opt_max"]) & (alt <= a["max"])
    f[baja] = (a["max"] - alt[baja]) / (a["max"] - a["opt_max"])
    return f


def _f_orientacion(ori, modo):
    if modo == "indiferente":
        f = np.ones_like(ori, dtype="float32")
    else:
        # cos=1 mirando al norte y -1 al sur → umbría: 0.7..1.0 ; solana: al revés
        c = np.cos(np.radians(ori))
        f = (0.85 + 0.15 * c) if modo == "umbria" else (0.85 - 0.15 * c)
        f = f.astype("float32")
    return np.where(ori < 0, LLANO if modo != "indiferente" else 1.0, f)


def puntuar(perfil, arbol, altitud, orientacion, pendiente, suelo) -> np.ndarray:
    f_arbol = _tabla(perfil["arboles"], ARBOL)[np.minimum(arbol, max(ARBOL.values()))]
    f_suelo = _tabla(perfil["suelo"], SUELO, defecto=0.6)[np.minimum(suelo, max(SUELO.values()))]
    f_alt = _f_altitud(altitud, perfil["altitud"])
    f_ori = _f_orientacion(orientacion, perfil["orientacion"])
    f_pend = np.where(pendiente > PENDIENTE_MAX, FACTOR_PENDIENTE, 1.0)
    s = f_arbol * f_suelo * f_alt * f_ori * f_pend
    s = np.where((altitud == NODATA_F) | (arbol == 255), 0, s)
    return np.rint(np.clip(s, 0, 1) * 100).astype("uint8")


def construir_idoneidad(out_dir: Path, perfiles: dict):
    malla = Malla.cargar(out_dir / "malla.json")
    capas = {n: leer_tif(out_dir / f"{n}.tif")
             for n in ["arbol", "altitud", "orientacion", "pendiente", "suelo"]}
    for clave, perfil in perfiles.items():
        s = puntuar(perfil, capas["arbol"], capas["altitud"], capas["orientacion"],
                    capas["pendiente"], capas["suelo"])
        escribir_tif(malla, out_dir / f"idoneidad_{clave}.tif", s, 0)
```

Cálculo esperado de los tests: umbría a 180° → 0.85 - 0.15 = 0.70 → 70 ✓. Rampa a 300 m → (300-200)/(400-200) = 0.5 ✓. Encina 0.5 × básico 0.5 = 0.25 → 25 ✓.

- [ ] **Step 5:** PASS (los 9 tests).
- [ ] **Step 6:** `git commit -m "feat(pipeline): idoneidad por especie (perfiles heurísticos)"`

---

### Tarea 9: Calibración con GBIF

**Files:**
- Create: `pipeline/setas_pipeline/calibracion.py`
- Test: `pipeline/tests/test_calibracion.py`

**Interfaces:**
- Consumes: `Malla`, `leer_tif`, `idoneidad_<especie>.tif`, `zona.geojson`.
- Produces: `descargar_ocurrencias(nombre_cientifico, wkt_zona) -> list[(lon, lat, incertidumbre_m)]` (API GBIF: `/species/match` y luego `/occurrence/search` paginando de 300 en 300 con `hasCoordinate=true`); `valores_en_puntos(malla, raster, xy_utm) -> np.ndarray` (pura); `resumen(valores_obs, raster) -> dict` (pura: n, mediana en observaciones, % de observaciones con puntuación ≥50, % de la zona con ≥50 y **lift** = %obs≥50 / %zona≥50); `informe(out_dir, perfiles) -> Path` → `data/out/calibracion.md`.

- [ ] **Step 1: Test de las partes puras**

```python
import numpy as np
from setas_pipeline.malla import Malla
from setas_pipeline.calibracion import valores_en_puntos, resumen

def test_valores_en_puntos_y_lift():
    m = Malla.desde_bounds(0, 0, 1000, 1000)
    r = np.zeros((10, 10), "uint8"); r[:, :2] = 80        # el 20 % de la zona es bueno
    v = valores_en_puntos(m, r, [(50, 950), (150, 50), (950, 950)])
    assert list(v) == [80, 80, 0]
    s = resumen(v, r)
    assert s["n"] == 3 and abs(s["pct_obs_buenas"] - 66.7) < 0.1
    assert abs(s["lift"] - 66.7 / 20) < 0.01
```

- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implementación**

```python
"""Calibración: ¿caen las observaciones reales de GBIF en celdas de alta idoneidad?"""
from __future__ import annotations
from pathlib import Path
import numpy as np, requests
from pyproj import Transformer
from .malla import Malla, CRS, leer_tif

GBIF = "https://api.gbif.org/v1"
UMBRAL = 50
_a_utm = Transformer.from_crs("EPSG:4326", CRS, always_xy=True)


def descargar_ocurrencias(nombre: str, wkt_zona: str, max_registros=5000):
    clave = requests.get(f"{GBIF}/species/match", params={"name": nombre}, timeout=30).json()["usageKey"]
    out, offset = [], 0
    while offset < max_registros:
        j = requests.get(f"{GBIF}/occurrence/search", timeout=60, params={
            "taxonKey": clave, "geometry": wkt_zona, "hasCoordinate": "true",
            "hasGeospatialIssue": "false", "limit": 300, "offset": offset}).json()
        out += [(r["decimalLongitude"], r["decimalLatitude"], r.get("coordinateUncertaintyInMeters"))
                for r in j["results"]]
        if j.get("endOfRecords", True):
            break
        offset += 300
    return out


def valores_en_puntos(malla: Malla, raster: np.ndarray, xy_utm) -> np.ndarray:
    xs = np.array([p[0] for p in xy_utm]); ys = np.array([p[1] for p in xy_utm])
    cols = ((xs - malla.x0) // malla.celda).astype(int)
    filas = ((malla.y1 - ys) // malla.celda).astype(int)
    dentro = (cols >= 0) & (cols < malla.ancho) & (filas >= 0) & (filas < malla.alto)
    return raster[filas[dentro], cols[dentro]]


def resumen(valores: np.ndarray, raster: np.ndarray) -> dict:
    pct_obs = round(100 * float(np.mean(valores >= UMBRAL)), 1) if len(valores) else 0.0
    pct_zona = 100 * float(np.mean(raster >= UMBRAL))
    return {"n": int(len(valores)),
            "mediana_obs": float(np.median(valores)) if len(valores) else None,
            "pct_obs_buenas": pct_obs, "pct_zona_buena": round(pct_zona, 1),
            "lift": round(pct_obs / pct_zona, 2) if pct_zona else None}
```

`informe()` escribe una tabla Markdown por especie (n, mediana, % de observaciones buenas, % de zona buena, lift) y la advertencia de que las coordenadas de GBIF pueden venir difuminadas: se descartan los registros con `coordinateUncertaintyInMeters` mayor de 1000 y se indica cuántos se descartaron. El polígono de la zona se simplifica (`simplify(2000)`) antes de pasarlo a WKT en EPSG:4326 para que la URL no exceda el límite.

- [ ] **Step 4:** PASS.
- [ ] **Step 5:** `git commit -m "feat(pipeline): calibración con GBIF"`

---

### Tarea 10: Orquestador, vista previa y cierre de fase

**Files:**
- Create: `pipeline/setas_pipeline/ejecutar.py`, `pipeline/setas_pipeline/vista_previa.py`

- [ ] **Step 1: `ejecutar.py`** con argparse y los pasos `zona | relieve | vegetacion | suelo | protegidos | accesos | idoneidad | calibracion | vista | todo`. Cada paso se salta si su salida ya existe, salvo que se use `--forzar`. Rutas: `data/raw`, `data/out`, `fuentes.yaml`, `especies.yaml`.

- [ ] **Step 2: `vista_previa.py`**: un PNG por especie (`data/out/vista_<especie>.png`) con matplotlib que muestra la idoneidad (colormap secuencial, 0 transparente), el contorno de la zona, la posición de Marbella y las observaciones de GBIF superpuestas como puntos.

- [ ] **Step 3: Ejecución completa**

Run: `cd pipeline && uv run python -m setas_pipeline.ejecutar todo`
Expected: todos los `.tif`, `calibracion.md` y los `vista_*.png` en `data/out/`.

- [ ] **Step 4: Tests completos:** `uv run pytest -v` → todos PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(pipeline): orquestador y vistas previas; cierre fase 1"
```

- [ ] **Step 6: Puertas de revisión de la fase**
  - `code-review` nivel high sobre la rama, y aplicar los hallazgos confirmados.
  - Revisión en el hilo principal: abrir las `vista_*.png` (un subagente las describe; no se vuelcan al hilo) y `calibracion.md`. Criterio orientativo: **lift ≥ 1.5** en boletus y caesarea. Si no se alcanza, ajustar `especies.yaml` y volver a ejecutar `idoneidad calibracion vista`.
  - Enseñar a Alexander las vistas de boletus y caesarea y el informe antes de pasar a la Fase 2.
