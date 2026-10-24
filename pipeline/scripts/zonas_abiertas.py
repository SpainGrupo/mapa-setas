"""Zonas de setas documentadas en fuentes abiertas (2026-10-25): cruce con el modelo y GPX para «Mis sitios».

Uso (desde pipeline/):  uv run python scripts/zonas_abiertas.py
Salidas: ../docs/zonas-setas-documentadas.gpx y ../docs/investigacion/2026-10-25-zonas-setas-abiertas.tabla.json
Los datos de ZONAS son a mano (nombre, lat/lon, especies citadas, fuente); coordenadas de Nominatim (consulta
puntual, 1 por 1,5 s) o de la propia fuente; ver el informe docs/investigacion/2026-10-25-zonas-setas-abiertas.md.
"""
from __future__ import annotations

import json
import math
import uuid
from pathlib import Path
from xml.sax.saxutils import escape

import numpy as np
import rasterio
from pyproj import Transformer
from shapely.geometry import Point, shape

RAIZ = Path(__file__).resolve().parents[2]
DATOS = RAIZ / "pipeline" / "data"
UMBRAL = 60  # sitios.py UMBRAL: idoneidad mínima de una celda de mancha

# Fuentes (clave -> texto, licencia/condiciones, URL)
FUENTES = {
    "JA-CUSSTA": ("Información obtenida del Portal de la Junta de Andalucía (Plan CUSSTA, «Rutas micológicas por Andalucía», PDF de la ruta, sin alterar el sentido)",
                  "Textos con licencia tipo CC BY 3.0: citar «Información obtenida del Portal de la Junta de Andalucía», no alterar el sentido (aviso legal). robots.txt sin bloqueo de /medioambiente",
                  "https://www.juntadeandalucia.es/medioambiente/portal/landing-page-documento/-/asset_publisher/jXKpcWryrKar/content/rutas-micol-c3-b3gicas/20151"),
    "OSM": ("OpenStreetMap (Overpass API)", "ODbL 1.0 (atribución «© colaboradores de OpenStreetMap»)", "https://www.openstreetmap.org/way/639947092"),
    "MITECO-MONDA": ("MITECO-CENEAM, ficha de las Jornadas Micológicas de Monda", "Web institucional; solo se toman hechos (lugar y fecha)",
                     "https://www.miteco.gob.es/es/ceneam/formacion-ambiental/congresos/-xv-jornadas-micologicas-de-monda.html"),
    "SINATUR-MONDA": ("Sinatur, programa de las V Jornadas Micológicas de Monda", "robots.txt solo cierra /wp-admin/; solo se toma el nombre del paraje",
                      "https://sinatur.es/v-jornadas-micologicas-montes-de-monda/"),
    "CORTES": ("Ayuntamiento de Cortes de la Frontera, programa de las XVIII Jornadas Micológicas (2019)", "Web municipal; solo hechos (salida por los montes de propios)",
               "https://www.cortesdelafrontera.es/8233/com1_md3_cd-54160/xviii-jornadas-micologicas"),
    "SGHN": ("Becerra, Robles y Gaona (2015), Rev. Soc. Gad. Hist. Nat. 9: 19-20 (Cantharellus ferruginascens, Garganta del Candelar)", "Publicación científica; solo localidad y especie (cita bibliográfica)",
             "http://sociedadgaditanahistorianatural.com/wp-content/uploads/2015/03/04_Becerra-et-al_Cantharellus_RSGHN9_web.pdf"),
    "DEBATE": ("El Debate, 25/10/2025, «cómo coger setas en Málaga»", "robots.txt sin bloqueo para rastreadores genéricos; solo se toma el nombre del paraje y las especies",
               "https://www.eldebate.com/espana/andalucia/malaga/20251025/como-coger-setas-malaga-este-otono-menos-media-hora-ciudad_347988.html"),
    "SALIR": ("salir.com, «Sitios para recoger setas en Alicante»", "robots.txt sin bloqueo total; solo nombres de parajes y especies",
              "https://www.salir.com/sitios-para-recoger-setas-en-alicante-401.html"),
    "ESPANOL": ("El Español (Alicante), 21/10/2023, mejores lugares para recoger setas", "robots.txt sin bloqueo total; solo nombres y especies",
                "https://elespanol.com/alicante/vivir/gastronomia/20231021/bosques-sierras-campos-mejores-lugares-recoger-setas-alicante/803420008_0.html"),
    "DDA": ("Diario de Alicante, guía de setas (octubre 2025 / octubre 2026)", "robots.txt con 3 reglas, sin bloqueo del contenido; solo nombres y especies",
            "https://diariodealicante.net/donde-buscar-setas-alicante/"),
    "MANCOM": ("Mancomunitat de l'Alcoià i el Comtat, programa «Rutes guiades 20Mils»", "robots.txt sin bloqueo; solo el hecho (ruta micològica en Banyeres de Mariola)",
               "https://lamancomunitat.org/events/rutes-guiades-20mils/"),
}

