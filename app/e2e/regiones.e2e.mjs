// e2e de regiones (multi-región, fase B): una región falsa «prueba» servida por Playwright sobre los archivos de Marbella
// (no hay datos de Alicante todavía). Cubre: migración de una instalación plana → mapas/marbella; chip y cambio de región;
// especie sin hábitat; normativa por CCAA sin cupo no verificado; atribuciones y avisos del manifest; descarga de una
// segunda región sin perder la primera; primera elección sin GPS; región guardada que ya no existe (spec §6).
// Requiere `npm run build` y el servidor: php -S 127.0.0.1:8765 -t dist servidor.php
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium, devices } = createRequire(import.meta.url)('playwright');

const AQUI = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.URL_APP ?? 'http://127.0.0.1:8765/';
const URL_APP = BASE + '?e2e=1&hoy=2026-10-14';
const CAPTURAS = join(AQUI, 'capturas'); mkdirSync(CAPTURAS, { recursive: true });
const MARBELLA_GPS = { latitude: 36.589, longitude: -5.244 };
let paso = 0;
const ok = (m) => console.log(`✔ ${++paso}. ${m}`);
const comprobar = (c, m) => { if (!c) throw new Error(`Falla: ${m}`); ok(m); };

// Manifest de la región falsa: el fixture + tamaños y metadatos reales de Marbella.
const marbella = await (await fetch(new URL('data/marbella/manifest.json', BASE))).json();
const fix = JSON.parse(readFileSync(join(AQUI, 'fixtures/region-prueba/manifest.json'), 'utf8'));
const bytes = Object.fromEntries(marbella.archivos.map((a) => [a.nombre, a.bytes]));
const caesarea = marbella.especies.find((e) => e.id === 'amanita_caesarea');
const PRUEBA = { ...fix, generado: marbella.generado, zoom: marbella.zoom, umbrales: [0],
  especies: fix.especies.map((e) => (e.id === 'amanita_caesarea' ? { ...e, tiempo: caesarea.tiempo, fiabilidad: caesarea.fiabilidad } : e)),
  archivos: fix.archivos.map((nombre) => ({ nombre, bytes: bytes[nombre] })) };
PRUEBA.total_bytes = PRUEBA.archivos.reduce((s, a) => s + a.bytes, 0);
const INDICE_PRUEBA = { id: 'prueba', nombre: 'Prueba', origen: fix.region.origen, bbox: fix.bbox, total_bytes: PRUEBA.total_bytes, generado: PRUEBA.generado };

const nav = await chromium.launch();
async function contexto(gps) {
  const ctx = await nav.newContext({ ...devices['Pixel 7'], ...(gps ? { geolocation: gps, permissions: ['geolocation'] } : {}),
    locale: 'es-ES', timezoneId: 'Europe/Madrid' });
  await ctx.route('**/api.open-meteo.com/**', (r) => r.fulfill({ status: 503, body: '' }));   // el tiempo no es objeto de este e2e
  await ctx.route('https://www.ign.es/**', (r) => r.fulfill({ status: 404, body: '' }));
  await ctx.route('**/data/regiones.json', async (r) => r.fulfill({ json: [...await (await r.fetch()).json(), INDICE_PRUEBA] }));
  await ctx.route('**/data/prueba/**', async (r) => {
    const u = r.request().url();
    if (/\/data\/prueba\/manifest\.json/.test(u)) return r.fulfill({ json: PRUEBA });
    return r.fulfill({ response: await r.fetch({ url: u.replace('/data/prueba/', '/data/marbella/') }) });
  });
  return ctx;
}
const mapaListo = (p) => p.waitForFunction(() => document.body.dataset.mapa === 'listo', null, { timeout: 60000 });
const entendido = async (p) => { const b = p.getByRole('button', { name: 'Entendido' }); if (await b.isVisible().catch(() => false)) await b.click(); };
const opfs = (p) => p.evaluate(async () => {
  const lista = async (d, pre = '') => { const r = []; for await (const [k, h] of d.entries()) r.push(...(h.kind === 'file' ? [pre + k] : await lista(h, `${pre}${k}/`))); return r; };
  return (await lista(await navigator.storage.getDirectory())).sort();
});

