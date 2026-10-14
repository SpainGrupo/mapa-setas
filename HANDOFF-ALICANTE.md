# Traspaso: región Alicante (≤2 h) en el mapa de setas

**Worktree:** `/Users/alexanderkrupnov/Documents/Claude/setas-alicante`, rama `region-alicante`, creada desde `main` en 5ba99dd.
**Repo principal:** `/Users/alexanderkrupnov/Documents/Claude/setas` (`main`). Publicado en https://spaingrupo.github.io/mapa-setas/ con `app/scripts/publicar.sh`.

## Decisión de Alexander (2026-10-14)
**Opción A:** una sola app con **selector de región** ("Marbella / Alicante"). El código es común y cada región tiene su propia descarga para usar sin cobertura. No se hace una app separada.

## Leer primero
1. `CLAUDE.md`, después `CONTEXT.md` (capa ICM).
2. `docs/investigacion/2026-10-14-region-alicante.md`: zona, especies, fuentes verificadas o pendientes, normativa, la lista de lo que está fijado a Marbella o Andalucía en el código y el esquema propuesto de `regiones/alicante.yaml`.
3. `docs/specs/2026-10-13-mapa-setas-design.md` §2: regla de seguridad no negociable, nunca afirmar comestibilidad.
4. Planes anteriores: `docs/superpowers/plans/` (fases 1–9).

## Plan propuesto (pendiente de aprobar en la nueva sesión; usar brainstorming y writing-plans)
1. **Hacer el pipeline configurable por región**:
   - `regiones/<id>.yaml` con origen, tiempo máximo, extractos OSM, fuentes por capa, especies y textos legales.
   - Salidas en `pipeline/data/<region>/`.
   - Marbella tiene que dar exactamente las mismas salidas que ahora (test de regresión).
2. **Datos de Alicante**:
   - Zona con OSRM; MDT25 del IGN (funciona al este de 0°).
   - MFE: el WFS del IEPNB daba 503; el ICV tiene una copia en la capa 41; Murcia no tiene respaldo, probar `USOS_VEGETACION` de IDERM.
   - IGME, OSM de valencia, murcia y castilla-la-mancha.
   - Espacios protegidos del ICV, IDERM y MITECO; incendios del ICV y EFFIS; senderos del ICV y OSM.
3. **Especies de Alicante**:
   - Perfiles nuevos: *Tricholoma terreum*, *Morchella*, *Hygrophorus latitabundus*, *Suillus*, *L. sanguifluus*/*vinosus* y *Lepista nuda*.
   - Fichas nuevas de tóxicas: *T. pardinum*, *T. equestre*, *Gyromitra*, *Clitocybe dealbata*.
   - Calibración con GBIF, con hold-out cuando n≥10.
4. **App**:
   - Selector de región.
   - Manifest por región y descarga OPFS por región.
   - Quitar "Marbella" fijo de `ranking.ts` y `hoy-ui.ts` y de las atribuciones.
   - Normativa por región:
     - Comunitat Valenciana: Orden 16-09-1996, 6 kg.
     - Castilla-La Mancha: Orden 15/11/2016, 5 kg.
     - Murcia: sin norma autonómica.
     - Todo marcado PENDIENTE de verificar en fuente oficial.
5. **Puertas**:
   - `code-review` high, y max en la seguridad del reconocedor para las especies nuevas.
   - e2e de las dos regiones.
   - Publicar solo cuando pase todo.

## Pendientes abiertos de Alexander
- ¿Las fichas comestibles abiertas desde la lista de la Guía mantienen "Considerada comestible por la bibliografía"? La spec §4 prohíbe la palabra.
- Formulario de Cloudflare for Startups: faltan los datos de la empresa (nombre, web del producto, año de fundación, dirección).
- Riesgos de seguridad abiertos: la respuesta "láminas amarillas" descarta sola las amanitas mortales; el umbral de "no reconocido" (0,27) es flojo.

## Al terminar
Fusionar `region-alicante` en `main`, publicar con `app/scripts/publicar.sh` y borrar el worktree (`git worktree remove ../setas-alicante`).
