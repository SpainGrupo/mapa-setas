"""Citas reales cerca de cada sitio candidato (2026-10-17) y validación del factor «citado» del ranking.

Lo llama sitios.calcular() antes de escribir sitios.json; también se puede rehacer sobre un sitios.json ya escrito:

    uv run python -m setas_pipeline.citas_sitios --region marbella      # (después: exportar manifest)

Asignación (por especie, misma clave de especies.yaml; boletus_aestivalis ↔ boletus_reticulatus como en calibracion):
a cada sitio se le asignan las citas de su especie a distancia ≤ max(1000 m, precision_m), con tope 5000 m. Las citas
con precision_m > 5000 m no se asignan; sin precision_m (desconocida) se aceptan a ≤ 1000 m pero cuentan como paraje.
Nivel del sitio: «punto» si alguna cita tiene precision_m ≤ 1000 y está a ≤ 1000 m; si no, «paraje».
Campo `citas` del sitio: {n, ultima ('AAAA' | null), nivel, origenes, refs} con refs = las MAX_REFS más recientes
({origen, fecha, precision_m, dist_m, url, fuente, atribucion, licencia}); sin citas, sin campo. Las citas sin licencia
libre solo se enlazan y atribuyen: no se copia ningún contenido suyo (texto, fotos).

Factor del ranking (app/src/ranking.ts): ×FACTOR["punto"] / ×FACTOR["paraje"] / ×1. Se activa por región
(`factor_citas` de sitios.json) solo si la validación por bloques no empeora el lift (abajo); si no, la app solo
enseña la etiqueta «Citado: …».

Validación por bloques espaciales (los mismos de calibracion.pliegues_bloques: 10 km, 5 pliegues, semilla 0):
para cada pliegue k, el factor de cada sitio se calcula SOLO con las citas que caen fuera de k (entrenamiento); el
universo son los sitios de la especie cuya celda cae en k; se evalúan las citas de k (mismo filtro de precisión que la
calibración: ≤ 1000 m o sin declarar; foros/literatura solo «punto», ≤ 100 m) que son «alcanzables» (algún sitio de k
a ≤ RADIO_ACIERTO_M; las demás no dicen nada del orden de los sitios y diluirían el lift igual con y sin factor).
  aciertos = citas alcanzables a ≤ 1 km de alguno de los TOP_N mejores sitios de k
  esperados = alcanzables × TOP_N / sitios de k          (los aciertos de un top al azar; cota inferior)
  lift = Σ aciertos / Σ esperados (sobre pliegues y, para la región, sobre especies); 1 = azar
Se calcula con orden = calidad (sin factor) y con orden = calidad × factor; los pliegues con ≤ TOP_N sitios (el top
sería todo) no informan. Región: factor activo si hay ≥ MIN_OBS citas alcanzables y lift con ≥ lift sin; con menos
citas no hay prueba y la región queda en solo etiqueta (conservador). No es trivialmente favorable al factor: las
citas que lo encienden nunca son las que se evalúan y solo cambia el orden de los sitios de k con citas de
entrenamiento a ≤ 5 km (cerca del borde del bloque); el informe dice cuántos sitios cambian de factor (potencia).
Complemento informativo (no decide): partición temporal (factor con las citas anteriores al año de corte, evaluación
con las de ese año en adelante, universo = todos los sitios de la especie).
"""
from __future__ import annotations
import json
import math
import re
from pathlib import Path
import numpy as np

RADIO_MIN_M = 1000.0        # radio mínimo de asignación (y máximo para citas sin precisión)
RADIO_MAX_M = 5000.0        # tope de asignación; precision_m > esto → la cita no se asigna
PUNTO_M = 1000.0            # nivel «punto»: precision_m ≤ esto y distancia ≤ esto
MAX_REFS = 10
FACTOR = {"punto": 1.15, "paraje": 1.05}
TOP_N = 10                  # el top por especie de la app
RADIO_ACIERTO_M = 1000.0    # una cita retenida «cae junto al top» si está a ≤ esto de un sitio del top
FRACCION_TEMPORAL = 0.3     # la partición temporal evalúa ~el 30 % más reciente de las citas fechadas


# ---------------------------------------------------------------- lógica pura

