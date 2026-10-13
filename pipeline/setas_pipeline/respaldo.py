"""Fase 7: respaldo de las capas de idoneidad para OsmAnd y Locus Map.

    uv run python -m setas_pipeline.exportar respaldo
    uv run python -m setas_pipeline.respaldo

Salida en data/out/respaldo/ (no se versiona):
- setas_<especie>_<umbral>m.sqlitedb  → OsmAnd (formato SQLiteDB documentado por OsmAnd, numeración BigPlanet)
- setas_<especie>_<umbral>m.mbtiles   → Locus Map (MBTiles 1.3, PNG, esquema TMS)
- setas_<especie>_zonas_buenas.geojson / .kml  → zonas con puntuación ≥ 60 tras el filtro de 400 m
- README_respaldo.md

Convenciones verificadas (2026-10-13):
- OsmAnd SQLiteDB (https://osmand.net/docs/technical/osmand-file-formats/osmand-sqlite):
  tabla `tiles(x, y, z, s, image, time)` y tabla `info` con minzoom, maxzoom, tilenumbering,
  inverted_y, ellipsoid, timecolumn, tilesize… Con tilenumbering='BigPlanet' el zoom se guarda
  invertido: z = 17 - zoom (también minzoom/maxzoom). `y` va en convención XYZ (origen arriba) salvo
  inverted_y=1. Es el mismo esquema que RMaps/BigPlanet, que también lee Locus.
- MBTiles 1.3 (https://github.com/mapbox/mbtiles-spec/blob/master/1.3/spec.md): tabla
  `tiles(zoom_level, tile_column, tile_row, tile_data)` con tile_row en esquema TMS
  (fila = 2^z - 1 - y) y tabla `metadata(name, value)`.
"""
from __future__ import annotations
import json, sqlite3, sys
from pathlib import Path
from xml.sax.saxutils import escape
import numpy as np
from pyproj import Transformer

from . import exportar as ex
from .malla import Malla, leer_tif

SALIDA = ex.OUT / "respaldo"
UMBRALES_RESPALDO = (0, 400)
ZOOM_RESPALDO = (8, 14)
UMBRAL_ZONAS_M = 400        # filtro de distancia al acceso para las zonas buenas
PUNTUACION_MIN = 60         # idoneidad mínima de una zona buena
AREA_MIN_HA = 1.0           # se descartan polígonos más pequeños
SIMPLIFICAR_M = 20          # tolerancia de simplificación
BIGPLANET_BASE = 17
ATRIBUCION = "IGN CC BY 4.0 · © MITECO MFE · IGME · REDIAM CC BY 4.0 · © OpenStreetMap ODbL"
SEGURIDAD = "No consumas ninguna seta sin la confirmación de un experto."


# ---------------------------------------------------------------- escritores de teselas

class SqliteDB:
    """Escritor SQLiteDB de OsmAnd (numeración BigPlanet: z = 17 - zoom; y XYZ, sin invertir)."""

    def __init__(self, ruta: Path):
        ruta = Path(ruta)
        ruta.unlink(missing_ok=True)
        self.db = sqlite3.connect(ruta)
        self.db.executescript("""
            CREATE TABLE tiles (x INTEGER, y INTEGER, z INTEGER, s INTEGER, image BLOB, time INTEGER,
                                PRIMARY KEY (x, y, z, s));
            CREATE INDEX IND ON tiles (x, y, z, s);
            CREATE TABLE info (minzoom INTEGER, maxzoom INTEGER, url TEXT, tilenumbering TEXT,
                               timecolumn TEXT, expireminutes INTEGER, ellipsoid INTEGER,
                               inverted_y INTEGER, tilesize INTEGER);
            CREATE TABLE android_metadata (locale TEXT);
            INSERT INTO android_metadata VALUES ('es_ES');
        """)
        self.zooms: set[int] = set()

    @staticmethod
    def z_bigplanet(zoom: int) -> int:
        return BIGPLANET_BASE - zoom

    def poner(self, zoom: int, x: int, y: int, datos: bytes):
        self.db.execute("INSERT INTO tiles (x, y, z, s, image, time) VALUES (?, ?, ?, 0, ?, 0)",
                        (x, y, self.z_bigplanet(zoom), sqlite3.Binary(datos)))
        self.zooms.add(zoom)

    def cerrar(self):
        zmin, zmax = (min(self.zooms), max(self.zooms)) if self.zooms else ZOOM_RESPALDO
        # En BigPlanet minzoom/maxzoom también van invertidos (como los escribe MOBAC/RMaps).
        self.db.execute("INSERT INTO info VALUES (?, ?, '', 'BigPlanet', 'no', 0, 0, 0, 256)",
                        (self.z_bigplanet(zmax), self.z_bigplanet(zmin)))
        self.db.commit()
        self.db.close()


