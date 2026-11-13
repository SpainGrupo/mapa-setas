// Calibración del semáforo v3 (probabilidad) contra citas fechadas y controles, y casos de campo de noviembre de 2026.
// Informe: docs/investigacion/2026-11-07-semaforo-probabilidad.md. Todas las cifras del informe salen de aquí.
//
// Uso:
//   node scripts/calibrar-semaforo.mts [--region alicante]  (Marbella por defecto; ver «Datos»)
//   node scripts/calibrar-semaforo.mts                 → descarga (con caché) y escribe el resumen en stdout (markdown)
//   node scripts/calibrar-semaforo.mts --rejilla       → además, prueba combinaciones de parámetros (tabla de rejilla)
//   node scripts/calibrar-semaforo.mts --campo         → solo los casos de campo (Forecast API, como la app)
//   node scripts/calibrar-semaforo.mts --ranking       → cuánto cambia el Top 10 de cada especie hoy (Forecast API)
//   node scripts/calibrar-semaforo.mts --diag          → además, fase del episodio y desvío de temperatura de citas y controles
//
// Datos:
//   - Citas: pipeline/data/<región>/out/citas.geojson (GBIF + iNaturalist + foros, con fecha de día). Muestra fija
//     (semilla) de ≤ 300 citas de oronja, boletos, níscalos, Suillus y Pleurotus, una por especie, día y celda de 0,1°.
//   - Controles: los mismos puntos en 3 fechas al azar del mismo año (semilla fija), meses secos incluidos.
//   - Meteo histórica: Open-Meteo Archive API (sin clave), mismas variables diarias que app/src/meteo.ts; la humedad del
//     suelo es soil_moisture_7_to_28cm_mean (ERA5; la Forecast API usa 9–27 cm). Una petición por celda de 0,1° y tramo
//     [fecha − 30, fecha + 16] (los tramos que se solapan, juntos); temperatura llevada de la cota de la celda a la de la cita (−0,65 °C/100 m, como la app).
//     Caché: pipeline/data/<región>/cache/meteo-historica/ (fuera de git).
//   - Reglas: las de la región (out/app/manifest.json del pipeline). `--region <id>` elige la región (marbella por defecto);
//     los grupos sin citas en esa región (p. ej. oronja y boletos en Alicante) salen con n = 0. `--campo` (casos de campo de
//     noviembre de 2026) solo existe para Marbella.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerHooks } from 'node:module';
import { createHash } from 'node:crypto';

registerHooks({ resolve(spec, ctx, next) {
  try { return next(spec, ctx); } catch (e) { if (spec.startsWith('.') && !/\.\w+$/.test(spec)) return next(spec + '.ts', ctx); throw e; }
} });

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAIZ = join(APP, '..');
const SRC = join(APP, 'src') + '/';
const v3 = await import(SRC + 'semaforo.ts');
const v2 = await import(join(APP, 'scripts', 'calibracion', 'semaforo-v2.ts'));
const { consultar, corregirAltitud } = await import(SRC + 'meteo.ts');

type Dia = { fecha: string; lluvia: number; tmin: number; tmax: number; et0?: number; hr_min?: number; suelo?: number };
type Reglas = any;

const _iR = process.argv.indexOf('--region');
const REGION = _iR >= 0 ? process.argv[_iR + 1] : 'marbella';
if (!REGION || !existsSync(join(RAIZ, 'pipeline', 'data', REGION, 'out', 'app', 'manifest.json'))) throw new Error(`región «${REGION}» sin pipeline/data/<región>/out/app/manifest.json`);
const DATOS = join(RAIZ, 'pipeline', 'data', REGION);
const CACHE = join(DATOS, 'cache', 'meteo-historica');
const ARCHIVO = 'https://archive-api.open-meteo.com/v1/archive';
const ELEVACION = 'https://api.open-meteo.com/v1/elevation';
const DIARIAS = 'precipitation_sum,temperature_2m_max,temperature_2m_min,et0_fao_evapotranspiration,relative_humidity_2m_min,soil_moisture_7_to_28cm_mean';
const LIMITE = '2026-10-31';          // último día pedido al archivo (ERA5T va ~5 días por detrás)
const SEMILLA = 20261107;
const N_MAX = 300;
const CONTROLES_POR_CITA = 3;