# id modelo; None = sin capa. precision: punto (coordenada de la fuente o paraje puntual), paraje (sierra/parque, centroide
# aproximado), cuadricula (UTM 1 km), municipio (centroide municipal; NO va al GPX).
# especies: (id_modelo_o_None, nombre_citado)
Z = [
 # ---- Marbella
 dict(id="M01", reg="marbella", nombre="Sendero de Valdeinfierno (monte público)", mun="Los Barrios (Cádiz)", lat=36 + 13/60 + 39.3/3600, lon=-(5 + 35/60 + 8.25/3600), prec="punto",
      esp=[("amanita_caesarea", "Amanita caesarea"), ("boletus_aereus", "Boletus aereus"), ("macrolepiota_procera", "Macrolepiota procera"), ("pleurotus_ostreatus", "Pleurotus ostreatus"),
           (None, "Cantharellus subpruinosus"), (None, "Lactarius chrysorrheus")], src="JA-CUSSTA", hab="quejigal, alcornocal y canutos (aliso)", gpx=True),
 dict(id="M02", reg="marbella", nombre="Alhama: La Fuente / barranco de Tutalán (ruta Pantaneta)", mun="Alhama de Granada (Granada)", lat=36 + 58/60 + 49.94764/3600, lon=-(3 + 59/60 + 7.06191/3600), prec="punto",
      esp=[("pleurotus_ostreatus", "Pleurotus ostreatus"), (None, "Tricholoma populinum"), (None, "Lactarius controversus")], src="JA-CUSSTA", hab="bosque de ribera, alamedas", gpx=True),
 dict(id="M03", reg="marbella", nombre="Alhama: Robledal (ruta Pantaneta)", mun="Alhama de Granada (Granada)", lat=36 + 55/60 + 37.93889/3600, lon=-(3 + 59/60 + 41.77654/3600), prec="punto",
      esp=[("lepista_nuda", "Lepista nuda"), ("tricholoma_portentosum", "Tricholoma portentosum"), (None, "Tricholoma equestre"), (None, "Coprinus comatus")], src="JA-CUSSTA",
      hab="cedros, pino resinero, castaño, encina, coscoja", gpx=True),
 dict(id="M04", reg="marbella", nombre="Alhama: zona alta de la ruta (entre Robledal y Loma de Castro, sin coordenada propia)", mun="Alhama de Granada (Granada)",
      lat=(36 + 55/60 + 37.93889/3600 + 36 + 56/60 + 12.73132/3600) / 2, lon=-((3 + 59/60 + 41.77654/3600 + 3 + 59/60 + 2.24733/3600) / 2), prec="paraje",
      esp=[("lactarius_deliciosus", "Lactarius deliciosus"), ("lactarius_sanguifluus", "Lactarius sanguifluus"), ("boletus_aereus", "Boletus aereus"), ("boletus_aestivalis", "Boletus aestivalis"), ("lepista_nuda", "Lepista nuda")],
      src="JA-CUSSTA", hab="ruta Pantaneta, tramo alto con vistas al P. N. Tejeda-Almijara-Alhama (punto medio de dos paradas; ubicación aproximada)", gpx=True),
 dict(id="M05", reg="marbella", nombre="Alhama: Cortijo Loma de Castro (era abandonada)", mun="Alhama de Granada (Granada)", lat=36 + 56/60 + 12.73132/3600, lon=-(3 + 59/60 + 2.24733/3600), prec="punto",
      esp=[("pleurotus_eryngii", "Pleurotus eryngii"), ("agaricus_campestris", "Agaricus campestris")], src="JA-CUSSTA", hab="era y entorno de cortijo en ruinas", gpx=True),
 dict(id="M06", reg="marbella", nombre="«Sendero Micológico» (camino con ese nombre en OSM)", mun="Granada (por confirmar)", lat=36.8799975, lon=-3.9158975, prec="punto",
      esp=[], src="OSM", hab="sin datos de especies; solo el nombre del camino (way 639947092)", gpx=True),
 dict(id="M07", reg="marbella", nombre="P. N. Montes de Málaga", mun="Málaga / Colmenar (Málaga)", lat=36.8209711, lon=-4.3801589, prec="paraje",
      esp=[("lactarius_deliciosus", "níscalo"), (None, "rebozuelo"), ("amanita_caesarea", "Amanita caesarea")], src="DEBATE", hab="pinares, encinares y alcornocales (según la fuente)", gpx=True),
 dict(id="M08", reg="marbella", nombre="Finca La Moheda (alcornocal), salida de campo de las Jornadas de Monda", mun="Monda (Málaga)", lat=36.6076048, lon=-4.8345914, prec="paraje",
      esp=[], src="SINATUR-MONDA", hab="alcornocal al borde de Sierra de las Nieves; especies no listadas en la fuente permitida", gpx=True),
 dict(id="M09", reg="marbella", nombre="Alpujata (zona recreativa), jornadas de Monda", mun="Monda (Málaga)", lat=36.6126693, lon=-4.8211489, prec="paraje",
      esp=[], src="MITECO-MONDA", hab="entorno del P. N. Sierra de las Nieves; sin especies en la fuente", gpx=True),
 dict(id="M10", reg="marbella", nombre="P. N. Sierra de las Nieves (zona de pinsapar y castañar)", mun="Sierra de las Nieves (Málaga)", lat=36.6763835, lon=-4.9792703, prec="paraje",
      esp=[("lactarius_deliciosus", "níscalo"), (None, "boletus (genérico)")], src="DEBATE", hab="más de 400 taxones según la fuente; el texto no concreta paraje", gpx=False),
 dict(id="M11", reg="marbella", nombre="Montes de propios de Cortes de la Frontera", mun="Cortes de la Frontera (Málaga)", lat=36.6170845, lon=-5.3426714, prec="municipio",
      esp=[], src="CORTES", hab="salida de campo en vehículo por los montes de propios (programa 2019); sin especies", gpx=False),
 dict(id="M12", reg="marbella", nombre="Garganta del Candelar (cabecera), bosque de niebla de quejigo moruno", mun="Algeciras (Cádiz)", lat=None, lon=None, prec="cuadricula",
      utm=(270500.0, 3999500.0), esp=[(None, "Cantharellus ferruginascens")], src="SGHN", hab="Quercus canariensis, 750 m, 15/11/2013 (cuadrícula UTM 30STF 70 99 → 1 km)", gpx=True),
 # ---- Alicante
 dict(id="A01", reg="alicante", nombre="Carrascal de la Font Roja", mun="Alcoy / Ibi (Alicante)", lat=38.6651090, lon=-0.5400643, prec="paraje",
      esp=[("lactarius_deliciosus", "rovellons"), ("lactarius_sanguifluus", "esclatasangs"), (None, "bolets")], src="SALIR", hab="carrascal y pinar de umbría", gpx=True),
 dict(id="A02", reg="alicante", nombre="Serra de Mariola (Agres, Cocentaina, Muro d'Alcoi, Bocairent)", mun="Alcoià / Comtat (Alicante)", lat=38.6989759, lon=-0.6394738, prec="paraje",
      esp=[("lactarius_deliciosus", "níscalo"), (None, "boletus"), (None, "rebozuelo")], src="DDA", hab="encinares y pinares con umbrías", gpx=True),
 dict(id="A03", reg="alicante", nombre="Maigmó–Carrasqueta (Xixona, Tibi, Agost)", mun="L'Alacantí / Alcoià (Alicante)", lat=38.5440, lon=-0.5590, prec="paraje",
      esp=[("lactarius_deliciosus", "níscalo"), ("macrolepiota_procera", "parasol")], src="DDA", hab="pinares con jaral y brezal (punto medio entre Carrasqueta 38.603,-0.487 y Maigmó 38.502,-0.631)", gpx=True),
 dict(id="A04", reg="alicante", nombre="Valle de Guadalest", mun="El Castell de Guadalest (Alicante)", lat=38.6754609, lon=-0.1995862, prec="paraje",
      esp=[("lactarius_deliciosus", "níscalos"), ("pleurotus_eryngii", "setas de cardo")], src="SALIR", hab="valle; la fuente no da hábitat", gpx=True),
 dict(id="A05", reg="alicante", nombre="Sierra de Aitana", mun="La Marina Baixa / Comtat (Alicante)", lat=38.6486239, lon=-0.2478181, prec="paraje",
      esp=[("lactarius_sanguifluus", "esclata-sang"), ("lactarius_deliciosus", "llenega / níscalo"), (None, "setas de chopo")], src="SALIR", hab="pinares de sierra", gpx=True),
 dict(id="A06", reg="alicante", nombre="Sierra de Bernia", mun="Altea / Callosa d'en Sarrià (Alicante)", lat=38.6592204, lon=-0.0415142, prec="paraje",
      esp=[("lactarius_deliciosus", "níscalos")], src="ESPANOL", hab="pinares de sierra", gpx=True),
 dict(id="A07", reg="alicante", nombre="Molí l'Ombria (ruta micològica programada)", mun="Banyeres de Mariola (Alicante)", lat=38.7075648, lon=-0.6637733, prec="punto",
      esp=[], src="MANCOM", hab="ruta micològica guiada; sin especies en la fuente", gpx=True),
 dict(id="A08", reg="alicante", nombre="Sierra de Onil", mun="Onil (Alicante)", lat=38.6301237, lon=-0.6670343, prec="municipio",
      esp=[("lactarius_deliciosus", "llenega / níscalo")], src="ESPANOL", hab="pinares; centroide del casco de Onil", gpx=False),
 dict(id="A09", reg="alicante", nombre="Pinares de Confrides y Alcoleja", mun="Confrides / Alcoleja (Alicante)", lat=38.6794, lon=-0.2998, prec="municipio",
      esp=[], src="DDA", hab="pinares de montaña y umbrías; punto medio de ambos cascos", gpx=False),
 dict(id="A10", reg="alicante", nombre="Foia de Castalla", mun="Castalla (Alicante)", lat=38.5957233, lon=-0.6702617, prec="municipio",
      esp=[("agaricus_campestris", "champiñones"), ("pleurotus_eryngii", "setas de cardo")], src="ESPANOL", hab="campos y bancales (Castalla, Villena, Beneixama)", gpx=False),
 dict(id="A11", reg="alicante", nombre="Campos de Villena", mun="Villena (Alicante)", lat=38.6360967, lon=-0.8659745, prec="municipio",
      esp=[("agaricus_campestris", "champiñones"), ("pleurotus_eryngii", "setas de cardo")], src="ESPANOL", hab="campos y bancales", gpx=False),
 dict(id="A12", reg="alicante", nombre="Campos de Beneixama", mun="Beneixama (Alicante)", lat=38.7008815, lon=-0.7641359, prec="municipio",
      esp=[("agaricus_campestris", "champiñones"), ("pleurotus_eryngii", "setas de cardo")], src="ESPANOL", hab="campos y bancales", gpx=False),
 dict(id="A13", reg="alicante", nombre="Río Serpis (ribera de chopos)", mun="Alcoià / Comtat (Alicante)", lat=38.8467499, lon=-0.3203071, prec="municipio",
      esp=[("pleurotus_ostreatus", "setas de ostra")], src="ESPANOL", hab="bosque de ribera; punto de un tramo del río (impreciso)", gpx=False),
 dict(id="A14", reg="alicante", nombre="Cabecera del Vinalopó (Banyeres de Mariola)", mun="Banyeres de Mariola (Alicante)", lat=38.7156535, lon=-0.6577745, prec="municipio",
      esp=[("pleurotus_ostreatus", "setas de ostra")], src="ESPANOL", hab="bosque de ribera; centroide de Banyeres", gpx=False),
]