class MBTiles:
    """Escritor MBTiles 1.3 (PNG, filas en esquema TMS)."""

    def __init__(self, ruta: Path, nombre: str, descripcion: str):
        ruta = Path(ruta)
        ruta.unlink(missing_ok=True)
        self.db = sqlite3.connect(ruta)
        self.db.executescript("""
            CREATE TABLE metadata (name TEXT, value TEXT);
            CREATE TABLE tiles (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB);
            CREATE UNIQUE INDEX tile_index ON tiles (zoom_level, tile_column, tile_row);
        """)
        self.nombre, self.descripcion = nombre, descripcion
        self.zooms: set[int] = set()

    @staticmethod
    def fila_tms(zoom: int, y: int) -> int:
        return (1 << zoom) - 1 - y

    def poner(self, zoom: int, x: int, y: int, datos: bytes):
        self.db.execute("INSERT INTO tiles VALUES (?, ?, ?, ?)",
                        (zoom, x, self.fila_tms(zoom, y), sqlite3.Binary(datos)))
        self.zooms.add(zoom)

    def cerrar(self, bbox):
        zmin, zmax = (min(self.zooms), max(self.zooms)) if self.zooms else ZOOM_RESPALDO
        meta = {
            "name": self.nombre, "format": "png", "type": "overlay", "version": "1.0",
            "description": self.descripcion, "attribution": ATRIBUCION,
            "bounds": ",".join(f"{v:.5f}" for v in bbox),
            "center": f"{(bbox[0] + bbox[2]) / 2:.5f},{(bbox[1] + bbox[3]) / 2:.5f},{zmin + 2}",
            "minzoom": str(zmin), "maxzoom": str(zmax),
        }
        self.db.executemany("INSERT INTO metadata VALUES (?, ?)", meta.items())
        self.db.commit()
        self.db.close()


# ---------------------------------------------------------------- rasters

def nombre_base(especie: str, umbral: int) -> str:
    return f"setas_{especie}_{umbral}m"


def exportar_rasters_respaldo(malla: Malla, out: Path = SALIDA, zooms=ZOOM_RESPALDO,
                              umbrales=UMBRALES_RESPALDO) -> list[Path]:
    from shapely import prepared
    from shapely.geometry import box
    out.mkdir(parents=True, exist_ok=True)
    bbox, zona = ex._bbox_zona()
    zona_p = prepared.prep(zona)
    tr = Transformer.from_crs("EPSG:4326", "EPSG:25830", always_xy=True)
    dist = leer_tif(ex.OUT / "distancia_acceso.tif")
    capas, salidas = {}, {}
    for e in ex.especies():
        idon = leer_tif(ex.OUT / f"idoneidad_{e['id']}.tif")
        for u in umbrales:
            k = nombre_base(e["id"], u)
            capas[k] = ex.aplicar_umbral(idon, dist, u)
            desc = f"Idoneidad 0–100 (heurística) de {e['nombre']}, a ≥{u} m de accesos. {SEGURIDAD}"
            salidas[k] = (SqliteDB(out / f"{k}.sqlitedb"), MBTiles(out / f"{k}.mbtiles", k, desc))
    for z in range(zooms[0], zooms[1] + 1):
        n = 0
        for _, x, y in ex.teselas_bbox(bbox, z):
            lo = ex.pixeles_tesela(z, x, y)
            if not zona_p.intersects(box(lo[0][0, 0], lo[1][-1, 0], lo[0][0, -1], lo[1][0, 0])):
                continue
            fila, col, ok = ex._indices(malla, *lo, tr)
            for k, a in capas.items():
                v = np.where(ok, a[fila, col], 0)
                if v.any():
                    png = ex.png_idoneidad(v)
                    for s in salidas[k]:
                        s.poner(z, x, y, png)
            n += 1
        print(f"  respaldo z{z}: {n} teselas", flush=True)
    rutas = []
    for k, (sq, mb) in salidas.items():
        sq.cerrar()
        mb.cerrar(bbox)
        rutas += [out / f"{k}.sqlitedb", out / f"{k}.mbtiles"]
    return rutas


