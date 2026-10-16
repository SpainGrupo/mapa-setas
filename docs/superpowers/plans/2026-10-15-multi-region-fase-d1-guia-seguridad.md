# Multi-región, fase D1: fichas de Alicante y reglas de seguridad. Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La guía y el reconocedor cubren las setas de Alicante: tres fichas nuevas del grupo comestible, dos variantes dentro de fichas existentes y cuatro fichas tóxicas o mortales, con sus reglas de confusión en `seguridad.ts`. Se cierran también los dos riesgos abiertos del traspaso: la respuesta «láminas amarillas» y el umbral de «no reconocido».

**Architecture:** Las fichas se siguen generando desde `guia/_build/build.py`, que es la fuente. `especies.json` y `CREDITOS.md` son salidas. Las fotos entran por `guia/_build/fotos_nuevas.py` (Commons, licencia comprobada y redimensionada). Cada hecho sale de un dosier de fuentes que se escribe primero (Task 1). `seguridad.ts` gana tres grupos morfológicos y cuatro preguntas, y el total se queda en 19 por debajo del límite de 20 claves del Worker. El vocabulario del reconocedor crece en 8 etiquetas, así que se regeneran solo el texto y la referencia (`--solo-texto`), y el umbral nuevo se fija con esa referencia.

**Tech Stack:** Python 3.12 (scripts de la guía y `modelo/` con uv), TypeScript + Vitest 5 (`app/`), BioCLIP ONNX (`modelo/construir.py`).

**Spec:** `docs/specs/2026-10-15-multi-region-alicante-design.md` (§1.4, §4.5, §7.5, §8), con la regla de seguridad de `docs/specs/2026-10-13-mapa-setas-design.md` §2 y §7 y `knowledge/reference/principio-de-seguridad.md`. Investigación: `docs/investigacion/2026-10-14-region-alicante.md` §2 (abreviada «INV») y `docs/investigacion/2026-10-15-sondeo-fuentes-alicante.md`.

## Global Constraints

- «La app **nunca** afirma que un ejemplar sea comestible. Muestra candidatos, rasgos y confusiones peligrosas» (SPEC §2). Ningún texto nuevo puede contener «comestible», «se puede comer», «apta para el consumo», «sin peligro» ni «comestible segur…». La única excepción es la constante `AV` que ya existe en `build.py`.
- **Pregunta abierta, no se toca:** la frase «Considerada comestible por la bibliografía» (`AV` en `guia/_build/build.py:7` y `AVISO_COMESTIBLE` en `app/src/guia.ts:36`) espera respuesta de Alexander (HANDOFF-ALICANTE.md:44). Las fichas nuevas del grupo comestible usan `AV` igual que las demás, sin cambiar su texto.
- Nunca inventar un hecho. Si no hay fuente, se escribe «Sin dato en las fuentes consultadas.» (convención de la guía) o `PENDIENTE` en el dosier. Se edita la fuente (`build.py`) y no la salida (`especies.json`).
- La Orden SCO/3303/2006 está **derogada** por el RD 30/2009 (sondeo 2026-10-15, línea 27). Ninguna ficha la cita como vigente. La ficha de *T. equestre* no habla de normativa.
- Grupos de ficha: solo `apreciada`, `comestible_menor`, `toxica` o `mortal` (`guia/validar.py:21`). `rasgos_clave` lleva de 3 a 5 elementos y cada ficha tiene de 2 a 3 fotos.
- Fotos solo CC0, CC BY, CC BY-SA o dominio público, nunca NC ni ND (`validar.py`). Cada foto lleva autor, licencia y URL, y sale en `CREDITOS.md`.
- `no_confundir_con` simétrico (lo exige `validar.py`).
- Cobertura del 100 % en `app/src/seguridad.ts` y `app/src/reconocer-nucleo.ts` (`npm run cobertura`).
- `PREGUNTAS.length ≤ 20`, porque el Worker admite como máximo 20 claves en `respuestas_guiadas` (`worker/src/validar.ts:9`).
- Las mortales de la guía se listan siempre hasta que las respuestas las descartan (`seguridad.ts:223-226`). Una especie mortal nunca se descarta con una sola respuesta, salvo la del corte del huevo, que ya existe.
- Python solo con uv. Nunca pip ni el `python3` del sistema para código con dependencias. Los scripts sin dependencias de la guía (`validar.py`, `build.py`, `creditos.py`) se siguen lanzando con `python3`, como hasta ahora.
- Copy en español. Todo texto para el usuario pasa por la skill `humanizer` (`_config/voice.md`).
- Puertas (spec §8): `code-review` **max** sobre `seguridad.ts`, `reconocer-nucleo.ts` y las fichas nuevas.
- **Orden de ejecución:** este plan empieza cuando el plan A (`2026-10-15-multi-region-fase-a-pipeline.md`) esté terminado en la rama. Ese plan cambia `modelo/construir.py:8,32,33` (la ruta de salida) y crea `pipeline/regiones/*.yaml`. No toca nada de `pipeline/`.

---

## Mapa de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `docs/investigacion/2026-10-15-fichas-alicante.md` | Crear | Dosier: cada hecho de cada ficha con su URL, la clasificación tóxica o mortal, las confusiones y las fotos candidatas. Es la base de Task 3. |
| `guia/_build/fotos_nuevas.py` | Modificar `NUEVAS` (líneas 14-28) | Lista de archivos de Commons por ficha nueva o cambiada. |
| `guia/_build/fotos.json`, `guia/fotos/*.jpg` | Salida de `fotos_nuevas.py` | Metadatos y JPEG de 1200 px. |
| `guia/_build/build.py` | Modificar | 7 fichas nuevas, variantes en `suillus_bellinii` y `lactarius_deliciosus`, hábitat de Alicante, confusiones inversas, `DESC` y el helper `gbif()`. |
| `guia/especies.json`, `guia/CREDITOS.md` | Salida de `build.py` y `creditos.py` | Se regeneran, no se editan a mano. |
| `app/src/guia.ts` | Modificar `:79-92` | Mapa especie→ficha de Alicante y `textoFichaDe()`. |
| `app/src/selector-especie.ts` | Modificar `:24-28` | Usa `textoFichaDe()` (no pasa un binomio a minúsculas y concuerda «de la criadilla»). |
| `app/src/guia.test.ts` | Modificar | Tests del mapa y de `textoFichaDe`. |
| `app/src/seguridad.ts` | Modificar | Grupos `tricolomoide`, `morcheloide` y `clitociboide`, 4 preguntas, reglas, alertas y la corrección de «láminas amarillas». |
| `app/src/seguridad.test.ts` | Modificar | Mortales leídas de la guía, tests de las reglas nuevas y del hallazgo. |
| `app/src/comparar.ts` | Modificar `:13-41` | Las preguntas nuevas en `RASGOS` y `FOTO_PREGUNTA`. |
| `app/src/comparar.test.ts`, `app/src/gemini.test.ts` | Modificar | Ajuste a la regla nueva de amanitas. |
| `app/src/seguridad-regiones.test.ts` | Crear | Test de spec §7.5: cada comestible activa en una región tiene una confusión tóxica con ficha. |
| `modelo/vocabulario/alias.json` | Modificar | 9 afines nuevas. |
| `modelo/construir.py` | Modificar `referencia()` y argparse | `--ajenas`: fotos reales sin setas para calibrar «no reconocido». |
| `modelo/referencia.json` | Salida de `construir.py` | Se regenera. |
| `app/src/reconocer-nucleo.ts` | Modificar `:23-33` | Umbral 0,28 y comentario con la evidencia. |
| `app/src/reconocer-nucleo.test.ts` | Modificar | El umbral se comprueba contra `modelo/referencia.json`. |

---

### Task 1: Dosier de fuentes de las fichas de Alicante

Ningún texto de ficha se escribe sin pasar antes por aquí. El dosier fija cada hecho con su URL, cómo se clasifica cada tóxica y qué confusiones tiene cada comestible activa.

**Files:**
- Create: `docs/investigacion/2026-10-15-fichas-alicante.md`

**Interfaces:**
- Consumes: INV §2 (lista de especies y registros GBIF), constantes de fuentes de `guia/_build/build.py:9-34` (`GUIA`, `TOX`, `DON`, `ac()`, `fn()`, `sf()`, `wp()`).
- Produces: para cada id (`tricholoma_terreum`, `hygrophorus_latitabundus`, `morchella_spp`, `tricholoma_pardinum`, `tricholoma_equestre`, `gyromitra_esculenta`, `clitocybe_dealbata`, más las variantes *S. collinitus*, *L. sanguifluus*, *L. vinosus* y *L. semisanguifluus*) una tabla «campo | texto | fuente (URL)», la decisión `grupo` con su cita, la tabla de confusiones y 3 títulos de archivo de Commons por ficha. La usan las Tasks 2, 3 y 5.

- [x] **Step 1: Fuentes de cada taxón**

Para cada taxón, comprueba que cada URL responde con 200 antes de citarla:

```bash
for u in \
  https://www.amanitacesarea.com/tricholoma-terreum.html \
  https://www.amanitacesarea.com/tricholoma-pardinum.html \
  https://www.amanitacesarea.com/tricholoma-equestre.html \
  https://www.amanitacesarea.com/hygrophorus-latitabundus.html \
  https://www.amanitacesarea.com/morchella-esculenta.html \
  https://www.amanitacesarea.com/gyromitra-esculenta.html \
  https://www.amanitacesarea.com/clitocybe-dealbata.html \
  https://www.amanitacesarea.com/suillus-collinitus.html \
  https://www.first-nature.com/fungi/tricholoma-terreum.php \
  https://www.first-nature.com/fungi/tricholoma-pardinum.php \
  https://www.first-nature.com/fungi/tricholoma-equestre.php \
  https://www.first-nature.com/fungi/morchella-esculenta.php \
  https://www.first-nature.com/fungi/gyromitra-esculenta.php \
  https://www.first-nature.com/fungi/clitocybe-rivulosa.php \
  https://www.first-nature.com/fungi/suillus-collinitus.php ; do
  printf '%s ' "$(curl -s -o /dev/null -w '%{http_code}' -A 'setas-guia/1.0' "$u")"; echo "$u"; done
```

Las que no den 200 se buscan con el buscador del sitio, y si no aparecen se quitan. No se adivinan otras URL. Para el registro de Species Fungorum:

```bash
curl -s "http://www.indexfungorum.org/ixfwebservice/fungus.asmx/NameSearch?SearchText=Tricholoma%20terreum&AnywhereInText=false&MaxNumber=5"
```

Saca el `RECORD_NUMBER` del nombre aceptado. Si el servicio falla, usa `https://api.gbif.org/v1/species/match?name=Tricholoma%20terreum` y cita `https://www.gbif.org/species/<usageKey>` como «GBIF, ficha taxonómica de <nombre>». Anota también el `usageKey` de GBIF de cada especie que vaya a decir «registros en la zona de Alicante» en su hábitat. Son las 7 nuevas y, de las existentes, `lactarius_deliciosus` (por *L. sanguifluus*), `suillus_bellinii` (por *S. collinitus*), `lepista_nuda`, `agaricus_campestris`, `hydnum_repandum`, `pleurotus_eryngii`, `macrolepiota_procera`, `boletus_aereus`, `amanita_phalloides`, `amanita_verna`, `lepiota_brunneoincarnata`, `omphalotus_olearius`, `rubroboletus_satanas`, `lactarius_chrysorrheus`, `amanita_pantherina` y `amanita_muscaria` (INV §2 da registros de todas en la zona).

- [x] **Step 2: Clasificación tóxica o mortal, con cita**

Regla: `mortal` si una fuente toxicológica citada (TOX, DON o un artículo revisado) documenta muertes o un síndrome potencialmente mortal. Si no, `toxica`. Hay que comprobar estos puntos y anotar la cita exacta:

| id | Hipótesis a verificar | Dónde mirar |
|---|---|---|
| `tricholoma_equestre` | `mortal`: rabdomiólisis tras comidas repetidas, con muertes (Bedry et al., N Engl J Med 2001;345:798-802) | `https://www.nejm.org/doi/full/10.1056/NEJMoa010581` (comprueba que el DOI resuelve; si no, búscalo en PubMed por título «Wild-mushroom intoxication as a cause of rhabdomyolysis»), TOX y DON |
| `gyromitra_esculenta` | `mortal`: síndrome giromitriano (giromitrina → monometilhidrazina), daño hepático y neurológico | DON (protocolo IT-114), TOX |
| `tricholoma_pardinum` | `toxica`: síndrome gastrointestinal | TOX, DON |
| `clitocybe_dealbata` | `toxica`: síndrome muscarínico | TOX, DON |

