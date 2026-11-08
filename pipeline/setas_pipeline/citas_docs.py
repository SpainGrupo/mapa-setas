"""Exporta las citas de cada región a docs/citas/ (CSV, GPX importable en «Mis sitios» y RESUMEN.md).

    uv run python -m setas_pipeline.citas_docs [--region marbella --region alicante] [--destino ../docs/citas]

Lee data/<región>/out/citas.geojson (lo escribe `citas.py`) y los nombres de guia/especies.json. Reproducible:
mismo geojson → mismos ficheros. Uso personal y no comercial; cada registro conserva su licencia en el CSV.
- CSV: especie (binomio de la ficha de la guía; si no hay ficha propia, el id), nombre_comun, fecha, lat, lon,
  precision_m, fuente, url, confianza, licencia. Orden: fecha descendente (sin fecha al final), estable.
- GPX: un waypoint por cita; estrellas = confianza (alta 3, media 2, baja 1). El id del waypoint es el que ya
  tenía esa cita en el GPX anterior (clave: url) o, si es nueva, uuid5(NAMESPACE_URL, url), para que reimportar
  no duplique sitios.
"""
from __future__ import annotations
import argparse, csv, io, json, re, time, uuid
from collections import Counter
from pathlib import Path
from xml.sax.saxutils import escape

RAIZ = Path(__file__).resolve().parents[2]
DATOS = RAIZ / "pipeline" / "data"
GUIA = RAIZ / "guia" / "especies.json"
DESTINO = RAIZ / "docs" / "citas"
ESTRELLAS = {"alta": 3, "media": 2, "baja": 1}
COLUMNAS = ["especie", "nombre_comun", "fecha", "lat", "lon", "precision_m", "fuente", "url", "confianza", "licencia"]


def nombre_region(r: str, datos: Path = DATOS) -> str:
    """Nombre legible de la región (data/regiones.json); si no está, el id con la inicial en mayúscula."""
    try:
        return next(x["nombre"] for x in json.loads((datos / "regiones.json").read_text()) if x["id"] == r)
    except (OSError, StopIteration, KeyError, ValueError):
        return r.capitalize()


def nombres_guia(ruta: Path = GUIA) -> dict[str, tuple[str, str]]:
    """id de ficha → (binomio, nombres comunes unidos con «; »)."""
    out = {}
    for f in json.loads(Path(ruta).read_text()):
        bi = " ".join(f["nombre_cientifico"].split()[:2])
        out[f["id"]] = (bi, "; ".join(f.get("nombres_comunes") or []))
    return out


def nombre_de(especie: str, guia: dict) -> tuple[str, str]:
    if especie in guia:
        return guia[especie]
    return especie.replace("_", " ").capitalize(), ""


def _clave_fecha(r: dict):
    return r["fecha"] or ""


def _num(v):
    """Precisión sin «.0» (el CSV original la escribe como entero cuando lo es)."""
    if v is None:
        return ""
    return int(v) if float(v).is_integer() else v


def filas(geojson: dict, guia: dict) -> list[dict]:
    out = []
    for f in geojson["features"]:
        p = f["properties"]
        lat, lon = p["lat"], p["lon"]
        sci, comun = nombre_de(p["especie"], guia)
        out.append({"especie": sci, "nombre_comun": comun, "fecha": p.get("fecha") or "", "lat": lat, "lon": lon,
                    "precision_m": "" if p.get("precision_m") is None else p["precision_m"], "fuente": p.get("fuente") or "",
                    "url": p.get("url") or "", "confianza": p.get("confianza") or "", "licencia": p.get("licencia") or "",
                    "_id": p["especie"], "_origen": p.get("origen") or ""})
    return sorted(out, key=_clave_fecha, reverse=True)      # sorted es estable: empates en el orden del geojson


def a_csv(rows: list[dict]) -> str:
    b = io.StringIO()
    w = csv.DictWriter(b, COLUMNAS, extrasaction="ignore", lineterminator="\r\n")
    w.writeheader()
    w.writerows(rows)
    return b.getvalue()


def _dd_mm_aa(fecha: str) -> str:
    """dd/mm/aa; con solo año y mes (2025-11) → mm/aa; con solo año → aaaa (el GPX anterior dejaba «/11/25»)."""
    m = re.match(r"(\d{4})(?:-(\d\d))?(?:-(\d\d))?", fecha or "")
    if not m:
        return "s/f"
    return "/".join(x for x in (m[3], m[2], m[1][2:] if m[2] else m[1]) if x)


def _abrev(sci: str) -> str:
    p = sci.split()
    return f"{p[0][0]}. {' '.join(p[1:])}" if len(p) > 1 else sci


def ids_previos(gpx: str) -> dict[str, str]:
    """url → id de waypoint del GPX anterior."""
    out = {}
    for w in re.findall(r"<wpt .*?</wpt>", gpx, re.S):
        u, i = re.search(r"URL: (\S+?)\. Precisi", w), re.search(r'setas:sitio id="([^"]+)"', w)
        if u and i:
            out[u[1]] = i[1]
    return out


