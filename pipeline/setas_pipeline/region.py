"""Configuración por región (spec multi-región §3.1): pipeline/regiones/<id>.yaml → Region.
Opcionales: edificado (catastro_provincias), citas (centro, radio_km, sitios_csv) y, con capas de titularidad,
legal.titularidad y atribuciones.titularidad.

Rutas: pipeline/data/<region>/raw, pipeline/data/<region>/out (con out/app) y pipeline/data/_comun (GBIF).
"""
from __future__ import annotations
import argparse, copy
from dataclasses import dataclass, field
from pathlib import Path
import yaml

BASE = Path(__file__).resolve().parent.parent        # pipeline/
REGIONES = BASE / "regiones"
DATOS = BASE / "data"
FUENTES = BASE / "fuentes.yaml"
ESPECIES = BASE / "especies.yaml"
POR_DEFECTO = "marbella"

OBLIGATORIAS = ("id", "nombre", "etiqueta_origen", "origen", "zona", "osm_extractos", "capas", "especies",
                "legal", "atribuciones")
CLAVES_ZONA = ("radio_m", "paso_m", "max_s", "max_snap_m", "cierre_m", "osrm")
CLAVES_CCAA = ("id", "nombre", "norma", "cupo_kg_dia", "texto", "verificado", "fuente_url")
CLAVES_ATRIBUCION = ("idoneidad", "protegidos", "restricciones", "rutas", "respaldo_protegidos")
CAPAS_TITULARIDAD = ("montes_publicos", "cotos_caza", "pasos_publicos")
# Lista cerrada de la app (manifest-region.ts IDS_CCAA) y sus alias cortos (ALIAS_CCAA).
IDS_CCAA = ("andalucia", "comunitat_valenciana", "region_murcia", "castilla_la_mancha", "AND", "CV", "MUR", "CLM")


class RegionInvalida(ValueError):
    def __init__(self, ruta: Path, errores: list[str]):
        super().__init__(f"{ruta}: " + "; ".join(errores))
        self.errores = errores


def fusionar(base: dict, cambios: dict) -> dict:
    out = copy.deepcopy(base)
    for k, v in cambios.items():
        out[k] = fusionar(out[k], v) if isinstance(v, dict) and isinstance(out.get(k), dict) else copy.deepcopy(v)
    return out


@dataclass(frozen=True)
class Region:
    id: str
    nombre: str
    etiqueta_origen: str
    origen: tuple[float, float]          # lon, lat
    zona: dict
    osm_extractos: tuple[str, ...]
    capas: dict
    especies_activas: tuple[str, ...]
    especies_sin_habitat: tuple[str, ...]
    overrides_especies: dict
    legal: dict
    atribuciones: dict
    config: Path
    edificado: dict = field(default_factory=dict)       # edificado.py: catastro_provincias
    citas: dict = field(default_factory=dict)           # citas.py: centro, radio_km, sitios_csv
    datos: Path = DATOS

    @property
    def raw(self) -> Path:
        return self.datos / self.id / "raw"

    @property
    def out(self) -> Path:
        return self.datos / self.id / "out"

    @property
    def app(self) -> Path:
        return self.out / "app"

    @property
    def respaldo(self) -> Path:
        return self.out / "respaldo"

    @property
    def comun(self) -> Path:
        return self.datos / "_comun"

    def perfiles(self, catalogo: dict, incluir_sin_habitat: bool = False) -> dict:
        """Perfiles de la región en el orden del catálogo (especies.yaml), con overrides_especies fusionados."""
        validas = set(self.especies_activas) | (set(self.especies_sin_habitat) if incluir_sin_habitat else set())
        return {k: fusionar(v, self.overrides_especies.get(k, {})) for k, v in catalogo.items() if k in validas}


