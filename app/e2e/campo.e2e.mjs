// e2e «en el campo» (2026-10-18): mapa del Top de Hoy, modo «Navegar aquí» (brújula, sendero, llegada y salida del
// sendero, mapa hacia donde miras, Google Maps), «Grabar ruta» (notas, recarga de la página, GPX), enlaces con puntos
// (?ir=… y #pts=…) e importación de KML. El GPS y la brújula se simulan: navigator.geolocation falso (con altitud,
// rumbo y velocidad) y DeviceOrientationEvent despachados a mano (Android: deviceorientationabsolute; iOS:
// webkitCompassHeading con requestPermission).
// Requiere `npm run build` y el servidor: php -S 127.0.0.1:8765 -t dist servidor.php (o URL_APP=…).
// Las capturas van a $CAPTURAS_CAMPO o a un directorio temporal: no regenera e2e/capturas.
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { chromium, devices } = createRequire(import.meta.url)('playwright');

const BASE = process.env.URL_APP ?? 'http://127.0.0.1:8765/';
const Q = '?e2e=1&hoy=2026-10-14';
const CAPTURAS = process.env.CAPTURAS_CAMPO ?? mkdtempSync(join(tmpdir(), 'campo-e2e-'));
const PROHIBIDO = /comestib|se puede comer/i;
const YO = { lat: 36.589, lon: -5.244, alt: 300 };
let paso = 0;
const ok = (m) => console.log(`✔ ${++paso}. ${m}`);
const comprobar = (c, m) => { if (!c) throw new Error(`Falla: ${m}`); ok(m); };
const M = 1 / 111195;
const norm = (g) => ((g % 360) + 360) % 360;
const difAng = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

/** GPS falso: window.__geo.emitir({lat, lon, alt, acc, heading, speed}); la última posición sobrevive a una recarga. */
function geoFalso(inicial) {
  const oyentes = new Map(); let n = 0;
  const leer = () => { try { return JSON.parse(sessionStorage.getItem('__geo') || 'null'); } catch { return null; } };
  const mk = (p) => ({ coords: { latitude: p.lat, longitude: p.lon, accuracy: p.acc ?? 5, altitude: p.alt ?? null,
    altitudeAccuracy: p.alt != null ? 6 : null, heading: p.heading ?? null, speed: p.speed ?? null }, timestamp: Date.now() });
  window.__geo = {
    pos: leer() ?? inicial,
    emitir(p) { this.pos = p; sessionStorage.setItem('__geo', JSON.stringify(p)); for (const f of oyentes.values()) f(mk(p)); },
  };
  const geo = {
    watchPosition(okf) { const i = ++n; oyentes.set(i, okf); setTimeout(() => window.__geo.pos && okf(mk(window.__geo.pos)), 10); return i; },
    clearWatch(i) { oyentes.delete(i); },
    getCurrentPosition(okf) { setTimeout(() => window.__geo.pos && okf(mk(window.__geo.pos)), 10); },
  };
  Object.defineProperty(Navigator.prototype, 'geolocation', { get: () => geo, configurable: true });
  window.open = (u) => { window.__abierto = String(u); return null; };
}

const nav = await chromium.launch();
const ctx = await nav.newContext({ ...devices['Pixel 7'], locale: 'es-ES', timezoneId: 'Europe/Madrid', acceptDownloads: true });
await ctx.addInitScript(geoFalso, YO);
await ctx.route('**/api.open-meteo.com/**', (r) => r.fulfill({ status: 503, body: '' }));
await ctx.route('https://www.ign.es/**', (r) => r.fulfill({ status: 404, body: '' }));
const p = await ctx.newPage();
const errores = [];
p.on('pageerror', (e) => errores.push(String(e)));
p.on('dialog', (d) => d.accept());
const listo = async (pg = p) => {
  const b = pg.getByRole('button', { name: 'Entendido' });
  if (await b.isVisible({ timeout: 8000 }).catch(() => false)) await b.click();
  await pg.waitForFunction(() => document.body.dataset.mapa === 'listo', null, { timeout: 60000 });
};
const emitir = (pos, pg = p) => pg.evaluate((x) => window.__geo.emitir(x), pos);
const ir = (pg = p) => pg.evaluate(() => window.__setas.ir());
const orientar = (pg, tipo, datos) => pg.evaluate(([t, d]) => {
  const e = new DeviceOrientationEvent(t, { alpha: d.alpha ?? null, beta: 0, gamma: 0, absolute: !!d.absolute });
  if (d.webkit != null) Object.defineProperty(e, 'webkitCompassHeading', { value: d.webkit });
  window.dispatchEvent(e);
}, [tipo, datos]);

