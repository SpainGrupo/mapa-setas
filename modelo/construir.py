"""Construye el reconocedor offline de la PWA (spec §8.1, spike docs/spikes/2026-10-13-reconocedor-offline.md).

    cd modelo && uv run python construir.py            # todo
    uv run python construir.py --solo-paquete          # solo rehace paquete.json y el manifest
    uv run python construir.py --solo-texto            # vocabulario nuevo: rehace texto_f16.bin, etiquetas.json y
                                                       # referencia.json con la misma torre de visión ya exportada
    uv run python construir.py --solo-texto --ajenas <fotos…>   # y calibra «no reconocido» con fotos sin setas

Salida en pipeline/data/modelo/ (no versionada; compartida por todas las regiones desde la fase D1):
  vision_int8.onnx            torre de visión de BioCLIP (ViT-B/16), int8 solo en MatMul/Gemm (onnxruntime-web
                              no implementa ConvInteger), entrada [1,3,224,224] → embedding L2-normalizado [1,512]
  texto_f16.bin               embeddings de texto («a photo of <especie>.») N×512 en float16 little-endian
  etiquetas.json              etiquetas, id de la guía (sinónimos y afines), preproceso, logit_scale, versión de ORT
  ort-wasm-simd-threaded.wasm binario de onnxruntime-web copiado de app/node_modules (misma versión que el .mjs
                              que empaqueta Vite; se comprueba)
  paquete.json                lista de archivos y bytes para la descarga opcional a OPFS
y añade la clave `modelo` al manifest.json de cada región de pipeline/data/regiones.json (descarga aparte, no entra
en total_bytes de los mapas).

Además escribe modelo/referencia.json (versionado): top-5 en Python de las fotos de prueba de la guía, para
comparar con el navegador en el e2e.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
REPO = RAIZ.parent
DATOS = REPO / "pipeline/data"
SALIDA = DATOS / "modelo"                                   # compartido (fase D1); antes, data/marbella/out/app/modelo


def manifests() -> list[Path]:
    """manifest.json de cada región del índice data/regiones.json (todas llevan el mismo modelo)."""
    indice = DATOS / "regiones.json"
    ids = [r["id"] for r in json.loads(indice.read_text())] if indice.exists() else []
    return [DATOS / i / "out/app/manifest.json" for i in ids]
ORT_APP = REPO / "app/node_modules/onnxruntime-web"
ORT_VERSION = "1.20.1"
HF_REPO = "imageomics/bioclip"
HF_REVISION = "ce901ab3c6a913f9e9ef94ce6d27761069f4f01c"  # snapshot usado en el spike (2026-10-13)
PLANTILLA = "a photo of {}."
FOTOS_PRUEBA = ["amanita_caesarea_1.jpg", "amanita_phalloides_1.jpg"]


def binomio(nombre: str) -> str:
    return " ".join(nombre.split()[:2])


def vocabulario() -> list[dict]:
    """Etiquetas = DF20 (1.577 especies europeas, distractores) + extras mediterráneas + especies de la guía."""
    guia = json.loads((REPO / "guia/especies.json").read_text())
    alias = json.loads((RAIZ / "vocabulario/alias.json").read_text())
    leer = lambda p: [l.strip() for l in p.read_text().splitlines() if l.strip() and not l.startswith("#")]
    nombres = set(leer(RAIZ / "vocabulario/df20_especies.txt")) | set(leer(RAIZ / "vocabulario/extra.txt"))
    ids: dict[str, tuple[str, str]] = {}
    for f in guia:
        ids[binomio(f["nombre_cientifico"])] = (f["id"], "guia")
    for n, g in alias["sinonimo"].items():
        ids[n] = (g, "sinonimo")
    for n, g in alias["afin"].items():
        ids[n] = (g, "afin")
    nombres |= set(ids)
    validos = {f["id"] for f in guia}
    for n, (g, _) in ids.items():
        if g not in validos:
            sys.exit(f"alias.json: {n} → {g} no es un id de la guía")
    salida = []
    for n in sorted(nombres):
        e = {"n": n}
        if n in ids:
            e["g"], e["t"] = ids[n]
        salida.append(e)
    return salida


def version_ort() -> Path:
    pj = json.loads((ORT_APP / "package.json").read_text())
    if pj["version"] != ORT_VERSION:
        sys.exit(f"onnxruntime-web en app/node_modules es {pj['version']}, se espera {ORT_VERSION} (npm ci en app/)")
    return ORT_APP / "dist/ort-wasm-simd-threaded.wasm"


def construir(solo_texto: bool = False, ajenas: list[Path] | None = None):
    import numpy as np
    import onnx
    import open_clip
    import torch
    from onnxruntime.quantization import QuantType, quantize_dynamic

    wasm = version_ort()
    SALIDA.mkdir(parents=True, exist_ok=True)
    i8 = SALIDA / "vision_int8.onnx"
    if solo_texto and not i8.exists():
        sys.exit(f"--solo-texto necesita {i8} (ejecuta construir.py sin opciones)")
    tmp = RAIZ / ".tmp"
    tmp.mkdir(exist_ok=True)

    from huggingface_hub import hf_hub_download

    # Revisión fijada: se baja el snapshot exacto y se carga como ViT-B-16 (la config de BioCLIP es la estándar).
    pesos = hf_hub_download(HF_REPO, "open_clip_pytorch_model.bin", revision=HF_REVISION)
    cfg = json.loads(Path(hf_hub_download(HF_REPO, "open_clip_config.json", revision=HF_REVISION)).read_text())
    model, _, preprocess = open_clip.create_model_and_transforms(
        "ViT-B-16", pretrained=pesos, image_mean=cfg["preprocess_cfg"]["mean"], image_std=cfg["preprocess_cfg"]["std"])
    tok = open_clip.get_tokenizer("ViT-B-16")
    model.eval()
    print("preproceso:", preprocess)
    norm = [t for t in preprocess.transforms if t.__class__.__name__ == "Normalize"][0]
    tam = 224

    etiquetas = vocabulario()
    with torch.no_grad():
        trozos = []
        for i in range(0, len(etiquetas), 256):
            t = model.encode_text(tok([PLANTILLA.format(e["n"]) for e in etiquetas[i:i + 256]]))
            trozos.append(t / t.norm(dim=-1, keepdim=True))
        texto = torch.cat(trozos).numpy().astype("<f2")
    (SALIDA / "texto_f16.bin").write_bytes(texto.tobytes())
    print(f"texto: {len(etiquetas)} etiquetas, {texto.nbytes / 1e6:.2f} MB")

    class Vision(torch.nn.Module):
        def __init__(s, m):
            super().__init__()
            s.m = m

        def forward(s, x):
            f = s.m.encode_image(x)
            return f / f.norm(dim=-1, keepdim=True)

    if not solo_texto:
        f32 = tmp / "vision_fp32.onnx"
        torch.onnx.export(Vision(model).eval(), torch.randn(1, 3, tam, tam), str(f32), input_names=["input"],
                          output_names=["emb"], opset_version=17, dynamo=False)
        onnx.checker.check_model(str(f32))
        quantize_dynamic(str(f32), str(i8), weight_type=QuantType.QInt8, op_types_to_quantize=["MatMul", "Gemm"],
                         per_channel=True)
        tipos = {n.op_type for n in onnx.load(str(i8)).graph.node}
        if "ConvInteger" in tipos:
            sys.exit("el modelo int8 contiene ConvInteger (no soportado por onnxruntime-web)")
        print(f"visión int8: {i8.stat().st_size / 1e6:.1f} MB")
        shutil.copyfile(wasm, SALIDA / wasm.name)
    else:
        print(f"visión int8: se conserva {i8.name} ({i8.stat().st_size / 1e6:.1f} MB)")

    meta = {
        "modelo": f"{HF_REPO} (ViT-B/16), MIT",
        "revision": HF_REVISION,
        "ort_version": ORT_VERSION,
        "plantilla": PLANTILLA,
        "dim": int(texto.shape[1]),
        "logit_scale": float(model.logit_scale.exp()),
        "preproceso": {"tam": tam, "media": [float(x) for x in norm.mean], "desv": [float(x) for x in norm.std],
                       "redimensionar": "lado corto a 224 (bicúbico) y recorte central"},
        "etiquetas": etiquetas,
    }
    (SALIDA / "etiquetas.json").write_text(json.dumps(meta, ensure_ascii=False, separators=(",", ":")))
    referencia(i8, preprocess, texto, meta, ajenas or [])
    shutil.rmtree(tmp, ignore_errors=True)


def referencia(onnx_path, preprocess, texto, meta, ajenas_reales: list[Path] = ()):
    """Top-5 en Python (ORT CPU) de las fotos de prueba + estadística de coseno máximo (calibrar «no reconocido»)."""
    import numpy as np
    import onnxruntime as ort
    from PIL import Image

    s = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    T = texto.astype(np.float32)
    nombres = [e["n"] for e in meta["etiquetas"]]

    def emb(img):
        return s.run(None, {"input": preprocess(img.convert("RGB"))[None].numpy()})[0][0]

    def top5(e):
        cos = T @ e
        lg = meta["logit_scale"] * cos
        p = np.exp(lg - lg.max()); p /= p.sum()
        idx = np.argsort(-cos)[:5]
        return [{"n": nombres[i], "cos": round(float(cos[i]), 4), "p": round(float(p[i]), 4)} for i in idx]

    ref = {"fotos": {}}
    for f in FOTOS_PRUEBA:
        ref["fotos"][f] = top5(emb(Image.open(REPO / "guia/fotos" / f)))
        print(f, [(t["n"], t["cos"]) for t in ref["fotos"][f]])
    maximos = sorted(float((T @ emb(Image.open(p))).max()) for p in sorted((REPO / "guia/fotos").glob("*.jpg")))
    rng = np.random.default_rng(0)
    ajenas = {
        "ruido": Image.fromarray(rng.integers(0, 255, (300, 300, 3), dtype=np.uint8)),
        "gris": Image.new("RGB", (300, 300), (128, 128, 128)),
        "azul": Image.new("RGB", (300, 300), (40, 90, 200)),
    }
    ref["coseno_max_fotos_guia"] = {"min": round(maximos[0], 4), "p05": round(maximos[len(maximos) // 20], 4),
                                    "mediana": round(maximos[len(maximos) // 2], 4), "n": len(maximos)}
    ref["coseno_max_ajenas"] = {k: round(float((T @ emb(v)).max()), 4) for k, v in ajenas.items()}
    previa = json.loads((RAIZ / "referencia.json").read_text()) if (RAIZ / "referencia.json").exists() else {}
    if ajenas_reales:
        m = sorted(float((T @ emb(Image.open(p))).max()) for p in ajenas_reales)
        ref["coseno_max_ajenas_reales"] = {
            "n": len(m), "max": round(m[-1], 4), "p95": round(m[min(len(m) - 1, int(len(m) * 0.95))], 4),
            "nota": "fotos locales sin setas (paisajes, piscinas, jardines, interiores); no versionadas"}
    elif "coseno_max_ajenas_reales" in previa:
        ref["coseno_max_ajenas_reales"] = previa["coseno_max_ajenas_reales"]
    print("coseno máx fotos guía:", ref["coseno_max_fotos_guia"], "ajenas:", ref["coseno_max_ajenas"],
          "ajenas reales:", ref.get("coseno_max_ajenas_reales"))
    (RAIZ / "referencia.json").write_text(json.dumps(ref, ensure_ascii=False, indent=1) + "\n")


def paquete():
    archivos = []
    for n in ["vision_int8.onnx", "texto_f16.bin", "etiquetas.json", "ort-wasm-simd-threaded.wasm"]:
        p = SALIDA / n
        if not p.exists():
            sys.exit(f"falta {p}")
        archivos.append({"nombre": n, "bytes": p.stat().st_size})
    h = hashlib.sha256()
    for a in archivos:
        h.update((SALIDA / a["nombre"]).read_bytes())
    meta = json.loads((SALIDA / "etiquetas.json").read_text())
    paq = {"version": h.hexdigest()[:16], "ort_version": meta["ort_version"], "etiquetas": len(meta["etiquetas"]),
           "dir": "modelo/", "archivos": archivos, "total_bytes": sum(a["bytes"] for a in archivos)}
    (SALIDA / "paquete.json").write_text(json.dumps(paq, indent=1))
    rutas = manifests()
    for ruta in rutas:
        if ruta.exists():
            m = json.loads(ruta.read_text())
            m["modelo"] = paq
            ruta.write_text(json.dumps(m, ensure_ascii=False, indent=1))
            print(f"{ruta.relative_to(DATOS)}: clave «modelo» actualizada")
        else:
            print(f"aviso: no existe {ruta} (ejecuta el pipeline); el paquete se añadirá al exportar")
    if not rutas:
        print("aviso: no hay pipeline/data/regiones.json; el paquete se añadirá al exportar")
    print(f"paquete {paq['version']}: {paq['total_bytes'] / 1e6:.1f} MB")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--solo-paquete", action="store_true")
    ap.add_argument("--solo-texto", action="store_true")
    ap.add_argument("--ajenas", nargs="*", type=Path, default=[],
                    help="fotos reales sin setas para calibrar «no reconocido» (solo se guardan n, máx y p95)")
    a = ap.parse_args()
    if not a.solo_paquete:
        construir(solo_texto=a.solo_texto, ajenas=a.ajenas)
    paquete()
