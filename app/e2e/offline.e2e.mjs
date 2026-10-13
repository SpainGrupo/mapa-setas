// e2e (Playwright, viewport móvil): carga → descarga de mapas → sin conexión → recarga →
// mapa base y capa de Amanita caesarea desde OPFS → crear un sitio → exportar GPX.
// Entre medias: «Volver a descargar» abortada a mitad (un .pmtiles cortado) → los mapas antiguos siguen.
// Fase 3: Open-Meteo interceptado con un fixture fijo (e2e/fixtures/open-meteo.json) → tocar el mapa → tarjeta →
// pestaña Zona con los estados esperados; y sin conexión, tras recargar, la Zona muestra la caché («actualizado hace»).
// Fase 4: Guía → buscar «cesar» → ficha de A. caesarea (aviso de comestible y caja de huevo) → comparativa con
// A. phalloides → su ficha dice MORTAL; sin conexión y tras recargar, la guía y sus fotos siguen cargando.
// La app solo expone window.__setas con ?e2e=1.
// Requiere `npm run build` y el servidor: php -S 127.0.0.1:8765 -t dist servidor.php
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium, devices } = createRequire(import.meta.url)('playwright');

const URL_APP = (process.env.URL_APP ?? 'http://127.0.0.1:8765/') + '?e2e=1';
const CAPTURAS = join(dirname(fileURLToPath(import.meta.url)), 'capturas');
mkdirSync(CAPTURAS, { recursive: true });
const PUNTO = { latitude: 36.589, longitude: -5.244 };   // máximo local de idoneidad de caesarea
const FIXTURE = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures/open-meteo.json'), 'utf8'));
const NOTA = 'Ñandú & <castaños> "junto" al \'arroyo\' ✓';

let paso = 0;
const ok = (m) => console.log(`✔ ${++paso}. ${m}`);
const comprobar = (c, m) => { if (!c) throw new Error(`Falla: ${m}`); ok(m); };

const nav = await chromium.launch();
const ctx = await nav.newContext({ ...devices['Pixel 7'], geolocation: PUNTO, permissions: ['geolocation'],
  acceptDownloads: true, locale: 'es-ES', timezoneId: 'Europe/Madrid' });

// Open-Meteo falso: 30 días pasados + 7 de previsión alrededor de hoy (Madrid), elevación = alt_media del punto.
const fechaMadrid = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(d);
const sumar = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
let puntosMeteo = null, consultasMeteo = 0;
await ctx.route('**/api.open-meteo.com/**', async (r) => {
  consultasMeteo++;
  puntosMeteo ??= await (await fetch(new URL('data/meteo_puntos.json', URL_APP))).json();
  const u = new URL(r.request().url());
  const lat = u.searchParams.get('latitude').split(',').map(Number), lon = u.searchParams.get('longitude').split(',').map(Number);
  const hoy = fechaMadrid(new Date());
  const rel = Array.from({ length: 37 }, (_, i) => i - 30);
  const una = (la, i) => ({ latitude: la, longitude: lon[i],
    elevation: puntosMeteo.find((p) => p.lat === la && p.lon === lon[i])?.alt_media ?? 0,
    daily: { time: rel.map((k) => sumar(hoy, k)), precipitation_sum: rel.map((k) => FIXTURE.lluvia[k] ?? 0),
      temperature_2m_max: rel.map(() => FIXTURE.tmax), temperature_2m_min: rel.map(() => FIXTURE.tmin) } });
  const cuerpo = lat.length === 1 ? una(lat[0], 0) : lat.map(una);
  await r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(cuerpo) });
});
const estadosZona = () => p.$$eval('#lista-semaforo .semaforo-fila', (bs) => Object.fromEntries(bs.map((b) => [b.dataset.especie, b.dataset.estado])));
const igual = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
const p = await ctx.newPage();
const errores = [];
p.on('pageerror', (e) => errores.push(e.message));
const captura = (n) => p.screenshot({ path: join(CAPTURAS, n) });
const mapaListo = () => p.waitForSelector('body[data-mapa=listo]', { state: 'attached', timeout: 30000 });
const reposo = () => p.evaluate(() => new Promise((r) => {
  const m = window.__setas.mapa; m.loaded() && m.areTilesLoaded() ? r() : m.once('idle', r);
}));