# ---------------------------------------------------------------- zonas buenas (vector)

def zonas_buenas(idon: np.ndarray, dist: np.ndarray, transform, celda: float,
                 umbral_m: float = UMBRAL_ZONAS_M, minimo: int = PUNTUACION_MIN,
                 area_min_ha: float = AREA_MIN_HA, tolerancia: float = SIMPLIFICAR_M) -> list[dict]:
    """Polígonos (CRS de la malla) de celdas con idoneidad ≥ `minimo` a ≥ `umbral_m` del acceso.
    Las celdas contiguas (4-vecindad) se disuelven en una zona; se descartan las de < `area_min_ha`
    y se simplifican a `tolerancia` m. Devuelve [{geometry, puntuacion_media, area_ha}]."""
    from rasterio.features import shapes
    from scipy import ndimage
    from shapely.geometry import shape
    v = ex.aplicar_umbral(idon, dist, umbral_m)
    mask = v >= minimo
    etiquetas, n = ndimage.label(mask)
    if n == 0:
        return []
    idx = np.arange(1, n + 1)
    celdas = ndimage.sum(mask, etiquetas, idx)
    medias = ndimage.mean(v.astype(np.float64), etiquetas, idx)
    area_celda_ha = celda * celda / 1e4
    res = []
    for geom, val in shapes(etiquetas.astype(np.int32), mask=mask, transform=transform, connectivity=4):
        i = int(val) - 1
        area_ha = float(celdas[i]) * area_celda_ha
        if area_ha < area_min_ha - 1e-9:
            continue
        g = shape(geom).simplify(tolerancia, preserve_topology=True)
        res.append({"geometry": g, "puntuacion_media": round(float(medias[i]), 1),
                    "area_ha": round(area_ha, 1)})
    res.sort(key=lambda r: -r["area_ha"])
    return res


def _a_wgs84(zonas: list[dict], crs: str = "EPSG:25830") -> list[dict]:
    import shapely
    tr = Transformer.from_crs(crs, "EPSG:4326", always_xy=True)
    return [{**z, "geometry": shapely.transform(z["geometry"], lambda x, y: tr.transform(x, y), interleaved=False)}
            for z in zonas]


def geojson_zonas(zonas_wgs: list[dict], especie: str, nombre: str) -> dict:
    from shapely.geometry import mapping
    def redondear(c):
        return [redondear(x) for x in c] if isinstance(c[0], (list, tuple)) else [round(c[0], 6), round(c[1], 6)]
    feats = []
    for z in zonas_wgs:
        m = mapping(z["geometry"])
        feats.append({"type": "Feature",
                      "properties": {"especie": especie, "nombre": nombre,
                                     "puntuacion_media": z["puntuacion_media"], "area_ha": z["area_ha"]},
                      "geometry": {"type": m["type"], "coordinates": redondear(m["coordinates"])}})
    return {"type": "FeatureCollection", "name": f"setas_{especie}_zonas_buenas",
            "attribution": ATRIBUCION, "aviso": SEGURIDAD, "features": feats}


def _anillo_kml(coords) -> str:
    return " ".join(f"{x:.6f},{y:.6f}" for x, y in coords)


def _poligono_kml(p) -> str:
    s = (f"<Polygon><outerBoundaryIs><LinearRing><coordinates>{_anillo_kml(p.exterior.coords)}"
         f"</coordinates></LinearRing></outerBoundaryIs>")
    for h in p.interiors:
        s += (f"<innerBoundaryIs><LinearRing><coordinates>{_anillo_kml(h.coords)}"
              f"</coordinates></LinearRing></innerBoundaryIs>")
    return s + "</Polygon>"


