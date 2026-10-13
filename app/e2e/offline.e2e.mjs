// e2e (Playwright, viewport móvil): carga → descarga de mapas → sin conexión → recarga →
// mapa base y capa de Amanita caesarea desde OPFS → crear un sitio → exportar GPX.
// Entre medias: «Volver a descargar» abortada a mitad (un .pmtiles cortado) → los mapas antiguos siguen.
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
const NOTA = 'Ñandú & <castaños> "junto" al \'arroyo\' ✓';

let paso = 0;
const ok = (m) => console.log(`✔ ${++paso}. ${m}`);
const comprobar = (c, m) => { if (!c) throw new Error(`Falla: ${m}`); ok(m); };

const nav = await chromium.launch();
const ctx = await nav.newContext({ ...devices['Pixel 7'], geolocation: PUNTO, permissions: ['geolocation'],
  acceptDownloads: true, locale: 'es-ES' });
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

  await ctx.setOffline(true);
  await p.reload();
  await mapaListo();
  ok('recarga sin conexión: el app shell sale del service worker');
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
  comprobar(errores.length === 0, `sin errores de página${errores.length ? ': ' + errores.join(' | ') : ''}`);
  console.log('e2e OK');
} catch (e) {
  await captura('error.png').catch(() => {});
  console.error(e.message, errores);
  process.exitCode = 1;
} finally {
  await nav.close();
}
