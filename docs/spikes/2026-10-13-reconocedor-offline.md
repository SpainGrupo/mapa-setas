# Spike: reconocedor de setas offline en el navegador (spec §8.1)

Fecha: 2026-10-13. Material desechable en `scratchpad/spike_modelo/` (scripts, ONNX, fotos, salidas `out*_*.txt`).

## Veredicto: GO CON LÍMITES

- **Modelo elegido: BioCLIP (ViT-B/16, `imageomics/bioclip`) en zero-shot**, solo la torre de visión en ONNX int8 (cuantizadas solo MatMul/Gemm) + embeddings de texto precalculados de nuestra lista de especies.
- Licencia de los pesos: **MIT**. Tamaño: **89,6 MB** de modelo + **1,6 MB** de embeddings (1.584 nombres en fp16).
- Latencia en onnxruntime-web 1.20.1 (wasm, Chromium headless, Apple M3): **0,31–0,38 s**. Con la CPU frenada ×4 (un móvil medio) es ~1,1 s y con ×6, ~1,7 s. La carga de la sesión tarda de 0,2 a 1,3 s.
- Paridad navegador/Python verificada: mismo top-5 y coseno 0,988 en el embedding.
- Ventaja decisiva: es de **vocabulario abierto**. Las especies mediterráneas que faltan en los datos daneses se añaden escribiendo su nombre, sin reentrenar. Es la única opción con licencia permisiva.
- **Límites:** solo sirve para proponer candidatos. No sirve para descartar nada: falló con *A. verna* en las dos fotos y con *A. phalloides* en una foto real de campo. La confianza no está calibrada: hay errores con p = 0,99–1,00 en todos los modelos.
- Alternativa ligera: DF20 MobileNetV2 int8, 4,5 MB, 44 ms (148 ms frenada ×4). Licencia CC-BY-NC/solo investigación, sin las 4 especies mediterráneas y más floja en fotos españolas.

## 1. Candidatos verificados (HF API, model cards, GitHub, metadatos descargados)

| Modelo | Pesos | Datos | Arquitectura / entrada | Clases | Benchmark del autor |
|---|---|---|---|---|---|
| BVRA `mobilenetv2_100.in1k_ft_df20_299` | CC-BY-NC-4.0 | DF20: "non-commercial research purposes only" (README) | MobileNetV2 4,3M / 299 | 1.604 | DF24 top1 66,1 / top3 82,2 |
| BVRA `tf_efficientnet_b0.in1k_ft_df20_224` | CC-BY-NC-4.0 | ídem | EffNet-B0 6,1M / 224 | 1.604 | DF24 (224) 64,6 / 81,2 |
| BVRA `tf_efficientnet_b3.in1k_ft_fungitastic_384` | CC-BY-NC-4.0 | FungiTastic (Atlas danés, 99 % DK) | EffNet-B3 / 384 | 2.829 | DF24 (384) 72,5 / 86,6 |
| BVRA ViT-L, SE-ResNeXt101 y otros (~80 repos) | CC-BY-NC-4.0 | ídem | 80–1.200 MB | 1.604/2.829 | hasta 78,8 top1; demasiado grandes |
| `imageomics/bioclip` | **MIT** | TreeOfLife-10M (iNat21+EOL+BIOSCAN, licencias por imagen) | ViT-B/16 / 224, zero-shot | abierto | Fungi (Meta-Album) zero-shot 40,7 top1 |
| `imageomics/bioclip-2` | MIT | TreeOfLife-200M | ViT-L, 1,7 GB | abierto | descartado por tamaño |
| timm `*_inat21` (EVA02-L, ViT-L, ConvNeXt-L) | CC-BY-NC-4.0 | iNat21 | 1,25 GB | 10.000 | descartados por tamaño |

DF20 tiene 1.604 clases (la CSV "DanishFungi2024" usa el mismo label set) y FungiTastic tiene 2.829. Todo lo de BVRA es no comercial. La app es personal y no comercial, así que encaja en CC-BY-NC, pero el README de DF20 habla de "solo investigación": es una zona gris para una URL pública. BioCLIP no tiene ese problema.

## 2. Cobertura de nuestras especies (búsqueda exacta en las CSV de entrenamiento; n = imágenes de train)

