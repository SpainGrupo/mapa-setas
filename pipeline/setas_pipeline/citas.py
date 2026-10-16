"""Citas ampliadas: GBIF + iNaturalist + sitios de foros/literatura en un radio alrededor del centro de la región
(regiones/<id>.yaml → citas: centro, radio_km, sitios_csv; en Marbella 200 km)
→ data/<region>/out/citas.geojson (un registro por cita, normalizado y deduplicado).

    uv run python -m setas_pipeline.citas [--refrescar] [--region marbella]

Uso personal y no comercial: no se excluye ninguna licencia (CC BY-NC incluida); cada registro guarda su
licencia y su atribución. Las respuestas crudas se cachean en data/<region>/raw/citas/ (--refrescar las vuelve a
pedir).
Observation.org: su API v1 exige OAuth (cuenta) y su web está tras anti-bot; solo entra lo que llega vía GBIF
(datasetKey 8a863029-…), etiquetado origen=observation. IMBA: sin servicio de puntos (ver redacta-imba.md).
Propiedades: especie, fecha, lat, lon, precision_m, fuente, origen, licencia, url, confianza (+ atribucion,
tambien_en). La especie es el id de guia/especies.json. Dedupe: misma especie, < 100 m y misma fecha (día).
"""
from __future__ import annotations
import argparse, csv, json, math, re, time
from pathlib import Path
import requests

DEDUPE_M = 100.0
GBIF = "https://api.gbif.org/v1"
INAT = "https://api.inaturalist.org/v1"
DS_INAT, DS_OBSERVATION = "50c9509d-22c7-4a22-a47d-8c48425ef4a7", "8a863029-f435-446a-821e-275f4f641165"
PRIORIDAD = {"inat": 0, "observation": 1, "gbif": 2, "imba": 3, "foro": 4, "literatura": 5}

# id de la guía → nombres científicos a consultar (sinónimos incluidos; GBIF los resuelve al aceptado).
# lactarius_sanguifluus no está en la guía pero sí en el pipeline (especies.yaml).
TAXA = {
    "boletus_edulis": ["Boletus edulis"], "boletus_aereus": ["Boletus aereus"],
    "boletus_reticulatus": ["Boletus reticulatus", "Boletus aestivalis"],
    "boletus_pinophilus": ["Boletus pinophilus"], "amanita_caesarea": ["Amanita caesarea"],
    "lactarius_deliciosus": ["Lactarius deliciosus"], "cantharellus_cibarius": ["Cantharellus cibarius"],
    "macrolepiota_procera": ["Macrolepiota procera"], "suillus_bellinii": ["Suillus bellinii"],
    "hydnum_repandum": ["Hydnum repandum"], "lepista_nuda": ["Lepista nuda"],
    "russula_cyanoxantha": ["Russula cyanoxantha"], "agaricus_campestris": ["Agaricus campestris"],
    "amanita_phalloides": ["Amanita phalloides"], "amanita_verna": ["Amanita verna"],
    "lepiota_brunneoincarnata": ["Lepiota brunneoincarnata"], "amanita_muscaria": ["Amanita muscaria"],
    "amanita_pantherina": ["Amanita pantherina"], "rubroboletus_satanas": ["Rubroboletus satanas"],
    "caloboletus_calopus": ["Caloboletus calopus"], "caloboletus_radicans": ["Caloboletus radicans"],
    "tylopilus_felleus": ["Tylopilus felleus"], "omphalotus_olearius": ["Omphalotus olearius"],
    "lactarius_torminosus": ["Lactarius torminosus"], "lactarius_chrysorrheus": ["Lactarius chrysorrheus"],
    "chlorophyllum_rhacodes": ["Chlorophyllum rhacodes", "Chlorophyllum brunneum"],
    "amanita_ponderosa": ["Amanita ponderosa"], "pleurotus_eryngii": ["Pleurotus eryngii"],
    "terfezia_arenaria": ["Terfezia arenaria", "Terfezia claveryi"],
    "scleroderma_citrinum": ["Scleroderma citrinum", "Scleroderma verrucosum"],
    "lactarius_sanguifluus": ["Lactarius sanguifluus"],
}
# abreviaturas de la columna «especies» del CSV de sitios conocidos
ABREV = {"a. caesarea": "amanita_caesarea", "b. edulis": "boletus_edulis", "b. aereus": "boletus_aereus",
         "b. reticulatus": "boletus_reticulatus", "b. aestivalis": "boletus_reticulatus",
         "b. pinophilus": "boletus_pinophilus"}
