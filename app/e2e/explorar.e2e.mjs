// e2e «Explorar aquí» (2026-10-25): cámara falsa (--use-fake-device-for-media-stream), brújula e inclinación inyectadas
// con eventos deviceorientation y GPS simulado. Barrido de 8 fotos con disparo automático, observación guardada en
// IndexedDB (8 direcciones, JPEG ≤ 400 KB, sin EXIF, con lo que decía el modelo), nota en la ruta que se graba, pregunta de
// hallazgo, «Guardar como sitio», respaldo sin cámara en vivo (una foto por dirección con el selector de archivos) y
// pausa por inactividad. Datos reales de Marbella (como campo-micro.e2e.mjs).
// Requiere `npm run build` y el servidor: php -S 127.0.0.1:8765 -t dist servidor.php (o URL_APP=…).
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium, devices } = createRequire(import.meta.url)('playwright');

const BASE = process.env.URL_APP ?? 'http://127.0.0.1:8765/';
const Q = '?e2e=1&hoy=2026-10-14';
const CAPTURAS = process.env.CAPTURAS_EXPLORAR ?? mkdtempSync(join(tmpdir(), 'explorar-e2e-'));
const FOTO = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'pnoa-tesela.jpg'));
const PROHIBIDO = /comestib|se puede comer/i;
const ESPECIE = 'boletus_aereus';
const YO = { lat: 36.589, lon: -5.244, alt: 300, acc: 5 };     // alcornocal de Los Alcornocales (región Marbella)
let paso = 0;
const ok = (m) => console.log(`✔ ${++paso}. ${m}`);
const comprobar = (c, m) => { if (!c) throw new Error(`Falla: ${m}`); ok(m); };

/** GPS falso y brújula/inclinación: `window.__H` (rumbo) y `window.__beta` se emiten cada 30 ms como lo haría iOS. */
function sensoresFalsos(inicial) {
  const oyentes = new Map(); let n = 0;
  const mk = (p) => ({ coords: { latitude: p.lat, longitude: p.lon, accuracy: p.acc ?? 5, altitude: p.alt ?? null,
    altitudeAccuracy: p.alt != null ? 6 : null, heading: null, speed: null }, timestamp: Date.now() });
  window.__geo = { pos: inicial, emitir(p) { this.pos = p; for (const f of oyentes.values()) f(mk(p)); } };
  const geo = {
    watchPosition(okf) { const i = ++n; oyentes.set(i, okf); setTimeout(() => window.__geo.pos && okf(mk(window.__geo.pos)), 10); return i; },
    clearWatch(i) { oyentes.delete(i); },
    getCurrentPosition(okf) { setTimeout(() => window.__geo.pos && okf(mk(window.__geo.pos)), 10); },
  };
  Object.defineProperty(Navigator.prototype, 'geolocation', { get: () => geo, configurable: true });
  window.open = (u) => { window.__abierto = String(u); return null; };
  window.__H = null; window.__beta = 90; window.__acc = 5;
  setInterval(() => {
    if (window.__H === null) return;
    const e = new Event('deviceorientation');
    Object.assign(e, { webkitCompassHeading: window.__H, webkitCompassAccuracy: window.__acc, beta: window.__beta, gamma: 0 });
    window.dispatchEvent(e);
  }, 30);
}
const sinCamara = () => { Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: () => Promise.reject(new DOMException('denegado', 'NotAllowedError')), configurable: true }); };

const nav = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const errores = [];

