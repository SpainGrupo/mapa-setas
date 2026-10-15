# Sondeo de fuentes de Alicante (2026-10-15)

Complementa `2026-10-14-region-alicante.md` §3–§4. Todas las peticiones son reales y se hicieron el 2026-10-15.

## Capas
| Fuente | Estado | Uso |
|---|---|---|
| IEPNB MFE WFS `foto_fija_mfe:ff_tipo_bosque` | **503** (incluida la raíz del geoserver) | sigue caído un segundo día; reintentar en la ejecución |
| ICV `forestal/MapServer/41` (MFE50) | 200, 52 091 polígonos; `sp1_nom_ifn`, `fccarb`, `tfcctot`, `tipestr_definicion`, `usos_general` | **sustituto del MFE para la CV**. Hay 36 valores de `sp1_nom_ifn`, entre ellos *Juniperus* |
| IDERM `USOS_VEGETACION` | 200, solo 48 polígonos, `clase_est`/`estrato` como leyenda | **no sirve** de respaldo del MFE para Murcia |
| IDERM `ENP` / `MONTES` | 200: 29 / 239 | sí |
| ICV `forestal/25` (montes CUP) | 200, 10 733 | sí |
| ICV senderos 50/51/52 | 200: GR 44, PR 249, SL 65 | sí |
| ICV incendios | capas 1–28 = 1993–2020, 101 = 2021, 102 = 2022, 120 = 2023, 121 = 2024; 2025 sin capa | sí (2025 desde EFFIS) |
| ICV `espacios_protegidos` | 10 PN (22), 11 RN (4), 15/18 parajes, 22–24 Natura, 27 zonificación; 5, 19 y 20 son capas grupo | sí |
| ICV `espacios_protegidos_inst` zonas PRUG (197/198…) | 500/400 | **no se pueden obtener**; 194/195 (límites PN y PRUG de Mariola) sí |
| IGN WFS `unidades-administrativas` `au:AdministrativeUnit` | 200; filtro FES `au:nationalCode` CV=34100000000, MU=34140000000, CM=34080000000, AN=34010000000; 21 MB las cuatro | capa `ccaa` |
| MITECO BDN ENP zip / Natura 2000 zip | 200, 66 MB / 195 MB | sí; licencia PENDIENTE |

**Hueco crítico:** sin el IEPNB, Murcia y Albacete no tienen vegetación. Respaldos posibles, por orden de preferencia: (1) reintentar el IEPNB; (2) que Alexander descargue a mano del MITECO el MFE25 de Murcia y Albacete, porque la descarga tiene un reto ALTCHA y no se puede automatizar; (3) marcar esas celdas NODATA, como dice el spec §3.4.

## Normativa (fuente primaria)
- **Mariola, PRUG = Decreto 79/2007, de 25 de mayo** (no 76/2007). https://dogv.gva.es/datos/2007/05/30/pdf/2007_7045.pdf. Dice: "máximo de 4 kg. por persona y día". También limita a fincas públicas, prohíbe las herramientas que remueven el suelo, exige cesto y remite a la Orden de 1996. **Verificado.**
- **Font Roja:** el Decreto 49/1987 (https://dogv.gva.es/datos/1987/05/21/pdf/1987_808814.pdf) no habla de setas. El cupo de 4 kg **no está verificado** y queda PENDIENTE.
- **CV, Orden 16-09-1996:** no se ha encontrado el PDF. La ficha del DOGV es una SPA. El cupo de 6 kg solo consta en fuentes secundarias: PENDIENTE.
- **CLM, Orden 15/11/2016:** la página ELI https://docm.jccm.es/docm/eli/es-cm/o/2016/11/15 se lee sin JS: "5 kg de setas, o un volumen aparente de 10 litros". Texto **verificado**; la vigencia consolidada sigue PENDIENTE.
- **Orden SCO/3303/2006 (*T. equestre*): derogada** por el Real Decreto 30/2009 (BOE-A-2009-1110). Está PENDIENTE leer si ese RD mantiene la prohibición de venta. La ficha no debe citar la orden como vigente.
- Patrón de URL del DOGV que funciona: `https://dogv.gva.es/datos/AAAA/MM/DD/pdf/AAAA_NNNN.pdf`.
