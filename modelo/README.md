# Reconocedor offline (Fase 5)

Construye el paquete del reconocedor por cámara que la PWA descarga aparte (Ajustes → «Reconocedor sin
cobertura»). Decisiones y medidas: `docs/spikes/2026-10-13-reconocedor-offline.md`.

```bash
cd modelo
uv sync
(cd ../app && npm ci)            # el .wasm de onnxruntime-web sale de app/node_modules (versión fijada 1.20.1)
uv run python construir.py       # ~2 min en un M3; baja ~600 MB de pesos de Hugging Face la primera vez
```

- Modelo: BioCLIP (`imageomics/bioclip`, ViT-B/16, licencia **MIT**), revisión fijada en `construir.py`.
  Solo la torre de visión, en ONNX int8 cuantizando solo MatMul/Gemm (onnxruntime-web no tiene ConvInteger).
- Vocabulario (zero-shot, plantilla `a photo of <especie>.`): las 1.577 especies de DF20
  (`vocabulario/df20_especies.txt`, distractores europeos para que una seta ajena a la guía no se fuerce
  sobre una especie de la guía) + `vocabulario/extra.txt` (mediterráneas que faltan) + las especies de la guía (37). Tras ampliar el vocabulario basta `uv run python construir.py --solo-texto`
  (rehace texto, etiquetas y referencia con la misma torre de visión).
  `vocabulario/alias.json` une sinónimos (B. aestivalis → B. reticulatus, C. rachodes/brunneum → C. rhacodes,
  Collybia nuda → Lepista nuda, S. verrucosum → S. citrinum, T. claveryi → T. arenaria) y marca especies afines
  (L. vinosus, L. sanguifluus, L. semisanguifluus → L. deliciosus; A. vidua → A. verna; A. curtipes → gurumelo;
  T. leptoderma → criadilla; S. collinitus → S. bellinii; T. auratum, T. flavovirens → T. equestre;
  H. limacinus → H. latitabundus; M. conica, M. elata → colmenilla; G. gigas → G. esculenta; C. rivulosa → C. dealbata).
- Salida (no versionada): `pipeline/data/modelo/`, compartida por todas las regiones, y la clave `modelo` del
  `manifest.json` de cada región de `pipeline/data/regiones.json`. `--ajenas <fotos>` mide el coseno máximo de fotos
  reales sin setas para calibrar el umbral de «no reconocido» (`coseno_max_ajenas_reales`).
  `referencia.json` (versionado) guarda el top-5 de Python para las fotos de prueba y la estadística del
  coseno máximo con que se calibra «no reconocido».
- El modelo **solo propone candidatos**: nunca descarta nada. La capa de seguridad (`app/src/seguridad.ts`)
  mantiene en rojo las peligrosas de cada grupo morfológico hasta que las preguntas guiadas las excluyan.

Cita: Stevens et al., «BioCLIP: A Vision Foundation Model for the Tree of Life», CVPR 2024.
