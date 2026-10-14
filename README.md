# Mapa de setas

App web (PWA) para buscar setas en las sierras a unas dos horas de Marbella. Muestra en un mapa las zonas
donde cada especie tiene más probabilidad de salir, avisa de cuándo merece la pena ir según la lluvia y la
temperatura de las últimas semanas, e incluye una guía de especies y un reconocedor por foto. Todo funciona
sin conexión una vez descargados los mapas (unos 181 MB) y, si se quiere, el reconocedor (unos 102 MB).

App: https://spaingrupo.github.io/mapa-setas/

> **Aviso de seguridad.** No consumas ninguna seta sin la confirmación de un experto. Ni el mapa, ni la guía,
> ni el reconocedor sirven para decidir si una seta es comestible. Hay especies mortales que se confunden con
> las comestibles.

Los sitios que guardas («Mis sitios») se quedan en tu navegador: no se envían a ningún servidor.

## Estructura

- `pipeline/`: genera los datos (terreno, vegetación, idoneidad por especie, acceso a pie, restricciones).
  Python con `uv`. La salida (`pipeline/data/out/app`) no se versiona.
- `app/`: la PWA (Vite + MapLibre + PMTiles). Los datos se enlazan desde la salida del pipeline.
- `guia/`: fichas de especies y fotos con licencia libre (créditos en `guia/CREDITOS.md`).
- `modelo/`: construcción del paquete del reconocedor (BioCLIP en ONNX, int8).
- `worker/`: Cloudflare Worker opcional para la «segunda opinión» con Gemini.

## Datos y licencias

- MDT y ortofoto PNOA: © Instituto Geográfico Nacional / CNIG, CC BY 4.0 (scne.es).
- Mapa Forestal de España: © Ministerio para la Transición Ecológica y el Reto Demográfico.
- Geología: IGME, según sus condiciones de reutilización.
- Espacios protegidos, senderos, incendios y zonificación: REDIAM, Junta de Andalucía, CC BY 4.0.
- Incendios (complemento): EFFIS, Copernicus Emergency Management Service, CC BY 4.0.
- Caminos, aparcamientos y mapa base: © colaboradores de OpenStreetMap, ODbL 1.0; mapa base con Protomaps.
- Citas de especies: GBIF, con la licencia de cada registro (CC0, CC BY o CC BY-NC).
- Meteorología: Open-Meteo (consultada desde el navegador).
- Reconocedor: modelo BioCLIP (`imageomics/bioclip`), licencia MIT.
- Fotos de la guía: Wikimedia Commons e iNaturalist (CC0, CC BY, CC BY-SA o dominio público), detalle en
  `guia/CREDITOS.md`.

El detalle de cada fuente (URL, fecha de consulta, licencia) está en `pipeline/fuentes.yaml`.

## Compilar y publicar

Requisitos: Node (con `npm ci` hecho en `app/`), Python 3, ffmpeg para las miniaturas de la guía y los datos
del pipeline ya generados en `pipeline/data/out/app`.

```sh
cd app
npm run build                 # dist/ (con data/ enlazada a la salida del pipeline)
npm run servir                # http://127.0.0.1:8765/ con soporte de Range para los .pmtiles
npm run e2e                   # prueba de extremo a extremo con Playwright
```

GitHub Pages se sirve desde la rama huérfana `gh-pages`. Como los datos no se pueden generar en CI, se
publica desde local con:

```sh
app/scripts/publicar.sh           # build, copia de los datos que pide el manifest y push forzado a gh-pages
app/scripts/publicar.sh --local   # lo mismo sin push, para probar la carpeta preparada
```

El script copia archivos reales (no enlaces), deja fuera lo que la app no pide (por ejemplo `acceso.bin` sin
comprimir), añade `.nojekyll` y se detiene si algún archivo pasa de 95 MB (GitHub no admite más de 100 MB).
La rama `gh-pages` tiene un solo commit que se reescribe en cada publicación.