# precisión (m) estimada según el tipo de localización que declara el CSV
PRECISION_CSV = [("punto", 100), ("paraje", 1000), ("municipio", 5000), ("espacio protegido", 10000),
                 ("sierra", 15000), ("comarca", 15000)]

_sesion = requests.Session()
_sesion.headers["User-Agent"] = "setas-pipeline/uso-personal (info@spaingrupo.com)"


def distancia_km(lat1, lon1, lat2, lon2) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 12742.0 * math.asin(math.sqrt(a))


def ambito(region) -> tuple[tuple[float, float], float]:
    """((lat, lon) del centro, radio en km) de las citas de la región (regiones/<id>.yaml → citas)."""
    c = region.citas["centro"]
    return (float(c["lat"]), float(c["lon"])), float(region.citas["radio_km"])


def dentro_radio(lat, lon, centro, radio_km) -> bool:
    return distancia_km(centro[0], centro[1], lat, lon) <= radio_km


def poligono_wkt(centro, radio_km, n=72) -> str:
    """Círculo aproximado (antihorario, lo exige GBIF) un 2 % mayor que el radio; luego se filtra exacto."""
    lat0, lon0 = centro
    r = radio_km * 1.02
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n
        pts.append((lon0 - r / (111.32 * math.cos(math.radians(lat0))) * math.sin(a),
                    lat0 + r / 110.57 * math.cos(a)))
    pts.append(pts[0])
    return "POLYGON((" + ",".join(f"{x:.4f} {y:.4f}" for x, y in pts) + "))"


def fecha_dia(f) -> str | None:
    """'2013-10-26T10:00/2013-10-26' → '2013-10-26'. Solo vale con día completo; si no, None."""
    if not f:
        return None
    m = re.match(r"(\d{4}-\d{2}-\d{2})", str(f))
    return m.group(1) if m else None


def _get(url, params, intentos=4):
    for i in range(intentos):
        r = _sesion.get(url, params=params, timeout=90)
        if r.status_code in (429, 500, 502, 503):
            time.sleep(5 * (i + 1)); continue
        r.raise_for_status()
        return r.json()
    r.raise_for_status()


def _cache(raw: Path, nombre, refrescar, fn):
    f = Path(raw) / f"{nombre}.json"
    if f.exists() and not refrescar:
        return json.loads(f.read_text())
    datos = fn()
    Path(raw).mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps(datos, ensure_ascii=False))
    return datos


# ---------------------------------------------------------------- GBIF
RANGOS_ESPECIE = ("SPECIES", "SUBSPECIES", "VARIETY", "FORM")   # rangos aceptables de un species/match


def clave_especie(j: dict, nombre: str) -> int | None:
    """Clave GBIF de una respuesta de species/match, solo si casa con una especie (o rango inferior).
    Un sinónimo da la clave del aceptado (B. aestivalis → B. reticulatus). Si GBIF solo reconoce un rango
    superior (matchType HIGHERRANK, rank GENUS…) o nada (NONE) → None con aviso: la clave del género
    traería las citas de todo el género."""
    tipo, rango = j.get("matchType"), j.get("rank")
    if tipo in (None, "NONE") or tipo == "HIGHERRANK" or rango not in RANGOS_ESPECIE:
        print(f"  WARNING: GBIF no reconoce la especie {nombre!r} (matchType={tipo}, rank={rango}); se omite",
              flush=True)
        return None
    return j.get("acceptedUsageKey") or j.get("usageKey")


def gbif_claves(nombre: str) -> int | None:
    return clave_especie(_get(f"{GBIF}/species/match", {"name": nombre, "kingdom": "Fungi"}), nombre)


def gbif_ocurrencias(clave: int, wkt: str) -> list[dict]:
    """Todas las ocurrencias con coordenadas y sin problemas geoespaciales (todas las licencias).
    Si un taxón pasara de 90 000 se parte por años (el offset de la API se corta en 100 000)."""
    base = {"taxonKey": clave, "geometry": wkt, "hasCoordinate": "true", "hasGeospatialIssue": "false"}
    total = _get(f"{GBIF}/occurrence/search", {**base, "limit": 0})["count"]
    tramos = [None] if total <= 90000 else [str(a) for a in range(1700, time.gmtime().tm_year + 1)]
    out = []
    for tr in tramos:
        off = 0
        while True:
            p = {**base, "limit": 300, "offset": off, **({"year": tr} if tr else {})}
            j = _get(f"{GBIF}/occurrence/search", p)
            out += j["results"]
            if j.get("endOfRecords", True):
                break
            off += 300
    return out