def id_waypoint(r: dict, previos: dict[str, str]) -> str:
    if r["url"] in previos:
        return previos[r["url"]]
    return str(uuid.uuid5(uuid.NAMESPACE_URL, r["url"] or f"{r['_id']}|{r['lat']}|{r['lon']}|{r['fecha']}"))


def a_gpx(rows: list[dict], previos: dict[str, str]) -> str:
    g = ['<?xml version="1.0" encoding="UTF-8"?>',
         '<gpx version="1.1" creator="Mapa de setas" xmlns="http://www.topografix.com/GPX/1/1" xmlns:setas="https://setas.local/gpx/1">']
    for r in rows:
        hora = (re.match(r"\d{4}-\d\d-\d\d", r["fecha"]) or [None])[0]
        g.append(f'  <wpt lat="{r["lat"]:.5f}" lon="{r["lon"]:.5f}">')
        g.append(f'    <time>{hora or "2026-11-07"}T00:00:00Z</time>')
        g.append(f'    <name>{escape(_abrev(r["especie"]) + " " + _dd_mm_aa(r["fecha"]))}</name>')
        g.append(f'    <desc>{escape(f"Cita de {r["especie"]}. Fuente: {r["fuente"]}. URL: {r["url"]}. Precisión: {str(_num(r["precision_m"])) + " m" if r["precision_m"] != "" else "no declarada"}. Confianza: {r["confianza"]}.")}</desc>')
        g.append(f'    <extensions><setas:sitio id="{id_waypoint(r, previos)}" estrellas="{ESTRELLAS.get(r["confianza"], 1)}" especie="{r["_id"]}"/></extensions>')
        g.append("  </wpt>")
    g.append("</gpx>")
    return "\n".join(g) + "\n"


def seccion_resumen(nombre: str, rows: list[dict]) -> list[str]:
    por_origen = Counter(r["_origen"] for r in rows)
    por_anyo = Counter((r["fecha"][:4] if re.match(r"\d{4}", r["fecha"]) else "sin ") for r in rows)
    anyos = (["sin "] if "sin " in por_anyo else []) + sorted((a for a in por_anyo if a != "sin "), reverse=True)
    esp = Counter((r["especie"], r["nombre_comun"]) for r in rows)
    L = [f"## {nombre}: {len(rows)} citas", "",
         "**Por fuente:** " + ", ".join(f"{k} {v}" for k, v in sorted(por_origen.items())), " ",
         "**Por año:** " + ", ".join(f"{a} {por_anyo[a]}" if a != "sin " else f"sin  {por_anyo[a]}" for a in anyos), " ", "",
         "| especie | nombre común | citas |", "|---|---|---|"]
    L += [f"| {e} | {c} | {n} |" for (e, c), n in esp.most_common()]
    L += ["", "**20 más recientes**", "", "| fecha | especie | fuente | url |", "|---|---|---|---|"]
    L += [f"| {r['fecha']} | {r['especie']} | {r['_origen']} | {r['url']} |" for r in rows[:20]]
    return L + [""]


def exportar(regiones: list[str], destino: Path = DESTINO, datos: Path = DATOS, guia_json: Path = GUIA) -> dict[str, int]:
    destino.mkdir(parents=True, exist_ok=True)
    guia = nombres_guia(guia_json)
    L = [f"# Citas de setas: {' y '.join(nombre_region(r, datos) for r in regiones)}", "",
         f"Generado {time.strftime('%Y-%m-%d')} desde `pipeline/data/<región>/out/citas.geojson` (GBIF, iNaturalist, Observation.org vía GBIF, "
         "foros y literatura) con `uv run python -m setas_pipeline.citas_docs`. Uso personal y no comercial; cada registro conserva su licencia en el CSV.", "",
         "Ficheros: `citas-<región>.csv` (todas), `citas-<región>.gpx` (importable en Mis sitios; estrellas = confianza: alta 3, media 2, baja 1).", ""]
    n = {}
    for r in regiones:
        gj = json.loads((datos / r / "out" / "citas.geojson").read_text())
        rows = filas(gj, guia)
        gpx_prev = destino / f"citas-{r}.gpx"
        previos = ids_previos(gpx_prev.read_text()) if gpx_prev.exists() else {}
        (destino / f"citas-{r}.csv").write_text(a_csv(rows))
        gpx_prev.write_text(a_gpx(rows, previos))
        L += seccion_resumen(nombre_region(r, datos), rows)
        n[r] = len(rows)
    (destino / "RESUMEN.md").write_text("\n".join(L))
    return n


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--region", action="append", help="repetible; por defecto marbella y alicante")
    ap.add_argument("--destino", type=Path, default=DESTINO)
    a = ap.parse_args(argv)
    print(exportar(a.region or ["marbella", "alicante"], a.destino))


if __name__ == "__main__":
    main()