try {
  await p.goto(URL_APP);
  await p.getByRole('button', { name: 'Entendido' }).click();
  await mapaListo();
  await p.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 30000 });
  ok('carga en línea con el service worker activo');
  await reposo();
  await captura('01-inicio.png');

  await p.getByRole('button', { name: /Ajustes/ }).click();
  const btn = p.locator('#btn-descargar');
  const texto = await btn.textContent();
  comprobar(/Descargar mapas para uso sin cobertura \(\d+ MB\)/.test(texto), `botón de descarga: «${texto}»`);
  const recarga = p.waitForEvent('load', { timeout: 600000 });
  await btn.click();
  await recarga;
  await mapaListo();
  await p.waitForFunction(() => /Descargado el/.test(document.querySelector('#estado-descarga').textContent),
    null, { timeout: 30000 });
  comprobar(/Mapas actualizados/.test(await p.locator('#aviso').textContent()), 'tras la descarga la app recarga y avisa «Mapas actualizados»');
  comprobar(new URL(p.url()).searchParams.get('e2e') === '1', 'la recarga conserva ?e2e=1');
  await p.getByRole('button', { name: /Ajustes/ }).click();
  comprobar(true, `descarga a OPFS: ${await p.locator('#estado-descarga').textContent()}`);
  await captura('02-ajustes-descargado.png');

  // Re-descarga cortada: el primer .pmtiles pasa y el segundo se aborta en todos los reintentos.
  const estadoAntes = await p.evaluate(() => localStorage.getItem('setas:mapas-descargados'));
  let primero = null, victima = null, abortadas = 0;
  await ctx.route('**/*.pmtiles', (r) => {
    const req = r.request();
    if (req.headers()['range']) return r.continue();
    const n = req.url().split('/').pop();
    primero ??= n;
    if (n !== primero) victima ??= n;
    if (n === victima) { abortadas++; return r.abort(); }
    return r.continue();
  });
  const btn2 = p.locator('#btn-descargar');
  comprobar(/Volver a descargar|Actualizar mapas/.test(await btn2.textContent()), `botón de re-descarga: «${await btn2.textContent()}»`);
  await btn2.click();
  await p.waitForFunction(() => /Error en la descarga/.test(document.querySelector('#aviso').textContent), null, { timeout: 600000 });
  await ctx.unroute('**/*.pmtiles');
  const tras = await p.evaluate(async () => {
    const raiz = await navigator.storage.getDirectory();
    const dirs = [];
    for await (const k of raiz.keys()) dirs.push(k);
    return { estado: localStorage.getItem('setas:mapas-descargados'), dirs, aviso: document.querySelector('#aviso').textContent };
  });
  comprobar(abortadas === 3, `${victima} abortado en sus 3 intentos (${abortadas})`);
  comprobar(tras.estado === estadoAntes && /Descargado el/.test(await p.locator('#estado-descarga').textContent()),
    'el estado de la descarga anterior sigue intacto');
  comprobar(!tras.dirs.includes('mapas-nuevo') && tras.dirs.includes('mapas'), `staging borrado, mapas antiguos en su sitio (${tras.dirs.join(', ')})`);
  await captura('02b-redescarga-fallida.png');

  // Re-descarga completa: intercambio sobre los archivos existentes y recarga.
  const recarga2 = p.waitForEvent('load', { timeout: 600000 });
  await p.locator('#btn-descargar').click();
  await recarga2;
  await mapaListo();
  const tras2 = await p.evaluate(() => ({ estado: localStorage.getItem('setas:mapas-descargados'), aviso: document.querySelector('#aviso').textContent }));
  comprobar(/Mapas actualizados/.test(tras2.aviso) && tras2.estado && tras2.estado !== estadoAntes
    && JSON.parse(tras2.estado).archivos[victima] > 0, 're-descarga completa: archivos sustituidos y estado nuevo');

  // Zona con el fixture de Open-Meteo: tocar el mapa → tarjeta → pestaña Zona.
  await p.waitForSelector('body[data-meteo]', { state: 'attached', timeout: 30000 });
  comprobar(consultasMeteo >= 1 && await p.evaluate(() => Object.keys(window.__setas.meteo().datos?.puntos ?? {}).length) > 40,
    `Open-Meteo (fixture) consultado: ${consultasMeteo} petición(es)`);
  await p.getByRole('button', { name: /Mapa/ }).click();
  await p.evaluate(({ latitude, longitude }) => window.__setas.mapa.jumpTo({ center: [longitude, latitude], zoom: 10 }), PUNTO);
  await reposo();
  const caja = await p.locator('#mapa canvas').boundingBox();
  await p.mouse.click(caja.x + caja.width / 2, caja.y + caja.height / 2);
  await p.locator('#tarjeta-zona').waitFor();
  const tarjeta = await p.locator('#tarjeta-zona').textContent();
  comprobar(/Boletus aereus: Buen momento/.test(tarjeta) && /ventana abierta/.test(tarjeta), `tarjeta al tocar el mapa: «${tarjeta.trim().replace(/\s+/g, ' ')}»`);
  await p.locator('[data-capa=semaforo]').evaluate((c) => { c.checked = true; c.dispatchEvent(new Event('change')); });
  await reposo();
  await captura('07-mapa-semaforo.png');
  await p.locator('#tz-ver').click();
  await p.locator('#lista-semaforo .semaforo-fila').first().waitFor();
  const est1 = await estadosZona();
  comprobar(igual(est1, FIXTURE.esperado), `Zona con el fixture: ${JSON.stringify(est1)}`);
  comprobar(/temperatura justa: máximas altas/.test(await p.locator('[data-especie=boletus_pinophilus] .mot').textContent())
    && /ventana pasada/.test(await p.locator('[data-especie=amanita_caesarea] .mot').textContent()), 'los motivos explican el amarillo y el rojo');
  comprobar(await p.locator('#grafico svg path[fill="#2a78d6"]').count() === Object.keys(FIXTURE.lluvia).length
    && /hoy/.test(await p.locator('#grafico-dato').textContent()), 'gráfico con la lluvia del fixture y el dato de hoy');
  comprobar(/Orientativo: reglas de aficionado, no ciencia exacta\./.test(await p.locator('#p-zona').textContent()), 'texto fijo «Orientativo…»');
  await captura('08-zona-fixture.png');
  await p.locator('#zona-grafico').scrollIntoViewIfNeeded();
  await captura('09-zona-grafico.png');

  // Fase 4: Guía de especies.
  await p.waitForSelector('body[data-guia-fotos=completas]', { state: 'attached', timeout: 180000 });
  const enCache = await p.evaluate(async () => (await (await caches.open('guia-fotos')).keys()).length);
  comprobar(enCache === 78, `fotos de la guía guardadas en la caché «guia-fotos» (${enCache})`);
  const tabGuia = p.locator('.pestanas button[data-p=p-guia]');
  await tabGuia.click();
  await p.locator('.tarjeta-guia').first().waitFor();
  const grupos = await p.$$eval('.grupo-guia h2', (hs) => hs.map((h) => h.textContent));
  comprobar(await p.locator('.tarjeta-guia').count() === 26 && grupos.length === 4, `Guía: 26 especies en 4 grupos (${grupos.join(', ')})`);
  const textosInsignias = await p.$$eval('.insignia', (xs) => [...new Set(xs.map((x) => x.textContent))]);
  comprobar(!textosInsignias.some((t) => /comestible/i.test(t)) && textosInsignias.includes('☠ MORTAL'),
    `ninguna insignia dice «comestible» (${textosInsignias.join(', ')})`);
  await captura('guia-lista.png');
  await p.locator('#guia-buscar').fill('cesar');
  const encontradas = await p.$$eval('.tarjeta-guia', (bs) => bs.map((b) => b.dataset.id));
  comprobar(encontradas.includes('amanita_caesarea'), `buscar «cesar» (sin tilde) encuentra la oronja: ${encontradas.join(', ')}`);
  await captura('guia-busqueda.png');
  await p.locator('.tarjeta-guia[data-id=amanita_caesarea]').click();
  await p.locator('#guia-ficha[data-id=amanita_caesarea]').waitFor();
  const banner = p.locator('#guia-ficha .banner-comestible');
  comprobar(await banner.isVisible() && (await banner.textContent()) === 'Considerada comestible por la bibliografía. No la consumas sin la confirmación de un experto.',
    'ficha de A. caesarea con el aviso fijo de comestible');
  comprobar(await p.locator('#guia-ficha .caja-huevo').isVisible() && /huevo/i.test(await p.locator('#guia-ficha .caja-huevo').textContent()),
    'caja «En fase de huevo» visible');
  comprobar(await p.locator('#guia-ficha .checklist li').count() >= 3, 'rasgos clave como lista de comprobación');
  await captura('guia-ficha-caesarea.png');
  const comp = p.locator('#guia-ficha .comparar[data-id=amanita_phalloides]');
  await comp.scrollIntoViewIfNeeded();
  comprobar(await banner.isVisible(), 'el aviso de comestible sigue visible al bajar por la ficha');
  comprobar(/MORTAL/.test(await comp.locator('.insignia').last().textContent()), 'la comparativa marca A. phalloides como MORTAL');
  await captura('guia-no-confundir.png');
  await comp.click();
  await p.locator('#guia-ficha[data-id=amanita_phalloides]').waitFor();
  const peligro = p.locator('#guia-ficha .caja-peligro.mortal');
  comprobar(await peligro.isVisible() && /MORTAL/.test(await peligro.textContent()) && await p.locator('#guia-ficha .banner-comestible').count() === 0,
    'ficha de A. phalloides: caja MORTAL arriba y sin aviso de comestible');
  await captura('guia-ficha-phalloides.png');
  await p.goBack();
  await p.locator('#guia-ficha[data-id=amanita_caesarea]').waitFor();
  ok('«atrás» vuelve a la ficha de A. caesarea');

  await ctx.setOffline(true);
  await p.reload();
  await mapaListo();
  ok('recarga sin conexión: el app shell sale del service worker');
  await tabGuia.click();
  await p.locator('.pestanas button[data-p=p-guia].activa').waitFor();
  if (await p.locator('#guia-ficha').isVisible()) await p.locator('.btn-volver').click();
  await p.locator('.tarjeta-guia').first().waitFor();
  comprobar(await p.locator('.tarjeta-guia').count() === 26, 'sin conexión la guía carga (precache)');
  await p.locator('.tarjeta-guia[data-id=amanita_phalloides]').click();
  await p.locator('#guia-ficha[data-id=amanita_phalloides]').waitFor();
  const foto = p.locator('#guia-ficha .carrusel-guia img').first();
  await foto.evaluate((i) => i.decode().catch(() => {}));
  const dims = await foto.evaluate((i) => ({ ok: i.complete, w: i.naturalWidth, src: i.getAttribute('src') }));
  comprobar(dims.ok && dims.w > 0, `sin conexión la foto sale de la caché (${dims.src}, ${dims.w} px de ancho)`);
  await captura('guia-offline.png');
  const consultasAntes = consultasMeteo;
  await p.getByRole('button', { name: /Zona/ }).click();
  await p.locator('#lista-semaforo .semaforo-fila').first().waitFor();
  const txtMeteo = await p.locator('#estado-meteo').textContent();
  comprobar(/Sin conexión: último dato guardado, actualizado hace/.test(txtMeteo), `Zona sin conexión: «${txtMeteo}»`);
  comprobar(igual(await estadosZona(), FIXTURE.esperado) && consultasMeteo === consultasAntes
    && await p.evaluate(() => window.__setas.meteo().origen) === 'cache', 'sin conexión la Zona sale de la caché de IndexedDB');
  await captura('10-zona-offline.png');
  await p.getByRole('button', { name: /Mapa/ }).click();
  await p.locator('[data-capa=semaforo]').evaluate((c) => { c.checked = true; c.dispatchEvent(new Event('change')); });
  await reposo();
  const mz = await p.evaluate(() => window.__setas.origenes()['meteo_zonas.pmtiles']);
  comprobar(mz?.origen === 'opfs' && mz.http === 0, `capa Semáforo (Voronoi) desde OPFS sin red (${mz?.opfs} lecturas)`);
  await p.getByRole('button', { name: /Mapa/ }).click();
  await p.selectOption('#sel-especie', 'amanita_caesarea');
  await p.evaluate(({ latitude, longitude }) => window.__setas.mapa.jumpTo({ center: [longitude, latitude], zoom: 12 }), PUNTO);
  await reposo();
  const est = await p.evaluate(() => {
    const m = window.__setas.mapa;
    return { o: window.__setas.origenes(), base: m.queryRenderedFeatures().filter((f) => f.source === 'protomaps').length,
      idon: m.isSourceLoaded('idoneidad') };
  });
  const base = est.o['base.pmtiles'], cae = est.o['idoneidad_amanita_caesarea_0.pmtiles'];
  comprobar(base?.origen === 'opfs' && base.http === 0 && est.base > 0,
    `mapa base desde OPFS sin red (${est.base} entidades visibles, ${base?.opfs} lecturas)`);
  comprobar(cae?.origen === 'opfs' && cae.opfs >= 3 && est.idon,
    `capa de Amanita caesarea desde OPFS (${cae?.opfs} lecturas)`);
  await captura('03-offline-caesarea.png');
  const verFicha = p.locator('#btn-ver-ficha');
  await verFicha.waitFor();
  await captura('guia-mapa-boton.png');
  await verFicha.click();
  await p.locator('#guia-ficha[data-id=amanita_caesarea]').waitFor();
  comprobar(await p.locator('#p-guia').isVisible(), '«Ver ficha» en el panel del mapa abre la ficha de la especie elegida');
  await p.getByRole('button', { name: /Mapa/ }).click();

  await p.getByRole('button', { name: 'Guardar sitio aquí' }).click();
  await p.locator('#dlg-sitio[open]').waitFor();
  await p.locator('.estrellas span', { hasText: /^★★★$/ }).click();
  await p.locator('textarea[name=nota]').fill(NOTA);
  await captura('04-nuevo-sitio.png');
  await p.locator('#btn-sitio-guardar').click();
  await p.locator('#dlg-sitio').waitFor({ state: 'hidden' });
  ok('sitio creado con el GPS sin conexión');

  await p.getByRole('button', { name: /Mis sitios/ }).click();
  await p.locator('.sitio').first().waitFor();
  comprobar((await p.locator('.sitio .txt').first().textContent()) === NOTA, 'el sitio aparece en Mis sitios con su nota');
  await captura('05-mis-sitios.png');
  const [descarga] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Exportar GPX' }).click()]);
  const ruta = join(CAPTURAS, 'mis-sitios.gpx');
  await descarga.saveAs(ruta);
  const gpx = readFileSync(ruta, 'utf8');
  comprobar(gpx.includes('<wpt lat="36.589" lon="-5.244">') && gpx.includes('★★★ Amanita caesarea')
    && gpx.includes('&lt;castaños&gt;'), `GPX exportado (${descarga.suggestedFilename()})`);

  await p.getByRole('button', { name: /Ajustes/ }).click();
  await captura('06-ajustes-offline.png');
  comprobar(/Guía lista sin cobertura: textos y 78 fotos/.test(await p.locator('#estado-guia').textContent()), `Ajustes: «${await p.locator('#estado-guia').textContent()}»`);
  await p.locator('#creditos-fotos summary').click();
  await p.locator('#lista-creditos .credito-especie').first().waitFor();
  comprobar(await p.locator('#lista-creditos li').count() === 78, 'Créditos de fotos: 78 entradas con autor y licencia');
  await p.locator('#creditos-fotos').scrollIntoViewIfNeeded();
  await captura('guia-creditos.png');
  comprobar(errores.length === 0, `sin errores de página${errores.length ? ': ' + errores.join(' | ') : ''}`);
  console.log('e2e OK');
} catch (e) {
  await captura('error.png').catch(() => {});
  console.error(e.message, errores);
  process.exitCode = 1;
} finally {
  await nav.close();
}