async function pagina(extra = []) {
  const ctx = await nav.newContext({ ...devices['Pixel 7'], locale: 'es-ES', timezoneId: 'Europe/Madrid', permissions: ['camera'] });
  await ctx.addInitScript(sensoresFalsos, YO);
  for (const f of extra) await ctx.addInitScript(f);
  await ctx.route('**/api.open-meteo.com/**', (r) => r.fulfill({ status: 503, body: '' }));
  await ctx.route('https://www.ign.es/**', (r) => r.fulfill({ status: 404, body: '' }));
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errores.push(String(e)));
  p.on('console', (m) => { if (/cámara:/.test(m.text())) console.log('  [consola]', m.text()); });
  p.on('dialog', (d) => d.accept());
  await p.goto(BASE + Q);
  const b = p.getByRole('button', { name: 'Entendido' });
  if (await b.isVisible({ timeout: 8000 }).catch(() => false)) await b.click();
  await p.waitForFunction(() => document.body.dataset.mapa === 'listo', null, { timeout: 60000 });
  await p.evaluate((id) => { const s = document.querySelector('#sel-especie'); s.value = id; s.dispatchEvent(new Event('change')); }, ESPECIE);
  return p;
}
async function abrirExplorar(p) {
  await p.locator('#btn-centrar').click();
  await p.waitForSelector('#btn-campo:not([hidden])', { timeout: 15000 });
  await p.locator('#btn-campo').click();
  await p.waitForSelector('#dlg-campo[open]');
  await p.waitForFunction(() => { const c = window.__setas.campo(); return c && c.datos && c.datos !== 'cargando' && c.aqui; }, null, { timeout: 30000 });
  await p.locator('#cp-explorar').click();
  await p.waitForSelector('#dlg-explorar[open]');
  await p.waitForFunction(() => window.__setas.explorar()?.camara, null, { timeout: 15000 });
}
const explorar = (p) => p.evaluate(() => window.__setas.explorar());
const observaciones = (p) => p.evaluate(() => new Promise((res, rej) => {
  const r = indexedDB.open('setas-observaciones');
  r.onerror = () => rej(r.error);
  r.onsuccess = () => {
    const db = r.result;
    if (!db.objectStoreNames.contains('observaciones')) { res([]); return; }
    const g = db.transaction('observaciones').objectStore('observaciones').getAll();
    g.onsuccess = async () => {
      const out = [];
      for (const o of g.result) {
        const dirs = [];
        for (const d of o.direcciones) {
          let ancho = null, alto = null, exif = null;
          if (d.foto) {
            const b = new Uint8Array(await d.foto.arrayBuffer());
            const bm = await createImageBitmap(d.foto); ancho = bm.width; alto = bm.height; bm.close();
            exif = new TextDecoder('latin1').decode(b.slice(0, 4096)).includes('Exif');
          }
          dirs.push({ rumbo: d.rumbo, precBrujula: d.precBrujula, tipo: d.foto?.type ?? null, bytes: d.foto?.size ?? null, ancho, alto, exif, analisis: d.analisis });
        }
        out.push({ ...o, direcciones: dirs });
      }
      res(out);
    };
  };
}));
const delta = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