def radio(precision_m) -> float | None:
    """Radio de asignación de una cita: max(1000, precision_m) con tope 5000; None si precision_m > 5000."""
    if precision_m is None:
        return RADIO_MIN_M
    p = float(precision_m)
    if not math.isfinite(p):
        return RADIO_MIN_M
    if p > RADIO_MAX_M:
        return None
    return max(RADIO_MIN_M, p)


def anio(fecha) -> str | None:
    m = re.match(r"^(\d{4})", str(fecha or ""))
    return m.group(1) if m else None


def _distancias(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Matriz de distancias (m) entre puntos UTM a (n×2) y b (m×2)."""
    if not len(a) or not len(b):
        return np.zeros((len(a), len(b)))
    d = a[:, None, :] - b[None, :, :]
    return np.sqrt((d ** 2).sum(-1))


_PROHIBIDO = re.compile(r"comestib|se puede comer", re.I)   # la app nunca afirma que una seta sea comestible (spec §2)


def _limpio(v):
    """Texto de una fuente para enseñar en la app; None si está vacío o habla de comestibilidad."""
    return v if isinstance(v, str) and v.strip() and not _PROHIBIDO.search(v) else None


def _clave_fecha(r: dict):
    return str(r.get("fecha") or "")


def asignar(sitios_xy: np.ndarray, citas: list[dict]) -> list[dict | None]:
    """Campo `citas` de cada sitio (None si no tiene). `citas`: dicts con x, y (UTM) y las propiedades de la cita."""
    sitios_xy = np.asarray(sitios_xy, float).reshape(-1, 2)
    if not len(citas):
        return [None] * len(sitios_xy)
    radios = np.array([np.nan if (r := radio(c.get("precision_m"))) is None else r for c in citas])
    xy = np.array([[c["x"], c["y"]] for c in citas], float)
    D = _distancias(sitios_xy, xy)                                  # sitios × citas
    res = []
    for i in range(len(sitios_xy)):
        idx = np.flatnonzero(np.isfinite(radios) & (D[i] <= np.nan_to_num(radios, nan=-1)))
        if not len(idx):
            res.append(None)
            continue
        refs = []
        punto = False
        for j in idx:
            c = citas[j]
            p = c.get("precision_m")
            d = float(D[i, j])
            if p is not None and float(p) <= PUNTO_M and d <= PUNTO_M:
                punto = True
            url = c.get("url") if isinstance(c.get("url"), str) and re.match(r"^https?://", c["url"]) else None
            refs.append({"origen": c.get("origen"), "fecha": c.get("fecha"),
                         "precision_m": None if p is None else int(round(float(p))), "dist_m": int(round(d)),
                         "url": url, "fuente": _limpio(c.get("fuente")), "atribucion": _limpio(c.get("atribucion")),
                         "licencia": _limpio(c.get("licencia"))})
        refs.sort(key=lambda r: (_clave_fecha(r), -r["dist_m"]), reverse=True)
        anios = [a for r in refs if (a := anio(r["fecha"]))]
        origenes = sorted({r["origen"] for r in refs if r["origen"]}, key=_orden_origen)
        res.append({"n": len(refs), "ultima": max(anios) if anios else None, "nivel": "punto" if punto else "paraje",
                    "origenes": origenes, "refs": refs[:MAX_REFS]})
    return res


ORIGENES = ("foro", "literatura", "inat", "observation", "gbif", "imba")


def _orden_origen(o: str) -> int:
    return ORIGENES.index(o) if o in ORIGENES else len(ORIGENES)


def factor(c: dict | None) -> float:
    return FACTOR.get(c["nivel"], 1.0) if c else 1.0


def calidad(s: dict) -> float:
    """La misma calidad que sitios.calidad y ranking.ts (punt_media × ln(1 + area_ha) × bonus_pisado)."""
    return float(s["punt_media"]) * math.log1p(float(s["area_ha"])) * float(s.get("bonus_pisado") or 1.0)


def evaluable(c: dict) -> bool:
    """Mismo criterio que calibracion.filtrar_precision: ≤ 1000 m o sin declarar; foros/literatura solo ≤ 100 m."""
    from .calibracion import INCERTIDUMBRE_MAX, ORIGENES_TEXTO, PRECISION_PUNTO_M
    p = c.get("precision_m")
    if c.get("origen") in ORIGENES_TEXTO:
        return p is not None and float(p) <= PRECISION_PUNTO_M
    return p is None or float(p) <= INCERTIDUMBRE_MAX


def orden_top(scores, ids, n: int = TOP_N) -> np.ndarray:
    """Índices de los n mejores (score desc; empate → id menor, como ranking.ts)."""
    scores = np.asarray(scores, float); ids = np.asarray(ids)
    return np.lexsort((ids, -scores))[:n]


def aciertos_top(scores, ids, sitios_xy, eval_xy, n: int = TOP_N, radio_m: float = RADIO_ACIERTO_M) -> dict | None:
    """Citas alcanzables (con algún sitio a ≤ radio_m), cuántas caen a ≤ radio_m de un sitio del top-n y cuántas se
    esperarían si el top fuera al azar (alcanzables × n / sitios: cota inferior; exacta con un solo sitio cerca).
    None si no informa (≤ n sitios: el top sería todo)."""
    u = len(scores)
    if u <= n:
        return None
    exy = np.asarray(eval_xy, float).reshape(-1, 2)
    sxy = np.asarray(sitios_xy, float).reshape(-1, 2)
    D = _distancias(exy, sxy)
    alc = (D <= radio_m).any(axis=1) if D.size else np.zeros(len(exy), bool)
    top = orden_top(scores, ids, n)
    hits = int((D[alc][:, top] <= radio_m).any(axis=1).sum()) if alc.any() else 0
    return {"alcanzables": int(alc.sum()), "aciertos": hits, "esperados": float(alc.sum()) * n / u}


def _lift(aciertos: float, esperados: float):
    return round(aciertos / esperados, 2) if esperados > 0 else None


def validar_especie(sitios: list[dict], sitios_xy, pliegue_sitio, citas: list[dict], pliegue_cita,
                    k: int, n: int = TOP_N) -> dict:
    """Validación por bloques de una especie. pliegue_sitio / pliegue_cita: pliegue de cada sitio / cita (-1 = fuera
    de la malla: la cita solo entrena). Lift = aciertos / esperados sumados sobre los pliegues informativos (media de
    los pliegues ponderada por los aciertos esperados)."""
    sitios_xy = np.asarray(sitios_xy, float).reshape(-1, 2)
    pliegue_sitio = np.asarray(pliegue_sitio); pliegue_cita = np.asarray(pliegue_cita)
    cal = np.array([calidad(s) for s in sitios]) if sitios else np.zeros(0)
    ids = np.array([s["id"] for s in sitios]) if sitios else np.zeros(0, int)
    t = {"n_eval": 0, "alcanzables": 0, "pliegues": 0, "afectados": 0, "aciertos_sin": 0, "aciertos_con": 0,
         "esperados": 0.0}
    for f in range(k):
        u = np.flatnonzero(pliegue_sitio == f)
        ev = [c for c, p in zip(citas, pliegue_cita) if p == f and evaluable(c)]
        if len(u) <= n or not ev:
            continue
        entrena = [c for c, p in zip(citas, pliegue_cita) if p != f]
        fac = np.array([factor(a) for a in asignar(sitios_xy[u], entrena)])
        exy = np.array([[c["x"], c["y"]] for c in ev])
        a = aciertos_top(cal[u], ids[u], sitios_xy[u], exy, n)
        b = aciertos_top(cal[u] * fac, ids[u], sitios_xy[u], exy, n)
        t["n_eval"] += len(ev); t["alcanzables"] += a["alcanzables"]; t["afectados"] += int((fac != 1).sum())
        t["aciertos_sin"] += a["aciertos"]; t["aciertos_con"] += b["aciertos"]; t["esperados"] += a["esperados"]
        t["pliegues"] += 1 if a["alcanzables"] else 0
    t["esperados"] = round(t["esperados"], 3)
    t["lift_sin"], t["lift_con"] = _lift(t["aciertos_sin"], t["esperados"]), _lift(t["aciertos_con"], t["esperados"])
    return t


def decidir(res: dict, min_obs: int) -> dict:
    """Región: suma de todas las especies (aciertos / esperados). Activo si hay ≥ min_obs citas alcanzables y el lift
    con factor ≥ sin factor; con menos citas no hay prueba y queda en solo etiqueta. Especies juzgadas por separado:
    las de ≥ min_obs citas alcanzables."""
    alc = sum(d["alcanzables"] for d in res.values())
    esp = sum(d["esperados"] for d in res.values())
    a = _lift(sum(d["aciertos_sin"] for d in res.values()), esp)
    b = _lift(sum(d["aciertos_con"] for d in res.values()), esp)
    juzgadas = sorted(e for e, d in res.items() if d["alcanzables"] >= min_obs)
    activo = alc >= min_obs and a is not None and b >= a
    motivo = ("sin_prueba" if alc < min_obs or a is None else "no_empeora" if activo else "empeora")
    return {"juzgadas": juzgadas, "alcanzables": alc, "lift_sin": a, "lift_con": b, "factor_citas": bool(activo),
            "motivo": motivo}


def anio_corte(citas: list[dict], fraccion: float = FRACCION_TEMPORAL) -> int | None:
    """Año a partir del cual quedan ~`fraccion` de las citas fechadas (las más recientes)."""
    anios = sorted(int(a) for c in citas if (a := anio(c.get("fecha"))))
    if len(anios) < 2:
        return None
    return anios[min(len(anios) - 1, int(len(anios) * (1 - fraccion)))]


def validar_temporal(sitios: list[dict], sitios_xy, citas: list[dict], corte: int, n: int = TOP_N) -> dict:
    """Complemento informativo: factor con las citas anteriores a `corte`; evaluación con las de `corte` en adelante
    sobre todos los sitios de la especie."""
    sitios_xy = np.asarray(sitios_xy, float).reshape(-1, 2)
    entrena = [c for c in citas if (a := anio(c.get("fecha"))) and int(a) < corte]
    ev = [c for c in citas if (a := anio(c.get("fecha"))) and int(a) >= corte and evaluable(c)]
    t = {"n_eval": len(ev), "alcanzables": 0, "afectados": 0, "aciertos_sin": 0, "aciertos_con": 0, "esperados": 0.0,
         "lift_sin": None, "lift_con": None}
    if len(sitios) <= n or not ev:
        return t
    cal = np.array([calidad(s) for s in sitios]); ids = np.array([s["id"] for s in sitios])
    fac = np.array([factor(a) for a in asignar(sitios_xy, entrena)])
    exy = np.array([[c["x"], c["y"]] for c in ev])
    a = aciertos_top(cal, ids, sitios_xy, exy, n); b = aciertos_top(cal * fac, ids, sitios_xy, exy, n)
    t.update(alcanzables=a["alcanzables"], afectados=int((fac != 1).sum()), aciertos_sin=a["aciertos"],
             aciertos_con=b["aciertos"], esperados=round(a["esperados"], 3))
    t["lift_sin"], t["lift_con"] = _lift(a["aciertos"], a["esperados"]), _lift(b["aciertos"], a["esperados"])
    return t


# ---------------------------------------------------------------- datos

def _a_xy(lon, lat):
    from pyproj import Transformer
    from .malla import CRS
    tr = Transformer.from_crs("EPSG:4326", CRS, always_xy=True)
    x, y = tr.transform(np.asarray(lon, float), np.asarray(lat, float))
    return np.column_stack([np.atleast_1d(x), np.atleast_1d(y)])


def cargar(ruta: Path) -> list[dict] | None:
    """Citas de citas.geojson con x, y en UTM; None si no existe."""
    if not Path(ruta).exists():
        return None
    feats = json.loads(Path(ruta).read_text()).get("features", [])
    props = [dict(f["properties"]) for f in feats
             if f.get("properties") and f["properties"].get("lat") is not None and f["properties"].get("lon") is not None]
    if not props:
        return []
    xy = _a_xy([p["lon"] for p in props], [p["lat"] for p in props])
    for p, (x, y) in zip(props, xy):
        p["x"], p["y"] = float(x), float(y)
    return props


def _pliegue_xy(malla, pliegue: np.ndarray, xy: np.ndarray) -> np.ndarray:
    if not len(xy):
        return np.zeros(0, int)
    cols = np.floor((xy[:, 0] - malla.x0) / malla.celda).astype(int)
    filas = np.floor((malla.y1 - xy[:, 1]) / malla.celda).astype(int)
    dentro = (cols >= 0) & (cols < malla.ancho) & (filas >= 0) & (filas < malla.alto)
    res = np.full(len(xy), -1)
    res[dentro] = pliegue[filas[dentro], cols[dentro]]
    return res


def anotar(region, datos: dict, malla=None, verbose: bool = True) -> dict:
    """Añade `citas` a los sitios de `datos` (sitios.json en memoria), valida el factor por bloques, fija
    `factor_citas` y escribe validacion_citas.{json,md} en region.out. Devuelve el resumen de la validación."""
    from .calibracion import ID_CITAS, MIN_OBS, PLIEGUES, pliegues_bloques, BLOQUE_VALIDACION_M, SEMILLA_PLIEGUES
    from .malla import Malla
    malla = malla or Malla.cargar(region.out / "malla.json")
    todas = cargar(region.out / "citas.geojson")
    for lista in datos["especies"].values():
        for s in lista:
            s.pop("citas", None)
    if todas is None:
        print(f"  WARNING: falta {region.out / 'citas.geojson'}: sitios sin citas y factor_citas = false", flush=True)
        datos["factor_citas"] = False
        return {}
    pliegue = pliegues_bloques(malla)
    corte = anio_corte(todas)
    res, temp, conteo = {}, {}, {}
    for esp, lista in datos["especies"].items():
        clave = ID_CITAS.get(esp, esp)
        citas = [c for c in todas if c.get("especie") == clave]
        if not lista:
            continue
        sxy = _a_xy([s["lon"] for s in lista], [s["lat"] for s in lista])
        for s, c in zip(lista, asignar(sxy, citas)):
            if c:
                s["citas"] = c
        conteo[esp] = {"punto": sum(1 for s in lista if s.get("citas", {}).get("nivel") == "punto"),
                       "paraje": sum(1 for s in lista if s.get("citas", {}).get("nivel") == "paraje"),
                       "sitios": len(lista), "citas": len(citas)}
        if not citas:
            continue
        cxy = np.array([[c["x"], c["y"]] for c in citas])
        res[esp] = validar_especie(lista, sxy, _pliegue_xy(malla, pliegue, sxy), citas,
                                   _pliegue_xy(malla, pliegue, cxy), PLIEGUES)
        if corte is not None:
            temp[esp] = validar_temporal(lista, sxy, citas, corte)
    dec = decidir(res, MIN_OBS)
    datos["factor_citas"] = dec["factor_citas"]
    resumen = {"region": region.id, "top_n": TOP_N, "radio_acierto_m": RADIO_ACIERTO_M, "factor": FACTOR,
               "bloque_m": BLOQUE_VALIDACION_M, "pliegues": PLIEGUES, "semilla": SEMILLA_PLIEGUES, "min_obs": MIN_OBS,
               "especies": res, "decision": dec, "sitios": conteo,
               "temporal": {"anio_corte": corte, "especies": temp, "decision_informativa": decidir(temp, MIN_OBS)}}
    region.out.mkdir(parents=True, exist_ok=True)
    (region.out / "validacion_citas.json").write_text(json.dumps(resumen, ensure_ascii=False, indent=1))
    (region.out / "validacion_citas.md").write_text(informe(resumen))
    if verbose:
        tp = sum(c["punto"] for c in conteo.values()); tq = sum(c["paraje"] for c in conteo.values())
        print(f"  citas en sitios: {tp} punto, {tq} paraje; lift sin {dec['lift_sin']} / con {dec['lift_con']} → "
              f"factor_citas {dec['factor_citas']}", flush=True)
    return resumen


def informe(r: dict) -> str:
    f = lambda x: "—" if x is None else x
    dec = r["decision"]
    L = [f"# Validación del factor «citado» del ranking — {r['region']}", "",
         "Generado por `setas_pipeline/citas_sitios.py` (lo llama `sitios.py`). Factor del ranking: "
         f"×{FACTOR['punto']} con citas de nivel punto, ×{FACTOR['paraje']} con solo paraje, ×1 sin citas.", "",
         "## Método (bloques espaciales, decide)", "",
         f"Bloques de {r['bloque_m'] / 1000:.0f} km en {r['pliegues']} pliegues (semilla {r['semilla']}), los de "
         "`calibracion.pliegues_bloques`. En cada pliegue el factor de cada sitio se calcula solo con las citas de los "
         "otros pliegues; se evalúan las citas del pliegue (precisión ≤ 1000 m o sin declarar; foros/literatura ≤ 100 m) "
         f"que tienen algún sitio del pliegue a ≤ {r['radio_acierto_m']:.0f} m («alcanzables»). Acierto = cita a ≤ "
         f"{r['radio_acierto_m']:.0f} m de alguno de los {r['top_n']} mejores sitios del pliegue; esperados = "
         f"alcanzables × {r['top_n']} / sitios del pliegue (top al azar). Lift = Σ aciertos / Σ esperados; 1 = azar. "
         f"Pliegues con ≤ {r['top_n']} sitios no informan. La región decide con la suma de especies y ≥ {r['min_obs']} "
         "citas alcanzables; con menos no hay prueba y queda en solo etiqueta. «Sitios con factor» = sitios evaluados "
         "cuyo factor ≠ 1 con las citas de entrenamiento (potencia de la prueba).",
         "", "| especie | citas evaluadas | alcanzables | pliegues | sitios con factor | aciertos sin / con | esperados "
         "| lift sin factor | lift con factor |", "|---|---|---|---|---|---|---|---|---|"]
    for e, d in r["especies"].items():
        L.append(f"| {e} | {d['n_eval']} | {d['alcanzables']} | {d['pliegues']} | {d['afectados']} | "
                 f"{d['aciertos_sin']} / {d['aciertos_con']} | {d['esperados']} | {f(d['lift_sin'])} | {f(d['lift_con'])} |")
    L += ["", f"**Región** ({dec['alcanzables']} citas alcanzables; especies con ≥ {r['min_obs']}: "
              f"{', '.join(dec['juzgadas']) or 'ninguna'}): lift sin factor {f(dec['lift_sin'])}, con factor "
              f"{f(dec['lift_con'])}.", "",
          "**Decisión:** " + {
              "no_empeora": "el factor no empeora el lift: `factor_citas = true` (la app aplica el factor).",
              "empeora": "el factor empeora el lift: `factor_citas = false` (la app solo enseña la etiqueta «Citado: …»).",
              "sin_prueba": f"menos de {r['min_obs']} citas alcanzables, no hay prueba de que no empeore: "
                            "`factor_citas = false` (la app solo enseña la etiqueta «Citado: …»)."}[dec["motivo"]], ""]
    t = r["temporal"]
    L += ["## Complemento temporal (informativo, no decide)", "",
          f"Factor con las citas anteriores a {f(t['anio_corte'])}; evaluación con las de {f(t['anio_corte'])} en "
          "adelante sobre todos los sitios de la especie (mismo lift). Mide si volver donde ya se citó ayuda a encontrar "
          "las citas posteriores (incluye el sesgo de observadores que repiten sitio).", "",
          "| especie | citas evaluadas | alcanzables | sitios con factor | aciertos sin / con | esperados | lift sin | lift con |",
          "|---|---|---|---|---|---|---|---|"]
    for e, d in t["especies"].items():
        L.append(f"| {e} | {d['n_eval']} | {d['alcanzables']} | {d['afectados']} | {d['aciertos_sin']} / "
                 f"{d['aciertos_con']} | {d['esperados']} | {f(d['lift_sin'])} | {f(d['lift_con'])} |")
    di = t["decision_informativa"]
    L += ["", f"Suma temporal: {di['alcanzables']} citas alcanzables; lift sin {f(di['lift_sin'])}, con {f(di['lift_con'])}.",
          "", "## Sitios con citas", "", "| especie | sitios | con citas (punto) | con citas (paraje) | citas de la especie |",
          "|---|---|---|---|---|"]
    for e, c in r["sitios"].items():
        L.append(f"| {e} | {c['sitios']} | {c['punto']} | {c['paraje']} | {c['citas']} |")
    L += ["", "Una cita dice que alguien vio la seta ahí; no dice que se pueda recoger ni consumir. Las citas sin "
              "licencia libre solo se enlazan y atribuyen."]
    return "\n".join(L) + "\n"


if __name__ == "__main__":
    from .region import region_cli
    reg = region_cli()
    ruta = reg.app / "sitios.json"
    d = json.loads(ruta.read_text())
    from .sitios import VERSION
    d["version"] = VERSION
    anotar(reg, d)
    ruta.write_text(json.dumps(d, ensure_ascii=False, separators=(",", ":")))