def _numero(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _lista(v) -> list:
    """Lista de la YAML: un valor vacío (None) es una lista vacía; cualquier otro tipo no es lista."""
    return [] if v is None else v


def validar(d: dict, ruta: Path, catalogo: dict) -> list[str]:
    """Errores de la config de una región (lista vacía = válida). Nunca lanza por tipos raros o nulos."""
    from .adaptadores import REGISTRO
    if not isinstance(d, dict):
        return ["la config no es un mapa YAML"]
    e = [f"falta la clave '{k}'" for k in OBLIGATORIAS if k not in d]
    if e:
        return e
    for k in ("zona", "capas", "especies", "legal", "atribuciones"):
        if not isinstance(d[k], dict):
            e.append(f"'{k}' debe ser un mapa")
    if e:
        return e
    if d["id"] != Path(ruta).stem:
        e.append(f"id '{d['id']}' no coincide con el archivo '{Path(ruta).stem}'")
    o = d["origen"]
    if not (isinstance(o, dict) and _numero(o.get("lon")) and _numero(o.get("lat"))
            and -180 <= o["lon"] <= 180 and -90 <= o["lat"] <= 90):
        e.append("origen debe ser {lon, lat} en grados")
    e += [f"falta zona.{k}" for k in CLAVES_ZONA if k not in d["zona"]]
    x = d["osm_extractos"]
    if not (isinstance(x, list) and x and all(isinstance(u, str) and u.startswith("https://") for u in x)):
        e.append("osm_extractos debe ser una lista no vacía de URL https")
    for tipo, fuentes in d["capas"].items():
        if tipo not in REGISTRO:
            e.append(f"capa desconocida '{tipo}' (conocidas: {sorted(REGISTRO)})")
            continue
        if not isinstance(fuentes, list) or not all(isinstance(f, dict) for f in fuentes):
            e.append(f"capas.{tipo} debe ser una lista de fuentes {{adaptador: …}}")
            continue
        for f in fuentes:
            if f.get("adaptador") not in REGISTRO[tipo]:
                e.append(f"capas.{tipo}: adaptador desconocido '{f.get('adaptador')}' (conocidos: {sorted(REGISTRO[tipo])})")
    act, sin = _lista(d["especies"].get("activas")), _lista(d["especies"].get("sin_habitat"))
    if not isinstance(act, list) or not isinstance(sin, list):
        e.append("especies.activas y especies.sin_habitat deben ser listas")
        act, sin = (act if isinstance(act, list) else []), (sin if isinstance(sin, list) else [])
    elif not act:
        e.append("especies.activas está vacía")
    for k in [*act, *sin]:
        if k not in catalogo:
            e.append(f"especie '{k}' no está en especies.yaml")
    for k in set(act) & set(sin):
        e.append(f"especie '{k}' a la vez en activas y sin_habitat")
    overrides = d.get("overrides_especies") or {}
    if not isinstance(overrides, dict):
        e.append("overrides_especies debe ser un mapa")
        overrides = {}
    for k in overrides:
        if k not in set(act) | set(sin):
            e.append(f"overrides_especies.{k}: la especie no está en la región")
    legal = d["legal"]
    for k in ("aviso", "tipos_restriccion", "ccaa"):
        if k not in legal:
            e.append(f"falta legal.{k}")
    ccaa = legal.get("ccaa")
    if not isinstance(ccaa, list) or not ccaa:
        e.append("legal.ccaa debe ser una lista no vacía")
        ccaa = []
    for i, c in enumerate(ccaa):
        if not isinstance(c, dict):
            e.append(f"legal.ccaa[{i}] debe ser un mapa")
            continue
        e += [f"legal.ccaa[{i}]: falta {k}" for k in CLAVES_CCAA if k not in c]
        if "id" in c and c["id"] not in IDS_CCAA:
            e.append(f"legal.ccaa[{i}].id '{c['id']}' no está en la lista cerrada de la app {IDS_CCAA}")
        if "verificado" in c and not isinstance(c["verificado"], bool):
            e.append(f"legal.ccaa[{i}].verificado debe ser true/false")
    # Cada tipo de restricción que declara una fuente necesita su texto (si no, la app pintaría un recinto sin
    # explicación). Los tipos que salen de los datos (p. ej. PORN) no se pueden comprobar aquí.
    textos = legal.get("tipos_restriccion") if isinstance(legal.get("tipos_restriccion"), dict) else {}
    fuentes_r = d["capas"].get("restricciones")
    for f in fuentes_r if isinstance(fuentes_r, list) else []:
        if isinstance(f, dict) and "tipo" in f and f["tipo"] not in textos:
            e.append(f"capas.restricciones: tipo '{f['tipo']}' sin texto en legal.tipos_restriccion")
    e += [f"falta atribuciones.{k}" for k in CLAVES_ATRIBUCION if k not in d["atribuciones"]]
    # Titularidad (titularidad.py): con alguna de sus capas, hacen falta sus textos, aviso, norma y atribución.
    if any(t in d["capas"] for t in CAPAS_TITULARIDAD):
        from .titularidad import CLASES
        t = legal.get("titularidad")
        if not isinstance(t, dict):
            e.append("falta legal.titularidad (textos, aviso, norma)")
        else:
            e += [f"falta legal.titularidad.{k}" for k in ("textos", "aviso", "norma") if k not in t]
            textos = t.get("textos") if isinstance(t.get("textos"), dict) else {}
            e += [f"falta legal.titularidad.textos.{c}" for c in CLASES if c not in textos]
        if "titularidad" not in d["atribuciones"]:
            e.append("falta atribuciones.titularidad")
    for k in ("edificado", "citas"):
        if k in d and not isinstance(d[k], dict):
            e.append(f"'{k}' debe ser un mapa")
    ed = d.get("edificado") if isinstance(d.get("edificado"), dict) else {}
    prov = ed.get("catastro_provincias", [])
    if not (isinstance(prov, list) and all(isinstance(p, str) and len(p) == 2 and p.isdigit() for p in prov)):
        e.append("edificado.catastro_provincias debe ser una lista de códigos INE de provincia ('29', …)")
    elif prov:
        # la máscara de edificado (huellas Catastro BU) entra en la idoneidad: hay que citar al Catastro en su
        # atribución y en la del control del mapa (`mapa`), si la región la declara
        for k in ("idoneidad", "mapa"):
            v = d["atribuciones"].get(k)
            if isinstance(v, str) and "catastro" not in v.lower():
                e.append(f"atribuciones.{k} debe citar al Catastro (la máscara de edificado usa Catastro BU)")
    ci = d.get("citas") if isinstance(d.get("citas"), dict) else {}
    if ci:
        c = ci.get("centro")
        if not (isinstance(c, dict) and _numero(c.get("lon")) and _numero(c.get("lat"))):
            e.append("citas.centro debe ser {lon, lat} en grados")
        if not (_numero(ci.get("radio_km")) and ci["radio_km"] > 0):
            e.append("citas.radio_km debe ser un número > 0")
        tx = ci.get("taxa", {})
        if not (isinstance(tx, dict) and all(isinstance(v, list) and v and all(isinstance(n, str) for n in v)
                                             for v in tx.values())):
            e.append("citas.taxa debe ser un mapa {especie: [nombres científicos]}")
    return e


def cargar_region(id: str = POR_DEFECTO, regiones: Path = REGIONES, datos: Path = DATOS,
                  especies: Path = ESPECIES) -> Region:
    from .idoneidad import cargar_perfiles
    ruta = Path(regiones) / f"{id}.yaml"
    d = yaml.safe_load(ruta.read_text())
    errores = validar(d, ruta, cargar_perfiles(especies))
    if errores:
        raise RegionInvalida(ruta, errores)
    return Region(id=d["id"], nombre=d["nombre"], etiqueta_origen=d["etiqueta_origen"],
                  origen=(float(d["origen"]["lon"]), float(d["origen"]["lat"])), zona=d["zona"],
                  osm_extractos=tuple(d["osm_extractos"]), capas=d["capas"],
                  especies_activas=tuple(d["especies"]["activas"]),
                  especies_sin_habitat=tuple(d["especies"].get("sin_habitat") or ()),
                  overrides_especies=d.get("overrides_especies") or {}, legal=d["legal"],
                  atribuciones=d["atribuciones"], config=ruta, datos=Path(datos),
                  edificado=d.get("edificado") or {}, citas=d.get("citas") or {})


def listar_regiones(regiones: Path = REGIONES) -> list[str]:
    return sorted(p.stem for p in Path(regiones).glob("*.yaml"))


def argumento_region(ap: argparse.ArgumentParser) -> None:
    ap.add_argument("--region", default=POR_DEFECTO, choices=listar_regiones(),
                    help=f"región (pipeline/regiones/<id>.yaml); por defecto {POR_DEFECTO}")


def region_cli(argv=None) -> Region:
    ap = argparse.ArgumentParser()
    argumento_region(ap)
    return cargar_region(ap.parse_args(argv).region)