def kml_zonas(zonas_wgs: list[dict], especie: str, nombre: str) -> str:
    """KML 2.2 con estilo verde (relleno ~50 % opaco; colores KML en aabbggrr)."""
    marcas = []
    for i, z in enumerate(zonas_wgs, 1):
        g = z["geometry"]
        polys = list(g.geoms) if g.geom_type == "MultiPolygon" else [g]
        geom = (_poligono_kml(polys[0]) if len(polys) == 1
                else "<MultiGeometry>" + "".join(_poligono_kml(p) for p in polys) + "</MultiGeometry>")
        marcas.append(
            f"<Placemark><name>{escape(nombre)} {i} · {z['puntuacion_media']:.0f}/100</name>"
            f"<description>{escape(f'Puntuación media {z['puntuacion_media']}, {z['area_ha']} ha. {SEGURIDAD}')}</description>"
            f"<styleUrl>#zona_buena</styleUrl><ExtendedData>"
            f"<Data name=\"especie\"><value>{especie}</value></Data>"
            f"<Data name=\"puntuacion_media\"><value>{z['puntuacion_media']}</value></Data>"
            f"<Data name=\"area_ha\"><value>{z['area_ha']}</value></Data>"
            f"</ExtendedData>{geom}</Placemark>")
    return ("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
            "<kml xmlns=\"http://www.opengis.net/kml/2.2\"><Document>"
            f"<name>Zonas buenas · {escape(nombre)}</name>"
            f"<description>{escape(f'Idoneidad ≥ {PUNTUACION_MIN}, a ≥ {UMBRAL_ZONAS_M} m de accesos. Heurística. {SEGURIDAD} Datos: {ATRIBUCION}')}</description>"
            "<Style id=\"zona_buena\"><LineStyle><color>ff438423</color><width>2</width></LineStyle>"
            "<PolyStyle><color>805dab41</color><fill>1</fill><outline>1</outline></PolyStyle></Style>"
            + "".join(marcas) + "</Document></kml>\n")


def exportar_zonas(malla: Malla, out: Path = SALIDA) -> list[Path]:
    out.mkdir(parents=True, exist_ok=True)
    dist = leer_tif(ex.OUT / "distancia_acceso.tif")
    rutas = []
    for e in ex.especies():
        idon = leer_tif(ex.OUT / f"idoneidad_{e['id']}.tif")
        zw = _a_wgs84(zonas_buenas(idon, dist, malla.transform, malla.celda))
        gj = out / f"setas_{e['id']}_zonas_buenas.geojson"
        gj.write_text(json.dumps(geojson_zonas(zw, e["id"], e["nombre"]), ensure_ascii=False))
        km = out / f"setas_{e['id']}_zonas_buenas.kml"
        km.write_text(kml_zonas(zw, e["id"], e["nombre"]))
        print(f"  zonas {e['id']}: {len(zw)} polígonos, {sum(z['area_ha'] for z in zw):.0f} ha", flush=True)
        rutas += [gj, km]
    return rutas


# ---------------------------------------------------------------- README

def _tamano(p: Path) -> str:
    b = p.stat().st_size
    return f"{b / 1e6:.1f} MB" if b >= 1e5 else f"{b / 1e3:.0f} kB"