try {
  await p.goto(BASE + Q);
  await listo();

  // ------------------------------------------------------------ 1. mapa del Top de Hoy
  await p.locator('.pestanas [data-p=p-hoy]').click();
  await p.waitForSelector('#top-especie .top-fila');
  const nFilas = await p.locator('#top-especie .top-fila').count();
  await p.locator('#hoy-ver-mapa').click();
  await p.waitForFunction(() => document.body.dataset.minimapa === 'listo', null, { timeout: 30000 });
  await p.waitForFunction((n) => document.querySelector('#hoy-mapa')?.dataset.n === String(n), nFilas);
  comprobar(await p.locator('#hoy-mapa .minimapa canvas').isVisible(), `«Ver en el mapa» abre el mini-mapa con los ${nFilas} sitios del listado`);
  await p.waitForFunction(() => { const m = window.__setas.miniMapa(); return m && m.loaded() && m.queryRenderedFeatures({ layers: ['top-hoy'] }).length > 0; }, null, { timeout: 30000 });
  await p.evaluate(() => document.querySelector('#hm-hueco').scrollIntoView({ block: 'center' }));
  await p.waitForTimeout(300);
  const punto = await p.evaluate(() => {
    const m = window.__setas.miniMapa();
    const f = m.queryRenderedFeatures({ layers: ['top-hoy'] }).find((x) => x.properties.pos === 1);
    const px = m.project(f.geometry.coordinates); const r = m.getCanvas().getBoundingClientRect();
    return { x: r.left + px.x, y: r.top + px.y, estado: f.properties.estado, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] };
  });
  const estadoFila1 = await p.locator('#top-especie .top-fila').first().getAttribute('data-estado');
  comprobar(punto.estado === estadoFila1, `el marcador 1 lleva el color del semáforo de la fila 1 (${punto.estado})`);
  await p.mouse.click(punto.x, punto.y);
  await p.waitForSelector('#hm-tarjeta:not([hidden])');
  const tarjeta = await p.locator('#hm-tarjeta').innerText();
  const razon1 = (await p.locator('#top-especie .top-fila').first().locator('.tf-razon').textContent()).trim();
  comprobar(await p.locator('#hm-tarjeta').getAttribute('data-pos') === '1' && tarjeta.includes('Puntuación del día') && tarjeta.includes('Acceso:')
    && tarjeta.includes(razon1) && await p.locator('#hm-tarjeta .tf-titularidad').count() === 1
    && await p.locator('#hm-tarjeta .miniatura-especie').count() >= 1,
    'tocar el marcador 1 abre su tarjeta: miniatura, puntuación, razón, acceso y titularidad');
  comprobar(!PROHIBIDO.test(tarjeta), 'la tarjeta no dice «comestible»');
  await p.locator('#hm-tarjeta .hm-google').click();
  const gUrl = await p.evaluate(() => window.__abierto);
  comprobar(/google\.com\/maps\/search\/\?api=1&query=36\.\d+%2C-?\d/.test(gUrl), `botón Google Maps → ${gUrl}`);
  // Orden: al cambiarlo, la numeración del mapa sigue al listado.
  await p.locator('#top-especie').locator('xpath=preceding-sibling::div[contains(@class,"orden-top")][1]').locator('[data-orden=distancia]').click();
  await p.waitForFunction(() => document.querySelector('#top-especie')?.dataset.orden === 'distancia');
  await p.evaluate(() => window.__setas.elegirEnMapaTop(1));
  const razonD = (await p.locator('#top-especie .top-fila').first().locator('.tf-razon').textContent()).trim();
  comprobar((await p.locator('#hm-tarjeta').innerText()).includes(razonD), 'con «Distancia» el sitio 1 del mapa es la fila 1 del nuevo orden');
  await p.screenshot({ path: join(CAPTURAS, 'hoy-mapa.png') });

  // ------------------------------------------------------------ 2. «Navegar aquí»
  await p.locator('#hm-tarjeta .hm-navegar').click();
  await p.waitForSelector('#dlg-ir[open]');
  await p.waitForFunction(() => { const e = window.__setas.ir(); return e && e.pos && e.sendero !== undefined && document.querySelector('#dlg-ir').dataset.sendero !== 'buscando'; }, null, { timeout: 30000 });
  let e = await ir();
  comprobar(e.distancia !== '—' && e.nav && e.nav.medida === 'recta' && !e.nav.unido,
    `navegación abierta: ${e.distancia} en línea recta, sendero ${e.sendero ? `desde ${e.sendero.via} (${e.sendero.n} vértices)` : 'no disponible'}`);
  comprobar(await p.evaluate(() => !!window.__setas.grabacion()), 'al navegar se graba el track a la vez');
  comprobar(/m por (subir|bajar)|misma altura|PENDIENTE/.test(e.desnivel), `desnivel: «${e.desnivel}»`);
  // Brújula Android (deviceorientationabsolute, alpha 270 → mira al este).
  await orientar(p, 'deviceorientationabsolute', { alpha: 270, absolute: true });
  e = await ir();
  comprobar(e.fuente === 'brujula' && Math.abs(e.orientacion - 90) < 0.5 && difAng(e.giro, norm(e.nav.rumbo - 90)) < 1,
    `brújula: mira al este (90°), destino a ${e.nav.rumbo.toFixed(0)}° → flecha girada ${e.giro}° [${e.fuente} ${e.orientacion}]`);
  await p.locator('#ir-girar').check();
  await orientar(p, 'deviceorientationabsolute', { alpha: 270, absolute: true });
  await p.waitForTimeout(150);
  await orientar(p, 'deviceorientationabsolute', { alpha: 270, absolute: true });
  e = await ir();
  comprobar(Math.abs(norm(e.rumboMapa) - 90) < 2 && Math.abs(e.centroMapa[1] - YO.lat) < 1e-3,
    `mapa hacia donde miras (rumbo del mapa ${e.rumboMapa.toFixed(0)}°) y siguiendo tu posición`);
  await p.locator('#ir-google').click();
  const nUrl = await p.evaluate(() => window.__abierto);
  comprobar(/maps\/dir\/\?api=1&destination=36\.\d+%2C-?\d.*dir_action=navigate/.test(nUrl) && !/origin=/.test(nUrl), `Google Maps navega desde tu ubicación: ${nUrl}`);
  // Sendero: entrar en él y salirse más de 50 m.
  if (e.sendero) {
    const L = e.sendero.linea;
    const v = L[Math.floor(L.length / 2)];
    await emitir({ lat: v[1], lon: v[0], alt: 400, acc: 5 });
    await p.waitForFunction(() => window.__setas.ir().nav?.unido);
    e = await ir();
    comprobar(e.nav.medida === 'sendero' && !e.nav.fuera, `en el sendero: quedan ${e.distancia} por el sendero; «${e.desnivel}»`);
    const k = Math.cos((v[1] * Math.PI) / 180);
    await emitir({ lat: v[1] + 80 * M, lon: v[0] + (80 * M) / k, alt: 400, acc: 5 });
    await p.waitForFunction(() => window.__setas.ir().avisos.includes('fuera'));
    e = await ir();
    comprobar(e.nav.fuera && /salido del sendero/.test(e.alerta), `aviso al salirse del sendero: «${e.alerta}»`);
  } else ok('sin sendero de la app para este sitio: se omite la prueba de salirse del sendero');
  await emitir({ lat: e.destino.lat - 15 * M, lon: e.destino.lon, alt: 500, acc: 5 });
  await p.waitForFunction(() => window.__setas.ir().avisos.includes('llegada'));
  e = await ir();
  comprobar(e.nav.llegado && /Has llegado/.test(e.alerta) && e.distancia === 'Has llegado', `aviso al llegar (< 30 m): «${e.alerta}»`);
  await p.waitForFunction(() => window.__setas.miniMapa().queryRenderedFeatures({ layers: ['ir-yo', 'ir-destino'] }).length >= 2, null, { timeout: 10000 });
  ok('el mapa de la navegación pinta tu posición y el destino');
  await p.screenshot({ path: join(CAPTURAS, 'navegar.png') });
  comprobar(!PROHIBIDO.test(await p.locator('#dlg-ir').innerText()), 'la vista de navegación no dice «comestible»');
  await p.locator('#ir-cerrar').click();
  await p.waitForSelector('#dlg-ruta-fin[open]');
  const fin = await p.locator('#dlg-ruta-fin').innerText();
  comprobar(/Distancia/.test(fin) && /Duración/.test(fin), 'al salir se termina la grabación y se guarda la ruta');
  await p.locator('#rf-cerrar').click();

  // ------------------------------------------------------------ 3. «Grabar ruta» con nota, recarga y GPX
  await emitir(YO);
  await p.locator('.pestanas [data-p=p-sitios]').click();
  await p.locator('#btn-grabar-ruta').click();
  await p.waitForSelector('#grabacion:not([hidden])');
  for (let i = 1; i <= 5; i++) { await emitir({ lat: YO.lat + i * 30 * M, lon: YO.lon, alt: YO.alt + i * 6, acc: 5 }); await p.waitForTimeout(60); }
  await p.waitForFunction(() => window.__setas.grabacion()?.puntos >= 5);
  await p.locator('#gr-nota').click();
  await p.waitForSelector('#dlg-nota-ruta[open]');
  await p.locator('#dlg-nota-ruta .chip[data-t="Aquí boletus"]').click();
  await p.locator('#dlg-nota-ruta input[name=estrellas][value="2"]').check({ force: true });
  await p.locator('#nr-guardar').click();
  let g = await p.evaluate(() => window.__setas.grabacion());
  comprobar(g.notas.length === 1 && g.notas[0].texto === 'Aquí boletus' && g.notas[0].estrellas === 2, `grabando: ${g.puntos} puntos, ${g.distancia_m} m, nota «Aquí boletus» ★★`);
  await p.waitForTimeout(3200);   // la grabación se escribe como mucho cada 3 s
  await emitir({ lat: YO.lat + 6 * 30 * M, lon: YO.lon, alt: YO.alt + 36, acc: 5 });
  await p.waitForTimeout(300);
  await p.reload();
  await listo();
  await p.waitForFunction(() => window.__setas.grabacion?.()?.seg === 1, null, { timeout: 15000 });
  g = await p.evaluate(() => window.__setas.grabacion());
  comprobar(g.puntos >= 6 && g.notas.length === 1, `tras recargar la página la grabación sigue (tramo nuevo, ${g.puntos} puntos y la nota)`);
  for (let i = 7; i <= 9; i++) { await emitir({ lat: YO.lat + i * 30 * M, lon: YO.lon, alt: YO.alt + i * 6, acc: 5 }); await p.waitForTimeout(60); }
  await p.waitForFunction((n) => window.__setas.grabacion().puntos >= n, g.puntos + 2);
  await p.locator('#gr-terminar').click();
  await p.waitForSelector('#dlg-ruta-fin[open]');
  const resumen = await p.locator('#rf-resumen').innerText();
  comprobar(/\+\d+ m/.test(resumen) && /Tramos/.test(resumen), `resumen al terminar: ${resumen.replace(/\s+/g, ' ')}`);
  const [descarga] = await Promise.all([p.waitForEvent('download'), p.locator('#rf-gpx').click()]);
  const gpx = readFileSync(await descarga.path(), 'utf8');
  comprobar(/^ruta-\d{4}-\d{2}-\d{2}-\d{4}\.gpx$/.test(descarga.suggestedFilename()) && (gpx.match(/<trkseg>/g) ?? []).length === 2
    && (gpx.match(/<trkpt /g) ?? []).length >= 8 && /<wpt [^>]+><ele>[\d.]+<\/ele><time>[^<]+<\/time><name>★★ Aquí boletus<\/name>/.test(gpx) && /<ele>\d/.test(gpx),
    `GPX ${descarga.suggestedFilename()}: 2 tramos, ${(gpx.match(/<trkpt /g) ?? []).length} puntos con altitud y hora, waypoint de la nota`);
  await p.locator('#rf-cerrar').click();
  await p.locator('.pestanas [data-p=p-mapa]').click();
  await p.locator('.pestanas [data-p=p-sitios]').click();
  await p.waitForSelector('#lista-rutas .ruta-grabada');
  comprobar(await p.locator('#lista-rutas .ruta-grabada').count() >= 2, 'Mis rutas lista las dos rutas grabadas');
  await p.locator('#lista-rutas .ruta-grabada').first().getByRole('button', { name: 'Ver en mapa' }).click();
  comprobar(await p.evaluate(() => !!window.__setas.mapa.getSource('ruta-grabada')), '«Ver en mapa» pinta la ruta en el mapa principal');

  // ------------------------------------------------------------ 4. importar KML → Mis sitios con «Navegar aquí»
  await p.locator('.pestanas [data-p=p-sitios]').click();
  const kml = '<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><name>KML de prueba</name>'
    + '<description>Bajo alcornoques</description><Point><coordinates>-5.2,36.6,0</coordinates></Point></Placemark></Document></kml>';
  await p.setInputFiles('#inp-importar', { name: 'prueba.kml', mimeType: 'application/vnd.google-earth.kml+xml', buffer: Buffer.from(kml) });
  await p.waitForSelector('#lista-sitios .sitio:has-text("KML de prueba")');
  comprobar(await p.locator('#lista-sitios .sitio:has-text("KML de prueba") .sitio-navegar').count() === 1, 'un KML importado entra en Mis sitios con «Navegar aquí»');

  // ------------------------------------------------------------ 5. enlaces con puntos
  await p.goto(BASE + Q + '&ir=36.60071,-4.81962&n=Arroyo%20aereus&nota=Prueba%20e2e');
  await listo();
  await p.waitForSelector('#dlg-enlace[open] .en-punto');
  comprobar(await p.locator('#dlg-enlace .en-punto').count() === 1 && (await p.locator('#dlg-enlace').innerText()).includes('Arroyo aereus')
    && !p.url().includes('ir=') && p.url().includes('e2e=1'), '?ir=…&n=…&nota=… abre el punto (y se quita del URL)');
  comprobar(await p.evaluate(() => !!window.__setas.mapa.getSource('enlace')), 'el punto del enlace se pinta en el mapa');
  await p.locator('#dlg-enlace .en-guardar').click();
  await p.waitForFunction(() => /Guardado/.test(document.querySelector('#dlg-enlace .en-estado')?.textContent ?? ''));
  await p.locator('#dlg-enlace .en-guardar').click();
  await p.waitForFunction(() => /Ya estaba/.test(document.querySelector('#dlg-enlace .en-estado')?.textContent ?? ''));
  ok('«Guardar en Mis sitios» guarda una vez (la segunda dice «Ya estaba»)');
  await p.locator('#dlg-enlace .en-navegar').click();
  await p.waitForSelector('#dlg-ir[open]');
  comprobar((await p.locator('#ir-titulo').textContent()) === 'Arroyo aereus', '«Navegar aquí» desde el enlace');
  await p.locator('#ir-cerrar').click();
  await p.waitForTimeout(300);
  if (await p.locator('#dlg-ruta-fin[open]').count()) await p.locator('#rf-cerrar').click();
  await p.evaluate(() => { location.hash = 'pts=36.6,-5.2,Uno;36.61,-5.21,Dos;36.62,-5.22,Tres'; });
  await p.waitForFunction(() => document.querySelectorAll('#dlg-enlace[open] .en-punto').length === 3);
  ok('#pts=… con tres puntos abre la lista de tres');
  await p.locator('#dlg-enlace form button').click();

  // ------------------------------------------------------------ 6. iOS: permiso de la brújula y webkitCompassHeading
  for (const respuesta of ['granted', 'denied']) {
    const q = await ctx.newPage();
    q.on('pageerror', (x) => errores.push(String(x)));
    await q.addInitScript((r) => { DeviceOrientationEvent.requestPermission = async () => r; }, respuesta);
    await q.goto(BASE + Q);
    await listo(q);
    await q.evaluate(() => window.__setas.abrirIr({ lat: 36.62, lon: -5.244, titulo: 'Norte' }));
    await q.waitForSelector('#dlg-ir[open]');
    await q.waitForFunction(() => window.__setas.ir()?.pos);
    comprobar(await q.locator('#ir-activar').isVisible(), `iOS (${respuesta}): botón «Activar brújula»`);
    await q.locator('#ir-activar').click();
    if (respuesta === 'granted') {
      for (let i = 0; i < 25; i++) await orientar(q, 'deviceorientation', { alpha: 10, webkit: 180 });
      const s = await ir(q);
      comprobar(s.fuente === 'brujula' && Math.abs(s.orientacion - 180) < 2 && difAng(s.giro, 180) < 3,
        `iOS: webkitCompassHeading 180° (miras al sur) y el sitio al norte → flecha a ${s.giro}°`);
    } else {
      await q.waitForTimeout(200);
      const s = await ir(q);
      comprobar(s.fuente === 'norte' && /Sin permiso/.test(await q.locator('#ir-fuente').textContent()) && difAng(s.giro, 0) < 1,
        'iOS sin permiso: la flecha va respecto al norte y se dice');
    }
    await q.close();
  }
  comprobar(!errores.length, `sin errores de página${errores.length ? `: ${errores.join(' | ')}` : ''}`);
  console.log(`Capturas en ${CAPTURAS}`);
} catch (err) {
  await p.screenshot({ path: join(CAPTURAS, 'error.png') }).catch(() => {});
  console.error(err.message, `(captura en ${CAPTURAS}/error.png)`, errores);
  process.exitCode = 1;
} finally {
  await nav.close();
}
