// Aviso diario de ventanas: qué especies de una región (Marbella por defecto; `--region alicante`) pasan a VERDE en los próximos días (D+1..D+4)
// sin estar verdes hoy. Reproduce el cálculo real de Hoy (meteo.ts + semaforo.ts + ranking.ts + razones.ts) con la
// previsión Open-Meteo. Cada sitio listado lleva su probabilidad estimada (semáforo v3) ese día.
// Salida en stdout: JSON {asunto, html, texto, hay_aviso}.
// Uso: node scripts/aviso-ventanas.mts [--region <id>] [--sin-estado] [--datos <dir app del pipeline>]
//   --region  id de pipeline/data/regiones.json (marbella por defecto); el origen y el nombre salen de ahí y los datos de
//             pipeline/data/<id>/out/app.
// Estado anti-repetición (claves «especie|fecha_apertura»), uno por región para que no se pisen:
//   Marbella ~/Library/Application Support/mapa-setas/avisos.json (el de siempre); otra región …/avisos-<id>.json.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerHooks } from 'node:module';

// src/ importa sin extensión ('./meteo'), como espera Vite: resolver a .ts para el node nativo (sin tsx).
registerHooks({ resolve(spec, ctx, next) {
  try { return next(spec, ctx); } catch (e) { if (spec.startsWith('.') && !/\.\w+$/.test(spec)) return next(spec + '.ts', ctx); throw e; }
} });

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(APP, 'src') + '/';
const { consultar, edadHoras } = await import(SRC + 'meteo.ts');
const { semaforo, sumarDias, diasEntre, ddmm, textoProbabilidad, ETIQUETA_PROBABILIDAD } = await import(SRC + 'semaforo.ts');
const { topEspecie, parsearSitios, distanciaM } = await import(SRC + 'ranking.ts');
const { razonSitio } = await import(SRC + 'razones.ts');
const { nivelFiabilidad } = await import(SRC + 'fiabilidad.ts');
const { gruposDe } = await import(SRC + 'grupos.ts');
const { ponerTextosTitularidad, textoTitularidad, detallesTitularidad } = await import(SRC + 'titularidad.ts');

export const REGION_DEF = 'marbella';
export const PIE = 'Orientativo. No consumas ninguna seta sin confirmación de un experto.';
export const HORIZONTE = 4;
const DIR_ESTADO = join(homedir(), 'Library', 'Application Support', 'mapa-setas');
/** Archivo de estado anti-repetición de una región: Marbella conserva el nombre original. */
export const rutaEstado = (region: string, dir = DIR_ESTADO) => join(dir, region === REGION_DEF ? 'avisos.json' : `avisos-${region}.json`);

export interface RegionIndice { id: string; nombre: string; origen: [number, number] }
/** Región `id` de regiones.json (origen = [lon, lat]); error claro si no existe. */
export function regionDe(lista: RegionIndice[], id: string): { id: string; nombre: string; lat: number; lon: number } {
  const r = lista.find((x) => x.id === id);
  if (!r) throw new Error(`región «${id}» no está en regiones.json (hay: ${lista.map((x) => x.id).join(', ')})`);
  return { id: r.id, nombre: r.nombre, lat: r.origen[1], lon: r.origen[0] };
}

export interface SitioAviso { probabilidad?: number | null; puntuacion: number; t_pie_min: number; subida_m: number; km: number; titularidad: string; mapa: string; razon: string }
export interface Apertura { especie: string; nombre: string; grupo: string; fecha: string; dias: number | null; motivo: string; sitios: SitioAviso[] }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const fechaLarga = (iso: string) => `${DIAS[new Date(iso + 'T12:00:00Z').getUTCDay()]} ${ddmm(iso)}`;
const duracion = (d: number | null) => (d == null ? 'duración sin estimar' : d <= 0 ? 'aprox. 1 día' : `aprox. ${d + 1} días`);

/** Compone asunto, HTML y texto. Pura (testeable). */
export function componer(aperturas: Apertura[], hoy: string, region = 'Marbella') {
  const hay_aviso = aperturas.length > 0;
  const porGrupo = new Map<string, Apertura[]>();
  for (const a of aperturas) { if (!porGrupo.has(a.grupo)) porGrupo.set(a.grupo, []); porGrupo.get(a.grupo)!.push(a); }
  const asunto = hay_aviso
    ? `Setas ${region}: abre ventana para ${aperturas.map((a) => a.nombre).join(', ')} (desde el ${ddmm(aperturas.map((a) => a.fecha).sort()[0])})`
    : `Setas ${region}: sin ventanas nuevas (${ddmm(hoy)})`;
  const t: string[] = [], h: string[] = [];
  h.push(`<div style="font-family:system-ui,sans-serif;max-width:640px">`);
  if (!hay_aviso) { t.push('Ninguna especie pasa a verde en los próximos días.'); h.push('<p>Ninguna especie pasa a verde en los próximos días.</p>'); }
  for (const [g, lista] of porGrupo) {
    t.push(`== ${g} ==`); h.push(`<h2>${esc(g)}</h2>`);
    for (const a of lista) {
      const cab = `${a.nombre}: abre el ${fechaLarga(a.fecha)}, ${duracion(a.dias)}`;
      t.push(cab, `  Motivo: ${a.motivo}`);
      h.push(`<h3>${esc(a.nombre)}</h3><p>Abre el <b>${esc(fechaLarga(a.fecha))}</b>, ${esc(duracion(a.dias))}.<br>Motivo: ${esc(a.motivo)}</p><ol>`);
      for (const s of a.sitios) {
        const pr = s.probabilidad != null ? `${ETIQUETA_PROBABILIDAD} ${textoProbabilidad(s.probabilidad)} · ` : '';
        const l = `${pr}puntuación ${s.puntuacion} · ${s.t_pie_min} min a pie · ${s.subida_m} m de subida · ${s.km.toFixed(1)} km en recta · ${s.titularidad}`;
        t.push(`  - ${l}`, `    ${s.razon}`, `    ${s.mapa}`);
        h.push(`<li>${esc(l)}<br><i>${esc(s.razon)}</i><br><a href="${esc(s.mapa)}">Abrir en Google Maps</a></li>`);
      }
      h.push('</ol>'); t.push('');
    }
  }
  t.push(PIE); h.push(`<p style="color:#666;font-size:12px">${esc(PIE)}</p></div>`);
  return { asunto, html: h.join('\n'), texto: t.join('\n'), hay_aviso };
}

