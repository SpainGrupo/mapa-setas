"""Avisos de datos de una región (spec multi-región §6): fuentes caídas, capas que salen NODATA… Los escribe cada
paso en data/<region>/out/avisos.json ({paso: [textos]}) y exportar.py los publica en manifest.avisos (Ajustes)."""
from __future__ import annotations
import json
from pathlib import Path

ARCHIVO = "avisos.json"


def registrar(out: Path, paso: str, textos: list[str]) -> None:
    """Sustituye los avisos de `paso` (lista vacía = el paso ya no tiene avisos)."""
    ruta = Path(out) / ARCHIVO
    d = json.loads(ruta.read_text()) if ruta.exists() else {}
    if textos:
        d[paso] = list(textos)
    else:
        d.pop(paso, None)
    Path(out).mkdir(parents=True, exist_ok=True)
    ruta.write_text(json.dumps(d, ensure_ascii=False, indent=1))


def leer(out: Path) -> list[str]:
    """Todos los avisos, en el orden de los pasos que los escribieron."""
    ruta = Path(out) / ARCHIVO
    if not ruta.exists():
        return []
    return [t for textos in json.loads(ruta.read_text()).values() for t in textos]
