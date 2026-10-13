#!/usr/bin/env python3
"""Valida guia/especies.json.

Comprueba: esquema y tipos, grupos, ids únicos en snake_case, simetría de
no_confundir_con, que cada foto exista y tenga licencia libre permitida
(CC0, CC BY, CC BY-SA o dominio público; nunca NC ni ND), que CREDITOS.md
cite cada foto y que ningún texto contenga frases prohibidas.

Uso: python3 guia/validar.py   (sale con código 1 si hay errores)
"""
import json
import re
import sys
from pathlib import Path

GUIA = Path(__file__).resolve().parent
DATA = GUIA / "especies.json"
CREDITOS = GUIA / "CREDITOS.md"

GRUPOS = {"apreciada", "comestible_menor", "toxica", "mortal"}
COMESTIBLES = {"apreciada", "comestible_menor"}
PELIGROSAS = {"toxica", "mortal"}
TEXTO = ["nombre_cientifico", "sombrero", "himenio", "pie", "volva", "anillo",
         "carne_y_corte", "olor_sabor", "esporada", "habitat", "temporada"]
LISTAS = ["nombres_comunes", "rasgos_clave", "no_confundir_con", "fotos", "fuentes"]
PROHIBIDO = re.compile(r"se puede comer|apta para el consumo|comestible segur|sin peligro", re.I)
LIC_OK = re.compile(r"^(CC0( 1\.0)?|CC BY(-SA)? \d\.\d|Public domain|Dominio público)$", re.I)
LIC_MAL = re.compile(r"\b(NC|ND)\b", re.I)
SNAKE = re.compile(r"^[a-z][a-z0-9_]*$")

errores, avisos = [], []


def err(m):
    errores.append(m)


def textos(obj, ruta=""):
    if isinstance(obj, str):
        yield ruta, obj
    elif isinstance(obj, list):
        for i, x in enumerate(obj):
            yield from textos(x, f"{ruta}[{i}]")
    elif isinstance(obj, dict):
        for k, v in obj.items():
            yield from textos(v, f"{ruta}.{k}" if ruta else k)


def main():
    try:
        especies = json.loads(DATA.read_text(encoding="utf-8"))
    except Exception as e:  # noqa: BLE001
        print(f"ERROR: no se puede leer {DATA}: {e}")
        return 1
    if not isinstance(especies, list) or not especies:
        print("ERROR: especies.json debe ser una lista no vacía")
        return 1

    por_id = {}
    for i, e in enumerate(especies):
        eid = e.get("id", f"#{i}")
        if not isinstance(e.get("id"), str) or not SNAKE.match(e["id"]):
            err(f"{eid}: id ausente o no snake_case")
        if eid in por_id:
            err(f"{eid}: id duplicado")
        por_id[eid] = e
        if e.get("grupo") not in GRUPOS:
            err(f"{eid}: grupo inválido {e.get('grupo')!r}")
        for k in TEXTO:
            if not isinstance(e.get(k), str) or not e[k].strip():
                err(f"{eid}: campo de texto '{k}' ausente o vacío")
        for k in LISTAS:
            if not isinstance(e.get(k), list):
                err(f"{eid}: campo '{k}' debe ser lista")
        if e.get("grupo") in PELIGROSAS and not str(e.get("toxicidad_nota", "")).strip():
            err(f"{eid}: falta toxicidad_nota en especie tóxica/mortal")
        if "toxicidad_nota" in e and not isinstance(e["toxicidad_nota"], str):
            err(f"{eid}: toxicidad_nota debe ser texto")
        n_rasgos = len(e.get("rasgos_clave") or [])
        if not 3 <= n_rasgos <= 5:
            err(f"{eid}: rasgos_clave debe tener 3-5 elementos (tiene {n_rasgos})")
        if not e.get("fuentes"):
            err(f"{eid}: sin fuentes")
        for f in e.get("fuentes") or []:
            if not (isinstance(f, dict) and f.get("titulo") and str(f.get("url", "")).startswith("http")):
                err(f"{eid}: fuente mal formada {f!r}")
        fotos = e.get("fotos") or []
        if not fotos:
            err(f"{eid}: sin fotos")
        elif not 2 <= len(fotos) <= 3:
            avisos.append(f"{eid}: {len(fotos)} fotos (se esperan 2-3)")
        for f in fotos:
            for k in ("archivo", "autor", "licencia", "url_fuente"):
                if not (isinstance(f, dict) and str(f.get(k, "")).strip()):
                    err(f"{eid}: foto sin '{k}': {f!r}")
            if not isinstance(f, dict):
                continue
            lic = str(f.get("licencia", ""))
            if LIC_MAL.search(lic) or not LIC_OK.match(lic):
                err(f"{eid}: licencia no permitida {lic!r} en {f.get('archivo')}")
            if not (GUIA / str(f.get("archivo", ""))).is_file():
                err(f"{eid}: no existe el archivo {f.get('archivo')}")
        for ruta, t in textos(e):
            if PROHIBIDO.search(t):
                err(f"{eid}: frase prohibida en {ruta}: {t!r}")

    # simetría y referencias de no_confundir_con
    for eid, e in por_id.items():
        for c in e.get("no_confundir_con") or []:
            cid = c.get("id") if isinstance(c, dict) else None
            if cid not in por_id:
                err(f"{eid}: no_confundir_con apunta a id inexistente {cid!r}")
                continue
            if cid == eid:
                err(f"{eid}: se lista a sí misma en no_confundir_con")
            if not c.get("diferencias"):
                err(f"{eid}->{cid}: sin diferencias")
            vuelta = [x.get("id") for x in por_id[cid].get("no_confundir_con") or []]
            if eid not in vuelta:
                err(f"asimetría: {eid} lista a {cid}, pero {cid} no lista a {eid}")

    # cada comestible debería tener al menos un parecido tóxico/mortal
    for eid, e in por_id.items():
        if e.get("grupo") in COMESTIBLES:
            peligrosos = [c["id"] for c in e.get("no_confundir_con") or []
                          if por_id.get(c.get("id"), {}).get("grupo") in PELIGROSAS]
            if not peligrosos:
                avisos.append(f"{eid}: comestible sin parecido tóxico/mortal enlazado")

    # créditos
    if CREDITOS.is_file():
        cred = CREDITOS.read_text(encoding="utf-8")
        for e in especies:
            for f in e.get("fotos") or []:
                if isinstance(f, dict) and f.get("archivo") and f["archivo"] not in cred:
                    err(f"CREDITOS.md no cita {f['archivo']}")
        if PROHIBIDO.search(cred):
            err("CREDITOS.md contiene una frase prohibida")
    else:
        err("falta CREDITOS.md")

    grupos = {}
    for e in especies:
        grupos[e.get("grupo")] = grupos.get(e.get("grupo"), 0) + 1
    n_fotos = sum(len(e.get("fotos") or []) for e in especies)
    print(f"Especies: {len(especies)}  {grupos}")
    print(f"Fotos: {n_fotos}")
    for a in avisos:
        print(f"AVISO: {a}")
    for x in errores:
        print(f"ERROR: {x}")
    print("OK" if not errores else f"FALLO: {len(errores)} errores")
    return 1 if errores else 0


if __name__ == "__main__":
    sys.exit(main())