try {
  // ------------------------------------------------------------ 1. barrido automático de 8 fotos
  const p = await pagina();
  // Se graba una ruta para comprobar que la observación queda como nota suya.
  await p.locator('.pestanas [data-p=p-sitios]').click();
  await p.locator('#btn-grabar-ruta').click();
  await p.waitForFunction(() => window.__setas.grabacion());
  await p.locator('.pestanas [data-p=p-mapa]').click().catch(() => {});
  await abrirExplorar(p);
  let e = await explorar(p);
  comprobar(e.camara === 'vivo', `cámara en vivo (${e.camara}) con la cámara falsa de Chromium`);
  comprobar(await p.locator('#ex-anillo li').count() === 8, 'el anillo del barrido tiene 8 marcas');
  await p.waitForFunction(() => !document.querySelector('#ex-barrer').disabled, null, { timeout: 10000 });
  ok('«Barrer 360°» se habilita cuando llega el GPS');
  await p.evaluate(() => { window.__H = 92; });
  await p.waitForFunction(() => { const x = window.__setas.explorar(); return x?.hayBrujula && x.orientacion !== null && Math.abs(x.orientacion - 92) < 3; }, null, { timeout: 8000 });
  comprobar(/^E 9[0-4]°$/.test(await p.locator('#ex-rumbo').innerText()), 'la barra superior enseña el rumbo («E 92°»)');
  await p.locator('#ex-barrer').click();
  e = await explorar(p);
  comprobar(e.fase === 'barrido' && e.objetivos.join() === '90,135,180,225,270,315,0,45', `barrido desde 92° → ${e.objetivos.join(', ')}`);
  await p.screenshot({ path: join(CAPTURAS, 'explorar-barrido.png') });
  for (let i = 0; i < 8; i++) {
    if (i > 0) await p.evaluate((h) => { window.__H = h; }, e.objetivos[i] + 2);
    await p.waitForFunction((n) => (window.__setas.explorar()?.hechas.length ?? 0) >= n || window.__setas.explorar()?.fase === 'fin', i + 1, { timeout: 10000 });
  }
  await p.waitForSelector('#ex-fin:not([hidden])', { timeout: 20000 });
  ok('al llegar a la octava foto el barrido se guarda solo y sale la pregunta del hallazgo');
  await p.screenshot({ path: join(CAPTURAS, 'explorar-fin.png') });
  let obs = await observaciones(p);
  comprobar(obs.length === 1, 'hay 1 observación en IndexedDB');
  const o = obs[0];
  comprobar(o.direcciones.length === 8, '8 direcciones');
  comprobar(o.direcciones.every((d, i) => delta(d.rumbo, e.objetivos[i]) <= 10), `rumbos medidos a ±10° de los objetivos: ${o.direcciones.map((d) => d.rumbo).join(', ')}`);
  comprobar(o.direcciones.every((d) => d.tipo === 'image/jpeg' && d.bytes > 0 && d.bytes <= 400 * 1024), `fotos JPEG ≤ 400 KB (${o.direcciones.map((d) => Math.round(d.bytes / 1024)).join(', ')} KB)`);
  comprobar(o.direcciones.every((d) => Math.max(d.ancho, d.alto) <= 1024 && d.ancho > 0), `lado mayor ≤ 1024 px (${o.direcciones[0].ancho}×${o.direcciones[0].alto})`);
  comprobar(o.direcciones.every((d) => d.exif === false && d.precBrujula === 5 && d.analisis === null), 'fotos sin EXIF, con la precisión de la brújula y sin análisis');
  comprobar(Math.abs(o.lat - YO.lat) < 1e-9 && Math.abs(o.lon - YO.lon) < 1e-9 && o.precGps === 5 && o.altGps === 300 && o.especie === ESPECIE,
    'posición, precisión, altitud GPS y seta de la observación');
  comprobar(o.estado === 'sin_analizar' && o.hallazgo === 'no_mirado', 'estado «sin analizar» y hallazgo sin mirar: nada sale a la red');
  comprobar(!!o.modelo && o.modelo.idon >= 0 && o.modeloSector.length === 8 && o.arbolSector.length === 8, `lo que decía el modelo aquí: ${o.modelo?.idon}/100, sectores ${o.modeloSector.join('/')}`);
  comprobar(o.modeloSector.some((x) => typeof x === 'number'), 'al menos un sector con celdas del modelo');
  comprobar(o.altModelo === null || typeof o.altModelo === 'number', `altitud del modelo: ${o.altModelo === null ? 'sin dato' : Math.round(o.altModelo) + ' m'}`);
  const g = await p.evaluate(() => window.__setas.grabacion());
  comprobar(g && g.notas.some((n) => /^Observación: 8 fotos/.test(n.texto)) && o.rutaId === g.id, 'la observación queda como nota de la ruta que se graba (y enlazada por rutaId)');
  const txt = await p.locator('#dlg-explorar').innerText();
  comprobar(!PROHIBIDO.test(txt), 'la pantalla no dice «comestible»');
  // Hallazgo y sitio
  await p.locator('#ex-h-nada').click();
  await p.waitForFunction(() => /no encontraste nada/.test(document.querySelector('#ex-h-estado').textContent));
  obs = await observaciones(p);
  comprobar(obs[0].hallazgo === 'nada', '«Nada» se guarda en la observación');
  await p.locator('#ex-h-si').click();
  await p.locator('#ex-h-especie').selectOption(ESPECIE);
  await p.locator('#ex-h-ok').click();
  await p.waitForFunction(() => /encontraste algo/.test(document.querySelector('#ex-h-estado').textContent));
  obs = await observaciones(p);
  comprobar(obs[0].hallazgo === 'encontrada' && obs[0].especieHallada === ESPECIE, '«Sí» + seta se guarda como hallazgo');
  await p.locator('#ex-sitio').click();
  await p.waitForFunction(() => /Guardado en Mis sitios/.test(document.querySelector('#aviso')?.textContent ?? ''));
  await p.locator('#ex-sitio').click();
  await p.waitForFunction(() => /Ya estaba en Mis sitios/.test(document.querySelector('#aviso')?.textContent ?? ''));
  ok('«Guardar como sitio» lo añade a Mis sitios (y no lo duplica)');
  await p.locator('#ex-cerrar').click();
  await p.waitForFunction(() => !document.querySelector('#dlg-explorar[open]'));
  await p.locator('#cp-cerrar').click();
  await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
  await p.locator('.pestanas [data-p=p-sitios]').click();
  await p.waitForFunction(() => /Observación \d/.test(document.querySelector('#lista-sitios')?.textContent ?? ''), null, { timeout: 10000 });
  ok('el sitio «Observación …» aparece en Mis sitios');
  // La cámara se apaga al cerrar
  comprobar(await p.evaluate(() => !document.querySelector('#ex-camara video')), 'al cerrar, la cámara se apaga');
  await p.context().close();

  // ------------------------------------------------------------ 2. sin cámara en vivo: una foto por dirección
  const q = await pagina([sinCamara]);
  await abrirExplorar(q);
  e = await explorar(q);
  comprobar(e.camara === 'archivo' && e.manual, 'con getUserMedia roto, la cámara pasa a modo archivo');
  await q.waitForFunction(() => !document.querySelector('#ex-barrer').disabled, null, { timeout: 10000 });
  await q.locator('#ex-barrer').click();
  await q.waitForSelector('#ex-direcciones:not([hidden])');
  comprobar(await q.locator('#ex-direcciones .ex-dir').count() === 8 && /Foto hacia el norte/.test(await q.locator('#ex-direcciones .ex-dir').first().innerText()),
    'aparece un botón «Foto hacia …» por cada dirección, sin disparo automático');
  for (const r of [90, 0]) {
    const [fc] = await Promise.all([q.waitForEvent('filechooser'), q.locator(`#ex-direcciones .ex-dir[data-rumbo="${r}"]`).click()]);
    await fc.setFiles({ name: 'foto.jpg', mimeType: 'image/jpeg', buffer: FOTO });
    await q.waitForFunction((n) => window.__setas.explorar()?.hechas.length === n, r === 90 ? 1 : 2);
  }
  ok('elegir una foto por dirección la guarda (en el orden que quieras)');
  await q.locator('#ex-terminar').click();
  await q.waitForSelector('#ex-fin:not([hidden])', { timeout: 20000 });
  obs = await observaciones(q);
  comprobar(obs.length === 1 && obs[0].direcciones.length === 2 && obs[0].direcciones.map((d) => d.rumbo).join() === '0,90' && obs[0].direcciones.every((d) => d.tipo === 'image/jpeg' && d.bytes <= 400 * 1024 && d.exif === false && d.precBrujula === null),
    '«Terminar» con 2 fotos: observación con direcciones 0° y 90°, re-codificadas, sin EXIF y sin precisión de brújula inventada');
  await q.screenshot({ path: join(CAPTURAS, 'explorar-archivo.png') });
  await q.context().close();

  // ------------------------------------------------------------ 3. brújula poco fiable, diagnóstico y pausa por inactividad
  const r = await pagina([() => { window.__setasInactividadMs = 1600; }]);
  await abrirExplorar(r);
  await r.evaluate(() => { window.__acc = 40; window.__H = 10; });
  await r.waitForFunction(() => /Brújula poco fiable/.test(window.__setas.explorar()?.aviso ?? ''), null, { timeout: 5000 });
  ok('con webkitCompassAccuracy > 25 sale «Brújula poco fiable: aléjate del coche y haz un 8…»');
  await r.evaluate(() => { window.__acc = 5; });
  await r.waitForFunction(() => window.__setas.explorar()?.aviso === null);
  ok('con la brújula buena el aviso desaparece');
  for (let i = 0; i < 4; i++) await r.locator('#ex-rumbo').click({ delay: 10 });
  await r.waitForSelector('#ex-diag:not([hidden])');
  const diag = await r.locator('#ex-diag').innerText();
  comprobar(/webkitCompassAccuracy: 5/.test(diag) && /cámara: vivo \d+×\d+/.test(diag) && /pantalla: 0°/.test(diag), `4 toques en el rumbo → diagnóstico (${diag.split('\n')[2]})`);
  await r.waitForFunction(() => window.__setas.explorar()?.pausado === true, null, { timeout: 8000 });
  comprobar(await r.locator('#ex-pausa').isVisible() && !(await r.evaluate(() => document.querySelector('#ex-camara video'))), 'sin toques, se pausa: cámara parada y «Pausado para ahorrar batería»');
  await r.locator('#ex-reanudar').click();
  await r.waitForFunction(() => { const x = window.__setas.explorar(); return x && !x.pausado && x.camara === 'vivo'; }, null, { timeout: 8000 });
  ok('«Reanudar» vuelve a abrir la cámara en vivo');
  await r.context().close();

  comprobar(!errores.length, `sin errores de página${errores.length ? `: ${errores.join(' | ')}` : ''}`);
  console.log(`Capturas en ${CAPTURAS}`);
} catch (err) {
  console.error(err.message, `(capturas en ${CAPTURAS})`, errores);
  process.exitCode = 1;
} finally {
  await nav.close();
}