def normaliza_gbif(especie: str, x: dict) -> dict | None:
    lat, lon = x.get("decimalLatitude"), x.get("decimalLongitude")
    if lat is None or lon is None or x.get("occurrenceStatus", "PRESENT") == "ABSENT":
        return None
    ds = x.get("datasetKey")
    origen = "inat" if ds == DS_INAT else "observation" if ds == DS_OBSERVATION else "gbif"
    base = x.get("basisOfRecord", "")
    conf = "alta" if base in ("PRESERVED_SPECIMEN", "MATERIAL_SAMPLE") or ds == DS_INAT else "media"
    lic = (x.get("license") or "sin licencia declarada").replace("http://creativecommons.org/", "") \
        .replace("publicdomain/zero/1.0/legalcode", "CC0-1.0")
    lic = re.sub(r"licenses/([a-z-]+)/([\d.]+)/legalcode", lambda m: f"CC-{m.group(1).upper()}-{m.group(2)}", lic)
    inst = x.get("institutionCode") or x.get("datasetName") or ""
    autor = x.get("rightsHolder") or x.get("recordedBy") or inst
    return {"especie": especie, "fecha": x.get("eventDate"), "lat": lat, "lon": lon,
            "precision_m": x.get("coordinateUncertaintyInMeters"),
            "fuente": f"GBIF dataset {ds}" + (f" ({inst})" if inst else ""), "origen": origen,
            "licencia": lic, "url": f"https://www.gbif.org/occurrence/{x['key']}", "confianza": conf,
            "atribucion": autor}


# ---------------------------------------------------------------- iNaturalist
def inat_taxon_ids(nombre: str) -> list[int]:
    j = _get(f"{INAT}/taxa", {"q": nombre, "rank": "species", "per_page": 10})
    time.sleep(1)
    return [t["id"] for t in j["results"]
            if nombre.lower() in (t.get("name", "").lower(), (t.get("matched_term") or "").lower())]


def inat_observaciones(taxon_id: int, centro, radio_km) -> list[dict]:
    out, id_above = [], 0
    while True:
        j = _get(f"{INAT}/observations", {
            "taxon_id": taxon_id, "lat": centro[0], "lng": centro[1], "radius": radio_km,
            "quality_grade": "research,needs_id", "geo": "true", "per_page": 200,
            "order_by": "id", "order": "asc", "id_above": id_above})
        res = j["results"]
        out += res
        if len(res) < 200:
            return out
        id_above = res[-1]["id"]
        time.sleep(1)


def normaliza_inat(especie: str, o: dict) -> dict | None:
    loc = o.get("geojson") or {}
    if not loc.get("coordinates"):
        return None
    lon, lat = (float(c) for c in loc["coordinates"])
    if o.get("obscured") or o.get("geoprivacy") in ("obscured", "private") or o.get("taxon_geoprivacy") == "obscured":
        prec = o.get("public_positional_accuracy")     # oscurecida: solo vale con su precisión pública declarada
        if prec is None:
            return None
    else:
        prec = o.get("positional_accuracy")
    lic = o["license_code"].upper() if o.get("license_code") else "sin licencia (todos los derechos reservados)"
    return {"especie": especie, "fecha": o.get("observed_on"), "lat": lat, "lon": lon, "precision_m": prec,
            "fuente": f"iNaturalist ({o.get('quality_grade')})", "origen": "inat", "licencia": lic,
            "url": o.get("uri") or f"https://www.inaturalist.org/observations/{o['id']}",
            "confianza": "alta" if o.get("quality_grade") == "research" else "baja",
            "atribucion": (o.get("user") or {}).get("login", "")}


# ---------------------------------------------------------------- sitios de foros / literatura
def origen_csv(url: str) -> str | None:
    """El CSV no trae columna origen: se deduce del enlace. None = ya viene de GBIF (se omite)."""
    if "gbif.org" in url:
        return None
    if any(d in url for d in ("pmc.ncbi", "juntadeandalucia", "studocu", "colectivoginer", "institutoecg", ".pdf")):
        return "literatura"
    return "foro"