| Especie | DF20 (MobileNet/EffB0) | FungiTastic | BioCLIP |
|---|---|---|---|
| Boletus edulis / reticulatus / pinophilus | sí (811/309/63) | sí (1396/561/99) | sí |
| Boletus aereus | sí (71) | **NO** | sí |
| Amanita caesarea | **NO** | **NO** | añadida por texto |
| Amanita phalloides / muscaria / pantherina | sí (335/863/318) | sí | sí |
| **Amanita verna** (mortal) | **NO** (sí *A. virosa*) | **NO** (sí *A. virosa*) | añadida, **pero falla** |
| Lactarius deliciosus / torminosus / chrysorrheus | sí (261/207/78) | sí | sí |
| Lactarius sanguifluus | **NO** | **NO** | añadida por texto |
| Cantharellus cibarius | sí (2 ids: cibarius + *pallens*) | sí | sí |
| Omphalotus olearius (tóxica) | **NO** | sí, solo 9 imágenes | añadida por texto |
| Macrolepiota procera | sí (425) | sí | sí |
| Chlorophyllum rhacodes | sí, como "rachodes" (253) | sí | sí |
| Lepiota brunneoincarnata (mortal) | sí (40) | sí (44) | sí (sin probar) |
| Rubroboletus satanas / Caloboletus calopus / Tylopilus felleus | sí | sí | sí |
| Suillus spp. | 9 spp. (sin *bellinii* ni *mediterraneensis*) | 10 spp. | sí |
| Hydnum repandum / Lepista nuda | sí | sí (Hydnum con 2 ids) | sí |

Como se esperaba, las cuatro mediterráneas faltan en los datos daneses, y en FungiTastic falta también *B. aereus*. Los alias de nombres (*rachodes/rhacodes*, *Lepista/Collybia nuda*, *Boletus/Rubroboletus satanas*) hay que mapearlos en la app.

## 3. Prueba en navegador y precisión (aciertos en top-1 / top-5)

Dos conjuntos de prueba:
- **WM**: 18 fotos de Wikimedia Commons (CC/PD), una por especie.
- **iNat**: 17 fotos *research-grade* de iNaturalist, España, observadas entre 2025-06 y 2026-09 (posteriores al entrenamiento de BioCLIP). Son fotos de móvil reales (huevos, ejemplares cortados, manos). Falta *Lepista nuda* porque iNat la lista ahora como *Collybia nuda*.

Los denominadores incluyen las especies que no están en el label set: 4 en DF20 y 4 en FungiTastic.

| Modelo (variante ONNX) | MB | CPU nativa ms | WM t1/t5 | iNat t1/t5 |
|---|---|---|---|---|
| DF20 MobileNetV2 fp16 | 8,6 | 18 | 10/13 | 6/10 |
| DF20 MobileNetV2 int8 | 4,5 | 19 | 9/12 | 6/9 |
| DF20 EffNet-B0 fp32 (el int8 se rompe: 0/18) | 24,3 | 21 | 9/11 | 8/11 |
| FungiTastic EffNet-B3 fp32 (int8: 2/8 en iNat) | 60,2 | 110 | 11/13 | 9/11 |
| BioCLIP visión fp32 | 345 | 385 | 14/17 | 9/13 |
| **BioCLIP visión int8 (MatMul)** | **89,6** | 147 | **13/17** | **9/11** |

Notas de la medición:
- **Navegador (ms, mediana, M3; CPU frenada ×1/×4/×6):** MobileNetV2 int8 44/148/227; MobileNetV2 fp16 71/240/341; BioCLIP int8 308/1.094/1.687.
- **Problemas de exportación:** el int8 por defecto de BioCLIP usa `ConvInteger`, que onnxruntime-web no implementa; se resuelve cuantizando solo MatMul. La conversión a fp16 de EffNet y de BioCLIP produce un grafo inválido.
- **Posible fuga en BioCLIP:** el conjunto WM puede estar en sus datos de entrenamiento (EOL/Commons), así que la cifra fiable es la de iNat.
- **Muestra mínima:** 1–2 fotos por especie. Son cifras orientativas, no un benchmark.