Comprueba también estos puntos, que van al dosier aunque no cambien el grupo:
- *T. terreum*: Yin et al. (2014), «Chemical and toxicological investigations of a previously unknown poisonous European mushroom *Tricholoma terreum*», Chem. Eur. J. 20:7001-7009. Busca en PubMed si existe y qué dice. Si se confirma, la ficha lo menciona en `toxicidad_nota` (Task 3) y el informe final lo sube a Alexander como decisión pendiente (¿sigue en `comestible_menor`?). Este plan **no** cambia el grupo por su cuenta.
- *Morchella*: tóxica en crudo y síndrome neurológico (Saviuc et al., Clin. Toxicol. 2010;48:365-372, «Can morels (*Morchella* sp.) induce a toxic neurological syndrome?»). Comprueba que el artículo existe y anota la URL de PubMed.
- *G. gigas*: ¿documenta alguna fuente su toxicidad? Si no, el dosier dice `PENDIENTE` y la ficha dice que se trata igual que *G. esculenta* «por precaución», sin atribuirle hechos.

- [x] **Step 3: Confusiones de cada comestible activa**

Las comestibles activas en alguna región (plan A `marbella.yaml` y spec §1.3/§3.5) cuya ficha hoy no tiene una confusión tóxica o mortal son `suillus_bellinii` (también por *S. collinitus*), `lepista_nuda`, `hydnum_repandum`, `pleurotus_eryngii` y, cuando exista, `hygrophorus_latitabundus` (salida de `python3 guia/validar.py`, 4 avisos «comestible sin parecido tóxico/mortal»). Para cada una, busca en las fuentes de su ficha y en AmanitaCesarea.com o First Nature si citan una confusión con alguna de las tóxicas o mortales de la guía, incluidas las cuatro nuevas. Hipótesis que hay que comprobar, sin darlas por hechas:
- `lepista_nuda` ↔ `clitocybe_dealbata` (Lepista y Clitocybe son géneros próximos; *L. nuda* se llamó *Clitocybe nuda*).
- `pleurotus_eryngii` ↔ `clitocybe_dealbata` (las dos salen en pastizales).
- `hygrophorus_latitabundus` ↔ cualquier tóxica con ficha.

Confusiones que sí entran, por spec §4.5 o por INV §2:
- `tricholoma_terreum` ↔ `tricholoma_pardinum` y `tricholoma_equestre`.
- `morchella_spp` ↔ `gyromitra_esculenta`.
- `agaricus_campestris` ↔ `clitocybe_dealbata`. La senderuela (*Marasmius oreades*) no tiene ficha: entra solo por el grupo morfológico (Task 5).

Escribe la tabla «comestible | tóxica con ficha | diferencias (2-3) | fuente».

**Puerta:** si alguna comestible activa sigue sin confusión tóxica documentada, **para** y lleva la lista al hilo principal con lo que dice cada fuente (por ejemplo, «sin parecidas peligrosas citadas»). Solo Alexander puede aprobar una excepción (Task 6, `EXCEPCIONES_APROBADAS`) o pedir una ficha tóxica más (fase D2). No se inventa una confusión para que pase el test.

- [ ] **Step 4: Fotos candidatas en Commons**

Por cada taxón, lista los archivos de su categoría con licencia y tamaño. El script va al scratchpad, no al repo:

```bash
mkdir -p "$TMPDIR/fotos-cand" && cat > "$TMPDIR/fotos-cand/listar.py" <<'EOF'
import json, re, sys, urllib.parse, urllib.request
UA = {"User-Agent": "setas-guia/1.0 (guía de especies, uso no comercial)"}
LIC_OK = re.compile(r"^(CC0( 1\.0)?|CC BY(-SA)? \d\.\d|Public domain)$", re.I)
cat = "Category:" + sys.argv[1]
q = {"action": "query", "generator": "categorymembers", "gcmtitle": cat, "gcmtype": "file", "gcmlimit": "100",
     "prop": "imageinfo", "iiprop": "url|extmetadata|size", "iiurlwidth": "400",
     "iiextmetadatafilter": "LicenseShortName|Artist", "format": "json"}
r = json.loads(urllib.request.urlopen(urllib.request.Request(
    "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(q), headers=UA)).read())
for p in (r.get("query") or {}).get("pages", {}).values():
    ii = p["imageinfo"][0]; lic = ii["extmetadata"].get("LicenseShortName", {}).get("value", "?")
    ok = bool(LIC_OK.match(lic)) and not re.search(r"\b(NC|ND)\b", lic)
    print(("OK " if ok else "NO ") + f"{ii['width']}x{ii['height']} | {lic} | {p['title']} | {ii['thumburl']}")
EOF
for t in "Tricholoma terreum" "Tricholoma pardinum" "Tricholoma equestre" "Hygrophorus latitabundus" \
         "Morchella esculenta" "Gyromitra esculenta" "Clitocybe dealbata" "Clitocybe rivulosa" \
         "Suillus collinitus" "Lactarius sanguifluus"; do
  echo "== $t"; python3 -I "$TMPDIR/fotos-cand/listar.py" "$t"; sleep 2; done
```

De las `OK` de al menos 800 px en el lado largo, descarga las miniaturas candidatas al scratchpad (`curl -s -A 'setas-guia/1.0' -o "$TMPDIR/fotos-cand/<n>.jpg" <thumburl>`) y **míralas** con la herramienta Read. Elige 3 por ficha, con este orden de preferencia:
1. Una que enseñe el rasgo que decide: el corte vertical de la colmenilla y de *Gyromitra*, las láminas amarillas de *T. equestre*, las escamas de *T. pardinum*, la base rosada de *S. collinitus* y el látex rojo vino de *L. sanguifluus*.
2. Una vista general en su hábitat.
3. Una de detalle (láminas, pie).

Descarta las fotos con varias especies, de herbario o con la identificación dudosa en la descripción de Commons. Si una ficha no llega a 2 fotos válidas en Commons, mira en iNaturalist (solo `CC0`, `CC BY` o `CC BY-SA`, leídas en la página de la foto). Anota la URL de la foto como `url_fuente`, igual que `amanita_caesarea_2`, y descárgala a mano a 1200 px. Si tampoco hay, **para** y avisa: una ficha sin fotos no pasa `validar.py`.

Para las variantes:
- `suillus_bellinii_3.jpg` se sustituye por una foto de *S. collinitus*.
- `lactarius_deliciosus_3.jpg` se sustituye por una de *L. sanguifluus* con el látex rojo vino.

Así la miniatura y la ficha muestran también la especie de Alicante.

- [x] **Step 5: Escribir el dosier y hacer commit**

Estructura obligatoria de `docs/investigacion/2026-10-15-fichas-alicante.md`:

```markdown
# Fichas de Alicante: fuentes y decisiones (2026-10-15)

## 1. Clasificación (grupo) con cita
| id | grupo | síndrome y latencia | fuente |

## 2. Hechos por ficha
### tricholoma_terreum
| campo | texto propuesto | fuente |
(uno por campo de TEXTO en validar.py: nombre_cientifico … temporada, más rasgos_clave)
… (una sección por id nuevo y por variante)

## 3. Confusiones
| comestible | tóxica con ficha | diferencias | fuente |
### Sin confusión tóxica documentada (requiere decisión de Alexander)

## 4. Fotos elegidas
| ficha | n | título Commons / URL iNat | licencia | autor | por qué |

## 5. PENDIENTE
```

```bash
git add docs/investigacion/2026-10-15-fichas-alicante.md
git commit -m "docs(investigacion): fuentes y decisiones de las fichas de Alicante

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Fotos con licencia libre

**Files:**
- Modify: `guia/_build/fotos_nuevas.py:14-28` (`NUEVAS`)
- Delete: `guia/fotos/suillus_bellinii_3.jpg` y `guia/fotos/lactarius_deliciosus_3.jpg` (se sustituyen)
- Output: `guia/fotos/<id>_{1,2,3}.jpg` y `guia/_build/fotos.json`

**Interfaces:**
- Consumes: dosier §4 (títulos de Commons elegidos).
- Produces: `fotos.json[<id>] = [{archivo, autor, licencia, url_fuente}]` para `tricholoma_terreum`, `hygrophorus_latitabundus`, `morchella_spp`, `tricholoma_pardinum`, `tricholoma_equestre`, `gyromitra_esculenta`, `clitocybe_dealbata`, `suillus_bellinii` y `lactarius_deliciosus` (las dos últimas, enteras: `_1` y `_2` iguales que ahora y `_3` nueva). Lo consume `build.py` (Task 3).

- [ ] **Step 1: Añadir las especies a `NUEVAS`**

Añade al final del diccionario `NUEVAS` (sin borrar las 4 que ya hay; el script es idempotente). Los títulos `File:` son los del dosier §4. Las entradas de las dos fichas que cambian conservan sus `_1` y `_2`, cuyos títulos están en `guia/_build/fotos.json`:

```python
    # Fase D1 (Alicante): ver docs/investigacion/2026-10-15-fichas-alicante.md §4
    "tricholoma_terreum": ["File:<dosier §4, terreum 1>", "File:<… 2>", "File:<… 3>"],
    "hygrophorus_latitabundus": ["File:<…>", "File:<…>", "File:<…>"],
    "morchella_spp": ["File:<corte vertical hueco>", "File:<…>", "File:<…>"],
    "tricholoma_pardinum": ["File:<escamas>", "File:<…>", "File:<…>"],
    "tricholoma_equestre": ["File:<láminas amarillas>", "File:<…>", "File:<…>"],
    "gyromitra_esculenta": ["File:<corte con cámaras>", "File:<…>", "File:<…>"],
    "clitocybe_dealbata": ["File:<…>", "File:<…>", "File:<C. rivulosa>"],
    "suillus_bellinii": ["File:Suillus bellinii profile.jpg", "File:Suillus bellinii cropped regrouped.jpg",
                         "File:<S. collinitus, base rosada>"],
    "lactarius_deliciosus": ["File:Lactarius deliciosus cut.jpg", "File:Echte Reizker Lactarius deliciosus.JPG",
                             "File:<L. sanguifluus, látex rojo vino>"],
```

Los `<…>` de este bloque **no** son marcadores pendientes del plan: son los títulos exactos que Task 1 Step 4 elige mirando las fotos. Se copian del dosier carácter a carácter, con espacios y no guiones bajos, como en las entradas existentes.

- [ ] **Step 2: Quitar las dos fotos que se sustituyen**

El script no vuelve a descargar un archivo que ya existe. Si no se borran, la foto vieja se quedaría con los metadatos nuevos.

```bash
git rm guia/fotos/suillus_bellinii_3.jpg guia/fotos/lactarius_deliciosus_3.jpg
```

- [ ] **Step 3: Descargar y comprobar las licencias**

```bash
cd modelo && uv run python ../guia/_build/fotos_nuevas.py
```

Salida esperada: una línea por foto con `fotos/<id>_<n>.jpg | <licencia> | <autor>`, sin `licencia no permitida`, y 27 líneas nuevas más las 12 de las especies anteriores. Si sale `licencia no permitida …`, cambia ese título por otro candidato del dosier y repite.

- [ ] **Step 4: Comprobar los archivos**

```bash
cd /Users/alexanderkrupnov/Documents/Claude/setas-alicante
python3 - <<'EOF'
import json
from pathlib import Path
m = json.loads(Path("guia/_build/fotos.json").read_text())
ids = ["tricholoma_terreum","hygrophorus_latitabundus","morchella_spp","tricholoma_pardinum","tricholoma_equestre",
       "gyromitra_esculenta","clitocybe_dealbata","suillus_bellinii","lactarius_deliciosus"]
