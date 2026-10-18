// Ficha corta «Cómo buscar <seta>» (Modo campo y ficha de la guía, 2026-10-18). Puro, sin DOM (como-buscar.test.ts).
// Cada línea lleva su fuente; lo que ninguna fuente de la app dice queda en PENDIENTE (no se inventa):
//  - MODELO: el perfil de la especie en pipeline/especies.yaml (heurístico), que micro.json trae en `perfiles`.
//  - GUIA: los campos `habitat` y `temporada` de la ficha (guia/especies.json, con sus fuentes en la ficha).
//  - INVESTIGACION: docs/investigacion/2026-10-14-factores-y-trucos.md §1 «Microhábitat por especie» y «Cómo encuentran
//    sitios intactos» (foros [F], guías [G] y estudios [E] citados allí).
// Nada de comestibilidad ni de recoger: solo dónde mirar.
import type { PerfilMicro } from './micro';

export const PENDIENTE = 'PENDIENTE';
export const FUENTE_MODELO = 'Modelo de la app (perfil heurístico de la especie)';
export const FUENTE_GUIA = 'Guía de la app (ficha de la especie y sus fuentes)';
export const FUENTE_INVESTIGACION = 'Investigación de la app, 14-10-2026 (foros, guías y estudios citados)';

export interface LineaBuscar {
  clave: 'arboles' | 'orientacion' | 'humedad' | 'copas' | 'altitud' | 'suelo' | 'hojarasca' | 'tronco' | 'evitar' | 'temporada' | 'senales' | 'habitat';
  titulo: string;
  /** PENDIENTE si no hay fuente. */
  texto: string;
  fuente: string | null;
}

const NOMBRE_ARBOL: Record<string, string> = { alcornoque: 'alcornoque', encina: 'encina', quejigo: 'quejigo', castano: 'castaño',
  pino: 'pino', pinsapo: 'pinsapo', sabina: 'sabina', otro: 'otro arbolado' };
const NOMBRE_CUBIERTA: Record<string, string> = { pastizal: 'pastizal', pastizal_matorral: 'pastizal con matorral', matorral: 'matorral' };
const NOMBRE_SUELO: Record<string, string> = { acido: 'ácido (silíceo)', basico: 'básico (calizo)', ultrabasico: 'ultrabásico (peridotitas)' };

/** Señales en el terreno por especie del mapa (INVESTIGACION §1, resumido). */
const SENALES: Record<string, string> = {
  boletus_aereus: 'Un árbol grande y bien micorrizado puede dar muchos y los de alrededor ninguno: repasa los árboles donde ya salió, el rodal se repite año tras año.',
  amanita_caesarea: 'Se usa el brezo (Erica) como planta indicadora. Los huevos salen semienterrados.',
  amanita_ponderosa: 'Bajo encina o alcornoque con jara, en suelo pobre, compacto y pedregoso; sale en el borde de los rodales productivos («calos») y nace medio enterrado.',
  cantharellus_cibarius: 'Mejor en enclaves frescos: vaguadas y canutos.',
  lactarius_deliciosus: 'Pinar de suelo ácido o bien drenado.',
  lactarius_sanguifluus: 'Pinar sobre caliza.',
  macrolepiota_procera: 'Claros, bordes y pastizal; no en bosque cerrado.',
  pleurotus_eryngii: 'Sobre las raíces del cardo corredor (Eryngium campestre) en pastizales, cunetas y caminos ganaderos.',
  terfezia_arenaria: 'Bajo Helianthemum en primavera.',
};
const TACTICA = 'Lejos de aparcamientos y pistas quedan más sitios intactos.';