Errores relevantes para la seguridad (conjunto iNat):
- *A. phalloides* (huevo/joven): MobileNetV2 dice *Agaricus xanthodermus* con 1,00 (phalloides en el puesto 2 con 0,00) y BioCLIP no la pone en el top-5.
- *A. verna*: ningún modelo la pone en el top-5 (BioCLIP: *Lycoperdon*, *Phallus*).
- *Omphalotus olearius*: MobileNetV2 dice *Cantharellus cibarius* con 0,43, es decir, una tóxica tomada por un rebozuelo. BioCLIP sí la acierta en las 2 fotos con p ≥ 0,97.
- *A. caesarea*: los modelos daneses dicen *Russula luteotacta* (0,95) o *A. muscaria*. BioCLIP la acierta 2/2.
- *L. sanguifluus*: BioCLIP la pone en el top-5 2/2, siempre detrás de *L. deliciosus*.

## 4. Opciones si la cobertura no basta

- **(a) Prototipos/linear probe sobre embeddings de BioCLIP** (recomendado como siguiente paso). Se calculan los embeddings de 50–200 fotos research-grade de iNat por especie objetivo y se entrena una cabeza lineal o se usa la media por clase, y se mezcla con el zero-shot.
  - Disponibilidad (RG total / con licencia CC0+BY+BY-NC): *A. caesarea* 1.457/853; *O. olearius* 1.810/1.160; *B. aereus* 1.298/868; *L. sanguifluus* 503/359; *L. brunneoincarnata* 115/76; *A. verna* 60/38. Muy pocas fotos son CC0/BY (5–119 por especie), así que se depende de BY-NC, que vale para un uso no comercial.
  - Esfuerzo: 1–2 días, sin GPU. La cabeza ocupa menos de 1 MB y el modelo base no cambia.
  - *A. verna* tiene muy pocos datos: no se puede prometer que la reconozca.
- **(b) Ajuste fino completo de una CNN** (DF20 + iNat Ibérico): de 200 a 1.000 imágenes por clase, horas de GPU, se hereda la licencia NC y la ganancia es incierta frente a (a). No compensa.
- **(c) Clasificador a nivel de género + preguntas guiadas.** Es más robusto (el género acierta mucho más que la especie en las tablas) y encaja con §8.2. Se puede derivar del propio top-k de BioCLIP sumando probabilidades por género.
- **(d) Gemini con cobertura** para lo que el offline no resuelva (§8.3). Ya está en el plan y no sustituye a la regla de seguridad.
- Si los 90 MB pesan demasiado, la vía de reserva es MobileNetV2 DF20 int8 (4,5 MB) + (c) + (d), aceptando la licencia NC y las 4 especies ciegas.

## 5. Riesgos y reglas obligatorias para la app (§2)

1. **La ausencia no descarta nada.** Una especie que no está en el label set, o que no sale en el top-5, nunca queda descartada. Las peligrosas de cada grupo morfológico se muestran siempre en rojo hasta que la comprobación guiada las excluya:
   - laminillas blancas + anillo/volva → *A. phalloides*, *A. verna*, *A. virosa* y *Lepiota* mortales;
   - setas naranjas en grupo sobre madera → *Omphalotus*.
2. **Lista fija de "mortales del entorno"** (que no salga del modelo) asociada a cada candidato comestible, con sus confusiones. Si el modelo propone un comestible, sus mortales parecidas se añaden siempre.
3. **No mostrar la probabilidad como certeza.** Los errores llegan a p = 1,00. Como mucho se muestran "candidatos" ordenados, sin porcentaje, o con bandas groseras.
4. Si la foto no parece un hongo o el embedding está lejos de todo, mostrar "no reconocido" (umbral de similitud por calibrar) en lugar de forzar un top-5.
5. **Peso y memoria:** 90 MB en el caché de la PWA deben ser una descarga opcional con un botón. La memoria pico en iOS Safari y la latencia en un móvil real están **sin medir** (aquí solo se emuló frenando la CPU). WebGPU no se probó. Hay que validarlo en el iPhone y el Android de Alexander antes de comprometerse.
6. **Licencias:** BioCLIP es MIT, pero su ficha de atribución debe ir en la app. Si se usa cualquier modelo BVRA: CC-BY-NC con atribución y sin monetizar nada.
7. Evaluación seria pendiente: al menos 20 fotos de campo por especie objetivo, en especial de las mortales en todos sus estadios (huevo, joven y adulto), antes de publicar.