export const GRUPOS: Record<string, string[]> = {
  oronja: ['amanita_caesarea'],
  boletos: ['boletus_aereus', 'boletus_edulis', 'boletus_pinophilus', 'boletus_aestivalis'],
  niscalos: ['lactarius_deliciosus', 'lactarius_sanguifluus'],
  suillus: ['suillus_collinitus', 'suillus_bellinii', 'suillus_luteus', 'suillus_granulatus'],
  pleurotus: ['pleurotus_eryngii', 'pleurotus_ostreatus'],
};
const CUPO: Record<string, number> = { oronja: 60, boletos: 60, niscalos: 60, suillus: 60, pleurotus: 60 };
const grupoDe = (e: string) => Object.keys(GRUPOS).find((g) => GRUPOS[g].includes(e))!;

function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
const celda = (x: number) => Math.round(x * 10) / 10;
const sumarDias: (iso: string, n: number) => string = v3.sumarDias;
const diasEntre: (a: string, b: string) => number = v3.diasEntre;

async function pedir(url: string): Promise<any> {
  for (let k = 0; k < 40; k++) {
    let r: Response, t: string;
    try { r = await fetch(url); t = await r.text(); } catch (e) { process.stderr.write(`  red: ${e}; reintento en 10 s\n`); await dormir(10000); continue; }
    if (r.ok) {
      try { return JSON.parse(t); } catch { process.stderr.write(`  respuesta no JSON (${t.slice(0, 60)}); reintento en 10 s\n`); await dormir(10000); continue; }
    }
    if (r.status === 429 || /limit/i.test(t)) { process.stderr.write(`  límite de la API (${r.status}): espero 65 s\n`); await dormir(65000); continue; }
    throw new Error(`HTTP ${r.status}: ${t.slice(0, 200)}`);
  }
  throw new Error('demasiados reintentos');
}

// ---------------------------------------------------------------- muestra

interface Cita { especie: string; grupo: string; fecha: string; lat: number; lon: number; url: string; elev?: number }
function muestra(reglasDe: (e: string) => Reglas | undefined): Cita[] {
  const g = JSON.parse(readFileSync(join(DATOS, 'out', 'citas.geojson'), 'utf8'));
  const vistos = new Set<string>();
  const porGrupo: Record<string, Cita[]> = {};
  for (const f of g.features) {
    const p = f.properties;
    const fecha = /^\d{4}-\d\d-\d\d/.test(p.fecha ?? '') ? p.fecha.slice(0, 10) : null;
    const grupo = grupoDe(p.especie);
    if (!fecha || !grupo || !reglasDe(p.especie)) continue;
    if (fecha < '1995-01-01' || fecha > sumarDias(LIMITE, -16)) continue;
    if (p.precision_m != null && p.precision_m > 5000) continue;
    const k = `${p.especie}|${fecha}|${celda(p.lat)}|${celda(p.lon)}`;
    if (vistos.has(k)) continue;
    vistos.add(k);
    (porGrupo[grupo] ??= []).push({ especie: p.especie, grupo, fecha, lat: p.lat, lon: p.lon, url: p.url ?? '' });
  }
  const azar = rng(SEMILLA);
  const out: Cita[] = [];
  for (const gr of Object.keys(GRUPOS)) {
    const l = (porGrupo[gr] ?? []).sort((a, b) => (a.fecha + a.url).localeCompare(b.fecha + b.url));
    for (let i = l.length - 1; i > 0; i--) { const j = Math.floor(azar() * (i + 1)); [l[i], l[j]] = [l[j], l[i]]; }
    out.push(...l.slice(0, CUPO[gr]));
  }
  return out.slice(0, N_MAX);
}