const lista = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`);
const pend = (clave: LineaBuscar['clave'], titulo: string): LineaBuscar => ({ clave, titulo, texto: PENDIENTE, fuente: null });
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export interface DatosBuscar {
  perfil?: PerfilMicro | null;
  ficha?: { habitat?: string; temporada?: string } | null;
  /** Meses de la temporada en el semáforo (manifest.especies[].tiempo.meses). */
  meses?: number[] | null;
}

/** Líneas de «Cómo buscar» para la especie del mapa `id`. */
export function comoBuscar(id: string, d: DatosBuscar): LineaBuscar[] {
  const p = d.perfil ?? null;
  const out: LineaBuscar[] = [];
  // Árboles (de mayor a menor peso en el modelo).
  const arb = Object.entries(p?.arboles ?? {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const cub = Object.entries(p?.cubierta ?? {}).filter(([, v]) => v >= 0.5).sort((a, b) => b[1] - a[1]).map(([k]) => NOMBRE_CUBIERTA[k] ?? k);
  if (arb.length || cub.length) {
    const mejores = arb.filter(([, v]) => v >= 0.9).map(([k]) => NOMBRE_ARBOL[k] ?? k);
    const otros = arb.filter(([, v]) => v < 0.9).map(([k]) => NOMBRE_ARBOL[k] ?? k);
    const t = [mejores.length ? `Sobre todo bajo ${lista(mejores)}` : '', otros.length ? `${mejores.length ? 'también' : 'Bajo'} ${lista(otros)}` : '',
      cub.length ? `${arb.length ? 'y en' : 'En'} ${lista(cub)} sin árboles` : ''].filter(Boolean).join('; ');
    out.push({ clave: 'arboles', titulo: 'Bajo qué árboles', texto: `${t}.`, fuente: FUENTE_MODELO });
  } else out.push(pend('arboles', 'Bajo qué árboles'));
  // Orientación.
  const o = p?.orientacion;
  out.push(o ? { clave: 'orientacion', titulo: 'Orientación', fuente: FUENTE_MODELO,
    texto: o === 'umbria' ? 'Mejor en umbría (laderas al norte); la ventaja crece con la pendiente.'
      : o === 'solana' ? 'Mejor en solana (laderas al sur); la ventaja crece con la pendiente.'
        : 'La orientación pesa poco; algo mejor en umbría.' } : pend('orientacion', 'Orientación'));
  // Humedad (índice TWI / cercanía a cauce).
  const h = p?.humedad;
  out.push(typeof h === 'number' ? { clave: 'humedad', titulo: 'Humedad', fuente: FUENTE_MODELO,
    texto: h > 0 ? 'Le favorecen los sitios frescos: vaguadas y cerca de arroyos.'
      : h < 0 ? 'Prefiere suelo bien drenado: lomas mejor que vaguadas.' : 'El modelo no le da ventaja a las vaguadas.' } : pend('humedad', 'Humedad'));
  // Copas.
  const op = p?.dosel?.opt;
  out.push(op ? { clave: 'copas', titulo: 'Copas y luz', fuente: FUENTE_MODELO,
    texto: `Mejor con ${op[0]}–${op[1]} % del suelo cubierto de copas: ni bosque cerrado ni claro pelado.` } : pend('copas', 'Copas y luz'));
  const alt = p?.altitud;
  out.push(alt ? { clave: 'altitud', titulo: 'Altitud', fuente: FUENTE_MODELO, texto: `Óptimo entre ${alt.opt_min} y ${alt.opt_max} m (posible de ${alt.min} a ${alt.max} m).` }
    : pend('altitud', 'Altitud'));
  const su = Object.entries(p?.suelo ?? {}).filter(([k, v]) => v >= 1 && NOMBRE_SUELO[k]).map(([k]) => NOMBRE_SUELO[k]);
  out.push(su.length ? { clave: 'suelo', titulo: 'Suelo', fuente: FUENTE_MODELO, texto: `Mejor en suelo ${lista(su)}.` } : pend('suelo', 'Suelo'));
  // Sin fuente en la app: no se inventan.
  out.push(pend('hojarasca', 'Hojarasca y musgo'));
  out.push(pend('tronco', 'Distancia al tronco'));
  // Qué evitar (lo que el modelo penaliza).
  if (p) {
    const ev: string[] = [];
    const micorrizica = p.penaliza_fuego ?? p.micorrizica ?? true;
    if (micorrizica && arb.length) ev.push('zonas quemadas en los últimos 5 años');
    if (o === 'umbria') ev.push('solanas');
    if (o === 'solana') ev.push('umbrías');
    if (op) ev.push(`bosque muy cerrado (más del ${op[1]} % de copas)`);
    ev.push('laderas de más de 35°', 'lo edificado');
    out.push({ clave: 'evitar', titulo: 'Qué evitar', texto: `${ev[0][0].toUpperCase()}${lista(ev).slice(1)} (el modelo puntúa peor esos sitios).`, fuente: FUENTE_MODELO });
  } else out.push(pend('evitar', 'Qué evitar'));
  // Temporada: la guía y, aparte, los meses del semáforo.
  const meses = (d.meses ?? []).filter((m) => m >= 1 && m <= 12);
  const tg = d.ficha?.temporada?.trim();
  if (tg || meses.length) {
    out.push({ clave: 'temporada', titulo: 'Temporada', fuente: tg && meses.length ? `${FUENTE_GUIA}; meses: ${FUENTE_MODELO}` : tg ? FUENTE_GUIA : FUENTE_MODELO,
      texto: [tg, meses.length ? `Meses que usa el semáforo: ${meses.map((m) => MESES[m - 1]).join(', ')}.` : ''].filter(Boolean).join(' ') });
  } else out.push(pend('temporada', 'Temporada'));
  const s = SENALES[id];
  out.push({ clave: 'senales', titulo: 'Señales en el terreno', texto: s ? `${s} ${TACTICA}` : TACTICA, fuente: FUENTE_INVESTIGACION });
  const hab = d.ficha?.habitat?.trim();
  out.push(hab ? { clave: 'habitat', titulo: 'Hábitat según la guía', texto: hab, fuente: FUENTE_GUIA } : pend('habitat', 'Hábitat según la guía'));
  return out;
}