ALTA = {"punto": 350, "cuadricula": 750, "paraje": 350, "municipio": 350}


def haversine(a, b, c, d):
    p = math.pi / 180
    h = math.sin((c - a) * p / 2) ** 2 + math.cos(a * p) * math.cos(c * p) * math.sin((d - b) * p / 2) ** 2
    return 12742 * math.asin(math.sqrt(h))


def ventana(r, arr, x, y, semi):
    col, fila = ~r.transform * (x, y)
    col, fila = int(col), int(fila)
    n = int(semi // 100)
    sub = arr[max(fila - n, 0): fila + n + 1, max(col - n, 0): col + n + 1]
    return sub


def main():
    t = Transformer.from_crs(4326, 25830, always_xy=True)
    ti = Transformer.from_crs(25830, 4326, always_xy=True)
    regiones = {}
    for reg in ("marbella", "alicante"):
        poly = shape(json.load(open(DATOS / reg / "out" / "region_base.geojson"))["geometry"])
        sitios = json.load(open(DATOS / reg / "out" / "app" / "sitios.json"))["especies"]
        citas = json.load(open(DATOS / reg / "out" / "citas.geojson"))["features"]
        regiones[reg] = (poly, sitios, citas)
    out = []
    for z in Z:
        if z.get("utm"):
            z["lon"], z["lat"] = ti.transform(*z["utm"])
        poly, sitios, citas = regiones[z["reg"]]
        z["en_region"] = bool(poly.contains(Point(z["lon"], z["lat"])))
        x, y = t.transform(z["lon"], z["lat"])
        # especies a evaluar: citadas con capa; si no hay citadas, nada
        res = []
        for eid, nom in z["esp"]:
            if eid is None:
                res.append(dict(especie=nom, id=None))
                continue
            tif = DATOS / z["reg"] / "out" / f"idoneidad_{eid}.tif"
            if not tif.exists():
                res.append(dict(especie=nom, id=eid, sin_capa=True))
                continue
            with rasterio.open(tif) as r:
                arr = r.read(1)
                v7 = ventana(r, arr, x, y, 350)
                v3 = ventana(r, arr, x, y, 3000)
            ls = sitios.get(eid, [])
            dmin = min((haversine(z["lat"], z["lon"], s["lat"], s["lon"]) for s in ls), default=None)
            ncit = sum(1 for f in citas if f["properties"]["especie"] == eid and haversine(z["lat"], z["lon"], f["properties"]["lat"], f["properties"]["lon"]) <= 2.0)
            res.append(dict(especie=nom, id=eid, max700=int(v7.max()) if v7.size else None, med700=round(float(v7.mean()), 1) if v7.size else None,
                            max3k=int(v3.max()) if v3.size else None, frac3k=round(float((v3 >= UMBRAL).mean()) * 100, 1) if v3.size else None,
                            dmin_sitio_km=round(dmin, 1) if dmin is not None else None, n_sitios_especie=len(ls), citas_2km=ncit))
        z["res"] = res
        top = []
        if z["en_region"]:
            for tif in sorted((DATOS / z["reg"] / "out").glob("idoneidad_*.tif")):
                with rasterio.open(tif) as r:
                    v = ventana(r, r.read(1), x, y, 350)
                top.append((int(v.max()) if v.size else 0, tif.stem.replace("idoneidad_", "")))
            top.sort(reverse=True)
        z["top700"] = top[:3]
        z["cibarius700"] = next((m for m, e in top if e == "cantharellus_cibarius"), None)
        out.append(z)
    json.dump(out, open(RAIZ / "docs" / "investigacion" / "2026-10-25-zonas-setas-abiertas.tabla.json", "w"), ensure_ascii=False, indent=1)
    escribir_gpx(out)
    return out


NS = "https://setas.local/gpx/1"


def escribir_gpx(zs):
    wpts = []
    for z in zs:
        if not z["gpx"] or not z["en_region"]:
            continue
        modeladas = [e for e in z["esp"] if e[0]]
        especie = modeladas[0][0] if modeladas else ""
        citadas = ", ".join(n for _, n in z["esp"]) or "sin especies concretas en la fuente"
        src = FUENTES[z["src"]]
        nota = (f"Zona documentada, no garantía. {z['nombre']} ({z['mun']}). Especies citadas: {citadas}. Hábitat según la fuente: {z['hab']}. "
                f"Ubicación {z['prec']} (aprox.). Fuente: {src[0]} — {src[2]} — {src[1]}.")
        wid = str(uuid.uuid5(uuid.NAMESPACE_URL, "setas/zona-documentada/" + z["id"]))
        nombre = f"★☆☆ {z['nombre']}"
        wpts.append(f'''  <wpt lat="{z['lat']:.5f}" lon="{z['lon']:.5f}">
    <time>2026-10-25T00:00:00Z</time>
    <name>{escape(nombre)}</name>
    <desc>{escape(nota)}</desc>
    <extensions><setas:sitio id="{wid}" estrellas="1" especie="{especie}"/></extensions>
  </wpt>''')
    gpx = f'''<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Mapa de setas" xmlns="http://www.topografix.com/GPX/1/1" xmlns:setas="{NS}">
{chr(10).join(wpts)}
</gpx>
'''
    (RAIZ / "docs" / "zonas-setas-documentadas.gpx").write_text(gpx, encoding="utf-8")
    print("GPX:", len(wpts), "puntos")


if __name__ == "__main__":
    for z in main():
        print(z["id"], z["en_region"], round(z["lat"], 4), round(z["lon"], 4), [(r["especie"], r.get("max700"), r.get("max3k"), r.get("dmin_sitio_km"), r.get("citas_2km")) for r in z["res"]])