function controles(c: Cita, azar: () => number): string[] {
  const y = +c.fecha.slice(0, 4);
  const ini = `${y}-01-01`, fin = `${y}-12-31` < sumarDias(LIMITE, -16) ? `${y}-12-31` : sumarDias(LIMITE, -16);
  const n = diasEntre(ini, fin);
  const r: string[] = [];
  while (r.length < CONTROLES_POR_CITA) {
    const f = sumarDias(ini, Math.floor(azar() * (n + 1)));
    if (Math.abs(diasEntre(f, c.fecha)) > 20 && !r.includes(f)) r.push(f);
  }
  return r;
}

// ---------------------------------------------------------------- meteo histórica

interface SerieCelda { elevation: number; dias: Dia[] }
async function elevaciones(cs: Cita[]) {
  const f = join(CACHE, 'elevaciones.json');
  const cache: Record<string, number> = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {};
  const k = (c: { lat: number; lon: number }) => `${c.lat.toFixed(4)},${c.lon.toFixed(4)}`;
  const falta = [...new Set(cs.map(k).filter((x) => cache[x] == null))];
  for (let i = 0; i < falta.length; i += 100) {
    const lote = falta.slice(i, i + 100).map((x) => x.split(','));
    const j = await pedir(`${ELEVACION}?latitude=${lote.map((x) => x[0]).join(',')}&longitude=${lote.map((x) => x[1]).join(',')}`);
    lote.forEach((x, n) => (cache[x.join(',')] = j.elevation[n]));
    await dormir(500);
  }
  writeFileSync(f, JSON.stringify(cache));
  for (const c of cs) c.elev = cache[k(c)];
}

/** Pide al archivo los tramos [fecha − 30, fecha + 16] de una celda (los que se solapan, juntos). Caché por tramo. */
async function meteoCelda(la: number, lo: number, fechas: string[]): Promise<SerieCelda[]> {
  const tramos: [string, string][] = [];
  for (const f of [...new Set(fechas)].sort()) {
    const ini = sumarDias(f, -30), fin = sumarDias(f, 16) < LIMITE ? sumarDias(f, 16) : LIMITE;
    const u = tramos.at(-1);
    if (u && ini <= sumarDias(u[1], 1)) u[1] = fin > u[1] ? fin : u[1]; else tramos.push([ini, fin]);
  }
  const out: SerieCelda[] = [];
  for (const [ini, fin] of tramos) {
    const f = join(CACHE, `${la.toFixed(1)}_${lo.toFixed(1)}_${ini}_${fin}.json`);
    if (existsSync(f)) { out.push(JSON.parse(readFileSync(f, 'utf8'))); continue; }
    const r = await pedir(`${ARCHIVO}?latitude=${la}&longitude=${lo}&start_date=${ini}&end_date=${fin}&daily=${DIARIAS}&timezone=Europe/Madrid`);
    const d = r.daily;
    const dias: Dia[] = d.time.map((fecha: string, k: number) => {
      const x: Dia = { fecha, lluvia: d.precipitation_sum[k] ?? 0, tmin: d.temperature_2m_min[k] ?? NaN, tmax: d.temperature_2m_max[k] ?? NaN };
      if (d.et0_fao_evapotranspiration[k] != null) x.et0 = d.et0_fao_evapotranspiration[k];
      if (d.relative_humidity_2m_min[k] != null) x.hr_min = d.relative_humidity_2m_min[k];
      if (d.soil_moisture_7_to_28cm_mean[k] != null) x.suelo = d.soil_moisture_7_to_28cm_mean[k];
      return x;
    });
    const s = { elevation: r.elevation, dias };
    writeFileSync(f, JSON.stringify(s));
    out.push(s);
    pedidas++;
    await dormir(450);   // ~3–4 «llamadas» por tramo de 47 días: muy por debajo de 600/min; el total queda < 5000/h
  }
  return out;
}
let pedidas = 0;