def leer_sitios(ruta: Path | None, centro, radio_km) -> tuple[list[dict], dict]:
    regs, st = [], {"filas": 0, "omitidas_gbif": 0, "fuera_radio": 0, "especie_sin_id": 0}
    if ruta is not None and not Path(ruta).exists():
        print(f"WARNING: no existe el CSV de sitios {ruta} (citas.sitios_csv): sin citas de foros ni literatura",
              flush=True)
    if ruta is None or not Path(ruta).exists():
        return regs, st
    for f in csv.DictReader(open(ruta, encoding="utf-8")):
        st["filas"] += 1
        origen = origen_csv(f["fuente_url"])
        if origen is None:
            st["omitidas_gbif"] += 1; continue
        lat, lon = float(f["lat"]), float(f["lon"])
        if not dentro_radio(lat, lon, centro, radio_km):
            st["fuera_radio"] += 1; continue
        prec = next((m for k, m in PRECISION_CSV if f["precision"].lower().startswith(k)), 10000)
        fecha = f["fecha"] if re.match(r"\d{4}", f["fecha"]) else None
        for s in f["especies"].split(";"):
            s = re.sub(r"\(.*?\)", "", s).strip().lower()
            if s not in ABREV:
                st["especie_sin_id"] += 1; continue
            regs.append({"especie": ABREV[s], "fecha": fecha, "lat": lat, "lon": lon, "precision_m": prec,
                         "fuente": f"{f['lugar']} ({f['precision']})", "origen": origen,
                         "licencia": "sin licencia (cita de terceros; uso personal)", "url": f["fuente_url"],
                         "confianza": f["confianza"], "atribucion": f["cita"]})
    return regs, st


# ---------------------------------------------------------------- dedupe y salida
def _xy(r):
    k = 111320.0
    return r["lat"] * 110570.0, r["lon"] * k * math.cos(math.radians(r["lat"]))


def deduplicar(regs: list[dict]) -> list[dict]:
    """Misma especie, < DEDUPE_M y misma fecha (día completo en ambos): se queda el de mayor prioridad de
    origen (y, a igualdad, el de mejor precisión); el otro se anota en tambien_en."""
    orden = sorted(regs, key=lambda r: (PRIORIDAD[r["origen"]], r["precision_m"] if r["precision_m"] is not None else 1e9))
    celdas: dict = {}
    out = []
    for r in orden:
        d = fecha_dia(r["fecha"])
        y, x = _xy(r)
        ci, cj = int(y // DEDUPE_M), int(x // DEDUPE_M)
        dup = None
        if d:
            for di in (-1, 0, 1):
                for dj in (-1, 0, 1):
                    for q in celdas.get((r["especie"], d, ci + di, cj + dj), ()):
                        qy, qx = _xy(q)
                        if math.hypot(qy - y, qx - x) < DEDUPE_M:
                            dup = q; break
                    if dup: break
                if dup: break
        if dup:
            dup.setdefault("tambien_en", []).append(r["url"])
            continue
        out.append(r)
        if d:
            celdas.setdefault((r["especie"], d, ci, cj), []).append(r)
    return out


def a_geojson(regs: list[dict], centro, radio_km) -> dict:
    feats = []
    for r in regs:
        p = {k: r.get(k) for k in ("especie", "fecha", "lat", "lon", "precision_m", "fuente", "origen",
                                   "licencia", "url", "confianza", "atribucion")}
        p["lat"], p["lon"] = round(r["lat"], 6), round(r["lon"], 6)
        if r.get("tambien_en"):
            p["tambien_en"] = r["tambien_en"]
        feats.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [p["lon"], p["lat"]]},
                      "properties": p})
    return {"type": "FeatureCollection",
            "metadata": {"centro": list(centro), "radio_km": radio_km, "generado": time.strftime("%Y-%m-%d"),
                         "uso": "personal y no comercial; cada registro conserva licencia y atribución"},
            "features": feats}


# ---------------------------------------------------------------- previo (caché de la calibración)
LEGACY = {"boletus_reticulatus": "boletus_aestivalis_reticulatus"}