def escribir_readme(out: Path = SALIDA) -> Path:
    filas = "\n".join(f"| `{p.name}` | {_tamano(p)} |" for p in sorted(out.iterdir())
                      if p.suffix in (".sqlitedb", ".mbtiles", ".geojson", ".kml"))
    especies = "\n".join(f"- `{e['id']}`: {e['nombre']}" for e in ex.especies())
    texto = f"""# Respaldo del mapa de setas para OsmAnd y Locus Map

**{SEGURIDAD}**

El mapa es una estimación heurística de dónde es más probable encontrar cada especie. No garantiza que haya setas ni dice nada sobre si una seta concreta es comestible.

## Qué hay en esta carpeta

Para cada especie hay tres tipos de archivo.

- `setas_<especie>_0m.*` muestra toda la idoneidad. `setas_<especie>_400m.*` oculta lo que queda a menos de 400 m de una carretera o pista, igual que el filtro de distancia de la app.
- `.sqlitedb` es la capa de teselas para OsmAnd. Usa el formato SQLiteDB de OsmAnd con numeración BigPlanet.
- `.mbtiles` es la misma capa para Locus Map.
- `setas_<especie>_zonas_buenas.geojson` y `.kml` contienen los polígonos de las zonas con puntuación de 60 o más, a 400 m o más de un acceso. Las zonas de menos de 1 ha se han quitado y los bordes están simplificados a unos 20 m. Cada polígono lleva `especie`, `puntuacion_media` y `area_ha`.

Las capas raster cubren los zooms 8 a 14 y usan los mismos colores que la app. El 0 es transparente y el verde se oscurece a medida que sube la puntuación.

Especies:
{especies}

| Archivo | Tamaño |
|---|---|
{filas}

## OsmAnd (Android e iOS)

Documentación: <https://docs.osmand.net/docs/user/map/raster-maps> y <https://docs.osmand.net/docs/user/personal/import-export>.

**Capa de idoneidad (`.sqlitedb`)**

1. Copia el `.sqlitedb` al teléfono y ábrelo con OsmAnd. Puedes tocarlo en el gestor de archivos o usar Menú → Ajustes → Importar/exportar → Importar en Android. OsmAnd lo admite como teselas de mapa en línea (`.sqlitedb`).
2. En Android, ve a Menú → Configurar mapa → «Mapa superpuesto…» (*Overlay map…*) y elige la capa en «Fuente del mapa superpuesto».
3. En iOS, ve a Menú → Configurar mapa → Superposición / Subyacente → Superposición. Si no aparece la capa, usa «Importar desde documentos» (*Import from documents*) y elígela en «Capas disponibles».
4. Ajusta la transparencia con «Transparencia de la superposición». Si activas «Mostrar control deslizante», tendrás el control a mano sobre el mapa.

**Zonas buenas (`.kml`)**

- En Android, ve a Menú → Ajustes → Importar/exportar → Importar. En iOS, abre el archivo desde la app Archivos con OsmAnd.
- OsmAnd convierte los KML a GPX al importarlos. Las zonas se ven como contornos de traza, sin relleno. OsmAnd no importa GeoJSON.

## Locus Map

Documentación: <https://docs.locusmap.app/doku.php/manual:user_guide:maps_external>, <https://docs.locusmap.app/doku.php/manual:user_guide:maps_tools:overlays> y <https://docs.locusmap.app/doku.php/manual:user_guide:tracks:import>.

**Capa de idoneidad (`.mbtiles`)**

1. Abre el Gestor de mapas, toca **+** y luego «Importar mapa». Elige el `.mbtiles`. También puedes mantener pulsado el archivo en el gestor de archivos y elegir «Abrir con» → Locus Map.
2. Si son varios archivos, puedes copiarlos a `/Android/Media/menion.android.locus/Maps` y reiniciar Locus.
3. Para verla encima del mapa base, abre el panel de contenido, toca «Superposiciones de mapa» (*Map overlays*), elige la capa en el Gestor de mapas y ajusta la transparencia. Las superposiciones requieren Locus Premium. Sin Premium, la capa se puede abrir como mapa independiente.

**Zonas buenas (`.kml` o `.geojson`)**

- Ve a Mi biblioteca → **+** → Importar y elige el archivo. Locus importa KML, KMZ, GPX y GeoJSON. Si solo quieres mirarlas sin guardarlas en la biblioteca, marca «Solo mostrar (no guardar)».

## Atribución de los datos

- Modelo digital del terreno: IGN, CC BY 4.0
- Mapa Forestal de España: © MITECO (MFE)
- Litología: IGME
- Espacios protegidos: REDIAM (Junta de Andalucía), CC BY 4.0
- Red de caminos y carreteras: © OpenStreetMap contributors, ODbL

**{SEGURIDAD}**
"""
    ruta = out / "README_respaldo.md"
    ruta.write_text(texto)
    return ruta


def exportar_respaldo(malla: Malla | None = None, out: Path = SALIDA) -> list[Path]:
    malla = malla or Malla.cargar(ex.OUT / "malla.json")
    rutas = exportar_rasters_respaldo(malla, out)
    rutas += exportar_zonas(malla, out)
    rutas.append(escribir_readme(out))
    return rutas


if __name__ == "__main__":
    for p in exportar_respaldo():
        print(p.name, _tamano(p))
    sys.exit(0)