/** Serie de la app para el día `hoy` (30 días antes + 16 después), con la temperatura llevada a la cota de la cita. */
function serieDia(ss: SerieCelda[], hoy: string, elev: number): Dia[] {
  const ini = sumarDias(hoy, -30);
  const s = ss.find((x) => x.dias.some((d) => d.fecha === ini) && x.dias.some((d) => d.fecha === hoy));
  if (!s) return [];
  const i0 = s.dias.findIndex((d) => d.fecha === ini);
  return s.dias.slice(i0, i0 + 47).map((d) => ({ ...d,
    tmin: Math.round(corregirAltitud(d.tmin, s.elevation, elev) * 10) / 10, tmax: Math.round(corregirAltitud(d.tmax, s.elevation, elev) * 10) / 10 }));
}

// ---------------------------------------------------------------- métricas

interface Caso { grupo: string; especie: string; fecha: string; cita: boolean; enTemporada: boolean; v2: string; p2?: number; serie: Dia[]; reglas: Reglas }
const RANGO2: Record<string, number> = { verde: 2, amarillo: 1, rojo: 0, gris: -1 };
/** AUC (Mann–Whitney): probabilidad de que una cita puntúe más que un control (empates, medio). */
function auc(pos: number[], neg: number[]): number {
  let s = 0;
  for (const a of pos) for (const b of neg) s += a > b ? 1 : a === b ? 0.5 : 0;
  return pos.length && neg.length ? s / (pos.length * neg.length) : NaN;
}
const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)} %` : '—');
const mediana = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : NaN; };

interface Resumen { n: number; verde2: number; amar2: number; verde3: number; amar3: number; med3: number }
function evaluar(casos: Caso[], params?: Partial<typeof v3.PARAMS>, umbrales = { verde: v3.UMBRAL_VERDE, amarillo: v3.UMBRAL_AMARILLO }) {
  const p3 = casos.map((c) => v3.semaforo(c.serie, c.reglas, c.fecha, { params }).probabilidad ?? 0);
  const res = (f: (c: Caso) => boolean): Resumen => {
    const idx = casos.map((c, i) => (f(c) ? i : -1)).filter((i) => i >= 0);
    return { n: idx.length,
      verde2: idx.filter((i) => casos[i].v2 === 'verde').length, amar2: idx.filter((i) => RANGO2[casos[i].v2] >= 1).length,
      verde3: idx.filter((i) => p3[i] >= umbrales.verde).length, amar3: idx.filter((i) => p3[i] >= umbrales.amarillo).length,
      med3: mediana(idx.map((i) => p3[i])) };
  };
  const pos = casos.map((c, i) => (c.cita ? i : -1)).filter((i) => i >= 0);
  const neg = casos.map((c, i) => (!c.cita ? i : -1)).filter((i) => i >= 0);
  const negT = neg.filter((i) => casos[i].enTemporada);
  return { p3, citas: res((c) => c.cita), controles: res((c) => !c.cita), controlesTemporada: res((c) => !c.cita && c.enTemporada),
    auc3: auc(pos.map((i) => p3[i]), neg.map((i) => p3[i])), auc2: auc(pos.map((i) => RANGO2[casos[i].v2]), neg.map((i) => RANGO2[casos[i].v2])),
    auc3T: auc(pos.map((i) => p3[i]), negT.map((i) => p3[i])), auc2T: auc(pos.map((i) => RANGO2[casos[i].v2]), negT.map((i) => RANGO2[casos[i].v2])),
    porGrupo: Object.fromEntries(Object.keys(GRUPOS).map((g) => [g, { citas: res((c) => c.cita && c.grupo === g), controles: res((c) => !c.cita && c.grupo === g) }])),
    citasFueraTemporada: res((c) => c.cita && !c.enTemporada) };
}

const fila = (nombre: string, r: Resumen) =>
  `| ${nombre} | ${r.n} | ${pct(r.verde2, r.n)} | ${pct(r.amar2, r.n)} | ${pct(r.verde3, r.n)} | ${pct(r.amar3, r.n)} | ${Number.isFinite(r.med3) ? r.med3 : '—'} |`;

// ---------------------------------------------------------------- casos de campo (Forecast API, como la app)

async function campo(man: any) {
  const D = join(DATOS, 'out', 'app');
  const sitios = JSON.parse(readFileSync(join(D, 'sitios.json'), 'utf8'));
  const puntos = JSON.parse(readFileSync(join(D, 'meteo_puntos.json'), 'utf8'));
  const reglas = (e: string) => man.especies.find((x: any) => x.id === e)?.tiempo;
  const dist = (a: any, b: any) => { const r = Math.PI / 180, dLa = (b.lat - a.lat) * r, dLo = (b.lon - a.lon) * r;
    const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) ** 2; return 2 * 6371 * Math.asin(Math.sqrt(h)); };
  const casos = [
    { nombre: 'Oronja, Venta Pula (Ojén), iNat 412643652', punto: { lat: 36.5958, lon: -4.8507 }, especies: ['amanita_caesarea'], fechas: ['2026-11-03', '2026-11-07'], n: 4 },
    { nombre: 'Hallazgo del 07/11 junto a Monda (A-355, gasolinera BP)', punto: { lat: 36.6364, lon: -4.8054 },
      especies: ['lactarius_sanguifluus', 'suillus_collinitus', 'suillus_bellinii'], fechas: ['2026-11-07'], n: 3 },
  ];
  const ids = new Set<number>();
  const elegidos = casos.map((c) => ({ ...c, porEspecie: c.especies.map((e) => {
    const l = (sitios.especies[e] ?? []).map((s: any) => ({ s, km: dist(c.punto, s) })).sort((a: any, b: any) => a.km - b.km).slice(0, c.n);
    l.forEach((x: any) => ids.add(x.s.meteo_id));
    return { e, l };
  }) }));
  const pts = puntos.filter((p: any) => ids.has(p.id));
  // Como la app (60 días pasados desde el 13/11; antes se forzaban 40 para que el 03/11 tuviera 30 de historia).
  const met = await consultar(pts, (u: string) => fetch(u));
  const out: string[] = [];
  out.push(`Consulta Forecast API: ${met.fecha_consulta} (hoy en Madrid: ${met.hoy})`, '');
  out.push('| Caso | Especie | Sitio (km al punto) | Punto meteo | Fecha | v2 | v3 | Motivo v3 |', '|---|---|---|---|---|---|---|---|');
  for (const c of elegidos) for (const { e, l } of c.porEspecie) for (const { s, km } of l) for (const f of c.fechas) {
    const serie = met.puntos[String(s.meteo_id)];
    const r2 = v2.semaforo(serie, reglas(e), f);
    const r3 = v3.semaforo(serie, reglas(e), f);
    out.push(`| ${c.nombre} | ${e} | ${s.lat.toFixed(4)}, ${s.lon.toFixed(4)} (${km.toFixed(1)} km) | ${s.meteo_id} | ${f} | ${r2.estado} | ${r3.estado} ${r3.probabilidad} % | ${r3.motivo.replace(/\|/g, '/')} |`);
  }
  return out.join('\n');
}

// ---------------------------------------------------------------- cambio del ranking (Forecast API de hoy)

/** Cuánto cambia el Top 10 de cada especie: v3 con el factor por estado frente al continuo por probabilidad, y v2 → v3. */
async function ranking(man: any) {
  const D = join(DATOS, 'out', 'app');
  const { topEspecie, parsearSitios } = await import(SRC + 'ranking.ts');
  const sitios = parsearSitios(JSON.parse(readFileSync(join(D, 'sitios.json'), 'utf8')));
  const met = await consultar(JSON.parse(readFileSync(join(D, 'meteo_puntos.json'), 'utf8')));
  const base = { fiabilidad: () => 'buena', maxDificultad: null };
  const ov = (x: number[], y: number[]) => x.filter((i) => y.includes(i)).length;
  let n = 0, sEst = 0, top1 = 0, sV2 = 0;
  const filas: string[] = [];
  for (const e of man.especies) {
    const r = e.tiempo; if (!r || !sitios.especies[e.id]) continue;
    const r3 = (id: number) => v3.semaforo(met.puntos[String(id)], r, met.hoy), r2 = (id: number) => v2.semaforo(met.puntos[String(id)], r, met.hoy);
    const ids = (o: any) => topEspecie(sitios, e.id, { ...base, ...o }, 10).map((x: any) => x.sitio.id);
    const a = ids({ estadoEn: (_: string, id: number) => r3(id).estado });
    const b = ids({ estadoEn: (_: string, id: number) => r3(id).estado, probabilidadEn: (_: string, id: number) => r3(id).probabilidad ?? null });
    const c = ids({ estadoEn: (_: string, id: number) => r2(id).estado });
    n++; sEst += ov(a, b); top1 += a[0] === b[0] ? 1 : 0; sV2 += ov(c, b);
    filas.push(`| ${e.id} | ${ov(a, b)}/10 | ${a[0] === b[0] ? 'igual' : 'cambia'} | ${ov(c, b)}/10 |`);
  }
  return [`Ranking con la previsión del ${met.hoy} (${n} especies, Top 10 de sitios.json): solape medio factor por estado → por probabilidad `
    + `${(sEst / n).toFixed(1)}/10 (n.º 1 igual en ${top1}/${n}); solape medio v2 → v3 completo ${(sV2 / n).toFixed(1)}/10.`, '',
    '| Especie | Top 10 estado→probabilidad | N.º 1 | Top 10 v2→v3 |', '|---|---|---|---|', ...filas].join('\n');
}

// ---------------------------------------------------------------- principal

async function main() {
  const args = process.argv.slice(2);
  const man = JSON.parse(readFileSync(join(DATOS, 'out', 'app', 'manifest.json'), 'utf8'));
  const reglasDe = (e: string) => man.especies.find((x: any) => x.id === e)?.tiempo;
  if (args.includes('--campo') && REGION !== 'marbella') throw new Error('--campo solo tiene casos de campo de Marbella');
  if (args.includes('--campo')) { process.stdout.write((await campo(man)) + '\n'); return; }
  if (args.includes('--ranking')) { process.stdout.write((await ranking(man)) + '\n'); return; }
  mkdirSync(CACHE, { recursive: true });
  const cs = muestra(reglasDe);
  await elevaciones(cs);
  const azar = rng(SEMILLA + 1);
  const ctrl = new Map(cs.map((c) => [c, controles(c, azar)]));
  const fechasCelda = new Map<string, string[]>();
  for (const c of cs) { const k = `${celda(c.lat)},${celda(c.lon)}`; fechasCelda.set(k, [...(fechasCelda.get(k) ?? []), c.fecha, ...ctrl.get(c)!]); }
  const meteo = new Map<string, SerieCelda[]>();
  let n = 0;
  for (const [k, fs] of fechasCelda) {
    const [la, lo] = k.split(',').map(Number);
    meteo.set(k, await meteoCelda(la, lo, fs));
    if (++n % 20 === 0) process.stderr.write(`  celdas ${n}/${fechasCelda.size} (peticiones nuevas: ${pedidas})\n`);
  }
  const casos: Caso[] = [];
  let sinSerie = 0;
  for (const c of cs) {
    const s = meteo.get(`${celda(c.lat)},${celda(c.lon)}`)!;
    const reglas = reglasDe(c.especie);
    for (const [f, cita] of [[c.fecha, true], ...ctrl.get(c)!.map((x) => [x, false])] as [string, boolean][]) {
      const serie = serieDia(s, f, c.elev ?? s[0].elevation);
      if (serie.length < 31) { sinSerie++; continue; }
      const r2 = v2.semaforo(serie, reglas, f);
      casos.push({ grupo: c.grupo, especie: c.especie, fecha: f, cita, enTemporada: !reglas.meses || reglas.meses.includes(+f.slice(5, 7)),
        v2: r2.estado, serie, reglas });
    }
  }
  const ev = evaluar(casos);
  const L: string[] = [];
  L.push(`Muestra: ${cs.length} citas (${Object.keys(GRUPOS).map((g) => `${g} ${cs.filter((c) => c.grupo === g).length}`).join(', ')}), `
    + `${casos.filter((c) => !c.cita).length} controles; ${meteo.size} celdas de 0,1°, ${[...meteo.values()].reduce((a, x) => a + x.length, 0)} tramos de meteo; casos sin serie: ${sinSerie}.`, '');
  const crudo = readFileSync(join(DATOS, 'out', 'citas.geojson'));
  const gj = JSON.parse(crudo.toString('utf8'));
  L.push(`Región: ${REGION}. Citas: pipeline/data/${REGION}/out/citas.geojson (generado ${gj.metadata?.generado}, ${gj.features.length} registros, `
    + `sha256 ${createHash('sha256').update(crudo).digest('hex').slice(0, 12)}); semilla ${SEMILLA}.`, '');
  L.push(`Parámetros v3: ${JSON.stringify(v3.PARAMS)}; umbrales verde ≥ ${v3.UMBRAL_VERDE}, amarillo ≥ ${v3.UMBRAL_AMARILLO}.`, '');
  L.push('| Conjunto | n | v2 verde | v2 ≥ amarillo | v3 verde | v3 ≥ amarillo | v3 mediana % |', '|---|---|---|---|---|---|---|');
  L.push(fila('Citas', ev.citas), fila('Controles (todo el año)', ev.controles), fila('Controles en temporada', ev.controlesTemporada),
    fila('Citas fuera de los meses de la especie', ev.citasFueraTemporada));
  for (const g of Object.keys(GRUPOS)) L.push(fila(`Citas · ${g}`, ev.porGrupo[g].citas), fila(`Controles · ${g}`, ev.porGrupo[g].controles));
  L.push('', `AUC citas vs controles: v2 ${ev.auc2.toFixed(3)} · v3 ${ev.auc3.toFixed(3)}. Solo controles en temporada: v2 ${ev.auc2T.toFixed(3)} · v3 ${ev.auc3T.toFixed(3)}.`);
  // Por qué fallan las citas en rojo v3: el motivo (primeras palabras).
  const rojas = casos.filter((c, i) => c.cita && ev.p3[i] < v3.UMBRAL_AMARILLO);
  const motivos: Record<string, number> = {};
  for (const c of rojas) { const m = v3.semaforo(c.serie, c.reglas, c.fecha).motivo.split(/[:(.]/)[0].trim()
    .replace(/\d+ mm/g, 'N mm').replace(/\d\d\/\d\d/g, 'DD/MM'); motivos[m] = (motivos[m] ?? 0) + 1; }
  L.push('', `Citas en rojo con v3 (${rojas.length}), por motivo: ` + Object.entries(motivos).sort((a, b) => b[1] - a[1]).map(([m, n]) => `${m} ${n}`).join('; ') + '.');
  if (args.includes('--diag')) {
    // Dónde caen las citas respecto a la ventana de su episodio más reciente (con la serie de 30 días de la app) y
    // cuánto se sale su temperatura; mismas cuentas para los controles en temporada.
    const fase = (c: Caso) => {
      const [vmin, vmax] = c.reglas.ventana_dias;
      const hoyI = 30;
      let ult = -1;
      for (let i = hoyI; i >= 0; i--) {
        let suma = 0, mejor = 0;
        if (!(c.serie[i].lluvia >= 1)) continue;
        for (let k = 0; k < 3 && i - k >= 0; k++) { suma += c.serie[i - k].lluvia; mejor = Math.max(mejor, suma); }
        if (mejor >= c.reglas.episodio_mm) { ult = i; break; }
      }
      if (ult < 0) return 'sin episodio en 30 d';
      const d = hoyI - ult;
      return d < vmin - 7 ? 'd < vmin − 7' : d < vmin - 3 ? 'vmin − 7 ≤ d < vmin − 3' : d < vmin ? 'rampa (vmin − 3 ≤ d < vmin)'
        : d <= vmax ? 'ventana' : d <= vmax + 7 ? 'vmax < d ≤ vmax + 7' : 'd > vmax + 7';
    };
    const tdev = (c: Caso) => {
      const u = c.serie.slice(21, 31), m = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
      const mn = m(u.map((d) => d.tmin)), mx = m(u.map((d) => d.tmax));
      const f = (v: number, [a, b]: [number, number]) => Math.max(0, a - v, v - b);
      const t = f(mn, c.reglas.tmin_media) + f(mx, c.reglas.tmax_media);
      return t === 0 ? 'en rango' : t < 1 ? '< 1 °C' : t < 2 ? '1–2 °C' : t < 4 ? '2–4 °C' : '≥ 4 °C';
    };
    const tabla = (titulo: string, f: (c: Caso) => string) => {
      const cit = casos.filter((c) => c.cita), ctl = casos.filter((c) => !c.cita && c.enTemporada);
      const ks = [...new Set([...cit, ...ctl].map(f))].sort();
      L.push('', `| ${titulo} | citas | controles en temporada |`, '|---|---|---|');
      for (const k of ks) L.push(`| ${k} | ${pct(cit.filter((c) => f(c) === k).length, cit.length)} | ${pct(ctl.filter((c) => f(c) === k).length, ctl.length)} |`);
    };
    tabla('Fase del episodio más reciente', fase);
    tabla('Desvío de temperatura (suma de mínimas y máximas)', tdev);
    const hum = casos.filter((c) => c.cita && /suelo aún seco/.test(v3.semaforo(c.serie, c.reglas, c.fecha).motivo)).length;
    const est = casos.filter((c) => c.cita && /puede cortar la salida/.test(v3.semaforo(c.serie, c.reglas, c.fecha).motivo)).length;
    L.push('', `Citas con humedad acumulada insuficiente en el motivo v3: ${hum}; con estrés (calor o aire seco): ${est}.`);
  }
  if (args.includes('--rejilla')) {
    L.push('', '| Variante | citas verde | citas ≥ amarillo | controles verde | controles ≥ amarillo | ctrl. temporada ≥ amarillo | AUC | AUC temporada |', '|---|---|---|---|---|---|---|---|');
    const variantes: [string, any, any?][] = [
      ['elegida (PARAMS)', {}],
      ['propuesta inicial: rampa 3 · caída 7 · escala 4 · sin inicio', { rampa_dias: 3, rampa_inicio_frac: 0, caida_min_dias: 7, temp_escala: 4 }],
      ['rampa 3', { rampa_dias: 3 }], ['rampa 7', { rampa_dias: 7 }], ['rampa 14', { rampa_dias: 14 }],
      ['inicio de rampa 0 (desde la lluvia)', { rampa_inicio_frac: 0 }], ['inicio de rampa 0,5·vmin', { rampa_inicio_frac: 0.5 }],
      ['caída mín. 7', { caida_min_dias: 7 }], ['caída mín. 14', { caida_min_dias: 14 }], ['caída 0,6 × ancho', { caida_frac: 0.6 }],
      ['escala temp. 4', { temp_escala: 4 }], ['escala temp. 8', { temp_escala: 8 }],
      ['humedad 0,5', { f_humedad: 0.5 }], ['humedad 0,75', { f_humedad: 0.75 }], ['estrés 0,6', { f_estres: 0.6 }],
      ['fuera 0,15', { f_fuera: 0.15 }], ['fuera 0,25', { f_fuera: 0.25 }], ['fuera con lluvia fuerte 0,6', { f_fuera_fuerte: 0.6 }], ['p_max 1', { p_max: 1 }],
      ['umbrales 45/20', {}, { verde: 45, amarillo: 20 }], ['umbrales 55/25', {}, { verde: 55, amarillo: 25 }], ['umbrales 50/15', {}, { verde: 50, amarillo: 15 }],
    ];
    for (const [n, p, u] of variantes) {
      const e = evaluar(casos, p, u ?? { verde: v3.UMBRAL_VERDE, amarillo: v3.UMBRAL_AMARILLO });
      L.push(`| ${n} | ${pct(e.citas.verde3, e.citas.n)} | ${pct(e.citas.amar3, e.citas.n)} | ${pct(e.controles.verde3, e.controles.n)} | ${pct(e.controles.amar3, e.controles.n)} `
        + `| ${pct(e.controlesTemporada.amar3, e.controlesTemporada.n)} | ${e.auc3.toFixed(3)} | ${e.auc3T.toFixed(3)} |`);
    }
  }
  process.stdout.write(L.join('\n') + '\n');
}

if (import.meta.main) await main();