try {
  // ---- A. Migración de una instalación plana (antes de la fase B) → mapas/marbella
  const ctx = await contexto(MARBELLA_GPS);
  const p = await ctx.newPage();
  await p.goto(new URL('iconos/icono-192.png', BASE).href);   // mismo origen, sin arrancar la app
  await p.evaluate(async () => {
    const raiz = await navigator.storage.getDirectory();
    const d = await raiz.getDirectoryHandle('mapas', { create: true });
    const w = await (await d.getFileHandle('legado.txt', { create: true })).createWritable(); await w.write('x'); await w.close();
    localStorage.setItem('setas:mapas-descargados', JSON.stringify({ fecha: '2026-10-01T00:00:00Z', bytes: 1, generado: 'legado', archivos: { 'legado.txt': 1 } }));
    localStorage.setItem('setas:capa', JSON.stringify({ especie: 'boletus_edulis', umbral: 200 }));
    localStorage.setItem('setas:aviso-visto', '1');
  });
  await p.goto(URL_APP);
  await mapaListo(p);
  const tras = await p.evaluate(() => ({ region: localStorage.getItem('setas:region'), marca: localStorage.getItem('setas:migracion-regiones'),
    estado: localStorage.getItem('setas:mapas-descargados:marbella'), viejo: localStorage.getItem('setas:mapas-descargados'),
    capa: localStorage.getItem('setas:capa:marbella'), especie: document.querySelector('#sel-especie').value }));
  comprobar((await opfs(p)).includes('mapas/marbella/legado.txt') && !(await opfs(p)).includes('mapas/legado.txt'), 'migración: archivos en mapas/marbella');
  comprobar(tras.region === 'marbella' && tras.marca === '1' && /legado/.test(tras.estado) && tras.viejo === null, 'migración: claves renombradas y región marbella');
  comprobar(/boletus_edulis/.test(tras.capa) && tras.especie === 'boletus_edulis', 'migración: la capa elegida se conserva');

  // ---- B. Chip y cambio de región
  comprobar(await p.locator('#btn-region').isVisible() && (await p.locator('#btn-region-nombre').textContent()) === 'Marbella', 'chip de región visible con dos regiones');
  await p.screenshot({ path: join(CAPTURAS, 'regiones-chip.png') });
  await p.emulateMedia({ colorScheme: 'dark' });
  await p.screenshot({ path: join(CAPTURAS, 'regiones-chip-oscuro.png') });
  await p.emulateMedia({ colorScheme: 'light' });
  await p.locator('#btn-region').click();
  comprobar(await p.locator('#dlg-region').isVisible() && await p.locator('#lista-regiones [data-region=prueba]').isVisible(), 'hoja de regiones con «Prueba»');
  await p.screenshot({ path: join(CAPTURAS, 'regiones-hoja.png') });
  await Promise.all([p.waitForEvent('load'), p.locator('#lista-regiones [data-region=prueba]').click()]);
  await mapaListo(p);
  const enPrueba = await p.evaluate(() => ({ r: window.__setas.region().activa, sel: [...document.querySelectorAll('#sel-especie option')].map((o) => o.value),
    pide: performance.getEntriesByType('resource').some((e) => /\/data\/prueba\//.test(e.name)),
    capaM: localStorage.getItem('setas:capa:marbella'), sh: window.__setas.selector().sinHabitat }));
  comprobar(enPrueba.r === 'prueba' && enPrueba.pide && (await p.locator('#btn-region-nombre').textContent()) === 'Prueba', 'cambio a «Prueba»: recarga y pide data/prueba/');
  comprobar(JSON.stringify(enPrueba.sel) === '["amanita_caesarea"]' && JSON.stringify(enPrueba.sh) === '["terfezia_arenaria"]', 'solo la especie activa tiene capa; terfezia sin hábitat');
  comprobar(/boletus_edulis/.test(enPrueba.capaM), 'la capa de Marbella sigue guardada aparte');
  await p.locator('#btn-especie').click();
  const fila = p.locator('#lista-especies [data-sin-habitat=terfezia_arenaria]');
  comprobar(await fila.isVisible() && /Sin hábitat en esta zona/.test(await fila.textContent()) && (await fila.getAttribute('aria-disabled')) === 'true',
    'fila gris «Sin hábitat en esta zona», no elegible');
  await p.screenshot({ path: join(CAPTURAS, 'regiones-sin-habitat.png') });
  await p.keyboard.press('Escape');

  // ---- C. Ajustes: normativa por CCAA, atribuciones y avisos de la región
  await p.getByRole('button', { name: /Ajustes/ }).click();
  const aj = await p.evaluate(() => ({ n: document.querySelector('#normativa').innerText, a: document.querySelector('#atrib-datos').textContent,
    av: document.querySelector('#avisos-datos').hidden ? '' : document.querySelector('#avisos-datos').innerText,
    tit: document.querySelector('#tit-mapas-offline').textContent }));
  comprobar(/Comunitat Valenciana \(prueba\)/.test(aj.n) && /Pendiente de verificar/.test(aj.n) && !/kg/.test(aj.n) && /\(DOGV\)/.test(aj.n),
    'normativa: entrada CV, «Pendiente de verificar», sin cupo no verificado y nota (DOGV)');
  comprobar(aj.a === 'Datos: Prueba e2e: IGN CC BY 4.0, © OpenStreetMap ODbL, Protomaps' && /capa de vegetación sin datos/.test(aj.av), 'atribución y avisos del manifest');
  comprobar(aj.tit === 'Mapas sin conexión · Prueba', 'título de la descarga con la región');
  await p.locator('#ajustes-region').screenshot({ path: join(CAPTURAS, 'regiones-ajustes.png') });

  // ---- D. Descargar «Prueba» sin perder Marbella
  await Promise.all([p.waitForEvent('load', { timeout: 600000 }), p.locator('#btn-descargar').click()]);
  await mapaListo(p);
  const archivos = await opfs(p);
  comprobar(archivos.includes('mapas/prueba/idoneidad_amanita_caesarea_0.pmtiles') && archivos.includes('mapas/marbella/legado.txt')
    && !archivos.some((a) => a.startsWith('mapas-nuevo/')), 'dos regiones descargadas a la vez; staging limpio');
  comprobar(await p.evaluate(() => !!localStorage.getItem('setas:mapas-descargados:prueba') && !!localStorage.getItem('setas:mapas-descargados:marbella')),
    'estado de descarga por región');

  // ---- E. Volver a Marbella desde Ajustes
  await p.getByRole('button', { name: /Ajustes/ }).click();
  await Promise.all([p.waitForEvent('load'), p.locator('#ajustes-lista-regiones [data-region=marbella] [data-accion=usar]').click()]);
  await mapaListo(p);
  comprobar(await p.evaluate(() => window.__setas.region().activa === 'marbella' && document.querySelector('#sel-especie').value === 'boletus_edulis'),
    'de vuelta en Marbella con su capa');

  // ---- F. Región guardada que ya no existe (spec §6) → GPS → Marbella
  await p.evaluate(() => localStorage.setItem('setas:region', 'desaparecida'));
  await p.reload(); await mapaListo(p);
  comprobar(await p.evaluate(() => localStorage.getItem('setas:region')) === 'marbella', 'región desaparecida: se vuelve a elegir (la más cercana)');
  await ctx.close();

  // ---- G. Primera vez sin GPS: se pregunta
  const ctx2 = await contexto(null);
  const q = await ctx2.newPage();
  await q.goto(URL_APP);
  await entendido(q);
  await q.locator('#dlg-region').waitFor({ state: 'visible', timeout: 15000 });
  comprobar(await q.locator('#regiones-intro').isVisible(), 'sin GPS: hoja «Elige región» con la explicación');
  await q.screenshot({ path: join(CAPTURAS, 'regiones-primera-vez.png') });
  await q.locator('#lista-regiones [data-region=prueba]').click();
  await mapaListo(q);
  comprobar(await q.evaluate(() => window.__setas.region().activa) === 'prueba', 'primera elección guardada');
  await ctx2.close();
  console.log('e2e de regiones: OK');
} finally {
  await nav.close();
}