async function main() {
  const args = process.argv.slice(2);
  const sinEstado = args.includes('--sin-estado');
  const valor = (flag: string) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
  const PIPE = join(APP, '..', 'pipeline', 'data');
  const reg = regionDe(JSON.parse(readFileSync(join(PIPE, 'regiones.json'), 'utf8')), valor('--region') ?? REGION_DEF);
  const ORIGEN = { lat: reg.lat, lon: reg.lon };
  const ESTADO = rutaEstado(reg.id);
  const D = valor('--datos') ?? join(PIPE, reg.id, 'out', 'app');
  const man = JSON.parse(readFileSync(join(D, 'manifest.json'), 'utf8'));
  ponerTextosTitularidad(man.titularidad);
  const sitios = parsearSitios(JSON.parse(readFileSync(join(D, 'sitios.json'), 'utf8')));
  if (!sitios) throw new Error('sitios.json no válido');
  const met = await consultar(JSON.parse(readFileSync(join(D, 'meteo_puntos.json'), 'utf8')));
  const hoy: string = met.hoy;
  const edad = edadHoras(met);
  const ids = Object.keys(sitios.especies);
  const aperturas: Apertura[] = [];
  for (const { grupo, especies } of gruposDe(ids)) for (const e of especies) {
    const meta = man.especies.find((x: any) => x.id === e);
    const reglas = meta?.tiempo; if (!reglas) continue;
    const fi = nivelFiabilidad(meta?.fiabilidad);
    const lista = sitios.especies[e] ?? [];
    const res = (id: number, f: string) => { const s = met.puntos[String(id)]; return s ? semaforo(s, reglas, f, { edadHoras: edad }) : null; };
    if (lista.some((s: any) => res(s.meteo_id, hoy)?.estado === 'verde')) continue; // ya abierta hoy
    let fecha: string | null = null;
    for (let d = 1; d <= HORIZONTE && !fecha; d++) { const f = sumarDias(hoy, d); if (lista.some((s: any) => res(s.meteo_id, f)?.estado === 'verde')) fecha = f; }
    if (!fecha) continue;
    const top = topEspecie(sitios, e, { estadoEn: (_: unknown, id: number) => res(id, fecha!)?.estado ?? null,
      probabilidadEn: (_: unknown, id: number) => res(id, fecha!)?.probabilidad ?? null, fiabilidad: () => fi, maxDificultad: null }, 1000)
      .filter((x: any) => x.estado === 'verde').slice(0, 3);
    const r0 = res(top[0].sitio.meteo_id, fecha)!;
    aperturas.push({
      especie: e, nombre: meta.nombre ?? e, grupo: grupo.nombre, fecha,
      dias: r0.hasta ? diasEntre(fecha, r0.hasta) : null, motivo: r0.motivo,
      sitios: top.map((x: any) => { const s = x.sitio; const rr = res(s.meteo_id, fecha!);
        const tit = s.titularidad ? [textoTitularidad(s.titularidad), ...detallesTitularidad(s.titularidad)].join(' · ') : 'titularidad sin dato';
        return { probabilidad: rr?.probabilidad ?? null, puntuacion: x.puntuacion, t_pie_min: s.t_pie_min, subida_m: s.subida_m, km: distanciaM(s, ORIGEN) / 1000,
          titularidad: tit, mapa: `https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lon}`,
          razon: razonSitio(x, { fiabilidad: fi, motivo: rr?.motivo ?? null }) }; }),
    });
  }
  let nuevas = aperturas;
  if (!sinEstado) {
    const est: { avisadas: string[] } = existsSync(ESTADO) ? JSON.parse(readFileSync(ESTADO, 'utf8')) : { avisadas: [] };
    nuevas = aperturas.filter((a) => !est.avisadas.includes(`${a.especie}|${a.fecha}`));
    if (nuevas.length) {
      mkdirSync(dirname(ESTADO), { recursive: true });
      writeFileSync(ESTADO, JSON.stringify({ avisadas: [...est.avisadas, ...nuevas.map((a) => `${a.especie}|${a.fecha}`)] }, null, 1));
    }
  }
  process.stdout.write(JSON.stringify(componer(nuevas, hoy, reg.nombre), null, 1) + '\n');
}

if (import.meta.main) await main();