def previos(gbif_dir: Path) -> dict[str, list[tuple[float, float]]]:
    """Puntos (lat, lon) que usaba antes el pipeline: la caché GBIF de la calibración (data/_comun/gbif/*.json)."""
    out: dict = {}
    for f in Path(gbif_dir).glob("*.json"):
        nombre = re.sub(r"_[0-9a-f]{8}$", "", f.stem)
        esp = next((k for k in TAXA if LEGACY.get(k, k) == nombre), None)
        if esp:
            out.setdefault(esp, []).extend((p[1], p[0]) for p in json.loads(f.read_text()))
    return out


def es_nuevo(r, prev) -> bool:
    return not any(distancia_km(r["lat"], r["lon"], a, b) * 1000 < DEDUPE_M for a, b in prev.get(r["especie"], ()))


def taxa_region(region) -> dict[str, list[str]]:
    """TAXA más los taxones propios de la región (regiones/<id>.yaml → citas.taxa: {especie: [nombres]}).
    Los extra van por región para no cambiar las citas de las demás."""
    return {**TAXA, **(region.citas.get("taxa") or {})}


def construir(region, refrescar=False) -> tuple[list[dict], dict]:
    centro, radio_km = ambito(region)
    raw = region.raw / "citas"
    wkt = poligono_wkt(centro, radio_km)
    todos, stats = [], {}
    for esp, nombres in taxa_region(region).items():
        def pide_gbif():          # las claves solo se resuelven si hay que pedir (sin red con la caché)
            claves = {c for c in (gbif_claves(n) for n in nombres) if c}
            return [o for c in sorted(claves) for o in gbif_ocurrencias(c, wkt)]
        brutos = _cache(raw, f"gbif_{esp}", refrescar, pide_gbif)
        for x in {o["key"]: o for o in brutos}.values():
            r = normaliza_gbif(esp, x)
            if r and dentro_radio(r["lat"], r["lon"], centro, radio_km):
                todos.append(r)

        def pide():
            ids = sorted({i for n in nombres for i in inat_taxon_ids(n)})
            return [o for i in ids for o in inat_observaciones(i, centro, radio_km)]
        obs = _cache(raw, f"inat_{esp}", refrescar, pide)
        for o in {o["id"]: o for o in obs}.values():
            r = normaliza_inat(esp, o)
            if r and dentro_radio(r["lat"], r["lon"], centro, radio_km):
                todos.append(r)
    csv_ = region.citas.get("sitios_csv")
    ruta_csv = Path(csv_) if csv_ else None
    if ruta_csv and not ruta_csv.is_absolute():
        ruta_csv = Path(__file__).parent.parent / "regiones" / ruta_csv
    sitios, st = leer_sitios(ruta_csv, centro, radio_km)
    stats["sitios_csv"] = st
    todos += sitios
    stats["antes_dedupe"] = len(todos)
    return deduplicar(todos), stats


def main(argv=None):
    from .region import argumento_region, cargar_region
    ap = argparse.ArgumentParser()
    ap.add_argument("--refrescar", action="store_true", help="vuelve a pedir GBIF e iNaturalist")
    argumento_region(ap)
    a = ap.parse_args(argv)
    region = cargar_region(a.region)
    if not region.citas:
        raise SystemExit(f"la región {region.id} no declara `citas` (centro, radio_km) en su YAML")
    regs, stats = construir(region, a.refrescar)
    SALIDA = region.out / "citas.geojson"
    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    SALIDA.write_text(json.dumps(a_geojson(regs, *ambito(region)), ensure_ascii=False))
    prev = previos(region.comun / "gbif")
    from collections import Counter
    por_origen, por_esp = Counter(r["origen"] for r in regs), Counter(r["especie"] for r in regs)
    nuevos = Counter(r["especie"] for r in regs if es_nuevo(r, prev))
    print(f"{len(regs)} registros (antes de dedupe {stats['antes_dedupe']}) → {SALIDA}")
    print("por origen:", dict(por_origen)); print("sitios CSV:", stats["sitios_csv"])
    print("especie: total / nuevos frente a lo previo")
    for e, n in por_esp.most_common():
        print(f"  {e}: {n} / {nuevos[e]}")
    print(f"nuevos en total: {sum(nuevos.values())} (previos: {sum(len(v) for v in prev.values())} puntos)")


if __name__ == "__main__":
    main()