for i in ids:
    for f in m[i]:
        p = Path("guia") / f["archivo"]
        assert p.is_file(), p
        print(i, f["archivo"], p.stat().st_size // 1024, "KB", f["licencia"], "|", f["autor"][:40])
EOF
```

Esperado: 27 líneas, cada archivo entre 50 y 600 KB. Abre con Read cada JPEG nuevo y confirma que es la foto elegida.

- [ ] **Step 5: Commit**

```bash
git add guia/_build/fotos_nuevas.py guia/_build/fotos.json guia/fotos/
git commit -m "feat(guia): fotos con licencia libre de las especies de Alicante

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Fichas nuevas, variantes y hábitat de Alicante

**Files:**
- Modify: `guia/_build/build.py` (fuentes nuevas tras la línea 34; fichas nuevas en sus secciones; `suillus_bellinii` `:202-215`; `lactarius_deliciosus`; `agaricus_campestris`; hábitats; `DESC` antes de la línea 620)
- Output: `guia/especies.json`, `guia/CREDITOS.md`

**Interfaces:**
- Consumes: dosier §1-§3 y `fotos.json` (Task 2).
- Produces: fichas con ids `tricholoma_terreum`, `hygrophorus_latitabundus` y `morchella_spp` (comestibles), `tricholoma_pardinum` (`toxica`), `tricholoma_equestre` (`mortal` si el dosier §1 lo confirma), `gyromitra_esculenta` (`mortal` si lo confirma) y `clitocybe_dealbata` (`toxica`). Las Tasks 4 a 7 dependen de estos ids exactos.

**Regla de redacción:** los textos de abajo son el **borrador de partida** con la morfología más citada. Cada frase se coteja con el dosier §2. Una frase sin fuente en el dosier se cambia por la de la fuente o por «Sin dato en las fuentes consultadas.». Ninguna se queda «porque suena bien». Los números (tamaños, latencias) tienen que coincidir con la fuente.

- [ ] **Step 1: Fuentes nuevas**

Debajo de `CYS = …` (línea 34) añade:

```python
def gbif(key, nombre):
    return {"titulo": f"GBIF, {nombre}: registros, también en la zona de Alicante (consulta 14-10-2026)", "url": f"https://www.gbif.org/species/{key}"}
NEJM = {"titulo": "Bedry et al. (2001), Wild-mushroom intoxication as a cause of rhabdomyolysis, N Engl J Med 345:798-802", "url": "<URL verificada en el dosier §1>"}
MORCH = {"titulo": "Saviuc et al. (2010), Can morels (Morchella sp.) induce a toxic neurological syndrome?, Clin Toxicol 48:365-372", "url": "<URL de PubMed del dosier §1>"}
IECT_LD = {"titulo": "MITECO, Inventario Español de los Conocimientos Tradicionales relativos a la Biodiversidad: Lactarius deliciosus (L. sanguifluus, calcícola)", "url": "https://www.miteco.gob.es/content/dam/miteco/es/biodiversidad/temas/inventarios-nacionales/iect_lactarius_deliciosus_tcm30-164130.pdf"}
RIOJA_H = {"titulo": "Gobierno de La Rioja, Hygrophorus latitabundus en pinares calizos de P. nigra y P. halepensis", "url": "https://www.larioja.org/medio-ambiente/es/reserva-biosfera/valores/naturaleza/valores-naturales/45_setaslocalizacion.ficheros/633897-451899_HydrophorusLimacinus.pdf"}
```

Las dos URL entre `< >` son las que el dosier §1 verificó con 200. Si alguna no se verifica, quita la constante y la frase que la cita.

- [ ] **Step 2: Comestibles nuevas** (al final de la sección COMESTIBLES MENORES y de APRECIADAS)

```python
sp(id="tricholoma_terreum", nombre_cientifico="Tricholoma terreum (Schaeff.) P. Kumm.", nombres_comunes=["negrilla", "fredolic"],
   grupo="comestible_menor", toxicidad_nota=AV,   # + frase de Yin et al. 2014 si el dosier §1 la confirma
   sombrero="De 3 a 8 cm. Gris ratón a gris pardo, cubierto de fibrillas finas que le dan aspecto de fieltro; cónico y luego extendido, a menudo con un mamelón.",
   himenio="Láminas blanquecinas a gris claro, escotadas, bastante separadas.",
   pie="Blanco, cilíndrico y fibroso.",
   volva="No tiene.", anillo="No tiene.",
   carne_y_corte="Blanquecina a gris, fina y frágil; no cambia de color al corte.",
   olor_sabor="Olor y sabor débiles.",
   esporada="Blanca.",
   habitat="Pinares, sobre todo de Pinus halepensis y P. nigra en suelo calizo, a menudo en grupos numerosos. Con registros en GBIF en la zona de Alicante.",
   temporada="Final del otoño e invierno, de noviembre a febrero.",
   rasgos_clave=["Sombrero gris ratón de 3 a 8 cm, como de fieltro, sin escamas gruesas", "Láminas blanquecinas o grises, nunca amarillas", "Carne fina y frágil", "En grupos bajo pinos"],
   no_confundir_con=[
     {"id": "tricholoma_pardinum", "diferencias": ["T. pardinum es más grande y carnoso, con escamas oscuras y gruesas sobre fondo claro, en círculos", "Huele a harina", "Su carne es gruesa y firme"]},
     {"id": "tricholoma_equestre", "diferencias": ["T. equestre tiene las láminas y el pie amarillos", "Su sombrero es amarillo verdoso, más oscuro en el centro"]}],
   fuentes=[ac("tricholoma-terreum", "Tricholoma terreum"), fn("tricholoma-terreum", "Tricholoma terreum"), sf(<RID>, "Tricholoma terreum"), gbif(<KEY>, "Tricholoma terreum")])

sp(id="hygrophorus_latitabundus", nombre_cientifico="Hygrophorus latitabundus Britzelm.", nombres_comunes=["llenega negra", "llenega"],
   grupo="comestible_menor", toxicidad_nota=AV,
   sombrero="De 5 a 12 cm. Gris oscuro a pardo negruzco, más oscuro en el centro, muy viscoso con humedad.",
   himenio="Láminas blancas, gruesas, espaciadas, algo decurrentes.",
   pie="Blanco arriba y cubierto abajo por una capa viscosa gris oscura.",
   volva="No tiene.", anillo="No tiene anillo membranoso; la capa viscosa del pie acaba en una zona marcada.",
   carne_y_corte="Blanca y firme; no cambia de color al corte.",
   olor_sabor="Sin dato en las fuentes consultadas.",
   esporada="Blanca.",
   habitat="Pinares de Pinus halepensis y P. nigra sobre suelo calizo, a menudo en umbrías. Con registros en GBIF en la zona de Alicante.",
   temporada="Final del otoño e invierno, de noviembre a enero.",
   rasgos_clave=["Sombrero gris oscuro y muy viscoso", "Pie con una capa viscosa gris", "Láminas blancas, gruesas y espaciadas", "Bajo pinos, en suelo calizo"],
   no_confundir_con=[],   # dosier §3: añade aquí las tóxicas con fuente; si no hay ninguna, puerta de Task 1 Step 3
   fuentes=[ac("hygrophorus-latitabundus", "Hygrophorus latitabundus"), RIOJA_H, sf(<RID>, "Hygrophorus latitabundus"), gbif(<KEY>, "Hygrophorus latitabundus")])

sp(id="morchella_spp", nombre_cientifico="Morchella esculenta (L.) Pers. y especies próximas", nombres_comunes=["colmenilla", "cagarria", "morilla", "múrgola"],
   grupo="apreciada",
   toxicidad_nota=AV + " La bibliografía la describe como tóxica en crudo o poco cocinada, y cita casos de síntomas neurológicos tras comerla (síndrome morcheliano).",
   sombrero="De 3 a 10 cm de alto, ovoide o cónico, de pardo amarillento a gris o pardo oscuro, con celdas hundidas separadas por costillas, como un panal.",
   himenio="No tiene láminas ni poros: la superficie fértil son las celdas del sombrero.",
   pie="Blanquecino, granuloso y hueco, unido al sombrero por su base.",
   volva="No tiene.", anillo="No tiene.",
   carne_y_corte="Hueca de arriba abajo: cortada en vertical, el sombrero y el pie forman una sola cavidad.",
   olor_sabor="Sin dato en las fuentes consultadas.",
   esporada="Crema a ocre.",
   habitat="Zonas quemadas uno o dos años antes, riberas y suelos removidos, bajo pinos, encinas y árboles de ribera. Con registros en GBIF de M. esculenta y M. elata en la zona de Alicante.",
   temporada="Primavera, de marzo a mayo.",
   rasgos_clave=["Sombrero con celdas hundidas, como un panal", "Hueca de arriba abajo, en una sola cavidad", "Sombrero unido al pie por su base", "Sale en primavera"],
   no_confundir_con=[
     {"id": "gyromitra_esculenta", "diferencias": ["Gyromitra tiene el sombrero con pliegues como un cerebro, sin celdas", "Por dentro tiene cámaras o tabiques; la colmenilla es una sola cavidad", "Es de color pardo rojizo"]}],
   fuentes=[ac("morchella-esculenta", "Morchella esculenta"), fn("morchella-esculenta", "Morchella esculenta"), MORCH, sf(<RID>, "Morchella esculenta"), gbif(<KEY>, "Morchella esculenta")])
```

`<RID>` y `<KEY>` son los números que el dosier §2 anotó para cada taxón (Index Fungorum y GBIF). Son enteros, sin comillas.

- [ ] **Step 3: Tóxicas y mortales nuevas** (sección TÓXICAS / MORTALES de `build.py`)

```python
sp(id="tricholoma_pardinum", nombre_cientifico="Tricholoma pardinum (Pers.) Quél.", nombres_comunes=["tricoloma atigrado"],
   grupo="toxica",
   toxicidad_nota="TÓXICA. Síndrome gastrointestinal intenso (vómitos y diarrea) que empieza entre 0,5 y 4 h después de comerla.",
   sombrero="De 5 a 15 cm, carnoso. Fondo blanquecino a gris claro, cubierto de escamas gris oscuro o pardas, gruesas, en círculos concéntricos.",
   himenio="Láminas blanquecinas, a veces con tono amarillo verdoso, escotadas y apretadas.",
   pie="Robusto, blanquecino, a veces ocráceo en la base.",
   volva="No tiene.", anillo="No tiene.",
   carne_y_corte="Blanca, gruesa y firme.",
   olor_sabor="Olor de harina. No se debe probar.",
   esporada="Blanca.",
   habitat="Bosques de coníferas y de frondosas, con preferencia por el suelo calizo. GBIF tiene un registro en la zona de Alicante.",
   temporada="Otoño.",
   rasgos_clave=["Escamas oscuras y gruesas sobre fondo claro, en círculos", "Sombrero grande y carnoso, de hasta 15 cm", "Olor de harina", "Carne gruesa y firme"],
   no_confundir_con=[
     {"id": "tricholoma_terreum", "diferencias": ["La negrilla es más pequeña (3 a 8 cm) y frágil, de carne fina", "Su sombrero es de fieltro fino, sin escamas gruesas", "No huele a harina"]}],
   fuentes=[ac("tricholoma-pardinum", "Tricholoma pardinum"), fn("tricholoma-pardinum", "Tricholoma pardinum"), TOX, DON, sf(<RID>, "Tricholoma pardinum")])

sp(id="tricholoma_equestre", nombre_cientifico="Tricholoma equestre (L.) P. Kumm. (incluye T. auratum)", nombres_comunes=["seta de los caballeros", "verderol"],
   grupo="mortal",   # solo si el dosier §1 lo confirma; si no, "toxica" y cambia "MORTAL" por "TÓXICA"
   toxicidad_nota="MORTAL. Comerla varias veces seguidas ha causado rabdomiólisis (destrucción del músculo), con muertes documentadas. Los síntomas (debilidad, dolor muscular y orina oscura) aparecen días después.",
   sombrero="De 4 a 10 cm. Amarillo verdoso a amarillo azufre, más pardo en el centro, con escamitas finas; algo viscoso con humedad.",
   himenio="Láminas amarillo azufre, escotadas y apretadas.",
   pie="Amarillo, a veces con fibrillas pardas.",
   volva="No tiene.", anillo="No tiene.",
   carne_y_corte="Blanca o amarillenta y firme.",
   olor_sabor="Olor de harina débil. No se debe probar.",
   esporada="Blanca.",
   habitat="Pinares sobre suelo arenoso; también bosques de frondosas. GBIF tiene registros en la zona de Alicante.",
   temporada="Otoño, hasta principios del invierno.",
   rasgos_clave=["Láminas amarillo azufre", "Pie amarillo", "Sombrero amarillo verdoso con el centro más oscuro", "Sin anillo ni volva"],
   no_confundir_con=[
     {"id": "tricholoma_terreum", "diferencias": ["La negrilla tiene las láminas blanquecinas o grises, nunca amarillas", "Su sombrero es gris ratón, como de fieltro"]}],
   fuentes=[ac("tricholoma-equestre", "Tricholoma equestre"), fn("tricholoma-equestre", "Tricholoma equestre"), NEJM, TOX, sf(<RID>, "Tricholoma equestre")])

sp(id="gyromitra_esculenta", nombre_cientifico="Gyromitra esculenta (Pers.) Fr. (incluye G. gigas)", nombres_comunes=["falsa colmenilla", "bonete"],
   grupo="mortal",   # solo si el dosier §1 lo confirma
   toxicidad_nota="MORTAL. Contiene giromitrina, que el cuerpo convierte en monometilhidrazina: vómitos y diarrea a las 6-12 h y después daño en el hígado y en el sistema nervioso. G. gigas se trata igual por precaución.",
   sombrero="De 3 a 10 cm. Pardo rojizo a castaño oscuro, irregular, con pliegues y circunvoluciones como un cerebro; sin celdas.",
   himenio="No tiene láminas ni poros: la superficie fértil es la del sombrero.",
   pie="Corto, grueso, blanquecino e irregular, con surcos.",
   volva="No tiene.", anillo="No tiene.",
   carne_y_corte="Por dentro tiene cámaras irregulares y tabiques; no es una sola cavidad como la colmenilla.",
   olor_sabor="Sin dato en las fuentes consultadas. No se debe probar.",
   esporada="Sin dato en las fuentes consultadas.",
   habitat="Pinares y bosques de coníferas en suelo arenoso. GBIF no tiene registros en la zona de Alicante; la ficha está porque se confunde con la colmenilla.",
   temporada="Primavera, como las colmenillas.",
   rasgos_clave=["Sombrero como un cerebro, sin celdas", "Por dentro tiene cámaras o tabiques; no está hueca de arriba abajo", "Color pardo rojizo", "Sale en primavera, como las colmenillas"],
   no_confundir_con=[
     {"id": "morchella_spp", "diferencias": ["La colmenilla tiene celdas hundidas como un panal, no pliegues", "Cortada en vertical, la colmenilla es una sola cavidad"]}],
   fuentes=[ac("gyromitra-esculenta", "Gyromitra esculenta"), fn("gyromitra-esculenta", "Gyromitra esculenta"), DON, TOX, sf(<RID>, "Gyromitra esculenta")])

sp(id="clitocybe_dealbata", nombre_cientifico="Clitocybe dealbata (Sowerby) P. Kumm. (incluye C. rivulosa)", nombres_comunes=[],
   grupo="toxica",
   toxicidad_nota="TÓXICA. Síndrome muscarínico (sudor, lagrimeo, salivación y bajada de la tensión) entre 15 min y 2 h después de comerla.",
   sombrero="De 2 a 5 cm. Blanco a blanco grisáceo o rosado pálido, como cubierto de escarcha; plano o algo hundido.",
   himenio="Láminas blanquecinas a crema, apretadas, que tocan el pie o bajan un poco por él.",
   pie="Corto, blanquecino y fibroso.",
   volva="No tiene.", anillo="No tiene.",
   carne_y_corte="Blanca y fina.",
   olor_sabor="Sin dato en las fuentes consultadas. No se debe probar.",
   esporada="Blanca.",
   habitat="Prados, pastizales, céspedes y bordes de camino, a veces en corros, donde también salen el champiñón de campo y la senderuela. GBIF tiene registros de C. dealbata en la zona de Alicante.",
   temporada="Verano y otoño.",
   rasgos_clave=["Seta pequeña y blanca, como escarchada", "Láminas blancas o crema, nunca rosas ni marrones", "Láminas que tocan el pie o bajan un poco por él", "Crece en prados, a veces en corros"],
   no_confundir_con=[
     {"id": "agaricus_campestris", "diferencias": ["El champiñón tiene láminas libres, rosas y luego marrón chocolate", "Tiene anillo"]}],
   fuentes=[ac("clitocybe-dealbata", "Clitocybe dealbata"), fn("clitocybe-rivulosa", "Clitocybe rivulosa"), TOX, DON, sf(<RID>, "Clitocybe dealbata")])
```

Si el dosier §3 documenta más confusiones de `clitocybe_dealbata` (por ejemplo con `lepista_nuda` o `pleurotus_eryngii`), se añaden aquí **y** en la ficha de enfrente (Step 4), con sus diferencias y su fuente en `fuentes`.

- [ ] **Step 4: Confusiones inversas y variantes en fichas existentes**

En `agaricus_campestris` añade a `no_confundir_con`:

```python
     {"id": "clitocybe_dealbata", "diferencias": ["Clitocybe dealbata es más pequeña, blanca y como escarchada", "Sus láminas son blancas o crema, nunca rosas ni marrones", "No tiene anillo"]},
```

En `suillus_bellinii` (`build.py:202-215`):
- `sombrero`: añade al final «S. collinitus, muy frecuente en los pinares de Alicante, tiene el sombrero pardo rojizo, más uniforme.», si el dosier lo respalda.
- `pie`: añade al final «En S. collinitus el pie lleva micelio rosado en la base.».
- `habitat`: cambia «Frecuente en Andalucía y en Cádiz.» por «Frecuente en Andalucía. S. collinitus y S. bellinii tienen registros en GBIF en la zona de Alicante.».
- `rasgos_clave`: añade «S. collinitus: base del pie con micelio rosado» (quedan 5).
- `fuentes`: suma `fn("suillus-collinitus", "Suillus collinitus")` y `gbif(<KEY>, "Suillus collinitus")`.

En `lactarius_deliciosus`:
- `habitat`: cambia «Muy frecuente en toda Andalucía.» por «Muy frecuente en toda Andalucía. En la zona de Alicante domina L. sanguifluus, en pinares de P. halepensis sobre caliza.».
- `fuentes`: suma `IECT_LD` y `gbif(<KEY>, "Lactarius sanguifluus")`.
- `toxicidad_nota`: **no se toca** (pregunta abierta, y ya cita *L. sanguifluus*, *L. semisanguifluus* y *L. vinosus*). Si el dosier aporta un rasgo de *L. vinosus* o *L. semisanguifluus*, va en `carne_y_corte` y no en la nota.

En las demás fichas de la lista de Task 1 Step 1 que tengan registros en Alicante, añade al final de `habitat` la frase «Con registros en GBIF en la zona de Alicante.» y en `fuentes` su `gbif(<KEY>, "<binomio>")`. No se toca ninguna otra frase del hábitat.

`DESC` (antes de `for e in E:`): añade una descripción por cada foto con un rasgo que decide:

```python
 "fotos/morchella_spp_1.jpg": "Cortada en vertical: una sola cavidad",
 "fotos/gyromitra_esculenta_1.jpg": "Cortada: cámaras y tabiques por dentro",
 "fotos/tricholoma_equestre_1.jpg": "Láminas amarillo azufre",
 "fotos/tricholoma_pardinum_1.jpg": "Escamas oscuras sobre fondo claro",
 "fotos/suillus_bellinii_3.jpg": "S. collinitus: micelio rosado en la base del pie",
 "fotos/lactarius_deliciosus_3.jpg": "L. sanguifluus: látex rojo vino",
```

Ajusta los números `_1` y `_3` al orden real de las fotos de Task 2. Cada descripción tiene que ser verdad de **esa** foto (mírala).

- [ ] **Step 5: Generar y validar**

```bash
python3 guia/_build/build.py guia/_build/fotos.json guia/especies.json
python3 guia/_build/creditos.py guia/especies.json guia/CREDITOS.md
python3 guia/validar.py
```

Esperado:
- `build.py`: `37 especies`.
- `validar.py`: `Especies: 37`, `Fotos: 111`, `OK` y ningún `ERROR`.

Los `AVISO: … comestible sin parecido tóxico/mortal enlazado` que queden tienen que coincidir con la lista de la puerta de Task 1 Step 3. Si sale `asimetría`, falta la entrada inversa (Step 4).

- [ ] **Step 6: Auditoría de redacción**

```bash
python3 - <<'EOF'
import json, re
AV = "Considerada comestible por la bibliografía; consumir solo con confirmación de un experto (micólogo, sociedad micológica o farmacia)."
MAL = re.compile(r"comestib|se puede[n]? comer|apta?s? para (el )?consumo|sin peligro|segur[ao]s? para|SCO/3303", re.I)
NUEVAS = {"tricholoma_terreum","hygrophorus_latitabundus","morchella_spp","tricholoma_pardinum","tricholoma_equestre","gyromitra_esculenta","clitocybe_dealbata"}
def textos(o, r=""):
    if isinstance(o, str): yield r, o
    elif isinstance(o, list):
        for i, x in enumerate(o): yield from textos(x, f"{r}[{i}]")
    elif isinstance(o, dict):
        for k, v in o.items(): yield from textos(v, f"{r}.{k}")
fallos = 0
for e in json.load(open("guia/especies.json")):
    for r, t in textos(e, e["id"]):
        if ".fuentes" in r or ".fotos" in r: continue
        if e["id"] in NUEVAS or "Alicante" in t or "collinitus" in t:
            if MAL.search(t.replace(AV, "")): print("FALLO", r, t); fallos += 1
print("fallos:", fallos)
EOF
git diff -U0 guia/especies.json | grep '^+' | grep -i 'comestib' | grep -v 'Considerada comestible por la bibliografía; consumir solo con confirmación de un experto'
```

Esperado: `fallos: 0` y el `grep` final sin salida.

- [ ] **Step 7: Commit**

```bash
git add guia/_build/build.py guia/especies.json guia/CREDITOS.md
git commit -m "feat(guia): negrilla, llenega, colmenilla y sus tóxicas; variantes y hábitat de Alicante

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Especies del mapa de Alicante que se describen en otra ficha

**Files:**
- Modify: `app/src/guia.ts:79-92`
- Modify: `app/src/selector-especie.ts:24-28`
- Test: `app/src/guia.test.ts`

**Interfaces:**
- Consumes: ids `suillus_bellinii` y `terfezia_arenaria` (existen).
- Produces: `FICHA_DE_ESPECIE_MAPA` con `suillus_collinitus → suillus_bellinii` y `terfezia_claveryi → terfezia_arenaria`; `DESCRITA_EN_OTRA_FICHA` con las dos; `export function textoFichaDe(f: Ficha): string`. Task 6 importa `fichaDeEspecieMapa`.

- [x] **Step 1: Test que falla**

Añade al final del `describe` de `guia.test.ts` que contiene el test de `lactarius_sanguifluus`:

```ts
  it('especies del mapa de Alicante descritas en otra ficha', async () => {
    const { fichaDeEspecieMapa, DESCRITA_EN_OTRA_FICHA } = await import('./guia');
    expect(fichaDeEspecieMapa('suillus_collinitus')).toBe('suillus_bellinii');
    expect(fichaDeEspecieMapa('terfezia_claveryi')).toBe('terfezia_arenaria');
    for (const id of ['lactarius_sanguifluus', 'suillus_collinitus', 'terfezia_claveryi']) expect(DESCRITA_EN_OTRA_FICHA.has(id), id).toBe(true);
  });
  it('textoFichaDe: artículo según el nombre común y binomio sin pasar a minúsculas', async () => {
    const { textoFichaDe } = await import('./guia');
    const f = (id: string) => fichas.find((x) => x.id === id)!;
    expect(textoFichaDe(f('lactarius_deliciosus'))).toBe('En la ficha del níscalo');
    expect(textoFichaDe(f('terfezia_arenaria'))).toBe('En la ficha de la criadilla de tierra');
    expect(textoFichaDe(f('suillus_bellinii'))).toBe('En la ficha de Suillus bellinii');
  });
```

(`fichas` ya está definido al principio de `guia.test.ts`. Si se llama distinto, usa ese nombre.)

- [x] **Step 2: Comprobar que falla**

Run: `cd app && npx vitest run src/guia.test.ts`
Expected: FAIL (`expected 'suillus_collinitus' to be 'suillus_bellinii'` y `textoFichaDe is not a function`).

- [x] **Step 3: Implementación**

En `guia.ts`, sustituye el bloque de las líneas 79-92 por:

```ts
/**
 * Especies del mapa (manifest) cuya ficha tiene otro id. GBIF trata Boletus aestivalis como sinónimo de
 * B. reticulatus, y la guía la describe como «Boletus reticulatus (= B. aestivalis)». Las de Alicante
 * (S. collinitus, T. claveryi) van en la ficha de su especie próxima.
 */
export const FICHA_DE_ESPECIE_MAPA: Record<string, string> = {
  boletus_aestivalis: 'boletus_reticulatus',
  lactarius_sanguifluus: 'lactarius_deliciosus',
  suillus_collinitus: 'suillus_bellinii',
  terfezia_claveryi: 'terfezia_arenaria',
};
/**
 * Especies del mapa sin ficha propia que la guía describe dentro de la ficha de otra especie (no son sinónimos):
 * el selector las muestra con su nombre científico y la foto de esa ficha. L. sanguifluus va en la del níscalo.
 */
export const DESCRITA_EN_OTRA_FICHA: ReadonlySet<string> = new Set(['lactarius_sanguifluus', 'suillus_collinitus', 'terfezia_claveryi']);
export const fichaDeEspecieMapa = (id: string) => FICHA_DE_ESPECIE_MAPA[id] ?? id;
/**
 * «En la ficha del níscalo» / «de la criadilla de tierra» (femenino si la primera palabra acaba en -a);
 * sin nombre común, el binomio tal cual: «En la ficha de Suillus bellinii».
 */
export function textoFichaDe(f: Ficha): string {
  const comun = nombreComun(f).toLocaleLowerCase('es-ES');
  if (!comun) return `En la ficha de ${binomio(f)}`;
  const de = /^(el|la|los|las) /.test(comun) ? 'de' : /^\S*a(\s|$)/.test(comun) ? 'de la' : 'del';
  return `En la ficha ${de} ${comun}`;
}
```

En `selector-especie.ts`, sustituye las líneas 25-27 por:

```ts
  if (ficha && DESCRITA_EN_OTRA_FICHA.has(e.id)) {
    return { comun: e.nombre, cientifico: textoFichaDe(ficha), miniatura: miniaturaEspecie(e.id, indiceGuia()) };
  }
```

y añade `textoFichaDe` al `import` desde `./guia` de ese archivo. Si `nombreComun` o `binomio` se quedan sin uso en `selector-especie.ts`, quítalos del import (`noUnusedLocals`).

- [x] **Step 4: Comprobar que pasa**

Run: `cd app && npx vitest run src/guia.test.ts && npx tsc --noEmit`
Expected: PASS y tsc sin errores. El e2e sigue esperando «En la ficha del níscalo» (`offline.e2e.mjs:172`), que no cambia.

- [x] **Step 5: Commit**

```bash
git add app/src/guia.ts app/src/selector-especie.ts app/src/guia.test.ts
git commit -m "feat(app): S. collinitus y T. claveryi en la ficha de su especie próxima

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Reglas de seguridad de Alicante y corrección de «láminas amarillas»

**Files:**
- Modify: `app/src/seguridad.ts:3-62` (grupos), `:72-111` (preguntas), `:121-174` (reglas y alertas)
- Modify: `app/src/comparar.ts:13-41`
- Test: `app/src/seguridad.test.ts`, `app/src/comparar.test.ts:83`, `app/src/gemini.test.ts:46-48`

**Interfaces:**
- Consumes: ids y grupos de las fichas de Task 3.
- Produces:
  - `GrupoMorfo` gana `'tricolomoide' | 'morcheloide' | 'clitociboide'`.
  - Preguntas nuevas `color_sombrero`, `tricholoma_sombrero`, `morchella_sombrero` y `morchella_interior`, más la opción `rosas_marrones` en `laminas_pie_color`. Total: 19 preguntas.

**Decisiones de diseño (de la revisión del código):**
- Una mortal no se descarta con una sola respuesta. Las amanitas dejan de descartarse solo por «láminas amarillas» y además piden «sombrero naranja o rojo», porque *A. phalloides* es verde oliva o amarillento, *A. verna* blanca y *A. pantherina* parda. *A. muscaria* (tóxica, de láminas blancas) conserva su descarte por láminas amarillas. El corte del huevo sigue descartando solo, porque es la prueba de referencia de la guía.
- *T. equestre* y *Gyromitra* (mortales si Task 1 lo confirma) piden dos rasgos. *T. pardinum* y *C. dealbata* (tóxicas) se descartan con un rasgo, igual que hoy las Caloboletus o los Lactarius tóxicos.
- No se usa `sombrero_mayor_10cm` en las reglas de Tricholoma, porque «no» dispara la alerta MORTAL de lepiota (`seguridad.ts:164`).
- Queda una plaza libre hasta 20. No se añade la pregunta «láminas decurrentes»: *C. dealbata* se descarta por láminas rosas o marrones (champiñón), y la senderuela no la descarta.

- [ ] **Step 1: Tests que fallan**

En `seguridad.test.ts`:

1. Sustituye la línea 12 (`const MORTALES = [...]`) por:

```ts
const MORTALES = fichas.filter((f) => f.grupo === 'mortal').map((f) => f.id);
```

2. En la tabla de `grupos morfológicos` (líneas 59-68), cambia `['Agaricus campestris', ['amanitoide']]` por `['Agaricus campestris', ['amanitoide', 'clitociboide']]` y añade:

```ts
    ['Tricholoma terreum', ['tricolomoide']], ['Tricholoma pardinum', ['tricolomoide']],
    ['Morchella esculenta', ['morcheloide']], ['Gyromitra gigas', ['morcheloide']], ['Verpa bohemica', ['morcheloide']],
    ['Clitocybe rivulosa', ['clitociboide']], ['Marasmius oreades', ['clitociboide']], ['Lepista nuda', ['clitociboide']],
    ['Hygrophorus latitabundus', ['otros']],
```

3. Sustituye el test `'láminas y pie amarillos descartan también muscaria'` (líneas 100-105) por:

```ts
  it('hallazgo del traspaso: «láminas amarillas» sola ya no descarta las amanitas mortales (solo muscaria)', () => {
    const e = evaluar(c, fichas, { laminas_pie_color: 'amarillos' });
    expect(noDescartadas(e)).toEqual(expect.arrayContaining(['amanita_phalloides', 'amanita_verna', 'amanita_pantherina']));
    expect(descartadas(e)).toEqual(['amanita_muscaria']);
  });
  it('«sombrero naranja o rojo» sola tampoco las descarta', () => {
    expect(descartadas(evaluar(c, fichas, { color_sombrero: 'naranja_rojo' }))).toEqual([]);
  });
  it('láminas y pie amarillos + sombrero naranja o rojo descartan phalloides, verna, pantherina y muscaria', () => {
    const e = evaluar(c, fichas, { laminas_pie_color: 'amarillos', color_sombrero: 'naranja_rojo' });
    expect(sinMortales(noDescartadas(e))).toEqual([]);
    expect(descartadas(e)).toEqual(expect.arrayContaining(['amanita_phalloides', 'amanita_verna', 'amanita_pantherina', 'amanita_muscaria']));
    expect(noDescartadas(e)).toContain('lepiota_brunneoincarnata');
  });
```

4. En el test de la línea 332 (`hallazgo de revisión…`), `Tricholoma sejunctum` ya no es «otros». Cambia el array de candidatos por `[{ nombre: 'Hygrocybe acutoconica' }, { nombre: 'Russula aurea' }]` y el título por `'top-5 solo de géneros «otros» (Hygrocybe, Russula) → …'`.

5. En `datos de seguridad coherentes con la guía` añade:

```ts
  it('cada alerta tiene el nivel del grupo de la ficha de sus especies', () => {
    for (const a of ALERTAS) for (const id of a.especies) expect(porId.get(id)?.grupo, `${id} en «${a.texto}»`).toBe(a.nivel);
  });
  it('ninguna mortal se descarta con una sola respuesta, salvo el corte del huevo', () => {
    for (const r of DESCARTES) if (porId.get(r.especie)?.grupo === 'mortal' && !('interior_huevo' in r.si))
      expect(Object.keys(r.si).length, `${r.especie}: ${r.motivo}`).toBeGreaterThanOrEqual(2);
  });
```

6. Añade antes de `describe('cada regla de descarte exige…')`:

```ts
describe('negrilla (Tricholoma terreum)', () => {
  const c = cand('tricholoma_terreum');
  it('activa tricolomoide y lista T. pardinum y T. equestre «se confunde con», más las mortales', () => {
    const e = evaluar(c, fichas, {});
    expect(e.grupos).toEqual(['tricolomoide']);
    expect(noDescartadas(e)).toEqual(expect.arrayContaining(['tricholoma_pardinum', 'tricholoma_equestre']));
    expect(e.peligrosas.find((p) => p.id === 'tricholoma_pardinum')!.origen).toEqual(expect.arrayContaining(['se confunde con Tricholoma terreum']));
    mortalesPresentes(e);
    expect(e.preguntas.map((p) => p.id)).toEqual(expect.arrayContaining(['tricholoma_sombrero', 'laminas_pie_color', 'color_sombrero']));
  });
  it('sombrero de fieltro gris descarta T. pardinum; láminas blancas y sombrero gris descartan T. equestre', () => {
    const e = evaluar(c, fichas, { tricholoma_sombrero: 'fieltro_gris', laminas_pie_color: 'blancos', color_sombrero: 'gris' });
    expect(descartadas(e)).toEqual(expect.arrayContaining(['tricholoma_pardinum', 'tricholoma_equestre']));
  });
  it('una sola respuesta no descarta T. equestre', () => {
    for (const r of [{ laminas_pie_color: 'blancos' }, { color_sombrero: 'gris' }] as Respuestas[])
      expect(descartadas(evaluar(c, fichas, r))).not.toContain('tricholoma_equestre');
  });
  it('escamas oscuras → alerta TÓXICA de T. pardinum; láminas amarillas + sombrero amarillo verdoso → alerta de T. equestre', () => {
    const p = evaluar(c, fichas, { tricholoma_sombrero: 'escamas_oscuras' });
    expect(p.alertas.map((a) => a.especies).flat()).toContain('tricholoma_pardinum');
    const q = evaluar(c, fichas, { laminas_pie_color: 'amarillos', color_sombrero: 'amarillo_verdoso' });
    expect(q.alertas.find((a) => a.especies.includes('tricholoma_equestre'))?.nivel).toBe(porId.get('tricholoma_equestre')!.grupo);
    expect(noDescartadas(q)).toContain('tricholoma_equestre');
  });
  it('volva en saco y sombrero naranja descartan T. equestre (los Tricholoma no tienen volva)', () => {
    // oronja + negrilla en el top-5: T. equestre está en la lista por «se confunde con» sea mortal o tóxica
    const e = evaluar(cand('amanita_caesarea', 'tricholoma_terreum'), fichas, { volva_saco: 'si', color_sombrero: 'naranja_rojo' });
    expect(descartadas(e)).toContain('tricholoma_equestre');
  });
});

describe('colmenilla (Morchella)', () => {
  const c = cand('morchella_spp');
  it('activa morcheloide y lista Gyromitra, con las dos preguntas del sombrero y del corte', () => {
    const e = evaluar(c, fichas, {});
    expect(e.grupos).toEqual(['morcheloide']);
    expect(noDescartadas(e)).toContain('gyromitra_esculenta');
    expect(e.preguntas.map((p) => p.id)).toEqual(expect.arrayContaining(['morchella_sombrero', 'morchella_interior']));
  });
  it('solo celdas + hueca la descartan; una sola respuesta no', () => {
    expect(descartadas(evaluar(c, fichas, { morchella_sombrero: 'alveolos', morchella_interior: 'hueca' }))).toContain('gyromitra_esculenta');
    expect(descartadas(evaluar(c, fichas, { morchella_sombrero: 'alveolos' }))).not.toContain('gyromitra_esculenta');
    expect(descartadas(evaluar(c, fichas, { morchella_interior: 'hueca' }))).not.toContain('gyromitra_esculenta');
  });
  it('sombrero como un cerebro o cámaras por dentro → alerta, y ya no se descarta', () => {
    for (const r of [{ morchella_sombrero: 'cerebro' }, { morchella_interior: 'tabiques', morchella_sombrero: 'alveolos' }] as Respuestas[]) {
      const e = evaluar(c, fichas, r);
      expect(e.alertas.some((a) => a.especies.includes('gyromitra_esculenta'))).toBe(true);
      expect(noDescartadas(e)).toContain('gyromitra_esculenta');
    }
  });
});

describe('champiñón, senderuela y Clitocybe (grupo clitociboide)', () => {
  it('el champiñón lista C. dealbata (grupo y «no confundir») además de las amanitas', () => {
    const e = evaluar(cand('agaricus_campestris'), fichas, {});
    expect(e.grupos).toEqual(['amanitoide', 'clitociboide']);
    expect(noDescartadas(e)).toContain('clitocybe_dealbata');
  });
  it('láminas rosas o marrones descartan C. dealbata; blancas no', () => {
    const c = cand('agaricus_campestris');
    expect(descartadas(evaluar(c, fichas, { laminas_pie_color: 'rosas_marrones' }))).toContain('clitocybe_dealbata');
    expect(descartadas(evaluar(c, fichas, { laminas_pie_color: 'blancos' }))).not.toContain('clitocybe_dealbata');
  });
  it('una senderuela (sin ficha) activa el grupo y trae C. dealbata', () => {
    const e = evaluar([{ nombre: 'Marasmius oreades' }], fichas, {});
    expect(e.grupos).toEqual(['clitociboide']);
    expect(noDescartadas(e)).toContain('clitocybe_dealbata');
  });
});
```

- [ ] **Step 2: Comprobar que falla**

Run: `cd app && npx vitest run src/seguridad.test.ts`
Expected: FAIL. Fallan los grupos (`'tricolomoide'` no existe), `color_sombrero` (`PREGUNTA[q]` sin definir) y el hallazgo (phalloides sale descartada con solo «amarillos»).

- [ ] **Step 3: Implementación en `seguridad.ts`**

Cabecera, línea 5: cambia la lista por `(amanitoide, boletoide, cantareloide, lepiotoide, lactarioide, hipogeo, tricolomoide, morcheloide, clitociboide)`.

Línea 18:

```ts
export type GrupoMorfo = 'amanitoide' | 'boletoide' | 'cantareloide' | 'lepiotoide' | 'lactarioide' | 'hipogeo'
  | 'tricolomoide' | 'morcheloide' | 'clitociboide' | 'otros';
```

`NOMBRE_GRUPO` (antes de `otros:`):

```ts
  tricolomoide: 'Negrillas y otros Tricholoma (láminas, sin anillo ni volva)',
  morcheloide: 'Colmenillas y falsas colmenillas',
  clitociboide: 'Setas de prado de láminas claras (Clitocybe, senderuela, champiñón)',
```

Después de la línea 47 (último `asignar`):

```ts
// Alicante (fase D1): la negrilla se confunde con T. pardinum y T. equestre; la colmenilla con Gyromitra (y Verpa,
// Helvella); el champiñón, la senderuela y Lepista con las Clitocybe blancas de prado.
asignar('tricolomoide', 'Tricholoma');
asignar('morcheloide', 'Morchella Mitrophora Gyromitra Verpa Helvella Disciotis');
asignar('clitociboide', 'Clitocybe Infundibulicybe Marasmius Lepista Collybia Agaricus');
```

`PELIGROSAS_GRUPO` (antes de `otros: []`):

```ts
  tricolomoide: ['tricholoma_pardinum', 'tricholoma_equestre'],
  morcheloide: ['gyromitra_esculenta'],
  clitociboide: ['clitocybe_dealbata'],
```

`PREGUNTAS`. Sustituye la entrada `laminas_pie_color` (líneas 76-77) por las dos siguientes:

```ts
  { id: 'laminas_pie_color', grupo: 'amanitoide', texto: '¿De qué color son las láminas y el pie?',
    opciones: [op('amarillos', 'Amarillos'), op('blancos', 'Blancos o grisáceos'), op('rosas_marrones', 'Láminas rosas o marrones'),
      op('otro', 'Otro color'), op(NO_SE, 'No sé')] },
  { id: 'color_sombrero', grupo: 'amanitoide', texto: '¿De qué color es el sombrero?',
    ayuda: 'Míralo con luz de día. Si tiene escamas o verrugas, fíjate en el color del fondo.',
    opciones: [op('naranja_rojo', 'Naranja o rojo'), op('amarillo_verdoso', 'Amarillo, verdoso o verde oliva'), op('blanco', 'Blanco'),
      op('gris', 'Gris'), op('pardo', 'Pardo o marrón'), op('otro', 'Otro color'), op(NO_SE, 'No sé')] },
```

Antes del cierre `];` de `PREGUNTAS` (línea 111):

```ts
  { id: 'tricholoma_sombrero', grupo: 'tricolomoide', texto: 'Mira la superficie del sombrero de cerca: ¿cómo es?',
    opciones: [op('fieltro_gris', 'Gris ratón, como de fieltro o con fibras finas'),
      op('escamas_oscuras', 'Con escamas oscuras y gruesas sobre fondo más claro'), op('otro', 'Otra cosa'), op(NO_SE, 'No sé')] },

  { id: 'morchella_sombrero', grupo: 'morcheloide', texto: '¿Cómo es la superficie del sombrero?',
    opciones: [op('alveolos', 'Celdas hundidas, como un panal'), op('cerebro', 'Pliegues como un cerebro'), op(NO_SE, 'No sé')] },
  { id: 'morchella_interior', grupo: 'morcheloide', texto: 'Córtala de arriba abajo: ¿cómo es por dentro?',
    ayuda: 'Haz una foto del corte.',
    opciones: [op('hueca', 'Hueca, una sola cavidad de arriba abajo'), op('tabiques', 'Con cámaras, tabiques o relleno como de algodón'),
      op(NO_SE, 'No sé')] },
```

`DESCARTES`. Sustituye las líneas 122-126 por:

```ts
  // Amanitas: huevo naranja/amarillo por dentro, o DOS rasgos de la oronja: láminas y pie amarillos y sombrero naranja
  // o rojo (A. phalloides es verde oliva o amarillento, A. verna blanca y A. pantherina parda). Hallazgo del traspaso:
  // «láminas amarillas» sola descartaba las mortales.
  ...['amanita_phalloides', 'amanita_verna', 'amanita_pantherina'].flatMap((especie): Regla[] => [
    { especie, si: { interior_huevo: ['naranja_amarillo'] }, motivo: 'interior del huevo naranja y amarillo' },
    { especie, si: { laminas_pie_color: ['amarillos'], color_sombrero: ['naranja_rojo'] }, motivo: 'láminas y pie amarillos y sombrero naranja o rojo' },
  ]),
```

Antes del cierre `];` de `DESCARTES` (línea 157):

```ts
  // Tricholoma (Alicante). T. equestre (mortal): dos rasgos. T. pardinum (tóxica): su sombrero de escamas gruesas.
  { especie: 'tricholoma_equestre', si: { laminas_pie_color: ['blancos', 'rosas_marrones'], color_sombrero: ['gris', 'blanco'] },
    motivo: 'láminas no amarillas y sombrero gris o blanco' },
  { especie: 'tricholoma_equestre', si: { volva_saco: ['si'], color_sombrero: ['naranja_rojo'] },
    motivo: 'volva en saco y sombrero naranja o rojo (los Tricholoma no tienen volva)' },
  { especie: 'tricholoma_pardinum', si: { tricholoma_sombrero: ['fieltro_gris'] }, motivo: 'sombrero gris de fieltro, sin escamas gruesas' },

  // Gyromitra (mortal) frente a colmenilla: celdas como un panal y hueca en una sola cavidad.
  { especie: 'gyromitra_esculenta', si: { morchella_sombrero: ['alveolos'], morchella_interior: ['hueca'] },
    motivo: 'sombrero con celdas como un panal y hueca por dentro en una sola cavidad' },

  // Clitocybe blancas de prado (tóxicas): el champiñón tiene láminas rosas o marrones; las de Clitocybe son blancas o crema.
  { especie: 'clitocybe_dealbata', si: { laminas_pie_color: ['rosas_marrones'] }, motivo: 'láminas rosas o marrones' },
```

`ALERTAS`, antes del cierre `];` (línea 174). Usa como `nivel` de *T. equestre* y *Gyromitra* el `grupo` que fijó Task 3. El test de Step 1.5 falla si no coinciden. Con el texto pasa lo mismo: «MORTAL» o «TÓXICA».

```ts
  { nivel: 'mortal', especies: ['tricholoma_equestre'], si: { laminas_pie_color: ['amarillos'], color_sombrero: ['amarillo_verdoso'] },
    texto: 'Láminas amarillas y sombrero amarillo verdoso: rasgos de Tricholoma equestre, que ha causado intoxicaciones musculares MORTALES.' },
  { nivel: 'toxica', especies: ['tricholoma_pardinum'], si: { tricholoma_sombrero: ['escamas_oscuras'] },
    texto: 'Escamas oscuras y gruesas sobre fondo claro: rasgo de Tricholoma pardinum, TÓXICA.' },
  { nivel: 'mortal', especies: ['gyromitra_esculenta'], si: { morchella_sombrero: ['cerebro'] },
    texto: 'Sombrero con pliegues como un cerebro: rasgo de Gyromitra, la falsa colmenilla, MORTAL.' },
  { nivel: 'mortal', especies: ['gyromitra_esculenta'], si: { morchella_interior: ['tabiques'] },
    texto: 'Por dentro tiene cámaras o tabiques: rasgo de Gyromitra, la falsa colmenilla, MORTAL. La colmenilla es hueca.' },
```

Comentario de la línea 45: cambia «Pleurotus (seta de cardo) no tiene parecidas peligrosas en la guía: «otros».» por «Pleurotus (seta de cardo) va a «otros»; sus parecidas salen por «No confundir con…».».

- [ ] **Step 4: `comparar.ts`**

En `RASGOS` (líneas 13-22):

```ts
  { clave: 'carne_y_corte', titulo: 'Carne y corte', preguntas: ['azulea_al_corte', 'carne_enrojece', 'color_latex', 'interior_gleba', 'morchella_interior'] },
  { clave: 'sombrero', titulo: 'Sombrero', preguntas: ['color_sombrero', 'tricholoma_sombrero', 'morchella_sombrero', 'sombrero_mayor_10cm', 'piel_dura_escamosa'] },
```

En `FOTO_PREGUNTA`, después de `laminas_pie_color`:

```ts
  color_sombrero: 'el sombrero desde arriba, con luz de día',
  tricholoma_sombrero: 'la superficie del sombrero, de cerca',
  morchella_sombrero: 'el sombrero entero, de lado',
  morchella_interior: 'el corte de arriba abajo, por dentro',
```

`comparar.test.ts:83`:

```ts
    expect(preguntasQueDeciden('amanita_phalloides')).toEqual(new Set(['interior_huevo', 'laminas_pie_color', 'color_sombrero', 'volva_saco', 'interior_gleba']));
```

`gemini.test.ts:46-48`. La entrada local tiene que seguir descartando phalloides para probar que Gemini la reactiva:

```ts
    const loc = evaluar(c, fichas, { laminas_pie_color: 'amarillos', color_sombrero: 'naranja_rojo' }).peligrosas;   // amanitas descartadas; las mortales de otros grupos siguen
```

- [ ] **Step 5: Tests y cobertura**

Run: `cd app && npx vitest run src/seguridad.test.ts src/comparar.test.ts src/gemini.test.ts && npm test && npm run cobertura && npx tsc --noEmit`
Expected: todo PASS, `seguridad.ts` y `reconocer-nucleo.ts` al 100 % en líneas, ramas, funciones y sentencias, y `PREGUNTAS.length` = 19 (test existente `≤ 20`). Si algún test antiguo falla por las mortales nuevas (por ejemplo, el orden de `comparar.test.ts:18`), revisa que el fallo sea solo por la mortal nueva que se lista siempre y ajusta la expectativa a esa causa. No se debilita ninguna comprobación de seguridad.

- [ ] **Step 6: Commit**

```bash
git add app/src/seguridad.ts app/src/seguridad.test.ts app/src/comparar.ts app/src/comparar.test.ts app/src/gemini.test.ts
git commit -m "feat(seguridad): negrilla, colmenilla y Clitocybe; las amanitas mortales ya no caen con una sola respuesta

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Test de spec §7.5 (cada comestible activa tiene una confusión tóxica con ficha)

**Files:**
- Create: `app/src/seguridad-regiones.test.ts`

**Interfaces:**
- Consumes: `pipeline/regiones/*.yaml` del plan A (clave `especies.activas`, lista en flujo, `docs/superpowers/plans/2026-10-15-multi-region-fase-a-pipeline.md:1429-1433`), `fichaDeEspecieMapa` y `COMESTIBLES` de `./guia` (Task 4).
- Produces: nada que use otra tarea.

- [ ] **Step 1: Escribir el test**

```ts
// Spec multi-región §7.5: cada comestible activa en alguna región tiene al menos una confusión tóxica o mortal con
// ficha en «No confundir con…». Lee las regiones de pipeline/regiones/*.yaml. Para una región que aún no tenga YAML
// (plan sin fusionar), usa el catálogo de la spec.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import datos from '../../guia/especies.json';
import { COMESTIBLES, fichaDeEspecieMapa, type Ficha } from './guia';

const fichas = datos as Ficha[];
const porId = new Map(fichas.map((f) => [f.id, f]));
const DIR = fileURLToPath(new URL('../../pipeline/regiones/', import.meta.url));

/** Catálogo de respaldo: Marbella (plan A, marbella.yaml) y Alicante (spec §1.3 y §3.5). */
const RESPALDO: Record<string, string[]> = {
  marbella: ['boletus_aereus', 'boletus_aestivalis', 'boletus_edulis', 'boletus_pinophilus', 'amanita_caesarea',
    'lactarius_deliciosus', 'lactarius_sanguifluus', 'cantharellus_cibarius', 'amanita_ponderosa',
    'macrolepiota_procera', 'pleurotus_eryngii', 'terfezia_arenaria'],
  alicante: ['lactarius_sanguifluus', 'tricholoma_terreum', 'hygrophorus_latitabundus', 'suillus_collinitus', 'lepista_nuda',
    'agaricus_campestris', 'hydnum_repandum', 'pleurotus_eryngii', 'morchella_spp', 'terfezia_claveryi'],
};

/**
 * Excepciones aprobadas por Alexander (con fecha y fuente en docs/investigacion/2026-10-15-fichas-alicante.md §3):
 * id de ficha → motivo. Vacío salvo decisión explícita suya; nunca se rellena para que el test pase.
 */
const EXCEPCIONES_APROBADAS: Record<string, string> = {};

/** `especies.activas` de una YAML de región, en flujo ([a, b], también en varias líneas) o en bloque (- a). Sin dependencias. */
function activasDeYaml(texto: string): string[] {
  const m = /^especies:[^\n]*\n(?:[ \t]+[^\n]*\n)*?[ \t]+activas:[ \t]*(\[[^\]]*\]|(?:\n[ \t]+-[^\n]*)+)/m.exec(texto);
  if (!m) return [];
  const limpio = m[1].split('\n').map((l) => l.replace(/#.*/, '')).join('\n').trim();
  const items = limpio.startsWith('[') ? limpio.slice(1, limpio.lastIndexOf(']')).split(',') : limpio.split('\n').map((l) => l.replace(/^\s*-\s*/, ''));
  return items.map((s) => s.trim()).filter(Boolean);
}

function regiones(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (existsSync(DIR)) for (const f of readdirSync(DIR).filter((x) => x.endsWith('.yaml')))
    out[f.replace(/\.yaml$/, '')] = activasDeYaml(readFileSync(DIR + f, 'utf8'));
  for (const [id, lista] of Object.entries(RESPALDO)) out[id] ??= lista;
  return out;
}

describe('lector de especies.activas', () => {
  it('lista en flujo de varias líneas, con comentarios', () => {
    const y = 'id: x\nespecies:          # orden\n  activas: [a, b,   # c\n            d]\n  sin_habitat: []\nlegal: {}\n';
    expect(activasDeYaml(y)).toEqual(['a', 'b', 'd']);
  });
  it('lista en bloque', () => {
    expect(activasDeYaml('especies:\n  activas:\n    - a\n    - b\n  sin_habitat: []\n')).toEqual(['a', 'b']);
  });
  it('sin clave → vacío', () => expect(activasDeYaml('id: x\n')).toEqual([]));
});

describe('spec §7.5: comestibles activas con su confusión peligrosa', () => {
  const R = regiones();
  it('cada región tiene especies activas (el lector no falla en silencio)', () => {
    for (const [id, lista] of Object.entries(R)) expect(lista.length, id).toBeGreaterThan(0);
  });
  it('cada especie activa tiene ficha en la guía', () => {
    for (const [reg, lista] of Object.entries(R)) for (const e of lista)
      expect(porId.has(fichaDeEspecieMapa(e)), `${reg}: ${e} → ${fichaDeEspecieMapa(e)}`).toBe(true);
  });
  it('cada comestible activa enlaza al menos una tóxica o mortal con ficha', () => {
    const sin: string[] = [];
    for (const [reg, lista] of Object.entries(R)) for (const e of lista) {
      const f = porId.get(fichaDeEspecieMapa(e));
      if (!f || !COMESTIBLES.has(f.grupo) || EXCEPCIONES_APROBADAS[f.id]) continue;
      const peligrosas = f.no_confundir_con.filter((c) => ['toxica', 'mortal'].includes(porId.get(c.id)?.grupo ?? ''));
      if (!peligrosas.length) sin.push(`${reg}: ${e} (ficha ${f.id})`);
    }
    expect(sin).toEqual([]);
  });
  it('las excepciones aprobadas siguen haciendo falta (si no, se borran)', () => {
    for (const id of Object.keys(EXCEPCIONES_APROBADAS))
      expect(porId.get(id)?.no_confundir_con.some((c) => ['toxica', 'mortal'].includes(porId.get(c.id)?.grupo ?? '')), id).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar**

Run: `cd app && npx vitest run src/seguridad-regiones.test.ts`

Expected: los tests del lector y «cada especie activa tiene ficha» pasan. «cada comestible activa enlaza…» pasa solo si la puerta de Task 1 Step 3 se resolvió con fuentes. Si falla, el mensaje lista las fichas que faltan (por ejemplo `alicante: hydnum_repandum (ficha hydnum_repandum)`): **para** y lleva esa lista al hilo principal para que Alexander decida. No se rellena `EXCEPCIONES_APROBADAS` sin su respuesta.

- [ ] **Step 3: Commit** (con el test en verde, o en rojo solo si el hilo principal lo autoriza y anota la decisión pendiente en el mensaje)

```bash
git add app/src/seguridad-regiones.test.ts
git commit -m "test(seguridad): cada comestible activa en una región tiene una confusión tóxica con ficha (spec §7.5)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Vocabulario del reconocedor, regeneración y umbral de «no reconocido»

El vocabulario cambia siempre que entra una ficha nueva: `construir.py:vocabulario()` añade el binomio de cada ficha y su id `g`. Además se suman afines, así que hay que regenerar el texto y la referencia. La torre de visión no cambia, así que basta con `--solo-texto` y no hace falta exportar de nuevo el ONNX.

**Comprobación hecha al escribir el plan:**

| Taxón | ¿En `df20_especies.txt` o `extra.txt`? | Entra como |
|---|---|---|
| Tricholoma terreum | sí (df20) | ficha (`guia`) |
| Tricholoma pardinum | **no** | ficha (`guia`, etiqueta nueva) |
| Tricholoma equestre | sí (df20 y extra) | ficha (`guia`) |
| Tricholoma auratum, T. flavovirens | **no** | `afin` → `tricholoma_equestre` (etiquetas nuevas) |
| Hygrophorus latitabundus | **no** | ficha (`guia`, etiqueta nueva) |
| Hygrophorus limacinus | **no** | `afin` → `hygrophorus_latitabundus` (etiqueta nueva) |
| Morchella esculenta, M. conica | sí (df20) | ficha (`guia`, por el binomio de `morchella_spp`) y `afin` |
| Morchella elata | **no** | `afin` → `morchella_spp` (etiqueta nueva) |
| Gyromitra esculenta, G. gigas | sí (df20) | ficha (`guia`) y `afin` |
| Clitocybe dealbata | **no** | ficha (`guia`, etiqueta nueva) |
| Clitocybe rivulosa | sí (df20) | `afin` → `clitocybe_dealbata` |
| Suillus collinitus | sí (df20) | `afin` → `suillus_bellinii` |
| Lactarius semisanguifluus | **no** | `afin` → `lactarius_deliciosus` (etiqueta nueva) |
| Lactarius vinosus, L. sanguifluus | sí | ya son `afin` |

Simulación de `vocabulario()` con estos cambios: **1603 → 1611 etiquetas** y `texto_f16.bin` de 1 641 472 → **1 649 664 bytes** (1611 × 512 × 2).

**Files:**
- Modify: `modelo/vocabulario/alias.json`
- Modify: `modelo/construir.py` (`construir()`, `referencia()` y argparse)
- Output: `modelo/referencia.json`, y en la carpeta de salida del modelo `texto_f16.bin`, `etiquetas.json` y `paquete.json`
- Modify: `app/src/reconocer-nucleo.ts:23-33`
- Test: `app/src/reconocer-nucleo.test.ts`

**Interfaces:**
- Consumes: fichas de Task 3 (los binomios `Tricholoma terreum`, `Hygrophorus latitabundus`, `Morchella esculenta`, `Tricholoma pardinum`, `Tricholoma equestre`, `Gyromitra esculenta` y `Clitocybe dealbata` salen de `nombre_cientifico`).
- Produces: `referencia.json` con la clave nueva `coseno_max_ajenas_reales: {n, max, p95, nota}`, y `UMBRAL_NO_RECONOCIDO = 0.28`.

**Evidencia del umbral (medida al escribir el plan con el modelo actual, 1603 etiquetas):** el script de medida queda en el scratchpad de la sesión de planificación y no está versionado.
- 90 fotos de la guía, coseno máximo: mín 0,236, p05 0,289, p10 0,307, mediana 0,335. Las que quedan por debajo de 0,28 son `terfezia_arenaria_1` (0,236), `pleurotus_eryngii_1` (0,267) y `terfezia_arenaria_3` (0,276).
- 37 fotos reales sin setas (piscinas, jardines, paisajes, interiores, de otras carpetas de `~/Documents/Claude`): mín 0,176, mediana 0,240, **máx 0,2763**. Con 0,27, 3 de 37 pasan como «reconocidas». Con 0,28, ninguna.
- `referencia.json`: ruido 0,2616, azul 0,2472 y gris 0,3099. El gris pasa con cualquier umbral razonable: es una limitación conocida, y el comentario del código ya la cuenta.
- Propuesta: **0,28**, el primer múltiplo de 0,005 por encima del máximo de las ajenas reales. Deja fuera 3 de 90 fotos de la guía (3,3 %, por debajo del p05). Subir el umbral es seguro por diseño: con «no reconocido» las mortales se siguen listando todas (`seguridad.ts:225`).

- [ ] **Step 1: Afines nuevas**

En `alias.json`, dentro de `"afin"`, después de `"Terfezia leptoderma": "terfezia_arenaria"`:

```json
    "Terfezia leptoderma": "terfezia_arenaria",
    "Lactarius semisanguifluus": "lactarius_deliciosus",
    "Suillus collinitus": "suillus_bellinii",
    "Tricholoma auratum": "tricholoma_equestre",
    "Tricholoma flavovirens": "tricholoma_equestre",
    "Hygrophorus limacinus": "hygrophorus_latitabundus",
    "Morchella conica": "morchella_spp",
    "Morchella elata": "morchella_spp",
    "Gyromitra gigas": "gyromitra_esculenta",
    "Clitocybe rivulosa": "clitocybe_dealbata"
```

Todas van como `afin` y no como `sinonimo`, aunque algunas fuentes las den por sinónimos. `afin` las enseña con su nombre y enlaza a la ficha, y así no se afirma una sinonimia que el dosier no haya comprobado. Actualiza la frase de afines en `modelo/README.md` (línea «marca especies afines (…)») con estas 9.

- [ ] **Step 2: `--ajenas` en `construir.py`**

Firma y llamada. En `construir(solo_texto: bool = False)` → `construir(solo_texto: bool = False, ajenas: list[Path] | None = None)`. La llamada `referencia(i8, preprocess, texto, meta)` → `referencia(i8, preprocess, texto, meta, ajenas or [])`.

En `referencia()`, firma `def referencia(onnx_path, preprocess, texto, meta, ajenas_reales: list[Path] = ()):`. Antes de escribir el archivo (justo antes de `ref["coseno_max_fotos_guia"] = …`), añade:

```python
    previa = json.loads((RAIZ / "referencia.json").read_text()) if (RAIZ / "referencia.json").exists() else {}
    if ajenas_reales:
        m = sorted(float((T @ emb(Image.open(p))).max()) for p in ajenas_reales)
        ref["coseno_max_ajenas_reales"] = {
            "n": len(m), "max": round(m[-1], 4), "p95": round(m[min(len(m) - 1, int(len(m) * 0.95))], 4),
            "nota": "fotos locales sin setas (paisajes, piscinas, jardines, interiores); no versionadas"}
    elif "coseno_max_ajenas_reales" in previa:
        ref["coseno_max_ajenas_reales"] = previa["coseno_max_ajenas_reales"]
```

Y en el `print` final añade `ref.get("coseno_max_ajenas_reales")`.

Argparse:

```python
    ap.add_argument("--ajenas", nargs="*", type=Path, default=[],
                    help="fotos reales sin setas para calibrar «no reconocido» (solo se guardan n, máx y p95)")
    a = ap.parse_args()
    if not a.solo_paquete:
        construir(solo_texto=a.solo_texto, ajenas=a.ajenas)
```

Docstring de la cabecera: añade la línea `uv run python construir.py --solo-texto --ajenas <fotos…>   # y calibra «no reconocido» con fotos sin setas`.

- [ ] **Step 3: Test del umbral, que falla**

En `reconocer-nucleo.test.ts`, añade `UMBRAL_MEDIO` al import de `./reconocer-nucleo` y al final:

```ts
import ref from '../../modelo/referencia.json';

describe('umbral «no reconocido» calibrado con modelo/referencia.json', () => {
  it('deja pasar al menos el 95 % de las fotos de la guía', () => {
    expect(UMBRAL_NO_RECONOCIDO).toBeLessThanOrEqual(ref.coseno_max_fotos_guia.p05);
  });
  it('queda por encima del ruido, de la imagen azul y de todas las fotos reales sin setas medidas', () => {
    expect(UMBRAL_NO_RECONOCIDO).toBeGreaterThan(ref.coseno_max_ajenas.ruido);
    expect(UMBRAL_NO_RECONOCIDO).toBeGreaterThan(ref.coseno_max_ajenas.azul);
    expect(ref.coseno_max_ajenas_reales.n).toBeGreaterThanOrEqual(30);
    expect(UMBRAL_NO_RECONOCIDO).toBeGreaterThan(ref.coseno_max_ajenas_reales.max);
  });
  it('por debajo de la banda «medio»', () => expect(UMBRAL_NO_RECONOCIDO).toBeLessThan(UMBRAL_MEDIO));
});
```

(Si el archivo ya tiene un `import` de JSON con otro estilo, colócalo arriba, junto a los demás imports.)

Run: `cd app && npx vitest run src/reconocer-nucleo.test.ts`
Expected: FAIL (`ref.coseno_max_ajenas_reales` no existe; y, cuando exista, 0,27 > 0,2763 es falso).

- [ ] **Step 4: Regenerar texto y referencia**

Comprueba primero dónde escribe el script tras el plan A:

```bash
grep -n "^SALIDA\|^MANIFEST" modelo/construir.py
ls -la "$(python3 -c "import re;print(re.search(r'SALIDA = REPO / \"([^\"]+)\"', open('modelo/construir.py').read()).group(1))")"/vision_int8.onnx
```

Tiene que existir `vision_int8.onnx` (unos 89,6 MB). Si no está, **para**: la regeneración completa (sin `--solo-texto`) baja ~600 MB y exporta el ONNX de nuevo, y eso hay que pedirlo aparte.

```bash
cd modelo && uv sync && uv run python construir.py --solo-texto --ajenas \
  ~/Documents/Claude/pearl-monte-paraiso/assets/amenities/*.jpg \
  ~/Documents/Claude/benalto-aislamiento-estricto/public/images/editorial/z-*.jpg \
  ~/Documents/Claude/Cowork/Landel/estudios/fotos-parcela/*.jpg \
  ~/Documents/Claude/fazenda/IMG_12*.jpg
```

Salida esperada (unos 2 min; los pesos de BioCLIP ya están en `~/.cache/huggingface`):
- `texto: 1611 etiquetas, 1.65 MB`
- dos líneas de top-5 (`amanita_caesarea_1.jpg` con `Amanita caesarea` arriba y `amanita_phalloides_1.jpg` con `Amanita phalloides` arriba)
- `coseno máx fotos guía: {'min': …, 'p05': …, 'mediana': …, 'n': 111}`
- ajenas reales con `n: 37` y `max` ≈ 0,276 (la lista de fotos no ha cambiado)
- `paquete <version nueva>: 102.5 MB` (aprox.; cambia el hash de versión, así que la app volverá a descargar el modelo)

```bash
python3 -c "import json;r=json.load(open('modelo/referencia.json'));print(r['coseno_max_fotos_guia'], r['coseno_max_ajenas'], r['coseno_max_ajenas_reales'])"
```

- [ ] **Step 5: Comprobar las fotos nuevas con el modelo**

Script de un solo uso en el scratchpad (no se versiona). Calcula el top-3 de cada foto nueva con el modelo regenerado:

```bash
cat > "$TMPDIR/top3.py" <<'EOF'
import json, sys, numpy as np, onnxruntime as ort
from PIL import Image
M, G = sys.argv[1], sys.argv[2]
meta = json.load(open(f"{M}/etiquetas.json")); et = meta["etiquetas"]
T = np.frombuffer(open(f"{M}/texto_f16.bin", "rb").read(), dtype="<f2").astype(np.float32).reshape(len(et), 512)
s = ort.InferenceSession(f"{M}/vision_int8.onnx", providers=["CPUExecutionProvider"])
mu, sd = np.array(meta["preproceso"]["media"]), np.array(meta["preproceso"]["desv"])
def pre(im):
    im = im.convert("RGB"); w, h = im.size; k = 224 / min(w, h)
    im = im.resize((max(224, round(w * k)), max(224, round(h * k))), Image.BICUBIC); w, h = im.size
    l, t = (w - 224) // 2, (h - 224) // 2
    return ((np.asarray(im.crop((l, t, l + 224, t + 224)), dtype=np.float32) / 255 - mu) / sd).transpose(2, 0, 1)[None].astype(np.float32)
for f in sys.argv[3:]:
    e = s.run(None, {"input": pre(Image.open(f"{G}/{f}"))})[0][0]; e /= np.linalg.norm(e); c = T @ e
    print(f, [(et[j]["n"], et[j].get("g"), round(float(c[j]), 3)) for j in np.argsort(-c)[:3]])
EOF
cd /Users/alexanderkrupnov/Documents/Claude/setas-alicante/modelo && uv run python -I "$TMPDIR/top3.py" "<carpeta SALIDA>" ../guia/fotos \
  $(cd ../guia/fotos && ls tricholoma_* hygrophorus_* morchella_* gyromitra_* clitocybe_* suillus_bellinii_3.jpg lactarius_deliciosus_3.jpg)
```

Esperado: en cada foto, el top-1 o el top-2 es del mismo género que su ficha. Una foto cuyo top-3 no tenga nada de su género se vuelve a mirar con Read. Si la identificación de Commons es dudosa, se cambia por otra candidata del dosier (Task 2 Steps 1-3, y después Task 3 Step 5). BioCLIP también se equivoca: esto es solo un control, no lo que decide. Anota la tabla en el dosier §4.

- [ ] **Step 6: Umbral nuevo**

Regla: `UMBRAL = ⌈(máx(ajenas_reales.max, ruido, azul) + 0,0001) / 0,005⌉ × 0,005`. Con los datos de arriba sale 0,28. Si con la referencia nueva `UMBRAL > coseno_max_fotos_guia.p05`, **para** e informa: el modelo ya no separa bien y hay que decidirlo en el hilo principal.

En `reconocer-nucleo.ts`, sustituye las líneas 29-33 por (con los números de la referencia nueva):

```ts
/**
 * Por debajo, «no reconocido» (sin top-5 forzado). Calibrado con modelo/referencia.json: queda por encima de todas las
 * fotos reales sin setas medidas (37, máx 0,276), del ruido (0,26) y de una imagen azul (0,25), y deja fuera menos
 * del 5 % de las fotos de la guía (las criadillas, peor reconocidas). Ojo: una imagen gris lisa da 0,31, así que esto
 * NO garantiza detectar fotos que no son setas. Con «no reconocido» las mortales se siguen listando (seguridad.ts).
 */
export const UMBRAL_NO_RECONOCIDO = 0.28;
```

Actualiza también las líneas 24-25 (rango de las bandas) con el `min`, `mediana` y `n` nuevos de la referencia.

- [ ] **Step 7: Tests, cobertura y e2e**

```bash
cd app && npx vitest run src/reconocer-nucleo.test.ts && npm test && npm run cobertura && npx tsc --noEmit && npm run e2e
```

Expected: todo PASS, 100 % en los dos archivos, y el e2e en verde (la paridad del top-5 navegador/Python se compara con la `referencia.json` nueva).

- [ ] **Step 8: Commit**

```bash
git add modelo/vocabulario/alias.json modelo/construir.py modelo/README.md modelo/referencia.json \
  app/src/reconocer-nucleo.ts app/src/reconocer-nucleo.test.ts
git commit -m "feat(reconocedor): vocabulario de Alicante (1611 etiquetas) y umbral «no reconocido» 0,28 calibrado con fotos sin setas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(La salida del modelo, `pipeline/data/…/modelo/`, no se versiona.)

---

### Task 8: Puertas antes de cerrar la fase

**Files:**
- Modify: lo que señalen el humanizer y el code-review (`guia/_build/build.py`, `app/src/seguridad.ts`, `app/src/comparar.ts`, `app/src/guia.ts`), regenerando las salidas.

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: rama con las puertas de spec §8 en verde para D1.

- [ ] **Step 1: Humanizer sobre el copy nuevo**

Reúne en un archivo del scratchpad el texto nuevo o cambiado que ve el usuario:

```bash
python3 - > "$TMPDIR/copy-d1.md" <<'EOF'
import json
NUEVAS = {"tricholoma_terreum","hygrophorus_latitabundus","morchella_spp","tricholoma_pardinum","tricholoma_equestre","gyromitra_esculenta","clitocybe_dealbata"}
for e in json.load(open("guia/especies.json")):
    if e["id"] in NUEVAS or e["id"] in {"suillus_bellinii", "lactarius_deliciosus", "agaricus_campestris"}:
        print(f"## {e['id']}")
        for k in ["toxicidad_nota","sombrero","himenio","pie","volva","anillo","carne_y_corte","olor_sabor","habitat","temporada"]:
            print(f"- {k}: {e[k]}")
        for r in e["rasgos_clave"]: print(f"- rasgo: {r}")
        for c in e["no_confundir_con"]: print(f"- vs {c['id']}: " + " / ".join(c["diferencias"]))
EOF
grep -n "texto:\|ayuda:\|op('\|motivo:" app/src/seguridad.ts | sed -n '1,200p' >> "$TMPDIR/copy-d1.md"
```

Invoca la skill `humanizer` sobre `$TMPDIR/copy-d1.md`, con estas restricciones:
- no cambiar hechos, cifras, nombres científicos ni las palabras «MORTAL», «TÓXICA» o «No se debe probar»;
- no tocar el texto de `AV`;
- no introducir ninguna palabra de la lista prohibida.

Lleva los cambios a la **fuente** (`build.py`, `seguridad.ts`) y regenera:

```bash
python3 guia/_build/build.py guia/_build/fotos.json guia/especies.json && python3 guia/_build/creditos.py guia/especies.json guia/CREDITOS.md && python3 guia/validar.py
```

- [ ] **Step 2: Auditoría de redacción, otra vez tras el humanizer**

Repite Task 3 Step 6 (`fallos: 0` y el `grep` sin salida) y además:

```bash
grep -n -i "comestib\|se puede comer\|apta para" app/src/seguridad.ts app/src/comparar.ts app/src/selector-especie.ts
git diff main -- app/src/guia.ts | grep '^+' | grep -i "comestib"
grep -rn "SCO/3303" guia/especies.json guia/_build/build.py
```

Esperado: el primer `grep` solo muestra la regex `PROHIBIDO` de `seguridad.ts:261`. El segundo y el tercero no muestran nada.

- [ ] **Step 3: Code-review max**

Invoca la skill `code-review` con el argumento `max` sobre el diff de la fase. Objetivos: `app/src/seguridad.ts`, `app/src/reconocer-nucleo.ts`, `guia/_build/build.py` (fichas nuevas y cambiadas), `app/src/comparar.ts`, `app/src/guia.ts` y `app/src/seguridad-regiones.test.ts`. Pide expresamente que revise:
1. si alguna mortal puede quedar descartada con una sola respuesta o con respuestas contradictorias;
2. si alguna alerta deja de dispararse;
3. que cada regla cite rasgos que estén en la ficha;
4. que ningún texto afirme comestibilidad.

Arregla cada hallazgo confirmado con TDD (primero el test que lo reproduce) y repite hasta que no queden hallazgos de severidad alta.

- [ ] **Step 4: Verificación completa**

```bash
python3 guia/validar.py
cd app && npm test && npm run cobertura && npx tsc --noEmit && npm run build && npm run e2e
```

Esperado: `OK` en validar, todo vitest en verde, 100 % en los dos archivos, build sin errores y e2e en verde. Abre la app en local (`npm run servir`) y comprueba con el navegador:
- la guía muestra las 7 fichas nuevas con sus fotos;
- la ficha de *T. equestre* sale en rojo (MORTAL o TÓXICA según su grupo);
- el selector de especie dice «En la ficha de Suillus bellinii» o el texto que dé su nombre común si la región activa tiene *S. collinitus*.

- [ ] **Step 5: Commit de los arreglos de las puertas**

```bash
git add guia/_build/build.py guia/especies.json guia/CREDITOS.md app/src/
git commit -m "fix(guia,seguridad): puertas de D1 (humanizer y code-review)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Fuera de alcance y avisos para el hilo principal

- **Pregunta abierta de Alexander:** «Considerada comestible por la bibliografía» (`AV` y `AVISO_COMESTIBLE`) no se toca.
- **Red de seguridad del Worker** (`worker/src/seguridad.ts` `REGLAS`): no añade *Tricholoma*, *Morchella*/*Gyromitra* ni *Clitocybe* a lo que fuerza sobre la respuesta de Gemini. Hacerlo cambia el Worker y exige `security-review` (spec §8). Se propone como fase D2.
- **Mortales nuevas que salen siempre:** si *T. equestre* y *Gyromitra* son `mortal`, se listan en todas las evaluaciones y sus preguntas (`color_sombrero`, `morchella_sombrero`, `morchella_interior`) salen también para un boleto. Es la misma regla que ya se aplica a *L. brunneoincarnata* (spec §2). A cambio, la lista de preguntas se alarga. Las descartan solo sus propias preguntas.
- ***T. terreum* y la miotoxicidad (Yin et al. 2014):** si el dosier la confirma, Alexander decide si la negrilla sigue en `comestible_menor`.
- **Senderuela sin ficha:** activa el grupo `clitociboide`, pero su ficha no existe y *C. dealbata* no se descarta para ella (no hay pregunta que las separe sin pasarse de 20). Queda una plaza libre de pregunta.
- **Comestibles sin confusión tóxica documentada** (probablemente `hydnum_repandum` y `suillus_bellinii`): las decide Alexander (Task 1, puerta). Las alternativas son una excepción aprobada o una ficha tóxica más en D2.

## Autorrevisión (cobertura de la spec)

| Requisito | Tarea |
|---|---|
| §4.5 fichas nuevas, comestibles y tóxicas, con fotos libres, fuentes y «no confundir con» | 1, 2, 3 |
| §4.5 *S. collinitus* y *L. vinosus*/*semisanguifluus* como variantes | 3 (Step 4), 4, 7 (afines) |
| §4.5 `habitat` no solo de Cádiz/Andalucía en especies de las dos regiones | 3 (Step 4) |
| §4.5 reglas negrilla↔*T. pardinum*/*T. equestre*, colmenilla↔*Gyromitra*, *Agaricus*/senderuela↔*Clitocybe*; mortales siempre | 5 |
| §4.5 riesgo «láminas amarillas» | 5 (tests del hallazgo y «ninguna mortal con una sola respuesta») |
| §4.5 umbral 0,27 revisado con la referencia | 7 (0,28, con test contra `referencia.json`) |
| §4.5 vocabulario y regeneración si cambia | 7 (1603 → 1611, `--solo-texto`) |
| §7.5 test de comestible activa con confusión tóxica | 6 |
| §8 code-review max, humanizer y wording | 8 |
| SPEC §2: nunca comestibilidad; Orden SCO/3303/2006 derogada | Global Constraints, 3 (Step 6), 8 (Step 2) |

Los valores entre `< >` de Tasks 2 y 3 (títulos de Commons, `RecordID` de Index Fungorum, `usageKey` de GBIF y las URL de NEJM y PubMed) no son huecos del plan. Son datos que hay que copiar del dosier de Task 1, porque escribirlos aquí sin comprobarlos sería inventarlos.

## Decisiones de Alexander (2026-10-15), prevalecen sobre las tareas anteriores
1. ***Tricholoma terreum* (negrilla): ficha TÓXICA y sin capa en el mapa.** El grupo es `toxica`, con la toxicidad muscular descrita (Yin et al. 2014) en `toxicidad_nota`. No va en las especies activas de ninguna región ni tiene perfil de idoneidad. Las reglas de confusión con *T. pardinum* y *T. equestre* se mantienen.
2. **Especies buscables sin parecida tóxica documentada** (*Hydnum*, *Suillus*, *H. latitabundus* y las que salgan en la Tarea 1): se aprueba la excepción. Cada una entra en `EXCEPCIONES_APROBADAS` con este texto en la ficha: "Sin confusiones tóxicas documentadas en las fuentes consultadas; eso no garantiza nada, confirma con un experto." Pasa por humanizer.
3. **"Considerada comestible por la bibliografía": se QUITA.** Se sustituye por una etiqueta neutra del grupo, sin la palabra "comestible", por ejemplo "Apreciada en la bibliografía micológica" (pasa por humanizer). Se añade un test que falle si la palabra "comestible" aparece como afirmación en textos de la app.
